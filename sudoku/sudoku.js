'use strict';

// ══════════════════════════════════════════════
//  SUDOKU ENGINE
// ══════════════════════════════════════════════

function emptyGrid() {
  return Array.from({ length: 9 }, () => new Array(9).fill(0));
}

function isValid(grid, row, col, num) {
  for (let c = 0; c < 9; c++) if (grid[row][c] === num) return false;
  for (let r = 0; r < 9; r++) if (grid[r][col] === num) return false;
  const br = Math.floor(row / 3) * 3, bc = Math.floor(col / 3) * 3;
  for (let r = br; r < br + 3; r++)
    for (let c = bc; c < bc + 3; c++)
      if (grid[r][c] === num) return false;
  return true;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Fill a complete valid solution
function fillGrid(grid) {
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (grid[row][col] === 0) {
        const nums = shuffle([1,2,3,4,5,6,7,8,9]);
        for (const num of nums) {
          if (isValid(grid, row, col, num)) {
            grid[row][col] = num;
            if (fillGrid(grid)) return true;
            grid[row][col] = 0;
          }
        }
        return false;
      }
    }
  }
  return true;
}

// Count solutions (cap at 2 for uniqueness check)
function countSolutions(grid, limit = 2) {
  let count = 0;
  function solve(g) {
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        if (g[row][col] === 0) {
          for (let num = 1; num <= 9; num++) {
            if (isValid(g, row, col, num)) {
              g[row][col] = num;
              solve(g);
              if (count >= limit) return;
              g[row][col] = 0;
            }
          }
          return;
        }
      }
    }
    count++;
  }
  const copy = grid.map(r => [...r]);
  solve(copy);
  return count;
}

// ══════════════════════════════════════════════
//  LOGICAL SOLVER (for difficulty grading)
//  Returns true if puzzle can be solved purely logically
// ══════════════════════════════════════════════

function getCandidates(grid) {
  const cands = Array.from({ length: 9 }, () =>
    Array.from({ length: 9 }, () => new Set([1,2,3,4,5,6,7,8,9]))
  );
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (grid[r][c] !== 0) cands[r][c] = new Set();

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const v = grid[r][c];
      if (v !== 0) {
        // eliminate from row, col, box
        for (let i = 0; i < 9; i++) {
          cands[r][i].delete(v);
          cands[i][c].delete(v);
        }
        const br = Math.floor(r/3)*3, bc = Math.floor(c/3)*3;
        for (let dr = 0; dr < 3; dr++)
          for (let dc = 0; dc < 3; dc++)
            cands[br+dr][bc+dc].delete(v);
      }
    }
  }
  return cands;
}

// Naked single: a cell with only one candidate
function nakedSingle(grid, cands) {
  let progress = false;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (grid[r][c] === 0 && cands[r][c].size === 1) {
        const val = [...cands[r][c]][0];
        grid[r][c] = val;
        cands[r][c] = new Set();
        // propagate
        for (let i = 0; i < 9; i++) { cands[r][i].delete(val); cands[i][c].delete(val); }
        const br = Math.floor(r/3)*3, bc = Math.floor(c/3)*3;
        for (let dr = 0; dr < 3; dr++)
          for (let dc = 0; dc < 3; dc++)
            cands[br+dr][bc+dc].delete(val);
        progress = true;
      }
    }
  }
  return progress;
}

// Hidden single: a value can only go in one cell in a unit
function hiddenSingle(grid, cands) {
  let progress = false;

  const place = (r, c, val) => {
    grid[r][c] = val;
    cands[r][c] = new Set();
    for (let i = 0; i < 9; i++) { cands[r][i].delete(val); cands[i][c].delete(val); }
    const br = Math.floor(r/3)*3, bc = Math.floor(c/3)*3;
    for (let dr = 0; dr < 3; dr++)
      for (let dc = 0; dc < 3; dc++)
        cands[br+dr][bc+dc].delete(val);
    progress = true;
  };

  // Rows
  for (let r = 0; r < 9; r++) {
    for (let num = 1; num <= 9; num++) {
      const cols = [];
      for (let c = 0; c < 9; c++) if (cands[r][c].has(num)) cols.push(c);
      if (cols.length === 1) place(r, cols[0], num);
    }
  }
  // Cols
  for (let c = 0; c < 9; c++) {
    for (let num = 1; num <= 9; num++) {
      const rows = [];
      for (let r = 0; r < 9; r++) if (cands[r][c].has(num)) rows.push(r);
      if (rows.length === 1) place(rows[0], c, num);
    }
  }
  // Boxes
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      for (let num = 1; num <= 9; num++) {
        const cells = [];
        for (let dr = 0; dr < 3; dr++)
          for (let dc = 0; dc < 3; dc++)
            if (cands[br*3+dr][bc*3+dc].has(num)) cells.push([br*3+dr, bc*3+dc]);
        if (cells.length === 1) place(cells[0][0], cells[0][1], num);
      }
    }
  }
  return progress;
}

