import { connectTwitch } from './twitch.js';
import { buildTrack, loadTrackList, loadTrackBackground } from './track.js';
import { createKart, updateKart, resetKartColorCycle, resetKartToStart } from './kart.js';
import { applyTrackEvents } from './events.js';
import { render, setAssets } from './render.js';
import { buildFloorCanvasSize, advanceFollowCameraHeading } from './camera.js';
import { loadAssets } from './assets.js';
import { KART_PALETTE } from './palette.js';
import { wireCameraUI, updateCameraUI } from './ui.js';
import { initLeaderboard, updateLeaderboard } from './leaderboard.js';
import { unlockAudio, playJoin, playRaceStart, playBoost, playHazard, playFinish } from './audio.js';

const floorCanvas = document.getElementById('floor-canvas');
const floorCtx = floorCanvas.getContext('2d');
const spriteCanvas = document.getElementById('sprite-canvas');
const spriteCtx = spriteCanvas.getContext('2d');
const layers = { floorCanvas, floorCtx, spriteCanvas, spriteCtx };

const gameState = {
  state: 'BOOT',
  channel: '',
  track: null, // set once activateTrack() resolves, see boot() below
  trackList: [], // [{ label, def }], see track.js's loadTrackList()
  trackIndex: 0,
  karts: new Map(),
  camera: { mode: 'overview', followedId: null, zoomFactor: 1.2 },
  canvasWidth: 0,
  canvasHeight: 0,
  floorWidth: 0,
  floorHeight: 0,
  overviewHitboxes: [],
  raceStartedAt: 0,
  raceEndedAt: 0,
  winnerAnnounced: false, // first-place finish no longer ends the race outright - see announceWinner()
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

  spriteCanvas.width = rect.width * dpr;
  spriteCanvas.height = rect.height * dpr;
  spriteCanvas.style.width = `${rect.width}px`;
  spriteCanvas.style.height = `${rect.height}px`;

  // The floor canvas is deliberately bigger than the viewport and centered
  // over it - a steeply tilted flat rectangle covers less screen area than
  // its own untilted size, so a viewport-sized canvas leaves gaps at the
  // edges once CSS tilts it (see camera.js's buildFloorCanvasSize).
  const floorSize = buildFloorCanvasSize(rect.width, rect.height);
  gameState.floorWidth = floorSize.width;
  gameState.floorHeight = floorSize.height;

  // Deliberately NOT multiplied by dpr, unlike the sprite canvas above.
  // Everything drawn onto the floor canvas goes through a low-res buffer
  // that's upscaled with smoothing OFF (see render.js's getPixelContext/
  // blitPixelBuffer) - it's already a deliberately blocky, chunky look
  // regardless of the backing store's native pixel count, so scaling it by
  // a high-DPI screen's devicePixelRatio (2x-3x is common) buys zero
  // visible sharpness. It DOES cost real GPU compositing time every frame
  // though: this canvas is already FLOOR_OVERSIZE_WIDTH/HEIGHT times
  // bigger than the viewport (needed for forward/sideways visibility, see
  // camera.js), so multiplying that by dpr^2 on top was pushing a genuinely
  // enormous bitmap through the CSS 3D transform every frame for no visual
  // benefit - a real, measured cause of poor framerates on HiDPI displays.
  // The sprite canvas keeps full dpr since it draws actually-crisp content
  // (name labels) and is much smaller (viewport-sized, not oversized).
  floorCanvas.width = floorSize.width;
  floorCanvas.height = floorSize.height;
  floorCanvas.style.width = `${floorSize.width}px`;
  floorCanvas.style.height = `${floorSize.height}px`;
  floorCanvas.style.left = `${(rect.width - floorSize.width) / 2}px`;
  floorCanvas.style.top = `${(rect.height - floorSize.height) / 2}px`;

  floorCtx.setTransform(1, 0, 0, 1, 0, 0);
  spriteCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener('resize', resizeCanvases);

// This is a streaming overlay (OBS browser source or a full-window kiosk
// tab) - an accidental ctrl+scroll, trackpad pinch, or ctrl+plus/minus
// zooming the whole page would visibly break the layout on stream. This is
// the browser's own native page zoom, unrelated to the in-game overview
// zoom slider (see ui.js), which is a separate custom control that stays
// untouched. Pinch-to-zoom on trackpads/touchscreens fires as a `wheel`
// event with ctrlKey set (Chrome/Firefox convention), so one listener
// covers both that and literal ctrl+scroll.
window.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) e.preventDefault();
});

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
  gameState.raceStartedAt = performance.now();
  gameState.winnerAnnounced = false;
  gameState.camera.mode = 'overview';
  gameState.camera.followedId = null;
  setState('PLAYING');
  playRaceStart();
}

