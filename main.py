import asyncio
import os
import threading
import time
from collections import Counter, deque
from contextlib import asynccontextmanager
from pathlib import Path

os.environ.setdefault("CUDA_VISIBLE_DEVICES", "-1")

import cv2
import mediapipe as mp
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "face_landmarker.task"
PROCESSING_INTERVAL_SECONDS = 1 / 30
WEBSOCKET_INTERVAL_SECONDS = 0.1
EMOTION_HISTORY = 6
PREVIEW_WINDOW_NAME = "Emotion Monitor"


def preview_color_for_emotion(emotion: str) -> tuple[int, int, int]:
    return {
        "happy": (40, 40, 220),
        "sad": (60, 170, 60),
        "frustrated": (0, 140, 255),
        "neutral": (220, 120, 40),
    }.get(emotion, (220, 120, 40))


def render_preview_frame(frame, emotion: str, camera_status: str):
    preview = frame.copy()
    accent = preview_color_for_emotion(emotion)

    cv2.rectangle(preview, (12, 12), (355, 108), (18, 18, 18), -1)
    cv2.rectangle(preview, (12, 12), (355, 108), accent, 2)
    cv2.putText(
        preview,
        f"Emotion: {emotion}",
        (28, 52),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.8,
        accent,
        2,
        cv2.LINE_AA,
    )
    cv2.putText(
        preview,
        f"Status: {camera_status}",
        (28, 88),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (245, 245, 245),
        2,
        cv2.LINE_AA,
    )

    return preview


def difficulty_for_emotion(emotion: str) -> str:
    return "easy" if emotion in {"sad", "frustrated"} else "hard"


