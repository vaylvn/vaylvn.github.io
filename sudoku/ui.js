// ui.js
// DOM + interaction layer for Numi Sudoku

document.addEventListener("DOMContentLoaded", () => {
  const gridEl = document.getElementById("sudoku-grid");
  const difficultyButtons = Array.from(
    document.querySelectorAll("#difficulty-group .segment")
  );
  const newGameBtn = document.getElementById("new-game-btn");
  const clearBtn = document.getElementById("clear-btn");
  const autoCheckToggle = document.getElementById("auto-check-toggle");
  const mobileKeypad = document.getElementById("mobile-keypad");

  let currentDifficulty = "easy";
  let puzzle = null;
  let solution = null;
  let selectedCell = null;
  let cells = []; // 2D array of cell elements
  let autoCheckEnabled = true;

  function buildGrid() {
    gridEl.innerHTML = "";
    cells = [];

    for (let r = 0; r < 9; r++) {
      const rowEls = [];
      for (let c = 0; c < 9; c++) {
        const cell = document.createElement("div");
        cell.className = "sudoku-cell";
        cell.dataset.row = r;
        cell.dataset.col = c;

        cell.addEventListener("click", () => handleCellClick(cell));
        rowEls.push(cell);
        gridEl.appendChild(cell);
      }
      cells.push(rowEls);
    }
  }

  function handleCellClick(cell) {
    setSelectedCell(cell);
  }

  function setSelectedCell(cell) {
    if (selectedCell === cell) return;

    if (selectedCell) {
      selectedCell.classList.remove("cell-selected");
    }

    selectedCell = cell;

    if (selectedCell) {
      selectedCell.classList.add("cell-selected");
      highlightSameNumbers(selectedCell.textContent || null);
    } else {
      clearSameNumberHighlights();
    }
  }

  function clearSameNumberHighlights() {
    for (const row of cells) {
      for (const cell of row) {
        cell.classList.remove("cell-same-number");
      }
    }
  }

	function highlightSameNumbers(value) {
	  clearSameNumberHighlights();

	  // NEW: apply green only if selected number is complete
	  updateCompletedNumbers(value);

	  if (!value) return;

	  for (const row of cells) {
		for (const cell of row) {
		  if (cell.textContent === value) {
			cell.classList.add("cell-same-number");
		  }
		}
	  }
	}


  function loadGame(diff) {
    currentDifficulty = diff;
    const { puzzle: puz, solution: sol } = NumiSudoku.generateSudoku(diff);
    puzzle = puz;
    solution = sol;

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const cell = cells[r][c];
        const val = puzzle[r][c];

        cell.classList.remove(
		  "cell-given",
		  "cell-editable",
		  "cell-error",
		  "cell-selected",
		  "cell-same-number",
		  "cell-complete-number"   // <-- FIX
		);


        if (val !== 0) {
          cell.textContent = String(val);
          cell.classList.add("cell-given");
        } else {
          cell.textContent = "";
          cell.classList.add("cell-editable");
        }
      }
    }

    selectedCell = null;
  }

	function writeToCell(cell, num) {
	  if (!cell || cell.classList.contains("cell-given")) return;

	  // Always clear previous state before writing a new value
	  cell.classList.remove("cell-error", "cell-same-number", "cell-complete-number");

	  // Apply content
	  if (num) {
		cell.textContent = String(num);
	  } else {
		cell.textContent = "";
	  }

	  // Auto-check mismatch
	  if (autoCheckEnabled && num) {
		const r = parseInt(cell.dataset.row, 10);
		const c = parseInt(cell.dataset.col, 10);
		if (solution[r][c] !== num) {
		  cell.classList.add("cell-error");
		}
	  }

	  // Local highlight logic (same number highlight)
	  highlightSameNumbers(cell.textContent || null);

	}


  function clearEditableCells() {
	  for (let r = 0; r < 9; r++) {
		for (let c = 0; c < 9; c++) {
		  const cell = cells[r][c];

		  if (cell.classList.contains("cell-editable")) {
			writeToCell(cell, null); // unified clearing, includes updateCompletedNumbers()
		  }
		}
	  }

	  // Re-run same-number highlight based on the currently selected cell
	  if (selectedCell) {
		highlightSameNumbers(selectedCell.textContent || null);
	  }
	}

  
	function updateCompletedNumbers(value) {
	  // Clear old green states
	  for (const row of cells) {
		for (const cell of row) {
		  cell.classList.remove("cell-complete-number");
		}
	  }

	  if (!value) return;

	  // Collect positions of this number
	  const positions = [];
	  for (let r = 0; r < 9; r++) {
		for (let c = 0; c < 9; c++) {
		  const cell = cells[r][c];
		  if (cell.textContent === value) {
			positions.push({ r, c });
		  }
		}
	  }

	  // If exactly 9 present, check correctness
	  if (positions.length !== 9) return;

	  const correct = positions.every(
		pos => solution[pos.r][pos.c] === Number(value)
	  );

	  if (!correct) return;

	  // Mark green ONLY for this number
	  for (const pos of positions) {
		cells[pos.r][pos.c].classList.add("cell-complete-number");
	  }
	}



  // Keyboard input (desktop)
  document.addEventListener("keydown", (e) => {
    if (!selectedCell) return;

    // Arrow navigation
    const r = parseInt(selectedCell.dataset.row, 10);
    const c = parseInt(selectedCell.dataset.col, 10);

    let handled = false;

    switch (e.key) {
      case "ArrowUp":
        if (r > 0) setSelectedCell(cells[r - 1][c]);
        handled = true;
        break;
      case "ArrowDown":
        if (r < 8) setSelectedCell(cells[r + 1][c]);
        handled = true;
        break;
      case "ArrowLeft":
        if (c > 0) setSelectedCell(cells[r][c - 1]);
        handled = true;
        break;
      case "ArrowRight":
        if (c < 8) setSelectedCell(cells[r][c + 1]);
        handled = true;
        break;
      case "Backspace":
      case "Delete":
      case "0":
        writeToCell(selectedCell, null);
        handled = true;
        break;
      default:
        if (/^[1-9]$/.test(e.key)) {
          writeToCell(selectedCell, parseInt(e.key, 10));
          handled = true;
        }
    }

    if (handled) {
      e.preventDefault();
    }
  });

  // Mobile keypad
  mobileKeypad.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-num]");
    if (!btn) return;
    if (!selectedCell) return;
    const num = parseInt(btn.dataset.num, 10);
    writeToCell(selectedCell, num);
  });

  // Difficulty UI
  difficultyButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      difficultyButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const diff = btn.dataset.diff;
      loadGame(diff);
    });
  });

  // Auto-check toggle
  autoCheckToggle.addEventListener("click", () => {
    autoCheckEnabled = !autoCheckEnabled;
    if (autoCheckEnabled) {
      autoCheckToggle.classList.add("toggle-on");
      autoCheckToggle.textContent = "Auto-check: ON";
      // Re-evaluate current cells
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const cell = cells[r][c];
          cell.classList.remove("cell-error");
          const text = cell.textContent;
          if (!text) continue;
          const num = parseInt(text, 10);
          if (solution && solution[r][c] !== num) {
            cell.classList.add("cell-error");
          }
        }
      }
    } else {
      autoCheckToggle.classList.remove("toggle-on");
      autoCheckToggle.textContent = "Auto-check: OFF";
      // Clear error styling
      for (const row of cells) {
        for (const cell of row) {
          cell.classList.remove("cell-error");
        }
      }
    }
  });

  // Buttons
  newGameBtn.addEventListener("click", () => loadGame(currentDifficulty));
  clearBtn.addEventListener("click", clearEditableCells);

  // Initialisation
  buildGrid();
  loadGame(currentDifficulty);
});
