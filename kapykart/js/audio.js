// Audio hook, currently silent by design. Drop matching .mp3 files into
// /sounds (see SOUND_FILES below for the expected names) and every call
// site below starts playing automatically - no other code needs to change.
// A missing file just fails play() silently (caught below), so shipping
// with an empty /sounds folder is safe.

const SOUND_FILES = {
  join: 'sounds/join.mp3',
  start: 'sounds/start.mp3',
  boost: 'sounds/boost.mp3',
  hazard: 'sounds/hazard.mp3',
  chaosWarning: 'sounds/chaos_warning.mp3',
  chaosHit: 'sounds/chaos_hit.mp3',
  finish: 'sounds/finish.mp3',
};

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

function playOneShot(name, volume, { rateJitter = 0 } = {}) {
  const audio = new Audio(SOUND_FILES[name]);
  audio.volume = volume;
  if (rateJitter > 0) audio.playbackRate = 1 + (Math.random() * 2 - 1) * rateJitter;
  audio.play().catch(() => {}); // no file yet, or autoplay still locked - not worth surfacing
  return audio;
}

export function playJoin() {
  playOneShot('join', 0.4, { rateJitter: 0.1 });
}

export function playRaceStart() {
  playOneShot('start', 0.9);
}

export function playBoost() {
  playOneShot('boost', 0.5, { rateJitter: 0.1 });
}

export function playHazard() {
  playOneShot('hazard', 0.6, { rateJitter: 0.08 });
}

/** The couple-second window between a chaos event locking a target and the hit landing. */
export function playChaosWarning() {
  playOneShot('chaosWarning', 0.5);
}

export function playChaosHit() {
  playOneShot('chaosHit', 0.7);
}

export function playFinish() {
  playOneShot('finish', 0.8);
}
