'use strict';

// ═══════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════

const LANE_KEYS    = ['KeyD', 'KeyF', 'KeyJ', 'KeyK'];
const LANE_COLORS  = ['#4d9fff', '#ff6b6b', '#ffd24d', '#4dffaa'];
const LANE_GLOWS   = ['rgba(77,159,255,0.5)', 'rgba(255,107,107,0.5)', 'rgba(255,210,77,0.5)', 'rgba(77,255,170,0.5)'];

const HIT_Y_RATIO  = 0.88;   // hit zone is 88% down the canvas
const SCROLL_SPEED = 400;    // px per second notes travel
const WINDOW_PERFECT = 60;   // ±ms
const WINDOW_GOOD    = 130;  // ±ms
const NOTE_H         = 14;
const NOTE_W_RATIO   = 0.18; // fraction of canvas width per lane

const SCORE_PERFECT  = 300;
const SCORE_GOOD     = 100;

// ═══════════════════════════════════════════════════════
//  SCREEN ROUTER
// ═══════════════════════════════════════════════════════

const screens = {
  home:      document.getElementById('screenHome'),
  playSetup: document.getElementById('screenPlaySetup'),
  game:      document.getElementById('screenGame'),
  editor:    document.getElementById('screenEditor'),
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

// ═══════════════════════════════════════════════════════
//  HOME
// ═══════════════════════════════════════════════════════

document.getElementById('btnPlay').addEventListener('click', () => showScreen('playSetup'));
document.getElementById('btnEdit').addEventListener('click', () => showScreen('editor'));
document.getElementById('backFromPlay').addEventListener('click', () => showScreen('home'));
document.getElementById('backFromEditor').addEventListener('click', () => {
  editorStop();
  showScreen('home');
});

// ═══════════════════════════════════════════════════════
//  PLAY SETUP
// ═══════════════════════════════════════════════════════

let playAudioBuffer = null;
let playChart       = null;
let playOffset      = 0;   // ms

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

async function loadAudioFile(file) {
  const ab = await file.arrayBuffer();
  return audioCtx.decodeAudioData(ab);
}

// Audio file picker (play)
const audioFilePlay = document.getElementById('audioFilePlay');
const audioFileNamePlay = document.getElementById('audioFileNamePlay');
audioFilePlay.addEventListener('change', async () => {
  const f = audioFilePlay.files[0];
  if (!f) return;
  audioFileNamePlay.textContent = f.name;
  document.getElementById('audioDropPlay').classList.add('loaded');
  playAudioBuffer = await loadAudioFile(f);
  checkPlayReady();
});

// Chart file picker
const chartFile = document.getElementById('chartFile');
const chartFileName = document.getElementById('chartFileName');
chartFile.addEventListener('change', () => {
  const f = chartFile.files[0];
  if (!f) return;
  chartFileName.textContent = f.name;
  document.getElementById('chartDrop').classList.add('loaded');
  const reader = new FileReader();
  reader.onload = e => {
    try {
      playChart = JSON.parse(e.target.result);
      checkPlayReady();
    } catch { alert('Invalid chart file.'); }
  };
  reader.readAsText(f);
});

const offsetSlider = document.getElementById('offsetSlider');
const offsetVal    = document.getElementById('offsetVal');
offsetSlider.addEventListener('input', () => {
  playOffset = +offsetSlider.value;
  offsetVal.textContent = playOffset + ' ms';
});

function checkPlayReady() {
  document.getElementById('btnStartPlay').disabled = !(playAudioBuffer && playChart);
}

document.getElementById('btnStartPlay').addEventListener('click', () => {
  startGame(playAudioBuffer, playChart, playOffset);
});

// ═══════════════════════════════════════════════════════
//  GAME ENGINE
// ═══════════════════════════════════════════════════════

const canvas   = document.getElementById('highway');
const ctx2d    = canvas.getContext('2d');
const hitZone  = document.getElementById('hitZone');
const hitPads  = hitZone.querySelectorAll('.hit-pad');

let game = null;

function startGame(audioBuffer, chart, offsetMs) {
  showScreen('game');

  // Resize canvas
  resizeCanvas();

  document.getElementById('hudTitle').textContent  = chart.title  || 'untitled';
  document.getElementById('hudArtist').textContent = chart.artist || '';

  // Sort notes by time
  const notes = chart.notes
    .map((n, i) => ({ ...n, id: i, hit: false, missed: false }))
    .sort((a, b) => a.t - b.t);

  game = {
    audioBuffer,
    audioSource: null,
    chart,
    notes,
    startTime:   null,   // audioCtx.currentTime when audio started
    offsetMs,
    paused:      false,
    pausedAt:    null,
    pauseAccum:  0,      // accumulated pause time in seconds

    score:    0,
    combo:    0,
    maxCombo: 0,
    perfect:  0,
    good:     0,
    miss:     0,
    total:    notes.length,

    laneActive: [false, false, false, false],
    raf:        null,
  };

  // Resume AudioContext if suspended (browser policy)
  audioCtx.resume().then(() => {
    game.audioSource = audioCtx.createBufferSource();
    game.audioSource.buffer = audioBuffer;
    game.audioSource.connect(audioCtx.destination);
    game.audioSource.start(0);
    game.startTime = audioCtx.currentTime;
    game.audioSource.onended = () => {
      if (game && !game.paused) setTimeout(endGame, 1000);
    };
    requestAnimationFrame(gameLoop);
  });
}

function getSongTime() {
  if (!game || game.startTime === null) return 0;
  const raw = (audioCtx.currentTime - game.startTime - game.pauseAccum) * 1000;
  return raw - game.offsetMs;
}

function resizeCanvas() {
  canvas.width  = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
}

window.addEventListener('resize', () => {
  if (game) resizeCanvas();
});

function gameLoop(ts) {
  if (!game || game.paused) return;

  const songTime = getSongTime();
  const w = canvas.width, h = canvas.height;
  const hitY = h * HIT_Y_RATIO;
  const laneW = w / 4;

  // Clear
  ctx2d.clearRect(0, 0, w, h);

  // Lane dividers
  for (let i = 1; i < 4; i++) {
    ctx2d.beginPath();
    ctx2d.moveTo(i * laneW, 0);
    ctx2d.lineTo(i * laneW, h);
    ctx2d.strokeStyle = 'rgba(30,35,48,0.8)';
    ctx2d.lineWidth = 1;
    ctx2d.stroke();
  }

  // Hit line
  for (let l = 0; l < 4; l++) {
    ctx2d.beginPath();
    ctx2d.moveTo(l * laneW + laneW * 0.1, hitY);
    ctx2d.lineTo((l + 1) * laneW - laneW * 0.1, hitY);
    ctx2d.strokeStyle = LANE_COLORS[l];
    ctx2d.globalAlpha = 0.5;
    ctx2d.lineWidth = 2;
    ctx2d.stroke();
    ctx2d.globalAlpha = 1;
  }

  // Notes
  for (const note of game.notes) {
    if (note.hit || note.missed) continue;

    const noteTime = note.t; // ms
    const delta    = noteTime - songTime; // ms until note reaches hit line

    // Miss detection
    if (delta < -WINDOW_GOOD) {
      note.missed = true;
      game.combo = 0;
      game.miss++;
      updateHUD();
      continue;
    }

    // Only draw if on screen
    const yOffset = (delta / 1000) * SCROLL_SPEED;
    const noteY   = hitY - yOffset;
    if (noteY < -NOTE_H || noteY > h + NOTE_H) continue;

    const lane  = note.lane;
    const noteX = lane * laneW + laneW * 0.08;
    const noteW = laneW * 0.84;

    // Glow
    ctx2d.shadowColor = LANE_GLOWS[lane];
    ctx2d.shadowBlur  = 12;

    // Body
    const grad = ctx2d.createLinearGradient(0, noteY - NOTE_H/2, 0, noteY + NOTE_H/2);
    grad.addColorStop(0, LANE_COLORS[lane]);
    grad.addColorStop(1, LANE_COLORS[lane] + '88');
    ctx2d.fillStyle = grad;
    ctx2d.beginPath();
    ctx2d.roundRect(noteX, noteY - NOTE_H/2, noteW, NOTE_H, 4);
    ctx2d.fill();
    ctx2d.shadowBlur = 0;
  }

  // Active lane flash
  for (let l = 0; l < 4; l++) {
    if (game.laneActive[l]) {
      ctx2d.fillStyle = LANE_GLOWS[l];
      ctx2d.fillRect(l * laneW, hitY - 30, laneW, 60);
    }
  }

  // Progress
  const duration = game.chart.duration || (game.notes[game.notes.length - 1]?.t + 2000) || 60000;
  const pct = Math.min(100, (songTime / duration) * 100);
  document.getElementById('gameProgress').style.width = pct + '%';

  game.raf = requestAnimationFrame(gameLoop);
}

// ── Input handling ──

document.addEventListener('keydown', e => {
  if (!game || game.paused) return;
  const lane = LANE_KEYS.indexOf(e.code);
  if (lane === -1) return;
  e.preventDefault();
  if (game.laneActive[lane]) return;
  game.laneActive[lane] = true;
  hitPads[lane].classList.add('active');
  processHit(lane);
});

document.addEventListener('keyup', e => {
  if (!game) return;
  const lane = LANE_KEYS.indexOf(e.code);
  if (lane === -1) return;
  game.laneActive[lane] = false;
  hitPads[lane].classList.remove('active');
});

function processHit(lane) {
  const songTime = getSongTime();
  let best = null, bestDelta = Infinity;

  for (const note of game.notes) {
    if (note.hit || note.missed || note.lane !== lane) continue;
    const delta = Math.abs(note.t - songTime);
    if (delta < bestDelta) { bestDelta = delta; best = note; }
    if (note.t - songTime > WINDOW_GOOD) break;
  }

  if (!best || bestDelta > WINDOW_GOOD) {
    showFeedback(lane, 'miss', null);
    game.combo = 0;
    game.miss++;
    updateHUD();
    return;
  }

  best.hit = true;
  game.combo++;
  if (game.combo > game.maxCombo) game.maxCombo = game.combo;

  if (bestDelta <= WINDOW_PERFECT) {
    game.perfect++;
    game.score += SCORE_PERFECT + Math.floor(game.combo / 10) * 50;
    showFeedback(lane, 'perfect', best.t);
  } else {
    game.good++;
    game.score += SCORE_GOOD;
    showFeedback(lane, 'good', best.t);
  }
  updateHUD();
}

function showFeedback(lane, type, noteT) {
  const pad   = hitPads[lane].getBoundingClientRect();
  const label = document.createElement('div');
  label.className = `hit-feedback ${type}`;
  label.textContent = type === 'perfect' ? 'perfect' : type === 'good' ? 'good' : 'miss';
  label.style.left  = (pad.left + pad.width / 2 - 30) + 'px';
  label.style.top   = (pad.top - 16) + 'px';
  document.body.appendChild(label);
  label.addEventListener('animationend', () => label.remove());
}

function updateHUD() {
  document.getElementById('hudScore').textContent = game.score.toLocaleString();
  document.getElementById('hudCombo').textContent = game.combo;
  const judged = game.perfect + game.good + game.miss;
  const acc = judged > 0 ? Math.round(((game.perfect + game.good * 0.33) / judged) * 100) : 0;
  document.getElementById('hudAcc').textContent = acc + '%';
}

function endGame() {
  if (!game) return;
  cancelAnimationFrame(game.raf);

  const judged = game.perfect + game.good + game.miss;
  const acc = judged > 0 ? Math.round(((game.perfect + game.good * 0.33) / judged) * 100) : 0;

  let grade = 'F';
  if (acc >= 97) grade = 'S';
  else if (acc >= 90) grade = 'A';
  else if (acc >= 80) grade = 'B';
  else if (acc >= 65) grade = 'C';
  else if (acc >= 50) grade = 'D';

  document.getElementById('resultsGrade').textContent  = grade;
  document.getElementById('rScore').textContent         = game.score.toLocaleString();
  document.getElementById('rAcc').textContent           = acc + '%';
  document.getElementById('rCombo').textContent         = game.maxCombo;
  document.getElementById('rPerfect').textContent       = game.perfect;
  document.getElementById('rGood').textContent          = game.good;
  document.getElementById('rMiss').textContent          = game.miss;

  document.getElementById('resultsVeil').classList.add('show');
}

// Pause
document.getElementById('btnPause').addEventListener('click', pauseGame);
document.getElementById('btnResume').addEventListener('click', resumeGame);
document.getElementById('btnQuit').addEventListener('click', quitGame);
document.getElementById('btnQuitPause').addEventListener('click', quitGame);
document.getElementById('resultsHome').addEventListener('click', quitGame);

function pauseGame() {
  if (!game || game.paused) return;
  game.paused = true;
  game.pausedAt = audioCtx.currentTime;
  game.audioSource?.disconnect();
  document.getElementById('pauseVeil').classList.add('show');
}

function resumeGame() {
  if (!game || !game.paused) return;
  game.paused = false;
  game.pauseAccum += audioCtx.currentTime - game.pausedAt;
  // Restart from current position
  const resumePos = (audioCtx.currentTime - game.startTime - game.pauseAccum);
  const src = audioCtx.createBufferSource();
  src.buffer = game.audioBuffer;
  src.connect(audioCtx.destination);
  src.start(0, Math.max(0, resumePos));
  game.audioSource = src;
  document.getElementById('pauseVeil').classList.remove('show');
  requestAnimationFrame(gameLoop);
}

function quitGame() {
  if (game) {
    cancelAnimationFrame(game.raf);
    try { game.audioSource?.stop(); } catch {}
    game = null;
  }
  document.getElementById('pauseVeil').classList.remove('show');
  document.getElementById('resultsVeil').classList.remove('show');
  showScreen('home');
}

// ═══════════════════════════════════════════════════════
//  EDITOR
// ═══════════════════════════════════════════════════════

const tlCanvas  = document.getElementById('timeline');
const tlCtx     = tlCanvas.getContext('2d');
const tlCursor  = document.getElementById('timelineCursor');

let editor = {
  audioBuffer: null,
  audioSource: null,
  playing:     false,
  startTime:   null,   // audioCtx.currentTime when play started
  startPos:    0,      // seconds offset when play was started
  notes:       [],     // {t: ms, lane: 0-3}
  raf:         null,
  duration:    0,
};

// Audio load
const audioFileEditor    = document.getElementById('audioFileEditor');
const audioFileNameEditor= document.getElementById('audioFileNameEditor');
audioFileEditor.addEventListener('change', async () => {
  const f = audioFileEditor.files[0];
  if (!f) return;
  audioFileNameEditor.textContent = f.name;
  document.getElementById('audioDropEditor').classList.add('loaded');
  editorStop();
  editor.audioBuffer = await loadAudioFile(f);
  editor.duration    = editor.audioBuffer.duration;
  document.getElementById('metaTitle').placeholder = f.name.replace(/\.[^.]+$/, '');
  drawTimeline();
});

document.getElementById('btnEditorPlay').addEventListener('click', editorPlay);
document.getElementById('btnEditorStop').addEventListener('click', editorStop);

function editorPlay() {
  if (!editor.audioBuffer) return;
  if (editor.playing) { editorStop(); return; }
  audioCtx.resume();
  const src = audioCtx.createBufferSource();
  src.buffer = editor.audioBuffer;
  src.connect(audioCtx.destination);
  src.start(0, editor.startPos);
  src.onended = () => { if (editor.playing) editorStop(); };
  editor.audioSource = src;
  editor.startTime   = audioCtx.currentTime;
  editor.playing     = true;
  document.getElementById('btnEditorPlay').textContent = '⏸';
  editorLoop();
}

function editorStop() {
  if (editor.playing) {
    editor.startPos = editorCurrentTime();
    try { editor.audioSource?.stop(); } catch {}
  }
  editor.playing = false;
  document.getElementById('btnEditorPlay').textContent = '▶';
  cancelAnimationFrame(editor.raf);
}

function editorCurrentTime() {
  if (!editor.playing) return editor.startPos;
  return editor.startPos + (audioCtx.currentTime - editor.startTime);
}

function editorLoop() {
  updateEditorTime();
  drawTimeline();
  if (editor.playing) editor.raf = requestAnimationFrame(editorLoop);
}

function updateEditorTime() {
  const t = editorCurrentTime();
  const min = Math.floor(t / 60);
  const sec = (t % 60).toFixed(1).padStart(4, '0');
  document.getElementById('editorTime').textContent = `${min}:${sec}`;

  // Move cursor
  if (editor.duration > 0) {
    const pct = Math.min(1, t / editor.duration);
    tlCursor.style.left = (pct * tlCanvas.offsetWidth) + 'px';
  }
}

function drawTimeline() {
  const w = tlCanvas.offsetWidth, h = tlCanvas.offsetHeight;
  tlCanvas.width = w; tlCanvas.height = h;

  tlCtx.clearRect(0, 0, w, h);

  if (!editor.audioBuffer || editor.duration === 0) {
    tlCtx.fillStyle = 'rgba(30,35,48,0.4)';
    tlCtx.fillRect(0, 0, w, h);
    tlCtx.fillStyle = '#2e3445';
    tlCtx.font = '11px IBM Plex Mono';
    tlCtx.textAlign = 'center';
    tlCtx.fillText('load audio to begin', w/2, h/2 + 4);
    return;
  }

  // Background
  tlCtx.fillStyle = '#0d1018';
  tlCtx.fillRect(0, 0, w, h);

  // Lane bands
  const laneH = h / 4;
  for (let l = 0; l < 4; l++) {
    tlCtx.fillStyle = l % 2 === 0 ? 'rgba(20,24,35,0.8)' : 'rgba(14,17,26,0.8)';
    tlCtx.fillRect(0, l * laneH, w, laneH);
  }

  // Lane labels
  const laneNames = ['D', 'F', 'J', 'K'];
  for (let l = 0; l < 4; l++) {
    tlCtx.fillStyle = LANE_COLORS[l] + '55';
    tlCtx.font = '9px IBM Plex Mono';
    tlCtx.textAlign = 'left';
    tlCtx.fillText(laneNames[l], 4, l * laneH + laneH/2 + 4);
  }

  // Notes
  for (const note of editor.notes) {
    const x = (note.t / (editor.duration * 1000)) * w;
    const y = note.lane * laneH + laneH * 0.15;
    const nh = laneH * 0.7;
    tlCtx.fillStyle = LANE_COLORS[note.lane];
    tlCtx.shadowColor = LANE_GLOWS[note.lane];
    tlCtx.shadowBlur = 4;
    tlCtx.beginPath();
    tlCtx.roundRect(x - 2, y, 4, nh, 2);
    tlCtx.fill();
    tlCtx.shadowBlur = 0;
  }

  // Playhead
  const t = editorCurrentTime();
  const headX = (t / editor.duration) * w;
  tlCtx.strokeStyle = 'rgba(200,207,224,0.4)';
  tlCtx.lineWidth = 1;
  tlCtx.beginPath();
  tlCtx.moveTo(headX, 0);
  tlCtx.lineTo(headX, h);
  tlCtx.stroke();
}

// Click timeline to seek
tlCanvas.addEventListener('click', e => {
  if (!editor.audioBuffer) return;
  const rect = tlCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const pct = Math.max(0, Math.min(1, x / rect.width));
  editor.startPos = pct * editor.duration;
  if (editor.playing) {
    const wasPlaying = true;
    editorStop();
    if (wasPlaying) editorPlay();
  }
  updateEditorTime();
  drawTimeline();
});

// Place notes via keyboard
document.addEventListener('keydown', e => {
  if (screens.editor.classList.contains('active') && editor.playing) {
    const lane = LANE_KEYS.indexOf(e.code);
    if (lane === -1) return;
    e.preventDefault();
    placeNote(lane);
  }
});

// Place notes via lane buttons
document.querySelectorAll('.lane-tap-btn').forEach(btn => {
  btn.addEventListener('mousedown', e => {
    e.preventDefault();
    if (!editor.playing) return;
    const lane = +btn.dataset.lane;
    placeNote(lane);
    btn.classList.add('tapped');
    setTimeout(() => btn.classList.remove('tapped'), 120);
  });
});

function placeNote(lane) {
  const t = Math.round(editorCurrentTime() * 1000); // ms
  // Deduplicate: don't place within 50ms of existing note in same lane
  const dup = editor.notes.some(n => n.lane === lane && Math.abs(n.t - t) < 50);
  if (!dup) {
    editor.notes.push({ t, lane });
    editor.notes.sort((a, b) => a.t - b.t);
    updateNoteCount();
    drawTimeline();
  }
}

// Click on timeline note to delete
tlCanvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  if (!editor.audioBuffer || editor.duration === 0) return;
  const rect = tlCanvas.getBoundingClientRect();
  const x  = e.clientX - rect.left;
  const y  = e.clientY - rect.top;
  const t  = (x / rect.width) * editor.duration * 1000;
  const laneH = tlCanvas.height / 4;
  const lane  = Math.floor(y / laneH);
  const threshold = (50 / (editor.duration * 1000)) * rect.width;
  const idx = editor.notes.findIndex(n => n.lane === lane && Math.abs((n.t / (editor.duration * 1000)) * rect.width - x) < Math.max(6, threshold));
  if (idx !== -1) {
    editor.notes.splice(idx, 1);
    updateNoteCount();
    drawTimeline();
  }
});

