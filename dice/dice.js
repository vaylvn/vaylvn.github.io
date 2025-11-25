import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.164/build/three.module.js";
import * as CANNON from "https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js";


let scene, camera, renderer;
let world;
let dieMesh, dieBody;

// main entry
export function initDiceTest() {
    setupThree();
    setupCannon();
    createGround();
    createDie();

    renderer.setAnimationLoop(update);

    window.addEventListener("click", rollDie);
}

// ---------- THREE ----------
function setupThree() {
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(
        45,
        window.innerWidth / window.innerHeight,
        0.1,
        100
    );
    camera.position.set(2.5, 2.5, 2.5);
    camera.lookAt(0, 0, 0);

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
    light.position.set(4, 6, 4);
    scene.add(light);

    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
}

// ---------- CANNON ----------
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

    // rotate plane so its normal faces up
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);

    world.addBody(ground);
}

// ---------- DIE ----------
function createDie() {
    // THREE mesh
    const geom = new THREE.BoxGeometry(1, 1, 1);

    const materials = [];
    for (let i = 1; i <= 6; i++) {
        materials.push(new THREE.MeshStandardMaterial({
            map: makeFaceTexture(i),
            roughness: 0.3,
            metalness: 0.1
        }));
    }

    dieMesh = new THREE.Mesh(geom, materials);
    scene.add(dieMesh);

    // CANNON body
    const box = new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5));

    dieBody = new CANNON.Body({
        mass: 1,
        shape: box,
        position: new CANNON.Vec3(0, 2, 0),
        sleepThreshold: 0.05,
        angularDamping: 0.1
    });

    world.addBody(dieBody);
}

function makeFaceTexture(n) {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = "#000000";
    ctx.font = "bold 160px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(n, 128, 128);

    return new THREE.CanvasTexture(c);
}

// ---------- ROLL ----------
function rollDie() {
    // reset position
    dieBody.position.set(
        (Math.random() - 0.5) * 0.4,
        1.5 + Math.random() * 0.2,
        (Math.random() - 0.5) * 0.4
    );

    // random orientation
    dieBody.quaternion.setFromEuler(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
    );

    // random impulse
    dieBody.applyImpulse(
        new CANNON.Vec3(
            (Math.random() - 0.5) * 5,
            5 + Math.random() * 3,
            (Math.random() - 0.5) * 5
        ),
        new CANNON.Vec3(0, 0, 0)
    );

    // random spin
    dieBody.angularVelocity.set(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10
    );

    dieBody.wakeUp();
}

// ---------- MAIN LOOP ----------
function update() {
    world.step(1 / 60);

    // sync Three mesh to Cannon body
    dieMesh.position.copy(dieBody.position);
    dieMesh.quaternion.copy(dieBody.quaternion);

    renderer.render(scene, camera);
}
