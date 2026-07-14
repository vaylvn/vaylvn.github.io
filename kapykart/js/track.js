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
  boostPads: [
    { atProgress: 0.06, strength: 1.6, duration: 1.4 },
    { atProgress: 0.52, strength: 1.5, duration: 1.3 },
  ],
  hazards: [
    { atProgress: 0.28, type: 'banana', width: 0.03, spinDuration: 1.5 },
    { atProgress: 0.78, type: 'banana', width: 0.03, spinDuration: 1.5 },
  ],
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

/** Did progress cross `at` while moving from prev to curr this tick, accounting for lap wrap? */
export function crossedProgress(prev, curr, at) {
  if (curr >= prev) return prev < at && at <= curr;
  return at > prev || at <= curr;
}

function isValidTrackDef(def) {
  return def && Array.isArray(def.waypoints) && def.waypoints.length >= 3
    && typeof def.width === 'number' && typeof def.laps === 'number';
}

/**
 * Loads a custom track authored in track-editor.html (see js/editor.js) if
 * track.json is present next to index.html, falling back to the built-in
 * TRACK_DEF otherwise. No code changes needed to swap tracks - just drop
 * the exported file in.
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
