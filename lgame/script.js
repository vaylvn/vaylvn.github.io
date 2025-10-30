const SIZE = 4;
const EMPTY = 0, PLAYER = 1, CPU = 2, TOKEN = 3;
let board = createEmptyBoard();

let dragging = false;
let path = [];
const boardEl = document.getElementById("board");
const cells = [];

let turn = "player";
let gamePhase = "moveL"; // "moveL", "moveNeutral", or "cpuTurn"
let difficulty = "easy";  // "easy", "medium", "hard"
let gameOver = false;

let audioEnabled = true;

// Global phase control
let selectedNeutral = null;

const skipBtn = document.getElementById("skipBtn");
skipBtn.addEventListener("click", skipNeutralMove);
skipBtn.disabled = true;


const restartBtn = document.getElementById("restartBtn");
restartBtn.addEventListener("click", resetGameButton);


const easyBtn = document.getElementById("easyBtn");
easyBtn.addEventListener("click", () => setDifficulty("easy"));
const mediumBtn = document.getElementById("mediumBtn");
mediumBtn.addEventListener("click", () => setDifficulty("medium"));
const hardBtn = document.getElementById("hardBtn");
hardBtn.addEventListener("click", () => setDifficulty("hard"));



function resetGameButton() {
	playSound("click", { volume: 0.5, rate: 1.0 });
	resetGame();
}



function setDifficulty(dif) {
	
	
	playSound("click", { volume: 0.5, rate: 1.0 });

	
	console.log(dif);
	
	difficulty = dif;
	resetGame();
	
	
	easyBtn.style.boxShadow = (dif === "easy") ? `inset 0 0 0 2px white` : `inset 0 0 0 2px transparent`;
	mediumBtn.style.boxShadow = (dif === "medium") ? `inset 0 0 0 2px white` : `inset 0 0 0 2px transparent`;
	hardBtn.style.boxShadow = (dif === "hard") ? `inset 0 0 0 2px white` : `inset 0 0 0 2px transparent`;
	
	easyBtn.disabled = (dif === "easy");
	mediumBtn.disabled = (dif === "medium");
	hardBtn.disabled = (dif === "hard");
	
}



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
    loadSound("boop", "https://raw.githubusercontent.com/vaylvn/vaylvn.github.io/refs/heads/main/lgame/assets/audio/boop.mp3"),
    loadSound("click", "https://raw.githubusercontent.com/vaylvn/vaylvn.github.io/refs/heads/main/lgame/assets/audio/click.mp3"),
	loadSound("click2", "https://raw.githubusercontent.com/vaylvn/vaylvn.github.io/refs/heads/main/lgame/assets/audio/click2.mp3"),
	loadSound("endgame", "https://raw.githubusercontent.com/vaylvn/vaylvn.github.io/refs/heads/main/lgame/assets/audio/endgame.mp3"),
	loadSound("shake", "https://raw.githubusercontent.com/vaylvn/vaylvn.github.io/refs/heads/main/lgame/assets/audio/shake.mp3"),
  ]);
  console.log("Sounds ready");
}





const audioBtn = document.getElementById("audioBtn");
audioBtn.addEventListener("click", toggleAudio);


function toggleAudio() {
  audioEnabled = !audioEnabled;
  const img = audioEnabled
    ? "https://raw.githubusercontent.com/vaylvn/vaylvn.github.io/refs/heads/main/lgame/assets/audioon.png"
    : "https://raw.githubusercontent.com/vaylvn/vaylvn.github.io/refs/heads/main/lgame/assets/audiooff.png";

  audioBtn.style.background = `url("${img}") center/70% no-repeat`;
  audioBtn.style.backgroundColor = `rgba(34, 34, 34, 1.0)`;
  
  if (audioEnabled) playSound("click", { volume: 0.5, rate: 1.0 });
 
  
}



// Build grid
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.dataset.x = x;
    cell.dataset.y = y;
    boardEl.appendChild(cell);
    cells.push(cell);
  }
}

boardEl.addEventListener("mousedown", startDrag);
boardEl.addEventListener("touchstart", startDrag);
boardEl.addEventListener("mousemove", continueDrag);
boardEl.addEventListener("touchmove", continueDrag);
document.addEventListener("mouseup", endDrag);
document.addEventListener("touchend", endDrag);

