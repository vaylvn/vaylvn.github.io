const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

resize();
window.addEventListener("resize", resize);


let WORDS = [];
let WORDS_BY_LETTER = {};

fetch("words.json")
  .then(r => r.json())
  .then(list => {
    WORDS = list;

    for (const entry of WORDS) {
      const word = entry.word;
      for (const char of new Set(word)) {
        (WORDS_BY_LETTER[char] ??= []).push(entry);
      }
    }
	
	placeWord(
      WORDS[Math.floor(Math.random() * WORDS.length)],
      0,
      0,
      "right"
    );

    console.log(`Loaded ${WORDS.length} words with clues`);
  });



function isOccupied(x, y) {
  return grid.has(key(x, y));
}

function hasAdjacent(x, y, ignoreKey) {
  const dirs = [
    [1,0], [-1,0], [0,1], [0,-1]
  ];

  for (const [dx, dy] of dirs) {
    const k = key(x + dx, y + dy);
    if (k !== ignoreKey && grid.has(k)) return true;
  }
  return false;
}

function generateNextWord(prevWord) {
  const attempts = 50;
  
  const allowedIntersections = new Set(
	  prevWord.cells.map(c => key(c.x, c.y))
	);


  for (let attempt = 0; attempt < attempts; attempt++) {
    const prevCells = prevWord.cells;

    // pick random intersection cell
    const pivot = prevCells[Math.floor(Math.random() * prevCells.length)];
	const pivotKey = key(pivot.x, pivot.y);

	if (usedIntersections.has(pivotKey)) continue;

	
	
    const letter = pivot.cell.letter;

    // pick a perpendicular direction
    const dir = prevWord.direction === "right" ? "down" : "right";

    // find candidate words
    const candidates = WORDS_BY_LETTER[letter];
	if (!candidates || !candidates.length) continue;


    const entry = candidates[Math.floor(Math.random() * candidates.length)];
	const word = entry.word;

    const index = word.indexOf(letter);

    const startX = pivot.x - (dir === "right" ? index : 0);
    const startY = pivot.y - (dir === "down" ? index : 0);

    // validate placement
    let valid = true;
    let intersections = 0;

    for (let i = 0; i < word.length; i++) {
      const x = startX + (dir === "right" ? i : 0);
      const y = startY + (dir === "down" ? i : 0);
      const k = key(x, y);

      if (grid.has(k)) {
		  if (allowedIntersections.has(k)) {
			intersections++;
		  } else {
			valid = false;
			break;
		  }
	  } else {
        if (hasAdjacent(x, y, key(pivot.x, pivot.y))) {
          valid = false;
          break;
        }
      }
    }

    if (!valid || intersections !== 1) continue;

	console.log(word)

	return {
	  entry,              // 👈 keep the whole object
	  startX,
	  startY,
	  dir,
	  intersectionKey: pivotKey
	};


  }

  return null;
}


function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

/* ======================
   CONFIG
====================== */

const CELL_SIZE = 32;
const COLORS = {
  bg: "#1f2430",
  cell: "#2a3140",
  selected: "#8b90a6",
  active: "#6f78ff",
  text: "#ffffff"
};

/* ======================
   CAMERA
====================== */

const camera = {
  x: 0,
  y: 0,
  zoom: 1
};

const cameraTarget = { x: 0, y: 0 };
let cameraLerp = 0;


let isDragging = false;
let lastMouse = { x: 0, y: 0 };

canvas.addEventListener("mousedown", e => {
  isDragging = true;
  lastMouse = { x: e.clientX, y: e.clientY };
});

canvas.addEventListener("mouseup", () => isDragging = false);
canvas.addEventListener("mouseleave", () => isDragging = false);

canvas.addEventListener("mousemove", e => {
  if (!isDragging) return;
  camera.x += (e.clientX - lastMouse.x) / camera.zoom;
  camera.y += (e.clientY - lastMouse.y) / camera.zoom;
  lastMouse = { x: e.clientX, y: e.clientY };
});

canvas.addEventListener("wheel", e => {
  e.preventDefault();
  const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
  camera.zoom = Math.min(3, Math.max(0.3, camera.zoom * zoomFactor));
}, { passive: false });

/* ======================
   GRID STORAGE
====================== */

const grid = new Map();

function key(x, y) {
  return `${x},${y}`;
}

const usedIntersections = new Set();


/* ======================
   WORD PLACEMENT
====================== */

let activeWord = null;

