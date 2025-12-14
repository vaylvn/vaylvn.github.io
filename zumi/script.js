/* =========================================================
   ORB TYPING PROTOTYPE (v0)
   - first-letter lock
   - mistypes ignored (flash)
   - health bar + hits
   - standard + exploder enemies
   - spawn angle spacing
   - difficulty scaling: spawn rate + word length bands
   - end screen stats
========================================================= */

let audioCtx = null;
let masterGain = null;
const audioBuffers = {};


async function loadSound(name, url) {
  const res = await fetch(url);
  const arrayBuffer = await res.arrayBuffer();
  audioBuffers[name] = await audioCtx.decodeAudioData(arrayBuffer);
}

async function loadGameSounds() {
  await Promise.all([
    loadSound("click", "assets/sounds/click.mp3"),
    loadSound("hit",   "assets/sounds/hit.mp3"),
    loadSound("miss",  "assets/sounds/miss.mp3"),
    loadSound("tnt",   "assets/sounds/tnt.mp3"),
  ]);
}


function initAudio() {
  if (audioCtx) return;

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.8; // global volume
  masterGain.connect(audioCtx.destination);
  
  loadGameSounds();

}

window.addEventListener("keydown", (e) => {
  initAudio();
  // existing logic continues…
});

function playSound(name, volume = 1.0, pitchJitter = 0) {
  if (!audioCtx) return;

  const buffer = audioBuffers[name];
  if (!buffer) return;

  const src = audioCtx.createBufferSource();
  const gain = audioCtx.createGain();

  src.buffer = buffer;

  if (pitchJitter !== 0) {
    src.playbackRate.value = 1 + (Math.random() * 2 - 1) * pitchJitter;
  }

  gain.gain.value = volume;

  src.connect(gain);
  gain.connect(masterGain);

  src.start();
}







const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

let W = 0, H = 0, dpr = 1;
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  W = Math.floor(window.innerWidth);
  H = Math.floor(window.innerHeight);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

/* ---------- tuning ---------- */
const COLORS = {
  bg: "#1B1B1B",
  ui: "#EAEAEA",
  uiDim: "#a8a8a8",
  text: "#7a7a7a",
  typed: "#A3D900",
  miss: "#e34b4b",
  player: "#F5C542",
  enemy: "#d8d8d8",
  exploder: "#e34b4b",
};

const PLAYER_RADIUS = 16;
const ENEMY_RADIUS_BASE = 14;
const ENEMY_RADIUS_JITTER = 3;

const SPAWN_RING_PAD = 20;
const SAFE_RADIUS = PLAYER_RADIUS + 8;

const ENEMY_SPEED_BASE = 55;     // px/sec at start
const ENEMY_SPEED_RAMP = 18;     // additional px/sec by late game

const SPAWN_START = 2.4;         // seconds
const SPAWN_MIN = 1.0;           // seconds at high pressure
const SPAWN_RAMP_TIME = 120;     // seconds to reach near min

const EXPLODER_CHANCE_BASE = 0.10;
const EXPLODER_CHANCE_MAX = 0.22;

const HIT_DAMAGE_STANDARD = 10;
const HIT_DAMAGE_EXPLODER = 35;

const EXPLODER_BLAST_RADIUS = 115; // px
const EXPLODER_BLAST_FADE = 0.22;  // seconds blast ring visible

const LOCK_FADE_ALPHA = 0.55;

const VIGNETTE_RADIUS = 250;   // clear center radius
const VIGNETTE_FEATHER = 250;  // softness of edge

const FONT = '600 20px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
const FONT_SMALL = '500 14px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

