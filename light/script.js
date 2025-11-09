const boardEl = document.getElementById('board');
const scoreEl = document.getElementById('score');
const newGameBtn = document.getElementById('newGameBtn');
const traySlots = document.querySelectorAll('.tray-slot');

const BOARD_SIZE = 10;
let board = [];
let score = 0;
let dragging = null;
let ghostCells = [];

function init() {
  board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
  renderBoard();
  generateTray();
  score = 0;
  scoreEl.textContent = score;
}

function renderBoard() {
  boardEl.innerHTML = '';
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = document.createElement('div');
      cell.classList.add('cell');
      if (board[r][c]) cell.classList.add('filled');
      boardEl.appendChild(cell);
    }
  }
}

function generateTray() {
  traySlots.forEach(slot => {
    slot.innerHTML = '';
    const piece = randomPiece();
    const el = renderPiece(piece);
    slot.appendChild(el);
    slot.dataset.piece = JSON.stringify(piece);
  });
}

function renderPiece(shape) {
  const pieceEl = document.createElement('div');
  pieceEl.classList.add('piece');
  pieceEl.style.gridTemplateColumns = `repeat(${shape[0].length}, 48px)`;
  shape.forEach(row => {
    row.forEach(cell => {
      const block = document.createElement('div');
      if (cell) block.classList.add('block');
      pieceEl.appendChild(block);
    });
  });

  pieceEl.addEventListener('pointerdown', e => startDrag(e, shape, pieceEl));
  return pieceEl;
}

function startDrag(e, shape, pieceEl) {
  if (dragging) return;
  dragging = { shape, pieceEl };

  const clone = pieceEl.cloneNode(true);
  clone.style.position = 'absolute';
  clone.style.pointerEvents = 'none';
  clone.style.opacity = '0.5';
  clone.style.transform = 'translate(-50%, -50%) scale(0.8)';
  clone.id = 'dragClone';
  document.body.appendChild(clone);

  pieceEl.style.opacity = '0.3';

  const move = ev => moveDrag(ev, shape);
  const up = ev => endDrag(ev, shape, pieceEl, clone, move, up);

  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up, { once: true });
}

function moveDrag(e, shape) {
  const clone = document.getElementById('dragClone');
  if (clone) {
    clone.style.left = `${e.pageX}px`;
    clone.style.top = `${e.pageY}px`;
  }

  const rect = boardEl.getBoundingClientRect();
  const cellSize = rect.width / BOARD_SIZE;
  const col = Math.floor((e.clientX - rect.left) / cellSize);
  const row = Math.floor((e.clientY - rect.top) / cellSize);

  clearGhosts();

  if (row >= 0 && col >= 0 && row < BOARD_SIZE && col < BOARD_SIZE) {
    const valid = canPlace(row, col, shape);
    highlightGhost(row, col, shape, valid);
  }
}

function endDrag(e, shape, pieceEl, clone, move, up) {
  window.removeEventListener('pointermove', move);
  clearGhosts();

  const rect = boardEl.getBoundingClientRect();
  const cellSize = rect.width / BOARD_SIZE;
  const col = Math.floor((e.clientX - rect.left) / cellSize);
  const row = Math.floor((e.clientY - rect.top) / cellSize);

  if (placePiece(row, col, shape)) {
    clearLines();
    generateTray();
  }

  pieceEl.style.opacity = '1';
  clone.remove();
  dragging = null;
}

function highlightGhost(row, col, shape, valid) {
  const cells = Array.from(boardEl.children);
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[0].length; c++) {
      if (shape[r][c]) {
        const rr = row + r;
        const cc = col + c;
        if (rr < BOARD_SIZE && cc < BOARD_SIZE) {
          const cellIndex = rr * BOARD_SIZE + cc;
          const cell = cells[cellIndex];
          if (cell) {
            cell.classList.add('ghost');
            if (!valid) cell.classList.add('invalid');
            ghostCells.push(cell);
          }
        }
      }
    }
  }
}

function clearGhosts() {
  ghostCells.forEach(cell => cell.classList.remove('ghost', 'invalid'));
  ghostCells = [];
}

function canPlace(row, col, shape) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[0].length; c++) {
      if (shape[r][c]) {
        if (row + r >= BOARD_SIZE || col + c >= BOARD_SIZE || board[row + r][col + c]) {
          return false;
        }
      }
    }
  }
  return true;
}

function placePiece(row, col, shape) {
  if (!canPlace(row, col, shape)) return false;
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[0].length; c++) {
      if (shape[r][c]) board[row + r][col + c] = 1;
    }
  }
  renderBoard();
  return true;
}

function clearLines() {
  let linesCleared = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    if (board[r].every(v => v)) {
      board[r] = Array(BOARD_SIZE).fill(0);
      linesCleared++;
    }
  }
  for (let c = 0; c < BOARD_SIZE; c++) {
    if (board.every(row => row[c])) {
      board.forEach(row => (row[c] = 0));
      linesCleared++;
    }
  }
  if (linesCleared > 0) {
    score += linesCleared * 10;
    scoreEl.textContent = score;
    renderBoard();
  }
}

function randomPiece() {
  const shapes = [
    [[1]],
    [[1, 1]],
    [[1, 1, 1]],
    [[1], [1], [1]],
    [[1, 1], [1, 1]],
    [[1, 1, 1], [0, 1, 0]],
    [[1, 0], [1, 0], [1, 1]],
  ];
  return shapes[Math.floor(Math.random() * shapes.length)];
}

newGameBtn.addEventListener('click', init);
window.onload = init;
