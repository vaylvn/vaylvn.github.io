import { sampleTrack } from './track.js';
import {
  buildOverviewCamera, overviewFloorProject, overviewSpriteProject, overviewPerspectiveCss, overviewFloorTop,
  buildFollowCamera, followFloorProject, followSpriteProject, followPerspectiveCss, followTransformOrigin, followFloorTop,
} from './camera.js';
import { pickFrameIndex } from './assets.js';
import {
  CAPYBARA_COLOR, CAPYBARA_EAR_COLOR, STROKE_COLOR, GROUND_COLOR, ROAD_COLOR,
  ROAD_EDGE_COLOR, CHECKER_A, CHECKER_B, BOOST_COLOR, HAZARD_COLOR,
} from './palette.js';

const ROAD_SAMPLES = 240; // resolution for the drawn track ribbon
const KART_BASE_SIZE = 24; // px at scale 1
// How chunky the 8-bit look is - same offscreen-buffer trick as BrainDead
// (zombie/js/render.js). This is the default, used for BOTH camera modes'
// sprite layer (always viewport-sized, unaffected by FLOOR_OVERSIZE) and
// overview mode's floor layer (its canvas size never changed).
const PIXEL_SCALE = 3;

// Follow mode's floor buffer specifically got much bigger (see camera.js's
// FLOOR_OVERSIZE_WIDTH/HEIGHT, for real forward/sideways track visibility)
// - this compensates ONLY that one buffer so the extra canvas area doesn't
// cost proportionally more per-frame fill work. Scoped to follow mode's
// floor only: bumping the shared PIXEL_SCALE instead (an earlier mistake)
// also chunked up overview mode's floor and BOTH modes' sprites, none of
// which needed it since their buffers never grew.
//
// Raised from 5 to 8 alongside camera.js doubling its forward/sideways
// capacity (300 world-units, up from 150) - the raw per-frame fill cost of
// that buffer is now ~16x the ORIGINAL baseline (vs. ~4x before), so this
// needed to grow too to keep actual cost in a similar ballpark (~1.8x
// baseline-actual). If it's still too slow in practice, raise this further
// before shrinking the buffer back down - it directly trades chunkiness
// for speed without giving up any of the forward/sideways visibility.
const FOLLOW_FLOOR_PIXEL_SCALE = 8;

// Overview's kart sprites are drawn small (KART_BASE_SIZE=24px at scale 1,
// vs follow mode's much bigger world-sized kart) - at the shared
// PIXEL_SCALE=3, a 24px kart only spans ~8 pixelation blocks across, so the
// SAME block size that reads as a fine 8-bit texture on the (much larger)
// floor reads as noticeably chunkier on the kart itself, purely because
// there's so little of the kart for each block to cover. This doesn't
// change the floor's own pixel scale, which is unrelated - only how finely
// the small sprite gets bucketed.
const OVERVIEW_SPRITE_PIXEL_SCALE = 1;

// Follow mode's kart was first matched exactly to FOLLOW_FLOOR_PIXEL_SCALE
// (8) so it didn't read as artificially sharp against a deliberately
// blocky floor - but at 8, the (much bigger, 132px) follow-mode kart
// itself started looking a bit too coarse. This sits between the two:
// closer to the floor's chunkiness than the crisp default (3), but with
// more of its own detail intact than a straight match would give.
const FOLLOW_SPRITE_PIXEL_SCALE = 5;

// A kart's angle relative to the camera is always exactly 0 for the kart
// the camera is actually following - the anchor IS that kart's own
// heading, so it can never show a turning frame on its own. To still show
// "turning" for the kart you're riding along with (and to make gentle
// curves elsewhere register at all against the sheet's 45deg-per-frame
// granularity), blend in how much the track curves just ahead of each
// kart's own position. Hard-clamped: a sharp corner on a hand-drawn custom
// track can curve much more per lookahead-step than this oval does, and
// without a cap the emphasis multiplier could push the angle far enough to
// select the oncoming/front frame instead of a subtle turn - reading as the
// kart spinning to face backward mid-corner, which is worse than the
// "soft" turning this was meant to fix.
const TURN_LOOKAHEAD_PROGRESS = 0.025;
const TURN_EMPHASIS = 1.6;
const TURN_MAX_DELTA = Math.PI / 2.8; // ~64deg cap - at most ~1.4 frame-steps away from baseline, never near "facing backward"