// --------------------------------
function createEmptyBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
}
function getCell(x, y) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return null;
  return cells[y * SIZE + x];
}
function clearPreview() {
  for (const c of cells) c.classList.remove("preview");
  path = [];
}


function drawBoard() {
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const cell = getCell(x, y);
      cell.className = "cell"; // reset base class

      const value = board[y][x];
      if (value === PLAYER || value === CPU) {
        const cls = value === PLAYER ? "player" : "cpu";
        cell.classList.add(cls);

        // neighbour check — find which sides have same owner
        const n = {
          top:    y > 0 && board[y - 1][x] === value,
          bottom: y < SIZE - 1 && board[y + 1][x] === value,
          left:   x > 0 && board[y][x - 1] === value,
          right:  x < SIZE - 1 && board[y][x + 1] === value,
        };

        // round only *outer* corners
        if (!n.top && !n.left) cell.classList.add("round-tl");
        if (!n.top && !n.right) cell.classList.add("round-tr");
        if (!n.bottom && !n.left) cell.classList.add("round-bl");
        if (!n.bottom && !n.right) cell.classList.add("round-br");
      }

      if (value === TOKEN) cell.classList.add("token");
    }
  }

  highlightActiveL();
}














const canvas = document.getElementById("bg");
const ctx = canvas.getContext("2d");
let w, h;
function resize() {
  w = canvas.width = innerWidth;
  h = canvas.height = innerHeight;
}
window.addEventListener("resize", resize);
resize();

// Subtle floating particles
const particles = Array.from({ length: 40 }, () => ({
  x: Math.random() * w,
  y: Math.random() * h,
  r: Math.random() * 1.2 + 0.4,
  dx: (Math.random() - 0.5) * 0.05,
  dy: (Math.random() - 0.5) * 0.05,
  a: Math.random() * Math.PI * 2,
  s: Math.random() * 0.001 + 0.0005, // slow spin rate
}));

function draw() {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  for (const p of particles) {
    // gentle orbit
    p.a += p.s;
    p.x += Math.cos(p.a) * 0.1 + p.dx;
    p.y += Math.sin(p.a) * 0.1 + p.dy;
    if (p.x < -5) p.x = w + 5;
    if (p.x > w + 5) p.x = -5;
    if (p.y < -5) p.y = h + 5;
    if (p.y > h + 5) p.y = -5;

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, 2 * Math.PI);
    ctx.fill();
  }
  requestAnimationFrame(draw);
}
draw();


















// ---------------- Drag Logic ----------------


// ----------------------------
// L-PIECE MOVEMENT HANDLERS
// ----------------------------
function startDrag(e) {
  if (gameOver) return;
  if (gamePhase !== "moveL") return; // <- important gate
  e.preventDefault();
  const point = e.touches ? e.touches[0] : e;
  const el = document.elementFromPoint(point.clientX, point.clientY);
  if (!el || !el.dataset.x) return;
  clearPreview();
  dragging = true;
  addToPath(el);
}

// (continueDrag / endDrag also gated by `gamePhase === "moveL"`)

// ----------------------------
// NEUTRAL-PIECE HANDLERS
// ----------------------------
boardEl.addEventListener("click", e => {
  if (gamePhase !== "moveNeutral") return; // only active after valid L move

  const target = e.target.closest(".cell");
  if (!target) return;

  const x = parseInt(target.dataset.x);
  const y = parseInt(target.dataset.y);
  const value = board[y][x];

  // Step 1: select token
  if (value === TOKEN) {
    selectedNeutral = { x, y };
    clearNeutralHighlights();
    target.classList.add("selected-neutral");
    console.log("Selected neutral:", selectedNeutral);
	
	playSound("click2", { volume: 0.5, rate: 1.5 });
	
    return;
  }

  // Step 2: move token
  if (selectedNeutral && value === EMPTY) {
	  
	playSound("click2", { volume: 0.5, rate: 1.3 });
	  
    board[selectedNeutral.y][selectedNeutral.x] = EMPTY;
    board[y][x] = TOKEN;
    drawBoard();
    selectedNeutral = null;
    clearNeutralHighlights();
    allowSkipButton(false);
    endPlayerTurn();
  }
});



