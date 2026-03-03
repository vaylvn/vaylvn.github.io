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

    // ── 3-point lighting for matte dice with subtle gloss ──

    // Key light — warm, from upper-front-left, casts shadows
    const keyLight = new THREE.DirectionalLight(0xfff4e0, 1.1);
    keyLight.position.set(-6, 16, 10);
    keyLight.castShadow = this.cfg.shadowQuality !== "off";
    keyLight.shadow.mapSize.width  = this.cfg.shadowQuality === "high" ? 2048 : 1024;
    keyLight.shadow.mapSize.height = keyLight.shadow.mapSize.width;
    keyLight.shadow.camera.near   = 0.5;
    keyLight.shadow.camera.far    = 60;
    keyLight.shadow.camera.left   = -14;
    keyLight.shadow.camera.right  = 14;
    keyLight.shadow.camera.top    = 14;
    keyLight.shadow.camera.bottom = -14;
    keyLight.shadow.bias          = -0.0005;
    this.scene.add(keyLight);

    // Fill light — cool, from right, no shadow, softens dark faces
    const fillLight = new THREE.DirectionalLight(0xd0e8ff, 0.45);
    fillLight.position.set(10, 6, -4);
    this.scene.add(fillLight);

    // Rim light — from behind/below, gives edge glow on the die
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.25);
    rimLight.position.set(0, -8, -12);
    this.scene.add(rimLight);

    // Ambient — low, so faces never fully black
    const amb = new THREE.AmbientLight(0xffffff, 0.38);
    this.scene.add(amb);
    this._ambLight = amb;

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
    this.world.broadphase.useBoundingBoxes = true;
    this.world.solver.iterations = 30;
    this.world.solver.tolerance  = 0.001;
    // Shared contact material so dice bounce off each other
    this._diceMat  = new CANNON.Material('die');
    this._floorMat = new CANNON.Material('floor');
    const dieFloor = new CANNON.ContactMaterial(this._diceMat, this._floorMat,
      { friction: 0.5, restitution: 0.3 });
    const dieDie   = new CANNON.ContactMaterial(this._diceMat, this._diceMat,
      { friction: 0.2, restitution: 0.25 });
    this.world.addContactMaterial(dieFloor);
    this.world.addContactMaterial(dieDie);

    // Physics floor
    const floorBody = new CANNON.Body({ mass: 0, material: this._floorMat });
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
  //  D6 FACE TEXTURE
  //  High-res 512px canvas per face. Bakes in subtle gradient shading
  //  so MeshStandardMaterial can add the gloss on top.
  // ============================================================

  _makeFaceTex(faceNum, dieColor, dotColor, faceStyle) {
    const S   = 512;
    const cvs = document.createElement('canvas');
    cvs.width = cvs.height = S;
    const ctx = cvs.getContext('2d');

    // ── Base: solid colour fill ──
    ctx.fillStyle = dieColor;
    ctx.fillRect(0, 0, S, S);

    // ── Subtle radial vignette baked in — gives the face a slightly
    //    darker edge so the MeshStandardMaterial gloss reads better ──
    const vign = ctx.createRadialGradient(S/2,S/2, S*0.2, S/2,S/2, S*0.72);
    vign.addColorStop(0,   'rgba(255,255,255,0.04)');
    vign.addColorStop(1,   'rgba(0,0,0,0.18)');
    ctx.fillStyle = vign;
    ctx.fillRect(0, 0, S, S);

    // ── Face border — tight inset rounded rect ──
    const pad = Math.round(S * 0.055);
    const r   = Math.round(S * 0.13);

    // Outer dark shadow line
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth   = 5;
    this._roundRect(ctx, pad, pad, S-pad*2, S-pad*2, r);
    ctx.stroke();

    // Inner highlight line
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth   = 2.5;
    this._roundRect(ctx, pad+3, pad+3, S-pad*2-6, S-pad*2-6, r-2);
    ctx.stroke();

    // ── Content ──
    if (faceStyle === 'dots') {
      this._drawD6Dots(ctx, faceNum, dotColor, S);
    } else {
      this._drawD6Number(ctx, faceNum, dotColor, S);
    }

    const tex = new THREE.CanvasTexture(cvs);
    tex.anisotropy = 4;
    return tex;
  }

  _drawD6Number(ctx, n, color, S) {
    const fontSize = Math.round(S * 0.52);
    ctx.font         = `900 ${fontSize}px "Outfit", "Arial Black", sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    // Subtle drop shadow
    ctx.shadowColor  = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur   = 14;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = color;
    ctx.fillText(String(n), S/2, S/2 + 4);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur  = 0;
    ctx.shadowOffsetY = 0;
    // Underline 6 and 9
    if (n === 6 || n === 9) {
      const tw = ctx.measureText(String(n)).width;
      ctx.strokeStyle = color;
      ctx.lineWidth   = Math.round(S * 0.016);
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.moveTo(S/2 - tw*0.44, S/2 + fontSize*0.52);
      ctx.lineTo(S/2 + tw*0.44, S/2 + fontSize*0.52);
      ctx.stroke();
    }
  }

  _drawD6Dots(ctx, n, color, S) {
    const dotR = S * 0.088;
    const pad  = S * 0.255;
    const mid  = S / 2;
    const positions = {
      1: [[mid,mid]],
      2: [[pad,pad],[S-pad,S-pad]],
      3: [[pad,pad],[mid,mid],[S-pad,S-pad]],
      4: [[pad,pad],[S-pad,pad],[pad,S-pad],[S-pad,S-pad]],
      5: [[pad,pad],[S-pad,pad],[mid,mid],[pad,S-pad],[S-pad,S-pad]],
      6: [[pad,pad],[S-pad,pad],[pad,mid],[S-pad,mid],[pad,S-pad],[S-pad,S-pad]],
    };
    (positions[n]||[]).forEach(([x,y]) => {
      // Dot shadow
      ctx.beginPath();
      ctx.arc(x, y+dotR*0.18, dotR, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fill();
      // Dot body
      ctx.beginPath();
      ctx.arc(x, y, dotR, 0, Math.PI*2);
      ctx.fillStyle = color;
      ctx.fill();
      // Dot highlight
      ctx.beginPath();
      ctx.arc(x - dotR*0.28, y - dotR*0.28, dotR*0.38, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,255,255,0.30)';
      ctx.fill();
    });
  }

  _adjustColor(hex, amount) {
    let r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
    return `rgb(${Math.min(255,r+amount)},${Math.min(255,g+amount)},${Math.min(255,b+amount)})`;
  }

  _roundRect(ctx,x,y,w,h,r) {
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r);
    ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
    ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
    ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r);
    ctx.closePath();
  }

  // ============================================================
  //  D6 GEOMETRY
  //  BoxGeometry with slightly rounded look via a small bevel scale.
  //  Face order matches pip convention: 1 opp 6, 2 opp 5, 3 opp 4.
  //  BoxGeometry face order: +x, -x, +y, -y, +z, -z
  //  We map: face index → pip value
  // ============================================================

  // BoxGeometry face order in Three.js r128:
  //   group 0 = +x, 1 = -x, 2 = +y, 3 = -y, 4 = +z, 5 = -z
  // Standard die convention (opposite faces sum to 7):
  //   +y=1, -y=6, +z=2, -z=5, +x=3, -x=4
  static get D6_FACE_VALUES() {
    return [3, 4, 1, 6, 2, 5]; // [+x, -x, +y, -y, +z, -z]
  }

  _buildD6Mesh(dieColor, dotColor, faceStyle) {
    const size = 1.64;
    const geo  = new THREE.BoxGeometry(size, size, size);

    // BoxGeometry already has correct per-face UV groups (6 groups × 2 tris each)
    // and UVs are [0,1]×[0,1] per face — perfect for our per-face material array.
    const faceValues = DiceEngine.D6_FACE_VALUES;
    const materials  = faceValues.map(faceNum =>
      new THREE.MeshStandardMaterial({
        map:       this._makeFaceTex(faceNum, dieColor, dotColor, faceStyle),
        roughness: 0.72,   // matte base
        metalness: 0.04,   // just enough for subtle specular
        envMapIntensity: 0.6,
      })
    );

    // Store face normals matching BoxGeometry group order
    const faceNormals = [
      new THREE.Vector3( 1, 0, 0),  // +x → value 3
      new THREE.Vector3(-1, 0, 0),  // -x → value 4
      new THREE.Vector3( 0, 1, 0),  // +y → value 1
      new THREE.Vector3( 0,-1, 0),  // -y → value 6
      new THREE.Vector3( 0, 0, 1),  // +z → value 2
      new THREE.Vector3( 0, 0,-1),  // -z → value 5
    ];

    const mesh = new THREE.Mesh(geo, materials);
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    mesh.userData.faceNormals = faceNormals;
    mesh.userData.faceValues  = faceValues;
    mesh.userData.sides       = 6;
    return mesh;
  }

  _makeCannonShape() {
    // Use CANNON.Box — exact match to BoxGeometry, perfect collisions
    return new CANNON.Box(new CANNON.Vec3(0.82, 0.82, 0.82));
  }

  _buildDieMesh(dieCfg) {
    const { dieColor, dotColor, faceStyle } = dieCfg;
    return this._buildD6Mesh(dieColor, dotColor, faceStyle);
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

      const shape = this._makeCannonShape();
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

      body.material = this._diceMat;

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
      const faceNormals = d.mesh.userData.faceNormals || [];
      const faceValues  = d.mesh.userData.faceValues  || [1,2,3,4,5,6];
      let value = 1;
      if (faceNormals.length > 0) {
        const q = d.mesh.quaternion;
        let bestDot = -Infinity, bestFi = 0;
        faceNormals.forEach((n, fi) => {
          const dot = n.clone().applyQuaternion(q).dot(up);
          if (dot > bestDot) { bestDot = dot; bestFi = fi; }
        });
        value = faceValues[bestFi];
      } else {
        value = Math.ceil(Math.random() * 6);
      }
      return { die: idx+1, type: 6, value };
    });
  }

  updateConfig(cfg) {
    this.cfg = cfg;
    this.scene.background = new THREE.Color(cfg.sceneBg || "#0d0d0d");
    this.scene.fog.color  = new THREE.Color(cfg.sceneBg || "#0d0d0d");
    // Ambient only affects the table mesh, not the dice (MeshBasicMaterial)
    if (this._ambLight) {
      this._ambLight.intensity = (cfg.ambientLight || 40) / 100;
    }
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

  // No auto-roll in config mode — user clicks "Roll Now" or the canvas
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

  // Always D6 — type selector removed
  config.dice[idx].type = 6;

  card.innerHTML = `
    <div class="die-card-header">
      <span class="die-badge">Die ${idx + 1}</span>
      <span class="die-label">d6</span>
      <button class="btn-remove-die" title="Remove">×</button>
    </div>
    <div class="die-colors">
      <label>Die</label>
      <input type="color" class="cfg-color die-color" value="${die.dieColor || "#c0392b"}">
      <label style="margin-left:8px">Pips</label>
      <input type="color" class="cfg-color dot-color" value="${die.dotColor || "#ffffff"}">
    </div>
    <div class="die-face-seg">
      <button class="die-face-btn${die.faceStyle === "dots" ? " active" : ""}" data-face="dots">Dots</button>
      <button class="die-face-btn${die.faceStyle === "numbers" ? " active" : ""}" data-face="numbers">Numbers</button>
    </div>
  `;

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
