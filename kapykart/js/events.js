// Fallback when a hazard entry (authored in track-editor.html) doesn't
// specify its own spinDuration - see kart.js's updateKart for how this
// duration drives the sine-curve slowdown.
const HAZARD_DEFAULT_SLOWDOWN_DURATION = 0.9;

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
      kart.spinDuration = hazard.spinDuration || HAZARD_DEFAULT_SLOWDOWN_DURATION;
      kart.spinTimer = kart.spinDuration;
      kart.spinElapsed = 0;
      result.hazarded = true;
    }
    if (inside) kart.insideHazardIds.add(i); else kart.insideHazardIds.delete(i);
  }
  return result;
}
