// Track data, Catmull-Rom spline sampling, and the progress -> {x,y,angle}
// arc-length lookup table everything else queries. Build this once at load,
// reuse everywhere - the floor and the karts must never disagree about
// where the track actually is.

const RAW_SAMPLES = 1000;

// One simple oval-ish loop for v1 (per spec's own recommendation: prove the
// core race is fun to watch before investing in a fancier course).
export const TRACK_DEF = {
  id: 'capy_speedway_1',
  waypoints: [
    { x: 120, y: 320 },
    { x: 160, y: 140 },
    { x: 340, y: 60 },
    { x: 600, y: 60 },
    { x: 800, y: 140 },
    { x: 860, y: 320 },
    { x: 800, y: 480 },
    { x: 600, y: 540 },
    { x: 340, y: 540 },
    { x: 160, y: 480 },
  ],
  width: 150,
  laps: 3,
  // Boost pads / hazards are world-position + radius, not track-progress -
  // they're meant to line up with features drawn into a background image
  // (see track-editor.html), so they need to live in the same coordinate
  // space a human places them in, not an abstract 0-1 path position.
  boostPads: [
    { x: 132, y: 197, radius: 70, strength: 1.6, duration: 1.4 },
    { x: 860, y: 335, radius: 70, strength: 1.5, duration: 1.3 },
  ],
  hazards: [
    { x: 531, y: 52, radius: 55, type: 'banana', spinDuration: 1.5 },
    { x: 434, y: 547, radius: 55, type: 'banana', spinDuration: 1.5 },
  ],
  // Optional: [base, light speckle, dark speckle] hex colors for the
  // procedurally-textured out-of-bounds ground (see render.js's
  // buildGroundTexture) - lets a track set its own terrain (snow, sand,
  // ...) instead of the default grass. Omit entirely to use that default -
  // this field is not required by isValidTrackDef.
  // groundColors: ['#3b7a08', '#4c8f12', '#2f6606'],
};

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  const x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t
    + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2
    + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
  const y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t
    + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2
    + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
  return { x, y };
}

/**
 * Precomputes the closed-loop spline once: samples it densely, walks the
 * samples to accumulate arc length, then builds a progress (0-1) -> {x, y,
 * angle} lookup table. sampleTrack() below is the only thing that should
 * ever touch this table.
 */
export function buildTrack(def) {
  const waypoints = def.waypoints;
  const n = waypoints.length;
  const raw = [];

  for (let i = 0; i < RAW_SAMPLES; i++) {
    const t = (i / RAW_SAMPLES) * n;
    const seg = Math.floor(t) % n;
    const localT = t - Math.floor(t);
    const p0 = waypoints[(seg - 1 + n) % n];
    const p1 = waypoints[seg];
    const p2 = waypoints[(seg + 1) % n];
    const p3 = waypoints[(seg + 2) % n];
    raw.push(catmullRom(p0, p1, p2, p3, localT));
  }

  let total = 0;
  const cum = [0];
  for (let i = 0; i < RAW_SAMPLES; i++) {
    const a = raw[i];
    const b = raw[(i + 1) % RAW_SAMPLES];
    total += Math.hypot(b.x - a.x, b.y - a.y);
    cum.push(total);
  }

  const table = raw.map((p, i) => {
    const next = raw[(i + 1) % RAW_SAMPLES];
    const angle = Math.atan2(next.y - p.y, next.x - p.x);
    return { progress: cum[i] / total, x: p.x, y: p.y, angle };
  });

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of raw) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const halfWidth = def.width / 2;

  return {
    def,
    table,
    length: total,
    bbox: {
      width: (maxX - minX) + def.width * 2,
      height: (maxY - minY) + def.width * 2,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
      halfWidth,
    },
  };
}

/** Binary search for the last table entry whose progress is <= p. */
function findFloorIndex(table, p) {
  let lo = 0;
  let hi = table.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (table[mid].progress <= p) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/**
 * The single source of truth for "where is the track at this progress".
 * Returns { x, y, angle } where angle is the tangent direction in radians.
 */
export function sampleTrack(track, progress) {
  const p = ((progress % 1) + 1) % 1;
  const table = track.table;
  const i = findFloorIndex(table, p);
  const a = table[i];
  const b = table[(i + 1) % table.length];

  let span = b.progress - a.progress;
  if (span <= 0) span += 1;
  let localP = p - a.progress;
  if (localP < 0) localP += 1;
  const f = span > 0 ? localP / span : 0;

  const x = a.x + (b.x - a.x) * f;
  const y = a.y + (b.y - a.y) * f;

  let da = b.angle - a.angle;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  const angle = a.angle + da * f;

  return { x, y, angle };
}

function isValidTrackDef(def) {
  return def && Array.isArray(def.waypoints) && def.waypoints.length >= 3
    && typeof def.width === 'number' && typeof def.laps === 'number';
}

/**
 * Loads a custom track authored in track-editor.html (see js/editor.js) if
 * track.json is present next to index.html, falling back to the built-in
 * TRACK_DEF otherwise. No code changes needed to swap tracks - just drop
 * the exported file in. Used as the single-track legacy path when no
 * tracks/manifest.json exists - see loadTrackList().
 */
export async function loadTrackDef() {
  try {
    const res = await fetch('track.json', { cache: 'no-store' });
    if (!res.ok) return TRACK_DEF;
    const def = await res.json();
    return isValidTrackDef(def) ? def : TRACK_DEF;
  } catch {
    return TRACK_DEF;
  }
}

/**
 * Loads one track JSON file from tracks/<file> (as referenced by a
 * tracks/manifest.json entry - see loadTrackList()). Returns null on any
 * failure so the caller can skip a bad entry instead of the whole list
 * failing.
 */
async function loadTrackFile(file) {
  try {
    const res = await fetch(`tracks/${file}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const def = await res.json();
    return isValidTrackDef(def) ? def : null;
  } catch {
    return null;
  }
}

/**
 * Loads every available track as a list of { label, def }, for the
 * streamer to cycle through in the lobby (see ui.js/main.js).
 *
 * If tracks/manifest.json exists - an array of { file, label } entries,
 * each file relative to tracks/ - every valid entry becomes one track in
 * the list. Otherwise falls back to the original single-track flow
 * (track.json next to index.html, or the built-in TRACK_DEF), so an
 * existing setup with just one track.json keeps working with zero changes.
 */
export async function loadTrackList() {
  try {
    const res = await fetch('tracks/manifest.json', { cache: 'no-store' });
    if (res.ok) {
      const manifest = await res.json();
      if (Array.isArray(manifest) && manifest.length > 0) {
        const entries = [];
        for (const item of manifest) {
          if (!item || typeof item.file !== 'string') continue;
          const def = await loadTrackFile(item.file);
          if (def) entries.push({ label: item.label || def.id || item.file, def });
        }
        if (entries.length > 0) return entries;
      }
    }
  } catch {
    // fall through to the legacy single-track path below
  }

  const def = await loadTrackDef();
  return [{ label: def.id || 'Track', def }];
}

/**
 * Loads a track's optional background image (def.backgroundImage - a path
 * relative to index.html, authored via track-editor.html's upload flow).
 * Resolves to null if the field is absent or the file fails to load, in
 * which case render.js falls back to drawing the road procedurally.
 */
export function loadTrackBackground(def) {
  if (!def.backgroundImage) return Promise.resolve(null);
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = def.backgroundImage;
  });
}
