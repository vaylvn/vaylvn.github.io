const boardEl = document.getElementById('board');
const scoreEl = document.getElementById('score');
const newGameBtn = document.getElementById('newGameBtn');
const trayEl = document.getElementById('tray');

document.body.style.touchAction = 'none';

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
      cell.style.touchAction = 'none';
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
    pieceEl.style.touchAction = 'none';
    trayEl.appendChild(pieceEl);
  });
}

function renderPiece(shape, scale = 1, faded = false) {
  const pieceEl = document.createElement('div');
  pieceEl.classList.add('piece');
  pieceEl.style.gridTemplateColumns = `repeat(${shape[0].length}, 48px)`;
  pieceEl.style.transform = `scale(${scale})`;
  pieceEl.style.transition = 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s';
  pieceEl.style.touchAction = 'none';

  shape.forEach(row => {
    row.forEach(cell => {
      const block = document.createElement('div');
      if (cell) block.classList.add('block');
      block.style.touchAction = 'none';
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

  const rect = pieceEl.getBoundingClientRect();
  const cellSize = 48 + 4;
  const relX = e.clientX - rect.left;
  const relY = e.clientY - rect.top;
  grabOffset = {
    r: Math.floor(relY / cellSize),
    c: Math.floor(relX / cellSize)
  };

  requestAnimationFrame(() => {
    const clone = pieceEl.cloneNode(true);
    clone.style.position = 'absolute';
    clone.style.pointerEvents = 'none';
    clone.style.opacity = '0.5';
    clone.style.transform = 'translate(-50%, -50%) scale(0.8)';
    clone.style.touchAction = 'none';
    clone.id = 'dragClone';
    document.body.appendChild(clone);

    pieceEl.style.opacity = '0.3';

    const move = ev => moveDrag(ev, shape);
    const up = ev => endDrag(ev, shape, pieceEl, clone, move, up);

    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up, { once: true, passive: false });
	pieceEl.addEventListener('pointerdown', e => startDrag(e, shape, pieceEl), { passive: false });
	
  });
}

function moveDrag(e, shape) {
  e.preventDefault();
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

function endDrag(e, shape, pieceEl, clone, move, up) {
  e.preventDefault();
  window.removeEventListener('pointermove', move);
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
  nextPieces.shift();
  nextPieces.push(randomPiece());
  setTimeout(() => renderTray(), 300);
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
  const cells = Array.from(boardEl.children);
  const fadeDuration = 400;
  const delayStep = 35;
  let linesCleared = 0;
  const fullRows = [];
  const fullCols = [];

  // Detect full rows/columns
  for (let r = 0; r < BOARD_SIZE; r++) {
    if (board[r].every(v => v)) fullRows.push(r);
  }
  for (let c = 0; c < BOARD_SIZE; c++) {
    if (board.every(row => row[c])) fullCols.push(c);
  }
  if (!fullRows.length && !fullCols.length) return;

  linesCleared = fullRows.length + fullCols.length;
  let maxDelay = 0;

  // Sequential fade effect
  const applyFade = (r, c, delay) => {
    const idx = r * BOARD_SIZE + c;
    const cell = cells[idx];
    if (cell && cell.classList.contains('filled')) {
      cell.style.transition = `background ${fadeDuration}ms ease, opacity ${fadeDuration}ms ease`;
      setTimeout(() => {
        cell.style.background = '#444';
        cell.style.opacity = '0';
      }, delay);
    }
  };

  fullRows.forEach(r => {
    for (let c = 0; c < BOARD_SIZE; c++) {
      applyFade(r, c, (c * delayStep));
      maxDelay = Math.max(maxDelay, c * delayStep);
    }
  });

  fullCols.forEach(c => {
    for (let r = 0; r < BOARD_SIZE; r++) {
      applyFade(r, c, (r * delayStep));
      maxDelay = Math.max(maxDelay, r * delayStep);
    }
  });

  // After fades complete, update board & re-render once
  setTimeout(() => {
    fullRows.forEach(r => (board[r] = Array(BOARD_SIZE).fill(0)));
    fullCols.forEach(c => board.forEach(row => (row[c] = 0)));
    score += linesCleared * 10;
    scoreEl.textContent = score;
    renderBoard();
  }, maxDelay + fadeDuration + 100);
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