function continueDrag(e) {
  e.preventDefault();
  if (!dragging) return;
  const point = e.touches ? e.touches[0] : e;
  const el = document.elementFromPoint(point.clientX, point.clientY);
  if (!el || !el.dataset.x) return;
  addToPath(el);
}

function endDrag() {

  if (!dragging) return;
  dragging = false;

	dragStep = 0;

  if (isValidL(path) && isPathClear(path)) {
    console.log("%cVALID MOVE", "color: lime;");
    commitMove(path);
  } else {
    console.log("%cINVALID MOVE", "color: red;");
    shakeBoard();
  }


  clearPreview();
}


function commitMove(path) {
  // get current L coordinates before clearing
  const oldCells = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (board[y][x] === PLAYER) oldCells.push(`${x},${y}`);
    }
  }

  // if the new path is identical, reject
  const newCells = path.map(p => `${p.x},${p.y}`);
  const same =
    newCells.length === oldCells.length &&
    newCells.every(c => oldCells.includes(c));

  if (same) {
    console.log("%cINVALID: same position (no move)", "color:red;");
    shakeBoard();
    return;
  }

  // proceed normally
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (board[y][x] === PLAYER) board[y][x] = EMPTY;
    }
  }
  for (const p of path) board[p.y][p.x] = PLAYER;

  drawBoard();
  gamePhase = "moveNeutral";
  highlightNeutrals();
  allowSkipButton(true);
}



function highlightNeutrals() {
  const cells = boardEl.querySelectorAll(".cell");
  cells.forEach(cell => {
    const x = parseInt(cell.dataset.x);
    const y = parseInt(cell.dataset.y);
    if (board[y][x] === TOKEN) cell.classList.add("highlight-neutral");
  });
}



function shakeBoard() {
	
	playSound("shake", { volume: 0.5, rate: 1.0 });
	
  boardEl.classList.add("shake");
  setTimeout(() => boardEl.classList.remove("shake"), 300);
}



function isValidL(path) {
  if (path.length !== 4) return false;

  // Normalise: shift so the smallest x/y becomes (0,0)
  const minX = Math.min(...path.map(p => p.x));
  const minY = Math.min(...path.map(p => p.y));
  const norm = path.map(p => ({ x: p.x - minX, y: p.y - minY }));

  // Define all 8 legal L shapes relative to (0,0)
  const validShapes = [
    // --- wide ---
    [{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:0,y:1}], // ┘
    [{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:2,y:1}], // └
    [{x:0,y:1},{x:1,y:1},{x:2,y:1},{x:0,y:0}], // ┐
    [{x:0,y:1},{x:1,y:1},{x:2,y:1},{x:2,y:0}], // ┌
    // --- tall ---
    [{x:0,y:0},{x:0,y:1},{x:0,y:2},{x:1,y:0}], // ⎾
    [{x:1,y:0},{x:1,y:1},{x:1,y:2},{x:0,y:0}], // ⏌
    [{x:0,y:0},{x:0,y:1},{x:0,y:2},{x:1,y:2}], // ⎿
    [{x:1,y:0},{x:1,y:1},{x:1,y:2},{x:0,y:2}], // ⏋
  ];

  // Compare ignoring order
  return validShapes.some(shape =>
    shape.every(p => norm.some(c => c.x === p.x && c.y === p.y))
  );
}












function getDepthForDifficulty() {
  switch (difficulty) {
    case "easy":   return 1;  // shallow, almost random
    case "medium": return 2;  // balanced
    case "hard":   return 3;  // deep, strong
    default:       return 2;
  }
}

// optional: slight randomness for lower levels
function maybeAddRandomness(score) {
  if (difficulty === "easy") return score + (Math.random() * 4 - 2);
  if (difficulty === "medium") return score + (Math.random() * 2 - 1);
  return score;
}

















let dragStep = 0;




