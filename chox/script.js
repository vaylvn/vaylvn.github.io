const BOARD_SIZE = 10;
const boardEl = document.getElementById("board");
const trayEl = document.getElementById("tray");
const scoreEl = document.getElementById("score");
const newGameBtn = document.getElementById("newGameBtn");

let board = [];
let tray = [];
let score = 0;
let draggedPiece = null;
let dragOffset = {x: 0, y: 0};

const SHAPES = [
  [[0,0]],                            // single
  [[0,0],[1,0],[0,1],[1,1]],          // 2x2 square
  [[0,0],[1,0],[2,0],[3,0]],          // line of 4
  [[0,0],[0,1],[1,1]],                // small L
  [[0,0],[0,1],[0,2],[1,2]],          // large L
  [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1],[0,2],[1,2],[2,2]], // 3x3 block
];

const COLORS = ["white","milk","dark"];

function initBoard() {
  board = Array.from({length: BOARD_SIZE}, () => Array(BOARD_SIZE).fill(null));
  boardEl.innerHTML = "";
  for (let y=0; y<BOARD_SIZE; y++) {
    for (let x=0; x<BOARD_SIZE; x++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.x = x;
      cell.dataset.y = y;
      boardEl.appendChild(cell);
    }
  }
}

function generateTray() {
  tray = [];
  trayEl.innerHTML = "";
  for (let i=0; i<3; i++) tray.push(generatePiece());
  renderTray();
}

function generatePiece() {
  const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  return {shape, color};
}

function renderTray() {
  for (let i = 0; i < 3; i++) {
    const slot = document.querySelector(`.tray-slot[data-slot='${i}']`);
    slot.innerHTML = "";
    const piece = tray[i];
    if (!piece) continue;

    const pieceEl = document.createElement("div");
    pieceEl.classList.add("piece");
    const width = Math.max(...piece.shape.map(p => p[0])) + 1;
    const height = Math.max(...piece.shape.map(p => p[1])) + 1;
    pieceEl.style.gridTemplateColumns = `repeat(${width}, 48px)`;
    pieceEl.style.gridTemplateRows = `repeat(${height}, 48px)`;

    const map = Array.from({length: height}, () => Array(width).fill(0));
    piece.shape.forEach(([x,y]) => map[y][x] = 1);

    for (let y=0; y<height; y++) {
      for (let x=0; x<width; x++) {
        const block = document.createElement("div");
        block.className = map[y][x] ? `block ${piece.color}` : "block empty";
        pieceEl.appendChild(block);
      }
    }

    pieceEl.draggable = true;
    pieceEl.dataset.index = i;

    pieceEl.addEventListener("dragstart", (e) => {
      draggedPiece = i;
      pieceEl.classList.add("dragging");
      const img = new Image();
      img.src = "";
      e.dataTransfer.setDragImage(img, 0, 0);
    });
    pieceEl.addEventListener("dragend", () => {
      pieceEl.classList.remove("dragging");
      draggedPiece = null;
      clearHover();
    });

    slot.appendChild(pieceEl);
  }
}







boardEl.addEventListener("dragover", (e) => {
  e.preventDefault();
  const rect = boardEl.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) / 51) - dragOffset.x;
  const y = Math.floor((e.clientY - rect.top) / 51) - dragOffset.y;

  clearHover();
  if (draggedPiece != null && isValidPlacement(tray[draggedPiece], x, y)) {
    highlightPlacement(tray[draggedPiece], x, y, true);
  } else {
    highlightPlacement(tray[draggedPiece], x, y, false);
  }
});

