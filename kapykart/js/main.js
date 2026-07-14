import { connectTwitch } from './twitch.js';
import { buildTrack, loadTrackDef } from './track.js';
import { createKart, updateKart, resetKartColorCycle } from './kart.js';
import { applyTrackEvents, createChaosState, updateChaosEvent } from './events.js';
import { render, setAssets } from './render.js';
import { loadAssets } from './assets.js';
import { KART_PALETTE } from './palette.js';
import { wireCameraUI, updateCameraUI } from './ui.js';
import { initLeaderboard, updateLeaderboard } from './leaderboard.js';
import { unlockAudio, playJoin, playRaceStart, playBoost, playHazard, playChaosHit, playFinish } from './audio.js';

const floorCanvas = document.getElementById('floor-canvas');
const floorCtx = floorCanvas.getContext('2d');
const spriteCanvas = document.getElementById('sprite-canvas');
const spriteCtx = spriteCanvas.getContext('2d');
const layers = { floorCanvas, floorCtx, spriteCanvas, spriteCtx };

const gameState = {
  state: 'BOOT',
  channel: '',
  track: null, // set once loadTrackDef()/buildTrack() resolve, see boot() below
  karts: new Map(),
  chaos: createChaosState(0),
  chaosEnabled: true,
  camera: { mode: 'overview', followedId: null, zoomFactor: 1.2 },
  canvasWidth: 0,
  canvasHeight: 0,
  overviewHitboxes: [],
  raceStartedAt: 0,
  raceEndedAt: 0,
};

function setState(next) {
  gameState.state = next;
  document.body.dataset.gameState = next;
  document.getElementById('hud-state').textContent = next;
}

