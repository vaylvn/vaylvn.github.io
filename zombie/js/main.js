import { createDefaultConfig, wireConfigPanel } from './config.js';
import { connectTwitch } from './twitch.js';
import { resolveMessage, pruneEffects, getPulseStatus, getActivePowerup } from './combat.js';
import { layoutSemicircle, updatePlayerPositions, updatePlayerAim, resetPlayerColorCycle } from './player.js';
import { spawnZombie, updateZombies, updatePulse, getSpawnInterval, resetZombieIdCounter } from './zombie.js';
import { initLeaderboard, updateLeaderboard } from './leaderboard.js';
import { showResults, hideResults } from './results.js';
import { render } from './render.js';
import { unlockAudio, stopAllZombieWalks, playStart, startBackground, stopBackground, updateBackgroundIntensity } from './audio.js';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const gameState = {
  state: 'BOOT',
  channel: '',
  players: new Map(),
  zombies: new Map(),
  effects: [],
  pulseVotes: new Set(),
  activePulse: null,
  pulseUsed: false,
  activePowerup: null,
  shake: null,
  config: createDefaultConfig(),
  canvasWidth: 0,
  canvasHeight: 0,
  braincell: { x: 0, y: 0 },
  arcRadius: 0,
  playStartedAt: 0,
  endedAt: 0,
  lastSpawnAt: 0,
  startPlaying,
  endGame,
  resetToLobby,
  layoutSemicircle, // exposed so zombie.js can recompact the arc right after a death
};

function setState(next) {
  gameState.state = next;
  document.body.dataset.gameState = next;
  document.getElementById('hud-state').textContent = next;
}

function startPlaying() {
  if (gameState.state !== 'LOBBY' || gameState.players.size === 0) return;
  gameState.playStartedAt = performance.now();
  gameState.lastSpawnAt = gameState.playStartedAt;
  setState('PLAYING');
  playStart();
  startBackground();
}

function endGame(reason = 'stopped') {
  if (gameState.state !== 'PLAYING') return;
  gameState.endedAt = performance.now();
  setState('ENDED');
  stopAllZombieWalks(); // the world is frozen for the results screen - nothing should keep shuffling
  stopBackground();
  showResults(gameState, reason);
}

function resetToLobby() {
  if (gameState.state !== 'ENDED') return;
  gameState.players.clear();
  gameState.zombies.clear();
  gameState.effects = [];
  gameState.pulseVotes.clear();
  gameState.activePulse = null;
  gameState.pulseUsed = false;
  gameState.activePowerup = null;
  gameState.shake = null;
  gameState.arcRadius = 0;
  resetPlayerColorCycle();
  resetZombieIdCounter();
  stopAllZombieWalks();
  stopBackground();

  hideResults();
  initLeaderboard();
  document.getElementById('hud-timer').textContent = '00:00';
  document.getElementById('hud-alive').textContent = '0/0';
  document.getElementById('hud-pulse').textContent = '0/0';
  document.getElementById('hud-powerup-wrap').classList.add('hidden');

  setState('LOBBY');
  resizeCanvas();
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  gameState.canvasWidth = rect.width;
  gameState.canvasHeight = rect.height;
  gameState.braincell.x = rect.width / 2;
  gameState.braincell.y = rect.height - gameState.config.braincellBottomMargin;

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  layoutSemicircle(gameState);
}

window.addEventListener('resize', resizeCanvas);

// --- Boot: real Twitch connection or local test mode ---

function enterLobby(channelLabel) {
  gameState.channel = channelLabel;
  document.getElementById('hud-channel').textContent = channelLabel;
  document.getElementById('boot-overlay').classList.add('hidden');
  initLeaderboard();
  setState('LOBBY');
  resizeCanvas();
}

