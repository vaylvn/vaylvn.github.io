// Two camera modes sharing the same underlying kart worldPos data, differing
// only in how they map world space to screen space (see spec §6).

const FOLLOW_FOCAL = 220; // bigger = things shrink more gradually with distance
const FOLLOW_BASE_PERSPECTIVE_PX = 600;
const FOLLOW_FLOOR_SCALE = 1.15; // world-units-to-floor-canvas-px for the flat recentered/rotated floor layer
export const FOLLOW_BASE_SPRITE_SCALE = 1.4;
export const FOLLOW_ORIGIN_Y_FRACTION = 0.74; // where ry=0 (the followed kart) sits on the sprite canvas

export function computeTopdownScale(track, canvasWidth, canvasHeight, paddingFactor = 0.85) {
  const { width, height } = track.bbox;
  return Math.min(canvasWidth / width, canvasHeight / height) * paddingFactor;
}

export function topdownProject(track, scale, canvasWidth, canvasHeight, worldX, worldY) {
  const { centerX, centerY } = track.bbox;
  return {
    x: (worldX - centerX) * scale + canvasWidth / 2,
    y: (worldY - centerY) * scale + canvasHeight / 2,
  };
}

/**
 * Step 1-2: recenter on the followed kart, then rotate so its forward
 * direction points "up". Returns { rx, ry } where ry = distance ahead of
 * the followed kart (positive = ahead) and rx = sideways offset.
 */
function recenterRotate(followedKart, worldX, worldY) {
  const dx = worldX - followedKart.worldPos.x;
  const dy = worldY - followedKart.worldPos.y;
  const heading = followedKart.angle;
  const rx = dx * Math.cos(-heading) - dy * Math.sin(-heading);
  const ry = dx * Math.sin(-heading) + dy * Math.cos(-heading);
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

/** Sprite layer: recenter + rotate + depth-project. Never CSS-transformed - stays pixel-perfect and upright. */
export function followSpriteProject(followedKart, canvasWidth, canvasHeight, worldX, worldY, zoomFactor) {
  const { rx, ry } = recenterRotate(followedKart, worldX, worldY);
  const depthScale = (FOLLOW_FOCAL * zoomFactor) / (FOLLOW_FOCAL + ry);
  const originY = canvasHeight * FOLLOW_ORIGIN_Y_FRACTION;
  return {
    x: canvasWidth / 2 + rx * depthScale,
    y: originY - ry * depthScale,
    scale: FOLLOW_BASE_SPRITE_SCALE * depthScale,
    visible: (FOLLOW_FOCAL + ry) > 1, // clip points behind/too close to the camera
  };
}

export function followPerspectiveCss(zoomFactor) {
  return `perspective(${FOLLOW_BASE_PERSPECTIVE_PX * zoomFactor}px) rotateX(55deg)`;
}
