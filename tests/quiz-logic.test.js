const test = require("node:test");
const assert = require("node:assert/strict");

const {
  capitalize,
  createOptions,
  difficultyForEmotion,
  formatCameraStatus,
  generateQuestion,
} = require("../quiz-logic.js");

function parseQuestion(questionText) {
  const match = questionText.match(/^(\d+) ([+\-x/]) (\d+) = \?$/);
  assert.ok(match, `Unexpected question format: ${questionText}`);
  const left = Number(match[1]);
  const operator = match[2];
  const right = Number(match[3]);

  if (operator === "+") {
    return left + right;
  }

  if (operator === "-") {
    return left - right;
  }

  if (operator === "x") {
    return left * right;
  }

  return left / right;
}

test("difficultyForEmotion maps emotion states correctly", () => {
  assert.equal(difficultyForEmotion("sad"), "easy");
  assert.equal(difficultyForEmotion("frustrated"), "easy");
  assert.equal(difficultyForEmotion("happy"), "hard");
  assert.equal(difficultyForEmotion("neutral"), "hard");
});

test("createOptions includes the correct answer and four unique values", () => {
  const options = createOptions(12, "easy");
  assert.equal(options.length, 4);
  assert.equal(new Set(options).size, 4);
  assert.ok(options.includes(12));
});

test("generateQuestion returns valid easy questions", () => {
  for (let index = 0; index < 50; index += 1) {
    const question = generateQuestion("easy");
    assert.equal(question.options.length, 4);
    assert.equal(new Set(question.options).size, 4);
    assert.ok(question.options.includes(question.correctAnswer));
    assert.equal(parseQuestion(question.text), question.correctAnswer);
  }
});

test("generateQuestion returns valid hard questions", () => {
  for (let index = 0; index < 50; index += 1) {
    const question = generateQuestion("hard");
    assert.equal(question.options.length, 4);
    assert.equal(new Set(question.options).size, 4);
    assert.ok(question.options.includes(question.correctAnswer));
    assert.equal(parseQuestion(question.text), question.correctAnswer);
  }
});

test("capitalize and formatCameraStatus return expected labels", () => {
  assert.equal(capitalize("neutral"), "Neutral");
  assert.equal(formatCameraStatus(false, "starting", false), "Connecting");
  assert.equal(formatCameraStatus(true, "live", true), "Tracking");
  assert.equal(formatCameraStatus(true, "no_face", false), "No Face");
  assert.equal(formatCameraStatus(true, "camera_error", false), "Error");
});