/* ---------- word lists (lowercase, no punctuation) ---------- */
const WORDS_SHORT = [
  "act","aim","air","ash","ask","awe","ball","band","bare","beam","bend","bite","blue","blur","bold","bond",
  "bowl","brave","bread","brick","bring","calm","catch","chain","chill","clean","clear","climb","clock",
  "cloud","coast","craft","crisp","cross","crowd","curve","dark","dash","dawn","deep","drift","drive","dust",
  "echo","edge","ember","empty","faith","fast","field","firm","flare","float","focus","force","frame","fresh",
  "glide","grain","grasp","green","grind","group","guard","habit","hands","heart","heavy","hollow","honest",
  "humor","ideal","inner","input","joint","judge","knife","knock","label","laser","light","limit","local",
  "logic","loose","loud","march","match","metal","minor","model","motion","mount","nerve","night","noise",
  "north","ocean","order","panel","pause","phase","plane","point","power","press","price","pride","prime",
  "quiet","range","reach","react","ready","right","rough","round","scale","scene","scope","sharp","shift",
  "shore","short","signal","skill","sleep","solid","sound","space","spark","speed","spine","split","stand",
  "steady","stone","storm","style","swing","table","tempo","thick","think","tight","trace","track","trust",
  "union","upper","value","vapor","vivid","voice","waste","watch","water","wheel","width","world","yield",
  "zone", "alert","angle","arena","basis","bench","block","boost","burst","buyer","carry","cause","chart",
  "chief", "civil","class","claim","coach","count","cover","cream","crime","crow","cycle","delay","depth",
  "devil","draft","dream","drink","eager","elite","enemy","equal","error","event","exact","exist","extra",
  "fever", "flash","fleet","floor","fruit","giant","glory","gross","guide","haste","honor","image","index",
  "issue", "ivory","jolly","known","layer","learn","level","lucky","magic","major","maker","moral","music",
  "noble", "offer","orbit","peace","pilot","pitch","proud","quick","radio","ratio","rival","river","royal",
  "rural", "score","sense","serve","shade","shape","share","sheer","slice","small","smart","smile","smoke",
  "solid", "south","spare","spike","stack","steam","stick","sugar","sweep","sword","theme","tower","train",
  "treat", "unity","urban","video","vital","widen","woman","young"
];

const WORDS_MED = [
  "ability","absence","account","advance","advice","analyze","anxiety","arrival","attempt","balance",
  "barrier","benefit","between","capture","careful","central","clarity","comfort","command","commitment",
  "compare","complex","concept","control","convince","correct","courage","culture","curious","decision",
  "defense","deliver","density","deserve","detail","develop","digital","direction","discipline","distance",
  "dynamic","effort","element","emotion","endurance","engage","enhance","essence","example","explore",
  "exposure","failure","feature","feeling","fitness","flexible","focus","freedom","function","general",
  "gesture","gravity","habitual","hesitate","identity","improve","include","influence","insight","intense",
  "interest","journey","justify","language","learning","liberty","logical","maintain","measure","meaning",
  "memory","method","momentum","movement","natural","observe","opinion","optional","outcome","overcome",
  "pattern","patience","perform","physical","practice","presence","process","progress","purpose","quality",
  "reaction","recovery","reflect","regular","release","respect","response","restore","rhythm","security",
  "sequence","serious","silence","similar","stability","strategy","strength","structure","support","sustain",
  "tension","thought","tolerate","training","transfer","trigger","understand","utility","variation",
  "velocity","version","visible","willing",
  "accuracy","addition","adjustment","advantage","awareness","behavior","capacity","challenge","connection",
  "consensus","consistency","constraint","continuity","contrast","coordination","creativity","credibility",
  "curiosity","definition","efficiency","engagement","evaluation","expression","foundation","generation",
  "guidance","imagination","impression","initiative","innovation","interaction","interpret","knowledge",
  "leadership","limitation","motivation","navigation","observation","orientation","perception","precision",
  "preference","preparation","proportion","reflection","reliability","resolution","responsibility",
  "satisfaction","selection","sensitivity","simplicity","speculation","synchrony","transition","validation",
  "visibility","vocabulary"
];

