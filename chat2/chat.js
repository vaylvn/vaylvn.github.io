// ============================================================
//  VAYL CHAT WIDGET
//  URL flag: ?data=base64 → widget mode
//  No flag → config/preview mode
// ============================================================

const params = new URLSearchParams(window.location.search);
const IS_WIDGET = params.has("data");

// ============================================================
//  DEFAULT CONFIG
// ============================================================

const DEFAULT_CONFIG = {
  channel: "",
  maxMessages: 1,
  duration: 4000,
  fade: 800,
  position: "bottom-right",
  inEffect: "fade",
  outEffect: "fade-out",
  bubbleBg: "#141414",
  bubbleOpacity: 85,
  backdropBlur: true,
  borderColor: "#ffffff",
  borderOpacity: 8,
  radius: 12,
  shadow: true,
  gap: 6,
  font: "Outfit",
  msgSize: 22,
  msgColor: "#f0f0f0",
  userSize: 13,
  userColor: "#00e5ff",
  useTwitchColor: false,
  maxWidth: 520,
};

let config = { ...DEFAULT_CONFIG };

// ============================================================
//  MODE DETECTION
// ============================================================

if (IS_WIDGET) {
  initWidgetMode();
} else {
  initConfigMode();
}

// ============================================================
//  WIDGET MODE
// ============================================================

function initWidgetMode() {
  document.getElementById("widget-app").classList.remove("hidden");

  try {
    const raw = params.get("data");
    const decoded = JSON.parse(atob(raw));
    config = { ...DEFAULT_CONFIG, ...decoded };
  } catch (e) {
    console.error("Vayl: failed to parse config", e);
  }

  // Create a stack div inside the fixed full-screen widget-container
  // (we can't position widget-container itself or it loses its fixed full-screen sizing)
  const widgetRoot = document.getElementById("widget-container");
  const stack = document.createElement("div");
  stack.style.cssText = "position:absolute; display:flex; pointer-events:none;";
  widgetRoot.appendChild(stack);
  startMessageSystem(stack, config, false);

  if (!config.channel) {
    console.warn("Vayl: no channel set");
    return;
  }

  // tmi.js
  const client = new tmi.Client({ channels: [config.channel] });
  client.connect().catch(console.error);
  client.on("message", (channel, tags, message, self) => {
    if (self) return;
    const username = tags["display-name"] || tags.username;
    const color = tags.color || null;
    pushMessage(username, message, color);
  });
}

// ============================================================
//  MESSAGE SYSTEM (shared by widget + preview)
// ============================================================

let msgContainer = null;
let msgQueue = [];
let msgTimers = [];
let currentCfg = null;
let isAnchorBottom = false;

function startMessageSystem(container, cfg, isPreview) {
  currentCfg = cfg;
  msgContainer = container;
  msgQueue = [];
  msgTimers.forEach(clearTimeout);
  msgTimers = [];

  if (!isPreview) {
    // Position the stack container inside widget-container
    applyStackPosition(container, cfg);
  }
}

function applyStackPosition(el, cfg) {
  const pad = 40;
  const pos = cfg.position;

  Object.assign(el.style, {
    top: "", bottom: "", left: "", right: "",
    transform: "",
    flexDirection: cfg.position.startsWith("bottom") ? "column-reverse" : "column",
    gap: cfg.gap + "px",
    maxWidth: cfg.maxWidth + "px",
    width: "max-content",
  });

  isAnchorBottom = pos.startsWith("bottom");

  if (isAnchorBottom) {
    el.style.flexDirection = "column-reverse";
  }

  const map = {
    "top-left":      () => { el.style.top = pad+"px"; el.style.left = pad+"px"; },
    "top-center":    () => { el.style.top = pad+"px"; el.style.left = "50%"; el.style.transform = "translateX(-50%)"; },
    "top-right":     () => { el.style.top = pad+"px"; el.style.right = pad+"px"; },
    "middle-left":   () => { el.style.top = "50%"; el.style.left = pad+"px"; el.style.transform = "translateY(-50%)"; },
    "center":        () => { el.style.top = "50%"; el.style.left = "50%"; el.style.transform = "translate(-50%,-50%)"; },
    "middle-right":  () => { el.style.top = "50%"; el.style.right = pad+"px"; el.style.transform = "translateY(-50%)"; },
    "bottom-left":   () => { el.style.bottom = pad+"px"; el.style.left = pad+"px"; },
    "bottom-center": () => { el.style.bottom = pad+"px"; el.style.left = "50%"; el.style.transform = "translateX(-50%)"; },
    "bottom-right":  () => { el.style.bottom = pad+"px"; el.style.right = pad+"px"; },
  };
  (map[pos] || map["bottom-right"])();
}

