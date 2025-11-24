/* ============================================================================
   DICE CONFIG SCRIPT
   Runs ONLY in config mode (index without ?data=)
   ============================================================================ */

/* ---------------------------------------------------------------------------
   STATE
--------------------------------------------------------------------------- */

let config = {
  dice: [
    { faces: 6, color: "#ffffff", pips: "#000000" }
  ],
  rollDuration: 2000,
  stagger: 150,
  autoRoll: false
};


/* ---------------------------------------------------------------------------
   DOM REFERENCES
--------------------------------------------------------------------------- */

const diceTableBody = document.getElementById("diceRows");
const addDieBtn = document.getElementById("addDie");

const rollDurationInput = document.getElementById("rollDuration");
const rollDurationVal = document.getElementById("rollDurationVal");

const staggerInput = document.getElementById("stagger");
const autoRollInput = document.getElementById("autoRoll");

const copyUrlBtn = document.getElementById("copyUrl");
const shareUrlInput = document.getElementById("shareUrl");
const importUrlInput = document.getElementById("urlImport");
const importUrlBtn = document.getElementById("importUrl");


/* ---------------------------------------------------------------------------
   BUILD DICE TABLE
--------------------------------------------------------------------------- */

function buildDiceTable() {
  diceTableBody.innerHTML = "";

  config.dice.forEach((die, index) => {
    const row = document.createElement("tr");

    // Faces selector
    const facesCell = document.createElement("td");
    const facesSelect = document.createElement("select");
    [4, 6, 8, 10, 12, 20].forEach(f => {
      const opt = document.createElement("option");
      opt.value = f;
      opt.textContent = f;
      if (die.faces === f) opt.selected = true;
      facesSelect.appendChild(opt);
    });
    facesSelect.addEventListener("change", () => {
      die.faces = parseInt(facesSelect.value);
      updateShareURL();
    });
    facesCell.appendChild(facesSelect);


    // Dice colour
    const colorCell = document.createElement("td");
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = die.color;
    colorInput.addEventListener("input", () => {
      die.color = colorInput.value;
      updateShareURL();
    });
    colorCell.appendChild(colorInput);


    // Pip colour
    const pipCell = document.createElement("td");
    const pipInput = document.createElement("input");
    pipInput.type = "color";
    pipInput.value = die.pips;
    pipInput.addEventListener("input", () => {
      die.pips = pipInput.value;
      updateShareURL();
    });
    pipCell.appendChild(pipInput);


    // Remove button
    const removeCell = document.createElement("td");
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "✕";
    removeBtn.style.background = "#a33";
    removeBtn.style.color = "#fff";
    removeBtn.addEventListener("click", () => {
      config.dice.splice(index, 1);
      if (config.dice.length === 0) {
        config.dice.push({ faces: 6, color: "#ffffff", pips: "#000000" });
      }
      buildDiceTable();
      updateShareURL();
    });
    removeCell.appendChild(removeBtn);


    row.appendChild(facesCell);
    row.appendChild(colorCell);
    row.appendChild(pipCell);
    row.appendChild(removeCell);

    diceTableBody.appendChild(row);
  });
}


/* ---------------------------------------------------------------------------
   ADD NEW DIE
--------------------------------------------------------------------------- */

addDieBtn.addEventListener("click", () => {
  config.dice.push({
    faces: 6,
    color: "#ffffff",
    pips: "#000000"
  });
  buildDiceTable();
  updateShareURL();
});


/* ---------------------------------------------------------------------------
   GLOBAL SETTINGS
--------------------------------------------------------------------------- */

rollDurationInput.addEventListener("input", () => {
  config.rollDuration = parseInt(rollDurationInput.value);
  rollDurationVal.textContent = rollDurationInput.value;
  updateShareURL();
});

staggerInput.addEventListener("input", () => {
  config.stagger = parseInt(staggerInput.value);
  updateShareURL();
});

autoRollInput.addEventListener("change", () => {
  config.autoRoll = autoRollInput.checked;
  updateShareURL();
});


/* ---------------------------------------------------------------------------
   IMPORT / EXPORT (BASE64 ENCODED JSON)
--------------------------------------------------------------------------- */

function encodeConfig(obj) {
  return btoa(JSON.stringify(obj));
}

function decodeConfig(str) {
  try {
    return JSON.parse(atob(str));
  } catch (err) {
    return null;
  }
}

function updateShareURL() {
  const encoded = encodeConfig(config);
  const url = `${location.origin}${location.pathname}?data=${encoded}`;
  shareUrlInput.value = url;
}

copyUrlBtn.addEventListener("click", () => {
  shareUrlInput.select();
  navigator.clipboard.writeText(shareUrlInput.value);
});


importUrlBtn.addEventListener("click", () => {
  const url = importUrlInput.value.trim();
  if (!url.includes("?data=")) return;

  const encoded = url.split("?data=")[1].trim();
  const decoded = decodeConfig(encoded);
  if (decoded) {
    config = decoded;
    applyConfigToUI();
    buildDiceTable();
    updateShareURL();
  }
});


/* ---------------------------------------------------------------------------
   UI INITIALIZATION
--------------------------------------------------------------------------- */

function applyConfigToUI() {
  rollDurationInput.value = config.rollDuration;
  rollDurationVal.textContent = config.rollDuration;

  staggerInput.value = config.stagger;
  autoRollInput.checked = config.autoRoll;
}

buildDiceTable();
applyConfigToUI();
updateShareURL();
