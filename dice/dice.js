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
    constructor(value, faceColor, textColor) {
        this.value = value;

        // generate face image on the fly
        this.img = createDieFace(value, faceColor, textColor);

        // start offscreen bottom-right
        this.x = canvas.width + 100;
        this.y = canvas.height + 100;

        // target landing position
        this.tx = Math.random() * (canvas.width - 200) + 100;
        this.ty = Math.random() * (canvas.height - 200) + 100;

        this.t = 0;

        // random animation spin
        this.angle = Math.random() * Math.PI * 2;
        this.spin = (Math.random() * 2 - 1) * 0.25;

        this.speed = 0.016 + Math.random() * 0.006;
        this.settleAngle = (Math.random() * 20 - 10) * Math.PI / 180;
    }

    start() {
        this.startX = this.x;
        this.startY = this.y;
    }

    lerp(a, b, t) { return a + (b - a) * t; }

    update() {
        if (this.t < 1) {
            this.t += this.speed;
            const p = 1 - Math.pow(1 - this.t, 3); // ease-out cubic

            this.x = this.lerp(this.startX, this.tx, p);
            this.y = this.lerp(this.startY, this.ty, p);

            this.angle += this.spin * (1 - p);
        } else {
            this.angle = this.settleAngle;
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
        const die = new FakeDie(value, faceColor, textColor);
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
