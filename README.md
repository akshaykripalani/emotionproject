# Emotion-Aware Math Quiz

This is a basic college project: a multiple-choice math quiz that changes question difficulty based on the user's facial emotion.

## What the app does

- Shows simple math questions using `+`, `-`, `x`, and `/`
- Gives 4 answer options for each question
- Runs a Python backend that reads the webcam
- Uses a CPU-only MediaPipe face model to estimate emotion
- Sends the current emotion to the browser through a WebSocket
- Keeps the live emotion status updating on screen
- Changes the next question difficulty only after the user submits an answer

Difficulty rules:

- `happy` -> hard
- `neutral` -> hard
- `sad` -> easy
- `frustrated` -> easy, with encouraging text

## How the code is organized

### Backend

- [main.py](C:/Akshay/College/sem6/hci/emotionproject/main.py)
  - Starts the FastAPI server
  - Opens the webcam with OpenCV
  - Runs the MediaPipe face landmarker on CPU
  - Converts blendshape scores into `happy`, `sad`, `frustrated`, or `neutral`
  - Streams the current emotion to the frontend at `/ws/emotion`
  - Opens a small preview window showing the camera feed and detected emotion

### Frontend

- [index.html](C:/Akshay/College/sem6/hci/emotionproject/index.html)
  - Basic page structure for the quiz
  - Status boxes for emotion, difficulty, webcam, and score

- [styles.css](C:/Akshay/College/sem6/hci/emotionproject/styles.css)
  - Simple styling
  - Changes colors based on the current emotion

- [app.js](C:/Akshay/College/sem6/hci/emotionproject/app.js)
  - Connects to the backend WebSocket
  - Updates the live emotion status in the UI
  - Handles answer clicks, score updates, and moving to the next question
  - Applies the latest emotion to quiz difficulty only when an answer is submitted

- [quiz-logic.js](C:/Akshay/College/sem6/hci/emotionproject/quiz-logic.js)
  - Shared quiz logic used by the browser and tested separately
  - Generates easy and hard questions
  - Builds MCQ answer options
  - Maps emotion to difficulty

### Model and tests

- [face_landmarker.task](C:/Akshay/College/sem6/hci/emotionproject/face_landmarker.task)
  - MediaPipe model file used by the backend

- [tests/test_main.py](C:/Akshay/College/sem6/hci/emotionproject/tests/test_main.py)
  - Python unit tests for backend logic

- [tests/quiz-logic.test.js](C:/Akshay/College/sem6/hci/emotionproject/tests/quiz-logic.test.js)
  - JavaScript unit tests for question generation and helper functions

## How it works

1. Run the Python server.
2. The backend starts FastAPI and opens the webcam.
3. The backend analyzes camera frames and estimates the user's emotion.
4. The backend sends the latest emotion to the browser through the WebSocket.
5. The browser updates the live emotion display immediately.
6. When the user submits an answer, the app uses the latest detected emotion to decide whether the next question should be easy or hard.

Important behavior:

- The `Current emotion` box updates continuously.
- The question text does not change while the user is answering.
- The motivation text does not change while the user is answering.
- The next question is chosen after the answer is submitted.

## How to run

From this folder:

```powershell
uv run main.py
```

Then open:

- [http://127.0.0.1:8000](http://127.0.0.1:8000)

Do not open `index.html` directly. The app expects the Python backend to serve both the page and the WebSocket endpoint.

When the backend starts:

- the browser app is available on port `8000`
- a small webcam preview window opens
- the preview window shows the live camera feed and detected emotion

To close only the preview window, press `q` or `Esc` while that window is focused.

## How to test

Run Python tests:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests
```

Run JavaScript tests:

```powershell
node --test tests\quiz-logic.test.js
```

Optional syntax checks:

```powershell
node --check app.js
.\.venv\Scripts\python.exe -m py_compile main.py
```

## Notes

- The webcam is handled by Python, not by browser JavaScript.
- The emotion model is CPU-only.
- The emotion labels are simple heuristic categories for this project, not a production-grade emotion recognition system.