function placeWord(entry, startX, startY, dir, intersectionKey = null) {

  const cells = [];
	const word = entry.word;

  for (let i = 0; i < word.length; i++) {
    const x = startX + (dir === "right" ? i : 0);
    const y = startY + (dir === "down" ? i : 0);

    const cell = {
      letter: word[i],
      value: null,
      state: "active"
    };

    grid.set(key(x, y), cell);
    cells.push({ x, y, cell });
  }

  if (intersectionKey) {
    usedIntersections.add(intersectionKey);
  }

	


  activeWord = {
	  word,
	  type: entry.type,
	  clue: entry.clue,
	  cells,
	  index: 0,
	  direction: dir
	};

  
	const center = getWordCenter(activeWord);
	cameraTarget.x = -center.x;
	cameraTarget.y = -center.y;
	cameraLerp = 0;

	document.getElementById("clue-type").textContent = activeWord.type;
	document.getElementById("clue-text").textContent = activeWord.clue;

  
}




/* ======================
   RENDER LOOP
====================== */

function draw() {
  ctx.setTransform(camera.zoom, 0, 0, camera.zoom, canvas.width / 2, canvas.height / 2);
  ctx.translate(camera.x, camera.y);

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(-5000, -5000, 10000, 10000);

  const visibleRadius = Math.ceil((canvas.width / CELL_SIZE) / camera.zoom) + 2;
  
	const halfWidth = canvas.width / camera.zoom / 2;
	const halfHeight = canvas.height / camera.zoom / 2;

	const minX = Math.floor((-camera.x - halfWidth) / CELL_SIZE) - 2;
	const maxX = Math.ceil((-camera.x + halfWidth) / CELL_SIZE) + 2;
	const minY = Math.floor((-camera.y - halfHeight) / CELL_SIZE) - 2;
	const maxY = Math.ceil((-camera.y + halfHeight) / CELL_SIZE) + 2;


  for (let x = minX; x <= maxX; x++) {
	  for (let y = minY; y <= maxY; y++) {
		drawCell(x, y);
	  }
	}

  
  if (cameraLerp < 1) {
	  cameraLerp += 0.05; // speed (lower = smoother)
	  const t = Math.min(cameraLerp, 1);

	  camera.x += (cameraTarget.x - camera.x) * t;
	  camera.y += (cameraTarget.y - camera.y) * t;
	}


  requestAnimationFrame(draw);
}

function drawCell(x, y) {
  const size = CELL_SIZE;
  const cell = grid.get(key(x, y));

  let color = COLORS.cell;

  if (cell?.state === "active") color = COLORS.active;
  if (cell?.state === "completed") color = COLORS.selected;

  ctx.fillStyle = color;
  ctx.fillRect(x * size, y * size, size - 2, size - 2);

  const char = cell?.value ?? (cell ? "_" : null);

  if (char) {
    ctx.fillStyle = COLORS.text;
    ctx.font = `${size * 0.6}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      char,
      x * size + size / 2,
      y * size + size / 2
    );
  }
}



window.addEventListener("keydown", e => {
  if (!activeWord) return;

  if (e.key === "Backspace") {
    if (activeWord.index > 0) {
      activeWord.index--;
      activeWord.cells[activeWord.index].cell.value = null;
    }
    return;
  }

  if (!/^[a-zA-Z]$/.test(e.key)) return;
  if (activeWord.index >= activeWord.cells.length) return;

  const typed = e.key.toUpperCase();
  const current = activeWord.cells[activeWord.index].cell;

  current.value = typed;
  activeWord.index++;

  // If word fully filled, validate
  if (activeWord.index === activeWord.cells.length) {
    validateActiveWord();
  }
});

function validateActiveWord() {
  const correct = activeWord.cells.every(
    ({ cell }) => cell.value === cell.letter
  );

  if (correct) {
    completeActiveWord();
  } else {
    // optional: flash error, shake, etc.
  }
}


function getWordCenter(word) {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (const { x, y } of word.cells) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  return {
    x: (minX + maxX + 1) * CELL_SIZE / 2,
    y: (minY + maxY + 1) * CELL_SIZE / 2
  };
}


function completeActiveWord() {
  for (const { cell } of activeWord.cells) {
    cell.state = "completed";
  }

  const prev = activeWord;
  activeWord = null;

  const next = generateNextWord(prev);
  if (!next) {
    console.warn("No valid word found");
    return;
  }

	placeWord(
	  next.entry,
	  next.startX,
	  next.startY,
	  next.dir,
	  next.intersectionKey
	);


}




draw();
