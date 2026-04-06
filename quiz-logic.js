(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }
  root.quizLogic = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {

  /* ===== UTILITIES ===== */

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function shuffle(array) {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function pickOperation() {
    return ["plus", "minus", "multiply", "divide"][randomInt(0, 3)];
  }

  function difficultyForEmotion(emotion) {
    return ["sad", "frustrated", "confused"].includes(emotion) ? "easy" : "hard";
  }

  function createOptions(correctAnswer, difficulty) {
    const options = new Set([correctAnswer]);
    const maxStep = difficulty === "easy" ? 4 : 12;
    while (options.size < 4) {
      const shift = randomInt(-maxStep, maxStep);
      const candidate = correctAnswer + shift;
      if (candidate >= 0 && candidate !== correctAnswer) options.add(candidate);
    }
    return shuffle([...options]);
  }

  /* ===== CSV QUESTION BANK (loaded from /questions.json) ===== */

  let csvQuestions = [];
  let csvLoaded = false;
  let usedCsvIndices = new Set();

  function loadCSVQuestions() {
    if (typeof fetch === "undefined") return Promise.resolve();
    return fetch("/questions.json")
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          csvQuestions = data;
          csvLoaded = true;
        }
      })
      .catch(() => { csvQuestions = []; csvLoaded = false; });
  }

  function resetUsedQuestions() {
    usedCsvIndices = new Set();
  }

  function getCsvPool(difficulty) {
    if (!Array.isArray(csvQuestions) || csvQuestions.length === 0) return [];
    return csvQuestions
      .map((q, i) => ({ ...q, _idx: i }))
      .filter((q) => {
        if (usedCsvIndices.has(q._idx)) return false;
        if (difficulty === "easy") return q.d === "easy";
        return q.d === "medium" || q.d === "hard";
      });
  }

  /* ===== QUESTION GENERATORS ===== */

  function generateMathQuestion(difficulty) {
    const op = pickOperation();
    let left, right, answer, symbol;

    if (difficulty === "easy") {
      if (op === "plus")         { left = randomInt(0, 10); right = randomInt(0, 10); answer = left + right; symbol = "+"; }
      else if (op === "minus")   { left = randomInt(0, 10); right = randomInt(0, left); answer = left - right; symbol = "-"; }
      else if (op === "multiply"){ left = randomInt(1, 5); right = randomInt(1, 5); answer = left * right; symbol = "x"; }
      else                       { right = randomInt(1, 5); answer = randomInt(1, 10); left = right * answer; symbol = "/"; }
    } else {
      if (op === "plus")         { left = randomInt(10, 60); right = randomInt(10, 60); answer = left + right; symbol = "+"; }
      else if (op === "minus")   { left = randomInt(20, 80); right = randomInt(10, left - 5); answer = left - right; symbol = "-"; }
      else if (op === "multiply"){ left = randomInt(3, 12); right = randomInt(3, 12); answer = left * right; symbol = "x"; }
      else                       { right = randomInt(2, 12); answer = randomInt(2, 12); left = right * answer; symbol = "/"; }
    }

    return { text: `${left} ${symbol} ${right} = ?`, correctAnswer: answer, options: createOptions(answer, difficulty), category: "Math" };
  }

  function generateGKQuestion(difficulty) {
    const pool = getCsvPool(difficulty);
    if (pool.length === 0) return null; // signal: no CSV questions available
    const picked = pool[randomInt(0, pool.length - 1)];
    usedCsvIndices.add(picked._idx);
    return {
      text: picked.q,
      correctAnswer: picked.a,
      options: shuffle(["True", "False"]),
      category: picked.c,
    };
  }

  function generateQuestion(difficulty) {
    // always try CSV first, fall back to math only if CSV pool is empty
    const gk = generateGKQuestion(difficulty);
    if (gk) return gk;
    return generateMathQuestion(difficulty);
  }

  /* ===== HELPERS ===== */

  function capitalize(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function formatCameraStatus(socketConnected, cameraStatus, faceDetected) {
    if (!socketConnected) return "Connecting";
    if (cameraStatus === "live" && faceDetected) return "Tracking";
    if (cameraStatus === "live" || cameraStatus === "no_face") return "No Face";
    if (cameraStatus === "camera_unavailable") return "Unavailable";
    if (cameraStatus === "camera_error") return "Error";
    return "Starting";
  }

  return {
    capitalize,
    createOptions,
    difficultyForEmotion,
    formatCameraStatus,
    generateQuestion,
    generateMathQuestion,
    generateGKQuestion,
    loadCSVQuestions,
    resetUsedQuestions,
    pickOperation,
    randomInt,
    shuffle,
  };
});
