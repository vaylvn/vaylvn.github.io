/**
 * app.js — Main application controller.
 * View switching, lobby logic, post-game, profile.
 * Entry point: App.init() called on DOMContentLoaded.
 */

// ─── App State ────────────────────────────────────────────────────────────────
const App = {
  currentView: null,
  currentRoom: null,    // { code, players, difficulty, lives, host_id, ... }

  init() {
    Auth.init();
    initGame();
    _bindNavigation();
    _registerAppHandlers();
    _checkUrlRoomCode();

    // Connect WebSocket
    const token = Auth.token;
    WS.connect(token);

    // Try to restore session from localStorage
    const storedUser = localStorage.getItem("speedoku_user");
    if (storedUser) {
      try {
        Auth.user = JSON.parse(storedUser);
        Auth.isGuest = false;
        this.showView("lobby-browser");
        this.updateHeaderUser();
      } catch {
        this.showView("home");
      }
    } else {
      this.showView("home");
    }
  },

  showView(name) {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    const el = document.getElementById(`view-${name}`);
    if (el) el.classList.add("active");
    this.currentView = name;
  },

  updateHeaderUser() {
    const el = document.getElementById("header-username");
    if (!el) return;
    if (Auth.user) {
      el.textContent = Auth.user.username;
    } else {
      el.textContent = "Guest";
    }
  },
};

// ─── Navigation / Button Bindings ────────────────────────────────────────────

function _bindNavigation() {
  // Home
  document.getElementById("btn-play-guest").addEventListener("click", () => {
    Auth.isGuest = true;
    Auth.user = null;
    App.showView("lobby-browser");
    App.updateHeaderUser();
    WS.connect(); // connect without token
    showToast("Playing as Guest — casual/private rooms only");
  });
  document.getElementById("btn-sign-in").addEventListener("click", () => {
    App.showView("auth");
    document.querySelector('[data-tab="login"]').click();
    WS.connect();
  });
  document.getElementById("btn-create-account").addEventListener("click", () => {
    App.showView("auth");
    document.querySelector('[data-tab="register"]').click();
    WS.connect();
  });
  document.getElementById("btn-how-to-play").addEventListener("click", () => {
    document.getElementById("modal-how-to-play").classList.remove("hidden");
  });

  // Auth back
  document.getElementById("auth-back").addEventListener("click", () => App.showView("home"));

  // How-to-play modal close
  document.getElementById("btn-close-how-to-play").addEventListener("click", () => {
    document.getElementById("modal-how-to-play").classList.add("hidden");
  });
  document.getElementById("btn-close-how-to-play-2").addEventListener("click", () => {
    document.getElementById("modal-how-to-play").classList.add("hidden");
  });
  document.getElementById("modal-how-to-play").addEventListener("click", e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add("hidden");
  });

  // Lobby Browser
  document.getElementById("btn-quick-match").addEventListener("click", () => {
    if (Auth.isGuest) { showToast("Ranked requires an account.", "error"); return; }
    WS.send({ type: "join_queue", mode: "ranked" });
  });
  document.getElementById("btn-quick-casual").addEventListener("click", () => {
    WS.send({ type: "join_queue", mode: "casual" });
  });
  document.getElementById("btn-create-room").addEventListener("click", () => {
    WS.send({ type: "create_room", difficulty: "medium", private: true, lives: 0 });
  });
  document.getElementById("btn-leave-queue").addEventListener("click", () => {
    WS.send({ type: "leave_queue" });
    _hideMatchmaking();
  });
  document.getElementById("btn-join-room-code").addEventListener("click", _joinByCode);
  document.getElementById("join-room-code").addEventListener("keydown", e => {
    if (e.key === "Enter") _joinByCode();
  });

  document.getElementById("btn-profile").addEventListener("click", () => {
    if (!Auth.user) return;
    WS.send({ type: "get_profile", user_id: Auth.user.id });
  });
  document.getElementById("btn-logout").addEventListener("click", () => {
    Auth.logout();
    App.showView("home");
  });

  // Room Lobby
  document.getElementById("btn-leave-room").addEventListener("click", () => {
    App.currentRoom = null;
    App.showView("lobby-browser");
    WS.send({ type: "get_rooms" });
  });
  document.getElementById("btn-copy-invite").addEventListener("click", () => {
    const code = App.currentRoom && App.currentRoom.code;
    if (!code) return;
    const url = `${location.origin}${location.pathname}?room=${code}`;
    navigator.clipboard.writeText(url).then(() => showToast("Invite link copied!", "success"));
  });
  document.getElementById("btn-start-game").addEventListener("click", () => {
    WS.send({ type: "start_game" });
  });
  document.getElementById("btn-ready").addEventListener("click", () => {
    WS.send({ type: "ready" });
  });

  // Difficulty buttons
  document.getElementById("difficulty-select").addEventListener("click", e => {
    const btn = e.target.closest("[data-diff]");
    if (!btn) return;
    document.querySelectorAll("#difficulty-select [data-diff]").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    WS.send({ type: "update_room", difficulty: btn.dataset.diff });
  });

  // Lives buttons
  document.getElementById("lives-select").addEventListener("click", e => {
    const btn = e.target.closest("[data-lives]");
    if (!btn) return;
    document.querySelectorAll("#lives-select [data-lives]").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    WS.send({ type: "update_room", lives: parseInt(btn.dataset.lives) });
  });

  // Post-game
  document.getElementById("btn-play-again").addEventListener("click", () => {
    App.showView("lobby-browser");
    WS.send({ type: "get_rooms" });
  });
  document.getElementById("btn-back-lobby").addEventListener("click", () => {
    App.showView("lobby-browser");
    WS.send({ type: "get_rooms" });
  });

  // Profile
  document.getElementById("btn-profile-back").addEventListener("click", () => {
    App.showView("lobby-browser");
  });
}

