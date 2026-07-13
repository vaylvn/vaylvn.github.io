import {
  ZOMBIE_BODY,
  ARMORED_LABEL_COLOR,
  WORD_LABEL_COLOR,
  STROKE_COLOR,
  BG_COLOR,
  NIGHT_BG_COLOR,
  PERIMETER_COLOR,
  HEALTH_RING_COLOR,
  HEALTH_RING_LOST_COLOR,
  BRAINCELL_COLOR,
  BRAINCELL_GLOW_COLOR,
} from './palette.js';

const TAU = Math.PI * 2;

function seededRandom(seed) {
  // Deterministic per-entity wobble so a "wrong" silhouette doesn't jitter frame to frame.
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function ensureWobble(entity, seed, points, minR, maxR) {
  if (entity.wobble) return entity.wobble;
  const rand = seededRandom(seed);
  const wobble = [];
  for (let i = 0; i < points; i++) {
    wobble.push(minR + rand() * (maxR - minR));
  }
  entity.wobble = wobble;
  return wobble;
}

function drawWobblyBlob(ctx, cx, cy, baseRadius, wobble) {
  ctx.beginPath();
  const points = wobble.length;
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * TAU;
    const r = baseRadius * wobble[i % points];
    const px = cx + Math.cos(angle) * r;
    const py = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawBackground(ctx, gameState) {
  const { canvasWidth: w, canvasHeight: h, config } = gameState;
  ctx.fillStyle = config.nightMode ? NIGHT_BG_COLOR : BG_COLOR;
  ctx.fillRect(0, 0, w, h);
}

function drawPerimeterArc(ctx, gameState) {
  const { braincell, arcRadius, config } = gameState;
  const hasDefenders = [...gameState.players.values()].some(p => p.alive);
  if (!arcRadius || !hasDefenders) return;
  const centerAngle = Math.PI * 1.5;
  const startAngle = centerAngle - config.arcSpan / 2;
  const endAngle = centerAngle + config.arcSpan / 2;
  ctx.save();
  ctx.strokeStyle = PERIMETER_COLOR;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(braincell.x, braincell.y, arcRadius, startAngle, endAngle);
  ctx.stroke();
  ctx.restore();
}

function drawBraincell(ctx, gameState, now) {
  const { braincell } = gameState;
  const wobble = ensureWobble(braincell, 424242, 14, 0.7, 1.35);
  const pulse = 1 + Math.sin(now / 900) * 0.05;
  const baseRadius = 26 * pulse;

  ctx.save();
  const glowRadius = baseRadius * 2.4;
  const gradient = ctx.createRadialGradient(braincell.x, braincell.y, baseRadius * 0.4, braincell.x, braincell.y, glowRadius);
  gradient.addColorStop(0, BRAINCELL_GLOW_COLOR);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(braincell.x, braincell.y, glowRadius, 0, TAU);
  ctx.fill();

  ctx.fillStyle = BRAINCELL_COLOR;
  ctx.strokeStyle = STROKE_COLOR;
  ctx.lineWidth = 2;
  drawWobblyBlob(ctx, braincell.x, braincell.y, baseRadius, wobble);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawHealthRing(ctx, player, radius) {
  const segments = player.maxHealth;
  const gap = 0.18; // radians of gap between segments
  const segmentAngle = TAU / segments;

  for (let i = 0; i < segments; i++) {
    const start = -Math.PI / 2 + i * segmentAngle + gap / 2;
    const end = start + segmentAngle - gap;
    ctx.strokeStyle = i < player.health ? HEALTH_RING_COLOR : HEALTH_RING_LOST_COLOR;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(player.position.x, player.position.y, radius, start, end);
    ctx.stroke();
  }
}

function drawSurvivor(ctx, player, now) {
  const { x, y } = player.position;
  const radius = 14;
  const flashing = player.hitFlashUntil > now;

  ctx.save();
  ctx.fillStyle = flashing ? '#FFFFFF' : player.color;
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

  drawHealthRing(ctx, player, radius + 6);
}

function drawZombie(ctx, zombie, now) {
  const wobble = ensureWobble(zombie, zombie.id * 7919 + 13, 9, 0.82, 1.18);
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
  drawWobblyBlob(ctx, zombie.x, zombie.y, baseRadius, wobble);
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
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.7;
      ctx.strokeStyle = '#FFB347';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, 20 + t * 140, 0, TAU);
      ctx.stroke();
      ctx.restore();
    } else if (effect.type === 'playerHit') {
      const t = Math.min(1, age / 260);
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.85;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, 16 + t * 20, 0, TAU);
      ctx.stroke();
      ctx.restore();
    } else if (effect.type === 'overrun') {
      const t = Math.min(1, age / 900);
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.strokeStyle = '#FF3B3B';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, 20 + t * 400, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function drawNightOverlay(ctx, gameState) {
  if (!gameState.config.nightMode) return;
  const { canvasWidth: w, canvasHeight: h, braincell } = gameState;
  const gradient = ctx.createRadialGradient(
    braincell.x, braincell.y, 60,
    braincell.x, braincell.y, Math.max(w, h) * 0.7
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
  const { braincell, config, arcRadius } = gameState;

  drawBackground(ctx, gameState);
  drawBraincell(ctx, gameState, now);
  drawPerimeterArc(ctx, gameState);

  const fogRadius = config.fogEnabled ? (arcRadius || config.arcMinRadius) + config.fogViewRange : Infinity;

  for (const zombie of gameState.zombies.values()) {
    const dist = Math.hypot(zombie.x - braincell.x, zombie.y - braincell.y);
    if (dist > fogRadius) continue;
    drawZombie(ctx, zombie, now);
  }

  for (const player of gameState.players.values()) {
    if (!player.alive) continue;
    drawSurvivor(ctx, player, now);
  }

  drawEffects(ctx, gameState);
  drawNightOverlay(ctx, gameState);
}