function resizeCanvases() {
  const dpr = window.devicePixelRatio || 1;
  const rect = spriteCanvas.parentElement.getBoundingClientRect();
  gameState.canvasWidth = rect.width;
  gameState.canvasHeight = rect.height;

  for (const canvas of [floorCanvas, spriteCanvas]) {
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
  }
  floorCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  spriteCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener('resize', resizeCanvases);

// --- Chat: the only chat-driven action is !join (see spec §1/§7) ---

function handleChatMessage(gameState, msg) {
  const text = msg.text.trim().toLowerCase();
  if (text !== '!join') return;
  if (gameState.state !== 'LOBBY') return;

  const existing = gameState.karts.get(msg.userId);
  if (existing) {
    existing.name = msg.displayName;
    return;
  }

  const kart = createKart(msg.userId, msg.displayName, gameState.track);
  gameState.karts.set(msg.userId, kart);
  playJoin();
}

// --- Race lifecycle ---

function startRace() {
  if (gameState.state !== 'LOBBY' || gameState.karts.size === 0) return;
  const lapsInput = document.getElementById('cfg-laps');
  gameState.track.def.laps = Number(lapsInput.value);
  gameState.chaosEnabled = document.getElementById('cfg-chaos-toggle').checked;
  gameState.chaos = createChaosState(performance.now());
  gameState.raceStartedAt = performance.now();
  gameState.camera.mode = 'overview';
  gameState.camera.followedId = null;
  setState('PLAYING');
  playRaceStart();
}

function endRace() {
  gameState.raceEndedAt = performance.now();
  setState('ENDED');
  showResults();
  playFinish();
}

function resetToLobby() {
  if (gameState.state !== 'ENDED') return;
  gameState.karts.clear();
  resetKartColorCycle();
  gameState.camera.mode = 'overview';
  gameState.camera.followedId = null;
  document.getElementById('results-screen').classList.add('hidden');
  initLeaderboard();
  setState('LOBBY');
}

function rankedKarts() {
  return [...gameState.karts.values()].sort((a, b) => {
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    return b.totalProgress - a.totalProgress;
  });
}

function showResults() {
  const tbody = document.getElementById('results-table-body');
  tbody.innerHTML = '';
  const ranked = rankedKarts();
  ranked.forEach((kart, i) => {
    const tr = document.createElement('tr');
    const lapsShown = kart.finished ? gameState.track.def.laps : Math.min(kart.lap + 1, gameState.track.def.laps);
    const pct = Math.floor(kart.lapProgress * 100);
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td style="color:${kart.color}">${kart.name}</td>
      <td>${kart.finished ? 'Finished' : `Lap ${lapsShown} (${pct}%)`}</td>
    `;
    tbody.appendChild(tr);
  });
  document.getElementById('results-screen').classList.remove('hidden');
}

// --- Boot: real Twitch connection or local test mode ---

function enterLobby(channelLabel) {
  gameState.channel = channelLabel;
  document.getElementById('hud-channel').textContent = channelLabel;
  document.getElementById('boot-overlay').classList.add('hidden');
  initLeaderboard();
  setState('LOBBY');
  resizeCanvases();
}

// --- Load track + custom art before the boot form is usable ---
// (guards against !join/Connect racing ahead of gameState.track being ready)

const connectSubmitBtn = document.getElementById('connect-submit-btn');
const bootLoadingHint = document.getElementById('boot-loading-hint');

async function boot() {
  const [trackDef, assets] = await Promise.all([
    loadTrackDef(),
    loadAssets(KART_PALETTE),
  ]);
  gameState.track = buildTrack(trackDef);
  setAssets(assets);
  connectSubmitBtn.disabled = false;
  bootLoadingHint.classList.add('hidden');
}

boot();

document.getElementById('connect-form').addEventListener('submit', e => {
  e.preventDefault();
  unlockAudio();
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
    onMessage: msg => handleChatMessage(gameState, msg),
    onError: err => { errorEl.textContent = `Connection failed: ${err}`; },
  });
});

// --- Test console: simulate chat without a live Twitch connection ---

document.getElementById('test-form').addEventListener('submit', e => {
  e.preventDefault();
  const nameEl = document.getElementById('test-username');
  const textEl = document.getElementById('test-message');

  const name = nameEl.value.trim() || 'tester1';
  const text = textEl.value.trim();
  if (!text) return;

  handleChatMessage(gameState, {
    userId: name.toLowerCase(),
    displayName: name,
    text,
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

document.getElementById('test-join-batch').addEventListener('click', () => {
  for (let i = 0; i < 5; i++) {
    const name = `racer${gameState.karts.size + 1}`;
    handleChatMessage(gameState, { userId: name, displayName: name, text: '!join' });
  }
});

// --- Round setup + camera UI ---

document.getElementById('start-round-btn').addEventListener('click', startRace);
document.getElementById('back-to-lobby-btn').addEventListener('click', resetToLobby);

const lapsInput = document.getElementById('cfg-laps');
const lapsLabel = document.getElementById('cfg-laps-label');
lapsInput.addEventListener('input', () => { lapsLabel.textContent = lapsInput.value; });

wireCameraUI(gameState, spriteCanvas);

// --- Main loop ---

let lastFrameTime = performance.now();

function tick(now) {
  const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
  lastFrameTime = now;

  if (gameState.state === 'PLAYING') {
    for (const kart of gameState.karts.values()) {
      updateKart(kart, gameState.track, dt, now);
      const { boosted, hazarded } = applyTrackEvents(kart, gameState.track);
      if (boosted) playBoost();
      if (hazarded) playHazard();
    }

    const chaosHitId = updateChaosEvent(gameState.chaos, gameState.karts, now, gameState.chaosEnabled);
    if (chaosHitId) playChaosHit();

    if (!gameState.camera.followedId) {
      const ranked = rankedKarts();
      if (ranked.length) gameState.camera.followedId = ranked[0].id;
    }

    if ([...gameState.karts.values()].some(k => k.finished)) {
      endRace();
    }

    const elapsedSec = Math.floor((now - gameState.raceStartedAt) / 1000);
    const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
    const ss = String(elapsedSec % 60).padStart(2, '0');
    document.getElementById('hud-timer').textContent = `${mm}:${ss}`;
  }

  if (gameState.state === 'LOBBY' || gameState.state === 'PLAYING') {
    render(gameState, layers);
    updateLeaderboard(gameState);
    updateCameraUI(gameState);
    document.getElementById('hud-racers').textContent = String(gameState.karts.size);
  }

  if (gameState.state === 'LOBBY') {
    const startBtn = document.getElementById('start-round-btn');
    const noKarts = gameState.karts.size === 0;
    startBtn.disabled = noKarts;
    document.getElementById('start-hint').classList.toggle('hidden', !noKarts);
  }

  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
