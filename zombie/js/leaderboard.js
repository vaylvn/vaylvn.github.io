const ROW_HEIGHT = 34;
const rows = new Map(); // playerId -> { el, nameEl, killsEl, lastKills }

export function initLeaderboard() {
  rows.clear();
  const container = document.getElementById('leaderboard-list');
  container.innerHTML = '';
}

export function updateLeaderboard(gameState) {
  const container = document.getElementById('leaderboard-list');
  const maxRows = gameState.config.leaderboardMaxRows;
  const sorted = [...gameState.players.values()].sort((a, b) => b.kills - a.kills || a.joinOrder - b.joinOrder);
  const visible = sorted.slice(0, maxRows);
  const overflow = sorted.length - visible.length;

  const seen = new Set();

  visible.forEach((player, rank) => {
    seen.add(player.id);
    let row = rows.get(player.id);
    if (!row) {
      const el = document.createElement('div');
      el.className = 'lb-row';
      el.style.borderLeftColor = player.color;
      const nameEl = document.createElement('span');
      nameEl.className = 'lb-name';
      const killsEl = document.createElement('span');
      killsEl.className = 'lb-kills';
      el.appendChild(nameEl);
      el.appendChild(killsEl);
      container.appendChild(el);
      row = { el, nameEl, killsEl, lastKills: player.kills };
      rows.set(player.id, row);
    }

    row.el.style.top = `${rank * ROW_HEIGHT}px`;
    row.nameEl.textContent = player.name;
    row.killsEl.textContent = String(player.kills);

    if (player.kills !== row.lastKills) {
      row.killsEl.classList.remove('lb-pop');
      // Force reflow so the animation restarts even on rapid consecutive kills.
      void row.killsEl.offsetWidth;
      row.killsEl.classList.add('lb-pop');
      row.lastKills = player.kills;
    }
  });

  for (const [playerId, row] of rows) {
    if (!seen.has(playerId)) {
      row.el.remove();
      rows.delete(playerId);
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
