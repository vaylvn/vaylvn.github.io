// Visual track editor: draw the centerline (and, optionally, invisible
// boost/hazard zones) directly on top of a reference PNG you supply -
// puddles, speed pads, rocks etc. are just art in that image, not separate
// rendered objects, so the zones you place here never need to be visible
// in the actual race. Exports the same JSON shape track.js's loadTrackDef()
// reads from track.json - drop the exported file in next to index.html
// (and the background image at the path you set below) and it's live, no
// code changes needed. Reuses track.js's spline math and kart.js's
// movement (for the animated ghost-kart preview) rather than re-deriving
// either.

import { buildTrack, sampleTrack, TRACK_DEF } from './track.js';
import { createKart, updateKart, resetKartColorCycle } from './kart.js';

const canvas = document.getElementById('editor-canvas');
const ctx = canvas.getContext('2d');

const WAYPOINT_HIT_RADIUS = 10;
const MARKER_HIT_RADIUS = 12;
const DEFAULT_MARKER_RADIUS = 50;

function cloneDef(def) {
  const out = {
    id: def.id || 'custom_track',
    waypoints: (def.waypoints || []).map(p => ({ x: p.x, y: p.y })),
    width: def.width || 150,
    laps: def.laps || 3,
    boostPads: (def.boostPads || []).map(p => ({ ...p })),
    hazards: (def.hazards || []).map(h => ({ ...h })),
  };
  if (def.backgroundImage) out.backgroundImage = def.backgroundImage;
  return out;
}

let state = cloneDef(TRACK_DEF);
let track = null;
let ghostKart = null;
let bgImage = null; // reference-only HTMLImageElement, loaded client-side via FileReader
let mode = 'waypoints'; // 'waypoints' | 'boost' | 'hazard'

let draggingWaypointIndex = -1;
let draggingMarker = null; // { list: 'boostPads'|'hazards', index }
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

// --- Canvas sizing: matches the reference image 1:1 so world coordinates
// are literally image pixel coordinates - no scale factor to get wrong. ---

function resizeCanvasTo(w, h) {
  canvas.width = w;
  canvas.height = h;
  draw();
}

function canvasPointFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  // Scale-aware even though #canvas-scroll is a plain block wrapper (not a
  // flex child) specifically to avoid CSS-stretching the canvas - this is
  // a defensive second layer, not the only thing preventing a mismatch.
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  };
}

function findNearWaypoint(pt) {
  for (let i = 0; i < state.waypoints.length; i++) {
    const wp = state.waypoints[i];
    if (Math.hypot(pt.x - wp.x, pt.y - wp.y) <= WAYPOINT_HIT_RADIUS) return i;
  }
  return -1;
}

function findNearMarker(pt, list) {
  for (let i = 0; i < state[list].length; i++) {
    const m = state[list][i];
    if (Math.hypot(pt.x - m.x, pt.y - m.y) <= MARKER_HIT_RADIUS) return i;
  }
  return -1;
}

// --- Mouse interaction ---

canvas.addEventListener('mousedown', e => {
  const pt = canvasPointFromEvent(e);

  if (mode === 'waypoints') {
    const idx = findNearWaypoint(pt);
    if (idx !== -1) {
      draggingWaypointIndex = idx;
      selectedWaypointIndex = idx;
      draw();
    } else {
      state.waypoints.push({ x: Math.round(pt.x), y: Math.round(pt.y) });
      selectedWaypointIndex = state.waypoints.length - 1;
      rebuild();
    }
    return;
  }

  const list = mode === 'boost' ? 'boostPads' : 'hazards';
  const idx = findNearMarker(pt, list);
  if (idx !== -1) {
    draggingMarker = { list, index: idx };
    return;
  }

  if (mode === 'boost') {
    state.boostPads.push({ x: Math.round(pt.x), y: Math.round(pt.y), radius: DEFAULT_MARKER_RADIUS, strength: 1.5, duration: 1.4 });
  } else {
    state.hazards.push({ x: Math.round(pt.x), y: Math.round(pt.y), radius: DEFAULT_MARKER_RADIUS, type: 'banana', spinDuration: 1.5 });
  }
  rebuild();
});

canvas.addEventListener('mousemove', e => {
  if (draggingWaypointIndex === -1 && !draggingMarker) return;
  const pt = canvasPointFromEvent(e);
  if (draggingWaypointIndex !== -1) {
    state.waypoints[draggingWaypointIndex].x = Math.round(pt.x);
    state.waypoints[draggingWaypointIndex].y = Math.round(pt.y);
    rebuild();
  } else if (draggingMarker) {
    const m = state[draggingMarker.list][draggingMarker.index];
    m.x = Math.round(pt.x);
    m.y = Math.round(pt.y);
    draw();
  }
});

window.addEventListener('mouseup', () => {
  draggingWaypointIndex = -1;
  if (draggingMarker) { draggingMarker = null; syncSidebar(); }
});

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
  waypoints: 'Click to add a waypoint. Drag to move. Select + Delete to remove.',
  boost: 'Click to drop a boost zone. Drag an existing one to move it; set its radius in the list.',
  hazard: 'Click to drop a hazard zone. Drag an existing one to move it; set its radius in the list.',
};

