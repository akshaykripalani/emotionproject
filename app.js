const FRUSTRATION_MESSAGES = [
  "Take a breath. The next one will be easier.",
  "You are still doing fine. Focus on one step at a time.",
  "Keep going. A simpler question is coming next.",
];

const {
  capitalize,
  difficultyForEmotion,
  formatCameraStatus,
  generateQuestion,
} = window.quizLogic;

const elements = {
  appCard: document.getElementById("appCard"),
  emotionBox: document.getElementById("emotionBox"),
  difficultyBox: document.getElementById("difficultyBox"),
  cameraBox: document.getElementById("cameraBox"),
  emotionValue: document.getElementById("emotionValue"),
  difficultyValue: document.getElementById("difficultyValue"),
  cameraValue: document.getElementById("cameraValue"),
  scoreValue: document.getElementById("scoreValue"),
  questionTag: document.getElementById("questionTag"),
  questionText: document.getElementById("questionText"),
  messageText: document.getElementById("messageText"),
  optionsContainer: document.getElementById("optionsContainer"),
  feedbackText: document.getElementById("feedbackText"),
  nextButton: document.getElementById("nextButton"),
};

const state = {
  liveEmotion: "neutral",
  appliedEmotion: "neutral",
  currentDifficulty: "hard",
  score: 0,
  totalAnswered: 0,
  questionNumber: 1,
  currentQuestion: null,
  answeredCurrentQuestion: false,
  socketConnected: false,
  cameraStatus: "starting",
  faceDetected: false,
  reconnectTimer: null,
};

function applyLiveEmotionToQuizState() {
  state.appliedEmotion = state.liveEmotion;
  state.currentDifficulty = difficultyForEmotion(state.appliedEmotion);
}

function pickMotivationMessage(emotion) {
  if (emotion === "frustrated") {
    const randomIndex = Math.floor(Math.random() * FRUSTRATION_MESSAGES.length);
    return FRUSTRATION_MESSAGES[randomIndex];
  }

  if (emotion === "sad") {
    return "You will get easier questions for a bit.";
  }

  if (emotion === "happy") {
    return "Nice work. Keeping the questions harder.";
  }

  return "Steady progress. Hard questions are active.";
}

function updateStatus() {
  elements.appCard.dataset.emotion = state.appliedEmotion;
  elements.emotionBox.dataset.emotion = state.liveEmotion;
  elements.difficultyBox.dataset.difficulty = state.currentDifficulty;
  elements.cameraBox.dataset.camera = state.cameraStatus;
  elements.emotionValue.textContent = capitalize(state.liveEmotion);
  elements.difficultyValue.textContent = capitalize(state.currentDifficulty);
  elements.cameraValue.textContent = formatCameraStatus(
    state.socketConnected,
    state.cameraStatus,
    state.faceDetected
  );
  elements.scoreValue.textContent = `${state.score} / ${state.totalAnswered}`;
}

function renderQuestion(feedbackMessage = "Choose an option to answer.") {
  state.currentQuestion = generateQuestion(state.currentDifficulty);
  state.answeredCurrentQuestion = false;

  updateStatus();

  elements.questionTag.textContent = `Question ${state.questionNumber}`;
  elements.questionText.textContent = state.currentQuestion.text;
  elements.messageText.textContent = pickMotivationMessage(state.appliedEmotion);
  elements.feedbackText.textContent = feedbackMessage;
  elements.nextButton.disabled = true;
  elements.optionsContainer.innerHTML = "";

  state.currentQuestion.options.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "option-button";
    button.textContent = option;
    button.addEventListener("click", () => handleAnswer(option, button));
    elements.optionsContainer.appendChild(button);
  });
}

function handleAnswer(selectedAnswer, selectedButton) {
  const correct = selectedAnswer === state.currentQuestion.correctAnswer;
  state.answeredCurrentQuestion = true;
  state.totalAnswered += 1;

  if (correct) {
    state.score += 1;
  }

  [...elements.optionsContainer.children].forEach((button) => {
    button.disabled = true;
    const optionValue = Number(button.textContent);

    if (optionValue === state.currentQuestion.correctAnswer) {
      button.classList.add("correct");
    } else if (button === selectedButton && !correct) {
      button.classList.add("wrong");
    }
  });

  elements.feedbackText.textContent = correct
    ? `Correct. ${state.currentQuestion.correctAnswer} is the right answer.`
    : `Wrong. The correct answer is ${state.currentQuestion.correctAnswer}.`;
  applyLiveEmotionToQuizState();
  elements.messageText.textContent = pickMotivationMessage(state.liveEmotion);
  elements.nextButton.disabled = false;
  updateStatus();
}

function connectEmotionSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${window.location.host}/ws/emotion`);

  socket.addEventListener("open", () => {
    state.socketConnected = true;
    updateStatus();
  });

  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);

    state.liveEmotion = payload.emotion || "neutral";
    state.cameraStatus = payload.camera_status || "starting";
    state.faceDetected = Boolean(payload.face_detected);
    state.socketConnected = true;

    updateStatus();
  });

  socket.addEventListener("close", () => {
    state.socketConnected = false;
    state.cameraStatus = "starting";
    state.faceDetected = false;
    updateStatus();

    window.clearTimeout(state.reconnectTimer);
    state.reconnectTimer = window.setTimeout(connectEmotionSocket, 2000);
  });

  socket.addEventListener("error", () => {
    socket.close();
  });
}

elements.nextButton.addEventListener("click", () => {
  state.questionNumber += 1;
  renderQuestion();
});

applyLiveEmotionToQuizState();
updateStatus();
renderQuestion();
connectEmotionSocket();
