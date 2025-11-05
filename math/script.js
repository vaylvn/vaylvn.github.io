let min = 1, max = 12;
let time = 60;
let timerInterval = null;
let running = false;
let score = 0;
let current = {};
let input = '';

const timerEl = document.getElementById('timer');
const scoreEl = document.getElementById('score');
const eqEl = document.getElementById('equation');
const ansEl = document.getElementById('answerArea');
const msgEl = document.getElementById('message');

const configScreen = document.getElementById('config');
const gameScreen = document.getElementById('gameScreen');
const startBtn = document.getElementById('startBtn');
const minInput = document.getElementById('minInput');
const maxInput = document.getElementById('maxInput');
const timeInput = document.getElementById('timeInput');

startBtn.addEventListener('click', () => {
  const num = str => parseInt(str.replace(/[^\d]/g, '')) || 0;
  min = Math.max(1, num(minInput.value));
  max = Math.max(min, num(maxInput.value));
  time = Math.max(5, num(timeInput.value));
  showGame();
});

function showGame() {
  configScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  resetGame();
}

function resetGame() {
  running = false;
  score = 0;
  updateHUD();
  eqEl.textContent = '';
  ansEl.textContent = '';
  msgEl.textContent = 'Press any key to start';
}

function newQuestion() {
  const a = Math.floor(Math.random() * (max - min + 1)) + min;
  const b = Math.floor(Math.random() * (max - min + 1)) + min;
  current = { a, b, answer: a * b };
  eqEl.textContent = `${a} × ${b} =`;
  input = '';
  ansEl.textContent = '';
  eqEl.classList.add('fade');
  setTimeout(() => eqEl.classList.remove('fade'), 200);
}

function startGame() {
  if (running) return;
  running = true;
  msgEl.textContent = '';
  score = 0;
  updateHUD();
  newQuestion();
  timerInterval = setInterval(() => {
    time--;
    updateHUD();
    if (time <= 0) endGame();
  }, 1000);
}

function endGame() {
  running = false;
  clearInterval(timerInterval);
  eqEl.textContent = '';
  ansEl.textContent = '';
  msgEl.textContent = `Time’s up! Score: ${score}`;
  setTimeout(() => {
    gameScreen.classList.add('hidden');
    configScreen.classList.remove('hidden');
  }, 1500);
}

function updateHUD() {
  timerEl.textContent = time;
  scoreEl.textContent = score;
}

document.addEventListener('keydown', (e) => {
  // Ignore keypresses when config screen visible
  if (!configScreen.classList.contains('hidden')) return;

  // Start game on first keypress
  if (!running) return startGame();

  if (e.key === 'Backspace') {
    input = input.slice(0, -1);
  } else if (/^[0-9]$/.test(e.key)) {
    input += e.key;
  } else {
    return;
  }

  ansEl.textContent = input;

  if (parseInt(input) === current.answer) {
    score++;
    updateHUD();
    newQuestion();
  }
});
