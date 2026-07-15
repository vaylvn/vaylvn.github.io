// Both camera modes share the same recenter -> rotate -> project pipeline,
// differing only in what they use as the camera anchor:
//   - follow mode:    anchor = the followed kart (worldPos + heading), so it
//                      rides along behind that kart.
//   - overview mode:   anchor = a fixed point/heading at the track center,
//                      giving a gently-tilted "SNES Mario Kart map" view.
//
// The floor layer is a flat image, tilted for "free" via a CSS
// `perspective() rotateX()` transform on the whole canvas element. The
// sprite layer is drawn per-kart with no CSS transform at all - each kart's
// screen position/scale has to be computed by hand. For the two layers to
// visually line up, that hand-rolled sprite math has to be the *exact* same
// projection CSS applies to the floor, not just a similar-looking
// approximation - an earlier version used an unrelated ad-hoc depth formula
// and the two layers only roughly agreed, so karts visibly floated off the
// actual track. See projectPoint() below for the shared derivation.

const FOLLOW_FLOOR_SCALE = 1.15; // world-units-to-floor-canvas-px for the flat recentered/rotated floor layer
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

/** Floor layer: recenter + rotate only, no depth scaling - stays flat, then CSS tilts the whole canvas. */
export function followFloorProject(followedKart, canvasWidth, canvasHeight, worldX, worldY, zoomFactor) {
  const { rx, ry } = recenterRotate(followedKart, worldX, worldY);
  const scale = FOLLOW_FLOOR_SCALE * zoomFactor;
  return {
    x: canvasWidth / 2 + rx * scale,
    y: canvasHeight / 2 - ry * scale,
  };
}

/**
 * Sprite layer: recenter + rotate, then project through the exact same
 * perspective(...)/rotateX(...) math the floor's CSS transform uses, using
 * the same world-to-local scale as followFloorProject so the two layers
 * agree on where world space lands. `kartAngle` is the sprite's own world
 * heading; the returned `angle` is relative to the camera's facing
 * direction, which is what directional sprite frames should key off.
 */
export function followSpriteProject(followedKart, canvasWidth, canvasHeight, worldX, worldY, zoomFactor, kartAngle) {
  const { rx, ry } = recenterRotate(followedKart, worldX, worldY);
  const scale = FOLLOW_FLOOR_SCALE * zoomFactor;
  const perspectivePx = FOLLOW_PERSPECTIVE_PX * zoomFactor;
  const p = projectPoint(rx * scale, -ry * scale, FOLLOW_ROTATE_X_RAD, perspectivePx);
  return {
    x: canvasWidth / 2 + p.x,
    y: canvasHeight / 2 + p.y,
    scale: FOLLOW_BASE_SPRITE_SCALE / p.w,
    angle: kartAngle - followedKart.angle,
    visible: p.w > 0.1, // guard against points behind the camera plane (w->0 or negative blows up/flips the projection)
  };
}

export function followPerspectiveCss(zoomFactor) {
  return `perspective(${FOLLOW_PERSPECTIVE_PX * zoomFactor}px) rotateX(${FOLLOW_ROTATE_X_DEG}deg)`;
}

/** Overview floor layer: same flat recenter+rotate idea, fit to the track's own size. */
export function overviewFloorProject(overviewCamera, canvasWidth, canvasHeight, worldX, worldY, zoomFactor) {
  const { rx, ry } = recenterRotate(overviewCamera.anchor, worldX, worldY);
  const scale = overviewCamera.floorScale * Math.min(canvasWidth, canvasHeight) * zoomFactor;
  return {
    x: canvasWidth / 2 + rx * scale,
    y: canvasHeight / 2 - ry * scale,
  };
}

/** Overview sprite layer: same idea as followSpriteProject, anchored to the fixed overview camera instead of a kart. */
export function overviewSpriteProject(overviewCamera, canvasWidth, canvasHeight, worldX, worldY, zoomFactor, kartAngle) {
  const { rx, ry } = recenterRotate(overviewCamera.anchor, worldX, worldY);
  const scale = overviewCamera.floorScale * Math.min(canvasWidth, canvasHeight) * zoomFactor;
  const perspectivePx = OVERVIEW_PERSPECTIVE_PX * zoomFactor;
  const p = projectPoint(rx * scale, -ry * scale, OVERVIEW_ROTATE_X_RAD, perspectivePx);
  return {
    x: canvasWidth / 2 + p.x,
    y: canvasHeight / 2 + p.y,
    scale: OVERVIEW_BASE_SPRITE_SCALE / p.w,
    angle: kartAngle - overviewCamera.anchor.angle,
    visible: p.w > 0.1,
  };
}

export function overviewPerspectiveCss(zoomFactor) {
  return `perspective(${OVERVIEW_PERSPECTIVE_PX * zoomFactor}px) rotateX(${OVERVIEW_ROTATE_X_DEG}deg)`;
}