function updateNoteCount() {
  document.getElementById('editorNoteCount').textContent = editor.notes.length + ' notes';
}

// Clear
document.getElementById('btnClearChart').addEventListener('click', () => {
  if (editor.notes.length === 0) return;
  if (confirm('Clear all notes?')) {
    editor.notes = [];
    updateNoteCount();
    drawTimeline();
  }
});

// Export
document.getElementById('btnExportChart').addEventListener('click', () => {
  if (editor.notes.length === 0) { alert('No notes to export.'); return; }

  const title  = document.getElementById('metaTitle').value.trim()  || 'untitled';
  const artist = document.getElementById('metaArtist').value.trim() || '';
  const bpm    = +document.getElementById('metaBpm').value || 0;

  const chart = {
    title,
    artist,
    bpm,
    duration: Math.round(editor.duration * 1000),
    notes: editor.notes.map(n => ({ t: n.t, lane: n.lane })),
    created: new Date().toISOString(),
    version: 1,
  };

  const json = JSON.stringify(chart, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  a.href     = url;
  a.download = `${safeTitle}.fretless.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// ═══════════════════════════════════════════════════════
//  RESIZE TIMELINE ON LOAD / RESIZE
// ═══════════════════════════════════════════════════════

window.addEventListener('resize', () => {
  if (screens.editor.classList.contains('active')) drawTimeline();
});

// Initial timeline draw
drawTimeline();