// ─── WS App Handlers ─────────────────────────────────────────────────────────

function _registerAppHandlers() {
  WS.on("_connected", () => {
    if (App.currentView === "lobby-browser") {
      WS.send({ type: "get_rooms" });
    }
  });

  WS.on("_disconnected", () => {
    showToast("Connection lost. Reconnecting…", "error");
  });

  WS.on("_reconnect_failed", () => {
    showToast("Could not reconnect to server.", "error");
  });

  WS.on("error", msg => {
    // Only show toasts if not in auth view (auth.js handles those)
    const active = document.querySelector(".view.active");
    if (!active || active.id !== "view-auth") {
      showToast(msg.message, "error");
    }
  });

  // ─── Matchmaking ───────────────────────────────────────────────────────────

  WS.on("queue_joined", msg => {
    _showMatchmaking(`Finding ${msg.mode} opponent…`);
  });

  WS.on("queue_left", () => _hideMatchmaking());

  WS.on("match_found", msg => {
    _hideMatchmaking();
    App.currentRoom = { code: msg.room_code };
    showToast(`Matched vs ${msg.opponent.username} (${msg.opponent.elo})`, "success");
  });

  // ─── Room ──────────────────────────────────────────────────────────────────

  WS.on("room_created", msg => {
    App.currentRoom = msg.room;
    _renderRoomLobby(msg.room);
    App.showView("room-lobby");
  });

  WS.on("room_joined", msg => {
    if (msg.puzzle) {
      // This is the game-start version of room_joined (puzzle included)
      _startGameFromRoomJoined(msg);
    } else {
      App.currentRoom = msg.room || { code: msg.code };
      if (msg.room) _renderRoomLobby(msg.room);
      App.showView("room-lobby");
    }
  });

  WS.on("player_joined", msg => {
    if (!App.currentRoom) return;
    App.currentRoom.players = App.currentRoom.players || [];
    App.currentRoom.players.push(msg.player);
    _renderPlayerList(App.currentRoom);
    showToast(`${msg.player.username} joined the room`);
  });

  WS.on("player_ready", msg => {
    if (!App.currentRoom || !App.currentRoom.players) return;
    const p = App.currentRoom.players.find(pl => pl.id === msg.player_id);
    if (p) p.ready = true;
    _renderPlayerList(App.currentRoom);
  });

  WS.on("room_updated", msg => {
    App.currentRoom = msg.room;
    _renderRoomLobby(msg.room);
  });

  // ─── Game ──────────────────────────────────────────────────────────────────

  WS.on("game_start", msg => {
    // Countdown is handled in game.js
    // But we also need to show the game view if room_joined already sent the puzzle
    if (App.currentView !== "game") App.showView("game");
  });

  WS.on("game_over", msg => {
    Game.stop();
    _renderPostGame(msg);
    setTimeout(() => App.showView("post-game"), 800);
  });

  WS.on("elo_update", msg => {
    if (Auth.user) {
      Auth.user.elo = msg.new_elo;
      localStorage.setItem("speedoku_user", JSON.stringify(Auth.user));
    }
  });

  // ─── Lobby ─────────────────────────────────────────────────────────────────

  WS.on("room_list", msg => {
    _renderRoomList(msg.rooms);
  });

  WS.on("profile", msg => {
    _renderProfile(msg.profile);
    App.showView("profile");
  });
}

