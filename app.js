/* ===================================================================
   EmotiSense — Dashboard + Adaptive Quiz with Frustration Pause
   =================================================================== */

const MAX_QUESTIONS = 15;
const STORAGE = { sessions: "emotisense_sessions", leaderboard: "emotisense_leaderboard" };

const FRUSTRATION_MESSAGES = [
  "Take a breath. The next one will be easier.",
  "You're doing fine. One step at a time.",
  "Keep going. A simpler question is coming.",
];

const {
  capitalize, formatCameraStatus, generateQuestion,
  loadCSVQuestions, resetUsedQuestions,
} = window.quizLogic;

/* ===== SHARED EMOTION STATE ===== */

const emo = {
  current: "neutral",
  cameraStatus: "starting",
  faceDetected: false,
  socketConnected: false,
  reconnectTimer: null,
  history: [],
  stressStreak: 0,
  pauseCount: 0,
  sessionStart: Date.now(),
  cogLoad: 0,
};

/* ===== DOM ===== */

const el = {};

function initElements() {
  [
    "navCogFill","navEmotionChip","navEmotionText",
    "pageDashboard","pageQuiz",
    "cogRingFill","cogValue","dashEmotion","dashStress","dashDuration","dashPauses","dashTimeline","wbNum","wbLabel",
    "quizStartScreen","quizPlayScreen","quizResultsScreen",
    "playerName","startButton",
    "pastSessionsSection","sessionList","leaderboardSection","leaderboardList",
    "quizCard","progressBar","questionTag","scoreDisplay",
    "emotionBox","cameraBox",
    "emotionValue","cameraValue",
    "questionText","messageText","optionsContainer","feedbackText","nextButton","pauseBtn",
    "resultsTitle","resultsSummary",
    "statCorrect","statWrong","statAccuracy","statPauses","statHardAcc","statEasyAcc",
    "hardTotal","hardCorrect","hardWrong","hardAccuracy",
    "easyTotal","easyCorrect","easyWrong","easyAccuracy",
    "mathTotal","mathCorrect","mathWrong","mathAccuracy",
    "gkTotal","gkCorrect","gkWrong","gkAccuracy",
    "emotionGraph","emotionDist","questionLog",
    "playAgainButton","quizHomeButton",
    "pauseOverlay","pauseTitle","pauseBody","breatheLabel","pauseTime","resumeBtn","dismissPause",
  ].forEach((id) => { el[id] = document.getElementById(id); });
}

/* ===== NAV ===== */

function navigateTo(page) {
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".nav-link").forEach((l) => l.classList.remove("active"));
  const target = document.getElementById("page" + capitalize(page));
  if (target) target.classList.add("active");
  const link = document.querySelector(`.nav-link[data-page="${page}"]`);
  if (link) link.classList.add("active");
}

/* ===== WEBSOCKET ===== */

function connectSocket() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${proto}//${location.host}/ws/emotion`);

  ws.addEventListener("open", () => { emo.socketConnected = true; updateAll(); });

  ws.addEventListener("message", (e) => {
    const d = JSON.parse(e.data);
    emo.current = d.emotion || "neutral";
    emo.cameraStatus = d.camera_status || "starting";
    emo.faceDetected = Boolean(d.face_detected);
    emo.socketConnected = true;

    emo.history.push({ emotion: emo.current, time: Date.now() });
    if (emo.history.length > 600) emo.history.shift();

    const stressed = ["frustrated","sad","confused"].includes(emo.current);
    emo.stressStreak = stressed ? emo.stressStreak + 1 : Math.max(0, emo.stressStreak - 1);

    updateCogLoad();

    // live difficulty recompute while question is active
    if (quiz.inProgress && !quiz.answered) {
      quiz.currentDifficulty = computeDifficulty();
    }

    updateAll();
    checkAutoPause();
  });

  ws.addEventListener("close", () => {
    emo.socketConnected = false; emo.cameraStatus = "starting"; emo.faceDetected = false;
    updateAll();
    clearTimeout(emo.reconnectTimer);
    emo.reconnectTimer = setTimeout(connectSocket, 2000);
  });

  ws.addEventListener("error", () => ws.close());
}

