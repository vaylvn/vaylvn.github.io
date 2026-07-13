export function createDefaultConfig() {
  return {
    // Exposed on the streamer config panel (see index.html #config-panel).
    wordMin: 3,
    wordMax: 7,
    longWordChance: 0.05,
    baseSpawnInterval: 1800, // ms, starting pace
    spawnRampRate: 0.87, // multiplier applied per ~30s wave notch
    fastChance: 0.10,
    armoredChance: 0.10,
    nightMode: false,
    fogEnabled: false,
    fogViewRange: 260, // px from the survivor line; only matters if fogEnabled

    // Fixed tunables, not exposed in v1's panel (see spec §8 table).
    minSpawnInterval: 400,
    laneCount: 12,
    weaponMilestones: [5, 15, 30, 50],
    grenadeMilestone: 20,
    grenadeCap: 2,
    leaderboardMaxRows: 8,
  };
}

/** Wires the on-page streamer panel's form controls directly into gameState.config. */
export function wireConfigPanel(gameState) {
  const cfg = gameState.config;
  const bind = (id, key, parse, clamp) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      let value = parse(el.value);
      if (clamp) value = clamp(value);
      cfg[key] = value;
      syncLabels();
    });
  };

  bind('cfg-word-min', 'wordMin', Number, v => Math.min(v, cfg.wordMax));
  bind('cfg-word-max', 'wordMax', Number, v => Math.max(v, cfg.wordMin));
  bind('cfg-long-chance', 'longWordChance', v => Number(v) / 100);
  bind('cfg-base-interval', 'baseSpawnInterval', Number);
  bind('cfg-ramp-rate', 'spawnRampRate', v => Number(v) / 100);
  bind('cfg-fast-chance', 'fastChance', v => Number(v) / 100);
  bind('cfg-armored-chance', 'armoredChance', v => Number(v) / 100);
  bind('cfg-fog-range', 'fogViewRange', Number);

  const nightToggle = document.getElementById('cfg-night-mode');
  if (nightToggle) nightToggle.addEventListener('change', () => { cfg.nightMode = nightToggle.checked; });

  const fogToggle = document.getElementById('cfg-fog-enabled');
  if (fogToggle) fogToggle.addEventListener('change', () => { cfg.fogEnabled = fogToggle.checked; });

  function syncLabels() {
    document.querySelectorAll('[data-cfg-label]').forEach(el => {
      const key = el.dataset.cfgLabel;
      if (key in cfg) {
        const raw = cfg[key];
        el.textContent = typeof raw === 'number' && raw < 1 && raw > 0
          ? `${Math.round(raw * 100)}%`
          : raw;
      }
    });
  }
  syncLabels();
}