function pushMessage(username, text, twitchColor) {
  const cfg = currentCfg;
  const max = cfg.maxMessages;

  // If at capacity, remove oldest
  while (msgQueue.length >= max) {
    const oldest = msgQueue.shift();
    forceRemoveBubble(oldest, cfg);
  }

  const bubble = createBubble(username, text, twitchColor, cfg);
  msgContainer.appendChild(bubble);
  msgQueue.push(bubble);

  // Animate in — double rAF ensures initial opacity:0 state is painted first
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      bubble.classList.add("in-" + cfg.inEffect);
    });
  });

  // Schedule removal
  const tid = setTimeout(() => {
    removeBubble(bubble, cfg);
  }, cfg.duration);
  msgTimers.push(tid);
  bubble._timer = tid;
}

function createBubble(username, text, twitchColor, cfg) {
  const el = document.createElement("div");
  el.className = "msg-bubble";

  // Styles from config
  const bgRgb = hexToRgb(cfg.bubbleBg);
  const borderRgb = hexToRgb(cfg.borderColor);
  const opacity = cfg.bubbleOpacity / 100;
  const borderOpacity = cfg.borderOpacity / 100;

  el.style.cssText = `
    background: rgba(${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}, ${opacity});
    ${cfg.backdropBlur ? "backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);" : ""}
    border: 1px solid rgba(${borderRgb.r}, ${borderRgb.g}, ${borderRgb.b}, ${borderOpacity});
    border-radius: ${cfg.radius}px;
    padding: 12px 16px;
    max-width: ${cfg.maxWidth}px;
    font-family: '${cfg.font}', sans-serif;
    ${cfg.shadow ? "box-shadow: 0 8px 30px rgba(0,0,0,0.35);" : ""}
    --in-dur: 280ms;
    --out-dur: ${cfg.fade}ms;
  `;

  const usernameColor = (cfg.useTwitchColor && twitchColor) ? twitchColor : cfg.userColor;

  el.innerHTML = `
    <span class="msg-username" style="
      font-size: ${cfg.userSize}px;
      color: ${escapeHtml(usernameColor)};
      font-weight: 600;
      margin-bottom: 3px;
    ">${escapeHtml(username)}</span>
    <span class="msg-text" style="
      font-size: ${cfg.msgSize}px;
      color: ${escapeHtml(cfg.msgColor)};
      font-weight: 400;
    ">${escapeHtml(text)}</span>
  `;

  return el;
}

function removeBubble(el, cfg) {
  if (!el.parentNode) return;
  el.classList.add("out-" + cfg.outEffect);
  setTimeout(() => {
    el.remove();
    msgQueue = msgQueue.filter(b => b !== el);
  }, cfg.fade);
}

function forceRemoveBubble(el, cfg) {
  if (!el.parentNode) return;
  clearTimeout(el._timer);
  el.classList.add("out-" + cfg.outEffect);
  setTimeout(() => { el.remove(); }, Math.min(cfg.fade, 300));
}

// ============================================================
//  CONFIG MODE
// ============================================================

function initConfigMode() {
  document.getElementById("config-app").classList.remove("hidden");

  // Load config from URL if present (e.g. data param for editing)
  if (params.has("data")) {
    try {
      const decoded = JSON.parse(atob(params.get("data")));
      config = { ...DEFAULT_CONFIG, ...decoded };
    } catch (e) {}
  }

  syncUIFromConfig();
  bindAllControls();
  preview.init();
}