const WORDS_LONG = [
  "acknowledgement","adaptability","administration","approximation","characteristic","communication",
  "concentration","configuration","consideration","contradiction","coordination","determination",
  "disproportionate","distinguishable","effectiveness","environmental","establishment","functionality",
  "identification","implementation","incompatibility","independently","indistinguishable","interpretation",
  "investigation","miscommunication","misinterpretation","modification","multiplication","neighborhood",
  "nonessential","observation","organization","overwhelmingness","participation","performance","possibility",
  "predictability","presentation","prioritization","probability","productivity","professionalism",
  "psychological","qualification","reconstruction","relationship","responsiveness","satisfaction",
  "selfcontrol","significant","simplification","specialization","synchronisation","transformation",
  "understanding","unpredictability","verification","visualization","vulnerability",
  "accountability","acknowledgeable","administrative","appropriation","characterization","communication",
  "consciousness","considerable","contextualization","coordination","demonstration","discrimination",
  "effectiveness","emotionality","environmentalist","experimentation","implementation","independent",
  "infrastructure","institutional","intellectual","intercontinental","interpretative","misunderstanding",
  "multipurpose","neuroplasticity","nonnegotiable","organizational","overrepresentation","participatory",
  "philosophical","predictiveness","professionalism","proportionality","reconciliation","reliability",
  "representation","responsibility","selfawareness","standardization","subconsciousness","sustainability",
  "theoretical","transitional","uncharacteristic","unintentional","universality","visualisation"
];















let lastWordWasLong = false;




// Ensure first letters are mostly diverse early; later we accept repeats but we try to avoid collisions at spawn.
function pickWord(elapsedSec) {
  // Very slow progression. Let spawn pressure do the killing.
  // Prevent back-to-back long words early to allow recovery.

  let pool;
  const r = Math.random();

  if (elapsedSec < 30) {
    // First 30s: only short
    pool = WORDS_SHORT;
  }
  else if (elapsedSec < 90) {
    // 30s–1:30: mostly short, rare medium
    pool = (r < 0.85) ? WORDS_SHORT : WORDS_MED;
  }
  else if (elapsedSec < 180) {
    // 1:30–3:00: short + medium, very rare long
    if (r < 0.60) pool = WORDS_SHORT;
    else if (r < 0.95) pool = WORDS_MED;
    else pool = WORDS_LONG;
  }
  else {
    // 3:00+: medium dominant, occasional long
    if (r < 0.55) pool = WORDS_MED;
    else if (r < 0.80) pool = WORDS_SHORT;
    else pool = WORDS_LONG;
  }

  // Recovery guard: no consecutive long words until late game
  if (pool === WORDS_LONG && lastWordWasLong && elapsedSec < 240) {
    pool = WORDS_MED;
  }

  const word = pool[Math.floor(Math.random() * pool.length)];

  lastWordWasLong = (pool === WORDS_LONG);
  return word;
}



/* ---------- game state ---------- */
const state = {
  running: true,
  ended: false,

	
	
	

  alive_duration: 0,
  average_wpm: 0,
  accuracy: 0,
	

  // player
  hp: 100,
  hpMax: 100,

  // enemies
  enemies: [],
  lockId: null,

  // effects
  missFlashT: 0,
  hitFlashT: 0,
  blastRings: [], // {x,y,r,t}

  // timing
  startMs: performance.now(),
  lastMs: performance.now(),
  spawnTimer: 0,

  // spawn angles
  angleBucketIdx: 0,
  angleBuckets: [],

  // stats
  totalKeys: 0,
  correctKeys: 0,
  kills: 0,
  peakWpm: 0,
  wpmSamples: [], // [{t, wpm}]
};

function reset() {
  state.running = true;
  state.ended = false;
  state.hp = state.hpMax;
  state.enemies = [];
  state.lockId = null;
  state.missFlashT = 0;
  state.hitFlashT = 0;
  state.blastRings = [];
  state.startMs = performance.now();
  state.lastMs = performance.now();
  state.spawnTimer = 0;

  // angle spacing: buckets around circle, shuffled order
  buildAngleBuckets();

  state.totalKeys = 0;
  state.correctKeys = 0;
  state.kills = 0;
  state.peakWpm = 0;
  state.wpmSamples = [];
}

