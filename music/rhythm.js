'use strict';

// ═══════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════

const LANE_KEYS   = ['KeyD', 'KeyF', 'KeyJ', 'KeyK'];
const LANE_NAMES  = ['D', 'F', 'J', 'K'];
const LANE_COLORS = ['#4d9fff', '#ff6b6b', '#ffd24d', '#4dffaa'];
const LANE_DARK   = ['#1a3d6b', '#6b2020', '#6b5a10', '#1a6b40'];
const LANE_GLOWS  = ['rgba(77,159,255,0.6)', 'rgba(255,107,107,0.6)', 'rgba(255,210,77,0.6)', 'rgba(77,255,170,0.6)'];
const LANE_GLOWS2 = ['rgba(77,159,255,0.12)', 'rgba(255,107,107,0.12)', 'rgba(255,210,77,0.12)', 'rgba(77,255,170,0.12)'];

const HIT_Y_RATIO    = 0.86;
const SCROLL_SPEED   = 420;
const WINDOW_PERFECT = 55;
const WINDOW_GOOD    = 120;
const NOTE_H         = 16;
const NOTE_RADIUS    = 5;
const HOLD_W_FRAC    = 0.38;

const SCORE_PERFECT      = 300;
const SCORE_GOOD         = 100;
const SCORE_HOLD_PER_SEC = 150;

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

document.getElementById('btnPlay').addEventListener('click', () => showScreen('playSetup'));
document.getElementById('btnEdit').addEventListener('click', () => showScreen('editor'));
document.getElementById('backFromPlay').addEventListener('click', () => showScreen('home'));
document.getElementById('backFromEditor').addEventListener('click', () => { editorStop(); showScreen('home'); });

// ═══════════════════════════════════════════════════════
//  AUDIO CONTEXT
// ═══════════════════════════════════════════════════════

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
async function loadAudioFile(file) {
  const ab = await file.arrayBuffer();
  return audioCtx.decodeAudioData(ab);
}

// ═══════════════════════════════════════════════════════
//  PLAY SETUP
// ═══════════════════════════════════════════════════════

let playAudioBuffer = null, playChart = null, playOffset = 0;

document.getElementById('audioFilePlay').addEventListener('change', async function() {
  const f = this.files[0]; if (!f) return;
  document.getElementById('audioFileNamePlay').textContent = f.name;
  document.getElementById('audioDropPlay').classList.add('loaded');
  playAudioBuffer = await loadAudioFile(f);
  checkPlayReady();
});

