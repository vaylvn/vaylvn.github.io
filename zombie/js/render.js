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
  POWERUP_BODY_COLOR,
  POWERUP_LABEL_COLOR,
} from './palette.js';
import { getBackgroundImage } from './backgrounds.js';

const CHROMA_KEY_COLOR = '#0000FF';

const TAU = Math.PI * 2;

// How chunky the "8-bit" look is: the world (background/braincell/bodies) is
// drawn into an offscreen buffer at 1/PIXEL_SCALE resolution, then blown back
// up with smoothing off. Text is drawn separately, straight onto the full-res
// canvas, so words never get soft or blocky - only the game world does.
const PIXEL_SCALE = 4;

let pixelCanvas = null;
let pixelCtx = null;

function getPixelContext(canvasWidth, canvasHeight) {
  const w = Math.max(1, Math.round(canvasWidth / PIXEL_SCALE));
  const h = Math.max(1, Math.round(canvasHeight / PIXEL_SCALE));
  if (!pixelCanvas) {
    pixelCanvas = document.createElement('canvas');
    pixelCtx = pixelCanvas.getContext('2d');
  }
  if (pixelCanvas.width !== w || pixelCanvas.height !== h) {
    pixelCanvas.width = w;
    pixelCanvas.height = h;
  }
  pixelCtx.setTransform(1, 0, 0, 1, 0, 0);
  pixelCtx.clearRect(0, 0, w, h);
  // Draw commands below still use full-resolution coordinates - this scale
  // maps them down into the small buffer without rewriting any shape math.
  pixelCtx.scale(1 / PIXEL_SCALE, 1 / PIXEL_SCALE);
  return pixelCtx;
}