// ---------------- Helpers ----------------
function addToPath(el) {
  const x = parseInt(el.dataset.x);
  const y = parseInt(el.dataset.y);
  const already = path.find(p => p.x === x && p.y === y);
  if (already) return;

  path.push({ x, y });
  el.classList.add("preview");

  // 🔊 play faint "bloop" when adding a new tile
  dragStep++;
  const pitch = 1.0 + dragStep * 0.07; // gentle pitch ramp per tile
  playSound("click", { volume: 0.5, rate: pitch });
}


function highlightActiveL() {
  if (turn === "player") {
    boardEl.style.boxShadow = "0 0 100px 4px rgba(0, 255, 255, 0.2)";
    // boardEl.style.borderColor = "transparent";
  } else {
    boardEl.style.boxShadow = "0 0 100px 4px rgba(255, 80, 80, 0.2)";
    // boardEl.style.borderColor = "transparent";
  }
}

function isPathClear(path) {
  // Get coordinates of current player's L
  const playerCells = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (board[y][x] === PLAYER) playerCells.push(`${x},${y}`);
    }
  }

  for (const p of path) {
    if (p.x < 0 || p.y < 0 || p.x >= SIZE || p.y >= SIZE) return false;

    const cellValue = board[p.y][p.x];
    const coord = `${p.x},${p.y}`;

    // ignore cells currently part of the player's own L
    if (cellValue !== EMPTY && !playerCells.includes(coord)) {
      return false;
    }
  }
  return true;
}





function allowSkipButton(allow) {
  skipBtn.disabled = !allow;
}

function skipNeutralMove() {
  playSound("click", { volume: 0.5, rate: 1.0 });
  console.log("Neutral move skipped.");
  allowSkipButton(false);
  clearNeutralHighlights();
  endPlayerTurn();
}

function clearNeutralHighlights() {
  const cells = boardEl.querySelectorAll(".cell");
  cells.forEach(cell => {
    cell.classList.remove("highlight-neutral", "selected-neutral");
  });
}



function endPlayerTurn() {
  console.log("Player turn complete → CPU turn begins...");
  gamePhase = "cpuTurn";
  turn = "cpu";
  drawBoard();

  // give a small delay so it looks like the CPU is 'thinking'
  setTimeout(() => {
    cpuTurn();
  }, 400);
}



async function cpuTurn() {
  const status = document.getElementById("status");
  if (status) status.textContent = "CPU THINKING...";

  // ✅ Let browser paint this change before freezing thread
  await new Promise(requestAnimationFrame);

  const thinkTime = difficulty === "easy" ? 300 : difficulty === "medium" ? 1000 : 2000;
  const depth = getDepthForDifficulty();
  const { bestMove } = minimax(board, depth, -Infinity, Infinity, true);

  if (!bestMove) {
    declareWinner(PLAYER);
    return;
  }

  // Highlight CPU's planned L
  // highlightCpuMove(bestMove.shape);

  setTimeout(() => {
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++)
        if (board[y][x] === CPU) board[y][x] = EMPTY;

    for (const p of bestMove.shape) board[p.y][p.x] = CPU;
    drawBoard();

    setTimeout(() => {
      if (bestMove.neutral) {
        const { from, to } = bestMove.neutral;
        if (board[to.y][to.x] === EMPTY) {
          board[from.y][from.x] = EMPTY;
          board[to.y][to.x] = TOKEN;
        }
      }
      drawBoard();

      const playerMoves = generateAllLPositions(board, PLAYER);
      if (playerMoves.length === 0) {
        declareWinner(CPU);
        return;
      }

      turn = "player";
      gamePhase = "moveL";
      if (status) status.textContent = "YOUR TURN";
      drawBoard();
    }, 500);
  }, thinkTime);
}



function highlightCpuMove(shape) {
  for (const {x, y} of shape) {
    const cell = getCell(x, y);
    if (cell) cell.classList.add("cpu-preview");
  }
  setTimeout(() => {
    document.querySelectorAll(".cpu-preview")
      .forEach(c => c.classList.remove("cpu-preview"));
  }, 600);
}



