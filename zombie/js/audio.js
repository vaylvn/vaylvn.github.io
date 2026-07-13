const SOUND_FILES = {
  pulse: 'sounds/pulse.mp3',
  shoot: 'sounds/shoot.mp3',
  death: 'sounds/death.mp3',
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

function playOneShot(name, volume, rateJitter = 0) {
  const audio = new Audio(SOUND_FILES[name]);
  audio.volume = volume;
  if (rateJitter > 0) {
    audio.playbackRate = 1 + (Math.random() * 2 - 1) * rateJitter;
  }
  audio.play().catch(() => {}); // autoplay can still be rejected pre-unlock; not worth surfacing
}

export function playPulse() {
  playOneShot('pulse', 0.8);
}

/** Fires per landed hit, lethal or not - a fresh Audio instance each time so overlapping shots don't cut each other off. */
export function playShoot() {
  playOneShot('shoot', 0.5, 0.12);
}

export function playDeath() {
  playOneShot('death', 0.9);
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