function seededRandom(seed) {
  // Deterministic per-entity wobble so a "wrong" silhouette doesn't jitter frame to frame.
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Blends two '#rrggbb' colors; t=0 is a, t=1 is b. */
function lerpColor(hexA, hexB, t) {
  const a = parseInt(hexA.slice(1), 16);
  const b = parseInt(hexB.slice(1), 16);
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
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

/** Bold fill over a dark stroke outline so labels stay legible over any body color or background. */
function drawLabel(ctx, text, x, y, color, size) {
  ctx.font = `bold ${size}px monospace`;
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.lineWidth = 3;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
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
  const bgId = config.background || 'default';

  if (bgId === 'chromakey') {
    ctx.fillStyle = CHROMA_KEY_COLOR;
    ctx.fillRect(0, 0, w, h);
    return;
  }

  const image = getBackgroundImage(bgId);
  if (image) {
    // Stretched to fill, then pixelated along with everything else by the
    // usual low-res-buffer upscale - keeps it visually consistent no matter
    // what resolution the source image actually is.
    ctx.drawImage(image, 0, 0, w, h);
    return;
  }

  // Default, or a custom pick that's still loading / failed to load.
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

/** Body, gun, and health ring only - the "pixelated world" layer. Name label is drawn separately at full res. */
function drawSurvivorBody(ctx, player, now) {
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

  // "Gun" line, rotated to track whatever this player last shot at.
  const gunLength = radius * 1.836;
  const tipX = x + Math.cos(player.aimAngle) * gunLength;
  const tipY = y + Math.sin(player.aimAngle) * gunLength;
  ctx.strokeStyle = STROKE_COLOR;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  // Weapon tier: brighter/thicker muzzle accent at the gun tip, scaling with tier.
  if (player.weaponTier > 0) {
    ctx.fillStyle = 'rgba(255, 220, 140, 0.9)';
    ctx.beginPath();
    ctx.arc(tipX, tipY, 2 + player.weaponTier, 0, TAU);
    ctx.fill();
  }

  ctx.restore();

  drawHealthRing(ctx, player, radius + 6);
}

function drawSurvivorLabel(ctx, player) {
  drawLabel(ctx, player.name, player.position.x, player.position.y - 14 - 9, '#F2F2F2', 13);
}

/** Wobbly body only - the "pixelated world" layer. Word label is drawn separately at full res. */
function drawZombieBody(ctx, zombie, now) {
  // Subtler, more even wobble than a survivor's shape - reads as shambling
  // rather than spiky/erratic, especially at fast zombies' speed.
  const wobble = ensureWobble(zombie, zombie.id * 7919 + 13, 7, 0.90, 1.12);
  const baseRadius = zombie.type === 'tank' ? 19 : 13;
  const flinching = zombie.flinchUntil > now;

  ctx.save();
  if (zombie.dying) {
    const t = Math.min(1, (now - zombie.diedAt) / 260);
    ctx.globalAlpha = 1 - t;
  }

  if (zombie.explosive) {
    // Soft pulsing halo behind the body - reads clearly even once the world's pixelated.
    const glowPulse = (Math.sin(now / 220) + 1) / 2;
    const glowRadius = baseRadius * (2.2 + glowPulse * 0.7);
    const gradient = ctx.createRadialGradient(
      zombie.x, zombie.y, baseRadius * 0.3,
      zombie.x, zombie.y, glowRadius
    );
    gradient.addColorStop(0, `rgba(200,255,190,${0.55 + glowPulse * 0.3})`);
    gradient.addColorStop(1, 'rgba(200,255,190,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(zombie.x, zombie.y, glowRadius, 0, TAU);
    ctx.fill();
  }

  if (flinching) {
    ctx.fillStyle = '#FFFFFF';
  } else if (zombie.explosive) {
    // Pulse the body itself between its normal color and white.
    const bodyPulse = (Math.sin(now / 220) + 1) / 2;
    ctx.fillStyle = lerpColor(ZOMBIE_BODY[zombie.type], '#FFFFFF', 0.2 + bodyPulse * 0.5);
  } else if (zombie.powerup) {
    // Solid, unmistakable orange - "this one's carrying something."
    ctx.fillStyle = POWERUP_BODY_COLOR;
  } else {
    ctx.fillStyle = ZOMBIE_BODY[zombie.type];
  }
  ctx.strokeStyle = STROKE_COLOR;
  ctx.lineWidth = 2;
  drawWobblyBlob(ctx, zombie.x, zombie.y, baseRadius, wobble);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawZombieLabel(ctx, zombie, now) {
  const baseRadius = zombie.type === 'tank' ? 19 : 13;
  const color = zombie.powerup ? POWERUP_LABEL_COLOR : zombie.armored ? ARMORED_LABEL_COLOR : WORD_LABEL_COLOR;

  if (zombie.dying) {
    const t = Math.min(1, (now - zombie.diedAt) / 260);
    ctx.save();
    ctx.globalAlpha = 1 - t;
    drawLabel(ctx, zombie.word, zombie.x, zombie.y - baseRadius - 7, color, 15);
    ctx.restore();
  } else {
    drawLabel(ctx, zombie.word, zombie.x, zombie.y - baseRadius - 7, color, 15);
  }
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

      // Armored zombies' first hit doesn't kill, but it's still a shot fired -
      // same tracer line a kill gets, just no death flash/word-scale text.
      if (effect.shooterX !== undefined) {
        ctx.strokeStyle = effect.color;
        ctx.lineWidth = 1.5 + effect.tier;
        ctx.beginPath();
        ctx.moveTo(effect.shooterX, effect.shooterY);
        ctx.lineTo(effect.x, effect.y);
        ctx.stroke();
      }

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
    } else if (effect.type === 'explosion') {
      const t = Math.min(1, age / 420);
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.strokeStyle = '#B6FFB6';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, 10 + t * 90, 0, TAU);
      ctx.stroke();

      ctx.globalAlpha = (1 - t) * 0.5;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, 6 + t * 40, 0, TAU);
      ctx.fill();
      ctx.restore();
    } else if (effect.type === 'pierce') {
      const t = Math.min(1, age / 260);
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = '#E6FBFF';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(effect.x, effect.y);
      ctx.lineTo(effect.endX, effect.endY);
      ctx.stroke();
      ctx.restore();
    } else if (effect.type === 'powerupUnlocked') {
      const t = Math.min(1, age / 700);
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.strokeStyle = POWERUP_LABEL_COLOR;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, 14 + t * 70, 0, TAU);
      ctx.stroke();

      ctx.globalAlpha = 1 - t;
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = POWERUP_LABEL_COLOR;
      ctx.fillText(effect.powerupType.toUpperCase(), effect.x, effect.y - 20 - t * 24);
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

function drawPulse(ctx, gameState, now) {
  const pulse = gameState.activePulse;
  if (!pulse) return;
  const radius = ((now - pulse.startedAt) / 1000) * gameState.config.pulseSpeed;
  const { braincell } = gameState;

  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = '#BFEFFF';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(braincell.x, braincell.y, Math.max(0, radius), 0, TAU);
  ctx.stroke();

  ctx.globalAlpha = 0.15;
  ctx.lineWidth = 26;
  ctx.beginPath();
  ctx.arc(braincell.x, braincell.y, Math.max(0, radius - 10), 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawNightOverlay(ctx, gameState) {
  if (!gameState.config.nightMode) return;
  // Chroma key needs a clean, uniform color for OBS to key out - never darken it.
  if (gameState.config.background === 'chromakey') return;
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

/** Decaying random jitter while gameState.shake is active - clears itself once it runs out. */
function computeShake(gameState, now) {
  const shake = gameState.shake;
  if (!shake) return { x: 0, y: 0 };
  const elapsed = now - shake.startedAt;
  if (elapsed >= shake.duration) {
    gameState.shake = null;
    return { x: 0, y: 0 };
  }
  const remaining = 1 - elapsed / shake.duration;
  const magnitude = shake.magnitude * remaining;
  return { x: (Math.random() * 2 - 1) * magnitude, y: (Math.random() * 2 - 1) * magnitude };
}

export function render(ctx, gameState) {
  const now = performance.now();
  const { braincell, config, arcRadius, canvasWidth, canvasHeight } = gameState;
  const fogRadius = config.fogEnabled ? (arcRadius || config.arcMinRadius) + config.fogViewRange : Infinity;

  const shakeOffset = computeShake(gameState, now);
  ctx.save();
  ctx.translate(shakeOffset.x, shakeOffset.y);

  // --- Pixelated world layer: background, braincell, perimeter, bodies ---
  const pctx = getPixelContext(canvasWidth, canvasHeight);

  drawBackground(pctx, gameState);
  drawBraincell(pctx, gameState, now);
  drawPerimeterArc(pctx, gameState);

  for (const zombie of gameState.zombies.values()) {
    const dist = Math.hypot(zombie.x - braincell.x, zombie.y - braincell.y);
    if (dist > fogRadius) continue;
    drawZombieBody(pctx, zombie, now);
  }

  for (const player of gameState.players.values()) {
    if (!player.alive) continue;
    drawSurvivorBody(pctx, player, now);
  }

  // Blit the low-res buffer up to full size with smoothing off - this is what
  // actually produces the blocky/8-bit edges on circles and wobbly blobs.
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(pixelCanvas, 0, 0, pixelCanvas.width, pixelCanvas.height, 0, 0, canvasWidth, canvasHeight);
  ctx.restore();

  // --- Full-resolution layer: every label, plus transient effects, stays crisp ---
  for (const zombie of gameState.zombies.values()) {
    const dist = Math.hypot(zombie.x - braincell.x, zombie.y - braincell.y);
    if (dist > fogRadius) continue;
    drawZombieLabel(ctx, zombie, now);
  }

  for (const player of gameState.players.values()) {
    if (!player.alive) continue;
    drawSurvivorLabel(ctx, player);
  }

  drawEffects(ctx, gameState);
  drawPulse(ctx, gameState, now);
  drawNightOverlay(ctx, gameState);

  ctx.restore(); // undo the shake translate
}