function declareWinner(winner) {
  gameOver = true;
  gamePhase = "ended";
  
  
  if (winner === PLAYER) {
	  playSound("endgame", { volume: 0.5, rate: 1.3 });
  } else {
	  playSound("endgame", { volume: 0.5, rate: 0.3 });
  }
  
  const status = document.getElementById("status");
  
	
	status.style.opacity = 0;
	
  const msg = document.getElementById("winMessage");
  const boardEl = document.getElementById("board");

	

  msg.textContent = winner === PLAYER ? "YOU WIN" : "CPU WINS";
  msg.style.opacity = 1;          // show message
  boardEl.classList.add("fade-out"); // fade out board

  // after fade, reset board invisibly
  setTimeout(() => {
    resetGame(); // your existing reset logic
    msg.style.opacity = 0;        // hide text
  }, 2000);

  // fade board back in a bit later
  setTimeout(() => {
    boardEl.classList.remove("fade-out");
  }, 4000);
}





// ---------------------------------------------------------
// MINIMAX AI ENGINE
// ---------------------------------------------------------
function minimax(board, depth, alpha, beta, isCpuTurn) {
  // stop if we've hit max depth or the game is over
  if (depth === 0 || isGameOver(board)) {
    return { score: evaluateBoard(board) };
  }

  const who = isCpuTurn ? CPU : PLAYER;
  const moves = generateAllLegalMoves(board, who);

  if (moves.length === 0) {
    // No legal moves = loss for this side
    return { score: isCpuTurn ? -100 : 100 };
  }

  let bestMove = null;

  if (isCpuTurn) {
    let maxEval = -Infinity;
    for (const move of moves) {
      const newBoard = applyMove(cloneBoard(board), move, who);
      const { score } = minimax(newBoard, depth - 1, alpha, beta, false);
      const adjusted = maybeAddRandomness(score);
      if (adjusted > maxEval) {
        maxEval = adjusted;
        bestMove = move;
      }
      alpha = Math.max(alpha, adjusted);
      if (beta <= alpha) break; // α-β pruning
    }
	
	
	if (difficulty === "easy" && Math.random() < 0.7) {
		bestMove = moves[Math.floor(Math.random() * moves.length)];
    } else if (difficulty === "medium" && Math.random() < 0.4) {
		bestMove = moves[Math.floor(Math.random() * moves.length)];
	} else if (difficulty === "hard" && Math.random() < 0.2) {
		bestMove = moves[Math.floor(Math.random() * moves.length)];
	}
	
    return { score: maxEval, bestMove };
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      const newBoard = applyMove(cloneBoard(board), move, who);
      const { score } = minimax(newBoard, depth - 1, alpha, beta, true);
      const adjusted = maybeAddRandomness(score);
      if (adjusted < minEval) {
        minEval = adjusted;
        bestMove = move;
      }
      beta = Math.min(beta, adjusted);
      if (beta <= alpha) break;
    }
	
	if (!bestMove && moves.length > 0) {
	  bestMove = moves[Math.floor(Math.random() * moves.length)];
	}
		
    return { score: minEval, bestMove };
  }
}













function cloneBoard(board) {
  return board.map(row => [...row]);
}

function isGameOver(board) {
  // game ends when the current player cannot make a legal L move
  const playerMoves = generateAllLPositions(board, PLAYER);
  const cpuMoves = generateAllLPositions(board, CPU);
  return playerMoves.length === 0 || cpuMoves.length === 0;
}

function applyMove(board, move, who) {
  // remove old L
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (board[y][x] === who) board[y][x] = EMPTY;
    }
  }
  // place new L
  for (const p of move.shape) board[p.y][p.x] = who;
  // move neutral if defined
  if (move.neutral) {
    const { from, to } = move.neutral;
    board[from.y][from.x] = EMPTY;
    board[to.y][to.x] = TOKEN;
  }
  return board;
}

function evaluateBoard(board) {
  // very simple heuristic: mobility difference
  const cpuMoves = generateAllLPositions(board, CPU).length;
  const playerMoves = generateAllLPositions(board, PLAYER).length;
  return cpuMoves - playerMoves;
}