for (const [name, btn] of Object.entries(modeButtons)) {
  btn.addEventListener('click', () => {
    mode = name;
    for (const [n, b] of Object.entries(modeButtons)) b.classList.toggle('active', n === name);
    document.getElementById('mode-hint').textContent = modeHints[name];
  });
}

// --- Background image ---

const bgPathInput = document.getElementById('ed-bg-path');

document.getElementById('bg-image-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    bgImage = img;
    resizeCanvasTo(img.naturalWidth, img.naturalHeight);
    if (!bgPathInput.value) bgPathInput.value = `assets/${file.name}`;
    state.backgroundImage = bgPathInput.value;
    syncJsonOutput();
  };
  img.src = URL.createObjectURL(file);
  e.target.value = '';
});

document.getElementById('bg-image-clear-btn').addEventListener('click', () => {
  bgImage = null;
  delete state.backgroundImage;
  bgPathInput.value = '';
  resizeCanvasTo(1000, 700);
  syncJsonOutput();
});

bgPathInput.addEventListener('input', () => {
  if (bgPathInput.value.trim()) state.backgroundImage = bgPathInput.value.trim();
  else delete state.backgroundImage;
  syncJsonOutput();
});

// --- Track settings ---

const idInput = document.getElementById('ed-id');
const widthInput = document.getElementById('ed-width');
const widthLabel = document.getElementById('ed-width-label');
const lapsInput = document.getElementById('ed-laps');

idInput.addEventListener('input', () => { state.id = idInput.value; syncJsonOutput(); });
widthInput.addEventListener('input', () => { state.width = Number(widthInput.value); rebuild(); });
lapsInput.addEventListener('input', () => { state.laps = Number(lapsInput.value); syncJsonOutput(); });

document.getElementById('load-default-btn').addEventListener('click', () => {
  const keepBg = state.backgroundImage;
  state = cloneDef(TRACK_DEF);
  if (keepBg) state.backgroundImage = keepBg;
  selectedWaypointIndex = -1;
  rebuild();
});

document.getElementById('clear-all-btn').addEventListener('click', () => {
  if (!confirm('Clear the current track and start from scratch?')) return;
  const keepBg = state.backgroundImage;
  state = { id: 'custom_track', waypoints: [], width: 150, laps: 3, boostPads: [], hazards: [] };
  if (keepBg) state.backgroundImage = keepBg;
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

function renderMarkerList(listName, containerId, countId, extraField) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  state[listName].forEach((m, i) => {
    const row = document.createElement('div');
    row.className = 'ed-row ed-row-4';
    row.innerHTML = `
      <span>${i}</span>
      <input type="number" value="${Math.round(m.x)}" data-field="x" title="X">
      <input type="number" value="${Math.round(m.y)}" data-field="y" title="Y">
      <input type="number" value="${Math.round(m.radius)}" data-field="radius" title="Radius">
      <input type="number" step="0.1" value="${m[extraField.field]}" data-field="${extraField.field}" title="${extraField.title}">
      <button type="button" title="Delete">✕</button>
    `;
    row.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('input', () => {
        m[inp.dataset.field] = Number(inp.value);
        draw();
        syncJsonOutput();
      });
    });
    row.querySelector('button').addEventListener('click', () => {
      state[listName].splice(i, 1);
      rebuild();
    });
    container.appendChild(row);
  });
  document.getElementById(countId).textContent = String(state[listName].length);
}

function syncSidebar() {
  idInput.value = state.id;
  widthInput.value = state.width;
  widthLabel.textContent = state.width;
  lapsInput.value = state.laps;
  renderWaypointList();
  renderMarkerList('boostPads', 'boost-list', 'boost-count', { field: 'strength', title: 'Speed multiplier' });
  renderMarkerList('hazards', 'hazard-list', 'hazard-count', { field: 'spinDuration', title: 'Spin-out seconds' });
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
      bgPathInput.value = state.backgroundImage || '';
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
}

function drawCenterline() {
  const samples = 240;
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = 'rgba(6,214,160,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= samples; i++) {
    const p = sampleTrack(track, i / samples);
    if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawMarkerCircles() {
  for (const pad of state.boostPads) {
    ctx.fillStyle = 'rgba(6,214,160,0.28)';
    ctx.strokeStyle = '#06d6a0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pad.x, pad.y, pad.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  for (const hz of state.hazards) {
    ctx.fillStyle = 'rgba(241,196,15,0.28)';
    ctx.strokeStyle = '#f1c40f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(hz.x, hz.y, hz.radius, 0, Math.PI * 2);
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

  if (bgImage) {
    ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= canvas.width; x += 50) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += 50) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
  }

  if (track) {
    if (bgImage) drawCenterline(); else drawRoad();
    drawMarkerCircles();
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
