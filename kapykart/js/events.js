import { crossedProgress } from './track.js';

/**
 * Boost pads and hazards: check whether a kart's lapProgress crossed a
 * fixed track position this tick (accounting for lap wrap), and apply the
 * matching timer. A kart that's currently frozen by spinTimer didn't move
 * this tick, so it can't cross anything new.
 */
export function applyTrackEvents(kart, track) {
  const result = { boosted: false, hazarded: false };
  if (kart.finished || kart.spinTimer > 0) return result;

  const prev = kart.prevLapProgress;
  const curr = kart.lapProgress;
  if (prev === curr) return result;

  for (const pad of track.def.boostPads) {
    if (crossedProgress(prev, curr, pad.atProgress)) {
      kart.boostTimer = pad.duration;
      kart.boostMultiplier = pad.strength;
      result.boosted = true;
    }
  }
  for (const hazard of track.def.hazards) {
    if (crossedProgress(prev, curr, hazard.atProgress)) {
      kart.spinTimer = hazard.spinDuration || 1.5;
      kart.speedCurrent = 0;
      result.hazarded = true;
    }
  }
  return result;
}

// --- Chaos event (optional "blue shell" moment) ---
// Every ~20-30s, target the current race leader; the hit lands a couple
// seconds later so a projectile indicator has time to animate toward them
// first. Cheap to build: it just reuses the same spinTimer hazards use.

const CHAOS_MIN_INTERVAL = 20;
const CHAOS_MAX_INTERVAL = 30;
const CHAOS_HIT_DELAY = 2;
const CHAOS_SPIN_DURATION = 2;

function nextChaosDelay() {
  return (CHAOS_MIN_INTERVAL + Math.random() * (CHAOS_MAX_INTERVAL - CHAOS_MIN_INTERVAL)) * 1000;
}

export function createChaosState(now) {
  return {
    nextAt: now + nextChaosDelay(),
    pending: null, // { targetId, hitAt }
  };
}

/**
 * Advances the chaos timer. Returns the id of the kart hit this tick (for
 * an audio/FX hook), or null otherwise. While `chaos.pending` is set, ui/render
 * can show a warning indicator on the targeted kart.
 */
export function updateChaosEvent(chaos, karts, now, enabled) {
  if (!enabled) return null;

  if (chaos.pending) {
    if (now >= chaos.pending.hitAt) {
      const target = karts.get(chaos.pending.targetId);
      chaos.pending = null;
      if (target && !target.finished) {
        target.spinTimer = Math.max(target.spinTimer, CHAOS_SPIN_DURATION);
        return target.id;
      }
    }
    return null;
  }

  if (now >= chaos.nextAt) {
    chaos.nextAt = now + nextChaosDelay();
    const leader = [...karts.values()]
      .filter(k => !k.finished)
      .sort((a, b) => b.totalProgress - a.totalProgress)[0];
    if (leader) {
      chaos.pending = { targetId: leader.id, hitAt: now + CHAOS_HIT_DELAY * 1000 };
    }
  }
  return null;
}
