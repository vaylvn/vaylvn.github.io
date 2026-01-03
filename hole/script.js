/* =========================
   Numi-style screen system
========================= */
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id)?.classList.add("active");
}

/* =========================
   DOM refs
========================= */
const playBtn = document.getElementById("playBtn");
const viewLBBtn = document.getElementById("viewLBBtn");
const backBtnGame = document.getElementById("backBtnGame");
const backBtnLB = document.getElementById("backBtnLB");

const msg = document.getElementById("msg");
const finalScoreEl = document.getElementById("finalScore");
const nameInput = document.getElementById("nameInput");
const submitBtn = document.getElementById("submitBtn");
const playAgainBtn = document.getElementById("playAgainBtn");
const menuBtn = document.getElementById("menuBtn");

/* =========================
   Canvas setup
========================= */
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const COLORS = {
  bg: "#1b1b1b",
  track: "#444",
  lock: "#f5c542",
  yellow: "#f5c542",
  failA: "#c33",
  failB: "#811",
};

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);

  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
}
window.addEventListener("resize", resizeCanvas);

/* =========================
   Match Hole config
========================= */
const START_SPEED = 120;          // deg/sec
const SPEED_INC = 8;
const MAX_LOCK_SIZE = 14;         // degrees (half-width)
const MIN_LOCK_SIZE = 6;
const LOCK_SHRINK_PER_HIT = 0.25;
const MIN_SPAWN_GAP = 90;         // degrees, both directions
const GAME_OVER_FLASH_MS = 700;   // time before switching to results

/* =========================
   Game state
========================= */
let center = { x: 0, y: 0 };
let radius = 0;

let orbAngle = -90;
let lockAngle = 0;
let dir = 1;
let speed = START_SPEED;
let lockSize = MAX_LOCK_SIZE;
let score = 0;

let running = false;       // orb is moving
let started = false;       // first tap inside game screen happened
let insideLock = false;

let lastT = 0;

let flashing = false;      // game over flash active
let flashStart = 0;

/* =========================
   Math helpers
========================= */
const degToRad = d => d * Math.PI / 180;
const normAngle = a => (a + 360) % 360;

