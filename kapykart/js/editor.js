// Visual track editor: click to place waypoints, drag to adjust, click the
// path to tag boost/hazard points. Exports the same JSON shape track.js's
// loadTrackDef() reads from track.json, so no code changes are needed to
// swap in a custom track - just drop the exported file in next to
// index.html. Reuses track.js's spline math and kart.js's movement
// (for the animated ghost-kart preview) rather than re-deriving either.

import { buildTrack, sampleTrack, TRACK_DEF } from './track.js';
import { createKart, updateKart, resetKartColorCycle } from './kart.js';

const canvas = document.getElementById('editor-canvas');
const ctx = canvas.getContext('2d');

const WAYPOINT_HIT_RADIUS = 10;
const NEAREST_PROGRESS_SAMPLES = 500;

function cloneDef(def) {
  return {
    id: def.id || 'custom_track',
    waypoints: (def.waypoints || []).map(p => ({ x: p.x, y: p.y })),
    width: def.width || 150,
    laps: def.laps || 3,
    boostPads: (def.boostPads || []).map(p => ({ ...p })),
    hazards: (def.hazards || []).map(h => ({ ...h })),
  };
}

let state = cloneDef(TRACK_DEF);
let track = null;
let ghostKart = null;
let mode = 'waypoints'; // 'waypoints' | 'boost' | 'hazard'
let draggingIndex = -1;
let selectedWaypointIndex = -1;

// --- Core rebuild: recompute the spline whenever authored data changes ---

function rebuild() {
  if (state.waypoints.length >= 3) {
    track = buildTrack(state);
    resetKartColorCycle();
    ghostKart = createKart('ghost', 'preview', track);
  } else {
    track = null;
    ghostKart = null;
  }
  syncSidebar();
  draw();
}

// --- Canvas math ---

function canvasPointFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function findNearWaypoint(pt) {
  for (let i = 0; i < state.waypoints.length; i++) {
    const wp = state.waypoints[i];
    if (Math.hypot(pt.x - wp.x, pt.y - wp.y) <= WAYPOINT_HIT_RADIUS) return i;
  }
  return -1;
}

/** Finds the progress (0-1) whose sampled point is closest to (x,y); null if nothing's close enough to mean it. */
function nearestProgress(x, y) {
  let best = null;
  let bestDist = Infinity;
  for (let i = 0; i < NEAREST_PROGRESS_SAMPLES; i++) {
    const p = i / NEAREST_PROGRESS_SAMPLES;
    const s = sampleTrack(track, p);
    const d = Math.hypot(s.x - x, s.y - y);
    if (d < bestDist) { bestDist = d; best = p; }
  }
  return bestDist <= track.def.width ? best : null;
}

// --- Mouse interaction ---

canvas.addEventListener('mousedown', e => {
  const pt = canvasPointFromEvent(e);

  if (mode === 'waypoints') {
    const idx = findNearWaypoint(pt);
    if (idx !== -1) {
      draggingIndex = idx;
      selectedWaypointIndex = idx;
      draw();
    } else {
      state.waypoints.push({ x: Math.round(pt.x), y: Math.round(pt.y) });
      selectedWaypointIndex = state.waypoints.length - 1;
      rebuild();
    }
    return;
  }

  if (!track) return;
  const atProgress = nearestProgress(pt.x, pt.y);
  if (atProgress === null) return;
  if (mode === 'boost') {
    state.boostPads.push({ atProgress: Number(atProgress.toFixed(4)), strength: 1.5, duration: 1.4 });
  } else if (mode === 'hazard') {
    state.hazards.push({ atProgress: Number(atProgress.toFixed(4)), type: 'banana', width: 0.03, spinDuration: 1.5 });
  }
  rebuild();
});

canvas.addEventListener('mousemove', e => {
  if (draggingIndex === -1) return;
  const pt = canvasPointFromEvent(e);
  state.waypoints[draggingIndex].x = Math.round(pt.x);
  state.waypoints[draggingIndex].y = Math.round(pt.y);
  rebuild();
});

window.addEventListener('mouseup', () => { draggingIndex = -1; });

