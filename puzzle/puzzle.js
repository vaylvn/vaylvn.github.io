'use strict';

// ═══════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════

const FREQS   = 4;   // states per node (1–4)
const ROWS    = 4;
const COLS    = 4;
const N       = ROWS * COLS;

// Glyph for each frequency
const GLYPHS  = ['', 'glyph-circle', 'glyph-square', 'glyph-triangle', 'glyph-diamond'];
const EMOJIS  = ['', '◉', '■', '▲', '◆'];

// Roman numerals for level display
const ROMAN   = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

// ═══════════════════════════════════════════════
//  PUZZLE GENERATION
//  Start from all-same solved state, apply N
//  random legal moves to create a solvable puzzle.
//  More scramble moves = harder.
// ═══════════════════════════════════════════════

function idx(r, c) { return r * COLS + c; }

function neighbours(i) {
  const r = Math.floor(i / COLS), c = i % COLS;
  const nb = [];
  if (r > 0)       nb.push(idx(r-1, c));
  if (r < ROWS-1)  nb.push(idx(r+1, c));
  if (c > 0)       nb.push(idx(r, c-1));
  if (c < COLS-1)  nb.push(idx(r, c+1));
  return nb;
}

// Apply a "click" move to a grid (in-place), returns new grid
function applyMove(grid, i) {
  const g = [...grid];
  const affected = [i, ...neighbours(i)];
  for (const j of affected) {
    g[j] = (g[j] % FREQS) + 1;  // cycle 1→2→3→4→1
  }
  return g;
}

function generatePuzzle(scrambleMoves) {
  // Start from a solved state (all 1s)
  let grid = new Array(N).fill(1);
  const moveHistory = [];

  // Apply random scramble moves
  for (let m = 0; m < scrambleMoves; m++) {
    const move = Math.floor(Math.random() * N);
    grid = applyMove(grid, move);
    moveHistory.push(move);
  }

  // Make sure it's not accidentally solved
  if (isSolved(grid) && scrambleMoves > 0) return generatePuzzle(scrambleMoves);

  return grid;
}

function isSolved(grid) {
  const v = grid[0];
  return grid.every(x => x === v);
}

// ═══════════════════════════════════════════════
//  LEVEL DEFINITIONS
//  Each level: { scramble, targetMoves, label }
//  Generated fresh each play-through so they're
//  always different but always solvable.
// ═══════════════════════════════════════════════

const LEVEL_CONFIGS = [
  { scramble: 4,  label: 'I'   },
  { scramble: 6,  label: 'II'  },
  { scramble: 8,  label: 'III' },
  { scramble: 10, label: 'IV'  },
  { scramble: 14, label: 'V'   },
];

// ═══════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════

const state = {
  grid:        [],
  startGrid:   [],
  moves:       0,
  level:       0,
  levelConfig: null,
};

// ═══════════════════════════════════════════════
//  DOM
// ═══════════════════════════════════════════════

const gridEl       = document.getElementById('grid');
const linesCanvas  = document.getElementById('linesCanvas');
const levelLabel   = document.getElementById('levelLabel');
const movesLabel   = document.getElementById('movesLabel');
const progressFill = document.getElementById('progressFill');
const resetBtn     = document.getElementById('resetBtn');
const nextBtn      = document.getElementById('nextBtn');
const solvedVeil   = document.getElementById('solvedVeil');
const solvedGlyph  = document.getElementById('solvedGlyph');
const solvedSub    = document.getElementById('solvedSub');
const solvedNextBtn= document.getElementById('solvedNextBtn');
const stageEl      = document.getElementById('stage');

// ═══════════════════════════════════════════════
//  RENDER
// ═══════════════════════════════════════════════

function buildGrid() {
  gridEl.innerHTML = '';
  gridEl.style.gridTemplateColumns = `repeat(${COLS}, var(--node-size))`;
  gridEl.style.gridTemplateRows    = `repeat(${ROWS}, var(--node-size))`;

  for (let i = 0; i < N; i++) {
    const node = document.createElement('div');
    node.className = 'node';
    node.dataset.idx = i;

    const ring  = document.createElement('div');
    ring.className = 'node-ring';

    const glyph = document.createElement('div');
    glyph.className = 'node-glyph';

    const shape = document.createElement('div');
    glyph.appendChild(shape);
    node.appendChild(ring);
    node.appendChild(glyph);

    node.addEventListener('click', () => handleClick(i));
    gridEl.appendChild(node);
  }
}