// ---- Sync all UI inputs from config object ----
function syncUIFromConfig() {
  const c = config;

  setVal("cfg-channel", c.channel);
  setRange("cfg-max-messages", c.maxMessages, "cfg-max-messages-val", v => v);
  setRange("cfg-duration", c.duration, "cfg-duration-val", v => v);
  setRange("cfg-fade", c.fade, "cfg-fade-val", v => v);

  // Position grid
  document.querySelectorAll(".pos-cell").forEach(cell => {
    cell.classList.toggle("active", cell.dataset.pos === c.position);
  });
  document.getElementById("position-label").textContent = c.position;

  // Effect grids
  setActiveChip("in-effect-grid", c.inEffect);
  setActiveChip("out-effect-grid", c.outEffect);

  // Bubble
  setColor("cfg-bubble-bg", c.bubbleBg);
  setRange("cfg-bubble-opacity", c.bubbleOpacity, "cfg-bubble-opacity-val", v => v + "%");
  setToggle("cfg-blur-toggle", "cfg-blur-label", c.backdropBlur);
  setColor("cfg-border-color", c.borderColor);
  setRange("cfg-border-opacity", c.borderOpacity, "cfg-border-opacity-val", v => v + "%");
  setRange("cfg-radius", c.radius, "cfg-radius-val", v => v);
  setToggle("cfg-shadow-toggle", null, c.shadow);
  setRange("cfg-gap", c.gap, "cfg-gap-val", v => v);

  // Typography
  document.getElementById("cfg-font").value = c.font;
  setRange("cfg-msg-size", c.msgSize, "cfg-msg-size-val", v => v);
  setColor("cfg-msg-color", c.msgColor);
  setRange("cfg-user-size", c.userSize, "cfg-user-size-val", v => v);
  setColor("cfg-user-color", c.userColor);
  setToggle("cfg-twitch-color-toggle", "cfg-twitch-color-label", c.useTwitchColor);
  setRange("cfg-max-width", c.maxWidth, "cfg-max-width-val", v => v);
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}
function setColor(id, val) { setVal(id, val); }
function setRange(id, val, labelId, fmt) {
  const el = document.getElementById(id);
  if (el) el.value = val;
  if (labelId) {
    const label = document.getElementById(labelId);
    if (label) label.textContent = fmt(val);
  }
}
function setActiveChip(gridId, value) {
  document.querySelectorAll(`#${gridId} .effect-chip`).forEach(chip => {
    chip.classList.toggle("active", chip.dataset.effect === value);
  });
}
function setToggle(btnId, labelId, on) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.dataset.on = on ? "true" : "false";
  btn.classList.toggle("active", on);
  if (labelId) {
    const label = document.getElementById(labelId);
    if (label) label.textContent = on ? "On" : "Off";
  }
}

// ---- Bind controls ----
function bindAllControls() {
  // Text input
  bindText("cfg-channel", "channel");

  // Sliders
  bindSlider("cfg-max-messages", "cfg-max-messages-val", "maxMessages", v => parseInt(v));
  bindSlider("cfg-duration", "cfg-duration-val", "duration", v => parseInt(v));
  bindSlider("cfg-fade", "cfg-fade-val", "fade", v => parseInt(v));
  bindSlider("cfg-bubble-opacity", "cfg-bubble-opacity-val", "bubbleOpacity", v => parseInt(v), v => v + "%");
  bindSlider("cfg-border-opacity", "cfg-border-opacity-val", "borderOpacity", v => parseInt(v), v => v + "%");
  bindSlider("cfg-radius", "cfg-radius-val", "radius", v => parseInt(v));
  bindSlider("cfg-gap", "cfg-gap-val", "gap", v => parseInt(v));
  bindSlider("cfg-msg-size", "cfg-msg-size-val", "msgSize", v => parseInt(v));
  bindSlider("cfg-user-size", "cfg-user-size-val", "userSize", v => parseInt(v));
  bindSlider("cfg-max-width", "cfg-max-width-val", "maxWidth", v => parseInt(v));

  // Colors
  bindColor("cfg-bubble-bg", "bubbleBg");
  bindColor("cfg-border-color", "borderColor");
  bindColor("cfg-msg-color", "msgColor");
  bindColor("cfg-user-color", "userColor");

  // Select
  document.getElementById("cfg-font").addEventListener("change", e => {
    config.font = e.target.value;
    onConfigChange();
  });

  // Toggles
  bindToggle("cfg-blur-toggle", "cfg-blur-label", "backdropBlur");
  bindToggle("cfg-shadow-toggle", null, "shadow");
  bindToggle("cfg-twitch-color-toggle", "cfg-twitch-color-label", "useTwitchColor");

  // Position grid
  document.querySelectorAll(".pos-cell").forEach(cell => {
    cell.addEventListener("click", () => {
      document.querySelectorAll(".pos-cell").forEach(c => c.classList.remove("active"));
      cell.classList.add("active");
      config.position = cell.dataset.pos;
      document.getElementById("position-label").textContent = config.position;
      onConfigChange();
    });
  });

  // Effect grids
  document.querySelectorAll("#in-effect-grid .effect-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#in-effect-grid .effect-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      config.inEffect = chip.dataset.effect;
      onConfigChange();
    });
  });
  document.querySelectorAll("#out-effect-grid .effect-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#out-effect-grid .effect-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      config.outEffect = chip.dataset.effect;
      onConfigChange();
    });
  });

  // Copy URL
  document.getElementById("btn-copy-url").addEventListener("click", () => {
    const url = buildWidgetURL();
    navigator.clipboard.writeText(url).then(() => {
      showToast("Widget URL copied!");
    });
  });

  // Import
  document.getElementById("btn-import").addEventListener("click", importFromURL);
  document.getElementById("import-url").addEventListener("keydown", e => {
    if (e.key === "Enter") importFromURL();
  });
}

