const GRID_SIZE = 5;
const gridEl = document.getElementById("grid");
const scoreEl = document.getElementById("score");
const timerEl = document.getElementById("timer");

let grid = [];
let selected = [];
let score = 0;
let timeLeft = 30;
let gameRunning = true;

const timerBar = document.createElement("div");
timerBar.className = "bar";
timerEl.appendChild(timerBar);

let mouseDown = false;

gridEl.addEventListener("mousedown", e => { mouseDown = true; });
document.addEventListener("mouseup", () => {
  mouseDown = false;
  endSwipe();
});

grid.forEach(tile => {
  tile.el.addEventListener("mouseenter", () => {
    if (mouseDown) selectTile(tile);
  });
});


// Initialize grid
function init() {
  grid = [];
  gridEl.innerHTML = "";
  for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
    const val = Math.floor(Math.random() * 7) + 1;
    const tile = { val, el: document.createElement("div"), row: Math.floor(i / GRID_SIZE), col: i % GRID_SIZE };
    tile.el.className = "tile";
    tile.el.textContent = val;
    tile.el.dataset.index = i;
    grid.push(tile);
    gridEl.appendChild(tile.el);
    tile.el.addEventListener("mousedown", () => selectTile(tile));
  }
}

function selectTile(tile) {
  if (!gameRunning) return;
  if (selected.includes(tile)) return;
  const last = selected[selected.length - 1];
  if (last && !areAdjacent(last, tile)) return;
  selected.push(tile);
  tile.el.classList.add("selected");
}

function areAdjacent(a, b) {
  const dr = Math.abs(a.row - b.row);
  const dc = Math.abs(a.col - b.col);
  return dr <= 1 && dc <= 1 && !(dr === 0 && dc === 0);
}

document.addEventListener("mouseup", endSwipe);

function endSwipe() {
  if (!selected.length) return;
  const sum = selected.reduce((acc, t) => acc + t.val, 0);
  if (sum === 11) {
    clearTiles();
    timeLeft = Math.min(10, timeLeft + 1.2);
  } else {
    selected.forEach(t => t.el.classList.remove("selected"));
    selected = [];
  }
}

function clearTiles() {
  score += selected.length;
  scoreEl.textContent = score;
  const cleared = [...selected];
  selected = [];
  cleared.forEach(t => {
    t.el.classList.add("cleared");
    setTimeout(() => dropTile(t), 200);
  });
}

function dropTile(tile) {
  const col = tile.col;
  for (let r = tile.row; r > 0; r--) {
    const above = grid.find(t => t.row === r - 1 && t.col === col);
    const target = grid.find(t => t.row === r && t.col === col);
    target.val = above ? above.val : Math.floor(Math.random() * 7) + 1;
    target.el.textContent = target.val;
  }
  grid.find(t => t.row === 0 && t.col === col).val = Math.floor(Math.random() * 7) + 1;
  grid.find(t => t.row === 0 && t.col === col).el.textContent = grid.find(t => t.row === 0 && t.col === col).val;
  tile.el.classList.remove("selected", "cleared");
}

let lastTime = performance.now();

function tick(now) {
  if (!gameRunning) return;
  const dt = (now - lastTime) / 1000; // seconds since last frame
  lastTime = now;

  timeLeft -= dt;                      // drains 1 unit per second
  timerBar.style.width = (timeLeft / 10) * 100 + "%";

  if (timeLeft <= 0) gameOver();
  else requestAnimationFrame(tick);
}


function gameOver() {
  gameRunning = false;
  alert(`Game over. Score: ${score}`);
}

lastTime = performance.now();
requestAnimationFrame(tick);


init();
tick();
