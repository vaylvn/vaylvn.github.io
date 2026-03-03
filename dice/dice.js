// ============================================================
//  VAYL DICE WIDGET
//  URL flag: ?data=base64 → widget mode
//  No flag → config/preview mode
// ============================================================

const params = new URLSearchParams(window.location.search);
const IS_WIDGET = params.has("data");

// ============================================================
//  DEFAULT CONFIG
// ============================================================

const DEFAULT_CONFIG = {
  widgetName: "dice",
  autoRoll: false,
  autoRollDelay: 2,
  clickToRoll: true,
  pollFlask: true,
  showOverlay: true,
  overlayDuration: 3000,
  sceneBg: "#0d0d0d",
  tableColor: "#1a1a2e",
  showTable: true,
  ambientLight: 40,
  shadowQuality: "medium",
  resultFont: "Outfit",
  resultColor: "#ffffff",
  resultSize: 64,
  resultPosition: "center",
  dice: [
    { type: 6, dieColor: "#c0392b", dotColor: "#ffffff", faceStyle: "dots" },
    { type: 6, dieColor: "#2c3e8c", dotColor: "#ffffff", faceStyle: "dots" },
  ],
};

let config = { ...DEFAULT_CONFIG };

// ============================================================
//  MODE DETECTION
// ============================================================

if (IS_WIDGET) {
  document.addEventListener("DOMContentLoaded", initWidgetMode);
} else {
  document.addEventListener("DOMContentLoaded", initConfigMode);
}

// ============================================================
//  3D DICE ENGINE
// ============================================================

class DiceEngine {
  constructor(canvas, cfg) {
    this.canvas = canvas;
    this.cfg = cfg;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.world = null;
    this.diceObjects = []; // { mesh, body, type, dieColor, dotColor, faceStyle }
    this.rolling = false;
    this.onRollComplete = null;
    this.animFrameId = null;
    this.resolveTimer = null;
    this._init();
  }

  _init() {
    const canvas = this.canvas;
    const w = canvas.clientWidth || canvas.offsetWidth || 800;
    const h = canvas.clientHeight || canvas.offsetHeight || 600;

    // Three.js scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.cfg.sceneBg || "#0d0d0d");
    this.scene.fog = new THREE.Fog(this.cfg.sceneBg || "#0d0d0d", 20, 80);

    // Camera
    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 200);
    this.camera.position.set(0, 16, 14);
    this.camera.lookAt(0, 0, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setSize(w, h, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = this.cfg.shadowQuality !== "off";
    if (this.cfg.shadowQuality === "high") {
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    // Lights
    const amb = new THREE.AmbientLight(0xffffff, (this.cfg.ambientLight || 40) / 100);
    this.scene.add(amb);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
    dirLight.position.set(6, 14, 8);
    dirLight.castShadow = this.cfg.shadowQuality !== "off";
    dirLight.shadow.mapSize.width = this.cfg.shadowQuality === "high" ? 2048 : 1024;
    dirLight.shadow.mapSize.height = dirLight.shadow.mapSize.width;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 50;
    dirLight.shadow.camera.left = -12;
    dirLight.shadow.camera.right = 12;
    dirLight.shadow.camera.top = 12;
    dirLight.shadow.camera.bottom = -12;
    this.scene.add(dirLight);

    const fillLight = new THREE.PointLight(0x4488ff, 0.3, 40);
    fillLight.position.set(-8, 6, -4);
    this.scene.add(fillLight);

    // Table / floor
    if (this.cfg.showTable !== false) {
      const tableGeo = new THREE.PlaneGeometry(40, 40);
      const tableMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(this.cfg.tableColor || "#1a1a2e"),
        roughness: 0.85,
        metalness: 0.05,
      });
      const table = new THREE.Mesh(tableGeo, tableMat);
      table.rotation.x = -Math.PI / 2;
      table.receiveShadow = true;
      this.scene.add(table);
    }

    // Cannon.js physics world
    this.world = new CANNON.World();
    this.world.gravity.set(0, -30, 0);
    this.world.broadphase = new CANNON.NaiveBroadphase();
    this.world.solver.iterations = 20;

    // Physics floor
    const floorBody = new CANNON.Body({ mass: 0 });
    floorBody.addShape(new CANNON.Plane());
    floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    this.world.addBody(floorBody);

    // Wall bodies (invisible walls to keep dice in frame)
    this._addWall(new CANNON.Vec3(0, 0, 1), new CANNON.Vec3(0, 0, -8));
    this._addWall(new CANNON.Vec3(0, 0, -1), new CANNON.Vec3(0, 0, 8));
    this._addWall(new CANNON.Vec3(1, 0, 0), new CANNON.Vec3(-10, 0, 0));
    this._addWall(new CANNON.Vec3(-1, 0, 0), new CANNON.Vec3(10, 0, 0));

    // Resize observer
    this._resizeObserver = new ResizeObserver(() => this._onResize());
    this._resizeObserver.observe(canvas);

    // Start render loop
    this._animate();
  }

  _addWall(normal, pos) {
    const body = new CANNON.Body({ mass: 0 });
    body.addShape(new CANNON.Plane());
    body.quaternion.setFromVectors(new CANNON.Vec3(0, 0, 1), normal);
    body.position.copy(pos);
    this.world.addBody(body);
  }

  _onResize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  _animate() {
    this.animFrameId = requestAnimationFrame(() => this._animate());
    const dt = 1 / 60;
    if (this.rolling && this.diceObjects.length > 0) {
      this.world.step(dt);
      this.diceObjects.forEach(d => {
        d.mesh.position.copy(d.body.position);
        d.mesh.quaternion.copy(d.body.quaternion);
      });
    }
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    if (this._resizeObserver) this._resizeObserver.disconnect();
    this.renderer.dispose();
  }

