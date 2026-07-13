import { createPlayer, awardKill, aimAt } from './player.js';
import { triggerPulse } from './zombie.js';
import { pickWord } from './wordlist.js';
import { playShoot, stopZombieWalk } from './audio.js';

const EFFECT_TTL = {
  kill: 420,
  hit: 180,
  whiff: 380,
  playerHit: 260,
  overrun: 900,
};

function pushEffect(gameState, effect) {
  gameState.effects.push({ ...effect, startedAt: performance.now() });
}

function isPrivileged(msg) {
  return msg.isBroadcaster || msg.isMod;
}

/**
 * Returns the player, or null if this chatter can't join right now: already
 * died this round (no rejoining), or is a brand-new chatter arriving after
 * !start while allowMidGameJoin is off. Existing alive players are always
 * welcome back regardless of that toggle - it only gates *new* arrivals.
 */
function joinPlayer(gameState, msg) {
  const existing = gameState.players.get(msg.userId);
  if (existing) {
    if (!existing.alive) return null;
    existing.name = msg.displayName; // refresh display name in case it changed case
    return existing;
  }

  const canJoinNow = gameState.state === 'LOBBY'
    || (gameState.state === 'PLAYING' && gameState.config.allowMidGameJoin);
  if (!canJoinNow) return null;

  const player = createPlayer(msg.userId, msg.displayName, gameState.config);
  gameState.players.set(msg.userId, player);
  gameState.layoutSemicircle(gameState);
  return player;
}

/** Current vote count vs. how many alive survivors are needed - shared with the HUD readout. */
export function getPulseStatus(gameState) {
  const aliveCount = [...gameState.players.values()].filter(p => p.alive).length;
  const required = Math.max(1, Math.ceil(aliveCount * gameState.config.pulseVoteRatio));
  const current = [...gameState.pulseVotes].filter(id => gameState.players.get(id)?.alive).length;
  return { current, required, used: gameState.pulseUsed };
}

/** A one-time communal panic button: needs pulseVoteRatio of currently-alive survivors to type !pulse before it fires. */
function tryPulse(gameState, player) {
  if (gameState.pulseUsed) return;
  gameState.pulseVotes.add(player.id);

  const { current, required } = getPulseStatus(gameState);
  if (current >= required) {
    gameState.pulseVotes.clear();
    gameState.pulseUsed = true;
    triggerPulse(gameState);
  }
}

function resolveCommand(gameState, text, msg) {
  const [cmd] = text.split(/\s+/, 2);

  switch (cmd) {
    case '!join': {
      joinPlayer(gameState, msg); // no-ops on its own if this isn't a valid time/chatter to join
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
        gameState.endGame('stopped');
      }
      return;
    }
    case '!pulse': {
      if (gameState.state !== 'PLAYING') return;
      const player = gameState.players.get(msg.userId);
      if (!player || !player.alive) return;
      tryPulse(gameState, player);
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
  // silently vanish as "no target" (see the claimedBy check below).
  let target = null;
  for (const zombie of gameState.zombies.values()) {
    if (zombie.word === text) {
      target = zombie;
      break;
    }
  }
  if (!target) return; // no matching zombie: no penalty, no effect

  // "Anyone in chat kills a zombie by typing its word" - lazily join so a kill
  // always has a scorer, even if the chatter skipped an explicit !join. A
  // chatter who already died this round is out for good: no join, no kills.
  const player = joinPlayer(gameState, msg);
  if (!player) return;

  if (target.claimedBy) {
    // Someone else's message already resolved this exact zombie a hair earlier.
    pushEffect(gameState, { type: 'whiff', x: player.position.x, y: player.position.y, playerId: player.id });
    return;
  }

  aimAt(player, target.x, target.y);
  playShoot();

  target.hitsRemaining--;
  if (target.hitsRemaining <= 0) {
    target.claimedBy = player.id;
    target.dying = true;
    target.diedAt = performance.now();
    stopZombieWalk(target);
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
    // Armored, first hit: a *different* word for hit 2, not a retype of the
    // same one - keeps the "coordinate a takedown" moment without the
    // annoyance of typing an identical string twice.
    const usedWords = new Set([...gameState.zombies.values()].map(z => z.word));
    usedWords.delete(target.word);
    target.word = pickWord(target.minLen, target.maxLen, usedWords);
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
