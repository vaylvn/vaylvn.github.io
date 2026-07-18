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

/** Starting-grid lateral position + world pos/angle for a given slot on `track`. */
function computeGridSpawn(track, gridSlot) {
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
    lateralOffset,
    worldPos: { x: startCenter.x + perpX * lateralOffset, y: startCenter.y + perpY * lateralOffset },
    angle: startCenter.angle,
  };
}

/**
 * Resets every race-state field on `kart` to a fresh starting-grid spawn on
 * `track` - shared by createKart (a brand new joiner) and resetKartToStart
 * (an already-joined kart, when the streamer switches tracks in the lobby).
 * Leaves identity (id/name/color) untouched.
 */
function applyStartingState(kart, track, gridSlot) {
  const spawn = computeGridSpawn(track, gridSlot);
  kart.gridSlot = gridSlot;
  kart.lap = 0;
  kart.lapProgress = 0;
  kart.totalProgress = 0;
  kart.lateralOffset = spawn.lateralOffset;
  kart.lateralTarget = spawn.lateralOffset;
  kart.animProgress = 0;
  kart.spinElapsed = 0; // seconds into the current stun, from 0 - see render.js's spin-cycling visual
  kart.weavePeriod = WEAVE_PERIOD_MIN + Math.random() * (WEAVE_PERIOD_MAX - WEAVE_PERIOD_MIN);
  kart.weavePhase = Math.random() * Math.PI * 2;
  kart.weaveAmplitude = WEAVE_AMPLITUDE_MIN + Math.random() * (WEAVE_AMPLITUDE_MAX - WEAVE_AMPLITUDE_MIN);
  kart.weaveJitter = 0;
  kart.speedBase = (track.length / LAP_SECONDS) * (1 + (Math.random() * 2 - 1) * SPEED_VARIANCE);
  kart.speedCurrent = 0;
  kart.boostTimer = 0;
  kart.boostMultiplier = 1;
  kart.spinTimer = 0;
  kart.finished = false;
  kart.finishTime = null;
  kart.insideBoostIds = kart.insideBoostIds || new Set(); // marker indices currently inside - see events.js's enter/exit edge detection
  kart.insideHazardIds = kart.insideHazardIds || new Set();
  kart.insideBoostIds.clear();
  kart.insideHazardIds.clear();
  kart.worldPos = spawn.worldPos;
  kart.angle = spawn.angle;
}

export function createKart(id, name, track) {
  const gridSlot = joinCounter;
  const color = KART_PALETTE[joinCounter % KART_PALETTE.length];
  joinCounter++;
  const kart = { id, name, color };
  applyStartingState(kart, track, gridSlot);
  return kart;
}

/**
 * Repositions an already-joined kart back to the starting grid on a
 * (possibly different) track - used when the streamer switches tracks
 * while chatters are already sitting in the lobby. Keeps id/name/color.
 */
export function resetKartToStart(kart, track, gridSlot) {
  applyStartingState(kart, track, gridSlot);
}

export function resetKartColorCycle() {
  joinCounter = 0;
}

/**
 * Every tick: advance progress along the spline, wander laterally, and
 * derive worldPos from the single sampleTrack() source of truth. A kart with
 * an active spinTimer skips movement entirely - it's what a hazard hit
 * produces (see events.js): frozen in place, visibly spinning.
 *
 * A finished kart does NOT stop moving - it keeps looping the track (like
 * the podium overlay in most racing games, with racing continuing visibly
 * behind it) rather than parking dead at the line. `finished`/`finishTime`
 * are set once and never touched again (see the `!kart.finished` guard
 * below), so this only affects ongoing movement/animation - every place
 * that ranks or displays karts already branches on the `finished` flag
 * itself, not on the raw lap/progress numbers, so letting those keep
 * climbing forever afterward doesn't change anyone's result or standing.
 */
export function updateKart(kart, track, dt, now) {
  if (kart.boostTimer > 0) {
    kart.boostTimer = Math.max(0, kart.boostTimer - dt);
  }

  if (kart.spinTimer > 0) {
    kart.spinTimer = Math.max(0, kart.spinTimer - dt);
    kart.spinElapsed += dt;
    kart.speedCurrent = 0;
    return;
  }
  kart.spinElapsed = 0; // reset so the next hazard/chaos hit's spin-cycle starts from frame 0 again

  kart.speedCurrent = kart.speedBase * (kart.boostTimer > 0 ? kart.boostMultiplier : 1);
  kart.lapProgress += (kart.speedCurrent * dt) / track.length;

  if (kart.lapProgress >= 1) {
    kart.lap += 1;
    kart.lapProgress -= 1;
    if (!kart.finished && kart.lap >= track.def.laps) {
      kart.finished = true;
      kart.finishTime = now;
    }
  }
  kart.totalProgress = kart.lap + kart.lapProgress;

  // Advances at the kart's unboosted base speed rather than speedCurrent, so
  // a boost pad (a temporary speed MULTIPLIER) doesn't also speed up the
  // sprite's animation cycle - render.js ties frame timing to this instead
  // of totalProgress specifically to keep it decoupled from boosts.
  kart.animProgress += (kart.speedBase * dt) / track.length;

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