function updateAll() {
  el.navEmotionChip.dataset.emotion = emo.current;
  el.navEmotionText.textContent = capitalize(emo.current);
  el.navCogFill.style.width = emo.cogLoad + "%";
  el.navCogFill.style.background = emo.cogLoad > 70 ? "var(--red)" : emo.cogLoad > 40 ? "var(--yellow)" : "var(--green)";
  updateDashboard();
  updateQuizUI();
}

/* ===== COGNITIVE LOAD ===== */

function updateCogLoad() {
  const recent = emo.history.slice(-30);
  if (!recent.length) { emo.cogLoad = 0; return; }
  const w = { frustrated: 15, confused: 12, sad: 10, surprised: 5, neutral: 3, focused: 1, happy: 0 };
  let sum = 0;
  recent.forEach((h) => { sum += w[h.emotion] || 3; });
  emo.cogLoad = Math.min(100, Math.round(sum / recent.length * (100 / 15)));
}

/* ===== DASHBOARD ===== */

function updateDashboard() {
  if (!el.cogRingFill) return;
  const circ = 2 * Math.PI * 52;

  if (!emo.socketConnected || emo.history.length < 5) {
    el.cogRingFill.style.strokeDashoffset = circ;
    el.cogValue.textContent = "--";
    el.dashEmotion.textContent = emo.socketConnected ? capitalize(emo.current) : "Connecting...";
    el.dashStress.textContent = "--";
    el.dashPauses.textContent = emo.pauseCount;
    const sec = Math.floor((Date.now() - emo.sessionStart) / 1000);
    el.dashDuration.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
    el.wbNum.textContent = "--";
    el.wbLabel.textContent = emo.socketConnected ? "Collecting data..." : "Waiting for webcam...";
    return;
  }

  const load = emo.cogLoad;
  el.cogRingFill.style.strokeDashoffset = circ - (load / 100) * circ;
  el.cogRingFill.style.stroke = load > 70 ? "var(--red)" : load > 40 ? "var(--yellow)" : "var(--green)";
  el.cogValue.textContent = load;
  el.dashEmotion.textContent = capitalize(emo.current);
  el.dashStress.textContent = load > 70 ? "High" : load > 40 ? "Moderate" : "Low";
  const sec = Math.floor((Date.now() - emo.sessionStart) / 1000);
  el.dashDuration.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  el.dashPauses.textContent = emo.pauseCount;

  const sessionSec = Math.floor((Date.now() - emo.sessionStart) / 1000);
  if (sessionSec >= 30 && emo.history.length >= 50) {
    const wb = Math.max(0, 100 - load);
    el.wbNum.textContent = wb;
    el.wbLabel.textContent = wb >= 70 ? "You're doing well!" : wb >= 40 ? "Moderate — consider a break" : "High stress — take it easy";
  } else {
    el.wbNum.textContent = "--";
    el.wbLabel.textContent = "Collecting data...";
  }

  const recent = emo.history.slice(-120);
  el.dashTimeline.innerHTML = "";
  const lv = { happy: 7, focused: 6, surprised: 5, neutral: 4, confused: 3, sad: 2, frustrated: 1 };
  recent.forEach((h) => {
    const bar = document.createElement("div");
    bar.className = "dash-timeline-bar";
    bar.dataset.emotion = h.emotion;
    bar.style.height = ((lv[h.emotion] || 4) / 7 * 100) + "%";
    el.dashTimeline.appendChild(bar);
  });
}

/* ===== FRUSTRATION PAUSE ===== */

let pauseActive = false;
let pauseTimer = null;
let pauseSeconds = 0;
let breatheTimer = null;
let forcedEasy = false;

function checkAutoPause() {
  if (pauseActive || !quiz.inProgress) return;
  if (emo.stressStreak >= 20 && emo.cogLoad > 55) triggerPause("auto");
}