boardEl.addEventListener("drop", (e) => {
  e.preventDefault();
  const rect = boardEl.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) / 51) - dragOffset.x;
  const y = Math.floor((e.clientY - rect.top) / 51) - dragOffset.y;

  
  if (draggedPiece != null && isValidPlacement(tray[draggedPiece], x, y)) {
	  // Place the piece on the board
	  placePiece(tray[draggedPiece], x, y);

	  // Clear only that slot so others stay where they are
	  tray[draggedPiece] = null;
	  renderTray();

	  // When all three are gone, refill the tray in the same layout
	  if (tray.every(p => !p)) {
		tray = Array.from({ length: 3 }, () => generatePiece());
		renderTray();
	  }
	}
	  
  
  clearHover();
  draggedPiece = null;
});

function isValidPlacement(piece, baseX, baseY) {
  if (!piece) return false;
  return piece.shape.every(([dx,dy]) => {
    const x = baseX + dx, y = baseY + dy;
    return x >= 0 && y >= 0 && x < BOARD_SIZE && y < BOARD_SIZE && !board[y][x];
  });
}

function placePiece(piece, baseX, baseY) {
  piece.shape.forEach(([dx,dy]) => {
    const x = baseX + dx, y = baseY + dy;
    board[y][x] = piece.color;
  });
  renderBoard();
  score += piece.shape.length;
  clearLines();
  updateScore();
  checkGameOver();
}

function clearLines() {
  let toClear = [];

  // Rows
  for (let y = 0; y < BOARD_SIZE; y++) {
    if (board[y].every(Boolean)) {
      for (let x = 0; x < BOARD_SIZE; x++) toClear.push({ x, y });
    }
  }
  // Columns
  for (let x = 0; x < BOARD_SIZE; x++) {
    if (board.every(row => row[x])) {
      for (let y = 0; y < BOARD_SIZE; y++) toClear.push({ x, y });
    }
  }

  if (toClear.length === 0) return;

  // Apply animation classes
  toClear.forEach((cell, i) => {
    const el = document.querySelector(`.cell[data-x='${cell.x}'][data-y='${cell.y}']`);
    if (el) {
      el.style.transitionDelay = `${i * 25}ms`; // stagger delay
      el.classList.add("fade-out");
    }
  });

  // After animation ends, actually clear data and refresh
  setTimeout(() => {
    toClear.forEach(({x, y}) => board[y][x] = null);
    renderBoard();
    score += toClear.length + (toClear.length / BOARD_SIZE) * 10; // add bonus
    updateScore();
  }, 600); // slightly longer than total fade
}



function renderBoard() {
  for (const cell of boardEl.children) {
    const x = +cell.dataset.x, y = +cell.dataset.y;
    const color = board[y][x];
    cell.className = "cell";
    if (color) cell.classList.add(color);
  }
}

function updateScore() {
  scoreEl.textContent = score;
}

function clearHover() {
  document.querySelectorAll(".valid-hover,.invalid-hover").forEach(el => el.classList.remove("valid-hover","invalid-hover"));
}

function highlightPlacement(piece, baseX, baseY, valid) {
  if (!piece) return;
  piece.shape.forEach(([dx,dy]) => {
    const x = baseX + dx, y = baseY + dy;
    const cell = document.querySelector(`.cell[data-x='${x}'][data-y='${y}']`);
    if (cell) cell.classList.add(valid ? "valid-hover" : "invalid-hover");
  });
}

function checkGameOver() {
  const canMove = tray.some(piece => {
    for (let y=0; y<BOARD_SIZE; y++) {
      for (let x=0; x<BOARD_SIZE; x++) {
        if (isValidPlacement(piece, x, y)) return true;
      }
    }
    return false;
  });
  if (!canMove) {
    alert(`Game Over! Final Score: ${score}`);
    startNewGame();
  }
}

function startNewGame() {
  score = 0;
  updateScore();
  initBoard();
  tray = Array.from({length: 3}, () => generatePiece());
  renderTray();
}

// --- STARTUP ---
newGameBtn.addEventListener("click", startNewGame);

// Initialize once DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  startNewGame();   // sets up board + generates tray
  renderTray();     // <- ensure tray actually draws pieces
});