function bindText(id, key) {
  document.getElementById(id).addEventListener("input", e => {
    config[key] = e.target.value;
    onConfigChange();
  });
}
function bindSlider(id, labelId, key, parse, fmt) {
  const el = document.getElementById(id);
  const label = labelId ? document.getElementById(labelId) : null;
  const format = fmt || (v => v);
  el.addEventListener("input", e => {
    const v = parse(e.target.value);
    config[key] = v;
    if (label) label.textContent = format(v);
    onConfigChange();
  });
}
function bindColor(id, key) {
  document.getElementById(id).addEventListener("input", e => {
    config[key] = e.target.value;
    onConfigChange();
  });
}
function bindToggle(btnId, labelId, key) {
  document.getElementById(btnId).addEventListener("click", function() {
    const on = this.dataset.on !== "true";
    this.dataset.on = on ? "true" : "false";
    this.classList.toggle("active", on);
    if (labelId) {
      document.getElementById(labelId).textContent = on ? "On" : "Off";
    }
    config[key] = on;
    onConfigChange();
  });
}

// ---- Build widget URL ----
function buildWidgetURL() {
  const encoded = btoa(JSON.stringify(config));
  const base = window.location.origin + window.location.pathname;
  return `${base}?data=${encoded}`;
}

// ---- Import from URL ----
function importFromURL() {
  const input = document.getElementById("import-url").value.trim();
  try {
    const u = new URL(input);
    const raw = u.searchParams.get("data");
    if (!raw) throw new Error("no data param");
    const decoded = JSON.parse(atob(raw));
    config = { ...DEFAULT_CONFIG, ...decoded };
    syncUIFromConfig();
    onConfigChange();
    showToast("Config loaded!");
  } catch (e) {
    showToast("Invalid URL");
  }
}

// ---- Config changed: update preview layout, keep message loop running ----
function onConfigChange() {
  preview.updateLayout();
}

// ============================================================
//  PREVIEW SYSTEM — fully self-contained, no shared globals
// ============================================================

const FAKE_MESSAGES = [
  { user: "StreamerFan99", text: "that play was actually insane omg" },
  { user: "cyberwave_", text: "LETS GOOO" },
  { user: "nightowl42", text: "how is your ping so clean rn" },
  { user: "MxRainbow", text: "PogChamp PogChamp PogChamp" },
  { user: "quietwatcher", text: "I've been watching for 3 hours and every run gets better" },
  { user: "VaylMod", text: "GG chat, what a session" },
  { user: "hyp3rion", text: "can we get a sub goal for next stream?" },
  { user: "lemonz4ever", text: "clip that clip that someone clip that!!" },
];

