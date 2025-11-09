// script.js
const boardEl = document.getElementById('board');
const scoreEl = document.getElementById('score');
const newGameBtn = document.getElementById('newGameBtn');
const traySlots = document.querySelectorAll('.tray-slot');

const BOARD_SIZE = 10;
let board = [];
let score = 0;

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
    slot.appendChild(renderPiece(piece));
    slot.dataset.piece = JSON.stringify(piece);
  });
}

function renderPiece(shape) {
  const pieceEl = document.createElement('div');
  pieceEl.classList.add('piece');
  const maxR = shape.length;
  const maxC = shape[0].length;
  pieceEl.style.gridTemplateColumns = `repeat(${maxC}, 48px)`;
  shape.forEach(row => {
    row.forEach(cell => {
      const block = document.createElement('div');
      if (cell) block.classList.add('block');
      pieceEl.appendChild(block);
    });
  });
  pieceEl.draggable = true;
  pieceEl.addEventListener('dragstart', handleDragStart);
  return pieceEl;
}

function handleDragStart(e) {
  const piece = e.target.parentElement.dataset.piece;
  e.dataTransfer.setData('piece', piece);
}

boardEl.addEventListener('dragover', e => e.preventDefault());
boardEl.addEventListener('drop', handleDrop);

function handleDrop(e) {
  const rect = boardEl.getBoundingClientRect();
  const cellSize = rect.width / BOARD_SIZE;
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const col = Math.floor(x / cellSize);
  const row = Math.floor(y / cellSize);
  const piece = JSON.parse(e.dataTransfer.getData('piece'));
  if (placePiece(row, col, piece)) {
    clearLines();
    generateTray();
  }
}

function placePiece(row, col, shape) {
  const rows = shape.length;
  const cols = shape[0].length;
  // check valid placement
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (shape[r][c]) {
        if (row + r >= BOARD_SIZE || col + c >= BOARD_SIZE || board[row + r][col + c]) {
          return false;
        }
      }
    }
  }
  // apply piece
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
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
