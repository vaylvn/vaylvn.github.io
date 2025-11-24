/* ============================================================================
   DICE WIDGET SCRIPT
   Runs ONLY in live widget mode (?data=...)
   ============================================================================ */


/* ---------------------------------------------------------------------------
   PARSE CONFIG
--------------------------------------------------------------------------- */

function decodeConfig(str) {
  try {
    return JSON.parse(atob(str));
  } catch (err) {
    console.error("Invalid config:", err);
    return null;
  }
}

const params = new URLSearchParams(location.search);
const dataParam = params.get("data");
if (!dataParam) {
  console.error("LIVE MODE but no ?data= param present.");
}

const config = decodeConfig(dataParam);

if (!config || !config.dice) {
  console.error("Invalid config object.");
}


/* ---------------------------------------------------------------------------
   THREE.js SETUP
--------------------------------------------------------------------------- */

const canvas = document.getElementById("diceCanvas");
const renderer = new THREE.WebGLRenderer({
  canvas,
  alpha: true,
  antialias: true
});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(canvas.width, canvas.height);

const scene = new THREE.Scene();

// Camera
const camera = new THREE.PerspectiveCamera(
  45,
  canvas.width / canvas.height,
  0.1,
  100
);
camera.position.set(0, 1, 6);
camera.lookAt(0, 0, 0);

// Lighting
const light = new THREE.DirectionalLight(0xffffff, 1.1);
light.position.set(3, 5, 3);
scene.add(light);

const ambient = new THREE.AmbientLight(0xffffff, 0.2);
scene.add(ambient);


/* ---------------------------------------------------------------------------
   GENERATE PIP CANVAS FOR ANY HEX COLOR
--------------------------------------------------------------------------- */

function generatePipTexture(color, faces, faceNumber) {
  const size = 256;
  const cvs = document.createElement("canvas");
  cvs.width = cvs.height = size;
  const ctx = cvs.getContext("2d");

  ctx.fillStyle = "transparent";
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = color;

  // Draw pips depending on face count
  function pip(x, y) {
    ctx.beginPath();
    ctx.arc(x, y, size * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }

  const mid = size / 2;
  const off = size * 0.25;

  if (faces === 6) {
    // Standard D6 layout
    switch (faceNumber) {
      case 1: pip(mid, mid); break;

      case 2:
        pip(mid - off, mid - off);
        pip(mid + off, mid + off);
        break;

      case 3:
        pip(mid - off, mid - off);
        pip(mid, mid);
        pip(mid + off, mid + off);
        break;

      case 4:
        pip(mid - off, mid - off);
        pip(mid + off, mid - off);
        pip(mid - off, mid + off);
        pip(mid + off, mid + off);
        break;

      case 5:
        pip(mid, mid);
        pip(mid - off, mid - off);
        pip(mid + off, mid - off);
        pip(mid - off, mid + off);
        pip(mid + off, mid + off);
        break;

      case 6:
        pip(mid - off, mid - off);
        pip(mid + off, mid - off);
        pip(mid - off, mid);
        pip(mid + off, mid);
        pip(mid - off, mid + off);
        pip(mid + off, mid + off);
        break;
    }
  } else {
    // Non-d6: Write the face number (minimalist)
    ctx.font = `${size * 0.55}px Inter`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(faceNumber, mid, mid);
  }

  return new THREE.CanvasTexture(cvs);
}


/* ---------------------------------------------------------------------------
   MESH GENERATION PER DIE TYPE
--------------------------------------------------------------------------- */

function createDieMesh(faces, color, pipColor) {
  let geometry;

  switch (faces) {
    case 4:
      geometry = new THREE.TetrahedronGeometry(1);
      break;
    case 6:
      geometry = new THREE.BoxGeometry(1, 1, 1);
      break;
    case 8:
      geometry = new THREE.OctahedronGeometry(1);
      break;
    case 10:
      geometry = new THREE.DodecahedronGeometry(1); // placeholder
      break;
    case 12:
      geometry = new THREE.DodecahedronGeometry(1);
      break;
    case 20:
      geometry = new THREE.IcosahedronGeometry(1);
      break;
    default:
      geometry = new THREE.BoxGeometry(1, 1, 1);
  }

  // For D6, generate 6 textures
  let materials = [];

  if (faces === 6) {
    for (let f = 1; f <= 6; f++) {
      materials.push(
        new THREE.MeshStandardMaterial({
          color,
          map: generatePipTexture(pipColor, 6, f)
        })
      );
    }
  } else {
    // Non-D6: one shared material with dynamic text per roll
    const tex = generatePipTexture(pipColor, faces, 1);
    const mat = new THREE.MeshStandardMaterial({
      color,
      map: tex
    });
    materials = [mat];
  }

  const mesh = new THREE.Mesh(geometry, materials.length > 1 ? materials : materials[0]);
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  mesh.userData.faces = faces;
  mesh.userData.color = color;
  mesh.userData.pipColor = pipColor;

  return mesh;
}


/* ---------------------------------------------------------------------------
   SNAP ORIENTATION TABLE (ONLY FOR D6)
--------------------------------------------------------------------------- */

const D6_ORIENTATIONS = {
  1: [0, 0, 0],
  2: [Math.PI/2, 0, 0],
  3: [0, Math.PI/2, 0],
  4: [0, -Math.PI/2, 0],
  5: [-Math.PI/2, 0, 0],
  6: [Math.PI, 0, 0]
};


/* ---------------------------------------------------------------------------
   ROLL ANIMATION
--------------------------------------------------------------------------- */

let diceMeshes = [];
let rollInProgress = false;

function rollDice() {
  if (rollInProgress) return;
  rollInProgress = true;

  const results = [];

  const duration = config.rollDuration || 2000;
  const stagger = config.stagger || 150;

  diceMeshes.forEach((mesh, i) => {
    const faces = mesh.userData.faces;

    // Pick final value
    const finalValue = 1 + Math.floor(Math.random() * faces);
    results.push(finalValue);

    // Reset face texture for non-d6
    if (faces !== 6) {
      mesh.material.map = generatePipTexture(mesh.userData.pipColor, faces, finalValue);
      mesh.material.needsUpdate = true;
    }

    // Spawn offscreen
    mesh.position.set(
      Math.random() > 0.5 ? -5 : 5,
      1 + Math.random(),
      0
    );

    mesh.rotation.set(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2
    );

    const startTime = performance.now() + i * stagger;

    function animateRoll(t) {
      const now = performance.now();
      if (now < startTime) {
        requestAnimationFrame(animateRoll);
        return;
      }

      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);

      const spin = (1 - progress) * 0.4;

      mesh.rotation.x += spin;
      mesh.rotation.y += spin * 0.8;
      mesh.rotation.z += spin * 1.2;

      mesh.position.x *= 0.95;

      if (progress < 1) {
        requestAnimationFrame(animateRoll);
      } else {
        // Snap orientation
        if (faces === 6) {
          const [rx, ry, rz] = D6_ORIENTATIONS[finalValue];
          mesh.rotation.set(rx, ry, rz);
        }

        // After last die arrives at final orientation → grid layout
        if (i === diceMeshes.length - 1) {
          setTimeout(() => {
            layoutDiceGrid();
            broadcastResults(results);
            rollInProgress = false;
          }, 150);
        }
      }
    }

    animateRoll(startTime);
  });
}


