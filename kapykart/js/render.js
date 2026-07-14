import { sampleTrack } from './track.js';
import {
  computeTopdownScale, topdownProject,
  followFloorProject, followSpriteProject, followPerspectiveCss,
} from './camera.js';
import {
  CAPYBARA_COLOR, CAPYBARA_EAR_COLOR, STROKE_COLOR, GROUND_COLOR, ROAD_COLOR,
  ROAD_EDGE_COLOR, CHECKER_A, CHECKER_B, BOOST_COLOR, HAZARD_COLOR, ACCENT_COLOR,
  CHAOS_WARNING_COLOR,
} from './palette.js';

const ROAD_SAMPLES = 240; // resolution for the drawn track ribbon
const KART_BASE_SIZE = 24; // px at scale 1

// --- Road edge geometry: expensive-ish to build, so cache per track ---

let cachedTrack = null;
let cachedEdges = null;

function getRoadEdges(track) {
  if (cachedTrack === track) return cachedEdges;
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
  return cachedEdges;
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

function drawMarkers(ctx, track, project) {
  for (const pad of track.def.boostPads) {
    const p = sampleTrack(track, pad.atProgress);
    const s = project(p.x, p.y);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(-p.angle + Math.PI / 2);
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
    const p = sampleTrack(track, hazard.atProgress);
    const s = project(p.x, p.y);
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

function drawKartSprite(ctx, kart, x, y, scale, { highlighted = false, chaosWarning = false } = {}) {
  const size = KART_BASE_SIZE * scale;
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = kart.color;
  ctx.strokeStyle = STROKE_COLOR;
  ctx.lineWidth = Math.max(1, 1.5 * scale);
  roundRect(ctx, -size / 2, -size * 0.22, size, size * 0.5, size * 0.16);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = CAPYBARA_EAR_COLOR;
  ctx.beginPath();
  ctx.ellipse(-size * 0.2, -size * 0.56, size * 0.09, size * 0.11, 0, 0, Math.PI * 2);
  ctx.ellipse(size * 0.2, -size * 0.56, size * 0.09, size * 0.11, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = CAPYBARA_COLOR;
  ctx.strokeStyle = STROKE_COLOR;
  ctx.lineWidth = Math.max(0.75, 1 * scale);
  ctx.beginPath();
  ctx.ellipse(0, -size * 0.38, size * 0.32, size * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

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

export function renderTopdown(gameState, layers) {
  layers.floorCanvas.style.display = 'none';
  layers.floorCanvas.style.transform = '';

  const ctx = layers.spriteCtx;
  const { track, karts, canvasWidth, canvasHeight } = gameState;

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.fillStyle = GROUND_COLOR;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const scale = computeTopdownScale(track, canvasWidth, canvasHeight);
  const project = (x, y) => topdownProject(track, scale, canvasWidth, canvasHeight, x, y);

  drawRoad(ctx, track, project);
  drawMarkers(ctx, track, project);

  const chaosTargetId = gameState.chaos.pending ? gameState.chaos.pending.targetId : null;
  gameState.topdownHitboxes = [];

  for (const kart of karts.values()) {
    const p = project(kart.worldPos.x, kart.worldPos.y);
    drawKartSprite(ctx, kart, p.x, p.y, 1, { chaosWarning: kart.id === chaosTargetId });
    gameState.topdownHitboxes.push({ id: kart.id, x: p.x, y: p.y, r: KART_BASE_SIZE * 0.6 });
  }
}

export function renderFollow(gameState, layers) {
  const { track, karts, canvasWidth, canvasHeight, camera } = gameState;
  const followedKart = karts.get(camera.followedId);
  if (!followedKart) return;

  layers.floorCanvas.style.display = 'block';
  layers.floorCanvas.style.transform = followPerspectiveCss(camera.zoomFactor);

  const floorCtx = layers.floorCtx;
  floorCtx.clearRect(0, 0, canvasWidth, canvasHeight);
  floorCtx.fillStyle = GROUND_COLOR;
  floorCtx.fillRect(0, 0, canvasWidth, canvasHeight);

  const floorProject = (x, y) => followFloorProject(followedKart, canvasWidth, canvasHeight, x, y, camera.zoomFactor);
  drawRoad(floorCtx, track, floorProject);
  drawMarkers(floorCtx, track, floorProject);

  const spriteCtx = layers.spriteCtx;
  spriteCtx.clearRect(0, 0, canvasWidth, canvasHeight);

  const chaosTargetId = gameState.chaos.pending ? gameState.chaos.pending.targetId : null;
  const projected = [];
  for (const kart of karts.values()) {
    const p = followSpriteProject(followedKart, canvasWidth, canvasHeight, kart.worldPos.x, kart.worldPos.y, camera.zoomFactor);
    if (!p.visible) continue;
    projected.push({ kart, p });
  }
  projected.sort((a, b) => a.p.scale - b.p.scale); // draw far-to-near so nearer karts occlude correctly

  for (const { kart, p } of projected) {
    drawKartSprite(spriteCtx, kart, p.x, p.y, p.scale, {
      highlighted: kart.id === followedKart.id,
      chaosWarning: kart.id === chaosTargetId,
    });
  }
}

export function render(gameState, layers) {
  if (gameState.camera.mode === 'topdown') {
    renderTopdown(gameState, layers);
  } else {
    renderFollow(gameState, layers);
  }
}
