import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.164/build/three.module.js";
import * as CANNON from "https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js";

let scene, camera, renderer;
let world;

let diceMeshes = [];
let diceBodies = [];

let waitingForStop = false;
let lastStillTime = 0;

export function initDiceTest() {
    setupThree();
    setupCannon();
    createGround();
    createWalls();

    // demo: 3 dice
    spawnDice([
        { sides: 6, color: "#ffffff", text: "#000000" },
        { sides: 6, color: "#ffffff", text: "#000000" },
        { sides: 6, color: "#ffffff", text: "#000000" }
    ]);

    renderer.setAnimationLoop(update);

    window.addEventListener("click", rollDice);
}

/* ---------------------- THREE SETUP ---------------------- */

function setupThree() {
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(
        45,
        window.innerWidth / window.innerHeight,
        0.1,
        100
    );

    // 🔥 Correct top-down camera — no axis flipping
    camera.position.set(0, 10, 0);
    camera.lookAt(0, 0, 0);
    camera.up.set(0, 0, 1); // matches world-space

    renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    window.addEventListener("resize", () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(5, 10, 5);
    scene.add(light);

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    // invisible floor (helps shading)
    const planeGeo = new THREE.PlaneGeometry(20, 20);
    const planeMat = new THREE.MeshStandardMaterial({
        transparent: true,
        opacity: 0
    });
    const plane = new THREE.Mesh(planeGeo, planeMat);
    plane.rotation.x = -Math.PI / 2;
    scene.add(plane);
}

/* ---------------------- PHYSICS SETUP ---------------------- */

function setupCannon() {
    world = new CANNON.World({
        gravity: new CANNON.Vec3(0, -9.82, 0)
    });

    world.broadphase = new CANNON.SAPBroadphase(world);
    world.solver.iterations = 12;
    world.allowSleep = true;
}

function createGround() {
    const ground = new CANNON.Body({
        type: CANNON.Body.STATIC,
        shape: new CANNON.Plane()
    });

    // rotate so normal faces upward
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);

    world.addBody(ground);
}

/* ---------------------- L-SHAPED WALLS ---------------------- */

function createWalls() {
    const wallMat = new CANNON.Material({ friction: 0.3, restitution: 0.3 });

    const height = 3;
    const thickness = 0.5;
    const halfSize = 4; // tray spans ~8x8 visible units

    // NORTH wall (top)
    const north = new CANNON.Body({
        type: CANNON.Body.STATIC,
        material: wallMat,
        shape: new CANNON.Box(new CANNON.Vec3(halfSize, height / 2, thickness)),
        position: new CANNON.Vec3(0, height / 2, halfSize)
    });
    world.addBody(north);

    // WEST wall (left)
    const west = new CANNON.Body({
        type: CANNON.Body.STATIC,
        material: wallMat,
        shape: new CANNON.Box(new CANNON.Vec3(thickness, height / 2, halfSize)),
        position: new CANNON.Vec3(-halfSize, height / 2, 0)
    });
    world.addBody(west);
}

/* ---------------------- DICE GENERATION ---------------------- */

function spawnDice(configArray) {
    // remove existing
    diceMeshes.forEach(m => scene.remove(m));
    diceBodies.forEach(b => world.removeBody(b));
    diceMeshes = [];
    diceBodies = [];

    let idx = 0;
    for (const cfg of configArray) {
        // D6 mesh
        const geom = new THREE.BoxGeometry(1, 1, 1);
        const materials = [];
        for (let i = 1; i <= 6; i++) {
            materials.push(new THREE.MeshStandardMaterial({
                map: makeFaceTexture(i, cfg.color, cfg.text)
            }));
        }

        const mesh = new THREE.Mesh(geom, materials);
        scene.add(mesh);
        diceMeshes.push(mesh);

        const shape = new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5));
        const body = new CANNON.Body({
            mass: 1,
            shape: shape,
            position: new CANNON.Vec3(0, 0.6, 0),
            angularDamping: 0.1,
            sleepThreshold: 0.1
        });

        world.addBody(body);
        diceBodies.push(body);

        idx++;
    }
}