document.getElementById('chartFile').addEventListener('change', function() {
  const f = this.files[0]; if (!f) return;
  document.getElementById('chartFileName').textContent = f.name;
  document.getElementById('chartDrop').classList.add('loaded');
  const reader = new FileReader();
  reader.onload = e => {
    try { playChart = JSON.parse(e.target.result); checkPlayReady(); }
    catch { alert('Invalid chart file.'); }
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
document.getElementById('btnStartPlay').addEventListener('click', () => startGame(playAudioBuffer, playChart, playOffset));

// ═══════════════════════════════════════════════════════
//  PARTICLE SYSTEM
// ═══════════════════════════════════════════════════════

class Particle {
  constructor(x, y, color) {
    this.x = x; this.y = y; this.color = color;
    this.vx = (Math.random() - 0.5) * 6;
    this.vy = -1 - Math.random() * 4;
    this.life = 1.0;
    this.decay = 0.035 + Math.random() * 0.04;
    this.size  = 1.5 + Math.random() * 3;
  }
  update() { this.x += this.vx; this.y += this.vy; this.vy += 0.15; this.life -= this.decay; }
  draw(ctx) {
    ctx.globalAlpha  = Math.max(0, this.life * 0.9);
    ctx.fillStyle    = this.color;
    ctx.shadowColor  = this.color;
    ctx.shadowBlur   = 8;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * Math.max(0, this.life), 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;
  }
}

// ═══════════════════════════════════════════════════════
//  GAME ENGINE
// ═══════════════════════════════════════════════════════

const canvas  = document.getElementById('highway');
const ctx2d   = canvas.getContext('2d');
const hitZone = document.getElementById('hitZone');
const hitPads = hitZone.querySelectorAll('.hit-pad');

let game = null;

function startGame(audioBuffer, chart, offsetMs) {
  showScreen('game');
  resizeCanvas();
  document.getElementById('hudTitle').textContent  = chart.title  || 'untitled';
  document.getElementById('hudArtist').textContent = chart.artist || '';

  const notes = chart.notes
    .map((n, i) => ({ ...n, id: i, dur: n.dur || 0, hit: false, missed: false, holdActive: false }))
    .sort((a, b) => a.t - b.t);

  game = {
    audioBuffer, audioSource: null, chart, notes,
    startTime: null, offsetMs,
    paused: false, pausedAt: null, pauseAccum: 0,
    score: 0, combo: 0, maxCombo: 0,
    perfect: 0, good: 0, miss: 0,
    laneActive: [false, false, false, false],
    particles: [],
    raf: null,
  };

  audioCtx.resume().then(() => {
    game.audioSource = audioCtx.createBufferSource();
    game.audioSource.buffer = audioBuffer;
    game.audioSource.connect(audioCtx.destination);
    game.audioSource.start(0);
    game.startTime = audioCtx.currentTime;
    game.audioSource.onended = () => { if (game && !game.paused) setTimeout(endGame, 1200); };
    requestAnimationFrame(gameLoop);
  });
}

function getSongTime() {
  if (!game || game.startTime === null) return 0;
  return (audioCtx.currentTime - game.startTime - game.pauseAccum) * 1000 - game.offsetMs;
}

function resizeCanvas() {
  canvas.width  = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
}
window.addEventListener('resize', () => { if (game) resizeCanvas(); });

// ── HIGHWAY BACKGROUND ──

function drawHighwayBG(w, h, hitY, laneW) {
  ctx2d.fillStyle = '#05070d';
  ctx2d.fillRect(0, 0, w, h);

  // Perspective depth gradient
  const depthGrad = ctx2d.createLinearGradient(0, 0, 0, h);
  depthGrad.addColorStop(0,   'rgba(0,0,0,0.75)');
  depthGrad.addColorStop(0.55,'rgba(0,0,0,0.2)');
  depthGrad.addColorStop(1,   'rgba(0,0,0,0.0)');
  ctx2d.fillStyle = depthGrad;
  ctx2d.fillRect(0, 0, w, h);

  // Lane color ambience columns
  for (let l = 0; l < 4; l++) {
    const cg = ctx2d.createLinearGradient(0, hitY, 0, 0);
    cg.addColorStop(0,   LANE_GLOWS2[l]);
    cg.addColorStop(0.6, 'transparent');
    ctx2d.fillStyle = cg;
    ctx2d.fillRect(l * laneW, 0, laneW, h);
  }

  // Fine scanlines
  for (let y = 0; y < h; y += 3) {
    ctx2d.fillStyle = 'rgba(0,0,0,0.07)';
    ctx2d.fillRect(0, y, w, 1);
  }

  // Lane dividers — subtle, brighter at bottom
  for (let i = 1; i < 4; i++) {
    const x  = i * laneW;
    const dg = ctx2d.createLinearGradient(0, 0, 0, h);
    dg.addColorStop(0,   'rgba(30,45,70,0.0)');
    dg.addColorStop(0.65,'rgba(40,58,85,0.5)');
    dg.addColorStop(1,   'rgba(55,78,110,0.85)');
    ctx2d.strokeStyle = dg;
    ctx2d.lineWidth   = 1;
    ctx2d.beginPath(); ctx2d.moveTo(x, 0); ctx2d.lineTo(x, h); ctx2d.stroke();
  }
}

// ── HIT RECEPTORS ──

function drawReceptors(w, h, hitY, laneW) {
  for (let l = 0; l < 4; l++) {
    const cx     = l * laneW + laneW / 2;
    const active = game.laneActive[l];

    // Glow pad
    const rg = ctx2d.createRadialGradient(cx, hitY, 0, cx, hitY, laneW * 0.55);
    rg.addColorStop(0,   active ? LANE_GLOWS[l] : 'rgba(255,255,255,0.025)');
    rg.addColorStop(0.6, active ? LANE_GLOWS2[l] : 'transparent');
    rg.addColorStop(1,   'transparent');
    ctx2d.fillStyle = rg;
    ctx2d.fillRect(l * laneW, hitY - 36, laneW, 72);

    // Receptor bar
    ctx2d.beginPath();
    ctx2d.moveTo(l * laneW + laneW * 0.04, hitY);
    ctx2d.lineTo((l+1) * laneW - laneW * 0.04, hitY);
    ctx2d.strokeStyle = active ? LANE_COLORS[l] : LANE_COLORS[l] + '44';
    ctx2d.lineWidth   = active ? 3 : 1.5;
    if (active) { ctx2d.shadowColor = LANE_COLORS[l]; ctx2d.shadowBlur = 18; }
    ctx2d.stroke();
    ctx2d.shadowBlur = 0;

    // Key label
    ctx2d.fillStyle = active ? LANE_COLORS[l] : 'rgba(100,115,145,0.45)';
    ctx2d.font      = `${active ? '500' : '400'} 11px "IBM Plex Mono"`;
    ctx2d.textAlign = 'center';
    ctx2d.fillText(LANE_NAMES[l], cx, hitY + 20);
  }
}

// ── NOTE RENDERING ──

function drawNote(note, noteY, laneW, songTime) {
  const l      = note.lane;
  const cx     = l * laneW + laneW / 2;
  const nw     = laneW * 0.78;
  const nx     = l * laneW + laneW * 0.11;
  const color  = LANE_COLORS[l];
  const glow   = LANE_GLOWS[l];
  const hitY   = canvas.height * HIT_Y_RATIO;

  // ── Hold tail ──
  if (note.dur > 0) {
    const tailW    = laneW * HOLD_W_FRAC;
    const tailX    = cx - tailW / 2;

    let tailTop, tailBot;
    if (note.holdActive) {
      const remaining = note.t + note.dur - songTime;
      tailTop = hitY;
      tailBot = hitY + Math.max(0, (remaining / 1000) * SCROLL_SPEED);
    } else if (!note.hit) {
      tailTop = noteY;
      tailBot = noteY + (note.dur / 1000) * SCROLL_SPEED;
    } else {
      return;
    }

    if (tailBot > tailTop) {
      const tg = ctx2d.createLinearGradient(0, tailTop, 0, tailBot);
      if (note.holdActive) {
        tg.addColorStop(0, color + 'ee');
        tg.addColorStop(1, color + '33');
      } else {
        tg.addColorStop(0, color + 'bb');
        tg.addColorStop(1, color + '18');
      }
      ctx2d.fillStyle  = tg;
      ctx2d.shadowColor = glow;
      ctx2d.shadowBlur  = note.holdActive ? 14 : 6;
      ctx2d.beginPath();
      ctx2d.roundRect(tailX, tailTop, tailW, tailBot - tailTop, 3);
      ctx2d.fill();

      if (note.holdActive) {
        // Glowing spine
        ctx2d.strokeStyle = color;
        ctx2d.lineWidth   = 2;
        ctx2d.shadowColor = glow;
        ctx2d.shadowBlur  = 16;
        ctx2d.beginPath();
        ctx2d.moveTo(cx, tailTop);
        ctx2d.lineTo(cx, tailBot);
        ctx2d.stroke();
      }
      ctx2d.shadowBlur = 0;
    }
  }

  // Skip head if hold is active or note already fully hit
  if (note.holdActive) return;
  if (note.hit) return;

  // ── Bloom glow passes ──
  const blooms = [{ blur: 32, a: 0.10 }, { blur: 18, a: 0.22 }, { blur: 8, a: 0.38 }];
  for (const b of blooms) {
    ctx2d.shadowColor  = color;
    ctx2d.shadowBlur   = b.blur;
    ctx2d.globalAlpha  = b.a;
    ctx2d.fillStyle    = color;
    ctx2d.beginPath();
    ctx2d.roundRect(nx, noteY - NOTE_H / 2, nw, NOTE_H, NOTE_RADIUS);
    ctx2d.fill();
  }
  ctx2d.globalAlpha = 1;
  ctx2d.shadowBlur  = 0;

  // ── Main body gradient ──
  const ng = ctx2d.createLinearGradient(nx, noteY - NOTE_H/2, nx, noteY + NOTE_H/2);
  ng.addColorStop(0,    '#ffffff');
  ng.addColorStop(0.25, color);
  ng.addColorStop(1,    LANE_DARK[l]);
  ctx2d.fillStyle  = ng;
  ctx2d.shadowColor = glow;
  ctx2d.shadowBlur  = 10;
  ctx2d.beginPath();
  ctx2d.roundRect(nx, noteY - NOTE_H / 2, nw, NOTE_H, NOTE_RADIUS);
  ctx2d.fill();
  ctx2d.shadowBlur = 0;

  // ── Specular highlight ──
  const sg = ctx2d.createLinearGradient(nx, 0, nx + nw, 0);
  sg.addColorStop(0,    'rgba(255,255,255,0)');
  sg.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  sg.addColorStop(0.65, 'rgba(255,255,255,0.6)');
  sg.addColorStop(1,    'rgba(255,255,255,0)');
  ctx2d.fillStyle  = sg;
  ctx2d.beginPath();
  ctx2d.roundRect(nx, noteY - NOTE_H/2, nw, NOTE_H * 0.4, NOTE_RADIUS);
  ctx2d.fill();
}

// ── GAME LOOP ──

function gameLoop() {
  if (!game || game.paused) return;

  const songTime = getSongTime();
  const w = canvas.width, h = canvas.height;
  const hitY  = h * HIT_Y_RATIO;
  const laneW = w / 4;

  drawHighwayBG(w, h, hitY, laneW);
  drawReceptors(w, h, hitY, laneW);

  // Process notes
  for (const note of game.notes) {
    // Hold scoring tick
    if (note.holdActive) {
      game.score += SCORE_HOLD_PER_SEC / 60;
      if (songTime >= note.t + note.dur) {
        note.holdActive = false;
        note.hit = true;
        spawnParticles(note.lane, hitY, laneW, 14);
      }
    }

    // Miss detection
    if (!note.hit && !note.missed && !note.holdActive) {
      if (songTime - note.t > WINDOW_GOOD) {
        note.missed = true;
        game.combo = 0;
        game.miss++;
        updateHUD();
        continue;
      }
    }

    if ((note.hit && !note.holdActive) || note.missed) continue;

    const delta  = note.t - songTime;
    const noteY  = hitY - (delta / 1000) * SCROLL_SPEED;

    // Culling — tap notes only; hold tails can extend offscreen
    if (note.dur === 0 && (noteY < -NOTE_H * 2 || noteY > h + NOTE_H)) continue;
    if (note.dur > 0 && !note.holdActive && noteY > h + NOTE_H * 2) continue;

    drawNote(note, noteY, laneW, songTime);
  }

  // Particles
  game.particles = game.particles.filter(p => p.life > 0);
  for (const p of game.particles) { p.update(); p.draw(ctx2d); }

  updateHUD();

  const duration = game.chart.duration || ((game.notes[game.notes.length-1]?.t || 0) + 2000);
  document.getElementById('gameProgress').style.width = Math.min(100, Math.max(0, songTime / duration * 100)) + '%';

  game.raf = requestAnimationFrame(gameLoop);
}

function spawnParticles(lane, hitY, laneW, count) {
  const cx = lane * laneW + laneW / 2;
  for (let i = 0; i < count; i++) game.particles.push(new Particle(cx, hitY, LANE_COLORS[lane]));
}

// ── INPUT ──

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
  // Early hold release
  for (const note of game.notes) {
    if (note.lane === lane && note.holdActive) {
      const songTime = getSongTime();
      if (songTime < note.t + note.dur - 80) {
        note.holdActive = false;
        note.missed     = true;
        game.combo = 0;
        showFeedback(lane, 'miss');
        updateHUD();
      }
    }
  }
});

function processHit(lane) {
  const songTime = getSongTime();
  let best = null, bestDelta = Infinity;
  for (const note of game.notes) {
    if (note.hit || note.missed || note.holdActive || note.lane !== lane) continue;
    const delta = Math.abs(note.t - songTime);
    if (delta < bestDelta) { bestDelta = delta; best = note; }
    if (note.t - songTime > WINDOW_GOOD + 60) break;
  }

  if (!best || bestDelta > WINDOW_GOOD) {
    showFeedback(lane, 'miss');
    game.combo = 0; game.miss++;
    updateHUD(); return;
  }

  game.combo++;
  if (game.combo > game.maxCombo) game.maxCombo = game.combo;

  const hitY  = canvas.height * HIT_Y_RATIO;
  const laneW = canvas.width / 4;
  const isPerfect = bestDelta <= WINDOW_PERFECT;

  if (best.dur > 0) {
    best.holdActive = true;
    isPerfect ? game.perfect++ : game.good++;
    showFeedback(lane, isPerfect ? 'perfect' : 'good');
    spawnParticles(lane, hitY, laneW, 6);
  } else {
    best.hit = true;
    if (isPerfect) {
      game.perfect++;
      game.score += SCORE_PERFECT + Math.floor(game.combo / 10) * 50;
    } else {
      game.good++;
      game.score += SCORE_GOOD;
    }
    showFeedback(lane, isPerfect ? 'perfect' : 'good');
    spawnParticles(lane, hitY, laneW, isPerfect ? 12 : 5);
  }
  updateHUD();
}

function showFeedback(lane, type) {
  const pad   = hitPads[lane].getBoundingClientRect();
  const el    = document.createElement('div');
  el.className = `hit-feedback ${type}`;
  el.textContent = type;
  el.style.left  = (pad.left + pad.width / 2 - 28) + 'px';
  el.style.top   = (pad.top - 22) + 'px';
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

function updateHUD() {
  if (!game) return;
  document.getElementById('hudScore').textContent = Math.floor(game.score).toLocaleString();
  document.getElementById('hudCombo').textContent = game.combo;
  const judged = game.perfect + game.good + game.miss;
  const acc    = judged > 0 ? Math.round(((game.perfect + game.good * 0.33) / judged) * 100) : 100;
  document.getElementById('hudAcc').textContent = acc + '%';
}

function endGame() {
  if (!game) return;
  cancelAnimationFrame(game.raf);
  const judged = game.perfect + game.good + game.miss;
  const acc    = judged > 0 ? Math.round(((game.perfect + game.good * 0.33) / judged) * 100) : 0;
  const grade  = acc >= 97 ? 'S' : acc >= 90 ? 'A' : acc >= 80 ? 'B' : acc >= 65 ? 'C' : acc >= 50 ? 'D' : 'F';
  document.getElementById('resultsGrade').textContent = grade;
  document.getElementById('rScore').textContent   = Math.floor(game.score).toLocaleString();
  document.getElementById('rAcc').textContent     = acc + '%';
  document.getElementById('rCombo').textContent   = game.maxCombo;
  document.getElementById('rPerfect').textContent = game.perfect;
  document.getElementById('rGood').textContent    = game.good;
  document.getElementById('rMiss').textContent    = game.miss;
  document.getElementById('resultsVeil').classList.add('show');
}

document.getElementById('btnPause').addEventListener('click', pauseGame);
document.getElementById('btnResume').addEventListener('click', resumeGame);
document.getElementById('btnQuit').addEventListener('click', quitGame);
document.getElementById('btnQuitPause').addEventListener('click', quitGame);
document.getElementById('resultsHome').addEventListener('click', quitGame);

function pauseGame() {
  if (!game || game.paused) return;
  game.paused = true; game.pausedAt = audioCtx.currentTime;
  try { game.audioSource?.disconnect(); } catch {}
  document.getElementById('pauseVeil').classList.add('show');
}

function resumeGame() {
  if (!game || !game.paused) return;
  game.paused = false;
  game.pauseAccum += audioCtx.currentTime - game.pausedAt;
  const pos = Math.max(0, audioCtx.currentTime - game.startTime - game.pauseAccum);
  const src = audioCtx.createBufferSource();
  src.buffer = game.audioBuffer; src.connect(audioCtx.destination); src.start(0, pos);
  game.audioSource = src;
  document.getElementById('pauseVeil').classList.remove('show');
  requestAnimationFrame(gameLoop);
}

function quitGame() {
  if (game) { cancelAnimationFrame(game.raf); try { game.audioSource?.stop(); } catch {} game = null; }
  document.getElementById('pauseVeil').classList.remove('show');
  document.getElementById('resultsVeil').classList.remove('show');
  showScreen('home');
}

// ═══════════════════════════════════════════════════════
//  EDITOR
// ═══════════════════════════════════════════════════════

const tlCanvas = document.getElementById('timeline');
const tlCtx    = tlCanvas.getContext('2d');
const tlCursor = document.getElementById('timelineCursor');

let editor = {
  audioBuffer: null, audioSource: null,
  playing: false, startTime: null, startPos: 0,
  notes: [], raf: null, duration: 0,
  dragNote: null, dragOffsetMs: 0,
  holdStart: [null, null, null, null],
  selectedNote: null,
  zoom: 1.0,
  viewStart: 0,
};

document.getElementById('audioFileEditor').addEventListener('change', async function() {
  const f = this.files[0]; if (!f) return;
  document.getElementById('audioFileNameEditor').textContent = f.name;
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
  src.buffer = editor.audioBuffer; src.connect(audioCtx.destination);
  src.start(0, editor.startPos);
  src.onended = () => { if (editor.playing) editorStop(); };
  editor.audioSource = src; editor.startTime = audioCtx.currentTime;
  editor.playing = true;
  document.getElementById('btnEditorPlay').textContent = '⏸';
  editorLoop();
}

function editorStop() {
  if (editor.playing) { editor.startPos = editorCurrentTime(); try { editor.audioSource?.stop(); } catch {} }
  editor.playing = false;
  document.getElementById('btnEditorPlay').textContent = '▶';
  cancelAnimationFrame(editor.raf);
  drawTimeline();
}

function editorCurrentTime() {
  if (!editor.playing) return editor.startPos;
  return editor.startPos + (audioCtx.currentTime - editor.startTime);
}

function editorLoop() {
  updateEditorTime();
  drawTimeline();
  if (editor.playing && editor.duration > 0) {
    const t       = editorCurrentTime();
    const viewDur = editor.duration / editor.zoom;
    if (t > editor.viewStart + viewDur * 0.88) {
      editor.viewStart = Math.min(Math.max(0, t - viewDur * 0.1), editor.duration - viewDur);
    }
  }
  if (editor.playing) editor.raf = requestAnimationFrame(editorLoop);
}

function updateEditorTime() {
  const t   = editorCurrentTime();
  const min = Math.floor(t / 60);
  const sec = (t % 60).toFixed(1).padStart(4, '0');
  document.getElementById('editorTime').textContent = `${min}:${sec}`;
  if (editor.duration > 0) {
    const viewDur = editor.duration / editor.zoom;
    const pct     = (t - editor.viewStart) / viewDur;
    tlCursor.style.left = Math.max(0, Math.min(tlCanvas.offsetWidth, pct * tlCanvas.offsetWidth)) + 'px';
  }
}

// ── TIMELINE DRAW ──

function drawTimeline() {
  const w = tlCanvas.offsetWidth, h = tlCanvas.offsetHeight;
  tlCanvas.width = w; tlCanvas.height = h;

  if (!editor.audioBuffer || editor.duration === 0) {
    tlCtx.fillStyle = '#080a0f';
    tlCtx.fillRect(0, 0, w, h);
    tlCtx.fillStyle = '#2a3248';
    tlCtx.font = '11px IBM Plex Mono'; tlCtx.textAlign = 'center';
    tlCtx.fillText('load audio to begin', w/2, h/2 + 4);
    return;
  }

  const rulerH  = 22;
  const laneH   = (h - rulerH) / 4;
  const viewDur = editor.duration / editor.zoom;
  const vs      = editor.viewStart;

  tlCtx.fillStyle = '#080a0f'; tlCtx.fillRect(0, 0, w, h);

  // Lane bands
  for (let l = 0; l < 4; l++) {
    const y = rulerH + l * laneH;
    tlCtx.fillStyle = l % 2 === 0 ? 'rgba(16,20,32,1)' : 'rgba(10,13,22,1)';
    tlCtx.fillRect(0, y, w, laneH);
    tlCtx.strokeStyle = 'rgba(28,38,58,0.5)'; tlCtx.lineWidth = 1;
    tlCtx.beginPath(); tlCtx.moveTo(0, y); tlCtx.lineTo(w, y); tlCtx.stroke();
    tlCtx.fillStyle = LANE_COLORS[l] + '40';
    tlCtx.font = '9px IBM Plex Mono'; tlCtx.textAlign = 'left';
    tlCtx.fillText(LANE_NAMES[l], 5, y + laneH / 2 + 4);
  }

  // Time ruler
  tlCtx.fillStyle = '#06080e'; tlCtx.fillRect(0, 0, w, rulerH);
  const tickSec = viewDur < 8 ? 0.25 : viewDur < 20 ? 0.5 : viewDur < 60 ? 1 : viewDur < 120 ? 2 : 5;
  const first   = Math.ceil(vs / tickSec) * tickSec;
  tlCtx.strokeStyle = 'rgba(38,52,78,0.9)'; tlCtx.lineWidth = 1;
  for (let ts = first; ts <= vs + viewDur; ts += tickSec) {
    const x = ((ts - vs) / viewDur) * w;
    tlCtx.beginPath(); tlCtx.moveTo(x, 12); tlCtx.lineTo(x, h); tlCtx.stroke();
    tlCtx.fillStyle = '#3a4a68'; tlCtx.font = '8px IBM Plex Mono'; tlCtx.textAlign = 'center';
    const m = Math.floor(ts/60), s = (ts%60).toFixed(tickSec < 1 ? 2 : 0);
    tlCtx.fillText(`${m}:${String(s).padStart(tickSec < 1 ? 5 : 2,'0')}`, x, 9);
  }

  // Notes
  for (const note of editor.notes) {
    const tSec = note.t / 1000;
    if (tSec > vs + viewDur + 1 || tSec + (note.dur||0)/1000 < vs - 1) continue;
    const x    = ((tSec - vs) / viewDur) * w;
    const y    = rulerH + note.lane * laneH;
    const isSel = editor.selectedNote === note;

    // Hold tail
    if (note.dur > 0) {
      const tailPx = (note.dur / 1000 / viewDur) * w;
      const tg     = tlCtx.createLinearGradient(x, 0, x + tailPx, 0);
      tg.addColorStop(0, LANE_COLORS[note.lane] + 'cc');
      tg.addColorStop(1, LANE_COLORS[note.lane] + '18');
      tlCtx.fillStyle = tg;
      tlCtx.shadowColor = LANE_GLOWS[note.lane]; tlCtx.shadowBlur = 4;
      tlCtx.beginPath();
      tlCtx.roundRect(x, y + laneH * 0.22, tailPx, laneH * 0.56, 2);
      tlCtx.fill(); tlCtx.shadowBlur = 0;
    }

    // Head
    tlCtx.fillStyle   = isSel ? '#ffffff' : LANE_COLORS[note.lane];
    tlCtx.shadowColor = LANE_GLOWS[note.lane];
    tlCtx.shadowBlur  = isSel ? 12 : 5;
    tlCtx.beginPath();
    tlCtx.roundRect(x - 3, y + laneH * 0.08, 6, laneH * 0.84, 2);
    tlCtx.fill(); tlCtx.shadowBlur = 0;

    if (isSel) {
      tlCtx.strokeStyle = '#ffffff'; tlCtx.lineWidth = 1.5;
      tlCtx.beginPath(); tlCtx.roundRect(x - 6, y + laneH * 0.04, 12, laneH * 0.92, 3); tlCtx.stroke();
      // Show timestamp
      tlCtx.fillStyle = '#aabbdd'; tlCtx.font = '8px IBM Plex Mono'; tlCtx.textAlign = 'center';
      tlCtx.fillText(`${note.t}ms`, x, y - 2);
    }
  }

  // Playhead
  const t     = editorCurrentTime();
  const headX = ((t - vs) / viewDur) * w;
  if (headX >= 0 && headX <= w) {
    tlCtx.strokeStyle = 'rgba(210,225,255,0.75)';
    tlCtx.lineWidth   = 1.5;
    tlCtx.shadowColor = 'rgba(210,225,255,0.4)'; tlCtx.shadowBlur = 6;
    tlCtx.beginPath(); tlCtx.moveTo(headX, 0); tlCtx.lineTo(headX, h); tlCtx.stroke();
    tlCtx.shadowBlur = 0;
  }
}

// ── TIMELINE MOUSE ──

tlCanvas.addEventListener('mousedown', e => {
  if (!editor.audioBuffer || editor.duration === 0) return;
  const rect    = tlCanvas.getBoundingClientRect();
  const mx      = e.clientX - rect.left;
  const my      = e.clientY - rect.top;
  const rulerH  = 22;
  const laneH   = (rect.height - rulerH) / 4;
  const viewDur = editor.duration / editor.zoom;
  const tMs     = (editor.viewStart + (mx / rect.width) * viewDur) * 1000;
  const lane    = Math.floor((my - rulerH) / laneH);

  if (my < rulerH || lane < 0 || lane > 3) { seekEditor(tMs / 1000); return; }

  // Find note under cursor
  const hit = editor.notes.find(n => {
    const nx = ((n.t / 1000 - editor.viewStart) / viewDur) * rect.width;
    return n.lane === lane && Math.abs(nx - mx) < 9;
  });

  if (hit) {
    if (e.button === 2) {
      editor.notes.splice(editor.notes.indexOf(hit), 1);
      if (editor.selectedNote === hit) editor.selectedNote = null;
      updateNoteCount(); drawTimeline(); return;
    }
    editor.dragNote = hit; editor.selectedNote = hit;
    editor.dragOffsetMs = tMs - hit.t;
    drawTimeline(); return;
  }

  editor.selectedNote = null;
  seekEditor(tMs / 1000);
  drawTimeline();
});

tlCanvas.addEventListener('mousemove', e => {
  if (!editor.dragNote) return;
  const rect    = tlCanvas.getBoundingClientRect();
  const mx      = e.clientX - rect.left;
  const viewDur = editor.duration / editor.zoom;
  const tMs     = (editor.viewStart + (mx / rect.width) * viewDur) * 1000 - editor.dragOffsetMs;
  editor.dragNote.t = Math.max(0, Math.round(tMs));
  editor.notes.sort((a, b) => a.t - b.t);
  updateNoteCount(); drawTimeline();
});

tlCanvas.addEventListener('mouseup',    () => { editor.dragNote = null; });
tlCanvas.addEventListener('mouseleave', () => { editor.dragNote = null; });
tlCanvas.addEventListener('contextmenu', e => e.preventDefault());

// Scroll wheel zoom
tlCanvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (!editor.duration) return;
  const rect     = tlCanvas.getBoundingClientRect();
  const mx       = e.clientX - rect.left;
  const viewDur  = editor.duration / editor.zoom;
  const tAnchor  = editor.viewStart + (mx / rect.width) * viewDur;
  editor.zoom    = Math.max(1, Math.min(30, editor.zoom * (e.deltaY < 0 ? 1.15 : 0.87)));
  const newVD    = editor.duration / editor.zoom;
  editor.viewStart = Math.max(0, Math.min(editor.duration - newVD, tAnchor - (mx / rect.width) * newVD));
  drawTimeline();
}, { passive: false });

function seekEditor(secs) {
  const was = editor.playing;
  if (was) editorStop();
  editor.startPos = Math.max(0, Math.min(editor.duration, secs));
  if (was) editorPlay();
  else { updateEditorTime(); drawTimeline(); }
}

// ── KEYBOARD in editor ──

document.addEventListener('keydown', e => {
  if (!screens.editor.classList.contains('active')) return;

  // Nudge selected note
  if (editor.selectedNote && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    editor.selectedNote.t = Math.max(0, editor.selectedNote.t + (e.code === 'ArrowRight' ? step : -step));
    editor.notes.sort((a, b) => a.t - b.t);
    drawTimeline(); return;
  }
  if ((e.code === 'Delete' || e.code === 'Backspace') && editor.selectedNote) {
    e.preventDefault();
    editor.notes.splice(editor.notes.indexOf(editor.selectedNote), 1);
    editor.selectedNote = null;
    updateNoteCount(); drawTimeline(); return;
  }

  // Hold recording
  if (editor.playing) {
    const lane = LANE_KEYS.indexOf(e.code);
    if (lane !== -1 && editor.holdStart[lane] === null) {
      e.preventDefault();
      editor.holdStart[lane] = editorCurrentTime();
    }
  }
});

document.addEventListener('keyup', e => {
  if (!screens.editor.classList.contains('active')) return;
  const lane = LANE_KEYS.indexOf(e.code);
  if (lane === -1 || editor.holdStart[lane] === null) return;
  e.preventDefault();
  const startT = editor.holdStart[lane];
  const endT   = editorCurrentTime();
  const dur    = Math.round((endT - startT) * 1000);
  const t      = Math.round(startT * 1000);
  editor.holdStart[lane] = null;
  const dup = editor.notes.some(n => n.lane === lane && Math.abs(n.t - t) < 50);
  if (!dup) {
    editor.notes.push({ t, lane, dur: Math.max(0, dur) });
    editor.notes.sort((a, b) => a.t - b.t);
    updateNoteCount(); drawTimeline();
  }
});

// Lane tap buttons
document.querySelectorAll('.lane-tap-btn').forEach(btn => {
  const lane = +btn.dataset.lane;
  btn.addEventListener('mousedown', e => {
    e.preventDefault();
    if (!editor.playing) return;
    editor.holdStart[lane] = editorCurrentTime();
    btn.classList.add('tapped');
  });
  const finish = () => {
    if (editor.holdStart[lane] === null) return;
    const startT = editor.holdStart[lane], endT = editorCurrentTime();
    const dur = Math.round((endT - startT) * 1000), t = Math.round(startT * 1000);
    editor.holdStart[lane] = null;
    btn.classList.remove('tapped');
    const dup = editor.notes.some(n => n.lane === lane && Math.abs(n.t - t) < 50);
    if (!dup) {
      editor.notes.push({ t, lane, dur: Math.max(0, dur) });
      editor.notes.sort((a, b) => a.t - b.t);
      updateNoteCount(); drawTimeline();
    }
  };
  btn.addEventListener('mouseup', finish);
  btn.addEventListener('mouseleave', () => { editor.holdStart[lane] = null; btn.classList.remove('tapped'); });
});

function updateNoteCount() {
  const holds = editor.notes.filter(n => n.dur > 0).length;
  document.getElementById('editorNoteCount').textContent =
    `${editor.notes.length} notes  ·  ${editor.notes.length - holds} tap  ·  ${holds} hold`;
}

document.getElementById('btnClearChart').addEventListener('click', () => {
  if (!editor.notes.length) return;
  if (confirm('Clear all notes?')) { editor.notes = []; editor.selectedNote = null; updateNoteCount(); drawTimeline(); }
});

// ── EXPORT ──

document.getElementById('btnExportChart').addEventListener('click', () => {
  if (!editor.notes.length) { alert('No notes to export.'); return; }
  const title  = document.getElementById('metaTitle').value.trim()  || 'untitled';
  const artist = document.getElementById('metaArtist').value.trim() || '';
  const bpm    = +document.getElementById('metaBpm').value || 0;
  const chart  = {
    title, artist, bpm,
    duration: Math.round(editor.duration * 1000),
    notes: editor.notes.map(n => n.dur > 0 ? { t: n.t, lane: n.lane, dur: n.dur } : { t: n.t, lane: n.lane }),
    created: new Date().toISOString(),
    version: 2,
  };
  const blob = new Blob([JSON.stringify(chart, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `${title.replace(/[^a-z0-9]/gi,'_').toLowerCase()}.fretless.json`;
  a.click(); URL.revokeObjectURL(url);
});

window.addEventListener('resize', () => { if (screens.editor.classList.contains('active')) drawTimeline(); });
drawTimeline();
