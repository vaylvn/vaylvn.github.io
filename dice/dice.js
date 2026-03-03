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
  //  TEXTURE HELPERS
  // ============================================================

  _makeFaceTexture(sides, faceNum, dieColor, dotColor, faceStyle) {
    const size = 256;
    const cvs = document.createElement("canvas");
    cvs.width = size; cvs.height = size;
    const ctx = cvs.getContext("2d");

    // Background fill — full square so UV seams don't show gaps
    ctx.fillStyle = dieColor;
    ctx.fillRect(0, 0, size, size);

    // Inner rounded rect for the "face plate" look
    const pad = 10, r = 22;
    ctx.fillStyle = this._adjustColor(dieColor, 15);
    this._roundRect(ctx, pad, pad, size - pad*2, size - pad*2, r);
    ctx.fill();

    // Subtle edge highlight
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 3;
    this._roundRect(ctx, pad+2, pad+2, size - pad*2 - 4, size - pad*2 - 4, r-1);
    ctx.stroke();

    const useStyle = (sides !== 6 && faceStyle === "dots") ? "numbers" : faceStyle;

    if (useStyle === "numbers") {
      const fontSize = sides > 9 ? 80 : 92;
      ctx.font = `bold ${fontSize}px 'Outfit', Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 10;
      ctx.fillStyle = dotColor;
      ctx.fillText(String(faceNum), size / 2, size / 2 + 4);
      // Underline 6 and 9 to disambiguate
      if (faceNum === 6 || faceNum === 9) {
        const tw = ctx.measureText(String(faceNum)).width;
        ctx.shadowBlur = 0;
        ctx.strokeStyle = dotColor;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(size/2 - tw/2, size/2 + fontSize/2 - 2);
        ctx.lineTo(size/2 + tw/2, size/2 + fontSize/2 - 2);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    } else {
      // Dots — d6 only
      this._drawD6Dots(ctx, faceNum, dotColor, size);
    }

    return new THREE.CanvasTexture(cvs);
  }

  _adjustColor(hex, amount) {
    // Lighten a hex color by `amount` (0-255)
    let r = parseInt(hex.slice(1,3),16);
    let g = parseInt(hex.slice(3,5),16);
    let b = parseInt(hex.slice(5,7),16);
    r = Math.min(255, r + amount);
    g = Math.min(255, g + amount);
    b = Math.min(255, b + amount);
    return `rgb(${r},${g},${b})`;
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  _drawD6Dots(ctx, n, color, size) {
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
      ctx.arc(x, y, dotR, 0, Math.PI * 2);
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 5;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.shadowBlur = 0;
    });
  }

  // ============================================================
  //  GEOMETRY — proper per-face UV-mapped BufferGeometry
  //  Each face gets its own quad of UV space so we can assign
  //  individual material groups, one material per face.
  // ============================================================

  /**
   * Build a BufferGeometry from a list of face-vertex indices.
   * Each face becomes a triangle fan (or pair of tris for quads).
   * UV for each face is mapped to a unit square so per-face
   * materials display correctly.
   * Returns { geometry, faceNormals }
   */
  _buildFacedGeometry(verts, faces) {
    // verts: array of [x,y,z]
    // faces: array of arrays of vertex indices (each face is a polygon)

    const positions = [];
    const normals   = [];
    const uvs       = [];
    const groups    = []; // { start, count, materialIndex }
    const faceNormals = [];

    let idx = 0;
    faces.forEach((face, fi) => {
      // Compute face normal from first 3 vertices
      const a = new THREE.Vector3(...verts[face[0]]);
      const b = new THREE.Vector3(...verts[face[1]]);
      const c = new THREE.Vector3(...verts[face[2]]);
      const n = new THREE.Vector3().crossVectors(
        new THREE.Vector3().subVectors(b, a),
        new THREE.Vector3().subVectors(c, a)
      ).normalize();
      faceNormals.push(n.clone());

      // Compute centroid for UV mapping
      const centroid = new THREE.Vector3();
      face.forEach(vi => centroid.add(new THREE.Vector3(...verts[vi])));
      centroid.divideScalar(face.length);

      // Build a local 2D basis on the face plane so UVs form a sensible square
      const uAxis = new THREE.Vector3().subVectors(new THREE.Vector3(...verts[face[0]]), centroid).normalize();
      const vAxis = new THREE.Vector3().crossVectors(n, uAxis).normalize();

      // Project each vertex onto face plane → 2D coords
      const pts2d = face.map(vi => {
        const p = new THREE.Vector3(...verts[vi]).sub(centroid);
        return [p.dot(uAxis), p.dot(vAxis)];
      });

      // Normalise 2D coords to [0,1]
      let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
      pts2d.forEach(([u,v]) => { minU=Math.min(minU,u); maxU=Math.max(maxU,u); minV=Math.min(minV,v); maxV=Math.max(maxV,v); });
      const rangeU = maxU - minU || 1;
      const rangeV = maxV - minV || 1;
      const range  = Math.max(rangeU, rangeV);
      const normPts = pts2d.map(([u,v]) => [
        (u - minU) / range * 0.9 + 0.05,
        (v - minV) / range * 0.9 + 0.05,
      ]);

      // Triangle fan from vertex 0
      const startIdx = idx;
      for (let t = 1; t < face.length - 1; t++) {
        // Triangle: 0, t, t+1
        [[0,0], [t,t], [t+1,t+1]].forEach(([fi_]) => {
          // we just use the vertex indices directly
        });
        const triVerts = [0, t, t+1];
        triVerts.forEach(vi => {
          const [x,y,z] = verts[face[vi]];
          positions.push(x, y, z);
          normals.push(n.x, n.y, n.z);
          uvs.push(normPts[vi][0], normPts[vi][1]);
          idx++;
        });
      }
      groups.push({ start: startIdx, count: idx - startIdx, materialIndex: fi });
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute("normal",   new THREE.BufferAttribute(new Float32Array(normals),   3));
    geo.setAttribute("uv",       new THREE.BufferAttribute(new Float32Array(uvs),       2));
    groups.forEach(g => geo.addGroup(g.start, g.count, g.materialIndex));

    return { geometry: geo, faceNormals };
  }

  // ---- Vertex/face definitions for each die type ----

  _getDieData(sides) {
    switch (sides) {
      case 4:  return this._d4Data();
      case 6:  return this._d6Data();
      case 8:  return this._d8Data();
      case 10: return this._d10Data();
      case 12: return this._d12Data();
      case 20: return this._d20Data();
      default: return this._d6Data();
    }
  }

  _d4Data() {
    const r = 1.3;
    const verts = [
      [ 0,        r,        0       ],
      [-r*0.943,  -r*0.333,  r*0.333],
      [ r*0.943,  -r*0.333,  r*0.333],
      [ 0,        -r*0.333, -r*0.667],
    ];
    const faces = [[0,1,2],[0,2,3],[0,3,1],[1,3,2]];
    return { verts, faces };
  }

  _d6Data() {
    const h = 0.8;
    const verts = [
      [-h,-h,-h],[h,-h,-h],[h,h,-h],[-h,h,-h], // 0-3 front
      [-h,-h, h],[h,-h, h],[h,h, h],[-h,h, h], // 4-7 back
    ];
    const faces = [
      [0,3,2,1], // front  (-z) → 1
      [4,5,6,7], // back   (+z) → 6
      [3,7,6,2], // top    (+y) → 2
      [0,1,5,4], // bottom (-y) → 5
      [1,2,6,5], // right  (+x) → 3
      [0,4,7,3], // left   (-x) → 4
    ];
    return { verts, faces };
  }

  _d8Data() {
    const r = 1.15;
    const verts = [
      [ 0, r, 0],[r, 0, 0],[ 0, 0, r],
      [-r, 0, 0],[ 0, 0,-r],[ 0,-r, 0],
    ];
    const faces = [
      [0,2,1],[0,1,4],[0,4,3],[0,3,2],
      [5,1,2],[5,4,1],[5,3,4],[5,2,3],
    ];
    return { verts, faces };
  }

  _d10Data() {
    // Pentagonal trapezohedron — 10 kite-shaped faces
    const verts = [];
    const n = 5;
    const top = [0, 1.1, 0];
    const bot = [0, -1.1, 0];
    verts.push(top); // 0
    verts.push(bot); // 1
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      verts.push([Math.cos(a)*1.0, 0.25, Math.sin(a)*1.0]); // upper ring 2..6
    }
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.5) / n) * Math.PI * 2;
      verts.push([Math.cos(a)*1.0, -0.25, Math.sin(a)*1.0]); // lower ring 7..11
    }
    const faces = [];
    for (let i = 0; i < n; i++) {
      const u0 = 2 + i, u1 = 2 + (i+1)%n;
      const l0 = 7 + i, l1 = 7 + (i+1)%n;
      faces.push([0, u1, l0, u0]); // upper kite
      faces.push([1, l0, u1, l1]); // lower kite (reversed winding for correct normal)
    }
    return { verts, faces };
  }

  _d12Data() {
    // Regular dodecahedron — 12 pentagonal faces
    const phi = (1 + Math.sqrt(5)) / 2;
    const s = 0.75;
    const a = s, b = s/phi, c = s*phi;
    const rawVerts = [
      [ a, a, a],[ a, a,-a],[ a,-a, a],[ a,-a,-a],
      [-a, a, a],[-a, a,-a],[-a,-a, a],[-a,-a,-a],
      [0, b, c],[0, b,-c],[0,-b, c],[0,-b,-c],
      [b, c, 0],[b,-c, 0],[-b, c, 0],[-b,-c, 0],
      [c, 0, b],[c, 0,-b],[-c, 0, b],[-c, 0,-b],
    ];
    const faces = [
      [0,8,4,14,12],[0,12,1,9,16],[0,16,2,10,8],
      [2,16,17,3,13],[3,17,1,12,14],[1,17,16,0,12],
      [5,14,4,8,18],[5,18,6,15,19],[5,19,7,11,9],
      [6,10,2,13,15],[7,15,13,3,11],[9,11,3,13,2], // last face closes up
    ];
    // Recompute proper 12 faces for dodecahedron
    return { verts: rawVerts, faces: this._dodecFaces(rawVerts) };
  }

  _dodecFaces(verts) {
    // Build correct pentagonal faces using angular proximity
    const n = verts.length; // 20
    const used = new Set();
    const faces = [];
    const v3 = verts.map(v => new THREE.Vector3(...v));
    const center = new THREE.Vector3();

    // Pre-defined face normals for a regular dodecahedron
    const phi = (1+Math.sqrt(5))/2;
    const faceNormDefs = [
      [0,1,phi],[0,-1,phi],[0,1,-phi],[0,-1,-phi],
      [1,phi,0],[-1,phi,0],[1,-phi,0],[-1,-phi,0],
      [phi,0,1],[phi,0,-1],[-phi,0,1],[-phi,0,-1],
    ].map(n => new THREE.Vector3(...n).normalize());

    return faceNormDefs.map(fn => {
      // Find 5 vertices closest to this face normal direction
      const scores = v3.map((v,i) => ({ i, d: v.clone().normalize().dot(fn) }));
      scores.sort((a,b)=>b.d-a.d);
      const top5 = scores.slice(0,5).map(s=>s.i);
      // Sort them angularly around the face normal
      const centroid = new THREE.Vector3();
      top5.forEach(i => centroid.add(v3[i]));
      centroid.divideScalar(5);
      const uAxis = v3[top5[0]].clone().sub(centroid).normalize();
      const vAxis = fn.clone().cross(uAxis).normalize();
      top5.sort((a,b)=>{
        const pa = Math.atan2(v3[a].clone().sub(centroid).dot(vAxis), v3[a].clone().sub(centroid).dot(uAxis));
        const pb = Math.atan2(v3[b].clone().sub(centroid).dot(vAxis), v3[b].clone().sub(centroid).dot(uAxis));
        return pa - pb;
      });
      return top5;
    });
  }

  _d20Data() {
    // Regular icosahedron — 20 triangular faces
    const phi = (1 + Math.sqrt(5)) / 2;
    const s = 1.0;
    const verts = [
      [-s, phi*s, 0],[s, phi*s, 0],[-s,-phi*s, 0],[s,-phi*s, 0],
      [0,-s, phi*s],[0, s, phi*s],[0,-s,-phi*s],[0, s,-phi*s],
      [phi*s, 0,-s],[phi*s, 0, s],[-phi*s, 0,-s],[-phi*s, 0, s],
    ];
    const faces = [
      [0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],
      [1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
      [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],
      [4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1],
    ];
    return { verts, faces };
  }

  // ---- ConvexPolyhedron physics from vertex/face data ----

  _makeConvexPolyhedron(verts, faces) {
    const cannonVerts = verts.map(v => new CANNON.Vec3(...v));
    const cannonFaces = faces.map(f => [...f]);
    try {
      return new CANNON.ConvexPolyhedron(cannonVerts, cannonFaces);
    } catch(e) {
      // Fallback to sphere if ConvexPolyhedron fails (e.g. bad winding)
      console.warn("ConvexPolyhedron failed, falling back to sphere", e);
      return new CANNON.Sphere(1.1);
    }
  }

  // ---- Build a single die mesh with per-face materials ----

  _buildDieMesh(dieCfg) {
    const { type, dieColor, dotColor, faceStyle } = dieCfg;
    const sides = parseInt(type);

    const { verts, faces } = this._getDieData(sides);
    const { geometry, faceNormals } = this._buildFacedGeometry(verts, faces);

    // One material per face, each with its own number/dot texture
    const materials = faces.map((_, fi) => {
      const faceNum = fi + 1; // faces are 1-indexed
      const tex = this._makeFaceTexture(sides, faceNum, dieColor, dotColor, faceStyle);
      return new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.28,
        metalness: 0.06,
      });
    });

    const mesh = new THREE.Mesh(geometry, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Store face normals for result reading
    mesh.userData.faceNormals = faceNormals;
    mesh.userData.sides = sides;

    return mesh;
  }

  // ---- Build cannon shape from same vertex data ----

  _makeCannonShape(sides) {
    const { verts, faces } = this._getDieData(sides);
    if (sides === 6) {
      return new CANNON.Box(new CANNON.Vec3(0.8, 0.8, 0.8));
    }
    return this._makeConvexPolyhedron(verts, faces);
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
