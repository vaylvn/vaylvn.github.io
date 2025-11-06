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
const lbModeLabel = document.getElementById('lbModeLabel');
const modeButtons = document.querySelectorAll('.mode-tabs button');
const equationEl=document.getElementById('equation');

function show(id) {
  screens.forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

/* ---- Competitive ---- */
document.querySelectorAll('.mode-select button[data-time]').forEach(btn => {
  btn.onclick = () => {
    selectedMode = parseInt(btn.dataset.time,10);
    time = selectedMode;
    startGame();
  };
});

/* ---- Custom ---- */
const toggleCustomBtn = document.getElementById('toggleCustomBtn');
const customPanel = document.getElementById('customPanel');
const startCustomBtn = document.getElementById('startCustomBtn');
const minInput = document.getElementById('minInput');
const maxInput = document.getElementById('maxInput');
const timeInput = document.getElementById('timeInput');

toggleCustomBtn.onclick = () => customPanel.classList.toggle('hidden');

startCustomBtn.onclick = () => {
  min = Math.max(1, parseInt(minInput.value) || 1);
  max = Math.max(min, parseInt(maxInput.value) || 12);
  selectedMode = Math.max(5, parseInt(timeInput.value) || 30);
  time = selectedMode;
  startGame();
};

/* ---- Game Logic ---- */
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
	  
	equationEl.style.transition = "color 0.1s ease";
    equationEl.style.color = "#5f5"; // green flash
    setTimeout(() => (equationEl.style.color = ""), 120);
	  
    score++; scoreEl.textContent=score; newQ();
  }
});

function endGame() {
  if (!running) return;
  running = false;
  clearInterval(timerInt);
  finalScoreEl.textContent = score;

  // Hide submit if this was a custom mode
  const submit = document.getElementById('submitBtn');
  const playAgain = document.getElementById('playAgainBtn');

  if ([15, 30, 60].includes(selectedMode)) {
    submit.style.display = 'inline-block';
    playAgain.textContent = 'Skip';
  } else {
    submit.style.display = 'none';
    playAgain.textContent = 'Main Menu';
  }

  show('screen-results');
}


/* ---- Leaderboards ---- */

function isOffensiveTag(tag) {
  if (!tag) return false;
  const banned = [
    "nig", "ngr", "poc", "fag", "gay", "kkk", "cum", "sex"
  ];
  const t = tag.toLowerCase();
  return banned.includes(t);
}



async function loadLeaderboard(mode){
  if(!window.db) return;
  const {collection,query,orderBy,limit,getDocs}=window.firestoreFns;
  const q=query(collection(window.db,`leaderboards/${mode}/scores`),
               orderBy("score","desc"),limit(10));
  const snap=await getDocs(q);
  const data=[]; snap.forEach(d=>data.push(d.data()));
  lbList.innerHTML='';
  lbModeLabel.textContent = mode;
  if(data.length===0){
    const li=document.createElement('li');
    li.innerHTML='<span>No scores yet</span>';
    lbList.append(li);
  } else {
    data.forEach((r,i)=>{
      const li=document.createElement('li');
      li.innerHTML=`<span>${String(i+1).padStart(2,'0')}. ${r.name}</span><span>${r.score}</span>`;
      lbList.append(li);
    });
  }
}

/* Leaderboard mode tabs */
modeButtons.forEach(btn=>{
  btn.onclick=async()=>{
    modeButtons.forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const mode=parseInt(btn.dataset.mode,10);
    await loadLeaderboard(mode);
  };
});

/* Results → Leaderboard + Home */
document.getElementById('submitBtn').onclick = async () => {
  const name = nameInput.value.trim().toUpperCase();

  // must be exactly three letters
  if (!/^[A-Z]{3}$/.test(name)) {
    alert("3 letters please");
    return;
  }

  // basic rude-word filter
  const banned = [
    "NIG", "NGR", "POC", "FAG", "KKK", "SEX", "GAY"
  ];
  if (banned.includes(name)) {
    alert("Invalid tag.");
    return;
  }

  // write score
  if (window.db) {
    const { collection, addDoc } = window.firestoreFns;
    await addDoc(
      collection(window.db, `leaderboards/${selectedMode}/scores`),
      { name, score, time: Date.now() }
    );
  }

  await loadLeaderboard(selectedMode);
  show("screen-leaderboard");
};


document.getElementById('backBtnGame').onclick = () => {
  if (!running) show('screen-home'); // only works if round hasn’t started
};



document.getElementById('playAgainBtn').onclick=()=>show('screen-home');
document.getElementById('backBtn').onclick=()=>show('screen-home');

/* View Leaderboard from home */
const viewBtn=document.getElementById('viewLBBtn');
viewBtn.onclick=async()=>{
  modeButtons.forEach(b=>b.classList.remove('active'));
  document.querySelector('.mode-tabs button[data-mode="15"]').classList.add('active');
  await loadLeaderboard(15);
  show('screen-leaderboard');
};




// --- Zen button wiring ---
document.getElementById('zenBtn').onclick=()=>show('screen-zen');
document.getElementById('backZenBtn').onclick=()=>show('screen-home');
document.getElementById('startZenBtn').onclick=()=>{
  const minA=parseInt(document.getElementById('zenAmin').value)||1;
  const maxA=parseInt(document.getElementById('zenAmax').value)||12;
  const minB=parseInt(document.getElementById('zenBmin').value)||1;
  const maxB=parseInt(document.getElementById('zenBmax').value)||12;
  startZen(minA,maxA,minB,maxB);
  show('screen-game');
};

// --- Zen mode logic ---
function startZen(minA,maxA,minB,maxB){
  running=true;
  timerEl.style.display='none';
  scoreEl.style.display='none';
  msgEl.textContent='Zen Mode · press Esc to exit';
  nextZenQ(minA,maxA,minB,maxB);
  document.onkeydown=(e)=>{
    if(e.key==="Escape"){ running=false; show('screen-home'); return; }
  };
}

function nextZenQ(minA,maxA,minB,maxB){
  const a=Math.floor(Math.random()*(maxA-minA+1))+minA;
  const b=Math.floor(Math.random()*(maxB-minB+1))+minB;
  current={a,b,ans:a*b};
  equationEl.style.opacity=0;
  setTimeout(()=>{
    equationEl.textContent=`${a} × ${b}`;
    equationEl.style.opacity=1;
  },120);
}