// Naked pairs: two cells in a unit share the same two candidates → remove from others
function nakedPairs(cands) {
  let progress = false;

  const process = (cells) => {
    const pairs = cells.filter(([r,c]) => cands[r][c].size === 2);
    for (let i = 0; i < pairs.length; i++) {
      const [r1,c1] = pairs[i];
      const s1 = cands[r1][c1];
      for (let j = i+1; j < pairs.length; j++) {
        const [r2,c2] = pairs[j];
        const s2 = cands[r2][c2];
        if (s1.size === 2 && [...s1].every(v => s2.has(v))) {
          // found a pair, remove these two values from other cells in unit
          for (const [r,c] of cells) {
            if ((r === r1 && c === c1) || (r === r2 && c === c2)) continue;
            for (const v of s1) {
              if (cands[r][c].has(v)) { cands[r][c].delete(v); progress = true; }
            }
          }
        }
      }
    }
  };

  for (let r = 0; r < 9; r++) process(Array.from({length:9},(_,c)=>[r,c]));
  for (let c = 0; c < 9; c++) process(Array.from({length:9},(_,r)=>[r,c]));
  for (let br = 0; br < 3; br++)
    for (let bc = 0; bc < 3; bc++) {
      const cells = [];
      for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) cells.push([br*3+dr,bc*3+dc]);
      process(cells);
    }
  return progress;
}

// Returns true if solved logically
function solveLogically(grid) {
  const g = grid.map(r => [...r]);
  const cands = getCandidates(g);
  let steps = 0;
  const maxSteps = 200;

  while (steps++ < maxSteps) {
    let p = false;
    p = nakedSingle(g, cands) || p;
    p = hiddenSingle(g, cands) || p;
    p = nakedPairs(cands) || p;
    if (!p) break;
  }
  return g.every(row => row.every(v => v !== 0));
}

// ══════════════════════════════════════════════
//  PUZZLE GENERATION
// ══════════════════════════════════════════════

const DIFFICULTY = {
  easy:   { clues: [36, 42] },
  medium: { clues: [28, 35] },
  hard:   { clues: [22, 27] },
};

function generatePuzzle(difficulty) {
  // 1. Fill a complete grid
  const solution = emptyGrid();
  fillGrid(solution);

  // 2. Remove cells while maintaining unique + logically solvable puzzle
  const [minClues, maxClues] = DIFFICULTY[difficulty].clues;
  const targetClues = Math.floor(Math.random() * (maxClues - minClues + 1)) + minClues;

  const puzzle = solution.map(r => [...r]);
  const positions = shuffle(Array.from({length: 81}, (_, i) => [Math.floor(i/9), i%9]));

  let cluesLeft = 81;

  for (const [r, c] of positions) {
    if (cluesLeft <= targetClues) break;
    const backup = puzzle[r][c];
    puzzle[r][c] = 0;
    cluesLeft--;

    // Ensure uniqueness and logical solvability
    const unique = countSolutions(puzzle) === 1;
    const logical = solveLogically(puzzle);

    if (!unique || !logical) {
      puzzle[r][c] = backup;
      cluesLeft++;
    }
  }

  return { puzzle, solution };
}

// ══════════════════════════════════════════════
//  APP STATE
// ══════════════════════════════════════════════

const state = {
  puzzle: null,
  solution: null,
  player: null,        // player's current values
  pencil: null,        // pencil marks [row][col] = Set
  given: null,         // which cells are pre-filled
  selected: null,      // [row, col]
  difficulty: 'easy',
  pencilMode: false,
  showErrors: true,
  highlightPeers: true,
  timer: 0,
  timerInterval: null,
  timerVisible: true,
  complete: false,
};

// ══════════════════════════════════════════════
//  DOM REFS
// ══════════════════════════════════════════════

