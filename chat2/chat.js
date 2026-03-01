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

  const container = document.getElementById("widget-container");
  startMessageSystem(container, config, false);

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
    display: "flex",
    flexDirection: "column",
    position: "absolute",
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

  // Animate in
  requestAnimationFrame(() => {
    bubble.classList.add("in-" + cfg.inEffect);
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
  startPreview();
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

// ---- Config changed: rebuild preview ----
function onConfigChange() {
  rebuildPreviewContainer();
}

// ============================================================
//  PREVIEW SYSTEM
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

let previewContainer = null;
let previewInterval = null;
let fakeIndex = 0;
let previewMessages = [];
let previewTimers = [];

function startPreview() {
  rebuildPreviewContainer();
  scheduleNextFakeMessage();
}

function rebuildPreviewContainer() {
  const screen = document.getElementById("preview-screen");

  // Remove old container
  if (previewContainer) {
    previewContainer.remove();
  }
  previewMessages = [];
  previewTimers.forEach(clearTimeout);
  previewTimers = [];

  previewContainer = document.createElement("div");
  previewContainer.style.cssText = "position:absolute; display:flex; pointer-events:none;";
  screen.appendChild(previewContainer);

  currentCfg = config;
  msgContainer = previewContainer;
  msgQueue = previewMessages;
  isAnchorBottom = config.position.startsWith("bottom");

  applyPreviewPosition(previewContainer, config, screen);
}

function applyPreviewPosition(el, cfg, screen) {
  const pad = 30;
  const pos = cfg.position;
  isAnchorBottom = pos.startsWith("bottom");

  Object.assign(el.style, {
    top: "", bottom: "", left: "", right: "",
    transform: "",
    flexDirection: isAnchorBottom ? "column-reverse" : "column",
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
  (map[pos] || map["bottom-right"])();
}

function scheduleNextFakeMessage() {
  clearTimeout(previewInterval);
  previewInterval = setTimeout(() => {
    const msg = FAKE_MESSAGES[fakeIndex % FAKE_MESSAGES.length];
    fakeIndex++;
    pushPreviewMessage(msg.user, msg.text);
    scheduleNextFakeMessage();
  }, 2200);
}

function pushPreviewMessage(username, text) {
  const cfg = config;
  const max = cfg.maxMessages;

  // Remove oldest if at capacity
  while (previewMessages.length >= max) {
    const oldest = previewMessages.shift();
    forceRemoveBubble(oldest, cfg);
  }

  const bubble = createBubble(username, text, null, cfg);
  previewContainer.appendChild(bubble);
  previewMessages.push(bubble);

  requestAnimationFrame(() => {
    bubble.classList.add("in-" + cfg.inEffect);
  });

  const tid = setTimeout(() => {
    removeBubble(bubble, cfg);
    previewMessages = previewMessages.filter(b => b !== bubble);
  }, cfg.duration);
  previewTimers.push(tid);
  bubble._timer = tid;
}

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
