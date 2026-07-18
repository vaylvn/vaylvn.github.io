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
// the track loop is big or small, and going tighter needs LESS world space
// to fill the screen, not more, so (counterintuitively) it's what keeps the
// camera from ever needing to see past a background track image's edge, not
// what causes it. Verified against the real shipped track (tracks/track.json
// + assets/track1.png, road only ~50-90px from the image edge, vs a 145px-
// wide road): the drawn image fully covers the visible floor at every point
// around the loop at this zoom (see conversation history / prior sim).
//
// A first attempt at this same formula caused visibly "warped diamond"
// floor art - but that turned out to be the built-in fallback track's
// procedural checkered start line (drawCheckerLine in render.js), which
// draws in fixed WORLD units and had a fixed low square count (6) tuned for
// the old, much-more-zoomed-out scale. At this tighter scale each square
// covers much more of the screen, same as the road ribbon correctly getting
// wider when you zoom in - just too few of them to still read as a checker
// pattern. Fixed by upping the square count there instead of retreating on
// zoom (see drawCheckerLine's SQUARES constant). A custom track background
// image with thinner margins than ~25% of its own road width could still
// clip at this zoom - that's the source art needing more border, not a
// renderer bug.
//
// This one number also controls how much forward depth fits in the fixed-
// size floor canvas before the horizon cutoff (see FLOOR_OVERSIZE_HEIGHT):
// a tighter zoom needs MORE floor-canvas pixels per world-unit, so the same
// canvas holds LESS world-depth for the same render cost. Two earlier
// attempts to fix a too-short forward view by retuning this alone weren't
// enough on their own - the real unlock was decoupling "ahead" from
// "behind" canvas budget (see FOLLOW_FORWARD_FRACTION) - but the
// relationship itself is real and worth spending deliberately: this went
// back up to 2.6 once forward visibility didn't strictly depend on it, but
// per explicit direction to trade some kart size for more forward reach,
// it's back down to 2.0. That shrinks the kart from 172px to 132px (still
// a real, substantial size - not the ~34px it was before this session's
// FOLLOW_KART_WORLD_SIZE fix existed) and, for the SAME render budget,
// buys room to push FOLLOW_AHEAD_WORLD_UNITS from 300 to 400 essentially
// for free (2.34x actual cost vs. the previous 2.27x - barely different).
const FOLLOW_FIT_FACTOR = 2.0; // x (canvas min dimension / track road width)

// The floor canvas used to split its "ahead" vs "behind" pixel budget as a
// fixed FRACTION of however tall the canvas happened to be - so when
// FLOOR_OVERSIZE_HEIGHT grew a lot to buy more forward visibility, "behind"
// grew right along with it even though a forward chase cam barely needs
// any of that (nothing meaningful is ever shown behind the kart). That
// oversized "behind" region pushed the near/bottom edge's CSS perspective
// math past its own w=0 singularity (the same kind of blow-up/distortion
// that "ahead" would hit if pushed too far past its own vanishing point,
// just on the opposite side) - a real, separate bug from the forward-
// visibility work, not something the earlier "verify w stays positive"
// pass caught, because it was only re-checked before the buffer grew.
//
// Fixed by decoupling the two: FOLLOW_FORWARD_FRACTION is now DERIVED from
// two independent world-unit targets (see FLOOR_OVERSIZE_WIDTH/HEIGHT
// below for how these were chosen) instead of being an arbitrary fraction
// applied to whatever the total happens to be.
// 150 was chosen as the largest value safe EVERYWHERE on the entire loop
// (see FLOOR_OVERSIZE_WIDTH/HEIGHT below) - but that meant even the most
// generous parts of the track (the starting grid included) were throttled
// down to match whatever the single worst corner elsewhere could tolerate.
// Checked directly against the real track: from the starting line, real
// drawn track extends to ~480 world-units before the source image itself
// runs out - more than 3x what 150 was showing. Per explicit direction
// that void at the few tight corners elsewhere is fine, this is now sized
// for the good, common case instead of the single worst case. Pushed
// further from 300 to 400 alongside FOLLOW_FIT_FACTOR dropping to 2.0 -
// the smaller kart needs a smaller buffer for the same world-reach, so
// this jump costs almost nothing extra (see FOLLOW_FIT_FACTOR's comment).
const FOLLOW_AHEAD_WORLD_UNITS = 400; // matches FLOOR_OVERSIZE_HEIGHT/WIDTH's derivation below
const FOLLOW_BEHIND_WORLD_UNITS = 25; // small and fixed on purpose - see above
const FOLLOW_FORWARD_FRACTION = FOLLOW_AHEAD_WORLD_UNITS / (FOLLOW_AHEAD_WORLD_UNITS + FOLLOW_BEHIND_WORLD_UNITS);

