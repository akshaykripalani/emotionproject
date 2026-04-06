import unittest
from types import SimpleNamespace

import numpy as np

import main


def make_result(scores: dict[str, float]):
    categories = [
      SimpleNamespace(category_name=category_name, score=score)
      for category_name, score in scores.items()
    ]
    return SimpleNamespace(face_blendshapes=[categories])


class EmotionMonitorTests(unittest.TestCase):
    def setUp(self):
        self.monitor = main.EmotionMonitor()

    def test_difficulty_for_emotion(self):
        self.assertEqual(main.difficulty_for_emotion("sad"), "easy")
        self.assertEqual(main.difficulty_for_emotion("frustrated"), "easy")
        self.assertEqual(main.difficulty_for_emotion("confused"), "easy")
        self.assertEqual(main.difficulty_for_emotion("happy"), "hard")
        self.assertEqual(main.difficulty_for_emotion("neutral"), "hard")
        self.assertEqual(main.difficulty_for_emotion("focused"), "hard")
        self.assertEqual(main.difficulty_for_emotion("surprised"), "hard")

    def test_websocket_interval_is_ten_hz(self):
        self.assertEqual(main.WEBSOCKET_INTERVAL_SECONDS, 0.1)

    def test_classify_happy_blendshapes(self):
        result = make_result(
            {
                "mouthSmileLeft": 0.5,
                "mouthSmileRight": 0.45,
                "cheekSquintLeft": 0.3,
                "cheekSquintRight": 0.25,
            }
        )
        self.assertEqual(self.monitor._classify_emotion(result), "happy")

    def test_classify_sad_blendshapes(self):
        result = make_result(
            {
                "mouthFrownLeft": 0.25,
                "mouthFrownRight": 0.22,
                "browInnerUp": 0.18,
                "mouthShrugUpper": 0.18,
                "mouthShrugLower": 0.16,
                "mouthSmileLeft": 0.04,
                "mouthSmileRight": 0.06,
            }
        )
        self.assertEqual(self.monitor._classify_emotion(result), "sad")

    def test_classify_frustrated_blendshapes(self):
        result = make_result(
            {
                "browDownLeft": 0.26,
                "browDownRight": 0.28,
                "eyeSquintLeft": 0.24,
                "eyeSquintRight": 0.21,
                "mouthPressLeft": 0.2,
                "mouthPressRight": 0.18,
                "mouthFrownLeft": 0.2,
                "mouthFrownRight": 0.21,
            }
        )
        self.assertEqual(self.monitor._classify_emotion(result), "frustrated")

    def test_classify_surprised_blendshapes(self):
        result = make_result(
            {
                "browOuterUpLeft": 0.22,
                "browOuterUpRight": 0.2,
                "browInnerUp": 0.25,
                "eyeWideLeft": 0.2,
                "eyeWideRight": 0.18,
                "jawOpen": 0.2,
                "mouthSmileLeft": 0.05,
                "mouthSmileRight": 0.04,
            }
        )
        self.assertEqual(self.monitor._classify_emotion(result), "surprised")

    def test_classify_confused_blendshapes(self):
        result = make_result(
            {
                "browDownLeft": 0.2,
                "browDownRight": 0.05,
                "eyeSquintLeft": 0.15,
                "eyeSquintRight": 0.12,
                "mouthPucker": 0.1,
                "mouthSmileLeft": 0.04,
                "mouthSmileRight": 0.03,
            }
        )
        self.assertEqual(self.monitor._classify_emotion(result), "confused")

    def test_classify_focused_blendshapes(self):
        result = make_result(
            {
                "browDownLeft": 0.1,
                "browDownRight": 0.12,
                "eyeSquintLeft": 0.09,
                "eyeSquintRight": 0.08,
                "mouthSmileLeft": 0.03,
                "mouthSmileRight": 0.04,
                "mouthFrownLeft": 0.03,
                "mouthFrownRight": 0.02,
                "jawOpen": 0.04,
            }
        )
        self.assertEqual(self.monitor._classify_emotion(result), "focused")

    def test_stable_emotion_prefers_most_recent_on_tie(self):
        self.monitor.history.extend(["sad", "happy", "sad", "happy"])
        self.assertEqual(self.monitor._stable_emotion(), "happy")

    def test_snapshot_reflects_updated_status(self):
        self.monitor._update_status(
            camera_status="live",
            face_detected=True,
            emotion="sad",
            error=None,
        )
        snapshot = self.monitor.snapshot()
        self.assertEqual(snapshot["camera_status"], "live")
        self.assertTrue(snapshot["face_detected"])
        self.assertEqual(snapshot["emotion"], "sad")
        self.assertEqual(snapshot["difficulty"], "easy")

    def test_render_preview_frame_draws_overlay(self):
        frame = np.zeros((120, 160, 3), dtype=np.uint8)
        preview = main.render_preview_frame(frame, "happy", "live")
        self.assertEqual(preview.shape, frame.shape)
        self.assertFalse(np.array_equal(frame, preview))


if __name__ == "__main__":
    unittest.main()