function turnFrameDelta(track, kart) {
  const current = sampleTrack(track, kart.lapProgress);
  const ahead = sampleTrack(track, kart.lapProgress + TURN_LOOKAHEAD_PROGRESS);
  let delta = ahead.angle - current.angle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return Math.max(-TURN_MAX_DELTA, Math.min(TURN_MAX_DELTA, delta * TURN_EMPHASIS));
}

// --- Custom art (see assets.js). Null until/unless loadAssets() resolves with real files. ---

let assets = null;

export function setAssets(loadedAssets) {
  assets = loadedAssets;
}

/** Read-only access for other UI modules that want to draw kart art (see leaderboard.js's headshots). */
export function getAssets() {
  return assets;
}

/** Draws `img` centered at the origin, fit inside a `boxW`x`boxH` box (preserving aspect ratio). */
function drawFitted(ctx, img, boxW, boxH) {
  const imgAspect = img.naturalWidth ? img.naturalWidth / img.naturalHeight : img.width / img.height;
  const boxAspect = boxW / boxH;
  let w = boxW;
  let h = boxH;
  if (imgAspect > boxAspect) h = boxW / imgAspect; else w = boxH * imgAspect;
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
}

// --- Road edge geometry + overview camera: expensive-ish to build, cache per track ---

let cachedTrack = null;
let cachedEdges = null;
let cachedOverviewCamera = null;
let cachedFollowCamera = null;

function getRoadEdges(track) {
  ensureTrackCache(track);
  return cachedEdges;
}

function getOverviewCamera(track) {
  ensureTrackCache(track);
  return cachedOverviewCamera;
}

function getFollowCamera(track) {
  ensureTrackCache(track);
  return cachedFollowCamera;
}

function ensureTrackCache(track) {
  if (cachedTrack === track) return;
  const halfWidth = track.def.width / 2;
  const left = [];
  const right = [];
  for (let i = 0; i <= ROAD_SAMPLES; i++) {
    const p = sampleTrack(track, i / ROAD_SAMPLES);
    const perpX = -Math.sin(p.angle);
    const perpY = Math.cos(p.angle);
    left.push({ x: p.x + perpX * halfWidth, y: p.y + perpY * halfWidth });
    right.push({ x: p.x - perpX * halfWidth, y: p.y - perpY * halfWidth });
  }
  cachedTrack = track;
  cachedEdges = { left, right };
  cachedOverviewCamera = buildOverviewCamera(track);
  cachedFollowCamera = buildFollowCamera(track);
}

// --- Pixelation: draw the "world" (floor + karts) at low res, upscale with
// smoothing off. Same technique as zombie/js/render.js's getPixelContext -
// keeps name labels crisp by drawing them separately at full res afterward. ---

const pixelCanvases = new WeakMap(); // real canvas element -> { canvas, ctx } low-res buffer

function getPixelContext(targetCanvas, canvasWidth, canvasHeight, pixelScale = PIXEL_SCALE) {
  const w = Math.max(1, Math.round(canvasWidth / pixelScale));
  const h = Math.max(1, Math.round(canvasHeight / pixelScale));
  let entry = pixelCanvases.get(targetCanvas);
  if (!entry) {
    const canvas = document.createElement('canvas');
    entry = { canvas, ctx: canvas.getContext('2d') };
    pixelCanvases.set(targetCanvas, entry);
  }
  if (entry.canvas.width !== w || entry.canvas.height !== h) {
    entry.canvas.width = w;
    entry.canvas.height = h;
  }
  entry.ctx.setTransform(1, 0, 0, 1, 0, 0);
  entry.ctx.clearRect(0, 0, w, h);
  entry.ctx.scale(1 / pixelScale, 1 / pixelScale);
  return entry.ctx;
}

