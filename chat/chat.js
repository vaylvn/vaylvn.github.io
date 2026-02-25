// ===== URL CONFIG =====
const params = new URLSearchParams(window.location.search);

const CHANNEL = params.get("channel") || "default_channel";
const DURATION = parseInt(params.get("duration")) || 300; // ms message stays
const EXIT_SPEED = 2000; // faster exit when interrupted
const POSITION = (params.get("position") || "top-left").toLowerCase();

// ===== DOM =====
let container = document.getElementById("single-message");

if (!container) {
  container = document.createElement("div");
  container.id = "single-message";
  document.body.appendChild(container);
}

applyPosition(container, POSITION);
container.dataset.position = POSITION;

// ===== STATE =====
let currentMessageEl = null;
let hideTimeout = null;

// ===== MESSAGE SYSTEM =====
function showMessage(username, message) {
  // Force existing message out immediately
  if (currentMessageEl) {
    forceRemoveCurrent();
  }

  const el = document.createElement("div");
  el.className = "single-message";

  el.innerHTML = `
    <span class="username">${escapeHtml(username)}</span>
    <span class="message">${escapeHtml(message)}</span>
  `;

  container.appendChild(el);

  // Trigger animation
  requestAnimationFrame(() => {
    el.classList.add("show");
  });

  currentMessageEl = el;

  // Schedule removal
  hideTimeout = setTimeout(() => {
    removeMessage(el);
  }, DURATION);
}

function applyPosition(el, position) {
  const styles = {
    "top-left":    { top: "40px", left: "40px" },
    "top-center":  { top: "40px", left: "50%", transform: "translateX(-50%)" },
    "top-right":   { top: "40px", right: "40px" },

    "middle-left":   { top: "50%", left: "40px", transform: "translateY(-50%)" },
    "center":        { top: "50%", left: "50%", transform: "translate(-50%, -50%)" },
    "middle-right":  { top: "50%", right: "40px", transform: "translateY(-50%)" },

    "bottom-left":   { bottom: "40px", left: "40px" },
    "bottom-center": { bottom: "40px", left: "50%", transform: "translateX(-50%)" },
    "bottom-right":  { bottom: "40px", right: "40px" }
  };

  const config = styles[position] || styles["top-left"];

  Object.assign(el.style, {
    position: "fixed",
    ...config
  });
}


function removeMessage(el) {
  el.classList.remove("show");
  el.classList.add("hide");

  setTimeout(() => {
    if (el === currentMessageEl) {
      currentMessageEl = null;
    }
    el.remove();
  }, 2000); // match CSS animation
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
  }, EXIT_SPEED);
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