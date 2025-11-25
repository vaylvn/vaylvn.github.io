// =====================
// Dice Configuration UI
// =====================

const diceRowsEl = document.getElementById("diceRows");
const addDieBtn = document.getElementById("addDie");
const shareUrlEl = document.getElementById("shareUrl");
const copyUrlBtn = document.getElementById("copyUrl");
const importInput = document.getElementById("urlImport");
const importBtn = document.getElementById("importUrl");

// Listeners for widget rebuild
let configListeners = [];
export function onConfigChanged(fn) {
  configListeners.push(fn);
}

// Available dice: no d10
const DICE_TYPES = [4, 6, 8, 12, 20];


// =====================
// ADD DIE
// =====================

addDieBtn.addEventListener("click", () => {
  addDieRow({
    faces: 6,
    dieColor: "#ffffff",
    numberColor: "#000000"
  });

  updateUrl();
  notifyListeners();
});


// =====================
// CREATE ROW
// =====================

function addDieRow(cfg) {
  const tr = document.createElement("tr");

  // Face count dropdown
  const faceTD = document.createElement("td");
  const select = document.createElement("select");

  DICE_TYPES.forEach(f => {
    const opt = document.createElement("option");
    opt.value = f;
    opt.textContent = f;
    if (f === cfg.faces) opt.selected = true;
    select.appendChild(opt);
  });

  faceTD.appendChild(select);
  tr.appendChild(faceTD);

  // Die colour
  const dieColorTD = document.createElement("td");
  const dieColorInput = document.createElement("input");
  dieColorInput.type = "color";
  dieColorInput.value = cfg.dieColor;
  dieColorTD.appendChild(dieColorInput);
  tr.appendChild(dieColorTD);

  // Number colour
  const numberColorTD = document.createElement("td");
  const numberColorInput = document.createElement("input");
  numberColorInput.type = "color";
  numberColorInput.value = cfg.numberColor;
  numberColorTD.appendChild(numberColorInput);
  tr.appendChild(numberColorTD);

  // Remove button
  const removeTD = document.createElement("td");
  const removeBtn = document.createElement("button");
  removeBtn.className = "removeDieBtn";
  removeBtn.textContent = "X";
  removeTD.appendChild(removeBtn);
  tr.appendChild(removeTD);

  // Append row
  diceRowsEl.appendChild(tr);

  // Handlers
  select.addEventListener("change", () => {
    updateUrl();
    notifyListeners();
  });
  dieColorInput.addEventListener("input", () => {
    updateUrl();
    notifyListeners();
  });
  numberColorInput.addEventListener("input", () => {
    updateUrl();
    notifyListeners();
  });
  removeBtn.addEventListener("click", () => {
    tr.remove();
    updateUrl();
    notifyListeners();
  });
}


// =====================
// GET CONFIG OBJECT
// =====================

export function getDiceConfig() {
  const dice = [];

  for (const tr of diceRowsEl.querySelectorAll("tr")) {
    const tds = tr.querySelectorAll("td");

    dice.push({
      faces: parseInt(tds[0].querySelector("select").value),
      dieColor: tds[1].querySelector("input").value,
      numberColor: tds[2].querySelector("input").value
    });
  }

  return { dice };
}


// =====================
// UPDATE SHARE URL
// =====================

function updateUrl() {
  const cfg = getDiceConfig();
  const encoded = btoa(JSON.stringify(cfg));
  const url = `${location.origin}${location.pathname}?data=${encoded}`;
  shareUrlEl.value = url;
}


// =====================
// NOTIFY WIDGET
// =====================

function notifyListeners() {
  configListeners.forEach(fn => fn());
}


// =====================
// COPY URL
// =====================

copyUrlBtn.addEventListener("click", () => {
  shareUrlEl.select();
  document.execCommand("copy");
});


// =====================
// IMPORT URL
// =====================

importBtn.addEventListener("click", () => {
  const raw = importInput.value.trim();
  if (!raw.includes("?data=")) return;

  const encoded = raw.split("?data=")[1];
  const json = JSON.parse(atob(encoded));

  loadConfig(json);
  updateUrl();
  notifyListeners();
});


// =====================
// LOAD CONFIG -> UI
// =====================

export function loadConfig(cfg) {
  diceRowsEl.innerHTML = "";

  cfg.dice.forEach(die => addDieRow(die));
}


// =====================
// AUTO-LOAD FROM URL
// =====================

(function() {
  const params = new URLSearchParams(location.search);
  const data = params.get("data");

  if (data) {
    try {
      const cfg = JSON.parse(atob(data));
      loadConfig(cfg);
    } catch (e) {
      console.warn("Invalid config in URL");
    }
  }
})();
