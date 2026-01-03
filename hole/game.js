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
const LOCK_SIZE = 8; // degrees (half-width)
const MAX_LOCK_SIZE = 14; // degrees (half-width)
const MIN_LOCK_SIZE = 6;
const LOCK_SHRINK_PER_HIT = 0.25; // tweakable
const MIN_FORWARD_GAP = 90;
const MIN_SPAWN_GAP = 90; // degrees, both directions


// --- State ---
let center, radius;
let orbAngle, lockAngle;
let direction, speed;
let score;
let running = false;
let lastTime = 0;
let failed = false;
let insideLock = false;
let lockSize;


// --- Helpers ---
const degToRad = d => d * Math.PI / 180;
const normAngle = a => (a + 360) % 360;

// shortest angular distance
function angleDiff(a, b) {
  let d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// distance forward only (for spawn logic)
function angularDistance(from, to, dir) {
  let d = normAngle(to - from);
  return dir === 1 ? d : normAngle(360 - d);
}

function spawnLock() {
  while (true) {
    const a = Math.random() * 360;
    const dist = angleDiff(a, orbAngle);

    if (dist >= MIN_SPAWN_GAP) {
      lockAngle = a;
      return;
    }
  }
}


function reset() {
  center = { x: canvas.width / 2, y: canvas.height / 2 };
  radius = Math.min(canvas.width, canvas.height) * 0.3;

  lockSize = MAX_LOCK_SIZE;
  orbAngle = -90;
  direction = 1;
  speed = START_SPEED;
  score = 0;
  failed = false;
  insideLock = false;

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

  const dist = angleDiff(orbAngle, lockAngle);



	if (dist <= lockSize) {
	  direction *= -1;
	  speed += SPEED_INC;
	  score++;

	  lockSize = Math.max(
		MIN_LOCK_SIZE,
		lockSize - LOCK_SHRINK_PER_HIT
	  );

	  insideLock = false;
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
    degToRad(lockAngle - lockSize),
    degToRad(lockAngle + lockSize)
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

    orbAngle = normAngle(orbAngle + direction * speed * dt);

    const dist = angleDiff(orbAngle, lockAngle);

    if (dist <= lockSize) {
      insideLock = true;
    } else if (insideLock) {
      failed = true; // exited lock without input
    }
  }

  requestAnimationFrame(loop);
}

reset();
requestAnimationFrame(loop);