function makeFaceTexture(n, bg, text) {
    const c = document.createElement("canvas");
    c.width = c.height = 256;

    const ctx = c.getContext("2d");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = text;
    ctx.font = "bold 160px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(n, 128, 128);

    return new THREE.CanvasTexture(c);
}

/* ---------------------- THROW LOGIC ---------------------- */

function rollDice() {
    // Spawn origin: bottom-right outside view
    const spawnX = 4.5;
    const spawnZ = -4.5;

    // Target: top-left inside tray
    const targetX = -2.5;
    const targetZ = 2.5;

    // Compute clean direction vector
    const dirX = targetX - spawnX;
    const dirZ = targetZ - spawnZ;
    const baseMag = Math.sqrt(dirX*dirX + dirZ*dirZ);

    const baseDirX = dirX / baseMag;
    const baseDirZ = dirZ / baseMag;

    for (let i = 0; i < diceBodies.length; i++) {
        const body = diceBodies[i];

        // Each die spawns very close together (small jitter)
        const jitter = 0.12;                           // small shift, keeps cluster tight
        const sx = spawnX + (Math.random() - 0.5) * jitter;
        const sz = spawnZ + (Math.random() - 0.5) * jitter;

        body.position.set(sx, 0.6, sz);

        // Clean orientation
        body.quaternion.setFromEuler(
            Math.random() * 0.5,
            Math.random() * Math.PI * 2,
            Math.random() * 0.5
        );

        // Narrow throw cone
        const ang = (Math.random() - 0.5) * 0.10;       // ±0.10 rad ≈ ±5.7°
        const cosA = Math.cos(ang);
        const sinA = Math.sin(ang);

        const coneDirX = baseDirX * cosA - baseDirZ * sinA;
        const coneDirZ = baseDirX * sinA + baseDirZ * cosA;

        // Speed scaling (kept tight)
        const speed = 4 + Math.random() * 0.4;          // minimal variation

        body.velocity.set(coneDirX * speed, 0, coneDirZ * speed);

        // Spin (reduced)
        const spin = 4;                                 // less chaotic
        body.angularVelocity.set(
            (Math.random() - 0.5) * spin,
            (Math.random() - 0.5) * spin,
            (Math.random() - 0.5) * spin
        );

        body.wakeUp();
    }

    waitingForStop = true;
    lastStillTime = 0;
}


/* ---------------------- TOP FACE DETECTION ---------------------- */

function getTopFace(body) {
    const up = new CANNON.Vec3(0, 1, 0);
    const worldUp = new CANNON.Vec3();
    body.quaternion.vmult(up, worldUp);

    const abs = worldUp.toArray().map(Math.abs);
    const maxIndex = abs.indexOf(Math.max(...abs));

    const faces = {
        0: worldUp.x > 0 ? 3 : 4,
        1: worldUp.y > 0 ? 1 : 6,
        2: worldUp.z > 0 ? 2 : 5
    };

    return faces[maxIndex];
}

/* ---------------------- MAIN LOOP ---------------------- */

function update() {
    world.step(1/60);

    for (let i = 0; i < diceBodies.length; i++) {
        diceMeshes[i].position.copy(diceBodies[i].position);
        diceMeshes[i].quaternion.copy(diceBodies[i].quaternion);
    }

    if (waitingForStop) {
        const still = diceBodies.every(b =>
            b.velocity.length() < 0.05 &&
            b.angularVelocity.length() < 0.05
        );

        if (still) {
            lastStillTime += 1/60;

            if (lastStillTime > 0.5) {
                waitingForStop = false;
                const results = diceBodies.map(getTopFace);
                console.log("Roll results:", results);
            }
        } else {
            lastStillTime = 0;
        }
    }

    renderer.render(scene, camera);
}