  // ============================================================
  //  TEXTURE ATLAS
  //  All face textures for one die are packed into a single canvas
  //  arranged in a grid. Built-in Three.js geometries already have
  //  correct per-face UVs in [0,1]. We remap each face's UVs to
  //  point at its cell in the atlas.
  // ============================================================

  /**
   * Build a square atlas canvas containing `count` face textures
   * arranged in a sqrt(count) × sqrt(count) grid.
   * Returns { texture, cols, rows, cellSize }
   */
  _buildAtlas(sides, dieColor, dotColor, faceStyle) {
    const count = sides;
    const cols  = Math.ceil(Math.sqrt(count));
    const rows  = Math.ceil(count / cols);
    const cell  = 256;
    const W = cols * cell;
    const H = rows * cell;

    const atlasCvs = document.createElement("canvas");
    atlasCvs.width  = W;
    atlasCvs.height = H;
    const ctx = atlasCvs.getContext("2d");

    for (let fi = 0; fi < count; fi++) {
      const col = fi % cols;
      const row = Math.floor(fi / cols);
      const ox  = col * cell;
      const oy  = row * cell;
      this._drawFaceIntoCtx(ctx, ox, oy, cell, sides, fi + 1, dieColor, dotColor, faceStyle);
    }

    return { texture: new THREE.CanvasTexture(atlasCvs), cols, rows, cell, W, H };
  }

