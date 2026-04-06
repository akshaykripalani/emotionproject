(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.quizLogic = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function shuffle(array) {
    const copy = [...array];

    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }

    return copy;
  }

  function pickOperation() {
    const operations = ["plus", "minus", "multiply", "divide"];
    return operations[randomInt(0, operations.length - 1)];
  }

  function difficultyForEmotion(emotion) {
    return emotion === "sad" || emotion === "frustrated" ? "easy" : "hard";
  }

  function createOptions(correctAnswer, difficulty) {
    const options = new Set([correctAnswer]);
    const maxStep = difficulty === "easy" ? 4 : 12;

    while (options.size < 4) {
      const shift = randomInt(-maxStep, maxStep);
      const candidate = correctAnswer + shift;

      if (candidate >= 0 && candidate !== correctAnswer) {
        options.add(candidate);
      }
    }

    return shuffle([...options]);
  }

  function generateQuestion(difficulty) {
    const operation = pickOperation();
    let left;
    let right;
    let answer;
    let symbol;

    if (difficulty === "easy") {
      if (operation === "plus") {
        left = randomInt(0, 10);
        right = randomInt(0, 10);
        answer = left + right;
        symbol = "+";
      } else if (operation === "minus") {
        left = randomInt(0, 10);
        right = randomInt(0, left);
        answer = left - right;
        symbol = "-";
      } else if (operation === "multiply") {
        left = randomInt(1, 5);
        right = randomInt(1, 5);
        answer = left * right;
        symbol = "x";
      } else {
        right = randomInt(1, 5);
        answer = randomInt(1, 10);
        left = right * answer;
        symbol = "/";
      }
    } else if (operation === "plus") {
      left = randomInt(10, 60);
      right = randomInt(10, 60);
      answer = left + right;
      symbol = "+";
    } else if (operation === "minus") {
      left = randomInt(20, 80);
      right = randomInt(10, left - 5);
      answer = left - right;
      symbol = "-";
    } else if (operation === "multiply") {
      left = randomInt(3, 12);
      right = randomInt(3, 12);
      answer = left * right;
      symbol = "x";
    } else {
      right = randomInt(2, 12);
      answer = randomInt(2, 12);
      left = right * answer;
      symbol = "/";
    }

    return {
      text: `${left} ${symbol} ${right} = ?`,
      correctAnswer: answer,
      options: createOptions(answer, difficulty),
    };
  }

  function capitalize(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function formatCameraStatus(socketConnected, cameraStatus, faceDetected) {
    if (!socketConnected) {
      return "Connecting";
    }

    if (cameraStatus === "live" && faceDetected) {
      return "Tracking";
    }

    if (cameraStatus === "live" || cameraStatus === "no_face") {
      return "No Face";
    }

    if (cameraStatus === "camera_unavailable") {
      return "Unavailable";
    }

    if (cameraStatus === "camera_error") {
      return "Error";
    }

    return "Starting";
  }

  return {
    capitalize,
    createOptions,
    difficultyForEmotion,
    formatCameraStatus,
    generateQuestion,
    pickOperation,
    randomInt,
    shuffle,
  };
});
