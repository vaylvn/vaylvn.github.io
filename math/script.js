/* QuickMath v4 Minimal — core logic */

let min = 1, max = 12;
let time = 15, running = false, timerInt;
let score = 0, current = {}, input = '';
let selectedMode = 15;

/* Elements */
const screens = document.querySelectorAll('.screen');
const eqEl = document.getElementById('equation');
const ansEl = document.getElementById('answer');
const msgEl = document.getElementById('msg');
const timerEl = document.getElementById('timer');
const scoreEl = document.getElementById('score');
const finalScoreEl = document.getElementById('finalScore');
const nameInput = document.getElementById('nameInput');
const lbList = document.getElementById('leaderboardList');
const lbTitle = document.getElementById('lbTitle');

const lbModeLabel = document.getElementById('lbModeLabel');
const modeButtons = document.querySelectorAll('.mode-tabs button');

/* ---- Screen helper ---- */
function show(id) {
  screens.forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

/* ---- Menu → Game ---- */
document.querySelectorAll('.mode-select button[data-time]').forEach(btn => {
  btn.onclick = () => {
    selectedMode = parseInt(btn.dataset.time,10);
    time = selectedMode;
    startGame();
  };
});
document.getElementById('customBtn').onclick = () => {
  min = parseInt(prompt("Min ×", "1")) || 1;
  max = parseInt(prompt("Max ×", "12")) || 12;
  selectedMode = parseInt(prompt("Seconds", "30")) || 30;
  time = selectedMode;
  startGame();
};


document.getElementById('viewLBBtn').onclick = async () => {
  // clear all active states
  modeButtons.forEach(b => b.classList.remove('active'));

  // set 15s as default active mode
  const defaultBtn = document.querySelector('.mode-tabs button[data-mode="15"]');
  if (defaultBtn) defaultBtn.classList.add('active');

  // update label + load data
  lbModeLabel.textContent = mode;
  await loadLeaderboard(15);

  // show screen
  show('screen-leaderboard');
};




/* ---- Game logic ---- */
function startGame() {
  score = 0;
  running = false;
  show('screen-game');
  eqEl.textContent = '';
  ansEl.textContent = '';
  msgEl.textContent = 'Press any key to start';
  timerEl.textContent = time;
  scoreEl.textContent = 0;
}

function rand(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
function newQ(){
  const a = rand(min,max), b = rand(min,max);
  current = {a,b,ans:a*b};
  eqEl.textContent = `${a}×${b}=`;
  ansEl.textContent = '';
  input = '';
}

function startRun(){
  if(running) return;
  running = true;
  msgEl.textContent = '';
  newQ();
  timerInt = setInterval(()=>{
    time--;
    timerEl.textContent = time;
    if(time<=0) endGame();
  },1000);
}

document.addEventListener('keydown', e=>{
  if(document.activeElement===nameInput) return;
  const gameVisible = document.getElementById('screen-game').classList.contains('active');
  if(!gameVisible) return;
  if(!running) return startRun();
  if(e.key==="Backspace") input=input.slice(0,-1);
  else if(/^[0-9]$/.test(e.key)) input+=e.key;
  ansEl.textContent=input;
  if(parseInt(input,10)===current.ans){
    score++; scoreEl.textContent=score; newQ();
  }
});

function endGame(){
  if(!running) return;
  running=false; clearInterval(timerInt);
  finalScoreEl.textContent=score;
  show('screen-results');
}

/* ---- Results / Leaderboard ---- */
document.getElementById('playAgainBtn').onclick=()=>show('screen-home');

document.getElementById('submitBtn').onclick=async()=>{
  const name=nameInput.value.trim().toUpperCase();
  if(!/^[A-Z]{3}$/.test(name)) return alert("3 letters please");
  // Save to Firestore if configured
  if(window.db){
    const {collection,addDoc}=window.firestoreFns;
    await addDoc(collection(window.db,`leaderboards/${selectedMode}/scores`),
      {name,score,time:Date.now()});
  }
  await loadLeaderboard(selectedMode);
  show('screen-leaderboard');
};

document.getElementById('backBtn').onclick=()=>show('screen-home');

async function loadLeaderboard(mode){
  if(!window.db) return;
  const {collection,query,orderBy,limit,getDocs}=window.firestoreFns;
  const q=query(collection(window.db,`leaderboards/${mode}/scores`),
               orderBy("score","desc"),limit(10));
  const snap=await getDocs(q);
  const data=[]; snap.forEach(d=>data.push(d.data()));
  lbList.innerHTML='';
  lbTitle.textContent=`Top 10 — ${mode}s Mode`;
  data.forEach((r,i)=>{
    const li=document.createElement('li');
    li.innerHTML=`<span>${String(i+1).padStart(2,'0')}. ${r.name}</span><span>${r.score}</span>`;
    lbList.append(li);
  });
}

/* ---- Leaderboard mode switching ---- */
const lbModeLabel = document.getElementById('lbModeLabel');
const modeButtons = document.querySelectorAll('.mode-tabs button');

modeButtons.forEach(btn => {
  btn.onclick = async () => {
    modeButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const mode = parseInt(btn.dataset.mode, 10);
    lbModeLabel.textContent = mode;
    await loadLeaderboard(mode);
  };
});
