/**
 * Boost pads and hazards: world-position + radius zones (see track.js -
 * they're meant to line up with features drawn into a background image,
 * not an abstract path position). Triggers on the rising edge (entering the
 * zone), tracked per kart via insideBoostIds/insideHazardIds, so parking
 * inside one doesn't re-trigger every tick.
 */
export function applyTrackEvents(kart, track) {
  const result = { boosted: false, hazarded: false };
  if (kart.finished) return result;

  const { boostPads, hazards } = track.def;
  for (let i = 0; i < boostPads.length; i++) {
    const pad = boostPads[i];
    const inside = Math.hypot(kart.worldPos.x - pad.x, kart.worldPos.y - pad.y) <= pad.radius;
    if (inside && !kart.insideBoostIds.has(i)) {
      kart.boostTimer = pad.duration;
      kart.boostMultiplier = pad.strength;
      result.boosted = true;
    }
    if (inside) kart.insideBoostIds.add(i); else kart.insideBoostIds.delete(i);
  }
  for (let i = 0; i < hazards.length; i++) {
    const hazard = hazards[i];
    const inside = Math.hypot(kart.worldPos.x - hazard.x, kart.worldPos.y - hazard.y) <= hazard.radius;
    if (inside && !kart.insideHazardIds.has(i)) {
      kart.spinTimer = hazard.spinDuration || 1.5;
      kart.speedCurrent = 0;
      result.hazarded = true;
    }
    if (inside) kart.insideHazardIds.add(i); else kart.insideHazardIds.delete(i);
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
