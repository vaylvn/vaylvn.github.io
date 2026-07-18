// Custom art hook, same "drop a file in, no code changes" pattern as
// audio.js. Missing files just resolve to null and render.js falls back to
// the next tier down (flat single-image tinting, then the built-in vector
// sprites) - shipping with an empty /assets folder is safe.
//
// Two ways to supply kart art:
//
//   1. A directional sprite sheet - assets/kart_capybara_sheet.png, a grid
//      of frames showing the SAME fused kart+capybara model rotated through
//      a full turn (KART_SHEET_COLS x KART_SHEET_ROWS, default 4x2 = 8
//      directions). render.js picks the nearest frame to each kart's
//      heading relative to the camera, so karts visually turn instead of
//      staying pixel-locked upright. The kart body is recolored per racer
//      with an automatic hue-shift (see recolorFrameHue); the constants
//      below are tuned against the current kart_capybara_sheet.png - if
//      you swap in different art, re-tune KART_HUE_SOURCE_DEG etc. to its
//      red and KART_SHEET_FRAME0_OFFSET/KART_SHEET_CLOCKWISE to its frame
//      order.
//
//      The sheet can also stack multiple such 4x2 blocks vertically
//      (KART_SHEET_ANIM_BLOCKS) - each block is the SAME 8 directions in
//      the SAME order, just a different animation pose. render.js cycles
//      through these based on how far each kart has actually traveled, so
//      it animates while moving and holds still when parked.
//
//      The current sheet is 4x8 (4 stacked blocks): blocks 0-1 are a
//      normal-driving pose pair (e.g. a head-bob), blocks 2-3 are the SAME
//      pose pair again but with a boost exhaust-flame effect added - used
//      whenever a kart's boostTimer is active (see KART_SHEET_BOOST_BLOCK_OFFSET
//      in render.js). If more normal or boost pose variations get added
//      later, keep the two groups the same size and contiguous (normal
//      poses first, then the matching boost poses).
//
//   2. Two flat images - assets/kart.png (tintable flat silhouette) and
//      assets/capybara.png (fixed-color character), layered and always
//      drawn upright. Used only if the sheet above isn't present.
//
// Expected files (any pixel size - fit into their sprite's bounding box
// preserving aspect ratio):
//   assets/kart_capybara_sheet.png - directional rotation sheet (preferred)
//   assets/kart.png                - flat tintable kart body (fallback)
//   assets/capybara.png            - fixed-color capybara (fallback)

const ASSET_PATHS = {
  kartSheet: 'assets/kart_capybara_sheet.png',
  kart: 'assets/kart.png',
  capybara: 'assets/capybara.png',
};

const KART_SHEET_COLS = 4;
const KART_SHEET_ROWS = 2; // rows per animation block - 8 directions per block, laid out the same way in every block

// The sheet can stack multiple full 4x2 (COLS x ROWS) direction-sets on top
// of each other, each one a different animation pose of the SAME 8
// directions in the SAME order - e.g. a 4x4 sheet is 2 stacked blocks (a
// head-bob pair), a 4x8 sheet is 4. Bump this if more blocks get added.
const KART_SHEET_ANIM_BLOCKS = 4;

// Of the KART_SHEET_ANIM_BLOCKS above, how many are the "normal driving"
// pose variations - the rest (from this index on) are the SAME pose
// variations again but with a boost exhaust-flame effect added, in the
// same order. render.js picks a block from the first group while
// boostTimer is inactive, and the matching block from the second group
// while it's active.
const KART_SHEET_NORMAL_BLOCKS = 2;

// Tuned against the real kart_capybara_sheet.png (4x2, 300px frames):
// frame 0 is the dead-on "facing the camera" pose (relativeAngle = 180deg,
// oncoming), frame 4 is the "facing away" rear view (relativeAngle = 0,
// the common case - a kart driving the same direction the camera looks).
// KART_SHEET_CLOCKWISE picks which way frames advance between those two
// fixed points - confirmed false against the real sheet (front/back poses
// were right, but left/right turns showed the mirrored frame).
const KART_SHEET_FRAME0_OFFSET = Math.PI; // radians added before frame lookup
const KART_SHEET_CLOCKWISE = false; // does frame index increase clockwise as heading rotates?

// Tuned by sampling the actual sheet's red kart-body panel (clustered
// around hue 5-15deg, sat 0.55-0.9, lightness 0.2-0.5) versus the
// capybara's fur (hue 27-40deg) - narrow enough to avoid tinting the nose,
// wide enough to catch the panel's shaded/highlighted edges. A couple of
// stray single pixels (ear-tip shadow) still slip through at full 300px
// resolution but are sub-pixel and invisible once scaled down to in-game
// sprite size.
const KART_HUE_SOURCE_DEG = 9;
const KART_HUE_TOLERANCE_DEG = 13;
const KART_HUE_MIN_SATURATION = 0.45;
const KART_HUE_LIGHTNESS_MIN = 0.15;
const KART_HUE_LIGHTNESS_MAX = 0.78;

function loadImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// --- Color math ---

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
    case g: h = ((b - r) / d + 2); break;
    default: h = ((r - g) / d + 4);
  }
  return { h: h * 60, s, l };
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = t => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return {
    r: Math.round(hue2rgb(h + 1 / 3) * 255),
    g: Math.round(hue2rgb(h) * 255),
    b: Math.round(hue2rgb(h - 1 / 3) * 255),
  };
}

function hueDistance(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function hexToHue(hex) {
  const n = parseInt(hex.slice(1), 16);
  const { h } = rgbToHsl((n >> 16) & 255, (n >> 8) & 255, n & 255);
  return h;
}

/**
 * Recolors only the "kart-red" pixels of a sheet region to `targetHueDeg`,
 * preserving each pixel's own saturation/lightness (so shading/highlights
 * still read) and leaving everything else - capybara fur, tires, outlines,
 * the logo decal - untouched.
 */
function recolorFrameHue(img, sx, sy, sw, sh, targetHueDeg) {
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

  const imageData = ctx.getImageData(0, 0, sw, sh);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a === 0) continue;
    const { h, s, l } = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    if (s < KART_HUE_MIN_SATURATION) continue;
    if (l < KART_HUE_LIGHTNESS_MIN || l > KART_HUE_LIGHTNESS_MAX) continue;
    if (hueDistance(h, KART_HUE_SOURCE_DEG) > KART_HUE_TOLERANCE_DEG) continue;
    const { r, g, b } = hslToRgb(targetHueDeg, s, l);
    data[i] = r; data[i + 1] = g; data[i + 2] = b;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Nearest sheet frame index for a heading (radians) relative to the camera's facing direction. */
export function pickFrameIndex(relativeAngle, frameCount) {
  const sign = KART_SHEET_CLOCKWISE ? 1 : -1;
  const a = ((relativeAngle * sign + KART_SHEET_FRAME0_OFFSET) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  return Math.round(a / (Math.PI * 2 / frameCount)) % frameCount;
}

/** Hands control back to the browser for one macrotask - NOT requestAnimationFrame, which never fires in some embedded/headless preview contexts. */
function yieldToBrowser() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

// Recoloring is per-pixel HSL math over every frame of every animation block
// for every kart color (buildKartSheet below) - real work that doubled when
// the sheet grew from 2 animation blocks to 4 (see KART_SHEET_ANIM_BLOCKS),
// and ran as one single uninterruptible synchronous pass. On a slower
// machine/tab that reads as the page having actually frozen (nothing can
// paint or respond, including the "Loading track and assets" text itself,
// for the whole multi-second pass) rather than just taking a while. Yielding
// once per color spreads that same work across multiple macrotasks instead,
// so the tab stays responsive throughout - total time is barely affected
// (a handful of ~0ms setTimeout hops), but it no longer LOOKS hung.
async function buildKartSheet(img, kartColors) {
  const frameCount = KART_SHEET_COLS * KART_SHEET_ROWS;
  const frameW = img.naturalWidth / KART_SHEET_COLS;
  const frameH = img.naturalHeight / (KART_SHEET_ROWS * KART_SHEET_ANIM_BLOCKS);
  const frames = new Map(); // color -> array[animBlock] -> array of recolored frame canvases, indexed by direction frame index

  for (const color of kartColors) {
    const targetHue = hexToHue(color);
    const perAnimBlock = [];
    for (let b = 0; b < KART_SHEET_ANIM_BLOCKS; b++) {
      const perFrame = [];
      for (let i = 0; i < frameCount; i++) {
        const col = i % KART_SHEET_COLS;
        const row = b * KART_SHEET_ROWS + Math.floor(i / KART_SHEET_COLS);
        perFrame.push(recolorFrameHue(img, col * frameW, row * frameH, frameW, frameH, targetHue));
      }
      perAnimBlock.push(perFrame);
    }
    frames.set(color, perAnimBlock);
    await yieldToBrowser();
  }

  return { frameCount, animBlocks: KART_SHEET_ANIM_BLOCKS, normalBlocks: KART_SHEET_NORMAL_BLOCKS, frames };
}

/** Recolors a flat white/light silhouette to `color`, using the source's own alpha as the mask (used by the flat kart.png fallback). */
function tintImage(img, color) {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Loads whichever kart/capybara art is present and pre-builds every color
 * variant once, up front, so the per-frame render path never touches the
 * canvas pixel/compositing APIs - just a cheap drawImage.
 */
export async function loadAssets(kartColors) {
  const [sheetImg, kartImg, capybaraImg] = await Promise.all([
    loadImage(ASSET_PATHS.kartSheet),
    loadImage(ASSET_PATHS.kart),
    loadImage(ASSET_PATHS.capybara),
  ]);

  const kartSheet = sheetImg ? await buildKartSheet(sheetImg, kartColors) : null;

  const kartTints = new Map();
  if (kartImg) {
    for (const color of kartColors) kartTints.set(color, tintImage(kartImg, color));
  }

  return { kartSheet, kartImg, capybaraImg, kartTints };
}
