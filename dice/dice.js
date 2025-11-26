const canvas = document.getElementById("diceCanvas");
const ctx = canvas.getContext("2d");

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resize();
window.addEventListener("resize", resize);

const diceImages = {};
for (let i = 1; i <= 6; i++) {
    diceImages[i] = new Image();
    diceImages[i].src = `assets/${i}.png`;
}

/* ------------------------------------------------------
   Fake physics: simple animation objects
------------------------------------------------------ */

class FakeDie {
    constructor(finalValue) {
        this.value = finalValue;

        // start off-screen bottom-right
        this.x = canvas.width + 100;
        this.y = canvas.height + 100;

        // end somewhere on table
        this.tx = Math.random() * (canvas.width - 200) + 100;
        this.ty = Math.random() * (canvas.height - 200) + 100;

        // animation progress
        this.t = 0;

        // random initial angle & spin rate
        this.angle = Math.random() * Math.PI * 2;
        this.spin = (Math.random() * 2 - 1) * 0.3;

        // random speed multiplier
        this.speed = 0.02 + Math.random() * 0.01;

        // final rotation should be small (looks "settled")
        this.settleAngle = (Math.random() * 20 - 10) * Math.PI / 180;
    }

    update() {
        if (this.t < 1) {
            this.t += this.speed;

            // ease-out cubic
            const p = 1 - Math.pow(1 - this.t, 3);

            this.x = this.lerp(this.startX, this.tx, p);
            this.y = this.lerp(this.startY, this.ty, p);

            // spin heavily at start, slow at end
            this.angle += this.spin * (1 - p);
        } else {
            // lock angle to a gentle final tilt
            this.angle = this.settleAngle;
        }
    }

    start() {
        // called just before animation
        this.startX = this.x;
        this.startY = this.y;
    }

    lerp(a, b, t) { return a + (b - a) * t; }

    draw() {
        const img = diceImages[this.value];
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.drawImage(img, -40, -40, 80, 80);
        ctx.restore();
    }
}

let dice = [];
let animating = false;

function rollDice(count = 3) {
    dice = [];

    for (let i = 0; i < count; i++) {
        const value = Math.floor(Math.random() * 6) + 1;
        const d = new FakeDie(value);
        dice.push(d);
        d.start();
    }

    animating = true;
    animate();
}

function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let doneCount = 0;

    for (const d of dice) {
        d.update();
        d.draw();

        if (d.t >= 1) doneCount++;
    }

    if (doneCount < dice.length) {
        requestAnimationFrame(animate);
    } else {
        animating = false;
        console.log("Final results:", dice.map(d => d.value));
    }
}

window.addEventListener("click", () => {
    if (!animating) rollDice(3);
});
