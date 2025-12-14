const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

let W, H, dpr;
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

/* ---------- tuning ---------- */
const CURSOR_X = 0.5;           // center
const LANE_Y = 0.5;
const LANE_H = 90;

const BASE_FILL = 0.006;        // red fill per second
const MISTAKE_JUMP = 0.06;
const PUSHBACK = 0.12;
const PUSHBACK_COOLDOWN = 0.25;

const BUFFER_LEN = 420;
const FADE_ZONE = 0.18;         // left/right fade %

/* ---------- text source ---------- */
const WORDS = [
  "focus","control","discipline","pressure","silence","steady",
  "attention","clarity","breath","margin","habit","flow","resist",
  "endurance","tempo","continuity","presence","composure"
];

function nextChar() {
  if (Math.random() < 0.16) return " ";
  return WORDS[Math.floor(Math.random()*WORDS.length)][
    Math.floor(Math.random()*5)
  ] || "a";
}

/* ---------- state ---------- */
let buffer = "";
while (buffer.length < BUFFER_LEN) buffer += nextChar();

let cursorIndex = Math.floor(BUFFER_LEN / 2);
let redFill = 0;
let charge = 3;

let lastMistake = 0;
let escCooldown = 0;
let alive = true;

/* ---------- input ---------- */
window.addEventListener("keydown", e => {
  if (!alive && e.key === "Enter") reset();

  if (!alive) return;

  if (e.key === "Escape") {
    if (charge > 0 && escCooldown <= 0) {
      charge--;
      redFill = Math.max(0, redFill - PUSHBACK);
      escCooldown = PUSHBACK_COOLDOWN;
    }
    e.preventDefault();
    return;
  }

  if (e.key.length !== 1) return;

  const expected = buffer[cursorIndex];
  if (e.key === expected) {
    buffer = buffer.slice(1) + nextChar();
  } else {
    redFill += MISTAKE_JUMP;
    lastMistake = performance.now();
  }
});

/* ---------- render helpers ---------- */
function fadeAlpha(x) {
  const t = x / W;
  if (t < FADE_ZONE) return t / FADE_ZONE;
  if (t > 1 - FADE_ZONE) return (1 - t) / FADE_ZONE;
  return 1;
}

/* ---------- main loop ---------- */
let last = performance.now();
function loop(now) {
  const dt = (now - last) / 1000;
  last = now;

  if (alive) {
    redFill += BASE_FILL * dt;
    escCooldown = Math.max(0, escCooldown - dt);
    if (redFill >= 1) alive = false;
  }

  draw();
  requestAnimationFrame(loop);
}

function draw() {
  ctx.clearRect(0, 0, W, H);

  const laneY = H * LANE_Y;
  const laneX = W * 0.1;
  const laneW = W * 0.8;

  /* lane */
  ctx.fillStyle = "#2a2a2a";
  ctx.fillRect(laneX, laneY - LANE_H/2, laneW, LANE_H);

  /* text */
  ctx.font = "20px system-ui";
  ctx.textBaseline = "middle";

  let x = laneX + 16;
  for (let i = 0; i < buffer.length; i++) {
    const a = fadeAlpha(x);
    if (a <= 0) { x += 10; continue; }

    ctx.globalAlpha = a;
    ctx.fillStyle = "#9a9a9a";
    ctx.fillText(buffer[i], x, laneY);
    x += ctx.measureText(buffer[i]).width;
  }
  ctx.globalAlpha = 1;

  /* cursor */
  const cx = W * CURSOR_X;
  ctx.strokeStyle = "#f2d54a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, laneY - LANE_H/2);
  ctx.lineTo(cx, laneY + LANE_H/2);
  ctx.stroke();

  /* red pressure line */
  ctx.fillStyle = "#e34b4b";
  ctx.fillRect(laneX, laneY + LANE_H/2 + 6, laneW * redFill, 2);

  if (!alive) {
    ctx.fillStyle = "#e34b4b";
    ctx.font = "600 22px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("terminated", W/2, laneY - 70);
    ctx.textAlign = "left";
  }
}

function reset() {
  buffer = "";
  while (buffer.length < BUFFER_LEN) buffer += nextChar();
  redFill = 0;
  charge = 3;
  alive = true;
}

requestAnimationFrame(loop);
