// ===== Basic config =====
const CHANNEL_NAME = "valonvn"; // hard-coded as requested

// DOM references
const chatContainer = document.getElementById("chat-container");
const isolateOverlay = document.getElementById("isolate-overlay");
const isolateContent = document.getElementById("isolate-content");

// ===== tmi.js client setup (anonymous, read-only) =====
const client = new tmi.Client({
  options: { debug: false },
  connection: {
    secure: true,
    reconnect: true
  },
  channels: [CHANNEL_NAME]
});

client.connect().catch(console.error);

// ===== Message handling =====
client.on("message", (channel, tags, message, self) => {
  if (self) return;
  addChatMessage(tags, message);
});

function addChatMessage(tags, message) {
  const line = document.createElement("div");
  line.className = "chat-line";

  line.dataset.username = tags["display-name"] || tags.username || "";
  line.dataset.color = tags.color || "#ffffff";
  line.dataset.message = message;

  const usernameSpan = document.createElement("span");
  usernameSpan.className = "chat-username";
  usernameSpan.textContent = line.dataset.username || tags.username || "unknown";
  if (tags.color) {
    usernameSpan.style.color = tags.color;
  }

  const msgSpan = document.createElement("span");
  msgSpan.className = "chat-message";
  msgSpan.textContent = message;

  // ⬇⬇ WRAPPER FOR VERTICAL LAYOUT
  const inner = document.createElement("div");
  inner.className = "chat-inner";

  inner.appendChild(usernameSpan);
  inner.appendChild(msgSpan);

  line.appendChild(inner);

  // Click to isolate
  line.addEventListener("click", () => showIsolatedMessage(line));

  chatContainer.appendChild(line);
  autoScroll();
}




function autoScroll() {
  const threshold = 80; // px from bottom to still auto-scroll
  const distanceFromBottom =
    chatContainer.scrollHeight -
    chatContainer.scrollTop -
    chatContainer.clientHeight;

  if (distanceFromBottom < threshold) {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
}

// ===== Isolation logic =====
function showIsolatedMessage(line) {
  // Clear existing content
  isolateContent.innerHTML = "";

  const user = document.createElement("div");
  user.className = "chat-username";
  user.textContent = line.dataset.username || "";

  const msg = document.createElement("div");
  msg.className = "chat-message";
  msg.textContent = line.dataset.message || "";

  // Preserve username color if available
  const color = line.dataset.color;
  if (color) {
    user.style.color = color;
  }

  isolateContent.appendChild(user);
  isolateContent.appendChild(msg);

  isolateOverlay.classList.remove("hidden");
}

// Clicking anywhere on overlay closes it
isolateOverlay.addEventListener("click", () => {
  isolateOverlay.classList.add("hidden");
});

// Optional: ESC key to close isolation
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !isolateOverlay.classList.contains("hidden")) {
    isolateOverlay.classList.add("hidden");
  }
});
