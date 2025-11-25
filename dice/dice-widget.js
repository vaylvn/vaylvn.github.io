import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

export function initDiceWidget(canvas, diceCount = 3) {

    // -------- RENDERER --------
    const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);

    // -------- SCENE + CAMERA --------
    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(
        45,
        canvas.clientWidth / canvas.clientHeight,
        0.1,
        100
    );
    camera.position.set(0, 3, 6);

    // -------- LIGHTS --------
    scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const dl = new THREE.DirectionalLight(0xffffff, 1.1);
    dl.position.set(3, 4, 5);
    scene.add(dl);

    // -------- SIMPLE TEXTURE ATLAS --------
    const atlas = document.createElement("canvas");
    atlas.width = 512;
    atlas.height = 768;
    const ctx = atlas.getContext("2d");

    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, atlas.width, atlas.height);

    const size = 256;
    const positions = [
        [0, 0], [256, 0],
        [0, 256], [256, 256],
        [0, 512], [256, 512]
    ];

    positions.forEach(([x, y], i) => {
        ctx.fillStyle = "#fff";
        ctx.fillRect(x, y, size, size);

        ctx.fillStyle = "#000";
        ctx.font = "bold 180px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(i + 1, x + size / 2, y + size / 2);
    });

    const texture = new THREE.CanvasTexture(atlas);

    // -------- UV MAP (2 columns × 3 rows) --------
    const uvFaces = [];
    const w = 0.5, h = 1/3;

    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 2; col++) {
            const u0 = col * w;
            const v0 = 1 - row * h - h;
            uvFaces.push([
                new THREE.Vector2(u0, v0),
                new THREE.Vector2(u0 + w, v0),
                new THREE.Vector2(u0 + w, v0 + h),
                new THREE.Vector2(u0, v0 + h)
            ]);
        }
    }

    function createDiceGeometry() {
        const g = new THREE.BoxGeometry(1, 1, 1);
        const uvAttr = g.attributes.uv;

        for (let face = 0; face < 6; face++) {
            const uv = uvFaces[face];
            const idx = face * 8;
            uvAttr.array[idx] = uv[0].x;     uvAttr.array[idx + 1] = uv[0].y;
            uvAttr.array[idx + 2] = uv[1].x; uvAttr.array[idx + 3] = uv[1].y;
            uvAttr.array[idx + 4] = uv[2].x; uvAttr.array[idx + 5] = uv[2].y;
            uvAttr.array[idx + 6] = uv[3].x; uvAttr.array[idx + 7] = uv[3].y;
        }

        uvAttr.needsUpdate = true;
        return g;
    }

    const faceRotations = {
        1: [0, 0, 0],
        2: [0, Math.PI, 0],
        3: [Math.PI / 2, 0, 0],
        4: [-Math.PI / 2, 0, 0],
        5: [0, Math.PI / 2, 0],
        6: [0, -Math.PI / 2, 0]
    };

    function snap(die, val) {
        const r = faceRotations[val];
        die.rotation.set(r[0], r[1], r[2]);
    }

    // -------- GROUP OF DICE --------
    const diceGroup = new THREE.Group();
    scene.add(diceGroup);

    const geo = createDiceGeometry();
    const mat = new THREE.MeshStandardMaterial({ map: texture });

    for (let i = 0; i < diceCount; i++) {
        const die = new THREE.Mesh(geo, mat.clone());
        die.position.x = (i - (diceCount - 1) / 2) * 1.3;

        die.userData.rolling = false;
        die.userData.finalValue = 1;
        die.userData.t = 0;

        snap(die, 1);
        diceGroup.add(die);
    }

    // -------- ROLL ANIMATION --------
    function rollDice() {
        for (const die of diceGroup.children) {
            die.userData.rolling = true;
            die.userData.t = 0;
            die.userData.finalValue = Math.floor(Math.random() * 6) + 1;
        }
    }

    // -------- ANIMATION LOOP --------
    function animate() {
        requestAnimationFrame(animate);

        const dt = 0.016;

        for (const die of diceGroup.children) {
            if (die.userData.rolling) {
                die.userData.t += dt;

                // quick visual spin (nothing fancy)
                die.rotation.x += 0.32;
                die.rotation.y += 0.41;
                die.rotation.z += 0.27;

                if (die.userData.t >= 0.65) {
                    die.userData.rolling = false;
                    snap(die, die.userData.finalValue);
                }
            }
        }

        renderer.render(scene, camera);
    }
    animate();

    return { rollDice };
}