function buildAngleBuckets() {
  // More buckets = better spacing.
  // We don't want “same location spam”.
  const bucketCount = 18; // tweakable
  const buckets = Array.from({ length: bucketCount }, (_, i) => i);

  // Fisher-Yates shuffle
  for (let i = buckets.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [buckets[i], buckets[j]] = [buckets[j], buckets[i]];
  }

  state.angleBuckets = buckets;
  state.angleBucketIdx = 0;
}

/* ---------- enemy helpers ---------- */
let nextEnemyId = 1;

function spawnEnemy() {
  const now = performance.now();
  const elapsedSec = (now - state.startMs) / 1000;

  // probability of exploder increases slowly with time
  const pr = Math.min(1, elapsedSec / 140);
  const explChance = EXPLODER_CHANCE_BASE + (EXPLODER_CHANCE_MAX - EXPLODER_CHANCE_BASE) * pr;
  const isExploder = Math.random() < explChance;

  // choose angle bucket with spacing, avoiding word overlap clustering
  const bucketCount = state.angleBuckets.length;
  if (bucketCount === 0) buildAngleBuckets();

  const bucket = state.angleBuckets[state.angleBucketIdx % bucketCount];
  state.angleBucketIdx++;

  // bucket angle plus jitter
  const baseAngle = (bucket / bucketCount) * Math.PI * 2;
  const angle = baseAngle + (Math.random() * 0.22 - 0.11);

  const cx = W / 2;
  const cy = H / 2;
  const ringR = Math.min(W, H) / 2 - SPAWN_RING_PAD;

  const x = cx + Math.cos(angle) * ringR;
  const y = cy + Math.sin(angle) * ringR;

  // word picking, avoid first-letter collision with active enemies when possible
  let word = pickWord(elapsedSec);
  const usedFirst = new Set(state.enemies.map(e => e.word[0]));
  let guard = 0;
  while (usedFirst.has(word[0]) && guard < 30) {
    word = pickWord(elapsedSec);
    guard++;
  }

  const radius = ENEMY_RADIUS_BASE + (Math.random() * 2 - 1) * ENEMY_RADIUS_JITTER;

  // speed increases with time
  const speed = ENEMY_SPEED_BASE + ENEMY_SPEED_RAMP * Math.min(1, elapsedSec / 140);

  state.enemies.push({
    id: nextEnemyId++,
    x, y,
    radius,
    speed,
    word,
    progress: 0,
    exploder: isExploder,
    // for exploder pulse visuals
    pulsePhase: Math.random() * Math.PI * 2,
  });
}

function getLockedEnemy() {
  if (state.lockId == null) return null;
  return state.enemies.find(e => e.id === state.lockId) || null;
}

function killEnemy(enemy, opts = { score: true, collateral: false }) {
  // exploder killed by typing → big ring + collateral
  if (enemy.exploder && !opts.collateral) {
    state.blastRings.push({
      x: enemy.x,
      y: enemy.y,
      r: EXPLODER_BLAST_RADIUS,
      t: EXPLODER_BLAST_FADE
    });

    // collateral kills in radius (no score)
    const r2 = EXPLODER_BLAST_RADIUS * EXPLODER_BLAST_RADIUS;
    for (const other of state.enemies) {
      if (other.id === enemy.id) continue;
      const dx = other.x - enemy.x;
      const dy = other.y - enemy.y;
      if (dx * dx + dy * dy <= r2) {
        other._dead = true;
      }
    }
  }

  // normal enemy killed by typing → small confirmation ring
  if (!enemy.exploder && !opts.collateral) {
    state.blastRings.push({
      x: enemy.x,
      y: enemy.y,
      r: enemy.radius + 14,
      t: 0.18
    });
  }

  if (opts.score) state.kills++;

  if (state.lockId === enemy.id) state.lockId = null;
  enemy._dead = true;
}