/**
 * Blits a low-res pixel buffer up to the real canvas at full size, smoothing
 * off. Clears the real canvas first - the buffer is mostly transparent
 * (only kart silhouettes are opaque), so without this, drawImage would only
 * paint over the new kart positions and leave every previous frame's karts
 * standing forever, smearing a trail around the whole track.
 */
function blitPixelBuffer(realCtx, targetCanvas, canvasWidth, canvasHeight) {
  const entry = pixelCanvases.get(targetCanvas);
  if (!entry) return;
  realCtx.clearRect(0, 0, canvasWidth, canvasHeight);
  realCtx.save();
  realCtx.imageSmoothingEnabled = false;
  realCtx.drawImage(entry.canvas, 0, 0, entry.canvas.width, entry.canvas.height, 0, 0, canvasWidth, canvasHeight);
  realCtx.restore();
}

function drawRoad(ctx, track, project) {
  const { left, right } = getRoadEdges(track);

  ctx.fillStyle = ROAD_COLOR;
  ctx.beginPath();
  left.forEach((p, i) => {
    const s = project(p.x, p.y);
    if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
  });
  for (let i = right.length - 1; i >= 0; i--) {
    const s = project(right[i].x, right[i].y);
    ctx.lineTo(s.x, s.y);
  }
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = ROAD_EDGE_COLOR;
  ctx.lineWidth = 2;
  ctx.beginPath();
  left.forEach((p, i) => {
    const s = project(p.x, p.y);
    if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
  });
  ctx.stroke();
  ctx.beginPath();
  right.forEach((p, i) => {
    const s = project(p.x, p.y);
    if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
  });
  ctx.stroke();

  drawCheckerLine(ctx, track, project);
}

// Squares are laid out across the road at a fixed WORLD size, same as the
// road ribbon itself - correct for them to look bigger on screen at a
// tighter camera zoom, just like the road does. 6 was tuned for the old,
// much-more-zoomed-out follow scale; at the current tight SNES-close zoom
// that read as a couple of giant blocks instead of a checker pattern, so
// this is sized relative to the road width instead of a fixed count, to
// keep individual squares a reasonable, recognizable size regardless of
// zoom or a custom track's road width.
const CHECKER_SQUARE_SIZE = 12; // world units per square

function drawCheckerLine(ctx, track, project) {
  const halfWidth = track.def.width / 2;
  const p = sampleTrack(track, 0);
  const perpX = -Math.sin(p.angle);
  const perpY = Math.cos(p.angle);
  const squares = Math.max(4, Math.round((halfWidth * 2) / CHECKER_SQUARE_SIZE));
  for (let i = 0; i < squares; i++) {
    const f0 = i / squares;
    const f1 = (i + 1) / squares;
    const a = { x: p.x + perpX * (-halfWidth + f0 * halfWidth * 2), y: p.y + perpY * (-halfWidth + f0 * halfWidth * 2) };
    const b = { x: p.x + perpX * (-halfWidth + f1 * halfWidth * 2), y: p.y + perpY * (-halfWidth + f1 * halfWidth * 2) };
    const thickness = CHECKER_SQUARE_SIZE;
    const alongX = Math.cos(p.angle) * thickness;
    const alongY = Math.sin(p.angle) * thickness;
    const sa = project(a.x, a.y);
    const sb = project(b.x, b.y);
    const sc = project(b.x + alongX, b.y + alongY);
    const sd = project(a.x + alongX, a.y + alongY);
    ctx.fillStyle = i % 2 === 0 ? CHECKER_A : CHECKER_B;
    ctx.beginPath();
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(sb.x, sb.y);
    ctx.lineTo(sc.x, sc.y);
    ctx.lineTo(sd.x, sd.y);
    ctx.closePath();
    ctx.fill();
  }
}