class EmotionMonitor:
    def __init__(self, camera_index: int = 0) -> None:
        self.camera_index = camera_index
        self.lock = threading.Lock()
        self.stop_event = threading.Event()
        self.thread: threading.Thread | None = None
        self.capture: cv2.VideoCapture | None = None
        self.preview_enabled = True
        self.history: deque[str] = deque(maxlen=EMOTION_HISTORY)
        self.current_emotion = "neutral"
        self.current_difficulty = "hard"
        self.camera_status = "starting"
        self.face_detected = False
        self.error: str | None = None
        self.last_face_seen = 0.0
        self.last_updated = time.time()

    def start(self) -> None:
        if self.thread and self.thread.is_alive():
            return

        self.stop_event.clear()
        self.preview_enabled = True
        self.thread = threading.Thread(target=self._run, name="emotion-monitor", daemon=True)
        self.thread.start()

    def stop(self) -> None:
        self.stop_event.set()

        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=3)

        if self.capture and self.capture.isOpened():
            self.capture.release()

        try:
            cv2.destroyWindow(PREVIEW_WINDOW_NAME)
        except cv2.error:
            pass

    def snapshot(self) -> dict[str, object]:
        with self.lock:
            return {
                "emotion": self.current_emotion,
                "difficulty": self.current_difficulty,
                "camera_status": self.camera_status,
                "face_detected": self.face_detected,
                "error": self.error,
                "timestamp": self.last_updated,
            }

    def _run(self) -> None:
        self._update_status(camera_status="starting", error=None)
        landmarker = None

        if not MODEL_PATH.exists():
            self._update_status(
                camera_status="camera_error",
                face_detected=False,
                emotion="neutral",
                error="The face landmarker model file is missing.",
            )
            return

        try:
            landmarker = self._create_landmarker()
            self.capture = self._open_camera()

            if not self.capture or not self.capture.isOpened():
                self._update_status(
                    camera_status="camera_unavailable",
                    face_detected=False,
                    emotion="neutral",
                    error="Python could not open the default webcam.",
                )
                return

            self.capture.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            self.capture.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            self.last_face_seen = time.time()

            while not self.stop_event.is_set():
                ok, frame = self.capture.read()

                if not ok:
                    self._update_status(
                        camera_status="camera_error",
                        face_detected=False,
                        error="The webcam is open but frames could not be read.",
                    )
                    time.sleep(0.5)
                    continue

                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
                result = landmarker.detect(mp_image)

                if result.face_landmarks:
                    raw_emotion = self._classify_emotion(result)
                    self.history.append(raw_emotion)
                    self.last_face_seen = time.time()
                    self._update_status(
                        camera_status="live",
                        face_detected=True,
                        emotion=self._stable_emotion(),
                        error=None,
                    )
                else:
                    self._handle_missing_face()

                if self.preview_enabled:
                    preview_frame = render_preview_frame(
                        frame, self.current_emotion, self.camera_status
                    )
                    cv2.imshow(PREVIEW_WINDOW_NAME, preview_frame)
                    pressed_key = cv2.waitKey(1) & 0xFF

                    if pressed_key in (27, ord("q"), ord("Q")):
                        self.preview_enabled = False
                        cv2.destroyWindow(PREVIEW_WINDOW_NAME)

                time.sleep(PROCESSING_INTERVAL_SECONDS)
        except Exception as exc:  # pragma: no cover - defensive runtime protection
            self._update_status(
                camera_status="camera_error",
                face_detected=False,
                emotion="neutral",
                error=str(exc),
            )
        finally:
            if self.capture and self.capture.isOpened():
                self.capture.release()

            if landmarker is not None:
                landmarker.close()

    def _create_landmarker(self):
        options = mp.tasks.vision.FaceLandmarkerOptions(
            base_options=mp.tasks.BaseOptions(
                model_asset_path=str(MODEL_PATH),
                delegate=mp.tasks.BaseOptions.Delegate.CPU,
            ),
            running_mode=mp.tasks.vision.RunningMode.IMAGE,
            num_faces=1,
            min_face_detection_confidence=0.5,
            min_face_presence_confidence=0.5,
            min_tracking_confidence=0.5,
            output_face_blendshapes=True,
            output_facial_transformation_matrixes=False,
        )
        return mp.tasks.vision.FaceLandmarker.create_from_options(options)

    def _open_camera(self) -> cv2.VideoCapture | None:
        capture = cv2.VideoCapture(self.camera_index, cv2.CAP_ANY)

        if capture.isOpened():
            return capture

        capture.release()
        return None

    def _handle_missing_face(self) -> None:
        elapsed = time.time() - self.last_face_seen

        if elapsed >= 2:
            self.history.append("neutral")
            self._update_status(
                camera_status="no_face",
                face_detected=False,
                emotion=self._stable_emotion(),
                error=None,
            )
            return

        self._update_status(camera_status="live", face_detected=False, error=None)

    def _stable_emotion(self) -> str:
        if not self.history:
            return "neutral"

        counts = Counter(self.history)
        highest_count = max(counts.values())
        candidates = {emotion for emotion, count in counts.items() if count == highest_count}

        for emotion in reversed(self.history):
            if emotion in candidates:
                return emotion

        return "neutral"

    def _update_status(
        self,
        *,
        camera_status: str | None = None,
        face_detected: bool | None = None,
        emotion: str | None = None,
        error: str | None = None,
    ) -> None:
        with self.lock:
            if camera_status is not None:
                self.camera_status = camera_status

            if face_detected is not None:
                self.face_detected = face_detected

            if emotion is not None:
                self.current_emotion = emotion
                self.current_difficulty = difficulty_for_emotion(emotion)

            self.error = error
            self.last_updated = time.time()

    def _classify_emotion(self, result) -> str:
        if not result.face_blendshapes:
            return "neutral"

        blendshape_scores = {
            item.category_name: float(item.score or 0.0) for item in result.face_blendshapes[0]
        }

        smile = self._average(blendshape_scores, "mouthSmileLeft", "mouthSmileRight")
        frown = self._average(blendshape_scores, "mouthFrownLeft", "mouthFrownRight")
        brow_down = self._average(blendshape_scores, "browDownLeft", "browDownRight")
        brow_inner_up = blendshape_scores.get("browInnerUp", 0.0)
        eye_squint = self._average(blendshape_scores, "eyeSquintLeft", "eyeSquintRight")
        cheek_squint = self._average(blendshape_scores, "cheekSquintLeft", "cheekSquintRight")
        mouth_press = self._average(blendshape_scores, "mouthPressLeft", "mouthPressRight")
        jaw_open = blendshape_scores.get("jawOpen", 0.0)
        mouth_shrug = self._average(
            blendshape_scores, "mouthShrugUpper", "mouthShrugLower"
        )

        if smile >= 0.35 or (smile >= 0.25 and cheek_squint >= 0.2):
            return "happy"

        if brow_down >= 0.2 and (eye_squint >= 0.18 or mouth_press >= 0.16 or frown >= 0.2):
            return "frustrated"

        if frown >= 0.18 and smile < 0.22 and (brow_inner_up >= 0.1 or mouth_shrug >= 0.15):
            return "sad"

        if jaw_open >= 0.32 and smile < 0.15 and frown < 0.12:
            return "frustrated"

        return "neutral"

    @staticmethod
    def _average(scores: dict[str, float], first: str, second: str) -> float:
        return (scores.get(first, 0.0) + scores.get(second, 0.0)) / 2


monitor = EmotionMonitor()


@asynccontextmanager
async def lifespan(_: FastAPI):
    monitor.start()
    yield
    monitor.stop()


app = FastAPI(title="Emotion Math Quiz", lifespan=lifespan)


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(BASE_DIR / "index.html")


@app.get("/app.js")
async def app_script() -> FileResponse:
    return FileResponse(BASE_DIR / "app.js", media_type="application/javascript")


@app.get("/quiz-logic.js")
async def quiz_logic_script() -> FileResponse:
    return FileResponse(BASE_DIR / "quiz-logic.js", media_type="application/javascript")


@app.get("/styles.css")
async def stylesheet() -> FileResponse:
    return FileResponse(BASE_DIR / "styles.css", media_type="text/css")


@app.get("/api/emotion")
async def emotion_status() -> JSONResponse:
    return JSONResponse(monitor.snapshot())


@app.websocket("/ws/emotion")
async def emotion_socket(websocket: WebSocket) -> None:
    await websocket.accept()

    try:
        while True:
            await websocket.send_json(monitor.snapshot())
            await asyncio.sleep(WEBSOCKET_INTERVAL_SECONDS)
    except WebSocketDisconnect:
        return


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=False)