function angleDiff(a, b) {
  let d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/* =========================
   Spawn logic
========================= */
function spawnLock() {
  while (true) {
    const a = Math.random() * 360;
    if (angleDiff(a, orbAngle) >= MIN_SPAWN_GAP) {
      lockAngle = a;
      return;
    }
  }
}

/* =========================
   Game lifecycle
========================= */
function initLayout() {
  const rect = canvas.getBoundingClientRect();
  center = { x: rect.width / 2, y: rect.height / 2 };
  radius = Math.min(rect.width, rect.height) * 0.38;
}

function resetRound() {
  orbAngle = -90;
  lockAngle = 0;
  dir = 1;
  speed = START_SPEED;
  lockSize = MAX_LOCK_SIZE;
  score = 0;
  running = false;
  started = false;
  insideLock = false;
  flashing = false;

  spawnLock();

  msg.textContent = "Tap / Space to start";
  msg.style.display = "";
}

function startRun() {
  started = true;
  running = true;
  insideLock = false;
  lastT = performance.now();

  msg.style.display = "none";
}

function gameOver() {
  if (flashing) return;

  running = false;
  flashing = true;
  flashStart = performance.now();

  // Keep the player looking at the circle for the flash moment
  msg.textContent = "game over";
  msg.style.display = "";
}

function finishGameOver() {
  flashing = false;
  finalScoreEl.textContent = String(score);

  showScreen("screen-results");
  nameInput.value = "";
  nameInput.focus();
}

/* =========================
   Input handling (Numi-style)
========================= */
function handleAttempt() {
  if (!running || flashing) return;

  const dist = angleDiff(orbAngle, lockAngle);

  if (dist <= lockSize) {
    // success
    dir *= -1;
    speed += SPEED_INC;
    score += 1;

    lockSize = Math.max(MIN_LOCK_SIZE, lockSize - LOCK_SHRINK_PER_HIT);

    insideLock = false;
    spawnLock();
  } else {
    gameOver();
  }
}

function onGameScreenPress() {
  if (flashing) return;

  // First tap starts movement
  if (!started) {
    startRun();
    return;
  }

  // Subsequent taps are attempts
  handleAttempt();
}

/* Keyboard: space = start/attempt (only while on game screen) */
window.addEventListener("keydown", (e) => {
  if (e.code !== "Space") return;

  const gameScreenActive = document.getElementById("screen-game").classList.contains("active");
  if (!gameScreenActive) return;

  e.preventDefault();

  if (!started) startRun();
  else handleAttempt();
});

/* =========================
   Drawing
========================= */
function failColor() {
  const t = (performance.now() - flashStart) / 160;
  return (Math.floor(t) % 2 === 0) ? COLORS.failA : COLORS.failB;
}

function draw() {
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);

  const isFail = flashing;
  const stroke = isFail ? failColor() : COLORS.track;
  const orbCol = isFail ? failColor() : COLORS.yellow;

  // circle
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.stroke();

  // lock arc
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(
    center.x,
    center.y,
    radius,
    degToRad(lockAngle - lockSize),
    degToRad(lockAngle + lockSize)
  );
  ctx.stroke();

  // orb
  const a = degToRad(orbAngle);
  const ox = center.x + Math.cos(a) * radius;
  const oy = center.y + Math.sin(a) * radius;

  ctx.fillStyle = orbCol;
  ctx.beginPath();
  ctx.arc(ox, oy, 8, 0, Math.PI * 2);
  ctx.fill();

  // score in center (Numi font)
  ctx.fillStyle = isFail ? failColor() : COLORS.yellow;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  let size = radius * 0.55;
  ctx.font = `700 ${size}px "IBM Plex Mono", monospace`;
  let w = ctx.measureText(String(score)).width;
  const maxW = radius * 1.2;

  if (w > maxW) {
    size *= maxW / w;
    ctx.font = `700 ${size}px "IBM Plex Mono", monospace`;
  }

  ctx.fillText(String(score), center.x, center.y);
}

/* =========================
   Game loop
========================= */
function step(t) {
  // Always draw when on the game screen (nice idle look)
  const gameScreenActive = document.getElementById("screen-game").classList.contains("active");
  if (gameScreenActive) {
    if (running) {
      const dt = (t - lastT) / 1000;
      lastT = t;

      orbAngle = normAngle(orbAngle + dir * speed * dt);

      const dist = angleDiff(orbAngle, lockAngle);
      if (dist <= lockSize) {
        insideLock = true;
      } else if (insideLock) {
        // left lock window without pressing
        gameOver();
      }
    }

    if (flashing && (t - flashStart) >= GAME_OVER_FLASH_MS) {
      finishGameOver();
    }

    draw();
  }

  requestAnimationFrame(step);
}

/* =========================
   Wire screens
========================= */
playBtn.addEventListener("click", () => {
  showScreen("screen-game");
  resizeCanvas();
  initLayout();
  resetRound();

  // allow tap anywhere on game screen to start
});

viewLBBtn.addEventListener("click", () => {
  showScreen("screen-leaderboard");
});

backBtnGame.addEventListener("click", () => {
  showScreen("screen-home");
});

backBtnLB.addEventListener("click", () => {
  showScreen("screen-home");
});

canvas.addEventListener("pointerdown", () => {
  const gameScreenActive = document.getElementById("screen-game").classList.contains("active");
  if (!gameScreenActive) return;
  onGameScreenPress();
});

menuBtn.addEventListener("click", () => {
  showScreen("screen-home");
});

playAgainBtn.addEventListener("click", () => {
  showScreen("screen-game");
  resizeCanvas();
  initLayout();
  resetRound();
});

submitBtn.addEventListener("click", () => {
  // placeholder: you can wire this to Firebase later
  showScreen("screen-home");
});

/* =========================
   Boot
========================= */
showScreen("screen-home");

document.fonts?.load('16px "IBM Plex Mono"').finally(() => {
  requestAnimationFrame(step);
});
