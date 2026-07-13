import { CUSTOM_BACKGROUNDS } from '../backgrounds/manifest.js';

function toLabel(filename) {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

export const BACKGROUND_OPTIONS = [
  { id: 'default', label: 'Default' },
  { id: 'chromakey', label: 'Chroma Key (blue)' },
  ...CUSTOM_BACKGROUNDS.map(file => ({ id: file, label: toLabel(file), file })),
];

const images = new Map(); // id -> HTMLImageElement

// Preload every custom image once, up front, so the lobby picker doesn't
// stall on first selection. A missing/failed file just never "completes"
// with a real width, and getBackgroundImage() falls back to the flat color.
for (const bg of BACKGROUND_OPTIONS) {
  if (!bg.file) continue;
  const img = new Image();
  img.src = `backgrounds/${bg.file}`;
  images.set(bg.id, img);
}

/** Returns a loaded, ready-to-draw image for this background id, or null (built-in id, still loading, or failed to load). */
export function getBackgroundImage(id) {
  const img = images.get(id);
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}