const boardEl      = document.getElementById('board');
const timerEl      = document.getElementById('timer');
const timerToggle  = document.getElementById('timerToggle');
const newGameBtn   = document.getElementById('newGameBtn');
const difficultyTag= document.getElementById('difficultyTag');
const numpad       = document.getElementById('numpad');
const hintBtn      = document.getElementById('hintBtn');
const completionOverlay = document.getElementById('completionOverlay');
const completionTime    = document.getElementById('completionTime');
const completionNewGame = document.getElementById('completionNewGame');
const highlightPeersEl  = document.getElementById('highlightPeers');
const showErrorsEl      = document.getElementById('showErrors');
const pencilModeEl      = document.getElementById('pencilMode');

// ══════════════════════════════════════════════
//  RENDER
// ══════════════════════════════════════════════

function buildBoard() {
  boardEl.innerHTML = '';
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.row = r;
      cell.dataset.col = c;
      cell.tabIndex = 0;
      cell.addEventListener('click', () => selectCell(r, c));
      cell.addEventListener('keydown', handleCellKeyDown);
      boardEl.appendChild(cell);
    }
  }
}

function getCell(r, c) {
  return boardEl.querySelector(`[data-row="${r}"][data-col="${c}"]`);
}

function renderBoard() {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = getCell(r, c);
      const val = state.player[r][c];
      const isGiven = state.given[r][c];
      const pencilSet = state.pencil[r][c];

      cell.className = 'cell' + (isGiven ? ' given' : '');

      if (val !== 0) {
        cell.textContent = val;
        const isError = state.showErrors && !isGiven && val !== state.solution[r][c];
        if (isError) cell.classList.add('error');
      } else if (pencilSet.size > 0) {
        // render pencil marks
        cell.textContent = '';
        const grid = document.createElement('div');
        grid.className = 'pencil-grid';
        for (let n = 1; n <= 9; n++) {
          const mark = document.createElement('span');
          mark.className = 'pencil-mark';
          mark.textContent = pencilSet.has(n) ? n : '';
          grid.appendChild(mark);
        }
        cell.appendChild(grid);
      } else {
        cell.textContent = '';
      }
    }
  }
  applyHighlights();
  updateNumpadCompletion();
}

function applyHighlights() {
  const [sr, sc] = state.selected || [-1, -1];

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = getCell(r, c);
      cell.classList.remove('selected', 'peer', 'same-num');

      if (r === sr && c === sc) {
        cell.classList.add('selected');
        continue;
      }

      if (state.highlightPeers && sr >= 0) {
        const sameRow = r === sr;
        const sameCol = c === sc;
        const sameBox = Math.floor(r/3) === Math.floor(sr/3) && Math.floor(c/3) === Math.floor(sc/3);
        if (sameRow || sameCol || sameBox) cell.classList.add('peer');
      }

      const selVal = sr >= 0 ? state.player[sr][sc] : 0;
      if (selVal !== 0 && state.player[r][c] === selVal) cell.classList.add('same-num');
    }
  }
}

function updateNumpadCompletion() {
  const counts = new Array(10).fill(0);
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (state.player[r][c] !== 0) counts[state.player[r][c]]++;

  numpad.querySelectorAll('.num-btn[data-num]').forEach(btn => {
    const n = +btn.dataset.num;
    if (n === 0) return;
    btn.classList.toggle('complete', counts[n] >= 9);
  });
}

// ══════════════════════════════════════════════
//  GAME LOGIC
// ══════════════════════════════════════════════

function startGame(difficulty) {
  state.difficulty = difficulty;
  state.complete = false;
  completionOverlay.classList.remove('visible');

  const { puzzle, solution } = generatePuzzle(difficulty);
  state.puzzle = puzzle;
  state.solution = solution;
  state.player = puzzle.map(r => [...r]);
  state.given = puzzle.map(r => r.map(v => v !== 0));
  state.pencil = Array.from({length: 9}, () => Array.from({length: 9}, () => new Set()));
  state.selected = null;

  difficultyTag.textContent = difficulty;
  document.querySelectorAll('.diff-btn').forEach(b => b.classList.toggle('active', b.dataset.diff === difficulty));

  resetTimer();
  startTimer();
  buildBoard();
  renderBoard();
}

function selectCell(r, c) {
  state.selected = [r, c];
  applyHighlights();
  getCell(r, c).focus();
}

function inputNumber(num) {
  if (state.complete) return;
  if (!state.selected) return;
  const [r, c] = state.selected;
  if (state.given[r][c]) return;

  if (state.pencilMode && num !== 0) {
    const set = state.pencil[r][c];
    if (set.has(num)) set.delete(num);
    else set.add(num);
    state.player[r][c] = 0;
  } else {
    state.player[r][c] = num;
    state.pencil[r][c] = new Set();
    // auto-clear pencil marks in peers
    clearPencilPeers(r, c, num);
  }

  renderBoard();
  checkCompletion();
}

