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

let audioEnabled = true;

const SHAPES = [
  [[0,0]],                            // single
  [[0,0],[1,0],[0,1],[1,1]],          // 2x2 square
  [[0,0],[1,0],[2,0],[3,0]],          // line of 4
  [[0,0],[0,1],[1,1]],                // small L
  [[0,0],[1,0],[0,1]],                // small L
  [[1,0],[0,1],[1,1]],                // small L
  [[0,0],[0,1],[0,2],[1,2]],          // large L
  [[0,0],[0,1],[0,2],[1,2],[2,2]],          // large L
  [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1],[0,2],[1,2],[2,2]], // 3x3 block
];

const COLORS = ["white","milk","dark"];








function playSound(name, { volume = 0.3, rate = 1.0 } = {}) {
  if (!audioEnabled || !sounds[name]) return;

  const source = audioCtx.createBufferSource();
  const gain = audioCtx.createGain();
  source.buffer = sounds[name];
  source.playbackRate.value = rate;
  gain.gain.value = volume;
  source.connect(gain).connect(audioCtx.destination);
  source.start(0);
}

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const sounds = {};

async function loadSound(name, url) {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  sounds[name] = await audioCtx.decodeAudioData(arrayBuffer);
}

async function loadAllSounds() {
  await Promise.all([
    loadSound("click", "https://raw.githubusercontent.com/vaylvn/vaylvn.github.io/refs/heads/main/lgame/assets/audio/click2.mp3"),
	loadSound("click2", "https://raw.githubusercontent.com/vaylvn/vaylvn.github.io/refs/heads/main/lgame/assets/audio/click.mp3")
  ]);
  console.log("Sounds ready");
}















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
	  e.dataTransfer.effectAllowed = "move"; // match 'dropEffect'

	  const img = new Image();
	  img.src = "";                          // hide ghost thumbnail
	  e.dataTransfer.setDragImage(img, 0, 0);
	});


	pieceEl.addEventListener("dragend", () => {
	  pieceEl.classList.remove("dragging");
	  document.documentElement.classList.remove("dragging-cursor"); // <—
	});

		// --- touch support ---
	pieceEl.addEventListener('touchstart', (e) => {
	  draggedPiece = i;
	  pieceEl.classList.add('dragging');
	  const touch = e.touches[0];
	  dragOffset.x = 0;
	  dragOffset.y = 0; // optional offset logic later
	});
	
	pieceEl.addEventListener('touchmove', (e) => {
	  e.preventDefault();
	  const touch = e.touches[0];
	  const rect = boardEl.getBoundingClientRect();
	  const x = Math.floor((touch.clientX - rect.left) / 51);
	  const y = Math.floor((touch.clientY - rect.top) / 51);
	  clearHover();
	  if (draggedPiece != null && isValidPlacement(tray[draggedPiece], x, y)) {
		highlightPlacement(tray[draggedPiece], x, y, true);
	  } else {
		highlightPlacement(tray[draggedPiece], x, y, false);
	  }
	});

	pieceEl.addEventListener('touchend', (e) => {
	  const touch = e.changedTouches[0];
	  const rect = boardEl.getBoundingClientRect();
	  const x = Math.floor((touch.clientX - rect.left) / 51);
	  const y = Math.floor((touch.clientY - rect.top) / 51);
	  if (draggedPiece != null && isValidPlacement(tray[draggedPiece], x, y)) {
		placePiece(tray[draggedPiece], x, y);
		tray[draggedPiece] = null;
		renderTray();
		if (tray.every(p => !p)) {
		  tray = Array.from({ length: 3 }, () => generatePiece());
		  renderTray();
		}
	  }
	  clearHover();
	  pieceEl.classList.remove('dragging');
	  draggedPiece = null;
	});

    slot.appendChild(pieceEl);
  }
}



// Disable page scroll while interacting with the board or tray
['touchmove'].forEach(evt => {
  document.addEventListener(evt, e => {
    if (e.target.closest('#board') || e.target.closest('#tray')) {
      e.preventDefault();
    }
  }, { passive: false });
});












boardEl.addEventListener("dragover", (e) => {
  const now = performance.now();

  e.preventDefault();
	e.dataTransfer.dropEffect = "move";
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
	
	
  const variance = Math.floor(Math.random() * 4);
  playSound("click", { volume: 1.0, rate: 0.8 + (0.05 * variance) });
	
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
  const fullRows = [];
  const fullCols = [];

  // --- find all full rows ---
  for (let y = 0; y < BOARD_SIZE; y++) {
    if (board[y].every(Boolean)) fullRows.push(y);
  }

  // --- find all full columns ---
  for (let x = 0; x < BOARD_SIZE; x++) {
    if (board.every(row => row[x])) fullCols.push(x);
  }

  // --- no clears? exit early ---
  if (fullRows.length === 0 && fullCols.length === 0) return;

  
  for (let i = 0; i < 10; i++) {
	  setTimeout(() => {
		playSound("click2", { volume: 1.0, rate: 0.8 + (0.05 * i) });
	  }, 40 * i);
  }

  // --- build fade map to avoid double-animating overlaps ---
  const fadeMap = new Map();

  // Rows: fade left → right
  fullRows.forEach(y => {
    for (let x = 0; x < BOARD_SIZE; x++) {
      fadeMap.set(`${x},${y}`, { x, y, delay: x * 25 });
    }
  });

  // Columns: fade top → bottom (merge with any existing row cells)
  fullCols.forEach(x => {
    for (let y = 0; y < BOARD_SIZE; y++) {
      const key = `${x},${y}`;
      const prev = fadeMap.get(key);
      const delay = Math.min(y * 25, prev?.delay ?? Infinity);
      fadeMap.set(key, { x, y, delay });
    }
  });

  // --- trigger fade animations ---
  fadeMap.forEach(({ x, y, delay }) => {
    const el = document.querySelector(`.cell[data-x='${x}'][data-y='${y}']`);
    if (el) {
      el.style.transitionDelay = `${delay}ms`;
      el.classList.add("fade-out");
    }
  });

  // --- after fades finish, clear those tiles ---
  setTimeout(() => {
    fadeMap.forEach(({ x, y }) => (board[y][x] = null));
    renderBoard();

    const linesCleared = fullRows.length + fullCols.length;
    score += linesCleared * 10;
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




loadAllSounds();

// Initialize once DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  startNewGame();   // sets up board + generates tray
  renderTray();     // <- ensure tray actually draws pieces
});
