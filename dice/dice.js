const canvas = document.getElementById("diceCanvas");
const ctx = canvas.getContext("2d");

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resize();
window.addEventListener("resize", resize);

/* ------------------------------------------------------
   DYNAMIC DICE FACE GENERATION
------------------------------------------------------ */

function createDieFace(value, faceColor, textColor) {
    const c = document.createElement("canvas");
    c.width = c.height = 80;
    const g = c.getContext("2d");

    // background
    g.fillStyle = faceColor;
    g.fillRect(0, 0, 80, 80);

    // border
    g.strokeStyle = "#00000055";
    g.lineWidth = 4;
    g.strokeRect(2, 2, 76, 76);

    // number
    g.fillStyle = textColor;
    g.font = "bold 42px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(value, 40, 42);

    return c;
}

/* ------------------------------------------------------
   Fake physics: animated dice objects
------------------------------------------------------ */

class FakeDie {
    constructor(value, faceColor, textColor, existingTargets) {
        this.value = value;
        this.img = createDieFace(value, faceColor, textColor);

        // start offscreen bottom-right
        this.x = canvas.width + 100;
        this.y = canvas.height + 100;

        // pick safe landing position (no overlap)
        const target = this.getNonOverlappingTarget(existingTargets);
        this.tx = target.x;
        this.ty = target.y;

        this.t = 0;

        // spin + settle rotation
        this.angle = Math.random() * Math.PI * 2;
        this.spin = (Math.random() * 2 - 1) * 0.25;
        this.settleAngle = (Math.random() * 20 - 10) * Math.PI / 180;

        // speed determines animation length
        this.speed = 0.016 + Math.random() * 0.006;

        // start coords saved later
    }

    start() {
        this.startX = this.x;
        this.startY = this.y;
    }

    lerp(a, b, t) { return a + (b - a) * t; }

    // ---------- NEW: NO OVERLAP ----------
    getNonOverlappingTarget(existing) {
        let tx, ty;
        let attempts = 0;

        while (true) {
            attempts++;

            tx = Math.random() * (canvas.width - 200) + 100;
            ty = Math.random() * (canvas.height - 200) + 100;

            let valid = true;

            for (const pos of existing) {
                const dx = tx - pos.x;
                const dy = ty - pos.y;
                const dist = Math.hypot(dx, dy);
                if (dist < 120) {  // 80px dice → safe spacing ~120px
                    valid = false;
                    break;
                }
            }

            if (valid || attempts > 50) {
                return { x: tx, y: ty };
            }
        }
    }

    update() {
        if (this.t < 1) {
            this.t += this.speed;

            const p = 1 - Math.pow(1 - this.t, 3); // ease-out cubic

            this.x = this.lerp(this.startX, this.tx, p);
            this.y = this.lerp(this.startY, this.ty, p);

            // spin stops gradually
            this.angle += this.spin * (1 - p);
        } else {
            // ---------- NEW: SMOOTH ANGLE SETTLE ----------
            // softly interpolate angle toward final settleAngle
            this.angle = this.lerp(this.angle, this.settleAngle, 0.1);
        }
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.drawImage(this.img, -40, -40);
        ctx.restore();
    }
}


let dice = [];
let animating = false;

/* ------------------------------------------------------
   Roll & animate
------------------------------------------------------ */

function rollDice(count = 3, faceColor = "#ffffff", textColor = "#000000") {
    dice = [];

    for (let i = 0; i < count; i++) {
        const value = Math.floor(Math.random() * 6) + 1;
        const die = new FakeDie(value, faceColor, textColor, dice.map(d => ({x: d.tx, y: d.ty})));

        dice.push(die);
        die.start();
    }

    animating = true;
    animate();
}

function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let done = 0;

    for (const d of dice) {
        d.update();
        d.draw();
        if (d.t >= 1) done++;
    }

    if (done < dice.length) {
        requestAnimationFrame(animate);
    } else {
        animating = false;
        console.log("🟩 Results:", dice.map(d => d.value));
    }
}

window.addEventListener("click", () => {
    if (!animating) rollDice(3, "#ffffff", "#000000");
});