  _drawFaceIntoCtx(ctx, ox, oy, size, sides, faceNum, dieColor, dotColor, faceStyle) {
    // Solid background
    ctx.fillStyle = dieColor;
    ctx.fillRect(ox, oy, size, size);

    // Slightly lighter face plate
    const pad = Math.round(size * 0.04);
    const r   = Math.round(size * 0.09);
    ctx.fillStyle = this._adjustColor(dieColor, 18);
    this._roundRect(ctx, ox + pad, oy + pad, size - pad*2, size - pad*2, r);
    ctx.fill();

    // Edge highlight
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth   = 2;
    this._roundRect(ctx, ox + pad + 1, oy + pad + 1, size - pad*2 - 2, size - pad*2 - 2, r);
    ctx.stroke();

    const useStyle = (sides !== 6 && faceStyle === "dots") ? "numbers" : faceStyle;

    if (useStyle === "numbers") {
      const fontSize = sides > 9 ? Math.round(size * 0.36) : Math.round(size * 0.42);
      ctx.font         = `bold ${fontSize}px "Outfit", Arial, sans-serif`;
      ctx.textAlign    = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor  = "rgba(0,0,0,0.65)";
      ctx.shadowBlur   = 8;
      ctx.fillStyle    = dotColor;
      const cx = ox + size / 2;
      const cy = oy + size / 2 + 2;
      ctx.fillText(String(faceNum), cx, cy);
      if (faceNum === 6 || faceNum === 9) {
        const tw = ctx.measureText(String(faceNum)).width;
        ctx.shadowBlur  = 0;
        ctx.strokeStyle = dotColor;
        ctx.lineWidth   = Math.max(2, size * 0.01);
        ctx.beginPath();
        ctx.moveTo(cx - tw * 0.5, cy + fontSize * 0.48);
        ctx.lineTo(cx + tw * 0.5, cy + fontSize * 0.48);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    } else {
      // Dots (d6 only)
      this._drawD6DotsInCtx(ctx, ox, oy, size, faceNum, dotColor);
    }
  }

  _adjustColor(hex, amount) {
    let r = parseInt(hex.slice(1,3), 16);
    let g = parseInt(hex.slice(3,5), 16);
    let b = parseInt(hex.slice(5,7), 16);
    return `rgb(${Math.min(255,r+amount)},${Math.min(255,g+amount)},${Math.min(255,b+amount)})`;
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.lineTo(x+w-r, y);
    ctx.arcTo(x+w, y, x+w, y+r, r);
    ctx.lineTo(x+w, y+h-r);
    ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
    ctx.lineTo(x+r, y+h);
    ctx.arcTo(x, y+h, x, y+h-r, r);
    ctx.lineTo(x, y+r);
    ctx.arcTo(x, y, x+r, y, r);
    ctx.closePath();
  }

  _drawD6DotsInCtx(ctx, ox, oy, size, n, color) {
    const dotR = size * 0.085;
    const pad  = size * 0.24;
    const mid  = size / 2;
    const s    = size;
    const positions = {
      1: [[mid, mid]],
      2: [[pad, pad], [s-pad, s-pad]],
      3: [[pad, pad], [mid, mid], [s-pad, s-pad]],
      4: [[pad, pad], [s-pad, pad], [pad, s-pad], [s-pad, s-pad]],
      5: [[pad, pad], [s-pad, pad], [mid, mid], [pad, s-pad], [s-pad, s-pad]],
      6: [[pad, pad], [s-pad, pad], [pad, mid], [s-pad, mid], [pad, s-pad], [s-pad, s-pad]],
    };
    (positions[n] || []).forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(ox + x, oy + y, dotR, 0, Math.PI * 2);
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur  = 4;
      ctx.fillStyle   = color;
      ctx.fill();
      ctx.shadowBlur = 0;
    });
  }

  // ============================================================
  //  GEOMETRY BUILDERS
  //  Each returns a BufferGeometry whose UV attribute maps each
  //  face triangle to [0,1]×[0,1]. We then remap those UVs to
  //  the atlas cell for that face index.
  // ============================================================

  /**
   * Remap UVs of a geometry so face `fi` (0-indexed) maps to its
   * atlas cell. `faceTriCount` = number of triangles per face.
   * The geometry must have flat-shaded groups (one group per face)
   * OR we use the faceTriCount approach for uniform-face solids.
   */
  _remapUVsToAtlas(geo, sides, cols, rows, faceTriCount) {
    const uvAttr = geo.attributes.uv;
    const uvArr  = uvAttr.array;
    const triTotal = uvArr.length / 2; // total UV pairs

    const cellW = 1 / cols;
    const cellH = 1 / rows;

    // Each face has faceTriCount triangles × 3 verts = faceTriCount*3 UV pairs
    const vertsPerFace = faceTriCount * 3;

    for (let fi = 0; fi < sides; fi++) {
      const col = fi % cols;
      // Atlas origin is top-left but WebGL UVs are bottom-left — flip row
      const row = rows - 1 - Math.floor(fi / cols);
      const u0  = col * cellW;
      const v0  = row * cellH;

      const base = fi * vertsPerFace;
      for (let vi = base; vi < base + vertsPerFace && vi * 2 + 1 < uvArr.length; vi++) {
        // Original UV is already in [0,1] for the face; scale to cell
        const origU = uvArr[vi * 2];
        const origV = uvArr[vi * 2 + 1];
        uvArr[vi * 2]     = u0 + origU * cellW;
        uvArr[vi * 2 + 1] = v0 + origV * cellH;
      }
    }
    uvAttr.needsUpdate = true;
  }

  // ---- Per-die-type geometry + atlas UV remap ----

  _buildD4(atlas) {
    // Tetrahedron: 4 triangular faces, 1 tri each
    // Three.js TetrahedronGeometry has 4 faces × 1 tri = 12 verts
    // But its UV layout is NOT per-face — we must build manually.
    const geo = this._buildManualFacedGeo_Tetra();
    this._remapManualGeoUVs(geo, 4, atlas.cols, atlas.rows);
    return geo;
  }

  _buildD6(atlas) {
    // Use manual geo so UV mapping is guaranteed correct per face
    const h = 0.8;
    const verts = [
      [-h,-h,-h],[h,-h,-h],[h,h,-h],[-h,h,-h],
      [-h,-h, h],[h,-h, h],[h,h, h],[-h,h, h],
    ];
    // Faces in order 1–6, consistent outward winding
    const faces = [
      [0,1,2,3], // front  -z → face 1
      [5,4,7,6], // back   +z → face 2
      [3,2,6,7], // top    +y → face 3
      [4,5,1,0], // bottom -y → face 4
      [1,5,6,2], // right  +x → face 5
      [4,0,3,7], // left   -x → face 6
    ];
    const geo = this._buildManualGeo(verts, faces);
    this._remapManualGeoUVs(geo, 6, atlas.cols, atlas.rows);
    return geo;
  }

  _buildD8(atlas) {
    // OctahedronGeometry: 8 triangular faces, 1 tri each
    const geo = this._buildManualFacedGeo_Octa();
    this._remapManualGeoUVs(geo, 8, atlas.cols, atlas.rows);
    return geo;
  }

  _buildD10(atlas) {
    const geo = this._buildManualFacedGeo_D10();
    this._remapManualGeoUVs(geo, 10, atlas.cols, atlas.rows);
    return geo;
  }

  _buildD12(atlas) {
    const geo = this._buildManualFacedGeo_Dodec();
    this._remapManualGeoUVs(geo, 12, atlas.cols, atlas.rows);
    return geo;
  }

  _buildD20(atlas) {
    const geo = this._buildManualFacedGeo_Icosa();
    this._remapManualGeoUVs(geo, 20, atlas.cols, atlas.rows);
    return geo;
  }

  // ============================================================
  //  MANUAL FACE GEOMETRY BUILDER
  //  For each die we define exact face vertex lists.
  //  Each face is triangulated (fan from vertex 0).
  //  UV for every vertex is set to a canonical "face centre" UV
  //  [0,1]x[0,1] using a simple planar projection — then
  //  _remapManualGeoUVs maps each face's UVs to its atlas cell.
  // ============================================================

  /**
   * Given verts and faces, build a BufferGeometry where:
   * - each face is a triangle fan
   * - each face's UV spans [0,1]×[0,1] (via simple 2D projection)
   * - geometry has ONE group per face (materialIndex = faceIndex)
   * Also returns faceNormals[] for result-reading.
   */
  _buildManualGeo(verts, faces) {
    const pos = [], nrm = [], uvs = [], groups = [];
    const faceNormals = [];
    let cursor = 0;

    faces.forEach((face, fi) => {
      const v3 = face.map(i => new THREE.Vector3(...verts[i]));

      // Face normal
      const edge1 = v3[1].clone().sub(v3[0]);
      const edge2 = v3[2].clone().sub(v3[0]);
      const fn    = edge1.cross(edge2).normalize();
      faceNormals.push(fn.clone());

      // Local 2D axes on the face plane
      const uAxis = v3[1].clone().sub(v3[0]).normalize();
      const vAxis = fn.clone().cross(uAxis).normalize();

      // Project all verts onto face plane → 2D
      const centroid = v3.reduce((a,b) => a.clone().add(b), new THREE.Vector3()).divideScalar(v3.length);
      const pts2d = v3.map(p => {
        const d = p.clone().sub(centroid);
        return [ d.dot(uAxis), d.dot(vAxis) ];
      });

      // Normalise to [0.05, 0.95]
      let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
      pts2d.forEach(([u,v]) => { uMin=Math.min(uMin,u); uMax=Math.max(uMax,u); vMin=Math.min(vMin,v); vMax=Math.max(vMax,v); });
      const span = Math.max(uMax-uMin, vMax-vMin) || 1;
      const norm2d = pts2d.map(([u,v]) => [
        (u-uMin)/span * 0.9 + 0.05,
        (v-vMin)/span * 0.9 + 0.05,
      ]);

      // Triangle fan
      const start = cursor;
      for (let t = 1; t < face.length - 1; t++) {
        [0, t, t+1].forEach(vi => {
          pos.push(...verts[face[vi]]);
          nrm.push(fn.x, fn.y, fn.z);
          uvs.push(norm2d[vi][0], norm2d[vi][1]);
          cursor++;
        });
      }
      groups.push({ start, count: cursor - start, mi: fi });
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute("normal",   new THREE.BufferAttribute(new Float32Array(nrm), 3));
    geo.setAttribute("uv",       new THREE.BufferAttribute(new Float32Array(uvs), 2));
    groups.forEach(g => geo.addGroup(g.start, g.count, g.mi));
    geo.userData.faceNormals = faceNormals;
    return geo;
  }

  /**
   * Remap the UVs of a manual geometry so each face maps to its atlas cell.
   * Groups tell us which verts belong to which face.
   */
  _remapManualGeoUVs(geo, sides, cols, rows) {
    const uvArr   = geo.attributes.uv.array;
    const groups  = geo.groups;
    const cellW   = 1 / cols;
    const cellH   = 1 / rows;

    groups.forEach((g, fi) => {
      const col = fi % cols;
      const row = rows - 1 - Math.floor(fi / cols); // flip Y for WebGL
      const u0  = col * cellW;
      const v0  = row * cellH;

      const end = g.start + g.count;
      for (let vi = g.start; vi < end; vi++) {
        const origU = uvArr[vi * 2];
        const origV = uvArr[vi * 2 + 1];
        uvArr[vi * 2]     = u0 + origU * cellW;
        uvArr[vi * 2 + 1] = v0 + origV * cellH;
      }
    });
    geo.attributes.uv.needsUpdate = true;
  }

  // ---- Specific die geometries ----

  _buildManualFacedGeo_Tetra() {
    const r = 1.3;
    const verts = [
      [0, r, 0],
      [-r*0.9428, -r*0.3333,  r*0.3333],
      [ r*0.9428, -r*0.3333,  r*0.3333],
      [0,         -r*0.3333, -r*0.6667],
    ];
    const faces = [[0,1,2],[0,2,3],[0,3,1],[1,3,2]];
    return this._buildManualGeo(verts, faces);
  }

  _buildManualFacedGeo_Octa() {
    const r = 1.15;
    const verts = [
      [ 0, r, 0], [ r, 0, 0], [ 0, 0, r],
      [-r, 0, 0], [ 0, 0,-r], [ 0,-r, 0],
    ];
    // 8 triangular faces — outward normals
    const faces = [
      [0,1,2],[0,4,1],[0,3,4],[0,2,3],
      [5,2,1],[5,1,4],[5,4,3],[5,3,2],
    ];
    return this._buildManualGeo(verts, faces);
  }

  _buildManualFacedGeo_D10() {
    // Pentagonal trapezohedron
    const verts = [[0, 1.2, 0], [0, -1.2, 0]];
    for (let i = 0; i < 5; i++) {
      const a = (i/5) * Math.PI * 2;
      verts.push([Math.cos(a)*1.0, 0.3, Math.sin(a)*1.0]);
    }
    for (let i = 0; i < 5; i++) {
      const a = ((i+0.5)/5) * Math.PI * 2;
      verts.push([Math.cos(a)*1.0, -0.3, Math.sin(a)*1.0]);
    }
    const faces = [];
    for (let i = 0; i < 5; i++) {
      const u0=2+i, u1=2+(i+1)%5, l0=7+i, l1=7+(i+1)%5;
      faces.push([0, u0, l0, u1]);  // upper kite — consistent winding
      faces.push([1, l1, u1, l0]);  // lower kite
    }
    return this._buildManualGeo(verts, faces);
  }

  _buildManualFacedGeo_Dodec() {
    const phi = (1+Math.sqrt(5))/2;
    const a=0.75, b=0.75/phi, c=0.75*phi;
    const verts = [
      [ a, a, a],[ a, a,-a],[ a,-a, a],[ a,-a,-a],
      [-a, a, a],[-a, a,-a],[-a,-a, a],[-a,-a,-a],
      [0, b, c],[0, b,-c],[0,-b, c],[0,-b,-c],
      [b, c, 0],[b,-c, 0],[-b, c, 0],[-b,-c, 0],
      [c, 0, b],[c, 0,-b],[-c, 0, b],[-c, 0,-b],
    ];
    // 12 hand-specified pentagonal faces (correct winding, outward normals)
    const faces = [
      [0,16,2,10,8],   // face 1
      [0,8,4,14,12],   // face 2
      [0,12,1,17,16],  // face 3
      [2,16,17,3,13],  // face 4
      [4,8,10,6,18],   // face 5
      [1,12,14,5,9],   // face 6
      [3,17,1,9,11],   // face 7
      [3,11,7,15,13],  // face 8
      [5,14,4,18,19],  // face 9
      [6,10,2,13,15],  // face 10
      [7,11,9,5,19],   // face 11
      [6,15,7,19,18],  // face 12
    ];
    return this._buildManualGeo(verts, faces);
  }

  _buildManualFacedGeo_Icosa() {
    const phi = (1+Math.sqrt(5))/2;
    const verts = [
      [-1, phi, 0],[1, phi, 0],[-1,-phi, 0],[1,-phi, 0],
      [0,-1, phi],[0, 1, phi],[0,-1,-phi],[0, 1,-phi],
      [phi, 0,-1],[phi, 0, 1],[-phi, 0,-1],[-phi, 0, 1],
    ];
    const faces = [
      [0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],
      [1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
      [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],
      [4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1],
    ];
    return this._buildManualGeo(verts, faces);
  }

  // ---- Build a die mesh ----

  _buildDieMesh(dieCfg) {
    const { type, dieColor, dotColor, faceStyle } = dieCfg;
    const sides = parseInt(type);

    const atlas = this._buildAtlas(sides, dieColor, dotColor, faceStyle);

    let geo;
    switch (sides) {
      case 4:  geo = this._buildD4(atlas);  break;
      case 6:  geo = this._buildD6(atlas);  break;
      case 8:  geo = this._buildD8(atlas);  break;
      case 10: geo = this._buildD10(atlas); break;
      case 12: geo = this._buildD12(atlas); break;
      case 20: geo = this._buildD20(atlas); break;
      default: geo = this._buildD6(atlas);  break;
    }

    const mat = new THREE.MeshStandardMaterial({
      map: atlas.texture,
      roughness: 0.28,
      metalness: 0.06,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow    = true;
    mesh.receiveShadow = true;

    // Store face normals for result reading
    mesh.userData.faceNormals = geo.userData.faceNormals || [];
    mesh.userData.sides       = sides;

    return mesh;
  }

  // ---- Build cannon shape ----

  _makeCannonShape(sides) {
    // Build ConvexPolyhedron from the same vertex/face data used for visuals
    let verts, faces;
    switch (sides) {
      case 4: {
        const r=1.3;
        verts=[[0,r,0],[-r*0.9428,-r*0.3333,r*0.3333],[r*0.9428,-r*0.3333,r*0.3333],[0,-r*0.3333,-r*0.6667]];
        faces=[[0,1,2],[0,2,3],[0,3,1],[1,3,2]]; break;
      }
      case 6:
        return new CANNON.Box(new CANNON.Vec3(0.8, 0.8, 0.8));
      case 8: {
        const r=1.15;
        verts=[[0,r,0],[r,0,0],[0,0,r],[-r,0,0],[0,0,-r],[0,-r,0]];
        faces=[[0,1,2],[0,4,1],[0,3,4],[0,2,3],[5,2,1],[5,1,4],[5,4,3],[5,3,2]]; break;
      }
      case 10: {
        verts=[[0,1.2,0],[0,-1.2,0]];
        for(let i=0;i<5;i++){const a=(i/5)*Math.PI*2;verts.push([Math.cos(a),0.3,Math.sin(a)]);}
        for(let i=0;i<5;i++){const a=((i+0.5)/5)*Math.PI*2;verts.push([Math.cos(a),-0.3,Math.sin(a)]);}
        faces=[];
        for(let i=0;i<5;i++){const u0=2+i,u1=2+(i+1)%5,l0=7+i,l1=7+(i+1)%5;faces.push([0,u0,l0,u1]);faces.push([1,l1,u1,l0]);}
        break;
      }
      case 12: {
        const phi=(1+Math.sqrt(5))/2,a=0.75,b=0.75/phi,c=0.75*phi;
        verts=[[a,a,a],[a,a,-a],[a,-a,a],[a,-a,-a],[-a,a,a],[-a,a,-a],[-a,-a,a],[-a,-a,-a],[0,b,c],[0,b,-c],[0,-b,c],[0,-b,-c],[b,c,0],[b,-c,0],[-b,c,0],[-b,-c,0],[c,0,b],[c,0,-b],[-c,0,b],[-c,0,-b]];
        faces=[[0,16,2,10,8],[0,8,4,14,12],[0,12,1,17,16],[2,16,17,3,13],[4,8,10,6,18],[1,12,14,5,9],[3,17,1,9,11],[3,11,7,15,13],[5,14,4,18,19],[6,10,2,13,15],[7,11,9,5,19],[6,15,7,19,18]];
        break;
      }
      case 20: {
        const phi=(1+Math.sqrt(5))/2;
        verts=[[-1,phi,0],[1,phi,0],[-1,-phi,0],[1,-phi,0],[0,-1,phi],[0,1,phi],[0,-1,-phi],[0,1,-phi],[phi,0,-1],[phi,0,1],[-phi,0,-1],[-phi,0,1]];
        faces=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
        break;
      }
      default:
        return new CANNON.Box(new CANNON.Vec3(0.8, 0.8, 0.8));
    }
    const cv = verts.map(v => new CANNON.Vec3(...v));
    const cf = faces.map(f => [...f]);
    try { return new CANNON.ConvexPolyhedron(cv, cf); }
    catch(e) { return new CANNON.Sphere(1.1); }
  }

  // ---- Spawn dice ----

  _clearDice() {
    this.diceObjects.forEach(d => {
      this.scene.remove(d.mesh);
      this.world.remove(d.body);
      if (d.mesh.material) {
        if (Array.isArray(d.mesh.material)) d.mesh.material.forEach(m => m.dispose());
        else d.mesh.material.dispose();
      }
      d.mesh.geometry.dispose();
    });
    this.diceObjects = [];
  }

  roll(diceCfgs) {
    if (this.rolling) return;
    this._clearDice();
    this.rolling = true;
    clearTimeout(this.resolveTimer);

    const count = diceCfgs.length;
    const spread = Math.min(count * 1.2, 5);

    diceCfgs.forEach((dieCfg, i) => {
      const mesh = this._buildDieMesh(dieCfg);
      this.scene.add(mesh);

      const shape = this._makeCannonShape(parseInt(dieCfg.type));
      const body = new CANNON.Body({
        mass: 280,
        shape,
        linearDamping: 0.28,
        angularDamping: 0.28,
      });

      // Starting position — scattered above the table, converging toward center
      const angle = (i / count) * Math.PI * 2;
      const radius = spread * 0.5;
      body.position.set(
        Math.cos(angle) * radius + (Math.random() - 0.5) * 2,
        9 + Math.random() * 4,
        Math.sin(angle) * radius * 0.5 + (Math.random() - 0.5) * 1.5,
      );

      // Throw velocity — toward center with chaos
      const throwSpeed = 6 + Math.random() * 5;
      body.velocity.set(
        -body.position.x * 0.6 + (Math.random() - 0.5) * 4,
        -(2 + Math.random() * 2),
        -body.position.z * 0.6 + (Math.random() - 0.5) * 4,
      );

      // Random tumble
      body.angularVelocity.set(
        (Math.random() - 0.5) * 30,
        (Math.random() - 0.5) * 30,
        (Math.random() - 0.5) * 30,
      );

      body.material = new CANNON.Material({ restitution: 0.35, friction: 0.6 });

      this.world.addBody(body);
      this.diceObjects.push({ mesh, body, ...dieCfg });
    });

    // Wait for dice to settle, then read results
    const settleTime = 2600 + count * 150;
    this.resolveTimer = setTimeout(() => {
      const results = this._readResults();
      this.rolling = false;
      if (this.onRollComplete) this.onRollComplete(results);
    }, settleTime);
  }

  _readResults() {
    const up = new THREE.Vector3(0, 1, 0);
    return this.diceObjects.map((d, idx) => {
      const sides = parseInt(d.type);
      const faceNormals = d.mesh.userData.faceNormals || [];
      let value = 1;
      if (faceNormals.length > 0) {
        const meshQuat = new THREE.Quaternion(
          d.mesh.quaternion.x, d.mesh.quaternion.y,
          d.mesh.quaternion.z, d.mesh.quaternion.w
        );
        let bestDot = -Infinity;
        faceNormals.forEach((n, fi) => {
          const rotated = n.clone().applyQuaternion(meshQuat);
          const dot = rotated.dot(up);
          if (dot > bestDot) { bestDot = dot; value = fi + 1; }
        });
      } else {
        value = Math.floor(Math.random() * sides) + 1;
      }
      return { die: idx + 1, type: sides, value };
    });
  }

  updateConfig(cfg) {
    this.cfg = cfg;
    this.scene.background = new THREE.Color(cfg.sceneBg || "#0d0d0d");
    this.scene.fog.color = new THREE.Color(cfg.sceneBg || "#0d0d0d");
    // Update ambient light
    this.scene.children.forEach(c => {
      if (c instanceof THREE.AmbientLight) c.intensity = (cfg.ambientLight || 40) / 100;
    });
  }
}

// ============================================================
//  WIDGET MODE
// ============================================================

function initWidgetMode() {
  document.getElementById("widget-app").classList.remove("hidden");

  try {
    const raw = params.get("data");
    config = { ...DEFAULT_CONFIG, ...JSON.parse(atob(raw)) };
  } catch (e) {
    console.error("Vayl Dice: failed to parse config", e);
  }

  const canvas = document.getElementById("widget-canvas");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const engine = new DiceEngine(canvas, config);
  const overlay = document.getElementById("widget-result-overlay");

  engine.onRollComplete = (results) => {
    showResultOverlay(overlay, results, config);
    reportResult(results, config);
  };

  canvas.style.cursor = config.clickToRoll ? "pointer" : "default";
  canvas.addEventListener("click", () => {
    if (config.clickToRoll) triggerRoll(engine, config);
  });

  if (config.autoRoll) {
    setTimeout(() => triggerRoll(engine, config), (config.autoRollDelay || 2) * 1000);
  }

  if (config.pollFlask) {
    pollFlask(engine, config);
  }

  window.addEventListener("resize", () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });
}

function triggerRoll(engine, cfg) {
  if (engine.rolling) return;
  engine.roll(cfg.dice || DEFAULT_CONFIG.dice);
}

function showResultOverlay(overlayEl, results, cfg) {
  if (!cfg.showOverlay) return;
  const total = results.reduce((s, r) => s + r.value, 0);
  const breakdown = results.map(r => `d${r.type}:${r.value}`).join("  ");

  overlayEl.className = "result-overlay";
  const pos = cfg.resultPosition || "center";
  if (pos === "top") overlayEl.classList.add("pos-top");
  if (pos === "bottom") overlayEl.classList.add("pos-bottom");
  overlayEl.classList.remove("hidden");

  overlayEl.innerHTML = `
    <div class="result-label" style="font-family:'${cfg.resultFont || "Outfit"}',sans-serif; color:${cfg.resultColor || "#fff"}">Result</div>
    <div class="result-total" style="font-size:${cfg.resultSize || 64}px; font-family:'${cfg.resultFont || "Outfit"}',sans-serif; color:${cfg.resultColor || "#fff"}">${total}</div>
    ${results.length > 1 ? `<div class="result-breakdown" style="font-family:'${cfg.resultFont || "Outfit"}',sans-serif; color:${cfg.resultColor || "#fff"}">${breakdown}</div>` : ""}
  `;

  clearTimeout(overlayEl._timer);
  overlayEl._timer = setTimeout(() => {
    overlayEl.classList.add("fading");
    setTimeout(() => {
      overlayEl.classList.add("hidden");
      overlayEl.classList.remove("fading");
    }, 600);
  }, cfg.overlayDuration || 3000);
}

function reportResult(results, cfg) {
  const total = results.reduce((s, r) => s + r.value, 0);
  const payload = {
    total,
    dice: results,
    breakdown: results.map(r => `d${r.type}:${r.value}`).join(", "),
  };
  fetch(`http://127.0.0.1:5000/diceresult?name=${encodeURIComponent(cfg.widgetName || "dice")}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(err => console.warn("Vayl Dice: failed to report result:", err));
}

async function pollFlask(engine, cfg) {
  try {
    const r = await fetch(`http://127.0.0.1:5000/polldice?name=${encodeURIComponent(cfg.widgetName || "dice")}`);
    const data = await r.json();
    if (data.cmd === "roll") {
      triggerRoll(engine, cfg);
    }
    if (data.cmd === "setdice" && Array.isArray(data.dice)) {
      cfg.dice = data.dice;
    }
  } catch (err) {
    // Flask not running — silent fail
  }
  setTimeout(() => pollFlask(engine, cfg), 200);
}

// ============================================================
//  CONFIG MODE
// ============================================================

function initConfigMode() {
  document.getElementById("config-app").classList.remove("hidden");
  syncUIFromConfig();
  bindAllControls();

  const canvas = document.getElementById("preview-canvas");
  const overlay = document.getElementById("preview-result-overlay");

  const engine = new DiceEngine(canvas, config);
  engine.onRollComplete = (results) => showResultOverlay(overlay, results, config);

  // Click preview screen to roll
  canvas.addEventListener("click", () => {
    if (config.clickToRoll) triggerRoll(engine, config);
  });

  document.getElementById("btn-preview-roll").addEventListener("click", (e) => {
    e.stopPropagation();
    triggerRoll(engine, config);
  });

  // Store engine reference so config changes can update it
  window._previewEngine = engine;

  // Initial roll after short delay
  setTimeout(() => triggerRoll(engine, config), 800);
}

// ============================================================
//  UI SYNC
// ============================================================

function syncUIFromConfig() {
  const c = config;
  setToggle("cfg-autoroll-toggle", "cfg-autoroll-label", c.autoRoll);
  setRange("cfg-autoroll-delay", c.autoRollDelay, "cfg-autoroll-delay-val", v => v);
  setToggle("cfg-clickroll-toggle", "cfg-clickroll-label", c.clickToRoll);
  setToggle("cfg-poll-toggle", "cfg-poll-label", c.pollFlask);
  setToggle("cfg-overlay-toggle", "cfg-overlay-label", c.showOverlay);
  setRange("cfg-overlay-duration", c.overlayDuration, "cfg-overlay-duration-val", v => v);
  setVal("cfg-widget-name", c.widgetName || "dice");
  setColor("cfg-scene-bg", c.sceneBg);
  setColor("cfg-table-color", c.tableColor);
  setToggle("cfg-table-toggle", "cfg-table-label", c.showTable);
  setRange("cfg-ambient", c.ambientLight, "cfg-ambient-val", v => v + "%");
  setActiveSegBtn("shadow-quality-seg", c.shadowQuality);
  setVal("cfg-result-font", c.resultFont);
  setColor("cfg-result-color", c.resultColor);
  setRange("cfg-result-size", c.resultSize, "cfg-result-size-val", v => v);
  setActiveSegBtn("result-pos-seg", c.resultPosition);
  renderDiceList();
}

function renderDiceList() {
  const list = document.getElementById("dice-list");
  list.innerHTML = "";
  (config.dice || []).forEach((die, i) => {
    list.appendChild(buildDieCard(die, i));
  });
}

function buildDieCard(die, idx) {
  const card = document.createElement("div");
  card.className = "die-card";
  card.dataset.idx = idx;

  const dieSides = [4, 6, 8, 10, 12, 20];
  const typeButtons = dieSides.map(s =>
    `<button class="die-type-btn${parseInt(die.type) === s ? " active" : ""}" data-sides="${s}">d${s}</button>`
  ).join("");

  card.innerHTML = `
    <div class="die-card-header">
      <span class="die-badge">Die ${idx + 1}</span>
      <span class="die-label">d${die.type}</span>
      <button class="btn-remove-die" title="Remove">×</button>
    </div>
    <div class="die-card-row die-type-seg">${typeButtons}</div>
    <div class="die-colors">
      <label>Die</label>
      <input type="color" class="cfg-color die-color" value="${die.dieColor || "#c0392b"}">
      <label style="margin-left:8px">Face</label>
      <input type="color" class="cfg-color dot-color" value="${die.dotColor || "#ffffff"}">
    </div>
    <div class="die-face-seg">
      <button class="die-face-btn${die.faceStyle === "dots" ? " active" : ""}" data-face="dots">Dots</button>
      <button class="die-face-btn${die.faceStyle === "numbers" ? " active" : ""}" data-face="numbers">Numbers</button>
    </div>
  `;

  // Type buttons
  card.querySelectorAll(".die-type-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const sides = parseInt(btn.dataset.sides);
      config.dice[idx].type = sides;
      config.dice[idx].faceStyle = sides === 6 ? config.dice[idx].faceStyle : "numbers";
      renderDiceList();
      onConfigChange();
    });
  });

  // Colors
  card.querySelector(".die-color").addEventListener("input", e => {
    config.dice[idx].dieColor = e.target.value;
    onConfigChange();
  });
  card.querySelector(".dot-color").addEventListener("input", e => {
    config.dice[idx].dotColor = e.target.value;
    onConfigChange();
  });

  // Face style
  card.querySelectorAll(".die-face-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      card.querySelectorAll(".die-face-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      config.dice[idx].faceStyle = btn.dataset.face;
      onConfigChange();
    });
  });

  // Remove
  card.querySelector(".btn-remove-die").addEventListener("click", () => {
    config.dice.splice(idx, 1);
    renderDiceList();
    onConfigChange();
  });

  return card;
}

