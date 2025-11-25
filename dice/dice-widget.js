import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

export function initDiceWidget(canvas, config) {

  //
  // CLEAN UP ANY PREVIOUS INSTANCE
  //
  if (canvas.__widgetInstance) {
    canvas.__widgetInstance.dispose();
  }

  const diceConfig = config.dice;
  const diceCount = diceConfig.length;

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
  scene.add(new THREE.AmbientLight(0xffffff, 0.65));

  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(4, 10, 7);
  scene.add(dir);

  const floorY = -1.2;



  // ==============================
  // SMOOTH GEOMETRY HELPERS
  // ==============================

  function smoothGeometry(geo) {
    geo.computeVertexNormals();
    return geo;
  }

  const DIE_GEOMETRIES = {
    4: () => smoothGeometry(new THREE.TetrahedronGeometry(1, 0)),
    6: () => smoothGeometry(new THREE.BoxGeometry(1.4, 1.4, 1.4)),
    8: () => smoothGeometry(new THREE.OctahedronGeometry(1, 0)),
    12: () => smoothGeometry(new THREE.DodecahedronGeometry(1, 0)),
    20: () => smoothGeometry(new THREE.IcosahedronGeometry(1, 0)),
  };


  // ==============================
  // FACE TEXTURE (ENGRAVED LOOK)
  // ==============================

  function makeEngravedFace(number, dieColor, numberColor) {
    const size = 256;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");

    // Base colour
    ctx.fillStyle = dieColor;
    ctx.fillRect(0, 0, size, size);

    // Engraving shadow
    ctx.font = `bold 160px Inter`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.fillStyle = "#00000055";
    ctx.fillText(number, size/2 + 4, size/2 + 4);

    ctx.fillStyle = numberColor;
    ctx.fillText(number, size/2, size/2);

    const texture = new THREE.CanvasTexture(c);
    texture.needsUpdate = true;
    return texture;
  }


  // ==============================
  // MATERIAL BUILDER
  // ==============================

  function buildDieMaterial(textures) {
    return textures.map(t => new THREE.MeshStandardMaterial({
      map: t,
      metalness: 0.1,
      roughness: 0.6
    }));
  }


  // ==============================
  // CREATE DIE MESH
  // ==============================

  function buildDie(dcfg, index, total) {
    const { faces, dieColor, numberColor } = dcfg;

    const geo = DIE_GEOMETRIES[faces]();

    const numGeoFaces = geo.groups.length;
    const faceTextures = [];

    for (let i = 0; i < numGeoFaces; i++) {
      const num = (i % faces) + 1;
      faceTextures.push(
        makeEngravedFace(num, dieColor, numberColor)
      );
    }

    const mats = buildDieMaterial(faceTextures);
    const mesh = new THREE.Mesh(geo, mats);

    // HORIZONTAL LAYOUT
    mesh.position.x = (index - (total - 1) / 2) * 2.4;
    mesh.position.y = 0;
    mesh.position.z = 0;

    // Save movement velocities
    mesh.userData.velocity = new THREE.Vector3();
    mesh.userData.angularVelocity = new THREE.Vector3();

    //
    // STORE FACE NORMALS FOR TOP DETECTION
    //
    mesh.userData.faceNormals = [];
    const pos = geo.attributes.position.array;
    const indices = geo.index.array;

    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i] * 3;
      const b = indices[i+1] * 3;
      const c = indices[i+2] * 3;

      const vA = new THREE.Vector3(pos[a], pos[a+1], pos[a+2]);
      const vB = new THREE.Vector3(pos[b], pos[b+1], pos[b+2]);
      const vC = new THREE.Vector3(pos[c], pos[c+1], pos[c+2]);

      const normal = new THREE.Vector3()
        .subVectors(vB, vA)
        .cross(new THREE.Vector3().subVectors(vC, vA))
        .normalize();

      mesh.userData.faceNormals.push({
        normal,
        faceIndex: i / 3
      });
    }

    return mesh;
  }


  // ==============================
  // BUILD ALL DICE
  // ==============================

  const diceMeshes = diceConfig.map((cfg, i) =>
    buildDie(cfg, i, diceCount)
  );

  diceMeshes.forEach(d => scene.add(d));


  // ==============================
  // TOP FACE DETECTOR
  // ==============================

  function getTopFace(die) {
    let best = null;
    let bestDot = -999;
    const up = new THREE.Vector3(0, 1, 0);
    const matrix = die.matrixWorld;

    for (const f of die.userData.faceNormals) {
      const worldNormal = f.normal.clone().applyMatrix4(matrix).normalize();
      const dot = worldNormal.dot(up);
      if (dot > bestDot) {
        best = f;
        bestDot = dot;
      }
    }

    if (!best) return 1;
  
    return (best.faceIndex % 20) + 1;
  }


  // ==============================
  // ROLL ALL DICE
  // ==============================

  function rollAll() {
    diceMeshes.forEach(die => {
      die.userData.velocity.set(
        (Math.random() - 0.5) * 5,
        7 + Math.random()*2,
        (Math.random() - 0.5) * 5
      );

      die.userData.angularVelocity.set(
        Math.random() * 10,
        Math.random() * 10,
        Math.random() * 10
      );
    });
  }


  // ==============================
  // ANIMATION LOOP
  // ==============================

  let killed = false;

  function animate() {
    if (killed) return;

    const dt = 0.016;

    diceMeshes.forEach(die => {
      // Move
      die.position.addScaledVector(die.userData.velocity, dt);

      // Gravity
      die.userData.velocity.y -= 25 * dt;

      // Rotation
      die.rotation.x += die.userData.angularVelocity.x * dt;
      die.rotation.y += die.userData.angularVelocity.y * dt;
      die.rotation.z += die.userData.angularVelocity.z * dt;

      // Bounce floor
      if (die.position.y < floorY) {
        die.position.y = floorY;
        die.userData.velocity.y *= -0.35;
        die.userData.angularVelocity.multiplyScalar(0.45);
      }

      // Slow down
      die.userData.velocity.multiplyScalar(0.98);
      die.userData.angularVelocity.multiplyScalar(0.98);

      // Snap if slow
      if (die.userData.velocity.length() < 0.1 &&
          die.userData.angularVelocity.length() < 0.1) {

        const top = getTopFace(die);

        die.userData.velocity.set(0,0,0);
        die.userData.angularVelocity.set(0,0,0);
      }
    });

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  animate();


  //
  // RETURN WIDGET CONTROL
  //
  const widget = {
    rollAll,
    dispose() {
      killed = true;
      renderer.dispose();
      scene.clear();
    }
  };

  canvas.__widgetInstance = widget;
  return widget;
}
