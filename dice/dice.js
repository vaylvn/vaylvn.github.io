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


    // spawn 3 dice as a demo
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

    // top-down camera
    camera.position.set(0, 10, 0);
	camera.lookAt(0, 0, 0);
	camera.up.set(1, 0, 0);



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
    light.position.set(0, 6, 3);
    scene.add(light);

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    // invisible plane (helps orientation)
    const planeGeo = new THREE.PlaneGeometry(20, 20);
    const planeMat = new THREE.MeshStandardMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0
    });
    const planeMesh = new THREE.Mesh(planeGeo, planeMat);
    planeMesh.rotation.x = -Math.PI / 2;
    scene.add(planeMesh);
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
        shape: new CANNON.Plane(),
        material: new CANNON.Material({ friction: 0.3, restitution: 0.3 })
    });

    // rotate to horizontal plane
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(ground);
}

function createWalls() {
    const wallMaterial = new CANNON.Material({ friction: 0.3, restitution: 0.3 });

    const size = 5;     // half-width of tray
    const height = 5;   // walls tall enough to contain dice
    const thickness = 0.5;

    // (x, z, rotationY)
    const walls = [
        { x: 0,     y: height/2, z:  size, rotY: 0 },
        { x: 0,     y: height/2, z: -size, rotY: 0 },
        { x:  size, y: height/2, z: 0,     rotY: Math.PI/2 },
        { x: -size, y: height/2, z: 0,     rotY: Math.PI/2 },
    ];

    walls.forEach(w => {
        const shape = new CANNON.Box(new CANNON.Vec3(size, height/2, thickness));
        const body = new CANNON.Body({
            mass: 0,
            shape,
            position: new CANNON.Vec3(w.x, w.y, w.z)
        });
        body.quaternion.setFromEuler(0, w.rotY, 0);
        world.addBody(body);
    });
}



/* ---------------------- DICE GENERATION ---------------------- */

function spawnDice(diceConfig) {
    // remove previous
    diceMeshes.forEach(m => scene.remove(m));
    diceBodies.forEach(b => world.removeBody(b));
    diceMeshes = [];
    diceBodies = [];

    const spacing = 1.4;
    let index = 0;

    for (const cfg of diceConfig) {
        // Only D6 for now
        const geom = new THREE.BoxGeometry(1, 1, 1);

        const materials = [];
        for (let i = 1; i <= 6; i++) {
            materials.push(new THREE.MeshStandardMaterial({
                map: makeFaceTexture(i, cfg.color, cfg.text),
                roughness: 0.3,
                metalness: 0.1
            }));
        }

        const mesh = new THREE.Mesh(geom, materials);

        const x = (index % 4) * spacing - spacing * 1.5;
        const z = Math.floor(index / 4) * spacing;

        mesh.position.set(x, 0, z);
        scene.add(mesh);
        diceMeshes.push(mesh);

        const shape = new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5));
        const body = new CANNON.Body({
            mass: 1,
            shape: shape,
            position: new CANNON.Vec3(x, 1.4 + Math.random()*0.3, z),
            sleepThreshold: 0.1,
            angularDamping: 0.1
        });

        world.addBody(body);
        diceBodies.push(body);

        index++;
    }
}

function makeFaceTexture(n, bgColor, textColor) {
    const c = document.createElement("canvas");
    c.width = c.height = 256;

    const ctx = c.getContext("2d");
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = textColor;
    ctx.font = "bold 160px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(n, 128, 128);

    return new THREE.CanvasTexture(c);
}

/* ---------------------- ROLL LOGIC ---------------------- */

function rollDice() {
    for (let i = 0; i < diceBodies.length; i++) {
        const body = diceBodies[i];

        // Reset inside tray
        body.position.set(
            (Math.random() - 0.5) * 2.0,
            0.55,
            (Math.random() - 0.5) * 2.0
        );

        // Face randomly
        body.quaternion.setFromEuler(
            Math.random() * Math.PI,
            Math.random() * Math.PI,
            Math.random() * Math.PI
        );

        // Forward push ONLY (no upward force AT ALL)
        const force = new CANNON.Vec3(
            (Math.random() - 0.5) * 1.2,
            0, // no vertical component
            (Math.random() * 3) + 2
        );

        body.velocity.set(force.x, force.y, force.z);

        // Natural spin (moderate, not insane)
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



/* ---------------------- DETECT STOP + GET RESULT ---------------------- */

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

/* ---------------------- MAIN UPDATE LOOP ---------------------- */

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