function triggerPause(mode) {
  pauseActive = true;
  emo.pauseCount += 1;
  pauseSeconds = 0;

  if (mode === "auto") {
    const titles = { frustrated: "You seem frustrated", sad: "Feeling overwhelmed?", confused: "Looks like you're stuck" };
    el.pauseTitle.textContent = titles[emo.current] || "Let's take a break";
    el.pauseBody.textContent = "Take a moment. When you're ready, the quiz will continue with easier questions.";
  } else {
    el.pauseTitle.textContent = "Quiz Paused";
    el.pauseBody.textContent = "Take your time. Resume whenever you're ready.";
  }

  el.pauseOverlay.classList.remove("hidden");
  el.pauseTime.textContent = "0s";
  pauseTimer = setInterval(() => {
    pauseSeconds += 1;
    el.pauseTime.textContent = pauseSeconds < 60 ? `${pauseSeconds}s` : `${Math.floor(pauseSeconds / 60)}m ${pauseSeconds % 60}s`;
  }, 1000);

  const phases = ["Breathe in...", "Hold...", "Breathe out...", "Hold..."];
  let i = 0;
  el.breatheLabel.textContent = phases[0];
  breatheTimer = setInterval(() => { i = (i + 1) % 4; el.breatheLabel.textContent = phases[i]; }, 2000);
}

function resumeFromPause(withEasy) {
  pauseActive = false;
  emo.stressStreak = 0;
  clearInterval(pauseTimer);
  clearInterval(breatheTimer);
  el.pauseOverlay.classList.add("hidden");
  if (withEasy) {
    forcedEasy = true;
    quiz.currentDifficulty = "easy";
  }
}

/* =================================================================
   ADAPTIVE DIFFICULTY — the core logic
   =================================================================

   Two real-time signals combined:

   1. PERFORMANCE SCORE (updated after each answer)
        correct → performanceScore + 1
        wrong   → performanceScore - 1
      Starts at 0.

   2. EMOTION BIAS (recomputed every WebSocket tick, ~10x/sec)
        happy / focused   → +1
        surprised          → +0.5
        neutral            → 0
        confused           → -1
        sad / frustrated   → -2

   FINAL SCORE = performanceScore + emotionBias

        final >= 2   →  HARD   (CSV medium+hard questions)
        final < 2    →  EASY   (CSV easy questions)

   So to reach hard, user needs BOTH:
     - positive performance (getting answers right)
     - positive emotion (happy or focused face)

   Any combination of wrong answers or negative emotion pulls toward easy.

   FORCED EASY (from pause resume) overrides everything until first
   correct answer, then normal logic resumes.
   ================================================================= */

const quiz = {
  playerName: "",
  currentDifficulty: "easy",  // start gentle
  performanceScore: 0,
  score: 0,
  questionNumber: 0,
  currentQuestion: null,
  answered: false,
  inProgress: false,
  log: [],
  emotionHistory: [],
};

function emotionBias(emotion) {
  const map = { happy: 1, focused: 1, surprised: 0.5, neutral: 0, confused: -1, sad: -2, frustrated: -2 };
  return map[emotion] !== undefined ? map[emotion] : 0;
}

function computeDifficulty() {
  if (forcedEasy) return "easy";
  const final = quiz.performanceScore + emotionBias(emo.current);
  return final >= 2 ? "hard" : "easy";
}

function showQuizScreen(id) {
  ["quizStartScreen","quizPlayScreen","quizResultsScreen"].forEach((s) => el[s].classList.add("hidden"));
  el[id].classList.remove("hidden");
}

function updateQuizUI() {
  if (!el.quizCard || !quiz.inProgress) return;
  el.quizCard.dataset.emotion = emo.current;
  el.emotionBox.dataset.emotion = emo.current;
  el.cameraBox.dataset.camera = emo.cameraStatus;
  el.emotionValue.textContent = capitalize(emo.current);
  el.cameraValue.textContent = formatCameraStatus(emo.socketConnected, emo.cameraStatus, emo.faceDetected);
  el.scoreDisplay.textContent = `Score: ${quiz.score}`;
  el.progressBar.style.width = `${(quiz.questionNumber / MAX_QUESTIONS) * 100}%`;
  el.questionTag.textContent = `Q${quiz.questionNumber} / ${MAX_QUESTIONS}`;
}

