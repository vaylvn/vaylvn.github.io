// ===== URL CONFIG =====
const params = new URLSearchParams(window.location.search);

const CHANNEL = params.get("channel") || "default_channel";
const DURATION = parseInt(params.get("duration")) || 300; // ms message stays
const EXIT_SPEED = 300; // faster exit when interrupted

// ===== DOM =====
let container = document.getElementById("single-message");

if (!container) {
  container = document.createElement("div");
  container.id = "single-message";
  document.body.appendChild(container);
}

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

function removeMessage(el) {
  el.classList.remove("show");
  el.classList.add("hide");

  setTimeout(() => {
    if (el === currentMessageEl) {
      currentMessageEl = null;
    }
    el.remove();
  }, 400); // match CSS animation
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