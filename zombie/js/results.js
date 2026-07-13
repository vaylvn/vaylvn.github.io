function formatDuration(ms) {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function makeCell(text, color) {
  const td = document.createElement('td');
  td.textContent = text; // textContent, never innerHTML - player names come straight from Twitch chat
  if (color) td.style.color = color;
  return td;
}

const REASON_TEXT = {
  stopped: { title: 'Round Over', subtitle: 'The broadcaster called it.' },
  overrun: { title: 'Overrun', subtitle: 'The braincell has fallen.' },
};

export function showResults(gameState, reason) {
  const { title, subtitle } = REASON_TEXT[reason] || REASON_TEXT.stopped;
  document.getElementById('results-title').textContent = title;
  document.getElementById('results-subtitle').textContent = subtitle;
  document.getElementById('results-total-time').textContent = formatDuration(gameState.endedAt - gameState.playStartedAt);

  const rows = [...gameState.players.values()]
    .map(player => ({
      player,
      survivedMs: (player.alive ? gameState.endedAt : player.deadAt) - gameState.playStartedAt,
    }))
    .sort((a, b) => b.player.kills - a.player.kills || b.survivedMs - a.survivedMs);

  const tbody = document.getElementById('results-table-body');
  tbody.innerHTML = '';
  rows.forEach(({ player, survivedMs }, i) => {
    const tr = document.createElement('tr');
    if (!player.alive) tr.classList.add('results-dead');
    tr.appendChild(makeCell(String(i + 1)));
    tr.appendChild(makeCell(player.name, player.color));
    tr.appendChild(makeCell(String(player.kills)));
    tr.appendChild(makeCell(player.alive ? 'Full round' : formatDuration(survivedMs)));
    tbody.appendChild(tr);
  });

  document.getElementById('results-screen').classList.remove('hidden');
}

export function hideResults() {
  document.getElementById('results-screen').classList.add('hidden');
}
