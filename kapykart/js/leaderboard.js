// Reused from HOARDE (zombie/js/leaderboard.js) - same pop/reorder
// animation approach, ranked by race progress instead of kill count. Ranked
// by totalProgress (lap + a continuous 0-1 fraction along the spline, not a
// checkpoint count), so rows already reorder smoothly rather than jumping
// in discrete steps - the CSS `top` transition just animates whatever the
// continuous rank produces.

import { getAssets } from './render.js';
import { CAPYBARA_COLOR, CAPYBARA_EAR_COLOR, STROKE_COLOR } from './palette.js';

const ROW_HEIGHT = 42;
const HEADSHOT_SIZE = 32;
const MAX_ROWS = 10;
const rows = new Map(); // kartId -> { el, headshotCanvas, rankEl, nameEl, statEl, lastStat }

export function initLeaderboard() {
  rows.clear();
  const container = document.getElementById('leaderboard-list');
  container.innerHTML = '';
}

function rankKarts(karts) {
  return [...karts.values()].sort((a, b) => {
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    return b.totalProgress - a.totalProgress;
  });
}

function formatStat(kart, laps) {
  if (kart.finished) return 'FIN';
  return `Lap ${Math.min(kart.lap + 1, laps)}/${laps}`;
}

/** Drawn once per kart (never changes after), so this costs nothing on the render hot path. */
function drawHeadshot(canvas, kart) {
  const ctx = canvas.getContext('2d');
  const r = HEADSHOT_SIZE / 2;
  ctx.clearRect(0, 0, HEADSHOT_SIZE, HEADSHOT_SIZE);

  ctx.save();
  ctx.beginPath();
  ctx.arc(r, r, r - 1.5, 0, Math.PI * 2);
  ctx.clip();

  const assets = getAssets();
  const sheet = assets && assets.kartSheet;
  const frames = sheet && sheet.frames.get(kart.color);
  if (frames) {
    // Frame 0 is the dead-on "facing the camera" pose (see assets.js) -
    // the only one of the 8 that reads as a portrait rather than a profile.
    const frame = frames[0];
    const zoom = 1.7; // crop in past the kart body to frame mostly the capybara's face
    const size = HEADSHOT_SIZE * zoom;
    ctx.drawImage(frame, (HEADSHOT_SIZE - size) / 2, (HEADSHOT_SIZE - size) / 2 - HEADSHOT_SIZE * 0.12, size, size);
  } else {
    ctx.fillStyle = '#241a1a';
    ctx.fillRect(0, 0, HEADSHOT_SIZE, HEADSHOT_SIZE);
    ctx.fillStyle = CAPYBARA_EAR_COLOR;
    ctx.beginPath();
    ctx.ellipse(r - r * 0.45, r * 0.55, r * 0.16, r * 0.2, 0, 0, Math.PI * 2);
    ctx.ellipse(r + r * 0.45, r * 0.55, r * 0.16, r * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = CAPYBARA_COLOR;
    ctx.strokeStyle = STROKE_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(r, r + r * 0.1, r * 0.62, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  // Kart-color ring frame around the headshot.
  ctx.strokeStyle = kart.color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(r, r, r - 1.25, 0, Math.PI * 2);
  ctx.stroke();
}

export function updateLeaderboard(gameState) {
  const container = document.getElementById('leaderboard-list');
  const sorted = rankKarts(gameState.karts);
  const laps = gameState.track.def.laps;
  const visible = sorted.slice(0, MAX_ROWS);
  const overflow = sorted.length - visible.length;

  const seen = new Set();

  visible.forEach((kart, rank) => {
    seen.add(kart.id);
    let row = rows.get(kart.id);
    if (!row) {
      const el = document.createElement('div');
      el.className = 'lb-row';

      const rankEl = document.createElement('span');
      rankEl.className = 'lb-rank';
      rankEl.style.background = kart.color;

      const headshotCanvas = document.createElement('canvas');
      headshotCanvas.className = 'lb-headshot';
      headshotCanvas.width = HEADSHOT_SIZE;
      headshotCanvas.height = HEADSHOT_SIZE;
      drawHeadshot(headshotCanvas, kart);

      const infoEl = document.createElement('div');
      infoEl.className = 'lb-info';
      const nameEl = document.createElement('span');
      nameEl.className = 'lb-name';
      const statEl = document.createElement('span');
      statEl.className = 'lb-stat';
      infoEl.appendChild(nameEl);
      infoEl.appendChild(statEl);

      el.appendChild(rankEl);
      el.appendChild(headshotCanvas);
      el.appendChild(infoEl);
      container.appendChild(el);
      row = { el, rankEl, nameEl, statEl, lastStat: '' };
      rows.set(kart.id, row);
    }

    row.el.style.top = `${rank * ROW_HEIGHT}px`;
    row.el.classList.toggle('lb-dead', kart.finished);
    row.rankEl.textContent = String(rank + 1);
    row.nameEl.textContent = kart.name;
    const stat = formatStat(kart, laps);
    row.statEl.textContent = stat;

    if (stat !== row.lastStat) {
      row.statEl.classList.remove('lb-pop');
      void row.statEl.offsetWidth; // force reflow so the animation restarts on rapid consecutive changes
      row.statEl.classList.add('lb-pop');
      row.lastStat = stat;
    }
  });

  for (const [kartId, row] of rows) {
    if (!seen.has(kartId)) {
      row.el.remove();
      rows.delete(kartId);
    }
  }

  let overflowEl = container.querySelector('.lb-overflow');
  if (overflow > 0) {
    if (!overflowEl) {
      overflowEl = document.createElement('div');
      overflowEl.className = 'lb-overflow';
      container.appendChild(overflowEl);
    }
    overflowEl.style.top = `${visible.length * ROW_HEIGHT}px`;
    overflowEl.textContent = `+${overflow} more`;
  } else if (overflowEl) {
    overflowEl.remove();
  }
}