window.addEventListener('keydown', e => {
  if (e.key !== 'Delete' && e.key !== 'Backspace') return;
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
  if (selectedWaypointIndex === -1) return;
  state.waypoints.splice(selectedWaypointIndex, 1);
  selectedWaypointIndex = -1;
  rebuild();
});

// --- Mode buttons ---

const modeButtons = {
  waypoints: document.getElementById('mode-waypoints-btn'),
  boost: document.getElementById('mode-boost-btn'),
  hazard: document.getElementById('mode-hazard-btn'),
};
const modeHints = {
  waypoints: 'Click empty space to add a waypoint. Drag a point to move it. Select a point and press Delete to remove it.',
  boost: 'Click on the drawn path to drop a boost pad there.',
  hazard: 'Click on the drawn path to drop a hazard there.',
};

for (const [name, btn] of Object.entries(modeButtons)) {
  btn.addEventListener('click', () => {
    mode = name;
    for (const [n, b] of Object.entries(modeButtons)) b.classList.toggle('active', n === name);
    document.getElementById('mode-hint').textContent = modeHints[name];
  });
}

// --- Track settings ---

const idInput = document.getElementById('ed-id');
const widthInput = document.getElementById('ed-width');
const widthLabel = document.getElementById('ed-width-label');
const lapsInput = document.getElementById('ed-laps');

idInput.addEventListener('input', () => { state.id = idInput.value; syncJsonOutput(); });
widthInput.addEventListener('input', () => { state.width = Number(widthInput.value); rebuild(); });
lapsInput.addEventListener('input', () => { state.laps = Number(lapsInput.value); syncJsonOutput(); });

document.getElementById('load-default-btn').addEventListener('click', () => {
  state = cloneDef(TRACK_DEF);
  selectedWaypointIndex = -1;
  rebuild();
});

document.getElementById('clear-all-btn').addEventListener('click', () => {
  if (!confirm('Clear the current track and start from scratch?')) return;
  state = { id: 'custom_track', waypoints: [], width: 150, laps: 3, boostPads: [], hazards: [] };
  selectedWaypointIndex = -1;
  rebuild();
});

// --- Waypoint / boost / hazard sidebar lists ---

function renderWaypointList() {
  const container = document.getElementById('waypoint-list');
  container.innerHTML = '';
  state.waypoints.forEach((wp, i) => {
    const row = document.createElement('div');
    row.className = 'ed-row';
    row.innerHTML = `
      <span>${i}</span>
      <input type="number" value="${Math.round(wp.x)}" data-axis="x">
      <input type="number" value="${Math.round(wp.y)}" data-axis="y">
      <button type="button" title="Delete">✕</button>
    `;
    row.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('input', () => {
        state.waypoints[i][inp.dataset.axis] = Number(inp.value);
        rebuild();
      });
    });
    row.querySelector('button').addEventListener('click', () => {
      state.waypoints.splice(i, 1);
      selectedWaypointIndex = -1;
      rebuild();
    });
    container.appendChild(row);
  });
  document.getElementById('waypoint-count').textContent = String(state.waypoints.length);
}

function renderBoostList() {
  const container = document.getElementById('boost-list');
  container.innerHTML = '';
  state.boostPads.forEach((pad, i) => {
    const row = document.createElement('div');
    row.className = 'ed-row ed-row-3';
    row.innerHTML = `
      <span>${i}</span>
      <input type="number" step="0.01" min="0" max="1" value="${pad.atProgress}" data-field="atProgress" title="Position (0-1)">
      <input type="number" step="0.1" value="${pad.strength}" data-field="strength" title="Speed multiplier">
      <button type="button" title="Delete">✕</button>
    `;
    row.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('input', () => {
        pad[inp.dataset.field] = Number(inp.value);
        rebuild();
      });
    });
    row.querySelector('button').addEventListener('click', () => {
      state.boostPads.splice(i, 1);
      rebuild();
    });
    container.appendChild(row);
  });
  document.getElementById('boost-count').textContent = String(state.boostPads.length);
}

