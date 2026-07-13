import { createDefaultConfig, wireConfigPanel } from './config.js';
import { connectTwitch } from './twitch.js';
import { resolveMessage, pruneEffects } from './combat.js';
import { layoutPlayers } from './player.js';
import { spawnZombie, updateZombies, getSpawnInterval } from './zombie.js';
import { initLeaderboard, updateLeaderboard } from './leaderboard.js';
import { render } from './render.js';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const gameState = {
  state: 'BOOT',
  channel: '',
  players: new Map(),
  zombies: new Map(),
  effects: [],
  config: createDefaultConfig(),
  canvasWidth: 0,
  canvasHeight: 0,
  survivorLineY: 0,
  playStartedAt: 0,
  lastSpawnAt: 0,
  startPlaying,
  endGame,
};

function setState(next) {
  gameState.state = next;
  document.body.dataset.gameState = next;
  document.getElementById('hud-state').textContent = next;
}

function startPlaying() {
  if (gameState.state !== 'LOBBY') return;
  gameState.playStartedAt = performance.now();
  gameState.lastSpawnAt = gameState.playStartedAt;
  setState('PLAYING');
}

function endGame() {
  if (gameState.state !== 'PLAYING') return;
  setState('ENDED');
  document.getElementById('final-banner').classList.remove('hidden');
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  gameState.canvasWidth = rect.width;
  gameState.canvasHeight = rect.height;
  gameState.survivorLineY = rect.height - 90;

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  layoutPlayers(gameState.players, gameState.canvasWidth, gameState.survivorLineY);
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
document.getElementById('stop-round-btn').addEventListener('click', endGame);

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
    updateZombies(gameState, dt, gameState.survivorLineY);

    const elapsedSec = Math.floor((now - gameState.playStartedAt) / 1000);
    const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
    const ss = String(elapsedSec % 60).padStart(2, '0');
    document.getElementById('hud-timer').textContent = `${mm}:${ss}`;
  }

  pruneEffects(gameState);

  if (gameState.state === 'LOBBY' || gameState.state === 'PLAYING' || gameState.state === 'ENDED') {
    render(ctx, gameState);
    updateLeaderboard(gameState);
  }

  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
