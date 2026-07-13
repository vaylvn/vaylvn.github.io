import { createPlayer, awardKill, consumeGrenade, layoutPlayers } from './player.js';
import { clearDensestLane } from './zombie.js';

const EFFECT_TTL = {
  kill: 420,
  hit: 180,
  whiff: 380,
  grenade: 500,
};

function pushEffect(gameState, effect) {
  gameState.effects.push({ ...effect, startedAt: performance.now() });
}

function isPrivileged(msg) {
  return msg.isBroadcaster || msg.isMod;
}

function joinPlayer(gameState, msg) {
  let player = gameState.players.get(msg.userId);
  if (!player) {
    player = createPlayer(msg.userId, msg.displayName);
    gameState.players.set(msg.userId, player);
    layoutPlayers(gameState.players, gameState.canvasWidth, gameState.survivorLineY);
  } else {
    player.name = msg.displayName; // refresh display name in case it changed case
  }
  return player;
}

function getOrCreatePlayer(gameState, msg) {
  // "Anyone in chat kills a zombie by typing its word" - lazily join so a kill
  // always has a scorer, even if the chatter skipped an explicit !join.
  return joinPlayer(gameState, msg);
}

function tryGrenade(gameState, player, codeArg) {
  if (player.grenades <= 0) return;
  const expected = (player.grenadeCode || '').toLowerCase();
  const given = (codeArg || '').toLowerCase();
  if (!given || given !== expected) return;

  const lane = clearDensestLane(gameState);
  consumeGrenade(player);
  if (lane >= 0) {
    pushEffect(gameState, { type: 'grenade', lane });
  }
}

function resolveCommand(gameState, text, msg) {
  const [cmd, arg] = text.split(/\s+/, 2);

  switch (cmd) {
    case '!join': {
      if (gameState.state === 'LOBBY' || gameState.state === 'PLAYING') {
        joinPlayer(gameState, msg);
      }
      return;
    }
    case '!start': {
      if (isPrivileged(msg) && (gameState.state === 'LOBBY' || gameState.state === 'CONFIG')) {
        gameState.startPlaying();
      }
      return;
    }
    case '!stop':
    case '!end': {
      if (isPrivileged(msg) && gameState.state === 'PLAYING') {
        gameState.endGame();
      }
      return;
    }
    case '!grenade': {
      if (gameState.state !== 'PLAYING') return;
      const player = gameState.players.get(msg.userId);
      if (!player) return;
      tryGrenade(gameState, player, arg);
      return;
    }
    default:
      return; // unknown command, ignore
  }
}

function resolveWordKill(gameState, text, msg) {
  if (gameState.state !== 'PLAYING') return;
  if (!text) return;

  // Dying zombies stay searchable for one tick: a message landing on a word
  // whose zombie was *just* killed by an earlier message should whiff, not
  // silently vanish as "no target" (see resolveWordKill's claimedBy check below).
  let target = null;
  for (const zombie of gameState.zombies.values()) {
    if (zombie.word === text) {
      target = zombie;
      break;
    }
  }
  if (!target) return; // no matching zombie: no penalty, no effect

  const player = getOrCreatePlayer(gameState, msg);

  if (target.claimedBy) {
    // Someone else's message already resolved this exact zombie a hair earlier.
    pushEffect(gameState, { type: 'whiff', x: player.position.x, y: player.position.y, playerId: player.id });
    return;
  }

  target.hitsRemaining--;
  if (target.hitsRemaining <= 0) {
    target.claimedBy = player.id;
    target.dying = true;
    target.diedAt = performance.now();
    awardKill(player, gameState.config);
    pushEffect(gameState, {
      type: 'kill',
      x: target.x,
      y: target.y,
      word: target.word,
      shooterX: player.position.x,
      shooterY: player.position.y,
      color: player.color,
      tier: player.weaponTier,
    });
  } else {
    target.flinchUntil = performance.now() + 150;
    pushEffect(gameState, { type: 'hit', x: target.x, y: target.y });
  }
}

export function resolveMessage(gameState, msg) {
  const text = (msg.text || '').trim().toLowerCase();
  if (!text) return;

  if (text.startsWith('!')) {
    resolveCommand(gameState, text, msg);
  } else {
    resolveWordKill(gameState, text, msg);
  }
}

export function pruneEffects(gameState) {
  const now = performance.now();
  gameState.effects = gameState.effects.filter(e => now - e.startedAt < (EFFECT_TTL[e.type] || 400));
}