/** First-place finish alone doesn't end the race anymore - see announceWinner(). This is the manual "streamer decided to wrap up" trigger, from the End race button. */
function endRace() {
  if (gameState.state !== 'PLAYING') return;
  gameState.raceEndedAt = performance.now();
  setState('ENDED');
  showResults();
}

/** Called once, the moment the first kart finishes - shows a transient banner (see the CSS animation on #winner-splash) without touching game state, so stragglers keep racing normally. */
function announceWinner(kart) {
  gameState.winnerAnnounced = true;
  const splash = document.getElementById('winner-splash');
  document.getElementById('winner-splash-name').textContent = kart.name;
  splash.classList.remove('hidden');
  splash.style.animation = 'none';
  void splash.offsetWidth; // force reflow so the animation restarts if a splash is somehow re-triggered
  splash.style.animation = '';
  playFinish();
}

function resetToLobby() {
  if (gameState.state !== 'ENDED') return;
  gameState.karts.clear();
  resetKartColorCycle();
  gameState.camera.mode = 'overview';
  gameState.camera.followedId = null;
  gameState.winnerAnnounced = false;
  document.getElementById('results-screen').classList.add('hidden');
  document.getElementById('winner-splash').classList.add('hidden');
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

// --- Track selection (lobby-only cycling, see ui wiring below) ---

async function activateTrack(index) {
  const entry = gameState.trackList[index];
  const built = buildTrack(entry.def);
  built.backgroundImage = await loadTrackBackground(entry.def);
  gameState.trackIndex = index;
  gameState.track = built;

  // Chatters may already be sitting in the lobby from the previous track -
  // put them back on the new track's starting grid rather than leaving them
  // at stale positions computed against a spline that no longer applies.
  let slot = 0;
  for (const kart of gameState.karts.values()) {
    resetKartToStart(kart, built, slot);
    slot++;
  }

  document.getElementById('track-label').textContent = entry.label;
  const lapsInput = document.getElementById('cfg-laps');
  lapsInput.value = built.def.laps;
  document.getElementById('cfg-laps-label').textContent = built.def.laps;
}

function switchTrack(delta) {
  if (gameState.state !== 'LOBBY' || gameState.trackList.length <= 1) return;
  const next = ((gameState.trackIndex + delta) % gameState.trackList.length + gameState.trackList.length) % gameState.trackList.length;
  activateTrack(next);
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
  const [trackList, assets] = await Promise.all([
    loadTrackList(),
    loadAssets(KART_PALETTE),
  ]);
  gameState.trackList = trackList;
  await activateTrack(0);
  setAssets(assets);
  document.getElementById('track-nav').classList.toggle('hidden', trackList.length <= 1);
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
document.getElementById('end-race-btn').addEventListener('click', endRace);

const lapsInput = document.getElementById('cfg-laps');
const lapsLabel = document.getElementById('cfg-laps-label');
lapsInput.addEventListener('input', () => { lapsLabel.textContent = lapsInput.value; });

document.getElementById('track-prev-btn').addEventListener('click', () => switchTrack(-1));
document.getElementById('track-next-btn').addEventListener('click', () => switchTrack(1));

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

    if (!gameState.camera.followedId) {
      const ranked = rankedKarts();
      if (ranked.length) {
        gameState.camera.followedId = ranked[0].id;
        gameState.camera.smoothedAngle = null; // snap to this kart's heading instead of easing from a stale previous value
      }
    }

    if (gameState.camera.mode === 'follow' && gameState.camera.followedId) {
      const followedKart = gameState.karts.get(gameState.camera.followedId);
      if (followedKart) advanceFollowCameraHeading(gameState.camera, followedKart, dt);
    }

    if (!gameState.winnerAnnounced) {
      const winner = [...gameState.karts.values()].find(k => k.finished);
      if (winner) announceWinner(winner);
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
