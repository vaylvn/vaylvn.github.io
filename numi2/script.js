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

let gameHistory = []; // ← stores answer events for summary + graph
let questionStartTime = 0;
let gameStartTime = 0;


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
	
	questionStartTime = performance.now();
	
  const a = rand(min,max), b = rand(min,max);
  current = {a,b,ans:a*b};
  eqEl.textContent = `${a}×${b}=`;
  ansEl.textContent = '';
  input = '';
}

function startRun(){
  if(running) return;
  running = true;
  
  
	gameHistory = [];
    gameStartTime = performance.now();
    questionStartTime = performance.now();
  
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

  if (e.key === '/' || e.key === '*' || (e.ctrlKey && e.key.toLowerCase() === 'f') || e.key === 'F3') {
    e.preventDefault();
    return;
  }

  if (e.key === 'Backspace') {
    input = input.slice(0, -1);
  } else if (/^[0-9]$/.test(e.key)) {
    input += e.key;
  }

  ansEl.textContent = input;
  const q = document.getElementById('equation');

  // ========== CORRECT ==========
  if (parseInt(input, 10) === current.ans) {
    const now = performance.now();
    const timeTaken = (now - questionStartTime) / 1000;

    gameHistory.push({
      a: current.a,
      b: current.b,
      time: timeTaken,
      correct: true,
      tEnd: (now - gameStart) / 1000
    });

    questionStartTime = now; // reset timing for next question

    score++;
    scoreEl.textContent = score;

    q.style.transition = 'color 0.1s ease';
    q.style.color = '#5f5';
    setTimeout(() => q.style.color = '', 100);

    input = '';
    newQ();
    return;
  }

  // ========== INCORRECT FULL INPUT ==========
  if (input.length >= String(current.ans).length) {
    const now = performance.now();
    const timeTaken = (now - questionStartTime) / 1000;

    gameHistory.push({
      a: current.a,
      b: current.b,
      time: timeTaken,
      correct: false,
      tEnd: (now - gameStart) / 1000
    });

    questionStartTime = now;

    q.style.transition = 'color 0.1s ease';
    q.style.color = '#f55';
    setTimeout(() => q.style.color = '', 100);

    input = '';
    ansEl.textContent = '';
  }
});



	function endGame() {
	  if (!running) return;
	  running = false;
	  clearInterval(timerInt);

	  finalScoreEl.textContent = score;

	  // generate final session data
	  const runData = {
		duration: selectedMode,    // 15/30/60/custom
		results: gameHistory       // <-- list of answers you already track
	  };

	  updateSummary(runData);       // <── new
	  renderGraph(runData);         // <── new

	  // existing logic untouched
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



function updateSummary(run){
  const r = run.results;
  const correct = r.filter(x=>x.correct).length;
  const streak = (()=>{let s=0,b=0;for(const x of r){if(x.correct) s++; else{b=Math.max(b,s);s=0}}return Math.max(b,s)})();
  const acc = Math.round(correct/r.length*100);
  const apm = (correct/run.duration*60).toFixed(1);

  document.getElementById("summary").innerHTML = `
    <div><b style="font-size:28px;color:#ffd642">${apm}</b><br>APM</div>
    <div><b style="font-size:28px;color:#ffd642">${acc}%</b><br>Accuracy</div>
    <div><b style="font-size:28px;color:#ffd642">${correct}/${r.length}</b><br>Correct</div>
    <div><b style="font-size:28px;color:#ffd642">${streak}</b><br>Streak</div>
  `;
}



function renderGraph(run){
 const cvs=document.getElementById("resultGraph"),ctx=cvs.getContext("2d"),tip=document.getElementById("tooltip");
 cvs.width=cvs.clientWidth;cvs.height=250;
 const R=run.results,d=run.duration,pad=20,gW=cvs.width-pad*2,gH=cvs.height-pad*2,baseY=cvs.height-pad;

 // APS bins
 const bins=Math.ceil(d);const aps=new Array(bins).fill(0);
 R.forEach(r=>r.correct&&aps[Math.min(bins-1,Math.floor(r.tEnd))]++);

 const smooth=a=>a.map((v,i)=>a.slice(Math.max(0,i-2),i+1).reduce((x,y)=>x+y)/Math.min(i+1,3));
 const apsS=smooth(aps),maxAPS=Math.max(...apsS,1);

 // Points for curve
 const pts=apsS.map((v,i)=>({x:pad+(i/(bins-1))*gW,y:baseY-(v/maxAPS)*gH}));

 function spline(p,t=0.5){
   ctx.beginPath();ctx.moveTo(p[0].x,p[0].y);
   for(let i=0;i<p.length-1;i++){
     const p0=p[i-1]||p[i],p1=p[i],p2=p[i+1]||p[i],p3=p[i+2]||p2;
     for(let s=0;s<=1;s+=0.05){
       const s2=s*s,s3=s2*s;
       const q1=-t*s3+2*t*s2-t*s, q2=(2-t)*s3+(t-3)*s2+1,
             q3=(t-2)*s3+(3-2*t)*s2+t*s, q4=t*s3-t*s2;
       ctx.lineTo(q1*p0.x+q2*p1.x+q3*p2.x+q4*p3.x,
                  q1*p0.y+q2*p1.y+q3*p2.y+q4*p3.y);
     }
   }
   ctx.strokeStyle = "#ffd642";
   ctx.lineWidth=2;
   ctx.shadowColor="rgba(255,214,66,.45)";ctx.shadowBlur=10;
   ctx.stroke();ctx.shadowBlur=0;
 }

 // Draw Base & Curve
 ctx.strokeStyle="#333";ctx.beginPath();ctx.moveTo(pad,baseY);ctx.lineTo(cvs.width-pad,baseY);ctx.stroke();
 spline(pts);

 // Dots
 const dots=[];
 R.forEach(r=>{
   const sp=1/r.time, maxSp=Math.max(...R.map(z=>1/z.time));
   const x=pad+(r.tEnd/d)*gW;
   const y=baseY-(sp/maxSp)*(gH*0.55);
   
   ctx.fillStyle = r.correct ? "#ffc300" : "#ff4b5c";
   
   ctx.beginPath();ctx.arc(x,y,3,0,7);ctx.fill();
   dots.push({x,y,r});
 });
 

 

 // Hover Logic
 cvs.onmousemove=e=>{
   const b=cvs.getBoundingClientRect(),x=e.clientX-b.left,y=e.clientY-b.top;
   const hit=dots.find(p=>((x-p.x)**2+(y-p.y)**2)<64);
   if(hit){
     tip.style.display="block";
     tip.style.left=(e.pageX+10)+"px";
     tip.style.top=(e.pageY-10)+"px";
     tip.innerHTML=`${hit.r.a}×${hit.r.b}<br>${hit.r.time.toFixed(2)}s`;
   } else tip.style.display="none";
 };
 cvs.onmouseleave=()=>tip.style.display="none";
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
	  if (name.startsWith("SWA")) name += " 🌿";

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





// document.getElementById('backBtnGame').onclick = () => {
//  if (!running) show('screen-home'); // only works if round hasn’t started
//};

document.getElementById('backBtnGame').onclick = () => {
  if (running) {

    running = false;
    clearInterval(timerInt); // stop the countdown
    input = '';
    score = 0;
    time = selectedMode; // reset the timer display
    timerEl.textContent = time;
    scoreEl.textContent = '0';
    ansEl.textContent = '';
    document.getElementById('equation').textContent = '';

    show('screen-home'); // back to menu
  } else {
    show('screen-home');
  }
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

  // Ignore the layout switch button entirely
  if (btn.classList.contains('switch')) return;

  const key = btn.dataset.key;
  document.dispatchEvent(new KeyboardEvent('keydown', { key }));
});



let keypadLayout = "t9"; // default layout

const t9Layout = ["1","2","3","4","5","6","7","8","9","Backspace","0"];
const numpadLayout = ["7","8","9","4","5","6","1","2","3","Backspace","0"];

document.getElementById("keypadSwitch").addEventListener("click", () => {
  keypadLayout = keypadLayout === "t9" ? "numpad" : "t9";

  const keys = document.querySelectorAll("#mobileKeypad .keypad-grid button:not(.switch)");
  const newLayout = keypadLayout === "t9" ? t9Layout : numpadLayout;

  keys.forEach((btn, i) => {
    const val = newLayout[i];
    btn.dataset.key = val;
    btn.textContent = val === "Backspace" ? "⫷" : val;
  });
});










/* View Leaderboard from home */
const viewBtn=document.getElementById('viewLBBtn');
viewBtn.onclick=async()=>{
  modeButtons.forEach(b=>b.classList.remove('active'));
  document.querySelector('.mode-tabs button[data-mode="15"]').classList.add('active');
  await loadLeaderboard(15);
  show('screen-leaderboard');
};
