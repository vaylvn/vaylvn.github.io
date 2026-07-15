import { sampleTrack } from './track.js';
import { KART_PALETTE } from './palette.js';

let joinCounter = 0;

const LAP_SECONDS = 22; // roughly how long a lap takes at base speed - tune the whole race's pace from here
const SPEED_VARIANCE = 0.12; // +/- fraction of base speed, randomized per kart
const LATERAL_SMOOTHING = 1.2; // per-second ease rate toward lateralTarget
const LANE_BOUND_FRACTION = 0.6; // how much of the half-track-width the weave is allowed to use

// The weave is a per-kart sine wave (own period/phase/amplitude, randomized
// once at spawn) plus a small residual random wobble on top - not a plain
// random walk. A plain walk sounds like it should decorrelate between karts
// on its own, but in practice it spends most of its time pinned near
// whichever lane-bound edge it last wandered into (nothing pulls it back
// toward center), so a pack of karts ends up hugging the same edge together
// and reads as "everyone taking the same path". A sine wave guarantees each
// kart's path is a distinct, continuously-varying curve that keeps crossing
// back toward center, and randomizing period/phase/amplitude per kart
// guarantees no two karts trace the same curve.
const WEAVE_PERIOD_MIN = 9; // seconds per full left-right-left cycle
const WEAVE_PERIOD_MAX = 17;
const WEAVE_AMPLITUDE_MIN = 0.55; // fraction of maxOffset
const WEAVE_AMPLITUDE_MAX = 1.0;
const WEAVE_JITTER_FACTOR = 3; // world units/sec^2 of small extra wobble per world unit of maxOffset
const WEAVE_JITTER_BOUND_FRACTION = 0.3; // the wobble alone can't exceed this fraction of maxOffset

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
    weavePeriod: WEAVE_PERIOD_MIN + Math.random() * (WEAVE_PERIOD_MAX - WEAVE_PERIOD_MIN),
    weavePhase: Math.random() * Math.PI * 2,
    weaveAmplitude: WEAVE_AMPLITUDE_MIN + Math.random() * (WEAVE_AMPLITUDE_MAX - WEAVE_AMPLITUDE_MIN),
    weaveJitter: 0, // small residual random wobble layered on the sine, see updateKart
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
  const jitterBound = maxOffset * WEAVE_JITTER_BOUND_FRACTION;
  kart.weaveJitter += (Math.random() - 0.5) * maxOffset * WEAVE_JITTER_FACTOR * dt;
  kart.weaveJitter = Math.max(-jitterBound, Math.min(jitterBound, kart.weaveJitter));

  const wave = Math.sin((now / 1000) * (Math.PI * 2 / kart.weavePeriod) + kart.weavePhase) * maxOffset * kart.weaveAmplitude;
  kart.lateralTarget = Math.max(-maxOffset, Math.min(maxOffset, wave + kart.weaveJitter));
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