/* ---------------------------------------------------------------------------
   AUTO-GRID FINAL LAYOUT
--------------------------------------------------------------------------- */

function layoutDiceGrid() {
  const count = diceMeshes.length;

  const rows = Math.ceil(Math.sqrt(count));
  const cols = Math.ceil(count / rows);

  const spacing = 1.8;

  diceMeshes.forEach((mesh, index) => {
    const r = Math.floor(index / cols);
    const c = index % cols;

    const x = (c - (cols - 1) / 2) * spacing;
    const y = -1.5 + (rows - r - 1) * spacing * 0.66;

    new TWEEN.Tween(mesh.position)
      .to({ x, y, z: 0 }, 500)
      .easing(TWEEN.Easing.Quadratic.Out)
      .start();
  });
}


/* ---------------------------------------------------------------------------
   BROADCAST RESULTS
--------------------------------------------------------------------------- */

function broadcastResults(results) {
  window.parent.postMessage({
    type: "diceRoll",
    results
  }, "*");
}


/* ---------------------------------------------------------------------------
   MAIN LOOP
--------------------------------------------------------------------------- */

function animate() {
  requestAnimationFrame(animate);
  TWEEN.update();
  renderer.render(scene, camera);
}
animate();


/* ---------------------------------------------------------------------------
   RESIZE
--------------------------------------------------------------------------- */

window.addEventListener("resize", () => {
  renderer.setSize(canvas.width, canvas.height);
  camera.aspect = canvas.width / canvas.height;
  camera.updateProjectionMatrix();
});


/* ---------------------------------------------------------------------------
   BUILD INITIAL DICE (CONFIG DECODED ABOVE)
--------------------------------------------------------------------------- */

diceMeshes = config.dice.map(die => {
  const mesh = createDieMesh(die.faces, die.color, die.pips);
  scene.add(mesh);
  return mesh;
});

// Initial layout (grid)
layoutDiceGrid();


/* ---------------------------------------------------------------------------
   AUTO-ROLL OR ON-CLICK
--------------------------------------------------------------------------- */

if (config.autoRoll) {
  setTimeout(() => rollDice(), 400);
}

canvas.addEventListener("click", () => {
  rollDice();
});
