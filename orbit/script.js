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
const isMobile = /Mobi|Android/i.test(navigator.userAgent);

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
const SPEED_INC = 4;
const MAX_LOCK_SIZE = 14;         // degrees (half-width)
const MIN_LOCK_SIZE = 6;
const LOCK_SHRINK_PER_HIT = 0.10;
const MIN_SPAWN_GAP = 90;         // degrees, both directions
const GAME_OVER_FLASH_MS = 2000;   // time before switching to results

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







function playSound(name, { volume = 0.3, rate = 1.0 } = {}) {

  const source = audioCtx.createBufferSource();
  const gain = audioCtx.createGain();
  source.buffer = sounds[name];
  source.playbackRate.value = rate;
  gain.gain.value = volume;
  source.connect(gain).connect(audioCtx.destination);
  source.start(0);
}

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const sounds = {};

async function loadSound(name, url) {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  sounds[name] = await audioCtx.decodeAudioData(arrayBuffer);
}

async function loadAllSounds() {
  await Promise.all([
    loadSound("point", "https://raw.githubusercontent.com/vaylvn/vaylvn.github.io/refs/heads/main/orbit/assets/point.mp3"),
	loadSound("point_check", "https://raw.githubusercontent.com/vaylvn/vaylvn.github.io/refs/heads/main/orbit/assets/point_check.mp3"),
	loadSound("fail", "https://raw.githubusercontent.com/vaylvn/vaylvn.github.io/refs/heads/main/orbit/assets/fail.mp3")
  ]);
  console.log("Sounds ready");
}











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

  playSound("fail", { volume: 0.2, rate: 1.0 });
  running = false;
  flashing = true;
  flashStart = performance.now();

  // Keep the player looking at the circle for the flash moment
  msg.textContent = "";
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

	if (score % 5 === 0) {
		const variance = Math.floor(Math.random() * 3);
		playSound("point_check", { volume: 1.0, rate: 1.0 + (0.02 * variance) });
	} else {
		const variance = Math.floor(Math.random() * 3);
		playSound("point", { volume: 1.0, rate: 1.0 + (0.05 * variance) });
	}


	

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
  ctx.strokeStyle = orbCol;
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

viewLBBtn.addEventListener("click", async () => {
	await loadLeaderboard();
	showScreen("screen-leaderboard");
});


backBtnGame.addEventListener("click", () => {
  showScreen("screen-home");
});

backBtnLB.addEventListener("click", () => {
  showScreen("screen-home");
});

document.addEventListener("pointerdown", (e) => {
  const gameScreenActive =
    document.getElementById("screen-game").classList.contains("active");
  if (!gameScreenActive) return;

  // Ignore taps on interactive UI
  if (e.target.closest("button, input, textarea, select")) {
    return;
  }

  e.preventDefault();
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


submitBtn.onclick = async () => {
  let name = nameInput.value.trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(name)) {
    alert("3 letters please");
    return;
  }

  if (isOffensiveTag(name)) {
    alert("Invalid tag");
    return;
  }

  const device = isMobile ? "mobile" : "pc";

  if (window.db) {
    const { collection, addDoc } = window.firestoreFns;

    const ref = await addDoc(
      collection(window.db, device),
      {
        name,
        score,
        ts: Date.now()
      }
    );

    localStorage.setItem("lastScoreId", ref.id);
  }

  
	await loadLeaderboard();
	showScreen("screen-leaderboard");
};

document.querySelectorAll(".device-tabs button").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".device-tabs button")
      .forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    const type = btn.dataset.type;
    document.getElementById("lbCombined").classList.toggle("hidden", type !== "combined");
    document.getElementById("lbPC").classList.toggle("hidden", type !== "pc");
    document.getElementById("lbMobile").classList.toggle("hidden", type !== "mobile");
  };
});

function isOffensiveTag(tag) {
  if (!tag) return false;
  const banned = [
    "nig", "ngr", "poc", "fag", "gay", "kkk", "cum", "sex"
  ];
  const t = tag.toLowerCase();
  return banned.includes(t);
}

async function loadLeaderboard() {
  if (!window.db) return;

  const { collection, getDocs, query, orderBy, limit } = window.firestoreFns;
  const lastId = localStorage.getItem("lastScoreId");

  const [pcSnap, mobileSnap] = await Promise.all([
    getDocs(query(collection(window.db, "pc"), orderBy("score", "desc"), limit(10))),
    getDocs(query(collection(window.db, "mobile"), orderBy("score", "desc"), limit(10)))
  ]);

  const pc = pcSnap.docs.map(d => ({ id: d.id, ...d.data(), device: "pc" }));
  const mobile = mobileSnap.docs.map(d => ({ id: d.id, ...d.data(), device: "mobile" }));

  const combined = [...pc, ...mobile]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  renderLeaderboard("lbCombined", combined, "combined", lastId);
  renderLeaderboard("lbPC", pc, "pc", lastId);
  renderLeaderboard("lbMobile", mobile, "mobile", lastId);
}


function renderLeaderboard(listId, rows, type, lastId) {
  const ul = document.getElementById(listId);
  ul.innerHTML = "";

  if (!rows.length) {
    ul.innerHTML = `
		  <li class="lb-empty">
			<span>No scores yet</span>
		  </li>
		`;

    return;
  }

  rows.forEach((r, i) => {
    const li = document.createElement("li");

    let name = r.name;

    // Emoji easter eggs
    if (name.startsWith("AGL")) name += " 🍪";
    if (name.startsWith("MEL")) name += " 🪸";
    if (name.startsWith("SWA")) name += " 🌿";

    // Mobile suffix ONLY on combined list
    if (type === "combined" && r.device === "mobile") {
      name += "ᵐ";
    }

    // Trophy for #1
    // if (i === 0) name = `🏆 ${name}`;


	li.innerHTML = `
	  <span class="lb-rank">${String(i + 1).padStart(2, "0")}.</span>
	  <span class="lb-name">${name}</span>
	  <span class="lb-score">${r.score}</span>
	`;


    if (r.id === lastId) li.classList.add("highlight");
    ul.appendChild(li);
  });
}



/* =========================
   Boot
========================= */

loadAllSounds();
showScreen("screen-home");

document.fonts?.load('16px "IBM Plex Mono"').finally(() => {
  requestAnimationFrame(step);
});