function motivation(emotion) {
  if (emotion === "frustrated") return FRUSTRATION_MESSAGES[Math.floor(Math.random() * FRUSTRATION_MESSAGES.length)];
  if (emotion === "sad") return "Easier questions coming your way.";
  if (emotion === "confused") return "Let's slow down. Simpler one next.";
  if (emotion === "surprised") return "Something unexpected? Let's keep going.";
  if (emotion === "focused") return "In the zone. Keeping it challenging.";
  if (emotion === "happy") return "You're doing great. Pushing harder.";
  return "Steady pace.";
}

function renderQuestion() {
  quiz.questionNumber += 1;
  quiz.currentQuestion = generateQuestion(quiz.currentDifficulty);
  quiz.answered = false;
  updateQuizUI();

  el.questionText.textContent = quiz.currentQuestion.text;
  el.messageText.textContent = motivation(emo.current);
  el.feedbackText.textContent = "Choose an option to answer.";
  el.nextButton.disabled = true;
  el.nextButton.textContent = quiz.questionNumber < MAX_QUESTIONS ? "Next" : "Finish";
  el.optionsContainer.innerHTML = "";

  quiz.currentQuestion.options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-button";
    btn.textContent = opt;
    btn.addEventListener("click", () => handleAnswer(opt, btn));
    el.optionsContainer.appendChild(btn);
  });
}

function handleAnswer(selected, selectedBtn) {
  if (quiz.answered) return;
  const q = quiz.currentQuestion;
  const correct = String(selected) === String(q.correctAnswer);
  quiz.answered = true;

  if (correct) {
    quiz.score += 1;
    quiz.performanceScore += 1;
    if (forcedEasy) forcedEasy = false; // release forced easy on correct
  } else {
    quiz.performanceScore -= 1;
  }

  // recompute difficulty for NEXT question
  quiz.currentDifficulty = computeDifficulty();

  quiz.log.push({
    text: q.text, correctAnswer: q.correctAnswer, selectedAnswer: selected,
    correct, difficulty: quiz.currentDifficulty, emotion: emo.current, category: q.category,
  });
  quiz.emotionHistory.push(emo.current);

  [...el.optionsContainer.children].forEach((btn) => {
    btn.disabled = true;
    if (String(btn.textContent) === String(q.correctAnswer)) btn.classList.add("correct");
    else if (btn === selectedBtn && !correct) btn.classList.add("wrong");
  });

  el.feedbackText.textContent = correct ? `Correct! The answer is ${q.correctAnswer}.` : `Wrong. The answer was ${q.correctAnswer}.`;
  el.messageText.textContent = motivation(emo.current);
  el.nextButton.disabled = false;
  updateQuizUI();
}

function startQuiz() {
  quiz.playerName = (el.playerName.value.trim()) || "Player";
  quiz.score = 0; quiz.questionNumber = 0; quiz.performanceScore = 0;
  quiz.log = []; quiz.emotionHistory = [];
  quiz.currentDifficulty = "easy"; // start gentle
  quiz.inProgress = true;
  forcedEasy = false;
  resetUsedQuestions();
  quiz.currentDifficulty = computeDifficulty();
  showQuizScreen("quizPlayScreen");
  renderQuestion();
}

function finishQuiz() {
  quiz.inProgress = false;
  saveSession();
  renderResults();
  showQuizScreen("quizResultsScreen");
}

/* ===== SAVE SESSION ===== */

function saveSession() {
  const rec = {
    name: quiz.playerName, score: quiz.score, total: MAX_QUESTIONS,
    pauses: emo.pauseCount, date: new Date().toISOString(),
    emotionHistory: [...quiz.emotionHistory],
    log: quiz.log.map((q) => ({ text: q.text, correct: q.correct, difficulty: q.difficulty, emotion: q.emotion, category: q.category })),
  };
  const sessions = loadJSON(STORAGE.sessions);
  sessions.unshift(rec);
  saveJSON(STORAGE.sessions, sessions.slice(0, 20));
  const board = loadJSON(STORAGE.leaderboard);
  board.push({ name: quiz.playerName, score: quiz.score, total: MAX_QUESTIONS, date: rec.date });
  board.sort((a, b) => b.score - a.score || new Date(a.date) - new Date(b.date));
  saveJSON(STORAGE.leaderboard, board.slice(0, 10));
}

