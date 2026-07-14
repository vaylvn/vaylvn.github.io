// Streamer camera controls (on-page buttons, not chat commands - this is
// the streamer's tool). See spec §7.

function rankedKartIds(karts) {
  return [...karts.values()]
    .sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      return b.totalProgress - a.totalProgress;
    })
    .map(k => k.id);
}

function pickLeaderId(gameState) {
  const ranked = rankedKartIds(gameState.karts);
  return ranked.length ? ranked[0] : null;
}

function setFollowedKart(gameState, kartId) {
  if (kartId == null) return;
  gameState.camera.mode = 'follow';
  gameState.camera.followedId = kartId;
}

function cycleFollowed(gameState, delta) {
  const ranked = rankedKartIds(gameState.karts);
  if (ranked.length === 0) return;
  const currentIndex = ranked.indexOf(gameState.camera.followedId);
  const nextIndex = currentIndex === -1
    ? 0
    : ((currentIndex + delta) % ranked.length + ranked.length) % ranked.length;
  setFollowedKart(gameState, ranked[nextIndex]);
}

export function wireCameraUI(gameState, spriteCanvas) {
  const overviewBtn = document.getElementById('cam-overview-btn');
  const prevBtn = document.getElementById('cam-prev-btn');
  const nextBtn = document.getElementById('cam-next-btn');
  const zoomSlider = document.getElementById('cam-zoom-slider');

  overviewBtn.addEventListener('click', () => {
    if (gameState.camera.mode === 'overview') {
      setFollowedKart(gameState, gameState.camera.followedId || pickLeaderId(gameState));
    } else {
      gameState.camera.mode = 'overview';
    }
  });

  prevBtn.addEventListener('click', () => {
    if (gameState.camera.mode === 'overview') setFollowedKart(gameState, pickLeaderId(gameState));
    else cycleFollowed(gameState, -1);
  });

  nextBtn.addEventListener('click', () => {
    if (gameState.camera.mode === 'overview') setFollowedKart(gameState, pickLeaderId(gameState));
    else cycleFollowed(gameState, 1);
  });

  zoomSlider.addEventListener('input', () => {
    gameState.camera.zoomFactor = Number(zoomSlider.value) / 100;
  });

  spriteCanvas.addEventListener('click', e => {
    if (gameState.camera.mode !== 'overview') return;
    const rect = spriteCanvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    for (const box of gameState.overviewHitboxes || []) {
      const hitRadius = Math.max(box.r, 14);
      if (Math.hypot(clickX - box.x, clickY - box.y) <= hitRadius) {
        setFollowedKart(gameState, box.id);
        break;
      }
    }
  });
}

/** Call once per frame (or on state changes) to keep button/slider state in sync. */
export function updateCameraUI(gameState) {
  const overviewBtn = document.getElementById('cam-overview-btn');
  const isOverview = gameState.camera.mode === 'overview';

  overviewBtn.classList.toggle('active', isOverview);
  overviewBtn.textContent = isOverview ? 'Overview ✓' : 'Overview';
}