// ─── Room Lobby UI ────────────────────────────────────────────────────────────

function _renderRoomLobby(room) {
  App.currentRoom = room;
  document.getElementById("room-code-label").textContent = room.code;

  const isHost = Auth.user && room.host_id === Auth.user.id;
  document.getElementById("btn-start-game").classList.toggle("hidden", !isHost);
  document.getElementById("btn-ready").classList.toggle("hidden", isHost);
  document.getElementById("room-controls").classList.toggle("hidden", !isHost);

  // Set difficulty buttons
  document.querySelectorAll("#difficulty-select [data-diff]").forEach(b => {
    b.classList.toggle("active", b.dataset.diff === room.difficulty);
  });

  // Set lives buttons
  document.querySelectorAll("#lives-select [data-lives]").forEach(b => {
    b.classList.toggle("active", parseInt(b.dataset.lives) === room.lives);
  });

  _renderPlayerList(room);
}

function _renderPlayerList(room) {
  const container = document.getElementById("lobby-player-list");
  if (!container || !room.players) return;
  container.innerHTML = "";
  room.players.forEach(p => {
    const row = document.createElement("div");
    row.className = "player-row";

    const name = document.createElement("span");
    name.className = "player-row-name";
    name.textContent = p.username;

    const elo = document.createElement("span");
    elo.className = "player-row-elo";
    elo.textContent = p.is_guest ? "Guest" : p.elo;

    const ready = document.createElement("span");
    ready.className = `player-row-ready${p.ready ? " is-ready" : ""}`;
    ready.textContent = p.ready ? "Ready" : "Waiting";

    if (p.id === room.host_id) {
      const badge = document.createElement("span");
      badge.className = "host-badge";
      badge.textContent = "Host";
      row.appendChild(badge);
    }
    row.appendChild(name);
    row.appendChild(elo);
    row.appendChild(ready);
    container.appendChild(row);
  });
}

// ─── Game Start ───────────────────────────────────────────────────────────────

function _startGameFromRoomJoined(msg) {
  const room = App.currentRoom || {};
  const lives = room.lives || 0;
  Game.init(msg.puzzle, msg.given_cells, lives);

  // Register opponents
  const myId = Auth.user ? String(Auth.user.id) : null;
  const players = msg.players || [];
  document.getElementById("opponents-section").innerHTML = "";

  players.forEach(p => {
    const pid = String(p.id);
    if (pid !== myId) {
      Game.addOpponent(pid, p.username, p.filled_count || 0, msg.given_cells);
    }
  });

  App.showView("game");
}

// ─── Room List ────────────────────────────────────────────────────────────────

function _renderRoomList(rooms) {
  const container = document.getElementById("room-list");
  if (!rooms || rooms.length === 0) {
    container.innerHTML = '<div class="room-list-empty">No open rooms. Create one!</div>';
    return;
  }
  container.innerHTML = "";
  rooms.forEach(r => {
    const card = document.createElement("div");
    card.className = "room-card";
    card.innerHTML = `
      <span class="room-card-code">${_escapeHtml(r.code)}</span>
      <span class="room-card-diff">${_escapeHtml(r.difficulty)}</span>
      ${r.lives > 0 ? `<span class="room-card-diff">${r.lives} lives</span>` : ""}
      <span class="room-card-players">${r.player_count}/8 players</span>
    `;
    card.addEventListener("click", () => {
      WS.send({ type: "join_room", code: r.code });
    });
    container.appendChild(card);
  });
}