/* ===== RESULTS ===== */

function renderResults() {
  const total = MAX_QUESTIONS, correct = quiz.score, wrong = total - correct;
  const acc = total > 0 ? Math.round((correct / total) * 100) : 0;
  el.resultsTitle.textContent = acc >= 80 ? "Excellent!" : acc >= 60 ? "Nice work!" : acc >= 40 ? "Keep practicing!" : "Don't give up!";
  el.resultsSummary.textContent = `${quiz.playerName} scored ${correct} / ${total}`;
  el.statCorrect.textContent = correct;
  el.statWrong.textContent = wrong;
  el.statAccuracy.textContent = acc + "%";
  el.statPauses.textContent = emo.pauseCount;

  const hard = quiz.log.filter((q) => q.difficulty === "hard");
  const easy = quiz.log.filter((q) => q.difficulty === "easy");
  const hc = hard.filter((q) => q.correct).length;
  const ec = easy.filter((q) => q.correct).length;

  el.statHardAcc.textContent = hard.length ? Math.round((hc / hard.length) * 100) + "%" : "--";
  el.statEasyAcc.textContent = easy.length ? Math.round((ec / easy.length) * 100) + "%" : "--";

  el.hardTotal.textContent = hard.length; el.hardCorrect.textContent = hc; el.hardWrong.textContent = hard.length - hc;
  el.hardAccuracy.textContent = hard.length ? Math.round((hc / hard.length) * 100) + "%" : "--";
  el.easyTotal.textContent = easy.length; el.easyCorrect.textContent = ec; el.easyWrong.textContent = easy.length - ec;
  el.easyAccuracy.textContent = easy.length ? Math.round((ec / easy.length) * 100) + "%" : "--";

  const mathQ = quiz.log.filter((q) => q.category === "Math");
  const gkQ = quiz.log.filter((q) => q.category !== "Math");
  const mc = mathQ.filter((q) => q.correct).length;
  const gc = gkQ.filter((q) => q.correct).length;
  el.mathTotal.textContent = mathQ.length; el.mathCorrect.textContent = mc; el.mathWrong.textContent = mathQ.length - mc;
  el.mathAccuracy.textContent = mathQ.length ? Math.round((mc / mathQ.length) * 100) + "%" : "--";
  el.gkTotal.textContent = gkQ.length; el.gkCorrect.textContent = gc; el.gkWrong.textContent = gkQ.length - gc;
  el.gkAccuracy.textContent = gkQ.length ? Math.round((gc / gkQ.length) * 100) + "%" : "--";

  renderEmotionGraph();
  renderEmotionDist();
  renderQuestionLog();
}

function renderEmotionGraph() {
  el.emotionGraph.innerHTML = "";
  const lv = { happy: 7, focused: 6, surprised: 5, neutral: 4, confused: 3, sad: 2, frustrated: 1 };
  quiz.log.forEach((q, i) => {
    const g = document.createElement("div"); g.className = "graph-bar-group";
    const r = document.createElement("div"); r.className = "graph-result " + (q.correct ? "correct" : "wrong"); r.textContent = q.correct ? "+" : "-";
    const b = document.createElement("div"); b.className = "graph-bar"; b.dataset.emotion = q.emotion; b.style.height = ((lv[q.emotion] || 4) / 7 * 100) + "%";
    const c = document.createElement("span"); c.className = "graph-cat " + (q.category === "Math" ? "math" : "gk"); c.textContent = q.category === "Math" ? "M" : "GK";
    const l = document.createElement("span"); l.className = "graph-label"; l.textContent = i + 1;
    g.append(r, b, c, l);
    el.emotionGraph.appendChild(g);
  });
}

