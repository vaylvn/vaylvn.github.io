// ===== Core globals =====
let running = false;
let timer, timeLeft, score = 0, input = "";
let current = {}, selectedMode = null;

// UI refs
const timerEl = document.getElementById("timer");
const scoreEl = document.getElementById("score");
const equationEl = document.getElementById("equation");
const ansEl = document.getElementById("answer");
const msgEl = document.getElementById("msg");
const nameInput = document.getElementById("nameInput");

// ===== Utility =====
function show(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  input = "";
  ansEl.textContent = "";
}

// ===== Mode buttons =====
document.querySelectorAll(".modeBtn").forEach(b => {
  b.onclick = () => {
    selectedMode = parseInt(b.dataset.time);
    show("screen-game");
    startRun();
  };
});

document.getElementById("customBtn").onclick = async () => {
  show("screen-custom");
};

document.getElementById("viewLBBtn").onclick = async () => {
  await loadLeaderboard(15);
  show("screen-leaderboard");
};

document.getElementById("backBtn").onclick = () => show("screen-home");

// ===== Custom mode start =====
document.getElementById("startCustomBtn").onclick = () => {
  const Amin = parseInt(document.getElementById("Amin").value);
  const Amax = parseInt(document.getElementById("Amax").value);
  const Bmin = parseInt(document.getElementById("Bmin").value);
  const Bmax = parseInt(document.getElementById("Bmax").value);
  const secs = parseInt(document.getElementById("customTime").value);
  selectedMode = null;
  show("screen-game");
  startRun(Amin, Amax, Bmin, Bmax, secs);
};

// ===== Game logic =====
function newQ(Amin = 1, Amax = 12, Bmin = 1, Bmax = 12) {
  const a = Math.floor(Math.random() * (Amax - Amin + 1)) + Amin;
  const b = Math.floor(Math.random() * (Bmax - Bmin + 1)) + Bmin;
  current = { a, b, ans: a * b };
  equationEl.textContent = `${a} × ${b}`;
  ansEl.textContent = "";
  input = "";
}

function startRun(Amin = 1, Amax = 12, Bmin = 1, Bmax = 12, secs = selectedMode || 15) {
  running = true;
  score = 0;
  timeLeft = secs;
  scoreEl.textContent = 0;
  timerEl.textContent = timeLeft;
  msgEl.textContent = "";
  newQ(Amin, Amax, Bmin, Bmax);

  clearInterval(timer);
  timer = setInterval(() => {
    if (--timeLeft <= 0) {
      clearInterval(timer);
      endRun();
    }
    timerEl.textContent = timeLeft;
  }, 1000);
}

// ===== Input handler =====
document.addEventListener("keydown", e => {
  if (document.activeElement === nameInput) return;

  const gameVisible = document.getElementById("screen-game").classList.contains("active");
  if (!gameVisible) return;
  if (!running) return startRun();

  if (e.key === "Backspace") input = input.slice(0, -1);
  else if (/^[0-9]$/.test(e.key)) input += e.key;
  ansEl.textContent = input;

  if (parseInt(input, 10) === current.ans) {
	  score++;
	  scoreEl.textContent = score;

	  // visual feedback
	  equationEl.style.transition = "color 0.1s ease";
	  equationEl.style.color = "#5f5";
	  setTimeout(() => (equationEl.style.color = ""), 150);

	  input = "";

	  if (zenMode) {
		nextZenQ(); // Zen-only logic, uses stored zenRange
	  } else {
		// normal mode — reuse whatever your latest custom or default range was
		newQ(1, 12, 1, 12);
	  }
	}

});

// ===== End game =====
function endRun() {
  running = false;
  msgEl.textContent = `Time! Score: ${score}`;
  show("screen-submit");
}

// ===== Leaderboard =====
document.getElementById("submitBtn").onclick = async () => {
  const name = nameInput.value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(name)) return alert("3 letters please");

  const banned = ["NIG", "NGR", "POC", "FAG", "KKK", "SEX", "GAY"];
  if (banned.includes(name)) return alert("Invalid tag.");

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

// ===== Firebase read leaderboard =====
async function loadLeaderboard(mode) {
  const lbTitle = document.getElementById("lbTitle");
  const lbList = document.getElementById("lbList");
  if (!lbTitle || !lbList) return;

  lbTitle.textContent = `Top 10 (${mode}s)`;
  lbList.innerHTML = "";

  if (!window.db) return;

  const { collection, query, orderBy, limit, getDocs } = window.firestoreFns;
  const q = query(
    collection(window.db, `leaderboards/${mode}/scores`),
    orderBy("score", "desc"),
    limit(10)
  );
  const snap = await getDocs(q);
  snap.forEach(doc => {
    const d = doc.data();
    const li = document.createElement("li");
    li.textContent = `${d.name} — ${d.score}`;
    lbList.appendChild(li);
  });
}

// ===== Zen mode =====
let zenMode = false;
const zenRange = { Amin: 1, Amax: 12, Bmin: 1, Bmax: 12 };

document.getElementById("zenBtn").onclick = () => {
  document.getElementById("zenPanel").classList.toggle("hidden");
};

document.getElementById("startZenBtn").onclick = () => {
  zenRange.Amin = parseInt(document.getElementById("zenAmin").value) || 1;
  zenRange.Amax = parseInt(document.getElementById("zenAmax").value) || 12;
  zenRange.Bmin = parseInt(document.getElementById("zenBmin").value) || 1;
  zenRange.Bmax = parseInt(document.getElementById("zenBmax").value) || 12;
  startZen();
};

function startZen() {
  show("screen-game");
  running = true;
  zenMode = true;
  msgEl.textContent = "Zen mode · press Esc to exit";
  timerEl.style.display = "none";
  scoreEl.style.display = "none";
  nextZenQ();
  document.addEventListener("keydown", handleZenEscape);
}

function handleZenEscape(e) {
  if (e.key === "Escape") {
    running = false;
    zenMode = false;
    timerEl.style.display = "inline";
    scoreEl.style.display = "inline";
    document.removeEventListener("keydown", handleZenEscape);
    show("screen-home");
  }
}

function nextZenQ() {
  const a = Math.floor(Math.random() * (zenRange.Amax - zenRange.Amin + 1)) + zenRange.Amin;
  const b = Math.floor(Math.random() * (zenRange.Bmax - zenRange.Bmin + 1)) + zenRange.Bmin;
  current = { a, b, ans: a * b };
  equationEl.textContent = `${a} × ${b}`;
  ansEl.textContent = "";
  input = "";
}
