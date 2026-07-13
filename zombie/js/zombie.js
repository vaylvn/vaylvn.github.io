import { pickWord } from './wordlist.js';
import { damagePlayer } from './player.js';

let nextId = 1;

export function resetZombieIdCounter() {
  nextId = 1;
}

/** How long a killed zombie's death animation plays before it's removed from the pool. */
const DEATH_LINGER_MS = 260;

function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function findNearestAlivePlayer(gameState, x, y) {
  let best = null;
  let bestDist = Infinity;
  for (const player of gameState.players.values()) {
    if (!player.alive) continue;
    const dx = player.position.x - x;
    const dy = player.position.y - y;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = player;
    }
  }
  return best;
}

/**
 * Every zombie prefers a living player over the braincell - the perimeter is
 * only exposed once nobody is left to intercept it. Resolved fresh each frame
 * so a zombie whose target died mid-approach smoothly retargets instead of
 * beelining for empty space.
 */
function resolveTarget(gameState, zombie) {
  if (zombie.targetType === 'player') {
    const player = gameState.players.get(zombie.targetId);
    if (player && player.alive) return player;
  }
  const nearest = findNearestAlivePlayer(gameState, zombie.x, zombie.y);
  if (nearest) {
    zombie.targetType = 'player';
    zombie.targetId = nearest.id;
    return nearest;
  }
  zombie.targetType = 'braincell';
  zombie.targetId = null;
  return gameState.braincell;
}

export function spawnZombie(gameState) {
  const { config, zombies, canvasWidth } = gameState;
  const usedWords = new Set([...zombies.values()].map(z => z.word));

  const isTank = Math.random() < config.longWordChance;
  const isFast = !isTank && Math.random() < config.fastChance;
  const isArmored = Math.random() < config.armoredChance;

  let type = 'normal';
  let minLen = config.wordMin;
  let maxLen = config.wordMax;
  let speed = 55;

  if (isTank) {
    type = 'tank';
    minLen = 9;
    maxLen = 10;
    speed = 26;
  } else if (isFast) {
    type = 'fast';
    minLen = 3;
    maxLen = 4;
    speed = 125;
  }

  const hp = isArmored ? 2 : 1;
  const word = pickWord(minLen, maxLen, usedWords);
  const x = Math.random() * canvasWidth;
  const y = -24;

  const rand = seededRandom(nextId * 7919 + 13);
  const wanderAmp = config.wanderAmpMin + rand() * (config.wanderAmpMax - config.wanderAmpMin);
  const wanderFreq = config.wanderFreqMin + rand() * (config.wanderFreqMax - config.wanderFreqMin);
  const wanderPhase = rand() * Math.PI * 2;

  const zombie = {
    id: nextId++,
    word,
    minLen,
    maxLen,
    type,
    armored: isArmored,
    hitsRemaining: hp,
    maxHits: hp,
    speed,
    x,
    y,
    targetType: null,
    targetId: null,
    wanderAmp,
    wanderFreq,
    wanderPhase,
    claimedBy: null,
    dying: false,
    diedAt: 0,
    flinchUntil: 0,
    spawnedAt: performance.now(),
  };
  resolveTarget(gameState, zombie);
  zombies.set(zombie.id, zombie);
  return zombie;
}

/** Geometric ramp with a hard floor, plus a soft "wave" notch every ~30s for readable pacing beats. */
export function getSpawnInterval(gameState) {
  const { config, playStartedAt } = gameState;
  const elapsedSec = (performance.now() - playStartedAt) / 1000;
  const waveNumber = Math.floor(elapsedSec / 30);
  const interval = config.baseSpawnInterval * Math.pow(config.spawnRampRate, waveNumber);
  return Math.max(config.minSpawnInterval, interval);
}

function handleContact(gameState, zombie, target) {
  if (zombie.targetType === 'player') {
    damagePlayer(target, 1);
    gameState.effects.push({ type: 'playerHit', x: target.position.x, y: target.position.y, startedAt: performance.now() });
    if (!target.alive) {
      gameState.layoutSemicircle(gameState);
    }
  } else {
    gameState.effects.push({ type: 'overrun', x: gameState.braincell.x, y: gameState.braincell.y, startedAt: performance.now() });
    gameState.endGame('overrun');
  }
  gameState.zombies.delete(zombie.id);
}

export function updateZombies(gameState, dt) {
  const now = performance.now();

  for (const zombie of gameState.zombies.values()) {
    if (zombie.dying) continue;

    const target = resolveTarget(gameState, zombie);
    const targetX = zombie.targetType === 'player' ? target.position.x : target.x;
    const targetY = zombie.targetType === 'player' ? target.position.y : target.y;

    const dx = targetX - zombie.x;
    const dy = targetY - zombie.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= gameState.config.contactRadius) {
      handleContact(gameState, zombie, target);
      continue;
    }

    const dirX = dx / dist;
    const dirY = dy / dist;
    const perpX = -dirY;
    const perpY = dirX;

    const wanderDamp = Math.min(1, dist / gameState.config.wanderDampDistance);
    const lateral = Math.sin((now / 1000) * zombie.wanderFreq * Math.PI * 2 + zombie.wanderPhase)
      * zombie.wanderAmp * wanderDamp;

    zombie.x += dirX * zombie.speed * dt + perpX * lateral * dt * 2;
    zombie.y += dirY * zombie.speed * dt + perpY * lateral * dt * 2;
  }

  for (const zombie of gameState.zombies.values()) {
    if (zombie.dying && now - zombie.diedAt > DEATH_LINGER_MS) {
      gameState.zombies.delete(zombie.id);
    }
  }
}

/** Clears every alive zombie currently targeting the given player - a personal panic button, not a screen-wipe. */
export function clearZombiesTargetingPlayer(gameState, playerId) {
  let cleared = 0;
  for (const zombie of gameState.zombies.values()) {
    if (zombie.dying) continue;
    if (zombie.targetType === 'player' && zombie.targetId === playerId) {
      gameState.zombies.delete(zombie.id);
      cleared++;
    }
  }
  return cleared;
}
