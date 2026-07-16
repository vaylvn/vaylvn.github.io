// Both camera modes share the same recenter -> rotate -> project pipeline,
// differing only in what they use as the camera anchor:
//   - follow mode:    anchor = the followed kart (worldPos + heading), so it
//                      rides along behind that kart, tight SNES-style.
//   - overview mode:   anchor = a fixed point/heading at the track center,
//                      giving a gently-tilted "SNES Mario Kart map" view.
//
// The floor layer is a flat image, tilted for "free" via a CSS
// `perspective() rotateX()` transform on the whole canvas element. The
// sprite layer is drawn per-kart with no CSS transform at all - each kart's
// screen position/scale has to be computed by hand, using the exact same
// perspective/rotateX math CSS applies to the floor (see projectPoint), so
// the two layers agree on where world space lands.
//
// The floor canvas is deliberately bigger than the viewport (see
// buildFloorCanvasSize + main.js) and centered over it: a steeply tilted
// flat rectangle covers less of the screen than its own untilted size, so a
// viewport-sized canvas leaves gaps at the edges once tilted. Sprites are
// drawn on a separate, viewport-sized canvas with no CSS transform, so they
// always use the viewport's own dimensions, never the floor's.

// Follow mode's scale is fit to the ROAD's own width (track.def.width), not
// the overall track's bbox - a close chase-cam should feel the same whether
// the track loop is big or small; what matters is how many road-widths fit
// across the screen. This also happens to be what keeps the camera from
// ever needing to see past the edge of a background track image: a smaller
// on-screen footprint (tighter zoom) needs LESS world space to fill the
// screen, not more, so counterintuitively going tighter is what avoids
// running past a hand-painted track image's edges, not what causes it - the
// earlier "fit the whole track" zoom-out was solving the wrong problem,
// verified against the real shipped track (tracks/track.json + assets/
// track1.png, whose road sits only ~50-90px from the image edge, vs a
// 145px-wide road) via scripts_scratch/zoom_sim2.mjs: it forward/inverse-
// projects the actual follow-camera math around the whole track and finds
// the tightest zoom that never needs more margin than the image has. 2.6
// leaves a comfortable safety margin on that track. A custom track image
// with thinner margins than ~25% of its own road width could still clip at
// this zoom - that's the source art needing more border, not a renderer bug.
const FOLLOW_FIT_FACTOR = 2.6; // x (canvas min dimension / track road width)
const FOLLOW_PERSPECTIVE_PX = 600;
const FOLLOW_ROTATE_X_DEG = 55;
export const FOLLOW_BASE_SPRITE_SCALE = 1.4;

// Overview tuning is derived from the track's own size (see buildOverviewCamera)
// rather than fixed constants, so a custom track from the editor still frames
// reasonably. These are the "slightly angled" knobs to retune by eye.
const OVERVIEW_FLOOR_FIT_FACTOR = 0.4; // x (canvas min dimension / track radius)
const OVERVIEW_PERSPECTIVE_PX = 2200;
const OVERVIEW_ROTATE_X_DEG = 35;
export const OVERVIEW_BASE_SPRITE_SCALE = 1;
const OVERVIEW_ANCHOR_ANGLE = -Math.PI / 2;

const FOLLOW_ROTATE_X_RAD = FOLLOW_ROTATE_X_DEG * (Math.PI / 180);
const OVERVIEW_ROTATE_X_RAD = OVERVIEW_ROTATE_X_DEG * (Math.PI / 180);

