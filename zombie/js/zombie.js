import { pickWord } from './wordlist.js';

let nextId = 1;

export function resetZombieIdCounter() {
  nextId = 1;
}

/** How long a killed zombie's death animation plays before it's removed from the pool. */
const DEATH_LINGER_MS = 260;

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
  const lane = Math.floor(Math.random() * config.laneCount);
  const laneWidth = canvasWidth / config.laneCount;

  const zombie = {
    id: nextId++,
    word,
    type,
    armored: isArmored,
    hitsRemaining: hp,
    maxHits: hp,
    speed,
    lane,
    x: laneWidth * (lane + 0.5),
    y: -24,
    claimedBy: null,
    dying: false,
    diedAt: 0,
    flinchUntil: 0,
    spawnedAt: performance.now(),
  };
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

export function updateZombies(gameState, dt, lineY) {
  for (const zombie of gameState.zombies.values()) {
    if (zombie.dying) continue;
    zombie.y += zombie.speed * dt;
    if (zombie.y >= lineY) {
      // v1 has no lose condition: a zombie reaching the line just despawns.
      gameState.zombies.delete(zombie.id);
    }
  }

  const now = performance.now();
  for (const zombie of gameState.zombies.values()) {
    if (zombie.dying && now - zombie.diedAt > DEATH_LINGER_MS) {
      gameState.zombies.delete(zombie.id);
    }
  }
}

/** Clears every alive zombie in the lane with the most zombies. Returns the lane index cleared, or -1. */
export function clearDensestLane(gameState) {
  const counts = new Map();
  for (const zombie of gameState.zombies.values()) {
    if (zombie.dying) continue;
    counts.set(zombie.lane, (counts.get(zombie.lane) || 0) + 1);
  }
  if (counts.size === 0) return -1;

  let bestLane = -1;
  let bestCount = 0;
  for (const [lane, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      bestLane = lane;
    }
  }

  for (const zombie of gameState.zombies.values()) {
    if (zombie.lane === bestLane && !zombie.dying) {
      gameState.zombies.delete(zombie.id);
    }
  }
  return bestLane;
}