document.getElementById('connect-form').addEventListener('submit', e => {
  e.preventDefault();
  unlockAudio(); // this click is a real user gesture - primes playback for later async chat-triggered sounds
  const testMode = document.getElementById('test-mode-toggle').checked;
  const channelInput = document.getElementById('channel-input').value.trim();
  const errorEl = document.getElementById('boot-error');
  errorEl.textContent = '';

  if (testMode) {
    document.getElementById('test-console').classList.remove('hidden');
    enterLobby(channelInput ? `${channelInput} (test mode)` : 'test mode');
    return;
  }

  if (!channelInput) {
    errorEl.textContent = 'Enter a Twitch channel name.';
    return;
  }

  connectTwitch(channelInput.toLowerCase(), {
    onConnected: () => enterLobby(channelInput),
    onMessage: msg => resolveMessage(gameState, msg),
    onError: err => { errorEl.textContent = `Connection failed: ${err}`; },
  });
});

// --- Test console: simulate chat without a live Twitch connection ---

document.getElementById('test-form').addEventListener('submit', e => {
  e.preventDefault();
  const nameEl = document.getElementById('test-username');
  const textEl = document.getElementById('test-message');
  const broadcasterEl = document.getElementById('test-broadcaster');

  const name = nameEl.value.trim() || 'tester1';
  const text = textEl.value.trim();
  if (!text) return;

  resolveMessage(gameState, {
    userId: name.toLowerCase(),
    displayName: name,
    text,
    isBroadcaster: broadcasterEl.checked,
    isMod: false,
  });
  textEl.value = '';
  textEl.focus();
});

document.querySelectorAll('[data-test-fill]').forEach(btn => {
  btn.addEventListener('click', () => {
    const textEl = document.getElementById('test-message');
    textEl.value = btn.dataset.testFill;
    textEl.focus();
  });
});

// --- Config panel ---
wireConfigPanel(gameState);

// On-page convenience buttons mirror !start / !stop for the streamer's own screen.
document.getElementById('start-round-btn').addEventListener('click', startPlaying);
document.getElementById('stop-round-btn').addEventListener('click', () => endGame('stopped'));
document.getElementById('back-to-lobby-btn').addEventListener('click', resetToLobby);

// --- Main loop ---
let lastFrameTime = performance.now();

function tick(now) {
  const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
  lastFrameTime = now;

  if (gameState.state === 'PLAYING') {
    if (now - gameState.lastSpawnAt >= getSpawnInterval(gameState)) {
      spawnZombie(gameState);
      gameState.lastSpawnAt = now;
    }
    updateZombies(gameState, dt);
    updatePulse(gameState);
    updateBackgroundIntensity(gameState, dt);

    const elapsedSec = Math.floor((now - gameState.playStartedAt) / 1000);
    const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
    const ss = String(elapsedSec % 60).padStart(2, '0');
    document.getElementById('hud-timer').textContent = `${mm}:${ss}`;

    const { current, required, used } = getPulseStatus(gameState);
    document.getElementById('hud-pulse').textContent = used ? 'used' : `${current}/${required}`;

    const activePowerup = getActivePowerup(gameState);
    const powerupWrap = document.getElementById('hud-powerup-wrap');
    powerupWrap.classList.toggle('hidden', !activePowerup);
    if (activePowerup) {
      const secondsLeft = Math.max(0, Math.ceil((activePowerup.expiresAt - now) / 1000));
      document.getElementById('hud-powerup').textContent = `${activePowerup.type} ${secondsLeft}s`;
    }
  }

  if (gameState.state === 'LOBBY' || gameState.state === 'PLAYING') {
    updatePlayerPositions(gameState, dt);
    updatePlayerAim(gameState, dt);
    pruneEffects(gameState);
    render(ctx, gameState);
    updateLeaderboard(gameState);

    const aliveCount = [...gameState.players.values()].filter(p => p.alive).length;
    document.getElementById('hud-alive').textContent = `${aliveCount}/${gameState.players.size}`;
  }

  if (gameState.state === 'LOBBY') {
    const startBtn = document.getElementById('start-round-btn');
    const noPlayers = gameState.players.size === 0;
    startBtn.disabled = noPlayers;
    document.getElementById('start-hint').classList.toggle('hidden', !noPlayers);
  }

  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