// This is a fraction of the CANVAS's own size, not of the viewport - it
// must NOT be used to derive where the canvas is POSITIONED on screen
// (see followFloorTop/FOLLOW_PIVOT_VIEWPORT_FRACTION below for that). An
// earlier version conflated the two: it derived the kart's on-screen
// position from the canvas's centered CSS position, so growing
// FLOOR_OVERSIZE_HEIGHT (a canvas SIZE change) also silently dragged the
// kart's on-screen position down as a side effect, eventually pushing the
// kart itself off the bottom of the viewport. Keeping "canvas size" and
// "where the pivot lands on screen" as two independent numbers, with the
// canvas's CSS position solved to satisfy both, avoids that coupling.

// Steeper tilt = the actual "low to the ground" SNES feel this is meant to
// have. A previous pass flattened this to 32deg to close the horizon gap,
// which technically worked but gave up the entire point of a close chase
// cam - the wrong trade. The real fix: at 55deg with the ORIGINAL
// FOLLOW_PERSPECTIVE_PX (600), closing the gap was never just "expensive"
// - it was mathematically IMPOSSIBLE at any buffer size (the canvas's far
// edge approaches a fixed asymptote around y=180 as the buffer grows, and
// that asymptote never crosses 0 while d=600). Verified by deriving where
// that asymptote sits as a function of angle and perspective distance:
// raising FOLLOW_PERSPECTIVE_PX moves the asymptote past 0, and past a
// point the buffer size actually needed to fully close the gap comes back
// DOWN again - see FOLLOW_PERSPECTIVE_PX below for the paired value this
// needs. Back to the original steep angle at no extra buffer/render cost.
const FOLLOW_ROTATE_X_DEG = 55;

// Where the kart's own anchor point should land on the VIEWPORT (not the
// canvas) - a direct, independent design choice, e.g. 0.75 puts it fairly
// low (close chase-cam feel) while leaving ~25% of the viewport height
// below it for the kart sprite's own body/boost-flame effect (at a 172px
// kart, half-height ~86px and the flame's ~138px reach both need to fit in
// that margin - verify against actual sprite size before changing this).
const FOLLOW_PIVOT_VIEWPORT_FRACTION = 0.75;

// FOLLOW_PERSPECTIVE_PX is a fixed CSS pixel distance, not world-scaled -
// unlike floorScale above, this one deliberately does NOT track the per-
// track zoom.
//
// A previous pass raised this to 2000 specifically to make the horizon gap
// mathematically closeable at 55deg - that worked, but it was the wrong
// fix: a bigger perspective distance also flattens how quickly things
// shrink with depth, which is what actually reads as "SNES-low" (a real
// low camera looks across the ground and things recede dramatically, not
// gently). The gap closing was real progress; it just came from gutting
// the exact quality that makes a low camera look low, not from actually
// showing more real track. Reverted to the original 600 - the correct fix
// for how much sky is visible is buffer size, not this.
const FOLLOW_PERSPECTIVE_PX = 600;