function renderGrid(changedIndices = []) {
  const nodes = gridEl.querySelectorAll('.node');

  nodes.forEach((node, i) => {
    const f = state.grid[i];
    node.dataset.freq = f;

    const shape = node.querySelector('.node-glyph > div');
    shape.className = GLYPHS[f];

    node.classList.toggle('resonant', false);

    if (changedIndices.includes(i)) {
      node.classList.add('affected');
      node.addEventListener('animationend', () => node.classList.remove('affected'), { once: true });
    }
  });

  // If solved, shimmer all
  if (isSolved(state.grid)) {
    nodes.forEach(n => n.classList.add('resonant'));
  }

  drawLines();
  updateProgress();
}

function drawLines() {
  const canvas = linesCanvas;
  const rect   = stageEl.getBoundingClientRect();
  canvas.width  = stageEl.offsetWidth;
  canvas.height = stageEl.offsetHeight;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const nodes = gridEl.querySelectorAll('.node');
  const positions = [];

  nodes.forEach((node) => {
    const nr = node.getBoundingClientRect();
    positions.push({
      x: nr.left - rect.left + nr.width / 2,
      y: nr.top  - rect.top  + nr.height / 2,
    });
  });

  const freqColors = ['', '#3a7fff', '#ff5e5e', '#ffe44d', '#4dffa0'];

  for (let i = 0; i < N; i++) {
    const nbs = neighbours(i);
    for (const j of nbs) {
      if (j <= i) continue; // draw each edge once
      const sameFreq = state.grid[i] === state.grid[j];
      const p1 = positions[i], p2 = positions[j];

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);

      if (sameFreq) {
        ctx.strokeStyle = freqColors[state.grid[i]];
        ctx.globalAlpha = 0.35;
        ctx.lineWidth   = 1.5;
      } else {
        ctx.strokeStyle = '#1c1c30';
        ctx.globalAlpha = 1;
        ctx.lineWidth   = 1;
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

function updateProgress() {
  // Progress = fraction of adjacent pairs that share a frequency
  let total = 0, matching = 0;
  for (let i = 0; i < N; i++) {
    for (const j of neighbours(i)) {
      if (j > i) {
        total++;
        if (state.grid[i] === state.grid[j]) matching++;
      }
    }
  }
  const pct = total > 0 ? (matching / total) * 100 : 0;
  progressFill.style.width = pct + '%';
}

// ═══════════════════════════════════════════════
//  INTERACTION
// ═══════════════════════════════════════════════

function handleClick(i) {
  if (isSolved(state.grid)) return;

  const affected = [i, ...neighbours(i)];
  state.grid = applyMove(state.grid, i);
  state.moves++;
  movesLabel.textContent = state.moves;

  // ripple visual
  const clickedNode = gridEl.querySelectorAll('.node')[i];
  clickedNode.classList.remove('clicked');
  void clickedNode.offsetWidth; // reflow
  clickedNode.classList.add('clicked');
  clickedNode.addEventListener('animationend', () => clickedNode.classList.remove('clicked'), { once: true });

  renderGrid(affected);

  if (isSolved(state.grid)) {
    setTimeout(showSolved, 600);
  }
}

function showSolved() {
  const freq = state.grid[0];
  solvedGlyph.textContent = EMOJIS[freq];
  solvedSub.textContent   = state.moves + ' moves · level ' + LEVEL_CONFIGS[state.level].label;

  // shimmer
  gridEl.classList.add('all-solved');

  solvedVeil.classList.add('show');
  nextBtn.disabled = false;
}

function loadLevel(idx) {
  state.level      = idx;
  state.levelConfig = LEVEL_CONFIGS[idx];
  state.moves      = 0;
  state.grid       = generatePuzzle(state.levelConfig.scramble);
  state.startGrid  = [...state.grid];

  levelLabel.textContent  = state.levelConfig.label;
  movesLabel.textContent  = '0';
  nextBtn.disabled        = true;
  gridEl.classList.remove('all-solved');
  solvedVeil.classList.remove('show');

  buildGrid();
  renderGrid();
}

resetBtn.addEventListener('click', () => {
  state.grid  = [...state.startGrid];
  state.moves = 0;
  movesLabel.textContent = '0';
  gridEl.classList.remove('all-solved');
  renderGrid();
});

nextBtn.addEventListener('click', () => {
  const next = (state.level + 1) % LEVEL_CONFIGS.length;
  loadLevel(next);
});

solvedNextBtn.addEventListener('click', () => {
  const next = (state.level + 1) % LEVEL_CONFIGS.length;
  loadLevel(next);
});

// Redraw lines on resize
window.addEventListener('resize', () => {
  drawLines();
});

// ═══════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════

loadLevel(0);