// How much bigger than the viewport the floor canvas needs to be to fully
// cover it after the CSS tilt, derived by forward-projecting the floor
// canvas's own corners through projectPoint and checking they land past the
// viewport edges - not a guess. Follow mode's steeper 55deg tilt is the
// tighter constraint of the two modes; this comfortably covers both, with
// the top ~27% of the screen intentionally left as an uncovered "horizon"
// band (every pseudo-3D racer has one - nothing needs to render all the way
// to the mathematical vanishing point). Pushing this further shrinks that
// band, but the floor canvas's pixel-fill cost scales with its area - a
// prior attempt at 2.6x2.8 (16% band) cost ~6.7x more per-frame canvas work
// than this combined with PIXEL_SCALE and was a real, noticeable perf hit.
// This is the "known good" balance; revisit only with a profiling number in
// hand, not another guess.
export const FLOOR_OVERSIZE_WIDTH = 1.8;
export const FLOOR_OVERSIZE_HEIGHT = 1.35;

export function buildFloorCanvasSize(viewportWidth, viewportHeight) {
  return { width: viewportWidth * FLOOR_OVERSIZE_WIDTH, height: viewportHeight * FLOOR_OVERSIZE_HEIGHT };
}

/**
 * Precomputes the fixed overview camera anchor + tuning for a track. Anchor
 * sits at the track's bbox center; floorScale is fit to the track's own
 * bounding radius so bigger custom tracks (from track-editor.html) still
 * frame sensibly without hand-tuned constants per track.
 */
export function buildOverviewCamera(track) {
  const { bbox } = track;
  const radius = Math.hypot(bbox.width, bbox.height) / 2;
  return {
    anchor: { worldPos: { x: bbox.centerX, y: bbox.centerY }, angle: OVERVIEW_ANCHOR_ANGLE },
    floorScale: OVERVIEW_FLOOR_FIT_FACTOR / radius, // multiplied by canvas min dimension at project time
  };
}

/**
 * Precomputes follow mode's fit scale for a track - see FOLLOW_FIT_FACTOR.
 * Unlike overview, there's no fixed anchor point to precompute here (the
 * anchor is whichever kart is being followed, recomputed every frame); this
 * only caches the one thing that's constant per track.
 */
export function buildFollowCamera(track) {
  return { floorScale: FOLLOW_FIT_FACTOR / track.def.width };
}

/**
 * Recenter + rotate relative to an arbitrary camera anchor ({worldPos, angle}).
 * Returns { rx, ry } where ry = distance "ahead" of the anchor along its
 * facing direction (positive = ahead) and rx = sideways offset.
 */
function recenterRotate(anchor, worldX, worldY) {
  const dx = worldX - anchor.worldPos.x;
  const dy = worldY - anchor.worldPos.y;
  const heading = anchor.angle;
  const rx = -dx * Math.sin(heading) + dy * Math.cos(heading);
  const ry = dx * Math.cos(heading) + dy * Math.sin(heading);
  return { rx, ry };
}

/**
 * Reproduces exactly what `transform: perspective(perspectivePx) rotateX(rotateXRad)`
 * does to a point (lx, ly) relative to the transform-origin (the element's
 * own center, CSS's default) of a flat element lying in the local XY plane:
 *
 *   1. rotateX rotates the point about the X axis: y'=ly*cos(A), z'=ly*sin(A)
 *   2. perspective(d) then projects it: divide x and y' by w = 1 - z'/d
 *
 * Used for BOTH where a sprite should sit on screen (so it lines up with
 * the CSS-tilted floor under it) and how much smaller/bigger it should be
 * drawn at that depth (1/w is exactly the scale factor perspective applies).
 */
function projectPoint(lx, ly, rotateXRad, perspectivePx) {
  const rotatedY = ly * Math.cos(rotateXRad);
  const rotatedZ = ly * Math.sin(rotateXRad);
  const w = 1 - rotatedZ / perspectivePx;
  return { x: lx / w, y: rotatedY / w, w };
}

/**
 * Floor layer: recenter + rotate only, no depth scaling - stays flat, then
 * CSS tilts the whole canvas. Positions within the floor canvas's OWN
 * (oversized) dimensions - its center is CSS-positioned to coincide with the
 * viewport's center, so this still lines up with sprite screen space. Scale
 * comes from buildFollowCamera (fit to the track's own size), not a zoom
 * slider, so the whole track image stays in view.
 */