// Kart sprites were a fixed PIXEL size (FOLLOW_BASE_SPRITE_SCALE), so when
// the zoom above got much tighter (the road now fills far more of the
// screen), the kart's on-screen size didn't grow to match, reading as
// disproportionately "tiny" next to it. Giving it a WORLD size instead
// (in the same units as the road/checker line) means it scales up right
// along with everything else. ~12 world units is about one starting-grid
// checker square (see render.js's CHECKER_SQUARE_SIZE) - a kart roughly
// that wide across.
const FOLLOW_KART_WORLD_SIZE = 12; // world units - see render.js's KART_BASE_SIZE for how this becomes pixels

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
// cover it after the CSS tilt - not a guess, both derived and checked
// against the real shipped track image.
//
// These cap how much of the track is actually DRAWN into the canvas before
// the CSS tilt even happens - both ahead of the kart (HEIGHT, see
// FOLLOW_FORWARD_FRACTION) and to its sides (WIDTH). A smaller value here
// was never "a stylistic horizon/edge band" - it was leaving real,
// already-painted track image undrawn simply because the buffer was too
// small to hold it, even though the source PNG had plenty more content
// right there (confirmed directly: other karts further down the track
// still rendered correctly as sprites - sprites aren't buffer-limited -
// while the floor beneath them was empty sky, proving the content existed
// and only the floor buffer was cutting it off).
//
// An earlier pass required staying safe at the single WORST point anywhere
// on the entire loop, which meant every other, much less tight point on
// the track was needlessly limited to that same small capacity too - most
// of assets/track1.png's grass margin was going unused everywhere except
// at that one pinch point, INCLUDING at the starting grid, where real
// track extends to ~480 world-units before the source image itself runs
// out. Per explicit, repeated direction: void at the few tight corners
// elsewhere is fine, the goal is to stop leaving real, already-painted
// track undrawn at the good/common positions. Doubled from the previous
// pass's 150 to 300 world-units of forward+sideways capacity (still well
// under the ~480 available at the start specifically, but a real,
// substantial improvement without an astronomical cost - see below).
//
// HEIGHT is built from FOLLOW_AHEAD_WORLD_UNITS + FOLLOW_BEHIND_WORLD_UNITS
// (300 + 25, see above) rather than a single symmetric number - "behind"
// deliberately stays small so the near/bottom edge's perspective math
// keeps a comfortable margin from its own w=0 singularity regardless of
// how generous "ahead" gets.
//
// Pushed further again (300->400) alongside FOLLOW_FIT_FACTOR dropping to
// 2.0 - a smaller zoom needs a smaller buffer for the same world-unit
// reach, so this jump was nearly free: actual render cost barely moved
// (~2.34x baseline vs. the previous pass's ~2.27x), compensated via
// render.js's FOLLOW_FLOOR_PIXEL_SCALE (still 8, unchanged - didn't need
// to grow further this time). If this needs to go even further later,
// raising that pixel scale is the first lever before shrinking these back
// down, and dropping FOLLOW_FIT_FACTOR more is the second (at the cost of
// an even smaller kart).
export const FLOOR_OVERSIZE_WIDTH = 6.897;
export const FLOOR_OVERSIZE_HEIGHT = 5.862;

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

// The camera's heading used to just COPY the followed kart's exact
// per-frame track-tangent angle, so any change in track curvature (turning
// into a corner) snapped the whole view instantly to match - positionally
// correct, but reads as static/robotic rather than a camera that's
// physically chasing the kart around a curve. This eases the camera's OWN
// heading toward the kart's real heading over time instead of copying it
// outright. Deliberately only the ANGLE lags - the anchor's worldPos still
// tracks the kart exactly every frame (see the cameraAnchor built in
// render.js's renderFollow), so there's no positional drift or "rubber
// band" trailing behind, just a softened turn-in. Framerate-independent
// (exponential ease scaled by dt, not a fixed per-frame step). Higher =
// snappier/less lag, lower = more smoothing/more lag - by eye, retune
// directly if the turn-in reads as too sluggish or too subtle.
const FOLLOW_HEADING_SMOOTHING_RATE = 6;

