import { SURVIVOR_PALETTE } from './palette.js';

let joinCounter = 0;

function generateGrenadeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 3; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function createPlayer(id, name) {
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
    position: { x: 0, y: 0 },
    lastActionAt: 0,
    effect: null, // { type: 'muzzle' | 'whiff', targetX, targetY, startedAt }
  };
}

export function resetPlayerColorCycle() {
  joinCounter = 0;
}

/** Spread players evenly along the survivor line, in join order. */
export function layoutPlayers(players, width, lineY) {
  const list = [...players.values()].sort((a, b) => a.joinOrder - b.joinOrder);
  const n = list.length;
  if (n === 0) return;
  const margin = Math.min(60, width / (n + 1));
  const usableWidth = width - margin * 2;
  list.forEach((player, i) => {
    const x = n === 1 ? width / 2 : margin + (usableWidth * i) / (n - 1);
    player.position.x = x;
    player.position.y = lineY;
  });
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