export function followFloorProject(followCamera, followedKart, viewportWidth, viewportHeight, floorWidth, floorHeight, worldX, worldY) {
  const { rx, ry } = recenterRotate(followedKart, worldX, worldY);
  const scale = followCamera.floorScale * Math.min(viewportWidth, viewportHeight);
  return {
    x: floorWidth / 2 + rx * scale,
    y: floorHeight / 2 - ry * scale,
  };
}

/**
 * Sprite layer: recenter + rotate, then project through the exact same
 * perspective(...)/rotateX(...) math the floor's CSS transform uses, using
 * the same world-to-local scale as followFloorProject so the two layers
 * agree on where world space lands. Positions within the viewport (the
 * sprite canvas is never oversized or transformed). `kartAngle` is the
 * sprite's own world heading; the returned `angle` is relative to the
 * camera's facing direction, which is what directional sprite frames
 * should key off.
 */
export function followSpriteProject(followCamera, followedKart, viewportWidth, viewportHeight, worldX, worldY, kartAngle) {
  const { rx, ry } = recenterRotate(followedKart, worldX, worldY);
  const scale = followCamera.floorScale * Math.min(viewportWidth, viewportHeight);
  const p = projectPoint(rx * scale, -ry * scale, FOLLOW_ROTATE_X_RAD, FOLLOW_PERSPECTIVE_PX);
  return {
    x: viewportWidth / 2 + p.x,
    y: viewportHeight / 2 + p.y,
    scale: FOLLOW_BASE_SPRITE_SCALE / p.w,
    angle: kartAngle - followedKart.angle,
    visible: p.w > 0.1, // guard against points behind the camera plane (w->0 or negative blows up/flips the projection)
  };
}

export function followPerspectiveCss() {
  return `perspective(${FOLLOW_PERSPECTIVE_PX}px) rotateX(${FOLLOW_ROTATE_X_DEG}deg)`;
}

/**
 * Overview floor layer: same flat recenter+rotate idea, fit to the track's
 * own size. Scale is computed from the viewport (so "fit the track nicely"
 * stays tied to what the streamer actually sees), but positions are within
 * the floor canvas's own (oversized) dimensions.
 */
export function overviewFloorProject(overviewCamera, viewportWidth, viewportHeight, floorWidth, floorHeight, worldX, worldY, zoomFactor) {
  const { rx, ry } = recenterRotate(overviewCamera.anchor, worldX, worldY);
  const scale = overviewCamera.floorScale * Math.min(viewportWidth, viewportHeight) * zoomFactor;
  return {
    x: floorWidth / 2 + rx * scale,
    y: floorHeight / 2 - ry * scale,
  };
}

/** Overview sprite layer: same idea as followSpriteProject, anchored to the fixed overview camera instead of a kart. */
export function overviewSpriteProject(overviewCamera, viewportWidth, viewportHeight, worldX, worldY, zoomFactor, kartAngle) {
  const { rx, ry } = recenterRotate(overviewCamera.anchor, worldX, worldY);
  const scale = overviewCamera.floorScale * Math.min(viewportWidth, viewportHeight) * zoomFactor;
  const perspectivePx = OVERVIEW_PERSPECTIVE_PX * zoomFactor;
  const p = projectPoint(rx * scale, -ry * scale, OVERVIEW_ROTATE_X_RAD, perspectivePx);
  return {
    x: viewportWidth / 2 + p.x,
    y: viewportHeight / 2 + p.y,
    scale: OVERVIEW_BASE_SPRITE_SCALE / p.w,
    angle: kartAngle - overviewCamera.anchor.angle,
    visible: p.w > 0.1,
  };
}

export function overviewPerspectiveCss(zoomFactor) {
  return `perspective(${OVERVIEW_PERSPECTIVE_PX * zoomFactor}px) rotateX(${OVERVIEW_ROTATE_X_DEG}deg)`;
}