// ============================================================
//  CONTROL BINDINGS
// ============================================================

function bindAllControls() {
  bindToggle("cfg-autoroll-toggle", "cfg-autoroll-label", "autoRoll");
  bindSlider("cfg-autoroll-delay", "cfg-autoroll-delay-val", "autoRollDelay", v => parseFloat(v));
  bindToggle("cfg-clickroll-toggle", "cfg-clickroll-label", "clickToRoll");
  bindToggle("cfg-poll-toggle", "cfg-poll-label", "pollFlask");
  bindToggle("cfg-overlay-toggle", "cfg-overlay-label", "showOverlay");
  bindSlider("cfg-overlay-duration", "cfg-overlay-duration-val", "overlayDuration", v => parseInt(v));
  bindText("cfg-widget-name", "widgetName");
  bindColor("cfg-scene-bg", "sceneBg");
  bindColor("cfg-table-color", "tableColor");
  bindToggle("cfg-table-toggle", "cfg-table-label", "showTable");
  bindSlider("cfg-ambient", "cfg-ambient-val", "ambientLight", v => parseInt(v), v => v + "%");

  // Shadow quality
  document.querySelectorAll("#shadow-quality-seg .seg-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#shadow-quality-seg .seg-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      config.shadowQuality = btn.dataset.val;
      onConfigChange();
    });
  });

  // Result overlay
  document.getElementById("cfg-result-font").addEventListener("change", e => {
    config.resultFont = e.target.value;
    onConfigChange();
  });
  bindColor("cfg-result-color", "resultColor");
  bindSlider("cfg-result-size", "cfg-result-size-val", "resultSize", v => parseInt(v));

  document.querySelectorAll("#result-pos-seg .seg-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#result-pos-seg .seg-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      config.resultPosition = btn.dataset.val;
      onConfigChange();
    });
  });

  // Add die
  document.getElementById("btn-add-die").addEventListener("click", () => {
    if (config.dice.length >= 8) { showToast("Max 8 dice"); return; }
    config.dice.push({ type: 6, dieColor: randomDieColor(), dotColor: "#ffffff", faceStyle: "dots" });
    renderDiceList();
    onConfigChange();
  });

  // Copy URL
  document.getElementById("btn-copy-url").addEventListener("click", () => {
    navigator.clipboard.writeText(buildWidgetURL()).then(() => showToast("Widget URL copied!"));
  });

  // Import
  document.getElementById("btn-import").addEventListener("click", importFromURL);
  document.getElementById("import-url").addEventListener("keydown", e => {
    if (e.key === "Enter") importFromURL();
  });
}