function generateAllLPositions(board, who) {
  const shapes = [
    // Wide
    [{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:0,y:1}],
    [{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:2,y:1}],
    [{x:0,y:1},{x:1,y:1},{x:2,y:1},{x:0,y:0}],
    [{x:0,y:1},{x:1,y:1},{x:2,y:1},{x:2,y:0}],
    // Tall
    [{x:0,y:0},{x:0,y:1},{x:0,y:2},{x:1,y:0}],
    [{x:1,y:0},{x:1,y:1},{x:1,y:2},{x:0,y:0}],
    [{x:0,y:0},{x:0,y:1},{x:0,y:2},{x:1,y:2}],
    [{x:1,y:0},{x:1,y:1},{x:1,y:2},{x:0,y:2}],
  ];

  const opponent = who === PLAYER ? CPU : PLAYER;

  // record current L as array of {x, y}
  const currentL = [];
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++)
      if (board[y][x] === who) currentL.push({x, y});

  // clone and clear the player's L
  const tempBoard = board.map(r => [...r]);
  for (const {x, y} of currentL) tempBoard[y][x] = EMPTY;

  const positions = [];

  for (let yOff = 0; yOff < SIZE; yOff++) {
    for (let xOff = 0; xOff < SIZE; xOff++) {
      for (const shape of shapes) {
        const coords = shape.map(p => ({x: p.x + xOff, y: p.y + yOff}));

        // inside bounds?
        if (!coords.every(p => p.x >= 0 && p.y >= 0 && p.x < SIZE && p.y < SIZE))
          continue;

        // legal placement?
        if (!isLegalPlacement(tempBoard, coords, opponent)) continue;

        // skip *exactly* identical shape, not partial overlap
        const same =
          coords.length === currentL.length &&
          coords.every(a => currentL.some(b => b.x === a.x && b.y === a.y));

        if (!same) positions.push(coords);
      }
    }
  }

  return positions;
}







function isLegalPlacement(board, coords, opponent) {
  for (const {x, y} of coords) {
    if (board[y][x] === opponent || board[y][x] === TOKEN) return false;
  }
  return true;
}

function generateAllLegalMoves(board, who) {
  const allMoves = [];
  const Lpositions = generateAllLPositions(board, who);
  const neutralMoves = generateNeutralMoves(board);

  for (const shape of Lpositions) {
    // Option 1: don’t move any neutral
    allMoves.push({ shape, neutral: null });

    // Option 2: move one neutral
    for (const nm of neutralMoves) {
      allMoves.push({ shape, neutral: nm });
    }
  }
  return allMoves;
}

function generateNeutralMoves(board) {
  const moves = [];
  const tokens = [];

  // find all token coordinates
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (board[y][x] === TOKEN) tokens.push({x, y});
    }
  }

  // each token can move to any empty cell
  for (const from of tokens) {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (board[y][x] === EMPTY) {
          moves.push({ from, to: {x, y} });
        }
      }
    }
  }

  // include “don’t move any token” as implicit null handled above
  return moves;
}




















function resetGame() {

	const status = document.getElementById("status");
	status.textContent = "YOUR TURN";
	

  board = createEmptyBoard();

  // Player L (bottom-left facing upward-right)
  const playerCells = [
    {x:0, y:1}, {x:1, y:1}, {x:2, y:1}, {x:0, y:2}
  ];

  // CPU L (top-right facing downward-left)
  const cpuCells = [
    {x:1, y:2}, {x:2, y:2}, {x:3, y:2}, {x:3, y:1}
  ];

  // Neutral tokens (top-right & bottom-left corners)
  const neutralPieces = [
    {x:3, y:0}, {x:0, y:3}
  ];

  // Apply to board
  playerCells.forEach(p => board[p.y][p.x] = PLAYER);
  cpuCells.forEach(p => board[p.y][p.x] = CPU);
  neutralPieces.forEach(p => board[p.y][p.x] = TOKEN);

	turn = "player";
		gamePhase = "moveL";
		gameOver = false;

  drawBoard();


	setTimeout(() => {
		status.style.opacity = 1;
		
	  }, 3000);


}




easyBtn.style.boxShadow = `inset 0 0 0 2px white`;
mediumBtn.style.boxShadow = `inset 0 0 0 2px transparent`;
hardBtn.style.boxShadow = `inset 0 0 0 2px transparent`;

easyBtn.disabled = true;
mediumBtn.disabled = false;
hardBtn.disabled = false;



loadAllSounds();

resetGame();