function renderHazardList() {
  const container = document.getElementById('hazard-list');
  container.innerHTML = '';
  state.hazards.forEach((hz, i) => {
    const row = document.createElement('div');
    row.className = 'ed-row ed-row-3';
    row.innerHTML = `
      <span>${i}</span>
      <input type="number" step="0.01" min="0" max="1" value="${hz.atProgress}" data-field="atProgress" title="Position (0-1)">
      <input type="number" step="0.1" value="${hz.spinDuration}" data-field="spinDuration" title="Spin-out seconds">
      <button type="button" title="Delete">✕</button>
    `;
    row.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('input', () => {
        hz[inp.dataset.field] = Number(inp.value);
        rebuild();
      });
    });
    row.querySelector('button').addEventListener('click', () => {
      state.hazards.splice(i, 1);
      rebuild();
    });
    container.appendChild(row);
  });
  document.getElementById('hazard-count').textContent = String(state.hazards.length);
}

function syncSidebar() {
  idInput.value = state.id;
  widthInput.value = state.width;
  widthLabel.textContent = state.width;
  lapsInput.value = state.laps;
  renderWaypointList();
  renderBoostList();
  renderHazardList();
  syncJsonOutput();
}

function syncJsonOutput() {
  document.getElementById('json-output').value = JSON.stringify(state, null, 2);
}

// --- Import / export ---

document.getElementById('copy-json-btn').addEventListener('click', () => {
  navigator.clipboard.writeText(document.getElementById('json-output').value).catch(() => {});
});

document.getElementById('download-json-btn').addEventListener('click', () => {
  const blob = new Blob([document.getElementById('json-output').value], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'track.json';
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('load-file-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      state = cloneDef(JSON.parse(reader.result));
      selectedWaypointIndex = -1;
      rebuild();
    } catch {
      alert('Could not parse that file as track JSON.');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// --- Drawing ---

function drawGrid() {
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= canvas.width; x += 50) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += 50) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

function drawRoad() {
  const halfWidth = track.def.width / 2;
  const samples = 240;
  const left = [];
  const right = [];
  for (let i = 0; i <= samples; i++) {
    const p = sampleTrack(track, i / samples);
    const perpX = -Math.sin(p.angle);
    const perpY = Math.cos(p.angle);
    left.push({ x: p.x + perpX * halfWidth, y: p.y + perpY * halfWidth });
    right.push({ x: p.x - perpX * halfWidth, y: p.y - perpY * halfWidth });
  }

  ctx.fillStyle = '#3a3a3a';
  ctx.beginPath();
  left.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(242,242,242,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  left.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
  ctx.beginPath();
  right.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();

  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = 'rgba(6,214,160,0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i <= samples; i++) {
    const p = sampleTrack(track, i / samples);
    if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawMarkers() {
  for (const pad of state.boostPads) {
    const p = sampleTrack(track, pad.atProgress);
    ctx.fillStyle = '#06d6a0';
    ctx.strokeStyle = '#0a0a0a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  for (const hz of state.hazards) {
    const p = sampleTrack(track, hz.atProgress);
    ctx.fillStyle = '#f1c40f';
    ctx.strokeStyle = '#0a0a0a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function drawWaypointHandles() {
  state.waypoints.forEach((wp, i) => {
    ctx.fillStyle = i === selectedWaypointIndex ? '#06d6a0' : '#f2f2f2';
    ctx.strokeStyle = '#0a0a0a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(wp.x, wp.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f2f2f2';
    ctx.font = '10px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(i), wp.x, wp.y - 12);
  });
}

function drawGhost() {
  if (!ghostKart) return;
  ctx.save();
  ctx.translate(ghostKart.worldPos.x, ghostKart.worldPos.y);
  ctx.fillStyle = ghostKart.spinTimer > 0 ? '#9aa39a' : '#e63946';
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0a0a0a';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  if (track) {
    drawRoad();
    drawMarkers();
  } else {
    ctx.fillStyle = '#9aa39a';
    ctx.font = '13px Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Add at least 3 waypoints to preview the track.', 16, 24);
  }
  drawWaypointHandles();
  drawGhost();
}

// --- Animated ghost-kart preview loop ---

let lastFrameTime = performance.now();
function animate(now) {
  const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
  lastFrameTime = now;
  if (ghostKart && track) updateKart(ghostKart, track, dt, now);
  draw();
  requestAnimationFrame(animate);
}

rebuild();
requestAnimationFrame(animate);
