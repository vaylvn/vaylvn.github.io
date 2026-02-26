// ===== URL CONFIG =====
const params = new URLSearchParams(window.location.search);
const POSITION = (params.get("position") || "top-left").toLowerCase();

const CHANNEL = params.get("channel") || "default_channel";
const DURATION = parseInt(params.get("duration")) || 300; // ms message stays
const EXIT_SPEED = 2000; // faster exit when interrupted
const FADE = parseInt(params.get("fade")) || 1000;

// ===== DOM =====
let container = document.getElementById("single-message");

if (!container) {
  container = document.createElement("div");
  container.id = "single-message";
  document.body.appendChild(container);
}

const style = document.createElement("style");
style.innerHTML = `
  .single-message.hide {
    animation: vaylFadeUp ${FADE}ms ease forwards;
  }
`;
document.head.appendChild(style);

// ✅ MUST be here
applyPosition(container, POSITION);
container.dataset.position = POSITION;

// ===== STATE =====
let currentMessageEl = null;
let hideTimeout = null;

// ===== MESSAGE SYSTEM =====
function showMessage(username, message) {
  // Kill existing immediately (prevents stacking)
  if (currentMessageEl) {
    currentMessageEl.remove();
    currentMessageEl = null;
  }

  clearTimeout(hideTimeout);

  const el = document.createElement("div");
  el.className = "single-message";

  el.innerHTML = `
    <span class="username">${escapeHtml(username)}</span>
    <span class="message">${escapeHtml(message)}</span>
  `;

  container.appendChild(el);

  requestAnimationFrame(() => {
    el.classList.add("show");
  });

  currentMessageEl = el;

  hideTimeout = setTimeout(() => {
    removeMessage(el);
  }, DURATION);
}

function applyPosition(el, position) {
  // Reset everything first (critical fix)
  Object.assign(el.style, {
    top: "",
    bottom: "",
    left: "",
    right: "",
    transform: ""
  });

  const map = {
    "top-left":    () => { el.style.top = "40px"; el.style.left = "40px"; },
    "top-center":  () => { el.style.top = "40px"; el.style.left = "50%"; el.style.transform = "translateX(-50%)"; },
    "top-right":   () => { el.style.top = "40px"; el.style.right = "40px"; },

    "middle-left":   () => { el.style.top = "50%"; el.style.left = "40px"; el.style.transform = "translateY(-50%)"; },
    "center":        () => { el.style.top = "50%"; el.style.left = "50%"; el.style.transform = "translate(-50%, -50%)"; },
    "middle-right":  () => { el.style.top = "50%"; el.style.right = "40px"; el.style.transform = "translateY(-50%)"; },

    "bottom-left":   () => { el.style.bottom = "40px"; el.style.left = "40px"; },
    "bottom-center": () => { el.style.bottom = "40px"; el.style.left = "50%"; el.style.transform = "translateX(-50%)"; },
    "bottom-right":  () => { el.style.bottom = "40px"; el.style.right = "40px"; }
  };

  (map[position] || map["top-left"])();
}


function removeMessage(el) {
  el.classList.add("hide");

  setTimeout(() => {
    if (el === currentMessageEl) {
      currentMessageEl = null;
    }
    el.remove();
  }, FADE);
}

function forceRemoveCurrent() {
  if (!currentMessageEl) return;

  clearTimeout(hideTimeout);

  const el = currentMessageEl;

  el.classList.remove("show");
  el.classList.add("hide");

  setTimeout(() => {
    if (el === currentMessageEl) {
      el.remove();
      currentMessageEl = null;
    }
  }, 200); // fast interrupt
}

// ===== UTILS =====
function escapeHtml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// ===== TWITCH CLIENT =====
const client = new tmi.Client({
  channels: [CHANNEL]
});

client.connect();

// ===== MESSAGE HOOK =====
client.on("message", (channel, tags, message, self) => {
  if (self) return;

  const username = tags["display-name"] || tags.username;

  showMessage(username, message);
});