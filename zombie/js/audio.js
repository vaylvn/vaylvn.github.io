const SOUND_FILES = {
  pulse: 'sounds/pulse.mp3',
  shoot: 'sounds/shoot.mp3',
  hit: 'sounds/hit.mp3',
  start: 'sounds/start.mp3',
  background: 'sounds/background.mp3',
  walk1: 'sounds/walk1.mp3',
  walk2: 'sounds/walk2.mp3',
  walk3: 'sounds/walk3.mp3',
};

const WALK_VARIANTS = ['walk1', 'walk2', 'walk3'];

let unlocked = false;

/**
 * Primes every sound inside a real user gesture (the streamer's Connect
 * click) so later programmatic plays - triggered asynchronously by incoming
 * Twitch chat messages, which aren't a "gesture" as far as the browser's
 * autoplay policy is concerned - aren't silently blocked.
 */
export function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  for (const src of Object.values(SOUND_FILES)) {
    const audio = new Audio(src);
    audio.volume = 0;
    audio.play().then(() => audio.pause()).catch(() => {});
  }
}

function playOneShot(name, volume, { rateJitter = 0, rate = null } = {}) {
  const audio = new Audio(SOUND_FILES[name]);
  audio.volume = volume;
  if (rate !== null) {
    audio.playbackRate = rate;
  } else if (rateJitter > 0) {
    audio.playbackRate = 1 + (Math.random() * 2 - 1) * rateJitter;
  }
  audio.play().catch(() => {}); // autoplay can still be rejected pre-unlock; not worth surfacing
  return audio;
}

/** A powerful moment, but shouldn't blow everything else out - kept well below the combat SFX. */
export function playPulse() {
  playOneShot('pulse', 0.3);
}

/** Fires per landed hit, lethal or not - a fresh Audio instance each time so overlapping shots don't cut each other off. */
export function playShoot() {
  playOneShot('shoot', 0.5, { rateJitter: 0.12 });
}

/** Same file for a non-fatal hit and the killing blow - pitched down on death so it reads as heavier/final. */
export function playHit({ fatal = false } = {}) {
  if (fatal) {
    playOneShot('hit', 0.9, { rate: 0.6 + Math.random() * 0.06 });
  } else {
    playOneShot('hit', 0.55, { rateJitter: 0.08 });
  }
}

export function playStart() {
  playOneShot('start', 0.9);
}

// --- Per-zombie shuffling loop: one walk variant, one pitch, for its whole life ---

const zombieWalkAudio = new Map(); // zombie.id -> HTMLAudioElement

export function startZombieWalk(zombie) {
  const variant = WALK_VARIANTS[Math.floor(Math.random() * WALK_VARIANTS.length)];
  const audio = new Audio(SOUND_FILES[variant]);
  audio.loop = true;
  audio.volume = 0.05 + Math.random() * 0.04; // faint, and not identical zombie to zombie
  audio.playbackRate = 1 + (Math.random() * 2 - 1) * 0.15;
  audio.play().catch(() => {});
  zombieWalkAudio.set(zombie.id, audio);
}

/** Safe to call on a zombie with no active loop (already stopped, or never started) - no-ops. */
export function stopZombieWalk(zombie) {
  const audio = zombieWalkAudio.get(zombie.id);
  if (!audio) return;
  audio.pause();
  zombieWalkAudio.delete(zombie.id);
}

/** Round end / back-to-lobby safety net - nothing should keep shuffling once the world resets. */
export function stopAllZombieWalks() {
  for (const audio of zombieWalkAudio.values()) audio.pause();
  zombieWalkAudio.clear();
}

// --- Background heartbeat: loops for the whole round, speeds up (pitch held steady) as the horde closes in ---

const DANGER_REFERENCE_PX = 500; // closest-zombie-to-braincell distance at which danger reaches 0
const MAX_RATE_BOOST = 0.35; // up to +35% tempo at max danger
const RATE_SMOOTHING = 2; // higher = snappier response to changing danger

let backgroundAudio = null;
let backgroundRate = 1;

export function startBackground() {
  if (backgroundAudio) return;
  backgroundRate = 1;
  backgroundAudio = new Audio(SOUND_FILES.background);
  backgroundAudio.loop = true;
  backgroundAudio.volume = 0.35;
  // Time-stretch, don't pitch-shift, when we speed it up for tension.
  backgroundAudio.preservesPitch = true;
  backgroundAudio.mozPreservesPitch = true;
  backgroundAudio.webkitPreservesPitch = true;
  backgroundAudio.play().catch(() => {});
}

export function stopBackground() {
  if (!backgroundAudio) return;
  backgroundAudio.pause();
  backgroundAudio = null;
}

/** Call once per tick while PLAYING - eases the loop's tempo toward how close the nearest zombie is. */
export function updateBackgroundIntensity(gameState, dt) {
  if (!backgroundAudio) return;

  let closest = Infinity;
  const { braincell } = gameState;
  for (const zombie of gameState.zombies.values()) {
    if (zombie.dying) continue;
    const dist = Math.hypot(zombie.x - braincell.x, zombie.y - braincell.y);
    if (dist < closest) closest = dist;
  }

  const danger = closest === Infinity ? 0 : Math.max(0, Math.min(1, 1 - closest / DANGER_REFERENCE_PX));
  const targetRate = 1 + danger * MAX_RATE_BOOST;
  backgroundRate += (targetRate - backgroundRate) * Math.min(1, dt * RATE_SMOOTHING);
  backgroundAudio.playbackRate = backgroundRate;
}
