const GRID_SIZE = 20;
const MAX_ACTIONS = 25;

let year = 0;
let score = 0;
let actionsLeft = MAX_ACTIONS;
let running = false;
let intervalId = null;

const gridEl = document.getElementById('grid');
const yearEl = document.getElementById('year');
const actionsEl = document.getElementById('actions');
const scoreEl = document.getElementById('score');
const runBtn = document.getElementById('runBtn');

const tile = () => ({
  moisture: Math.floor(Math.random() * 2) + 1, // 1–2
  nutrients: Math.floor(Math.random() * 2) + 1,
  tier: null,
  age: 0
});

let grid = Array.from({ length: GRID_SIZE }, () =>
  Array.from({ length: GRID_SIZE }, tile)
);

/* --- RENDER --- */

function renderGrid() {
  gridEl.innerHTML = '';

  grid.forEach((row, y) => {
    row.forEach((cell, x) => {
      const el = document.createElement('div');
      el.className = `tile moisture-${cell.moisture}`;
      if (cell.tier !== null) el.classList.add(`tier-${cell.tier}`);

      el.onclick = () => handleClick(x, y);
      gridEl.appendChild(el);
    });
  });

  yearEl.textContent = year;
  actionsEl.textContent = actionsLeft;
  scoreEl.textContent = score;
}

/* --- PREP PHASE --- */

function handleClick(x, y) {
  if (running || actionsLeft <= 0) return;

  const cell = grid[y][x];

  // Simple cycling interaction for demo
  if (cell.tier === null) {
    cell.tier = 0; // groundcover
    cell.age = 0;
  } else if (cell.tier === 0) {
    cell.tier = 1;
    cell.age = 0;
  } else if (cell.tier === 1) {
    cell.tier = 2;
    cell.age = 0;
  } else {
    cell.tier = null;
    cell.age = 0;
  }

  actionsLeft--;
  renderGrid();
}

/* --- SIMULATION --- */

function simulateYear() {
  year++;

  let livingFlowers = 0;

  grid.forEach(row => {
    row.forEach(cell => {
      if (cell.tier === null) return;

      cell.age++;

      // moisture decay
      if (Math.random() < 0.5) {
        cell.moisture = Math.max(0, cell.moisture - 1);
      }

      // nutrient drain based on tier
      cell.nutrients = Math.max(0, cell.nutrients - (cell.tier + 1));

      // death conditions
      if (cell.moisture === 0 || cell.nutrients === 0) {
        cell.tier = null;
        cell.age = 0;
        return;
      }

      livingFlowers++;

      // scoring
      if (cell.tier === 1) score += 1;
      if (cell.tier === 2) score += 3;
    });
  });

  // global collapse check
  if (livingFlowers === 0) {
    endSimulation();
  }
}

/* --- CONTROL --- */

function startSimulation() {
  if (running) return;
  running = true;
  runBtn.disabled = true;

  intervalId = setInterval(() => {
    simulateYear();
    renderGrid();
  }, 1000);
}

function endSimulation() {
  clearInterval(intervalId);
  running = false;
  runBtn.disabled = true;
  console.log('Simulation ended. Final score:', score);
}

runBtn.onclick = startSimulation;

/* --- INIT --- */
renderGrid();
