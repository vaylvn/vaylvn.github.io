import { SURVIVOR_PALETTE } from './palette.js';

let joinCounter = 0;

function generateGrenadeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 3; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function createPlayer(id, name, config) {
  const color = SURVIVOR_PALETTE[joinCounter % SURVIVOR_PALETTE.length];
  joinCounter++;
  return {
    id,
    name,
    color,
    kills: 0,
    weaponTier: 0,
    grenades: 0,
    grenadeCode: null,
    joinOrder: joinCounter,
    health: config.playerMaxHealth,
    maxHealth: config.playerMaxHealth,
    alive: true,
    deadAt: 0,
    hitFlashUntil: 0,
    position: { x: 0, y: 0 }, // rendered position, smoothly lerps toward targetPosition
    targetPosition: { x: 0, y: 0 }, // arc slot assigned by layoutSemicircle
    lastActionAt: 0,
  };
}

export function resetPlayerColorCycle() {
  joinCounter = 0;
}

export function damagePlayer(player, amount = 1) {
  player.health = Math.max(0, player.health - amount);
  player.hitFlashUntil = performance.now() + 200;
  if (player.health <= 0 && player.alive) {
    player.alive = false;
    player.deadAt = performance.now();
  }
}

/**
 * Arranges alive players along an upward-opening semicircle centered on the
 * braincell. Radius grows with alive count (more arc-length needed to keep
 * spacing readable) and shrinks again as players die, so the perimeter
 * visibly recompacts under attrition instead of leaving permanent gaps.
 */
export function layoutSemicircle(gameState) {
  const { players, braincell, config, canvasWidth, canvasHeight } = gameState;
  const alive = [...players.values()].filter(p => p.alive).sort((a, b) => a.joinOrder - b.joinOrder);
  const n = alive.length;

  const maxRadiusByWidth = canvasWidth / 2 - config.arcMargin;
  const maxRadiusByHeight = braincell.y - config.arcTopMargin;
  const maxRadius = Math.max(config.arcMinRadius, Math.min(maxRadiusByWidth, maxRadiusByHeight));

  const desiredRadius = n === 0 ? config.arcMinRadius : (config.arcSpacing * n) / config.arcSpan;
  const radius = Math.min(maxRadius, Math.max(config.arcMinRadius, desiredRadius));
  gameState.arcRadius = radius;

  const centerAngle = Math.PI * 1.5; // straight up from the braincell
  const startAngle = centerAngle - config.arcSpan / 2;

  alive.forEach((player, i) => {
    const angle = startAngle + ((i + 0.5) / Math.max(1, n)) * config.arcSpan;
    player.targetPosition.x = braincell.x + Math.cos(angle) * radius;
    player.targetPosition.y = braincell.y + Math.sin(angle) * radius;
    if (player.position.x === 0 && player.position.y === 0) {
      // First placement: snap instead of lerping in from the origin corner.
      player.position.x = player.targetPosition.x;
      player.position.y = player.targetPosition.y;
    }
  });
}

export function updatePlayerPositions(gameState, dt) {
  const smoothing = Math.min(1, dt * gameState.config.positionSmoothing);
  for (const player of gameState.players.values()) {
    if (!player.alive) continue;
    player.position.x += (player.targetPosition.x - player.position.x) * smoothing;
    player.position.y += (player.targetPosition.y - player.position.y) * smoothing;
  }
}

export function awardKill(player, config) {
  player.kills++;
  player.lastActionAt = performance.now();

  const milestonesHit = config.weaponMilestones.filter(m => player.kills >= m).length;
  player.weaponTier = Math.min(milestonesHit, config.weaponMilestones.length);

  if (player.kills % config.grenadeMilestone === 0 && player.grenades < config.grenadeCap) {
    player.grenades++;
    player.grenadeCode = generateGrenadeCode();
  }
}

export function consumeGrenade(player) {
  player.grenades = Math.max(0, player.grenades - 1);
  player.grenadeCode = player.grenades > 0 ? generateGrenadeCode() : null;
}