// ─── Post Game ────────────────────────────────────────────────────────────────

function _renderPostGame(msg) {
  const myId = Auth.user ? String(Auth.user.id) : null;
  const isWinner = myId && String(msg.winner_id) === myId;

  document.getElementById("result-title").textContent = isWinner ? "Victory!" : "Game Over";

  const winnerResult = msg.results && msg.results[0];
  document.getElementById("result-winner").textContent =
    winnerResult ? `${winnerResult.username} wins` : "";

  // ELO delta — filled by elo_update handler
  const deltaEl = document.getElementById("elo-delta");
  deltaEl.textContent = "";
  WS.on("elo_update", function handler(eloMsg) {
    const sign = eloMsg.delta >= 0 ? "+" : "";
    deltaEl.textContent = `${sign}${eloMsg.delta} ELO`;
    deltaEl.className = `elo-delta ${eloMsg.delta >= 0 ? "positive" : "negative"}`;
    WS.off("elo_update"); // one-shot
  });

  const list = document.getElementById("results-list");
  list.innerHTML = "";
  (msg.results || []).forEach((r, i) => {
    const row = document.createElement("div");
    row.className = "result-row";
    row.innerHTML = `
      <span class="result-rank${i === 0 ? " winner" : ""}">#${i + 1}</span>
      <span class="result-name">${_escapeHtml(r.username)}</span>
      <span class="result-fill">${r.filled_count}/81 cells</span>
    `;
    list.appendChild(row);
  });
}

// ─── Profile ──────────────────────────────────────────────────────────────────

function _renderProfile(profile) {
  document.getElementById("profile-username").textContent = profile.username;
  document.getElementById("profile-elo").textContent = profile.elo;
  document.getElementById("profile-tier").textContent = profile.tier;
  document.getElementById("stat-games").textContent = profile.games_played;
  document.getElementById("stat-wins").textContent = profile.wins;
  document.getElementById("stat-winrate").textContent = (profile.win_rate * 100).toFixed(1) + "%";
  const avg = profile.avg_time_seconds;
  document.getElementById("stat-avgtime").textContent =
    avg > 0 ? `${Math.floor(avg / 60)}:${String(Math.floor(avg % 60)).padStart(2, "0")}` : "—";

  const recentList = document.getElementById("recent-games-list");
  recentList.innerHTML = "";
  (profile.recent_games || []).forEach(g => {
    const row = document.createElement("div");
    row.className = "recent-game-row";
    const delta = g.elo_after - g.elo_before;
    const sign = delta >= 0 ? "+" : "";
    row.innerHTML = `
      <span class="rgr-result ${g.result === "win" ? "win" : "loss"}">${g.result.toUpperCase()}</span>
      <span>${g.difficulty || "—"}</span>
      <span>${g.mode || "—"}</span>
      <span class="rgr-delta ${delta >= 0 ? "pos" : "neg"}">${sign}${delta} ELO</span>
    `;
    recentList.appendChild(row);
  });
}

// ─── Matchmaking UI ───────────────────────────────────────────────────────────

function _showMatchmaking(label) {
  document.getElementById("matchmaking-status").classList.remove("hidden");
  document.getElementById("mm-label").textContent = label;
  document.getElementById("browser-actions") &&
    document.getElementById("browser-actions").querySelector(".btn-primary") &&
    (document.getElementById("browser-actions").querySelector(".btn-primary").disabled = true);
}

function _hideMatchmaking() {
  document.getElementById("matchmaking-status").classList.add("hidden");
  const btn = document.querySelector(".browser-actions .btn-primary");
  if (btn) btn.disabled = false;
}

// ─── URL Room Code ────────────────────────────────────────────────────────────

function _checkUrlRoomCode() {
  const params = new URLSearchParams(location.search);
  const code = params.get("room");
  if (code) {
    // Auto-join after connecting
    const unsub = WS.on("_connected", () => {
      WS.send({ type: "join_room", code });
      unsub();
    });
  }
}

function _joinByCode() {
  const input = document.getElementById("join-room-code");
  const code = input.value.trim().toUpperCase();
  if (code.length !== 6) {
    showToast("Enter a 6-character room code", "error");
    return;
  }
  WS.send({ type: "join_room", code });
  input.value = "";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => App.init());
