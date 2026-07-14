// Reused directly from HOARDE (zombie/js/leaderboard.js) - same pop/reorder
// animation approach, just ranked by race progress instead of kill count.

const ROW_HEIGHT = 34;
const MAX_ROWS = 12;
const rows = new Map(); // kartId -> { el, nameEl, statEl, lastStat }

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
  return `L${Math.min(kart.lap + 1, laps)}`;
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
      el.style.borderLeftColor = kart.color;
      const nameEl = document.createElement('span');
      nameEl.className = 'lb-name';
      const statEl = document.createElement('span');
      statEl.className = 'lb-kills';
      el.appendChild(nameEl);
      el.appendChild(statEl);
      container.appendChild(el);
      row = { el, nameEl, statEl, lastStat: '' };
      rows.set(kart.id, row);
    }

    row.el.style.top = `${rank * ROW_HEIGHT}px`;
    row.el.classList.toggle('lb-dead', kart.finished);
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
