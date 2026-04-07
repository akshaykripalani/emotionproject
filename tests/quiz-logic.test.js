const test = require("node:test");
const assert = require("node:assert/strict");

const {
  capitalize,
  createOptions,
  difficultyForEmotion,
  formatCameraStatus,
  generateQuestion,
  generateMathQuestion,
  loadCSVQuestions,
  resetUsedQuestions,
} = require("../quiz-logic.js");

function parseQuestion(questionText) {
  const match = questionText.match(/^(\d+) ([+\-x/]) (\d+) = \?$/);
  assert.ok(match, `Unexpected question format: ${questionText}`);
  const left = Number(match[1]);
  const operator = match[2];
  const right = Number(match[3]);

  if (operator === "+") return left + right;
  if (operator === "-") return left - right;
  if (operator === "x") return left * right;
  return left / right;
}

test("difficultyForEmotion maps emotion states correctly", () => {
  assert.equal(difficultyForEmotion("sad"), "easy");
  assert.equal(difficultyForEmotion("frustrated"), "easy");
  assert.equal(difficultyForEmotion("confused"), "easy");
  assert.equal(difficultyForEmotion("happy"), "hard");
  assert.equal(difficultyForEmotion("neutral"), "hard");
  assert.equal(difficultyForEmotion("focused"), "hard");
  assert.equal(difficultyForEmotion("surprised"), "hard");
});

test("createOptions includes the correct answer and four unique values", () => {
  const options = createOptions(12, "easy");
  assert.equal(options.length, 4);
  assert.equal(new Set(options).size, 4);
  assert.ok(options.includes(12));
});

test("generateMathQuestion returns valid easy math questions", () => {
  for (let i = 0; i < 50; i++) {
    const q = generateMathQuestion("easy");
    assert.equal(q.category, "Math");
    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options).size, 4);
    assert.ok(q.options.includes(q.correctAnswer));
    assert.equal(parseQuestion(q.text), q.correctAnswer);
  }
});

test("generateMathQuestion returns valid hard math questions", () => {
  for (let i = 0; i < 50; i++) {
    const q = generateMathQuestion("hard");
    assert.equal(q.category, "Math");
    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options).size, 4);
    assert.ok(q.options.includes(q.correctAnswer));
    assert.equal(parseQuestion(q.text), q.correctAnswer);
  }
});

test("generateMathQuestion returns valid medium math questions", () => {
  for (let i = 0; i < 50; i++) {
    const q = generateMathQuestion("medium");
    assert.equal(q.category, "Math");
    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options).size, 4);
    assert.ok(q.options.includes(q.correctAnswer));
    assert.equal(parseQuestion(q.text), q.correctAnswer);
  }
});

test("generateQuestion falls back to math when no CSV loaded", () => {
  // in Node env, no CSV is loaded, so GK falls back to math
  resetUsedQuestions();
  for (let i = 0; i < 20; i++) {
    const q = generateQuestion("easy");
    assert.equal(q.category, "Math"); // all math since CSV not available
    assert.equal(q.options.length, 4);
    assert.ok(q.options.includes(q.correctAnswer));
  }
});

test("resetUsedQuestions can be called without error", () => {
  assert.doesNotThrow(() => resetUsedQuestions());
});

test("capitalize and formatCameraStatus return expected labels", () => {
  assert.equal(capitalize("neutral"), "Neutral");
  assert.equal(formatCameraStatus(false, "starting", false), "Connecting");
  assert.equal(formatCameraStatus(true, "live", true), "Tracking");
  assert.equal(formatCameraStatus(true, "no_face", false), "No Face");
  assert.equal(formatCameraStatus(true, "camera_error", false), "Error");
});

test("loadCSVQuestions resets stale state when fetch returns invalid data", async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => ({
      ok: true,
      json: async () => [{ q: "bad row", d: "invalid", c: "x", a: "True" }],
    });
    await loadCSVQuestions();
    const q = generateQuestion("medium");
    assert.equal(q.category, "Math");
  } finally {
    global.fetch = originalFetch;
  }
});