function shortestAngleDelta(from, to) {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

/**
 * Advances `camera.smoothedAngle` toward `followedKart.angle` by one frame
 * (dt seconds) - call once per frame, before rendering, whenever
 * camera.mode is 'follow'. Snaps instantly instead of easing the first time
 * it runs for a given followed kart (camera.smoothedAngle is null) - main.js
 * resets it to null whenever camera.followedId changes, so switching which
 * kart the camera follows doesn't swing through whatever heading the
 * previous kart happened to be facing.
 */
export function advanceFollowCameraHeading(camera, followedKart, dt) {
  if (camera.smoothedAngle == null) {
    camera.smoothedAngle = followedKart.angle;
    return;
  }
  const delta = shortestAngleDelta(camera.smoothedAngle, followedKart.angle);
  const ease = 1 - Math.exp(-FOLLOW_HEADING_SMOOTHING_RATE * dt);
  camera.smoothedAngle += delta * ease;
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
 * (oversized) dimensions, using FOLLOW_FORWARD_FRACTION to place the
 * kart's own reference point (ry=0) at that same fraction down the
 * canvas's pixel height (not necessarily its geometric center - see
 * followFloorTop for how the canvas is positioned so this still lines up
 * with sprite screen space). Scale comes from buildFollowCamera (fit to
 * the track's own size), not a zoom slider.
 */
export function followFloorProject(followCamera, followedKart, viewportWidth, viewportHeight, floorWidth, floorHeight, worldX, worldY) {
  const { rx, ry } = recenterRotate(followedKart, worldX, worldY);
  const scale = followCamera.floorScale * Math.min(viewportWidth, viewportHeight);
  return {
    x: floorWidth / 2 + rx * scale,
    y: floorHeight * FOLLOW_FORWARD_FRACTION - ry * scale,
  };
}

/**
 * CSS `top` for the floor canvas element in follow mode. The canvas's
 * pivot (FOLLOW_FORWARD_FRACTION down its own height, matching
 * followTransformOrigin) needs to land at FOLLOW_PIVOT_VIEWPORT_FRACTION
 * down the VIEWPORT - solving `top + floorHeight*F = viewportHeight*target`
 * for top keeps that true regardless of how big floorHeight is, so
 * resizing the canvas (FLOOR_OVERSIZE_HEIGHT) never drags the kart's
 * on-screen position along with it as a side effect. `left` stays the
 * plain centered formula - no horizontal asymmetry.
 */
export function followFloorTop(viewportHeight, floorHeight) {
  return viewportHeight * FOLLOW_PIVOT_VIEWPORT_FRACTION - floorHeight * FOLLOW_FORWARD_FRACTION;
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
    y: viewportHeight * FOLLOW_PIVOT_VIEWPORT_FRACTION + p.y,
    // 24 = render.js's KART_BASE_SIZE (the reference sprite size a scale of
    // 1 means), so this comes out to FOLLOW_KART_WORLD_SIZE*scale/p.w
    // pixels - a genuine world size, not a fixed pixel one.
    scale: (FOLLOW_KART_WORLD_SIZE * scale) / 24 / p.w,
    angle: kartAngle - followedKart.angle,
    visible: p.w > 0.1, // guard against points behind the camera plane (w->0 or negative blows up/flips the projection)
  };
}

export function followPerspectiveCss() {
  return `perspective(${FOLLOW_PERSPECTIVE_PX}px) rotateX(${FOLLOW_ROTATE_X_DEG}deg)`;
}

/** CSS transform-origin for the floor canvas in follow mode - must match followFloorTop's pivot (see there for why). */
export function followTransformOrigin() {
  return `50% ${(FOLLOW_FORWARD_FRACTION * 100).toFixed(3)}%`;
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

/** CSS `top` for the floor canvas in overview mode - plain centered, symmetric (no forward/behind split, see followFloorTop for why follow mode differs). */
export function overviewFloorTop(viewportHeight, floorHeight) {
  return (viewportHeight - floorHeight) / 2;
}
