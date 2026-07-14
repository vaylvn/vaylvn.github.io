// Both camera modes share the same underlying kart worldPos data and the
// same recenter -> rotate -> depth-project pipeline (see spec §6) - they
// only differ in what they use as the camera anchor:
//   - follow mode:   anchor = the followed kart (worldPos + heading), so it
//                     rides along behind that kart.
//   - overview mode:  anchor = a fixed point/heading above the track center,
//                     pulled back far enough that the whole loop reads as a
//                     gently-tilted "SNES Mario Kart map" view rather than a
//                     true flat blueprint.

const FOLLOW_FOCAL = 220; // bigger = things shrink more gradually with distance
const FOLLOW_BASE_PERSPECTIVE_PX = 600;
const FOLLOW_FLOOR_SCALE = 1.15; // world-units-to-floor-canvas-px for the flat recentered/rotated floor layer
export const FOLLOW_BASE_SPRITE_SCALE = 1.4;
export const FOLLOW_ORIGIN_Y_FRACTION = 0.74; // where ry=0 (the followed kart) sits on the sprite canvas

// Overview tuning is derived from the track's own size (see buildOverviewCamera)
// rather than fixed constants, so a custom track from the editor still frames
// reasonably. These multipliers are the "slightly angled" knobs to retune by
// eye once real art is in place.
const OVERVIEW_FOCAL_FACTOR = 2.6; // x track radius
const OVERVIEW_CAMERA_BACK_FACTOR = 2.2; // x track radius - bigger = flatter/more orthographic
const OVERVIEW_FLOOR_FIT_FACTOR = 0.4; // x (canvas min dimension / track radius)
export const OVERVIEW_BASE_SPRITE_SCALE = 2.2;
export const OVERVIEW_ORIGIN_Y_FRACTION = 0.5; // whole-track view centers vertically, unlike the follow cam's "self near the bottom"
const OVERVIEW_BASE_PERSPECTIVE_PX = 900;
const OVERVIEW_ANCHOR_ANGLE = -Math.PI / 2;

/**
 * Precomputes the fixed overview camera anchor + tuning for a track. Anchor
 * sits at the track's bbox center; cameraBack pulls the effective viewing
 * distance back proportional to the track's own bounding radius so bigger
 * custom tracks (from track-editor.html) still frame sensibly without
 * hand-tuned constants per track.
 */
export function buildOverviewCamera(track) {
  const { bbox } = track;
  const radius = Math.hypot(bbox.width, bbox.height) / 2;
  return {
    anchor: { worldPos: { x: bbox.centerX, y: bbox.centerY }, angle: OVERVIEW_ANCHOR_ANGLE },
    focal: radius * OVERVIEW_FOCAL_FACTOR,
    cameraBack: radius * OVERVIEW_CAMERA_BACK_FACTOR,
    floorScale: OVERVIEW_FLOOR_FIT_FACTOR / radius, // multiplied by canvas min dimension at project time
  };
}

/**
 * Recenter + rotate relative to an arbitrary camera anchor ({worldPos, angle}).
 * Returns { rx, ry } where ry = distance "ahead" of the anchor along its
 * facing direction (positive = ahead) and rx = sideways offset.
 *
 * rx is the projection of (dx,dy) onto the perpendicular-left vector
 * (-sin(heading), cos(heading)); ry is the projection onto the heading
 * vector itself (cos(heading), sin(heading)) - i.e. rx = "how far left",
 * ry = "how far ahead". (An earlier version of this formula projected onto
 * the opposite axes, silently swapping forward/sideways for every point
 * that wasn't the camera's own anchor - caught by sampling real kart art
 * against the depth-projection math and finding the numbers didn't line up
 * with what the sprite sheet's frame layout implied.)
 */
function recenterRotate(anchor, worldX, worldY) {
  const dx = worldX - anchor.worldPos.x;
  const dy = worldY - anchor.worldPos.y;
  const heading = anchor.angle;
  const rx = -dx * Math.sin(heading) + dy * Math.cos(heading);
  const ry = dx * Math.cos(heading) + dy * Math.sin(heading);
  return { rx, ry };
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
 * Sprite layer: recenter + rotate + depth-project. Never CSS-transformed -
 * stays pixel-perfect and upright. `kartAngle` is the sprite's own world
 * heading; the returned `angle` is relative to the camera's facing
 * direction, which is what directional sprite frames should key off (so
 * frame choice stays correct regardless of the camera's own orientation).
 */
export function followSpriteProject(followedKart, canvasWidth, canvasHeight, worldX, worldY, zoomFactor, kartAngle) {
  const { rx, ry } = recenterRotate(followedKart, worldX, worldY);
  const depthScale = (FOLLOW_FOCAL * zoomFactor) / (FOLLOW_FOCAL + ry);
  const originY = canvasHeight * FOLLOW_ORIGIN_Y_FRACTION;
  return {
    x: canvasWidth / 2 + rx * depthScale,
    y: originY - ry * depthScale,
    scale: FOLLOW_BASE_SPRITE_SCALE * depthScale,
    angle: kartAngle - followedKart.angle,
    visible: (FOLLOW_FOCAL + ry) > 1, // clip points behind/too close to the camera
  };
}

export function followPerspectiveCss(zoomFactor) {
  return `perspective(${FOLLOW_BASE_PERSPECTIVE_PX * zoomFactor}px) rotateX(55deg)`;
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

/** Overview sprite layer: depth-projected from the fixed anchor, pulled back by cameraBack so the whole loop stays "ahead". */
export function overviewSpriteProject(overviewCamera, canvasWidth, canvasHeight, worldX, worldY, zoomFactor, kartAngle) {
  const { rx, ry } = recenterRotate(overviewCamera.anchor, worldX, worldY);
  const ryFromCamera = ry + overviewCamera.cameraBack;
  const depthScale = (overviewCamera.focal * zoomFactor) / (overviewCamera.focal + ryFromCamera);
  const originY = canvasHeight * OVERVIEW_ORIGIN_Y_FRACTION;
  return {
    x: canvasWidth / 2 + rx * depthScale,
    y: originY - ry * depthScale,
    scale: OVERVIEW_BASE_SPRITE_SCALE * depthScale,
    angle: kartAngle - overviewCamera.anchor.angle,
    visible: (overviewCamera.focal + ryFromCamera) > 1,
  };
}

export function overviewPerspectiveCss(zoomFactor) {
  return `perspective(${OVERVIEW_BASE_PERSPECTIVE_PX * zoomFactor}px) rotateX(35deg)`;
}