/* ---------- input ---------- */
window.addEventListener("keydown", (e) => {
  if (e.repeat) return;

  if (!state.running) {
    if (e.key === "Enter") reset();
    return;
  }
  
  if (e.key === "Escape") {
	  state.lockId = null;
	  return;
	}


  // ignore non-printable keys
  if (e.key.length !== 1) return;

  const key = e.key.toLowerCase();
  state.totalKeys++;

  const locked = getLockedEnemy();

  // If locked: only accept the next correct char for that enemy.
  if (locked) {
    const expected = locked.word[locked.progress];
    if (key === expected) {
      locked.progress++;
      state.correctKeys++;
      if (locked.progress >= locked.word.length) {
        killEnemy(locked, { score: true, collateral: false });
      }
	  
	  playSound("click", 0.05, 0.03);
	  
      return;
    } else {
      // mistype ignored, flash
	  
	  playSound("miss", 0.25, 0.03);

      state.missFlashT = 0.08;
      return;
    }
  }

  // Not locked: allow selecting any enemy by its first letter.
  // If multiple share the first letter, pick the nearest-to-center (most urgent).
  const candidates = state.enemies.filter(en => en.word[0] === key);
  if (candidates.length === 0) {
    // state.missFlashT = 0.08;
    return;
  }

  const cx = W / 2, cy = H / 2;
  candidates.sort((a, b) => {
    const da = (a.x - cx) ** 2 + (a.y - cy) ** 2;
    const db = (b.x - cx) ** 2 + (b.y - cy) ** 2;
    return da - db;
  });

  const target = candidates[0];
  // first letter counts as correct (progress becomes 1)
  state.lockId = target.id;
  target.progress = 1;
  state.correctKeys++;
});

/* ---------- update loop ---------- */
function spawnInterval(elapsedSec) {
  // Smoothly move from start interval toward min interval over SPAWN_RAMP_TIME
  const k = Math.min(1, elapsedSec / SPAWN_RAMP_TIME);
  return SPAWN_START + (SPAWN_MIN - SPAWN_START) * k;
}

function update(dt) {
  const now = performance.now();
  const elapsedSec = (now - state.startMs) / 1000;

  // spawn logic
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    spawnEnemy();
    state.spawnTimer = spawnInterval(elapsedSec);
  }

  // move enemies inward
  const cx = W / 2, cy = H / 2;
  for (const e of state.enemies) {
    const dx = cx - e.x;
    const dy = cy - e.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const vx = (dx / dist) * e.speed;
    const vy = (dy / dist) * e.speed;
    e.x += vx * dt;
    e.y += vy * dt;

    // exploder pulse phase
    if (e.exploder) e.pulsePhase += dt * 2.0;

    // collision with player
    if (dist <= SAFE_RADIUS + e.radius) {
      // apply damage, remove enemy
      if (e.exploder) {
        state.hp -= HIT_DAMAGE_EXPLODER;
      } else {
        state.hp -= HIT_DAMAGE_STANDARD;
      }
      e._dead = true;

      // unlock if it was locked
      if (state.lockId === e.id) state.lockId = null;

      // UI shake (simple: set missFlash and also add a brief bar shake timer)
      state.hitFlashT = Math.max(state.hitFlashT, 0.10);

      if (state.hp <= 0) {
        state.hp = 0;
		playSound("death", 0.5);

        endRun();
        return;
      } else {
		  playSound("hit", 0.2);
	  }
    }
  }

  // cleanup dead enemies
  if (state.enemies.some(x => x._dead)) {
    state.enemies = state.enemies.filter(x => !x._dead);
  }

  // blast rings fade
  for (const b of state.blastRings) b.t -= dt;
  state.blastRings = state.blastRings.filter(b => b.t > 0);

  // miss flash timer
  state.missFlashT = Math.max(0, state.missFlashT - dt);
  state.hitFlashT = Math.max(0, state.hitFlashT - dt);

  // WPM sampling (for peak + future graph)
  // Sample every ~1.5s
  if (state.wpmSamples.length === 0 || (elapsedSec - state.wpmSamples[state.wpmSamples.length - 1].t) >= 1.5) {
    const mins = Math.max(1e-6, elapsedSec / 60);
    const wpm = (state.correctKeys / 5) / mins;
    state.peakWpm = Math.max(state.peakWpm, wpm);
    state.wpmSamples.push({ t: elapsedSec, wpm });
  }
}

