let ws;
let monacoEditor = null;
let currentFile = null;

function connect() {
  ws = new WebSocket("ws://localhost:8765");

  ws.onopen = () => {
    ws.send(JSON.stringify({ action: "handshake" }));
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === "virtual_tree") buildSidebar(msg.root);
    if (msg.type === "file_content") openEditor(msg.path, msg.content);
    if (msg.type === "save_ok") showSaveToast();
    if (msg.type === "log") appendConsoleMessage(msg.text);
  };

  ws.onclose = () => setTimeout(connect, 1000);
}

connect();



function switchMode(mode) {
  // Update tab highlight
  document.querySelectorAll(".topbar-tab").forEach(t => t.classList.remove("active"));
  document.getElementById("tab-" + mode).classList.add("active");

  // Modes
  if (mode === "console") {
    document.getElementById("console-panel").style.display = "block";
    document.getElementById("sidebar").style.display = "none";
    document.getElementById("editor-panel").style.display = "none";
    return;
  }

  if (mode === "config") {
    document.getElementById("console-panel").style.display = "none";
    document.getElementById("sidebar").style.display = "block";
    document.getElementById("editor-panel").style.display = "block";
    return;
  }

  if (mode === "settings") {
    document.getElementById("console-panel").style.display = "none";
    document.getElementById("sidebar").style.display = "none";
    document.getElementById("editor-panel").style.display = "block";
    loadSettingsPanel();
    return;
  }

  if (mode === "help") {
    document.getElementById("console-panel").style.display = "none";
    document.getElementById("sidebar").style.display = "none";
    document.getElementById("editor-panel").style.display = "block";
    loadHelpPanel();
    return;
  }
}


/* ------------------------ Sidebar ----------------------- */

function buildSidebar(root) {
  const sidebar = document.getElementById("sidebar");
  sidebar.innerHTML = "";

  // --- CONSOLE BUTTON ---
  const consoleBtn = document.createElement("div");
  consoleBtn.className = "sidebar-item console-item";
  consoleBtn.textContent = "Console";
  consoleBtn.onclick = () => {
    closeAllAccordionSections();
    showConsole();
  };
  sidebar.appendChild(consoleBtn);

  // --- ACCORDION SECTIONS ---
  root.forEach((group, index) => {
    // Section header
    const header = document.createElement("div");
    header.className = "accordion-header";
    header.textContent = group.name;
    header.dataset.sectionIndex = index;
    sidebar.appendChild(header);

    // Section content wrapper
    const content = document.createElement("div");
    content.className = "accordion-content";
    content.style.display = "none"; // collapsed by default
    sidebar.appendChild(content);

    // Populate section content
    if (group.files) {
      group.files.forEach(f => addFileEntry(content, f));
    }

    if (group.dynamic) {
      group.dynamic.forEach(f => addFileEntry(content, f));
    }

    if (group.groups) {
      group.groups.forEach(sub => {
        const subtitle = document.createElement("div");
        subtitle.className = "sidebar-subtitle";
        subtitle.textContent = sub.type;
        content.appendChild(subtitle);

        sub.files.forEach(f => addFileEntry(content, f));
      });
    }

    // Click behavior for header
    header.onclick = () => toggleAccordionSection(header, content);
  });
}


// ---------------------------
// Accordion Control Functions
// ---------------------------

function toggleAccordionSection(header, content) {
  const isOpen = content.style.display === "block";

  // Close all other sections first (true accordion)
  closeAllAccordionSections();

  // Then open this one (if it was previously closed)
  if (!isOpen) {
    content.style.display = "block";
    header.classList.add("open");
  }
}

function closeAllAccordionSections() {
  document.querySelectorAll(".accordion-content").forEach(c => {
    c.style.display = "none";
  });
  document.querySelectorAll(".accordion-header").forEach(h => {
    h.classList.remove("open");
  });
}



function addFileEntry(sidebar, file) {
  const item = document.createElement("div");
  item.className = "sidebar-item";
  item.textContent = file.display;
  item.onclick = () => requestFile(file.path);
  sidebar.appendChild(item);
}

/* ------------------------ File IO ----------------------- */

function requestFile(path) {
  ws.send(JSON.stringify({ action: "open_file", path }));
}

function openEditor(path, content) {
  currentFile = path;

  document.getElementById("console-panel").classList.remove("visible");
  document.getElementById("editor-panel").classList.add("visible");

  monacoEditor.setValue(content);
}

document.getElementById("save-button").onclick = () => {
  if (!currentFile) return;
  ws.send(JSON.stringify({
    action: "save_file",
    path: currentFile,
    content: monacoEditor.getValue()
  }));
};

/* ------------------------ Console ----------------------- */

function appendConsoleMessage(text) {
  const out = document.getElementById("console-output");
  out.textContent += text + "\n";
  out.scrollTop = out.scrollHeight;
}

function showConsole() {
  document.getElementById("editor-panel").classList.remove("visible");
  document.getElementById("console-panel").classList.add("visible");
}

/* ------------------------ Monaco Editor ----------------------- */

require.config({ paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs" }});

require(["vs/editor/editor.main"], () => {
  monacoEditor = monaco.editor.create(document.getElementById("editor"), {
    theme: "vs-dark",
    language: "yaml",
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 14
  });
});

/* ------------------------ Toast ----------------------- */

function showSaveToast() {
  console.log("File saved.");
}
