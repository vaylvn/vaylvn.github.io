import { sampleTrack } from './track.js';
import { KART_PALETTE } from './palette.js';

let joinCounter = 0;

const LAP_SECONDS = 22; // roughly how long a lap takes at base speed - tune the whole race's pace from here
const SPEED_VARIANCE = 0.12; // +/- fraction of base speed, randomized per kart
// Drift strength scales with maxOffset (not a fixed constant) so the weave
// stays visible regardless of track width. Picked so a kart's lateral target
// typically reaches close to the lane bound within ~10-15s (half a lap or
// so) rather than a fixed number that only weaved a few px out of ~26 max.
const DRIFT_STRENGTH_FACTOR = 8; // world units/sec^2 per world unit of maxOffset
const LATERAL_SMOOTHING = 1.2; // per-second ease rate toward lateralTarget
const LANE_BOUND_FRACTION = 0.6; // how much of the half-track-width the weave is allowed to use

const GRID_LANES = 9; // evenly spaced starting slots across the track width; wraps (with jitter) past this

export function createKart(id, name, track) {
  const gridSlot = joinCounter;
  const color = KART_PALETTE[joinCounter % KART_PALETTE.length];
  joinCounter++;
  const baseSpeed = track.length / LAP_SECONDS;

  // Line karts up side-by-side on the starting grid rather than stacked at (0,0).
  // Slots wrap around after GRID_LANES with a small jitter so repeats don't land pixel-identical.
  const maxOffset = track.def.width * 0.5 * LANE_BOUND_FRACTION;
  const laneIndex = gridSlot % GRID_LANES;
  const wrapPass = Math.floor(gridSlot / GRID_LANES);
  const laneFraction = GRID_LANES > 1 ? laneIndex / (GRID_LANES - 1) : 0.5;
  const jitter = ((wrapPass % 3) - 1) * 4;
  const lateralOffset = Math.max(-maxOffset, Math.min(maxOffset,
    -maxOffset + laneFraction * (2 * maxOffset) + jitter));
  const startCenter = sampleTrack(track, 0);
  const perpX = -Math.sin(startCenter.angle);
  const perpY = Math.cos(startCenter.angle);

  return {
    id,
    name,
    color,
    lap: 0,
    lapProgress: 0,
    totalProgress: 0,
    lateralOffset,
    lateralTarget: lateralOffset,
    speedBase: baseSpeed * (1 + (Math.random() * 2 - 1) * SPEED_VARIANCE),
    speedCurrent: 0,
    boostTimer: 0,
    boostMultiplier: 1,
    spinTimer: 0,
    finished: false,
    finishTime: null,
    insideBoostIds: new Set(), // marker indices currently inside - see events.js's enter/exit edge detection
    insideHazardIds: new Set(),
    worldPos: {
      x: startCenter.x + perpX * lateralOffset,
      y: startCenter.y + perpY * lateralOffset,
    },
    angle: startCenter.angle,
  };
}

export function resetKartColorCycle() {
  joinCounter = 0;
}

/**
 * Every tick: advance progress along the spline, wander laterally, and
 * derive worldPos from the single sampleTrack() source of truth. A kart with
 * an active spinTimer skips movement entirely - it's what a hazard hit
 * produces (see events.js): frozen in place, visibly spinning.
 */
export function updateKart(kart, track, dt, now) {
  if (kart.finished) {
    kart.speedCurrent = 0;
    return;
  }

  if (kart.boostTimer > 0) {
    kart.boostTimer = Math.max(0, kart.boostTimer - dt);
  }

  if (kart.spinTimer > 0) {
    kart.spinTimer = Math.max(0, kart.spinTimer - dt);
    kart.speedCurrent = 0;
    return;
  }

  kart.speedCurrent = kart.speedBase * (kart.boostTimer > 0 ? kart.boostMultiplier : 1);
  kart.lapProgress += (kart.speedCurrent * dt) / track.length;

  if (kart.lapProgress >= 1) {
    kart.lap += 1;
    kart.lapProgress -= 1;
    if (kart.lap >= track.def.laps) {
      kart.finished = true;
      kart.finishTime = now;
      kart.lap = track.def.laps;
      kart.lapProgress = 0;
    }
  }
  kart.totalProgress = kart.lap + kart.lapProgress;

  const maxOffset = track.def.width * 0.5 * LANE_BOUND_FRACTION;
  const driftStrength = maxOffset * DRIFT_STRENGTH_FACTOR;
  kart.lateralTarget += (Math.random() - 0.5) * driftStrength * dt;
  kart.lateralTarget = Math.max(-maxOffset, Math.min(maxOffset, kart.lateralTarget));
  kart.lateralOffset += (kart.lateralTarget - kart.lateralOffset) * Math.min(1, LATERAL_SMOOTHING * dt);

  const center = sampleTrack(track, kart.lapProgress);
  const perpX = -Math.sin(center.angle);
  const perpY = Math.cos(center.angle);
  kart.worldPos = {
    x: center.x + perpX * kart.lateralOffset,
    y: center.y + perpY * kart.lateralOffset,
  };
  kart.angle = center.angle;
}