const preview = {
  container: null,
  messages: [],   // live bubble elements
  loopTimer: null,
  fakeIndex: 0,

  init() {
    const screen = document.getElementById("preview-screen");
    this.container = document.createElement("div");
    this.container.style.cssText = "position:absolute; display:flex; pointer-events:none;";
    screen.appendChild(this.container);
    this.updateLayout();
    this.scheduleNext();
  },

  updateLayout() {
    const cfg = config;
    const el = this.container;
    const isBottom = cfg.position.startsWith("bottom");
    const pad = 30;

    Object.assign(el.style, {
      top: "", bottom: "", left: "", right: "",
      transform: "",
      flexDirection: isBottom ? "column-reverse" : "column",
      gap: cfg.gap + "px",
      maxWidth: cfg.maxWidth + "px",
      width: "max-content",
    });

    const map = {
      "top-left":      () => { el.style.top = pad+"px"; el.style.left = pad+"px"; },
      "top-center":    () => { el.style.top = pad+"px"; el.style.left = "50%"; el.style.transform = "translateX(-50%)"; },
      "top-right":     () => { el.style.top = pad+"px"; el.style.right = pad+"px"; },
      "middle-left":   () => { el.style.top = "50%"; el.style.left = pad+"px"; el.style.transform = "translateY(-50%)"; },
      "center":        () => { el.style.top = "50%"; el.style.left = "50%"; el.style.transform = "translate(-50%,-50%)"; },
      "middle-right":  () => { el.style.top = "50%"; el.style.right = pad+"px"; el.style.transform = "translateY(-50%)"; },
      "bottom-left":   () => { el.style.bottom = pad+"px"; el.style.left = pad+"px"; },
      "bottom-center": () => { el.style.bottom = pad+"px"; el.style.left = "50%"; el.style.transform = "translateX(-50%)"; },
      "bottom-right":  () => { el.style.bottom = pad+"px"; el.style.right = pad+"px"; },
    };
    (map[cfg.position] || map["bottom-right"])();

    // Re-style existing bubbles with new config
    this.messages.forEach(b => this.restyleBubble(b, cfg));
  },

  restyleBubble(el, cfg) {
    const bgRgb = hexToRgb(cfg.bubbleBg);
    const borderRgb = hexToRgb(cfg.borderColor);
    const opacity = cfg.bubbleOpacity / 100;
    const borderOpacity = cfg.borderOpacity / 100;
    el.style.background = `rgba(${bgRgb.r},${bgRgb.g},${bgRgb.b},${opacity})`;
    el.style.border = `1px solid rgba(${borderRgb.r},${borderRgb.g},${borderRgb.b},${borderOpacity})`;
    el.style.borderRadius = cfg.radius + "px";
    el.style.fontFamily = `'${cfg.font}', sans-serif`;
    el.style.boxShadow = cfg.shadow ? "0 8px 30px rgba(0,0,0,0.35)" : "none";
    el.style.setProperty("--out-dur", cfg.fade + "ms");
    const uEl = el.querySelector(".msg-username");
    const tEl = el.querySelector(".msg-text");
    if (uEl) { uEl.style.fontSize = cfg.userSize + "px"; uEl.style.color = cfg.userColor; }
    if (tEl) { tEl.style.fontSize = cfg.msgSize + "px"; tEl.style.color = cfg.msgColor; }
  },

  scheduleNext() {
    clearTimeout(this.loopTimer);
    this.loopTimer = setTimeout(() => {
      const msg = FAKE_MESSAGES[this.fakeIndex % FAKE_MESSAGES.length];
      this.fakeIndex++;
      this.push(msg.user, msg.text);
      this.scheduleNext();
    }, 2200);
  },

  push(username, text) {
    const cfg = config;

    // Evict oldest if at capacity
    while (this.messages.length >= cfg.maxMessages) {
      const oldest = this.messages.shift();
      this.forceRemove(oldest, cfg);
    }

    const bubble = createBubble(username, text, null, cfg);
    this.container.appendChild(bubble);
    this.messages.push(bubble);

    // Trigger entry animation next frame
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        bubble.classList.add("in-" + cfg.inEffect);
      });
    });

    // Schedule exit
    bubble._exitTimer = setTimeout(() => {
      this.remove(bubble);
    }, cfg.duration);
  },

  remove(el) {
    if (!el.parentNode) return;
    this.messages = this.messages.filter(b => b !== el);
    el.classList.add("out-" + config.outEffect);
    setTimeout(() => { el.remove(); }, config.fade);
  },

  forceRemove(el, cfg) {
    if (!el.parentNode) return;
    clearTimeout(el._exitTimer);
    el.remove();
  },
};

// ============================================================
//  UTILS
// ============================================================

function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function hexToRgb(hex) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r ? {
    r: parseInt(r[1], 16),
    g: parseInt(r[2], 16),
    b: parseInt(r[3], 16)
  } : { r: 20, g: 20, b: 20 };
}

function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
}
