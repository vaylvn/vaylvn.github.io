const boardEl = document.getElementById('board');
const scoreEl = document.getElementById('score');
const newGameBtn = document.getElementById('newGameBtn');
const trayEl = document.getElementById('tray');

const BOARD_SIZE = 10;
let board = [];
let score = 0;
let dragging = null;
let ghostCells = [];
let grabOffset = { r: 0, c: 0 };
let nextPieces = [];

function init() {
  board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
  renderBoard();
  score = 0;
  scoreEl.textContent = score;

  nextPieces = [randomPiece(), randomPiece(), randomPiece()];
  renderTray();
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

function renderTray() {
  trayEl.innerHTML = '';
  trayEl.style.display = 'flex';
  trayEl.style.justifyContent = 'center';
  trayEl.style.alignItems = 'center';
  trayEl.style.gap = '60px';
  trayEl.style.width = '600px';
  trayEl.style.height = '200px';
  trayEl.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

  const scales = [1.0, 0.7, 0.5];
  const opacities = [1.0, 0.6, 0.3];

  nextPieces.forEach((piece, i) => {
    const pieceEl = renderPiece(piece, scales[i], i > 0);
    pieceEl.classList.add('tray-piece');
    pieceEl.style.opacity = opacities[i];
    trayEl.appendChild(pieceEl);
  });
}

function renderPiece(shape, scale = 1, faded = false) {
  const pieceEl = document.createElement('div');
  pieceEl.classList.add('piece');
  pieceEl.style.gridTemplateColumns = `repeat(${shape[0].length}, 48px)`;
  pieceEl.style.transform = `scale(${scale})`;
  pieceEl.style.transition = 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s';

  shape.forEach(row => {
    row.forEach(cell => {
      const block = document.createElement('div');
      if (cell) block.classList.add('block');
      pieceEl.appendChild(block);
    });
  });

  if (!faded && scale === 1) pieceEl.addEventListener('pointerdown', e => startDrag(e, shape, pieceEl));
  return pieceEl;
}

function startDrag(e, shape, pieceEl) {
  if (dragging) return;
  dragging = { shape, pieceEl };

  e.preventDefault();
  pieceEl.setPointerCapture(e.pointerId);

  const rect = pieceEl.getBoundingClientRect();
  const cellSize = 48 + 4;
  const relX = e.clientX - rect.left;
  const relY = e.clientY - rect.top;
  grabOffset = {
    r: Math.floor(relY / cellSize),
    c: Math.floor(relX / cellSize)
  };

  const clone = pieceEl.cloneNode(true);
  clone.style.position = 'absolute';
  clone.style.pointerEvents = 'none';
  clone.style.opacity = '0.5';
  clone.style.transform = 'translate(-50%, -50%) scale(0.8)';
  clone.id = 'dragClone';
  document.body.appendChild(clone);

  pieceEl.style.opacity = '0.3';

  const move = ev => moveDrag(ev, shape);
  const up = ev => endDrag(ev, shape, pieceEl, clone, move, up, e.pointerId);

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
  const col = Math.floor((e.clientX - rect.left) / cellSize) - grabOffset.c;
  const row = Math.floor((e.clientY - rect.top) / cellSize) - grabOffset.r;

  clearGhosts();

  if (row >= 0 && col >= 0 && row < BOARD_SIZE && col < BOARD_SIZE) {
    const valid = canPlace(row, col, shape);
    highlightGhost(row, col, shape, valid);
  }
}

function endDrag(e, shape, pieceEl, clone, move, up, pointerId) {
  window.removeEventListener('pointermove', move);
  pieceEl.releasePointerCapture(pointerId);
  clearGhosts();

  const rect = boardEl.getBoundingClientRect();
  const cellSize = rect.width / BOARD_SIZE;
  const col = Math.floor((e.clientX - rect.left) / cellSize) - grabOffset.c;
  const row = Math.floor((e.clientY - rect.top) / cellSize) - grabOffset.r;

  if (placePiece(row, col, shape)) {
    clearLines();
    cyclePieces();
  }

  pieceEl.style.opacity = '1';
  clone.remove();
  dragging = null;
}

function cyclePieces() {
  const trayPieces = Array.from(trayEl.children);
  trayPieces[0].style.transform = 'scale(0.5)';
  trayPieces[0].style.opacity = '0';

  nextPieces.shift();
  nextPieces.push(randomPiece());

  // Smooth transition delay before re-render
  setTimeout(() => {
    renderTray();
  }, 300);
}

function highlightGhost(row, col, shape, valid) {
  const cells = Array.from(boardEl.children);
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[0].length; c++) {
      if (shape[r][c]) {
        const rr = row + r;
        const cc = col + c;
        if (rr < BOARD_SIZE && cc < BOARD_SIZE && rr >= 0 && cc >= 0) {
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
