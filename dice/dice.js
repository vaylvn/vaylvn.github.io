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

    // demo dice
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

    // CORRECT TOP-DOWN CAMERA
    camera.position.set(0, 20, 0);
    camera.lookAt(0, 0, 0);
    camera.up.set(0, 0, 1);  // <-- THIS FIXES ALL AXIS ISSUES

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

    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
}

/* ---------------------- PHYSICS SETUP ---------------------- */

function setupCannon() {
    world = new CANNON.World({
        gravity: new CANNON.Vec3(0, -9.82, 0)
    });

    world.broadphase = new CANNON.SAPBroadphase(world);
    world.solver.iterations = 14;
    world.allowSleep = true;
}

function createGround() {
    const ground = new CANNON.Body({
        type: CANNON.Body.STATIC,
        shape: new CANNON.Plane()
    });

    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(ground);
}

/* ---------------------- L-SHAPED WALLS ---------------------- */

function createWalls() {
    const h = 3;
    const t = 0.5;
    const s = 4; // half-size of tray area

    const north = new CANNON.Body({
        type: CANNON.Body.STATIC,
        shape: new CANNON.Box(new CANNON.Vec3(s, h / 2, t)),
        position: new CANNON.Vec3(0, h / 2, s)
    });

    const west = new CANNON.Body({
        type: CANNON.Body.STATIC,
        shape: new CANNON.Box(new CANNON.Vec3(t, h / 2, s)),
        position: new CANNON.Vec3(-s, h / 2, 0)
    });

    world.addBody(north);
    world.addBody(west);
}

/* ---------------------- DICE GENERATION ---------------------- */

function spawnDice(configArray) {
    diceMeshes.forEach(m => scene.remove(m));
    diceBodies.forEach(b => world.removeBody(b));
    diceMeshes = [];
    diceBodies = [];

    for (const cfg of configArray) {
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
            sleepThreshold: 0.15
        });

        world.addBody(body);
        diceBodies.push(body);
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

/* ---------------------- NARROW-CONE THROW ---------------------- */

function rollDice() {
    // OFF-SCREEN bottom-right spawn origin
    const spawnX = +4.5;
    const spawnZ = -4.5;

    // Target inside tray (top-left)
    const targetX = -2.5;
    const targetZ = +2.5;

    const dirX = targetX - spawnX;
    const dirZ = targetZ - spawnZ;
    const baseMag = Math.hypot(dirX, dirZ);

    const baseDirX = dirX / baseMag;
    const baseDirZ = dirZ / baseMag;

    for (let i = 0; i < diceBodies.length; i++) {
        const body = diceBodies[i];

        // tightly clustered spawn
        const jitter = 0.12;
        const sx = spawnX + (Math.random() - 0.5) * jitter;
        const sz = spawnZ + (Math.random() - 0.5) * jitter;

        body.position.set(sx, 0.6, sz);

        body.quaternion.setFromEuler(
            Math.random() * 0.4,
            Math.random() * Math.PI * 2,
            Math.random() * 0.4
        );

        // narrow throw cone ±0.08 rad (~4.5°)
        const ang = (Math.random() - 0.5) * 0.08;
        const cosA = Math.cos(ang);
        const sinA = Math.sin(ang);

        const dx = baseDirX * cosA - baseDirZ * sinA;
        const dz = baseDirX * sinA + baseDirZ * cosA;

        const speed = 4.1 + Math.random() * 0.25;

        body.velocity.set(dx * speed, 0, dz * speed);

        body.angularVelocity.set(
            (Math.random() - 0.5) * 5,
            (Math.random() - 0.5) * 5,
            (Math.random() - 0.5) * 5
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
                console.log("Roll results:", diceBodies.map(getTopFace));
            }
        } else {
            lastStillTime = 0;
        }
    }

    renderer.render(scene, camera);
}
