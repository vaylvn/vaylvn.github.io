import { sampleTrack } from './track.js';
import {
  buildOverviewCamera, overviewFloorProject, overviewSpriteProject, overviewPerspectiveCss,
  followFloorProject, followSpriteProject, followPerspectiveCss, FOLLOW_FIXED_ZOOM,
} from './camera.js';
import { pickFrameIndex } from './assets.js';
import {
  CAPYBARA_COLOR, CAPYBARA_EAR_COLOR, STROKE_COLOR, GROUND_COLOR, ROAD_COLOR,
  ROAD_EDGE_COLOR, CHECKER_A, CHECKER_B, BOOST_COLOR, HAZARD_COLOR, ACCENT_COLOR,
  CHAOS_WARNING_COLOR,
} from './palette.js';

const ROAD_SAMPLES = 240; // resolution for the drawn track ribbon
const KART_BASE_SIZE = 24; // px at scale 1
const PIXEL_SCALE = 3; // how chunky the 8-bit look is - same offscreen-buffer trick as BrainDead (zombie/js/render.js)

// --- Custom art (see assets.js). Null until/unless loadAssets() resolves with real files. ---

let assets = null;

export function setAssets(loadedAssets) {
  assets = loadedAssets;
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

function getRoadEdges(track) {
  ensureTrackCache(track);
  return cachedEdges;
}

function getOverviewCamera(track) {
  ensureTrackCache(track);
  return cachedOverviewCamera;
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
}

// --- Pixelation: draw the "world" (floor + karts) at low res, upscale with
// smoothing off. Same technique as zombie/js/render.js's getPixelContext -
// keeps name labels crisp by drawing them separately at full res afterward. ---

const pixelCanvases = new WeakMap(); // real canvas element -> { canvas, ctx } low-res buffer

function getPixelContext(targetCanvas, canvasWidth, canvasHeight) {
  const w = Math.max(1, Math.round(canvasWidth / PIXEL_SCALE));
  const h = Math.max(1, Math.round(canvasHeight / PIXEL_SCALE));
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
  entry.ctx.scale(1 / PIXEL_SCALE, 1 / PIXEL_SCALE);
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

function drawCheckerLine(ctx, track, project) {
  const halfWidth = track.def.width / 2;
  const p = sampleTrack(track, 0);
  const perpX = -Math.sin(p.angle);
  const perpY = Math.cos(p.angle);
  const squares = 6;
  for (let i = 0; i < squares; i++) {
    const f0 = i / squares;
    const f1 = (i + 1) / squares;
    const a = { x: p.x + perpX * (-halfWidth + f0 * halfWidth * 2), y: p.y + perpY * (-halfWidth + f0 * halfWidth * 2) };
    const b = { x: p.x + perpX * (-halfWidth + f1 * halfWidth * 2), y: p.y + perpY * (-halfWidth + f1 * halfWidth * 2) };
    const thickness = 10;
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

function drawKartBody(ctx, kart, size, spriteAngle) {
  const sheet = assets && assets.kartSheet;
  const sheetFrames = sheet && sheet.frames.get(kart.color);
  if (sheetFrames) {
    const frame = sheetFrames[pickFrameIndex(spriteAngle, sheet.frameCount)];
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
function drawKartBodyAndEffects(ctx, kart, x, y, scale, spriteAngle, { highlighted = false, chaosWarning = false } = {}) {
  const size = KART_BASE_SIZE * scale;
  ctx.save();
  ctx.translate(x, y);

  drawKartBody(ctx, kart, size, spriteAngle);

  if (kart.spinTimer > 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = Math.max(1, 1.5 * scale);
    ctx.beginPath();
    ctx.arc(0, -size * 0.1, size * 0.85, 0, Math.PI * 1.5);
    ctx.stroke();
  }

  if (kart.boostTimer > 0) {
    ctx.fillStyle = BOOST_COLOR;
    ctx.beginPath();
    ctx.moveTo(-size * 0.3, size * 0.3);
    ctx.lineTo(-size * 0.1, size * 0.55);
    ctx.lineTo(-size * 0.3, size * 0.8);
    ctx.moveTo(size * 0.3, size * 0.3);
    ctx.lineTo(size * 0.1, size * 0.55);
    ctx.lineTo(size * 0.3, size * 0.8);
    ctx.lineWidth = Math.max(1, 2 * scale);
    ctx.strokeStyle = BOOST_COLOR;
    ctx.stroke();
  }

  if (highlighted) {
    ctx.strokeStyle = ACCENT_COLOR;
    ctx.lineWidth = Math.max(1.5, 2 * scale);
    ctx.beginPath();
    ctx.arc(0, -size * 0.05, size * 0.95, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (chaosWarning) {
    ctx.fillStyle = CHAOS_WARNING_COLOR;
    ctx.font = `bold ${Math.max(10, 16 * scale)}px Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('!', 0, -size * 0.95);
  }

  ctx.restore();
}

/** Full-res pass, drawn after the pixel buffer is blitted up - keeps names crisp instead of blocky. */
function drawKartLabel(ctx, kart, x, y, scale) {
  const size = KART_BASE_SIZE * scale;
  const labelScale = Math.max(0.6, Math.min(1, scale));
  ctx.save();
  ctx.font = `${11 * labelScale}px Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.fillStyle = kart.finished ? '#9aa39a' : '#f2f2f2';
  const labelY = y - size * 0.85 - 6;
  ctx.strokeText(kart.name, x, labelY);
  ctx.fillText(kart.name, x, labelY);
  ctx.restore();
}

/**
 * Draws `img` (spanning world-space rect [0,0]-[imgW,imgH]) through the same
 * flat `project` function used for the road/markers. The floor projection
 * is pure rotate+scale+translate (no depth term), so instead of re-deriving
 * that rotation matrix by hand, it's read off 3 already-correct projected
 * points and composed onto the context's existing transform (`ctx.transform`,
 * not `setTransform` - the pixel buffer already has its own PIXEL_SCALE
 * scale applied, which must stay in effect underneath this one).
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
function drawPixelatedFloor(realCtx, canvas, track, floorWidth, floorHeight, project) {
  const pctx = getPixelContext(canvas, floorWidth, floorHeight);
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
function renderCameraView(gameState, layers, { projectFloor, projectSprite, cssTransform, hitboxSink }) {
  const { track, karts, canvasWidth, canvasHeight, floorWidth, floorHeight } = gameState;

  layers.floorCanvas.style.display = 'block';
  layers.floorCanvas.style.transform = cssTransform;
  drawPixelatedFloor(layers.floorCtx, layers.floorCanvas, track, floorWidth, floorHeight, projectFloor);

  const spritePixelCtx = getPixelContext(layers.spriteCanvas, canvasWidth, canvasHeight);

  const chaosTargetId = gameState.chaos.pending ? gameState.chaos.pending.targetId : null;
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
    drawKartBodyAndEffects(spritePixelCtx, kart, p.x, p.y, p.scale, p.angle, {
      highlighted: hitboxSink ? false : kart.id === gameState.camera.followedId,
      chaosWarning: kart.id === chaosTargetId,
    });
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
    hitboxSink: gameState.overviewHitboxes,
  });
}

export function renderFollow(gameState, layers) {
  const { track, karts, canvasWidth, canvasHeight, floorWidth, floorHeight, camera } = gameState;
  const followedKart = karts.get(camera.followedId);
  if (!followedKart) return;

  renderCameraView(gameState, layers, {
    projectFloor: (x, y) => followFloorProject(followedKart, floorWidth, floorHeight, x, y, FOLLOW_FIXED_ZOOM),
    projectSprite: kart => followSpriteProject(
      followedKart, canvasWidth, canvasHeight, kart.worldPos.x, kart.worldPos.y, FOLLOW_FIXED_ZOOM, kart.angle,
    ),
    cssTransform: followPerspectiveCss(),
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