function endRun() {
  state.running = false;
  state.ended = true;
  
  
  state.alive_duration = (performance.now() - state.startMs) / 1000;
  const mins = Math.max(1e-6, state.alive_duration / 60);
  state.average_wpm = (state.correctKeys / 5) / mins;
  state.accuracy = state.totalKeys ? (state.correctKeys / state.totalKeys) * 100 : 0;
	
  

  
  
}

/* ---------- rendering ---------- */
function draw() {
  // background
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2, cy = H / 2;
  const now = performance.now();
  const elapsedSec = (now - state.startMs) / 1000;



  // center player orb
  ctx.beginPath();
  ctx.fillStyle = COLORS.player;
  ctx.arc(cx, cy, PLAYER_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  // blast rings
// blast rings
	for (const b of state.blastRings) {
	  const a = Math.min(1, b.t / EXPLODER_BLAST_FADE);

	  ctx.globalAlpha = a;

	  // exploder rings are larger → red
	  ctx.strokeStyle = (b.r >= EXPLODER_BLAST_RADIUS * 0.9)
		? COLORS.exploder
		: COLORS.ui;

	  ctx.lineWidth = (b.r >= EXPLODER_BLAST_RADIUS * 0.9) ? 3 : 2;

	  ctx.beginPath();
	  ctx.arc(b.x, b.y, b.r * (1.0 - 0.12 * (1 - a)), 0, Math.PI * 2);
	  ctx.stroke();

	  ctx.globalAlpha = 1;
	}


  // enemies + words
  const locked = getLockedEnemy();
  for (const e of state.enemies) {
    const isLocked = locked && locked.id === e.id;

    // fade non-locked enemies if locked
    if (locked && !isLocked) ctx.globalAlpha = LOCK_FADE_ALPHA;

    // orb color
    if (e.exploder) {
      ctx.fillStyle = COLORS.exploder;

      // pulse overlay: faster as it gets closer
      const dist = Math.hypot(cx - e.x, cy - e.y);
      const closeness = 1 - Math.min(1, dist / (Math.min(W, H) / 2));
      const pulseSpeed = 2 + closeness * 10;
      const pulse = (Math.sin(e.pulsePhase * pulseSpeed) + 1) / 2; // 0..1
      // draw base
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
      ctx.fill();
      // pulse ring
      ctx.globalAlpha *= (0.25 + pulse * 0.40);
      ctx.strokeStyle = COLORS.ui;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius + 3 + pulse * 3, 0, Math.PI * 2);
      ctx.stroke();
      // restore alpha for text below
      ctx.globalAlpha = locked && !isLocked ? LOCK_FADE_ALPHA : 1;
    } else {
      ctx.fillStyle = COLORS.enemy;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // word text above orb
    ctx.font = FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";

    const word = e.word;

    // typed portion color on locked target
    if (isLocked) {
      // draw per-char for coloring
      // measure full word width by summing char widths (monospace so we can cheap it)
      // We'll still use measureText for safety.
      const fullW = ctx.measureText(word).width;
      let startX = e.x - fullW / 2;
      const y = e.y - e.radius - 8;

      for (let i = 0; i < word.length; i++) {
        const ch = word[i];
        const w = ctx.measureText(ch).width;
		
		if (state.missFlashT > 0) {
			ctx.fillStyle = "#E34B4B";
		} else {
			ctx.fillStyle = (i < e.progress) ? COLORS.typed : COLORS.text;
		}
		
        
        ctx.fillText(ch, startX + w / 2, y);
        startX += w;
      }
    } else {
      ctx.fillStyle = COLORS.text;
      ctx.fillText(word, e.x, e.y - e.radius - 8);
    }

    ctx.globalAlpha = 1;
  }

  // subtle miss flash at bottom (tiny)
  if (state.missFlashT > 0) {
    ctx.globalAlpha = Math.min(1, state.missFlashT / 0.08);
    ctx.fillStyle = COLORS.miss;
    ctx.fillRect(0, H - 2, W, 2);
    ctx.globalAlpha = 1;
  }

	
	const hpFrac = state.hp / state.hpMax;


		// static center reveal overlay

		// static center visibility mask
		// static center visibility mask (hide outside, keep center visible)
// static vignette overlay (dark outside, clear center)
		ctx.save();
		
		

		const r0 = VIGNETTE_RADIUS;
		const r1 = VIGNETTE_RADIUS + VIGNETTE_FEATHER;
		
		

		// radial alpha mask: transparent center → opaque outside
		const grad = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
		grad.addColorStop(0, "rgba(27,27,27,0)"); // fully clear center
		grad.addColorStop(1, "rgba(27,27,27,1)"); // solid dark outside

		ctx.fillStyle = grad;
		ctx.fillRect(0, 0, W, H);

		ctx.restore();




			
  // health bar (simple, top centered)
  const barW = Math.min(520, W * 0.65);
  const barH = 10;
  const barX = (W - barW) / 2;
  const barY = 26;

  // shake health bar on hits (reuse missFlashT)
  let shakeX = 0, shakeY = 0;
  
  
  if (state.hitFlashT > 0.001) {
    const s = 2.5 * (state.hitFlashT / 0.10);
    shakeX = (Math.random() * 2 - 1) * s;
    shakeY = (Math.random() * 2 - 1) * s;
	
  }

  ctx.fillStyle = "#2a2a2a";
  ctx.fillRect(barX + shakeX, barY + shakeY, barW, barH);

  ctx.fillStyle = (state.hitFlashT > 0.001) ? "#f03c3c" : COLORS.ui;
  ctx.fillRect(barX + shakeX, barY + shakeY, barW * hpFrac, barH);


  // end screen
  if (!state.running && state.ended) {
    const t = state.alive_duration;
    const mins = Math.max(1e-6, t / 60);
    const avgWpm = state.average_wpm;
    const acc = state.accuracy;
	
	
	

    ctx.fillStyle = "rgba(0,0,0,0.9)";
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.fillStyle = COLORS.miss;
    ctx.font = '700 28px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
    ctx.fillText("terminated", W / 2, H * 0.34);

    ctx.fillStyle = COLORS.ui;
    ctx.font = '600 16px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

    const lines = [
      `time survived: ${formatTime(t)}`,
      `kills: ${state.kills}`,
      `avg wpm: ${avgWpm.toFixed(1)}`,
      `peak wpm: ${state.peakWpm.toFixed(1)}`,
      `accuracy: ${acc.toFixed(1)}%`,
    ];

    const startY = H * 0.44;
    const gap = 24;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], W / 2, startY + i * gap);
    }

    ctx.fillStyle = COLORS.uiDim;
    ctx.font = FONT_SMALL;
    ctx.fillText("press enter to restart", W / 2, H * 0.66);
  }

  // tiny debug-ish hint (optional): comment out later
  // ctx.fillStyle = COLORS.uiDim;
  // ctx.font = FONT_SMALL;
  // ctx.textAlign = "left";
  // ctx.textBaseline = "top";
  // ctx.fillText(`enemies: ${state.enemies.length}`, 12, 12);
}

function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/* ---------- main loop ---------- */
function frame(now) {
  const dt = Math.min(0.05, (now - state.lastMs) / 1000);
  state.lastMs = now;

  if (state.running) update(dt);
  draw();
  requestAnimationFrame(frame);
}

reset();
requestAnimationFrame(frame);
