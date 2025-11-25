import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

//
// ===============================
//  MAIN WIDGET ENTRY
// ===============================
//

export function initDiceWidget(canvas, config) {
  const diceConfig = config.dice;
  let diceCount = diceConfig.length;

  // Clear any previous renderers attached to this canvas
  while (canvas.firstChild) canvas.removeChild(canvas.firstChild);

  //
  // SCENE SETUP
  //
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true
  });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);

  const scene = new THREE.Scene();
  scene.background = null;

  // CAMERA
  const camera = new THREE.PerspectiveCamera(
    45,
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    100
  );
  camera.position.set(0, 5, 9);
  camera.lookAt(0, 0, 0);

  // LIGHTS
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(4, 10, 7);
  scene.add(dir);

  // FLOOR (invisible, used for bounce detection)
  const floorY = -1.2;

  //
  // GEOMETRY HELPERS
  //
  function smoothGeometry(geo) {
    geo.computeVertexNormals();
    return geo;
  }

  const DIE_GEOMETRIES = {
    4: () => smoothGeometry(new THREE.TetrahedronGeometry(1, 0)),
    6: () => smoothGeometry(new THREE.BoxGeometry(1.4, 1.4, 1.4)),
    8: () => smoothGeometry(new THREE.OctahedronGeometry(1, 0)),
    12: () => smoothGeometry(new THREE.DodecahedronGeometry(1, 0)),
    20: () => smoothGeometry(new THREE.IcosahedronGeometry(1, 0))
  };

  //
  // TEXTURE GENERATOR (engravings)
  //
  function makeEngravedFace(number, dieColor, numberColor) {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");

    // Base background
    ctx.fillStyle = dieColor;
    ctx.fillRect(0, 0, size, size);

    // Engraved shadow effect
    ctx.font = `bold 160px Inter`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.fillStyle = "#00000055";
    ctx.fillText(number, size / 2 + 4, size / 2 + 4);

    ctx.fillStyle = numberColor;
    ctx.fillText(number, size / 2, size / 2);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  //
  // MATERIAL BUILDER
  //
  function buildDieMaterial(faceTextures) {
    return faceTextures.map(tex => {
      return new THREE.MeshStandardMaterial({
        map: tex,
        metalness: 0.1,
        roughness: 0.6
      });
    });
  }

  //
  // BUILD A SINGLE DIE
  //
  function buildDie(dieCfg, index, total) {
    const { faces, dieColor, numberColor } = dieCfg;

    const geo = DIE_GEOMETRIES[faces]();

    //
    // MAP GEOMETRY FACES TO FACE NUMBERS
    //
    const faceTextures = [];
    const numFaces = geo.groups.length;

    for (let i = 0; i < numFaces; i++) {
      const faceNumber = (i % faces) + 1;
      faceTextures.push(makeEngravedFace(faceNumber, dieColor, numberColor));
    }

    const materials = buildDieMaterial(faceTextures);
    const mesh = new THREE.Mesh(geo, materials);

    //
    // SAVE face normals for top-face detection later
    //
    mesh.userData.faceNormals = [];
    const pos = geo.attributes.position;
    const verts = pos.array;
    const indexAttr = geo.index.array;

    for (let i = 0; i < indexAttr.length; i += 3) {
      const a = indexAttr[i] * 3;
      const b = indexAttr[i + 1] * 3;
      const c = indexAttr[i + 2] * 3;

      const vA = new THREE.Vector3(verts[a], verts[a + 1], verts[a + 2]);
      const vB = new THREE.Vector3(verts[b], verts[b + 1], verts[b + 2]);
      const vC = new THREE.Vector3(verts[c], verts[c + 1], verts[c + 2]);

      const normal = new THREE.Vector3()
        .subVectors(vB, vA)
        .cross(new THREE.Vector3().subVectors(vC, vA))
        .normalize();

      mesh.userData.faceNormals.push({ normal, faceIndex: i / 3 });
    }

    //
    // POSITION DICE HORIZONTALLY
    //
    mesh.position.x = (index - (total - 1) / 2) * 2.4;
    mesh.position.y = 0;
    mesh.position.z = 0;

    //
    // INITIAL STATE
    //
    mesh.userData.velocity = new THREE.Vector3();
    mesh.userData.angularVelocity = new THREE.Vector3();

    return mesh;
  }

  //
  // BUILD ALL DICE
  //
  const diceMeshes = diceConfig.map((cfg, i) =>
    buildDie(cfg, i, diceCount)
  );
  diceMeshes.forEach(d => scene.add(d));

  //
  // TOP FACE DETECTOR
  //
  function getTopFace(die) {
    let best = null;
    let bestDot = -999;

    const up = new THREE.Vector3(0, 1, 0);
    const matrix = die.matrixWorld;

    for (const f of die.userData.faceNormals) {
      const n = f.normal.clone().applyMatrix4(matrix).normalize();
      const dot = n.dot(up);
      if (dot > bestDot) {
        bestDot = dot;
        best = f;
      }
    }

    let number = (best.faceIndex % 20) + 1; // Enough for all dice types
    return number;
  }

  //
  // ROLL LOGIC
  //
  function rollAll() {
    diceMeshes.forEach(die => {
      die.userData.velocity.set(
        (Math.random() - 0.5) * 5,
        8 + Math.random() * 2,
        (Math.random() - 0.5) * 5
      );

      die.userData.angularVelocity.set(
        Math.random() * 8,
        Math.random() * 8,
        Math.random() * 8
      );
    });
  }

  //
  // ANIMATION LOOP
  //
  function animate() {
    requestAnimationFrame(animate);
    TWEEN.update();

    const dt = 0.016;

    diceMeshes.forEach(die => {
      // POSITION UPDATE
      die.position.addScaledVector(die.userData.velocity, dt);

      // GRAVITY
      die.userData.velocity.y -= 25 * dt;

      // ROTATION UPDATE
      die.rotation.x += die.userData.angularVelocity.x * dt;
      die.rotation.y += die.userData.angularVelocity.y * dt;
      die.rotation.z += die.userData.angularVelocity.z * dt;

      // BOUNCE on floor
      if (die.position.y < floorY) {
        die.position.y = floorY;
        die.userData.velocity.y *= -0.35;
        die.userData.angularVelocity.multiplyScalar(0.45);
      }

      // DAMPENING
      die.userData.velocity.multiplyScalar(0.98);
      die.userData.angularVelocity.multiplyScalar(0.98);

      // SNAP when slow
      if (die.userData.velocity.length() < 0.1 &&
          die.userData.angularVelocity.length() < 0.1) {

        const num = getTopFace(die);
        // console.log("rolled:", num);

        die.userData.velocity.set(0, 0, 0);
        die.userData.angularVelocity.set(0, 0, 0);
      }
    });

    renderer.render(scene, camera);
  }
  animate();

  return {
    rollAll
  };
}