function onConfigChange() {
  if (window._previewEngine) {
    window._previewEngine.updateConfig(config);
  }
}

// ---- Helpers ----

function randomDieColor() {
  const colors = ["#c0392b", "#2c3e8c", "#1a7a4a", "#7d3c98", "#e67e22", "#16a085", "#884ea0"];
  return colors[Math.floor(Math.random() * colors.length)];
}

function buildWidgetURL() {
  const encoded = btoa(JSON.stringify(config));
  const base = window.location.origin + window.location.pathname;
  return `${base}?data=${encoded}`;
}

function importFromURL() {
  const input = document.getElementById("import-url").value.trim();
  try {
    const u = new URL(input);
    const raw = u.searchParams.get("data");
    if (!raw) throw new Error("no data param");
    config = { ...DEFAULT_CONFIG, ...JSON.parse(atob(raw)) };
    syncUIFromConfig();
    onConfigChange();
    showToast("Config loaded!");
  } catch (e) {
    showToast("Invalid URL");
  }
}

// ---- UI setters ----

function setVal(id, val) { const el = document.getElementById(id); if (el) el.value = val; }
function setColor(id, val) { setVal(id, val); }
function setRange(id, val, labelId, fmt) {
  const el = document.getElementById(id); if (el) el.value = val;
  if (labelId) { const l = document.getElementById(labelId); if (l) l.textContent = fmt(val); }
}
function setToggle(btnId, labelId, on) {
  const btn = document.getElementById(btnId); if (!btn) return;
  btn.dataset.on = on ? "true" : "false";
  btn.classList.toggle("active", on);
  if (labelId) { const l = document.getElementById(labelId); if (l) l.textContent = on ? "On" : "Off"; }
}
function setActiveSegBtn(groupId, value) {
  document.querySelectorAll(`#${groupId} .seg-btn`).forEach(btn => {
    btn.classList.toggle("active", btn.dataset.val === value);
  });
}

// ---- Binders ----

function bindText(id, key) {
  const el = document.getElementById(id);
  if (el) el.addEventListener("input", e => { config[key] = e.target.value; onConfigChange(); });
}
function bindSlider(id, labelId, key, parse, fmt) {
  const el = document.getElementById(id);
  const label = labelId ? document.getElementById(labelId) : null;
  const format = fmt || (v => v);
  if (el) el.addEventListener("input", e => {
    const v = parse(e.target.value);
    config[key] = v;
    if (label) label.textContent = format(v);
    onConfigChange();
  });
}
function bindColor(id, key) {
  const el = document.getElementById(id);
  if (el) el.addEventListener("input", e => { config[key] = e.target.value; onConfigChange(); });
}
function bindToggle(btnId, labelId, key) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.addEventListener("click", function () {
    const on = this.dataset.on !== "true";
    this.dataset.on = on ? "true" : "false";
    this.classList.toggle("active", on);
    if (labelId) { const l = document.getElementById(labelId); if (l) l.textContent = on ? "On" : "Off"; }
    config[key] = on;
    onConfigChange();
  });
}

// ---- Toast ----

function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
}
