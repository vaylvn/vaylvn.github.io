import {
  ZOMBIE_BODY,
  ARMORED_LABEL_COLOR,
  WORD_LABEL_COLOR,
  STROKE_COLOR,
  BG_COLOR,
  NIGHT_BG_COLOR,
  SURVIVOR_LINE_COLOR,
} from './palette.js';

const TAU = Math.PI * 2;

function seededRandom(seed) {
  // Deterministic per-zombie wobble so the "wrong" silhouette doesn't jitter frame to frame.
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function ensureWobble(zombie) {
  if (zombie.wobble) return zombie.wobble;
  const rand = seededRandom(zombie.id * 7919 + 13);
  const points = 9;
  const wobble = [];
  for (let i = 0; i < points; i++) {
    wobble.push(0.82 + rand() * 0.36);
  }
  zombie.wobble = wobble;
  return wobble;
}

function drawBackground(ctx, gameState) {
  const { canvasWidth: w, canvasHeight: h, config } = gameState;
  ctx.fillStyle = config.nightMode ? NIGHT_BG_COLOR : BG_COLOR;
  ctx.fillRect(0, 0, w, h);
}

function drawSurvivorLine(ctx, gameState) {
  const { canvasWidth: w, survivorLineY } = gameState;
  ctx.strokeStyle = SURVIVOR_LINE_COLOR;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, survivorLineY + 22);
  ctx.lineTo(w, survivorLineY + 22);
  ctx.stroke();
}

function drawSurvivor(ctx, player) {
  const { x, y } = player.position;
  const radius = 14;

  ctx.save();
  ctx.fillStyle = player.color;
  ctx.strokeStyle = STROKE_COLOR;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // Static angled "gun" line.
  ctx.strokeStyle = STROKE_COLOR;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + radius * 1.6, y - radius * 0.9);
  ctx.stroke();

  // Weapon tier: brighter/thicker muzzle accent at the gun tip, scaling with tier.
  if (player.weaponTier > 0) {
    ctx.fillStyle = 'rgba(255, 220, 140, 0.9)';
    ctx.beginPath();
    ctx.arc(x + radius * 1.6, y - radius * 0.9, 2 + player.weaponTier, 0, TAU);
    ctx.fill();
  }

  ctx.fillStyle = '#F2F2F2';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(player.name, x, y - radius - 8);

  if (player.grenades > 0) {
    ctx.fillStyle = '#FFD23F';
    ctx.font = '10px monospace';
    ctx.fillText(`!grenade ${player.grenadeCode}`, x, y - radius - 20);
  }
  ctx.restore();
}

function drawZombie(ctx, zombie, now) {
  const wobble = ensureWobble(zombie);
  const baseRadius = zombie.type === 'tank' ? 19 : 13;
  const flinching = zombie.flinchUntil > now;

  ctx.save();
  if (zombie.dying) {
    const t = Math.min(1, (now - zombie.diedAt) / 260);
    ctx.globalAlpha = 1 - t;
  }

  ctx.fillStyle = flinching ? '#FFFFFF' : ZOMBIE_BODY[zombie.type];
  ctx.strokeStyle = STROKE_COLOR;
  ctx.lineWidth = 2;
  ctx.beginPath();
  const points = wobble.length;
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * TAU;
    const r = baseRadius * wobble[i % points];
    const px = zombie.x + Math.cos(angle) * r;
    const py = zombie.y + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = zombie.armored ? ARMORED_LABEL_COLOR : WORD_LABEL_COLOR;
  ctx.font = zombie.type === 'tank' ? 'bold 12px monospace' : '12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(zombie.word, zombie.x, zombie.y - baseRadius - 6);
  ctx.restore();
}

function drawEffects(ctx, gameState) {
  const now = performance.now();
  for (const effect of gameState.effects) {
    const age = now - effect.startedAt;

    if (effect.type === 'kill') {
      const t = Math.min(1, age / 420);
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = 1.5 + effect.tier;
      ctx.beginPath();
      ctx.moveTo(effect.shooterX, effect.shooterY);
      ctx.lineTo(effect.x, effect.y);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, 4 + t * 16, 0, TAU);
      ctx.globalAlpha = (1 - t) * 0.6;
      ctx.fill();

      ctx.globalAlpha = 1 - t;
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(effect.word, effect.x, effect.y - 14 - t * 18);
      ctx.restore();
    } else if (effect.type === 'hit') {
      const t = Math.min(1, age / 180);
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, 3 + t * 8, 0, TAU);
      ctx.fill();
      ctx.restore();
    } else if (effect.type === 'whiff') {
      const t = Math.min(1, age / 380);
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.7;
      ctx.strokeStyle = '#AAAAAA';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y - 10 - t * 14, 5 + t * 6, 0, TAU);
      ctx.stroke();
      ctx.restore();
    } else if (effect.type === 'grenade') {
      const t = Math.min(1, age / 500);
      const { canvasWidth, canvasHeight, config } = gameState;
      const laneWidth = canvasWidth / config.laneCount;
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.55;
      ctx.fillStyle = '#FFB347';
      ctx.fillRect(effect.lane * laneWidth, 0, laneWidth, canvasHeight);
      ctx.restore();
    }
  }
}

function drawNightOverlay(ctx, gameState) {
  if (!gameState.config.nightMode) return;
  const { canvasWidth: w, canvasHeight: h, survivorLineY } = gameState;
  const gradient = ctx.createRadialGradient(
    w / 2, survivorLineY, 60,
    w / 2, survivorLineY, Math.max(w, h) * 0.7
  );
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, 'rgba(0,0,0,0.82)');
  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

export function render(ctx, gameState) {
  const now = performance.now();
  drawBackground(ctx, gameState);
  drawSurvivorLine(ctx, gameState);

  const fogTop = gameState.config.fogEnabled
    ? gameState.survivorLineY - gameState.config.fogViewRange
    : -Infinity;

  for (const zombie of gameState.zombies.values()) {
    if (zombie.y < fogTop) continue;
    drawZombie(ctx, zombie, now);
  }

  for (const player of gameState.players.values()) {
    drawSurvivor(ctx, player);
  }

  drawEffects(ctx, gameState);
  drawNightOverlay(ctx, gameState);
}
