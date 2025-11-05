/* ======================
   QuickMath v3.6 Script
   ====================== */

/* Core state */
let min = 1, max = 12;
let time = 60;
let running = false;
let timerInterval = null;
let score = 0;
let current = {};
let input = '';
let isCompetitive = true;
let selectedCompetitiveMode = 60;

/* Elements */
const eqEl = document.getElementById("equation");
const ansEl = document.getElementById("answerArea");
const msgEl = document.getElementById("message");
const timerEl = document.getElementById("timer");
const scoreEl = document.getElementById("score");

const modePanel = document.getElementById("modePanel");
const gameArea = document.getElementById("gameArea");

const compBtn = document.getElementById("competitiveBtn");
const customBtn = document.getElementById("customBtn");
const compPanel = document.getElementById("competitivePanel");
const custPanel = document.getElementById("customPanel");

const minInput = document.getElementById("minInput");
const maxInput = document.getElementById("maxInput");
const timeInput = document.getElementById("timeInput");
const startCustom = document.getElementById("startCustom");

/* Overlays */
const scoreOverlay = document.getElementById("scoreOverlay");
const leaderboardOverlay = document.getElementById("leaderboardOverlay");
const finalScoreEl = document.getElementById("finalScore");
const playerNameEl = document.getElementById("playerName");
const submitBtn = document.getElementById("submitScore");
const skipBtn = document.getElementById("skipScore");
const playAgainBtn = document.getElementById("playAgain");
const leaderboardList = document.getElementById("leaderboardList");
const leaderboardTitle = document.getElementById("leaderboardTitle");

/* Hide overlays on load */
window.addEventListener("DOMContentLoaded", () => {
  scoreOverlay.classList.add("hidden");
  leaderboardOverlay.classList.add("hidden");
});

/* ---------- Mode switching ---------- */
compBtn.onclick = () => switchMode(true);
customBtn.onclick = () => switchMode(false);

function switchMode(toCompetitive) {
  isCompetitive = toCompetitive;
  compBtn.classList.toggle("active", toCompetitive);
  customBtn.classList.toggle("active", !toCompetitive);
  compPanel.classList.toggle("active", toCompetitive);
  custPanel.classList.toggle("active", !toCompetitive);
}

/* ---------- Competitive start ---------- */
document.querySelectorAll(".modeBtn").forEach(btn => {
  btn.addEventListener("click", () => {
    isCompetitive = true;
    min = 1; max = 12;
    selectedCompetitiveMode = parseInt(btn.dataset.time, 10);
    time = selectedCompetitiveMode;
    startGame();
  });
});

/* ---------- Custom start ---------- */
startCustom.addEventListener("click", () => {
  isCompetitive = false;
  const num = s => parseInt(s.replace(/[^\d]/g, ''), 10) || 0;
  min = Math.max(1, num(minInput.value));
  max = Math.max(min, num(maxInput.value));
  time = Math.max(5, num(timeInput.value));
  startGame();
});

/* ---------- Game flow ---------- */
function startGame() {
  if (isCompetitive) {
    if (![15, 30, 60].includes(time)) {
      time = selectedCompetitiveMode || 60;
    }
  } else {
    time = Math.max(5, parseInt(time, 10) || 45);
  }

  modePanel.classList.add("hidden");
  gameArea.classList.remove("hidden");
  scoreOverlay.classList.add("hidden");
  leaderboardOverlay.classList.add("hidden");

  resetGame();
}

function resetGame() {
  running = false;
  score = 0;
  updateHUD();
  eqEl.textContent = '';
  ansEl.textContent = '';
  msgEl.textContent = 'Press any key to start';
}

function newQuestion() {
  const a = rand(min, max);
  const b = rand(min, max);
  current = { a, b, answer: a * b };
  eqEl.textContent = `${a} × ${b} =`;
  input = '';
  ansEl.textContent = '';
  eqEl.classList.add('fade');
  setTimeout(() => eqEl.classList.remove('fade'), 200);
}

function rand(a, b) {
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

function startRun() {
  if (running) return;
  running = true;
  msgEl.textContent = '';
  score = 0;
  updateHUD();
  newQuestion();
  timerInterval = setInterval(() => {
    time--;
    updateHUD();
    if (time <= 0) endGame();
  }, 1000);
}

function updateHUD() {
  timerEl.textContent = time;
  scoreEl.textContent = score;
}

/* ---------- Input ---------- */
document.addEventListener("keydown", e => {
  // 🔒 Prevent triggering game logic while typing name
  if (e.target.tagName === "INPUT") return;

  if (gameArea.classList.contains("hidden")) return;
  if (!running) return startRun();

  if (e.key === "Backspace") {
    input = input.slice(0, -1);
  } else if (/^[0-9]$/.test(e.key)) {
    input += e.key;
  } else {
    return;
  }

  ansEl.textContent = input;

  if (parseInt(input, 10) === current.answer) {
    score++;
    updateHUD();
    newQuestion();
  }
});

/* ---------- End Game ---------- */
function endGame() {
  if (!running) return;
  running = false;
  clearInterval(timerInterval);
  eqEl.textContent = '';
  ansEl.textContent = '';
  msgEl.textContent = `Time’s up! Score: ${score}`;

  if (isCompetitive) {
    const modeLabel = String(selectedCompetitiveMode || 60);
    setTimeout(() => showScoreOverlay(score, modeLabel), 1200);
  } else {
    setTimeout(() => {
      gameArea.classList.add("hidden");
      modePanel.classList.remove("hidden");
    }, 1500);
  }
}

/* ---------- Leaderboard logic ---------- */
async function showScoreOverlay(final, modeLabel) {
  finalScoreEl.textContent = `Score: ${final}`;
  playerNameEl.value = "";
  playerNameEl.dataset.mode = modeLabel;
  scoreOverlay.classList.remove("hidden");
  playerNameEl.focus();
}

async function submitScoreToFirebase(name, score, mode) {
  const { collection, addDoc } = window.firestoreFns;
  await addDoc(collection(window.db, `leaderboards/${mode}/scores`), {
    name,
    score,
    time: Date.now()
  });
}

async function fetchTopScores(mode) {
  const { collection, query, orderBy, limit, getDocs } = window.firestoreFns;
  const q = query(
    collection(window.db, `leaderboards/${mode}/scores`),
    orderBy("score", "desc"),
    limit(10)
  );
  const snap = await getDocs(q);
  const data = [];
  snap.forEach(doc => data.push(doc.data()));
  return data;
}

function showLeaderboard(data, mode) {
  leaderboardTitle.textContent = `Top 10 — ${mode}s Mode`;
  leaderboardList.innerHTML = "";
  data.forEach((row, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${String(i + 1).padStart(2, "0")}. ${row.name}</span><span>${row.score}</span>`;
    leaderboardList.appendChild(li);
  });
  leaderboardOverlay.classList.remove("hidden");
}

/* ---------- Overlay events ---------- */
submitBtn.onclick = async () => {
  const n = playerNameEl.value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(n)) return alert("Use exactly 3 letters (A–Z).");
  const mode = playerNameEl.dataset.mode || "60";
  await submitScoreToFirebase(n, score, mode);
  scoreOverlay.classList.add("hidden");
  const top = await fetchTopScores(mode);
  showLeaderboard(top, mode);
};

skipBtn.onclick = () => {
  scoreOverlay.classList.add("hidden");
  gameArea.classList.add("hidden");
  modePanel.classList.remove("hidden");
};

playAgainBtn.onclick = () => {
  leaderboardOverlay.classList.add("hidden");
  gameArea.classList.add("hidden");
  modePanel.classList.remove("hidden");
};
