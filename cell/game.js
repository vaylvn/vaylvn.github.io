const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

resize();
window.addEventListener("resize", resize);

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

/* ======================
   CONFIG
====================== */

const CELL_SIZE = 32;
const COLORS = {
  bg: "#1f2430",
  cell: "#2a3140",
  selected: "#8b90a6",
  active: "#6f78ff",
  text: "#ffffff"
};

/* ======================
   CAMERA
====================== */

const camera = {
  x: 0,
  y: 0,
  zoom: 1
};

let isDragging = false;
let lastMouse = { x: 0, y: 0 };

canvas.addEventListener("mousedown", e => {
  isDragging = true;
  lastMouse = { x: e.clientX, y: e.clientY };
});

canvas.addEventListener("mouseup", () => isDragging = false);
canvas.addEventListener("mouseleave", () => isDragging = false);

canvas.addEventListener("mousemove", e => {
  if (!isDragging) return;
  camera.x += (e.clientX - lastMouse.x) / camera.zoom;
  camera.y += (e.clientY - lastMouse.y) / camera.zoom;
  lastMouse = { x: e.clientX, y: e.clientY };
});

canvas.addEventListener("wheel", e => {
  e.preventDefault();
  const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
  camera.zoom = Math.min(3, Math.max(0.3, camera.zoom * zoomFactor));
}, { passive: false });

/* ======================
   GRID STORAGE
====================== */

const grid = new Map();

function key(x, y) {
  return `${x},${y}`;
}

// demo seed word
placeWord("HELLO", 0, 0, "right");

/* ======================
   WORD PLACEMENT
====================== */

function placeWord(word, startX, startY, dir) {
  for (let i = 0; i < word.length; i++) {
    const x = startX + (dir === "right" ? i : 0);
    const y = startY + (dir === "down" ? i : 0);

    grid.set(key(x, y), {
      letter: word[i],
      state: "active" // cell | selected | active
    });
  }
}

/* ======================
   RENDER LOOP
====================== */

function draw() {
  ctx.setTransform(camera.zoom, 0, 0, camera.zoom, canvas.width / 2, canvas.height / 2);
  ctx.translate(camera.x, camera.y);

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(-5000, -5000, 10000, 10000);

  const visibleRadius = Math.ceil((canvas.width / CELL_SIZE) / camera.zoom) + 2;

  for (let x = -visibleRadius; x <= visibleRadius; x++) {
    for (let y = -visibleRadius; y <= visibleRadius; y++) {
      drawCell(x, y);
    }
  }

  requestAnimationFrame(draw);
}

function drawCell(x, y) {
  const size = CELL_SIZE;
  const cell = grid.get(key(x, y));

  let color = COLORS.cell;
  if (cell?.state === "selected") color = COLORS.selected;
  if (cell?.state === "active") color = COLORS.active;

  ctx.fillStyle = color;
  ctx.fillRect(x * size, y * size, size - 2, size - 2);

  if (cell?.letter) {
    ctx.fillStyle = COLORS.text;
    ctx.font = `${size * 0.6}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      cell.letter,
      x * size + size / 2,
      y * size + size / 2
    );
  }
}

draw();