function clearPencilPeers(row, col, num) {
  if (num === 0) return;
  for (let i = 0; i < 9; i++) { state.pencil[row][i].delete(num); state.pencil[i][col].delete(num); }
  const br = Math.floor(row/3)*3, bc = Math.floor(col/3)*3;
  for (let dr = 0; dr < 3; dr++)
    for (let dc = 0; dc < 3; dc++)
      state.pencil[br+dr][bc+dc].delete(num);
}

function checkCompletion() {
  const solved = state.player.every((row, r) =>
    row.every((val, c) => val === state.solution[r][c])
  );
  if (solved) {
    state.complete = true;
    stopTimer();
    completionTime.textContent = formatTime(state.timer);
    completionOverlay.classList.add('visible');
  }
}

function giveHint() {
  if (state.complete) return;

  // Collect all unsolved cells
  const cells = [];
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (state.player[r][c] !== state.solution[r][c]) cells.push([r, c]);

  if (cells.length === 0) return;

  // Prefer selected cell if it's wrong/empty
  let target;
  if (state.selected) {
    const [sr, sc] = state.selected;
    if (state.player[sr][sc] !== state.solution[sr][sc]) target = [sr, sc];
  }
  if (!target) target = cells[Math.floor(Math.random() * cells.length)];

  const [r, c] = target;
  state.player[r][c] = state.solution[r][c];
  state.given[r][c] = true;
  state.pencil[r][c] = new Set();
  clearPencilPeers(r, c, state.solution[r][c]);

  state.selected = [r, c];
  renderBoard();

  const cell = getCell(r, c);
  cell.classList.add('hint-flash');
  cell.addEventListener('animationend', () => cell.classList.remove('hint-flash'), { once: true });

  checkCompletion();
}

// ══════════════════════════════════════════════
//  KEYBOARD
// ══════════════════════════════════════════════

function handleCellKeyDown(e) {
  const [r, c] = state.selected || [0, 0];

  const moves = { ArrowUp:[-1,0], ArrowDown:[1,0], ArrowLeft:[0,-1], ArrowRight:[0,1] };
  if (moves[e.key]) {
    e.preventDefault();
    const [dr, dc] = moves[e.key];
    const nr = Math.max(0, Math.min(8, r + dr));
    const nc = Math.max(0, Math.min(8, c + dc));
    selectCell(nr, nc);
    return;
  }

  if (e.key >= '1' && e.key <= '9') inputNumber(+e.key);
  if (e.key === '0' || e.key === 'Backspace' || e.key === 'Delete') inputNumber(0);
}

document.addEventListener('keydown', e => {
  if (e.target.classList.contains('cell')) return;
  if (e.key >= '1' && e.key <= '9') inputNumber(+e.key);
  if (e.key === '0' || e.key === 'Backspace' || e.key === 'Delete') inputNumber(0);
});

// ══════════════════════════════════════════════
//  TIMER
// ══════════════════════════════════════════════

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function startTimer() {
  state.timerInterval = setInterval(() => {
    state.timer++;
    timerEl.textContent = formatTime(state.timer);
  }, 1000);
}

function stopTimer() { clearInterval(state.timerInterval); }
function resetTimer() { stopTimer(); state.timer = 0; timerEl.textContent = '0:00'; }

// ══════════════════════════════════════════════
//  EVENT BINDINGS
// ══════════════════════════════════════════════

timerToggle.addEventListener('click', () => {
  state.timerVisible = !state.timerVisible;
  timerEl.classList.toggle('hidden', !state.timerVisible);
  timerToggle.classList.toggle('active', !state.timerVisible);
});

newGameBtn.addEventListener('click', () => startGame(state.difficulty));
completionNewGame.addEventListener('click', () => startGame(state.difficulty));

numpad.querySelectorAll('.num-btn').forEach(btn => {
  btn.addEventListener('click', () => inputNumber(+btn.dataset.num));
});

document.querySelectorAll('.diff-btn').forEach(btn => {
  btn.addEventListener('click', () => startGame(btn.dataset.diff));
});

hintBtn.addEventListener('click', giveHint);

highlightPeersEl.addEventListener('change', () => {
  state.highlightPeers = highlightPeersEl.checked;
  applyHighlights();
});

showErrorsEl.addEventListener('change', () => {
  state.showErrors = showErrorsEl.checked;
  renderBoard();
});

pencilModeEl.addEventListener('change', () => {
  state.pencilMode = pencilModeEl.checked;
});

// ══════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════

startGame('easy');
