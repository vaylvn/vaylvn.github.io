// sudoku.js
// Core Sudoku generation logic

(function (global) {
  const SIZE = 9;

  const DIFFICULTY_CLUES = {
    easy: 40,
    medium: 32,
    hard: 26,
    expert: 22
  };

  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function createEmptyBoard() {
    const board = [];
    for (let r = 0; r < SIZE; r++) {
      const row = new Array(SIZE).fill(0);
      board.push(row);
    }
    return board;
  }

  function isSafe(board, row, col, num) {
    // Row
    for (let c = 0; c < SIZE; c++) {
      if (board[row][c] === num) return false;
    }
    // Col
    for (let r = 0; r < SIZE; r++) {
      if (board[r][col] === num) return false;
    }
    // Box
    const boxRow = Math.floor(row / 3) * 3;
    const boxCol = Math.floor(col / 3) * 3;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        if (board[boxRow + r][boxCol + c] === num) return false;
      }
    }
    return true;
  }

  function findEmptyCell(board) {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (board[r][c] === 0) return { row: r, col: c };
      }
    }
    return null;
  }

  function generateFullSolution(board) {
    const empty = findEmptyCell(board);
    if (!empty) return true;

    const { row, col } = empty;
    const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);

    for (const num of nums) {
      if (isSafe(board, row, col, num)) {
        board[row][col] = num;
        if (generateFullSolution(board)) return true;
        board[row][col] = 0;
      }
    }
    return false;
  }

  function deepCopyBoard(board) {
    return board.map(row => row.slice());
  }

  function removeCells(board, clues) {
    const totalCells = SIZE * SIZE;
    let cellsToRemove = totalCells - clues;

    while (cellsToRemove > 0) {
      const r = Math.floor(Math.random() * SIZE);
      const c = Math.floor(Math.random() * SIZE);

      if (board[r][c] !== 0) {
        board[r][c] = 0;
        cellsToRemove--;
      }
    }
  }

  function generateSudoku(difficulty) {
    const clues = DIFFICULTY_CLUES[difficulty] || DIFFICULTY_CLUES.medium;

    const solution = createEmptyBoard();
    generateFullSolution(solution);

    const puzzle = deepCopyBoard(solution);
    removeCells(puzzle, clues);

    return { puzzle, solution };
  }

  global.NumiSudoku = {
    generateSudoku
  };
})(window);
