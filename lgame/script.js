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


// Global phase control
let selectedNeutral = null;


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
      cell.className = "cell";

      if (board[y][x] === PLAYER) cell.classList.add("player");
      if (board[y][x] === CPU) cell.classList.add("cpu");
      if (board[y][x] === TOKEN) cell.classList.add("token");
    }
  }

  highlightActiveL();
}

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
    return;
  }

  // Step 2: move token
  if (selectedNeutral && value === EMPTY) {
    board[selectedNeutral.y][selectedNeutral.x] = EMPTY;
    board[y][x] = TOKEN;
    drawBoard();
    selectedNeutral = null;
    clearNeutralHighlights();
    showSkipButton(false);
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
  showSkipButton(true);
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
  boardEl.classList.add("shake");
  setTimeout(() => boardEl.classList.remove("shake"), 300);
}



function isValidL(path) {
  if (path.length !== 4) return false;

  // All coordinates unique
  const coords = path.map(p => `${p.x},${p.y}`);
  if (new Set(coords).size !== 4) return false;

  // Determine bounding box
  const xs = path.map(p => p.x);
  const ys = path.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;

  // Must form 2×3 or 3×2 rectangle
  if (!((width === 3 && height === 2) || (width === 2 && height === 3))) return false;

  // Count how many of the 6 cells in bounding box are occupied
  const occupied = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (path.find(p => p.x === x && p.y === y)) occupied.push({x,y});
    }
  }

  // An L means exactly one of the 6 is empty
  if (occupied.length !== 4) return false; // sanity
  return (width * height - occupied.length) === 2; // should leave 2 empties (diagonal)
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




















// ---------------- Helpers ----------------
function addToPath(el) {
  const x = parseInt(el.dataset.x);
  const y = parseInt(el.dataset.y);
  const already = path.find(p => p.x === x && p.y === y);
  if (already) return;
  path.push({ x, y });
  el.classList.add("preview");
}


function highlightActiveL() {
  if (turn === "player") {
    boardEl.style.boxShadow = "0 0 20px 4px rgba(0, 255, 255, 0.8)";
    boardEl.style.borderColor = "transparent";
  } else {
    boardEl.style.boxShadow = "0 0 20px 4px rgba(255, 80, 80, 0.8)";
    boardEl.style.borderColor = "transparent";
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



const skipBtn = document.getElementById("skipBtn");
skipBtn.addEventListener("click", skipNeutralMove);

function showSkipButton(show) {
  skipBtn.style.display = show ? "inline-block" : "none";
}

function skipNeutralMove() {
  console.log("Neutral move skipped.");
  showSkipButton(false);
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
  if (status) status.textContent = `CPU thinking...`;

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
      if (status) status.textContent = "Your turn!";
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
  const status = document.getElementById("status");
  status.textContent = winner === PLAYER ? "You win!" : "CPU wins!";
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

  const positions = [];
  const opponent = (who === PLAYER) ? CPU : PLAYER;

  // Collect the coordinates of this player's current L
  const currentL = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (board[y][x] === who) currentL.push(`${x},${y}`);
    }
  }

  for (let yOff = 0; yOff < SIZE; yOff++) {
    for (let xOff = 0; xOff < SIZE; xOff++) {
      for (const shape of shapes) {
        const coords = shape.map(p => ({x: p.x + xOff, y: p.y + yOff}));
        if (coords.every(p => p.x >= 0 && p.y >= 0 && p.x < SIZE && p.y < SIZE)) {
          if (isLegalPlacement(board, coords, opponent)) {
            // skip placements identical to current
            const keyset = coords.map(p => `${p.x},${p.y}`);
            const same =
              keyset.length === currentL.length &&
              keyset.every(k => currentL.includes(k));
            if (!same) positions.push(coords);
          }
        }
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

  drawBoard();
}


resetGame();