// Only drawn in the no-background-image fallback (see renderCameraView) -
// once a background PNG is in play, these zones are meant to be invisible,
// aligned with whatever art (puddles, speed pads) is already baked into it.
function drawMarkers(ctx, track, project) {
  for (const pad of track.def.boostPads) {
    const s = project(pad.x, pad.y);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.fillStyle = BOOST_COLOR;
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(10, 6);
    ctx.lineTo(3, 6);
    ctx.lineTo(3, 14);
    ctx.lineTo(-3, 14);
    ctx.lineTo(-3, 6);
    ctx.lineTo(-10, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  for (const hazard of track.def.hazards) {
    const s = project(hazard.x, hazard.y);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.fillStyle = HAZARD_COLOR;
    ctx.strokeStyle = STROKE_COLOR;
    ctx.lineWidth = 1.5;
    for (const [dx, dy, r] of [[-4, -3, 6], [4, -2, 6], [0, 4, 6]]) {
      ctx.beginPath();
      ctx.ellipse(dx, dy, r, r * 0.7, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// How much of a lap (kart.animProgress, a continuous distance measure that
// advances at the kart's unboosted base speed - see kart.js) advances the
// sheet's animation block by one step. Ties the animation to actual
// movement rather than wall-clock time, so it cycles while driving and
// holds on one pose when stationary (spinning from a hazard, sitting in the
// lobby, etc.) without any extra state to track. Deliberately NOT
// kart.totalProgress - that advances at the kart's real (possibly boosted)
// speed, which made the bob visibly speed up under a boost pad. Arbitrary/
// by-eye value - retune directly if the bob reads too fast or too slow once
// you can see it in motion.
const KART_ANIM_PROGRESS_PER_STEP = 1 / 120;

// A hazard hit eases a kart's speed down to 0 rather than freezing it (see
// kart.js's updateKart) - previously the only visual cue was a static
// dashed white arc drawn over an otherwise motionless sprite, which read as
// "engine trouble" rather than "just got spun out". Cycling the directional
// sprite itself through a fast full rotation (using kart.spinElapsed, which
// counts UP from 0 for as long as the slowdown lasts - see kart.js) makes
// it visually read as the kart spinning out instead. ~2.5 full rotations/
// sec so even the shortest hazard's spinDuration (see events.js's default,
// ~0.9-1.5s) completes a couple of full spins rather than one slow turn -
// retune by eye if it reads as too fast/slow once you see it.
const SPIN_VISUAL_ROTATION_RATE = Math.PI * 2 * 2.5;

// A fast opacity flicker layered on top of the spin - a cheap, readable
// "you got hit" cue that needs no extra art. Toggles on kart.spinElapsed
// (not wall-clock time) so it can't drift out of sync with the spin cycle
// above, and so it starts from the same "just got hit" instant every time.
const SPIN_FLICKER_INTERVAL = 0.08; // seconds per on/off toggle
const SPIN_FLICKER_MIN_ALPHA = 0.3;

function drawKartBody(ctx, kart, size, spriteAngle) {
  const sheet = assets && assets.kartSheet;
  const sheetAnimBlocks = sheet && sheet.frames.get(kart.color);
  if (sheetAnimBlocks) {
    // Blocks [0, normalBlocks) are the normal-driving pose variations;
    // [normalBlocks, animBlocks) are the SAME variations again with a boost
    // exhaust-flame effect added (see assets.js). Both groups are cycled
    // through identically by animProgress - only which GROUP is picked
    // depends on whether this kart is currently boosting. Sheets with only
    // a normal group (normalBlocks >= animBlocks, e.g. an older un-upgraded
    // sheet) have no boost group to switch to, so boosting just keeps the
    // normal pose.
    const animBlocks = sheet.animBlocks ?? 1;
    const normalBlocks = Math.min(sheet.normalBlocks ?? animBlocks, animBlocks);
    const hasBoostBlocks = normalBlocks < animBlocks;
    const groupSize = hasBoostBlocks && kart.boostTimer > 0 ? animBlocks - normalBlocks : normalBlocks;
    const groupStart = hasBoostBlocks && kart.boostTimer > 0 ? normalBlocks : 0;
    const animIndex = groupSize > 1
      ? groupStart + (Math.floor(kart.animProgress / KART_ANIM_PROGRESS_PER_STEP) % groupSize)
      : groupStart;
    const frame = sheetAnimBlocks[animIndex][pickFrameIndex(spriteAngle, sheet.frameCount)];
    drawFitted(ctx, frame, size, size);
    return;
  }

  const kartTint = assets && assets.kartTints.get(kart.color);
  if (kartTint) {
    drawFitted(ctx, kartTint, size, size * 0.6);
  } else {
    ctx.fillStyle = kart.color;
    ctx.strokeStyle = STROKE_COLOR;
    ctx.lineWidth = Math.max(1, 1.5);
    roundRect(ctx, -size / 2, -size * 0.22, size, size * 0.5, size * 0.16);
    ctx.fill();
    ctx.stroke();
  }

  if (assets && assets.capybaraImg) {
    ctx.save();
    ctx.translate(0, -size * 0.3);
    drawFitted(ctx, assets.capybaraImg, size * 0.75, size * 0.6);
    ctx.restore();
  } else {
    ctx.fillStyle = CAPYBARA_EAR_COLOR;
    ctx.beginPath();
    ctx.ellipse(-size * 0.2, -size * 0.56, size * 0.09, size * 0.11, 0, 0, Math.PI * 2);
    ctx.ellipse(size * 0.2, -size * 0.56, size * 0.09, size * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = CAPYBARA_COLOR;
    ctx.strokeStyle = STROKE_COLOR;
    ctx.lineWidth = Math.max(0.75, 1);
    ctx.beginPath();
    ctx.ellipse(0, -size * 0.38, size * 0.32, size * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

/** Body + status effects only - the pixelated layer. Name label is drawn separately at full res, see drawKartLabel. */
function drawKartBodyAndEffects(ctx, kart, x, y, scale, spriteAngle) {
  const size = KART_BASE_SIZE * scale;
  ctx.save();
  ctx.translate(x, y);

  if (kart.spinTimer > 0) {
    const flickerOn = Math.floor(kart.spinElapsed / SPIN_FLICKER_INTERVAL) % 2 === 0;
    ctx.globalAlpha = flickerOn ? 1 : SPIN_FLICKER_MIN_ALPHA;
  }

  drawKartBody(ctx, kart, size, spriteAngle);

  ctx.globalAlpha = 1; // restore before ctx.restore(), in case a future effect below needs full opacity

  ctx.restore();
}

/** Full-res pass, drawn after the pixel buffer is blitted up - keeps names crisp instead of blocky. */
function drawKartLabel(ctx, kart, x, y, scale) {
  const size = KART_BASE_SIZE * scale;
  const labelScale = Math.max(0.65, Math.min(1.15, scale));
  const fontSize = 13 * labelScale;
  ctx.save();
  ctx.font = `bold ${fontSize}px Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const labelY = y - size * 0.85 - 8;

  // A dark plate behind the name reads far better over busy track art than
  // a text stroke alone, especially at the smaller sizes overview mode draws.
  const textWidth = ctx.measureText(kart.name).width;
  const paddingX = fontSize * 0.5;
  const paddingY = fontSize * 0.32;
  ctx.fillStyle = 'rgba(10,10,10,0.72)';
  roundRect(ctx, x - textWidth / 2 - paddingX, labelY - fontSize / 2 - paddingY, textWidth + paddingX * 2, fontSize + paddingY * 2, fontSize * 0.4);
  ctx.fill();

  ctx.lineWidth = Math.max(2, fontSize * 0.22);
  ctx.strokeStyle = 'rgba(0,0,0,0.9)';
  ctx.fillStyle = kart.finished ? '#9aa39a' : '#fff8e6';
  ctx.strokeText(kart.name, x, labelY);
  ctx.fillText(kart.name, x, labelY);
  ctx.restore();
}

/**
 * Draws `img` once (spanning world-space rect [0,0]-[imgW,imgH]) through the
 * same flat `project` function used for the road/markers. The track image
 * is a specific one-off drawing - a start line, ponds, and curves at fixed
 * positions - not a generic repeating ground texture, so tiling it (an
 * earlier attempt) duplicated the whole track layout side by side instead
 * of reading as more world. Follow mode's camera now zooms out to fit the
 * whole image instead (see buildFollowCamera), which is what actually
 * avoids running past its edges. The floor projection is pure
 * rotate+scale+translate (no depth term), so instead of re-deriving that
 * rotation matrix by hand, it's read off 3 already-correct projected points
 * and composed onto the context's existing transform (`ctx.transform`, not
 * `setTransform` - the pixel buffer already has its own PIXEL_SCALE scale
 * applied, which must stay in effect underneath this one).
 */
function drawImageWorldRect(ctx, project, img, imgW, imgH) {
  const p00 = project(0, 0);
  const p10 = project(imgW, 0);
  const p01 = project(0, imgH);
  ctx.save();
  ctx.transform(
    (p10.x - p00.x) / imgW, (p10.y - p00.y) / imgW,
    (p01.x - p00.x) / imgH, (p01.y - p00.y) / imgH,
    p00.x, p00.y,
  );
  ctx.drawImage(img, 0, 0, imgW, imgH);
  ctx.restore();
}

/** Draws the floor into a pixel buffer for `canvas`, then blits it up (pixelated) onto `realCtx`. */
function drawPixelatedFloor(realCtx, canvas, track, floorWidth, floorHeight, project, floorPixelScale) {
  const pctx = getPixelContext(canvas, floorWidth, floorHeight, floorPixelScale);
  pctx.fillStyle = GROUND_COLOR;
  pctx.fillRect(0, 0, floorWidth, floorHeight);
  if (track.backgroundImage) {
    drawImageWorldRect(pctx, project, track.backgroundImage, track.backgroundImage.naturalWidth, track.backgroundImage.naturalHeight);
  } else {
    drawRoad(pctx, track, project);
    drawMarkers(pctx, track, project);
  }
  blitPixelBuffer(realCtx, canvas, floorWidth, floorHeight);
}

/**
 * Shared by both camera modes: draws the floor (CSS-tilted, pixelated) and
 * the sprites (depth-projected, pixelated bodies + crisp labels on top).
 * `projectFloor`/`projectSprite` differ only in which anchor they recenter
 * on - a followed kart, or the fixed overview anchor (see camera.js). The
 * floor canvas is bigger than the viewport (see camera.js's
 * buildFloorCanvasSize) and centered over it, so projectFloor works in the
 * floor's own (larger) dimensions while projectSprite works in the
 * viewport's - sprites are drawn on a separate, untransformed, viewport-
 * sized canvas.
 */
function renderCameraView(gameState, layers, { projectFloor, projectSprite, cssTransform, transformOrigin, floorTop, floorPixelScale, spritePixelScale, hitboxSink }) {
  const { track, karts, canvasWidth, canvasHeight, floorWidth, floorHeight } = gameState;

  layers.floorCanvas.style.display = 'block';
  layers.floorCanvas.style.transform = cssTransform;
  layers.floorCanvas.style.transformOrigin = transformOrigin;
  layers.floorCanvas.style.top = `${floorTop}px`;
  drawPixelatedFloor(layers.floorCtx, layers.floorCanvas, track, floorWidth, floorHeight, projectFloor, floorPixelScale);

  const spritePixelCtx = getPixelContext(layers.spriteCanvas, canvasWidth, canvasHeight, spritePixelScale);

  const projected = [];
  for (const kart of karts.values()) {
    const p = projectSprite(kart);
    if (p.visible === false) continue;
    projected.push({ kart, p });
  }
  projected.sort((a, b) => a.p.scale - b.p.scale); // draw far-to-near so nearer karts occlude correctly

  if (hitboxSink) {
    hitboxSink.length = 0;
    for (const { kart, p } of projected) hitboxSink.push({ id: kart.id, x: p.x, y: p.y, r: KART_BASE_SIZE * 0.6 * p.scale });
  }

  for (const { kart, p } of projected) {
    const frameAngle = kart.spinTimer > 0
      ? kart.spinElapsed * SPIN_VISUAL_ROTATION_RATE
      : p.angle + turnFrameDelta(track, kart);
    drawKartBodyAndEffects(spritePixelCtx, kart, p.x, p.y, p.scale, frameAngle);
  }
  blitPixelBuffer(layers.spriteCtx, layers.spriteCanvas, canvasWidth, canvasHeight);

  for (const { kart, p } of projected) drawKartLabel(layers.spriteCtx, kart, p.x, p.y, p.scale);
}

export function renderOverview(gameState, layers) {
  const { track, canvasWidth, canvasHeight, floorWidth, floorHeight, camera } = gameState;
  const overviewCamera = getOverviewCamera(track);

  renderCameraView(gameState, layers, {
    projectFloor: (x, y) => overviewFloorProject(overviewCamera, canvasWidth, canvasHeight, floorWidth, floorHeight, x, y, camera.zoomFactor),
    projectSprite: kart => overviewSpriteProject(
      overviewCamera, canvasWidth, canvasHeight, kart.worldPos.x, kart.worldPos.y, camera.zoomFactor, kart.angle,
    ),
    cssTransform: overviewPerspectiveCss(camera.zoomFactor),
    transformOrigin: '50% 50%',
    floorTop: overviewFloorTop(canvasHeight, floorHeight),
    floorPixelScale: PIXEL_SCALE, // overview's own canvas never grew - no compensation needed, see FOLLOW_FLOOR_PIXEL_SCALE
    spritePixelScale: OVERVIEW_SPRITE_PIXEL_SCALE,
    hitboxSink: gameState.overviewHitboxes,
  });
}

export function renderFollow(gameState, layers) {
  const { track, karts, canvasWidth, canvasHeight, floorWidth, floorHeight, camera } = gameState;
  const followedKart = karts.get(camera.followedId);
  if (!followedKart) return;
  const followCamera = getFollowCamera(track);
  // Same position as the real kart every frame - only the heading is
  // smoothed (see camera.js's advanceFollowCameraHeading, called from
  // main.js's tick() before render()) - so the camera's turn-in eases
  // instead of snapping, without introducing any positional lag/drift.
  const cameraAnchor = { worldPos: followedKart.worldPos, angle: camera.smoothedAngle ?? followedKart.angle };

  renderCameraView(gameState, layers, {
    projectFloor: (x, y) => followFloorProject(followCamera, cameraAnchor, canvasWidth, canvasHeight, floorWidth, floorHeight, x, y),
    projectSprite: kart => followSpriteProject(
      followCamera, cameraAnchor, canvasWidth, canvasHeight, kart.worldPos.x, kart.worldPos.y, kart.angle,
    ),
    cssTransform: followPerspectiveCss(),
    transformOrigin: followTransformOrigin(),
    floorTop: followFloorTop(canvasHeight, floorHeight),
    floorPixelScale: FOLLOW_FLOOR_PIXEL_SCALE,
    spritePixelScale: FOLLOW_SPRITE_PIXEL_SCALE,
    hitboxSink: null,
  });
}

export function render(gameState, layers) {
  if (gameState.camera.mode === 'overview') {
    renderOverview(gameState, layers);
  } else {
    renderFollow(gameState, layers);
  }
}