function renderEmotionDist() {
  el.emotionDist.innerHTML = "";
  const emotions = ["happy","focused","surprised","neutral","confused","sad","frustrated"];
  const total = quiz.emotionHistory.length || 1;
  emotions.forEach((e) => {
    const count = quiz.emotionHistory.filter((x) => x === e).length;
    if (!count) return;
    const pct = Math.round((count / total) * 100);
    const row = document.createElement("div"); row.className = "dist-row";
    row.innerHTML = `<span class="dist-label">${capitalize(e)}</span><div class="dist-track"><div class="dist-fill" data-emotion="${e}" style="width:${pct}%"></div></div><span class="dist-count">${count}</span>`;
    el.emotionDist.appendChild(row);
  });
}

function renderQuestionLog() {
  el.questionLog.innerHTML = "";
  quiz.log.forEach((q, i) => {
    const item = document.createElement("div"); item.className = "log-item";
    const catClass = q.category === "Math" ? "math" : "gk";
    const catLabel = q.category === "Math" ? "MATH" : "GK";
    item.innerHTML = `<span class="log-num">${i + 1}</span><span class="log-question">${esc(q.text)}</span><span class="log-answer ${q.correct ? "correct" : "wrong"}">${q.correct ? "+" : "-"}</span><span class="log-diff ${q.difficulty}">${q.difficulty}</span><span class="log-cat ${catClass}">${catLabel}</span><span class="log-emotion">${capitalize(q.emotion)}</span>`;
    el.questionLog.appendChild(item);
  });
}

function renderStartScreen() {
  const sessions = loadJSON(STORAGE.sessions);
  const board = loadJSON(STORAGE.leaderboard);
  if (sessions.length) {
    el.pastSessionsSection.style.display = "";
    el.sessionList.innerHTML = "";
    sessions.slice(0, 8).forEach((s) => {
      const d = new Date(s.date);
      const ds = d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
      const div = document.createElement("div"); div.className = "session-item";
      div.innerHTML = `<span class="session-name">${esc(s.name)}</span><span class="session-score">${s.score}/${s.total}</span><span class="session-date">${ds}</span>`;
      el.sessionList.appendChild(div);
    });
  } else { el.pastSessionsSection.style.display = "none"; }
  if (board.length) {
    el.leaderboardSection.style.display = "";
    el.leaderboardList.innerHTML = "";
    board.slice(0, 10).forEach((e, i) => {
      const li = document.createElement("li"); li.className = "leaderboard-item";
      li.innerHTML = `<span class="lb-rank">#${i + 1}</span><span class="lb-name">${esc(e.name)}</span><span class="lb-score">${e.score}/${e.total}</span>`;
      el.leaderboardList.appendChild(li);
    });
  } else { el.leaderboardSection.style.display = "none"; }
}

/* ===== UTILS ===== */

function esc(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
function loadJSON(key) { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } }
function saveJSON(key, v) { localStorage.setItem(key, JSON.stringify(v)); }

/* ===== EVENTS ===== */

function bindEvents() {
  document.querySelectorAll(".nav-link").forEach((l) => l.addEventListener("click", () => navigateTo(l.dataset.page)));
  document.querySelectorAll(".dash-card.clickable").forEach((c) => c.addEventListener("click", () => navigateTo(c.dataset.goto)));

  el.startButton.addEventListener("click", startQuiz);
  el.playerName.addEventListener("keydown", (e) => { if (e.key === "Enter") startQuiz(); });
  el.nextButton.addEventListener("click", () => { quiz.questionNumber >= MAX_QUESTIONS ? finishQuiz() : renderQuestion(); });
  el.playAgainButton.addEventListener("click", () => { showQuizScreen("quizStartScreen"); setTimeout(startQuiz, 50); });
  el.quizHomeButton.addEventListener("click", () => { renderStartScreen(); showQuizScreen("quizStartScreen"); });

  el.pauseBtn.addEventListener("click", () => { if (quiz.inProgress && !pauseActive) triggerPause("manual"); });
  el.resumeBtn.addEventListener("click", () => resumeFromPause(true));
  el.dismissPause.addEventListener("click", () => resumeFromPause(false));
}

/* ===== INIT ===== */

function init() {
  initElements();
  bindEvents();
  renderStartScreen();
  loadCSVQuestions().then(() => connectSocket());
}

init();
