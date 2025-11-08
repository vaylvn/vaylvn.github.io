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


const isMobile = /Mobi|Android/i.test(navigator.userAgent);

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

// Modify your keydown logic minimally:
document.addEventListener('keydown', e => {
  if (document.activeElement === nameInput) return;
  const gameVisible = document.getElementById('screen-game').classList.contains('active');
  if (!gameVisible) return;
  if (!running) return startRun();

  if (e.key === 'Backspace') input = input.slice(0, -1);
  else if (/^[0-9]$/.test(e.key)) input += e.key;
  ansEl.textContent = input;

  if (parseInt(input, 10) === current.ans) {
    score++;
    scoreEl.textContent = score;

    // visual flash (same as before)
    const q = document.getElementById('equation');
    q.style.transition = 'color 0.1s ease';
    q.style.color = '#5f5';
    setTimeout(() => (q.style.color = ''), 50);

    input = '';

    newQ();
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


// if (name === "AGL") name += "🍪";
	// if (name === "MLZ") name += "🪸";




async function loadLeaderboard(mode) {
  if (!window.db) return;
  const { collection, query, orderBy, limit, getDocs } = window.firestoreFns;
  const lastId = localStorage.getItem("lastScoreId");

  // fetch both sets at once
  const [pcSnap, mobileSnap] = await Promise.all([
    getDocs(query(collection(window.db, `leaderboards/${mode}/pc`), orderBy("score","desc"), limit(10))),
    getDocs(query(collection(window.db, `leaderboards/${mode}/mobile`), orderBy("score","desc"), limit(10)))
  ]);

  const pc = pcSnap.docs.map(d => ({ id: d.id, ...d.data(), device: "pc" }));
  const mobile = mobileSnap.docs.map(d => ({ id: d.id, ...d.data(), device: "mobile" }));
  const combined = [...pc, ...mobile].sort((a, b) => b.score - a.score).slice(0, 10);

  lbModeLabel.textContent = mode;

  // helper to fill each list
  function populate(listEl, data) {
    listEl.innerHTML = "";
    if (data.length === 0) {
      listEl.innerHTML = "<li><span>No scores yet</span></li>";
      return;
    }
    data.forEach((r, i) => {
      let name = r.name;
      if (name.startsWith("AGL")) name += " 🍪";
      if (name.startsWith("MEL")) name += " 🪸";

		if (i === 0) name = "🏆 " + name;

      const li = document.createElement("li");
      li.innerHTML = `
        <span>${String(i + 1).padStart(2,"0")}. ${name}</span>
        <span>${r.score}</span>
      `;
      if (r.id === lastId) li.classList.add("highlight");
      listEl.append(li);
    });
  }

  populate(document.getElementById("lbCombined"), combined);
  populate(document.getElementById("lbPC"), pc);
  populate(document.getElementById("lbMobile"), mobile);
}

// simple tab toggles
document.querySelectorAll(".device-tabs button").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".device-tabs button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    const type = btn.dataset.type;
    document.getElementById("lbCombined").classList.toggle("hidden", type !== "combined");
    document.getElementById("lbPC").classList.toggle("hidden", type !== "pc");
    document.getElementById("lbMobile").classList.toggle("hidden", type !== "mobile");
  };
});





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
  let name = nameInput.value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(name)) {
    alert("3 letters please");
    return;
  }

  const banned = ["NIG", "NGR", "POC", "KKK", "FAG", "FGT"];
  if (banned.includes(name)) {
    alert("Invalid tag.");
    return;
  }

  if (isMobile) name += "ᵐ";

  const deviceType = isMobile ? "mobile" : "pc";

  if (window.db) {
    const { collection, addDoc } = window.firestoreFns;
    const ref = await addDoc(
      collection(window.db, `leaderboards/${selectedMode}/${deviceType}`),
      { name, score, time: Date.now() }
    );

    localStorage.setItem("lastScoreId", ref.id);
  }

  // small delay to let Firestore index
  await new Promise(r => setTimeout(r, 300));

  await loadLeaderboard(selectedMode);
  show("screen-leaderboard");
};





document.getElementById('backBtnGame').onclick = () => {
  if (!running) show('screen-home'); // only works if round hasn’t started
};



document.getElementById('playAgainBtn').onclick=()=>show('screen-home');
document.getElementById('backBtn').onclick=()=>show('screen-home');







// --- Mobile keypad integration ---
const keypad = document.getElementById('mobileKeypad');

// detect mobile

if (isMobile) keypad.classList.remove('hidden');

// replicate keyboard presses
keypad.addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const key = btn.dataset.key;

  // Create a synthetic keydown event and dispatch it
  document.dispatchEvent(new KeyboardEvent('keydown', { key }));
});













/* View Leaderboard from home */
const viewBtn=document.getElementById('viewLBBtn');
viewBtn.onclick=async()=>{
  modeButtons.forEach(b=>b.classList.remove('active'));
  document.querySelector('.mode-tabs button[data-mode="15"]').classList.add('active');
  await loadLeaderboard(15);
  show('screen-leaderboard');
};
