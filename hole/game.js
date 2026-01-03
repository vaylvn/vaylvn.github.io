const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

// --- Constants ---
const YELLOW = "#FFD400";
const TRACK = "#444";
const LOCK = "#666";
const FAIL = "#c33";

const START_SPEED = 120; // deg/sec
const SPEED_INC = 8;
const LOCK_SIZE = 8; // degrees
const MIN_FORWARD_GAP = 90;

// --- State ---
let center, radius;
let orbAngle, lockAngle;
let direction, speed;
let score;
let running = false;
let lastTime = 0;
let failed = false;

// --- Helpers ---
const degToRad = d => d * Math.PI / 180;
const normAngle = a => (a + 360) % 360;

function angularDistance(from, to, dir) {
  let d = normAngle(to - from);
  return dir === 1 ? d : normAngle(360 - d);
}

function spawnLock() {
  while (true) {
    const a = Math.random() * 360;
    const dist = angularDistance(orbAngle, a, direction);
    if (dist >= MIN_FORWARD_GAP) {
      lockAngle = a;
      return;
    }
  }
}

function reset() {
  center = { x: canvas.width / 2, y: canvas.height / 2 };
  radius = Math.min(canvas.width, canvas.height) * 0.3;

  orbAngle = -90;
  direction = 1;
  speed = START_SPEED;
  score = 0;
  failed = false;

  spawnLock();
  running = false;
}

// --- Input ---
function handleInput() {
  if (failed) {
    reset();
    return;
  }

  if (!running) {
    running = true;
    lastTime = performance.now();
    return;
  }

  const dist = Math.abs(normAngle(orbAngle - lockAngle));
  if (dist <= LOCK_SIZE) {
    direction *= -1;
    speed += SPEED_INC;
    score++;
    spawnLock();
  } else {
    failed = true;
  }
}

window.addEventListener("keydown", e => {
  if (e.code === "Space") handleInput();
});
canvas.addEventListener("pointerdown", handleInput);

// --- Draw ---
function drawCircle() {
  ctx.strokeStyle = TRACK;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.stroke();
}

function drawLock() {
  ctx.strokeStyle = LOCK;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(
    center.x,
    center.y,
    radius,
    degToRad(lockAngle - LOCK_SIZE),
    degToRad(lockAngle + LOCK_SIZE)
  );
  ctx.stroke();
}

function drawOrb() {
  const a = degToRad(orbAngle);
  const x = center.x + Math.cos(a) * radius;
  const y = center.y + Math.sin(a) * radius;

  ctx.fillStyle = YELLOW;
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.fill();
}

function drawScore() {
  ctx.fillStyle = YELLOW;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  let size = radius * 0.4;
  ctx.font = `bold ${size}px sans-serif`;
  let w = ctx.measureText(score).width;
  if (w > radius * 1.2) {
    size *= (radius * 1.2) / w;
    ctx.font = `bold ${size}px sans-serif`;
  }

  ctx.fillText(score, center.x, center.y);
}

function drawFail() {
  ctx.fillStyle = FAIL;
  ctx.font = "bold 24px sans-serif";
  ctx.fillText("Tap to retry", center.x, center.y + radius * 0.6);
}

// --- Loop ---
function loop(t) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawCircle();
  drawLock();
  drawOrb();
  drawScore();

  if (failed) {
    drawFail();
  } else if (running) {
    const dt = (t - lastTime) / 1000;
    lastTime = t;

    orbAngle += direction * speed * dt;
    orbAngle = normAngle(orbAngle);

    const dist = angularDistance(
      orbAngle - direction * speed * dt,
      lockAngle,
      direction
    );
    if (dist < speed * dt) {
      failed = true;
    }
  }

  requestAnimationFrame(loop);
}

reset();
requestAnimationFrame(loop);
