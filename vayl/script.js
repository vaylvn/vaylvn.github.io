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

/* ------------------------ Sidebar ----------------------- */

function buildSidebar(root) {
  const sidebar = document.getElementById("sidebar");
  sidebar.innerHTML = "";

  // Console button
  const consoleBtn = document.createElement("div");
  consoleBtn.className = "sidebar-item";
  consoleBtn.textContent = "Console";
  consoleBtn.onclick = () => showConsole();
  sidebar.appendChild(consoleBtn);

  for (const group of root) {
    const title = document.createElement("div");
    title.className = "sidebar-title";
    title.textContent = group.name;
    sidebar.appendChild(title);

    if (group.files) {
      group.files.forEach(f => addFileEntry(sidebar, f));
    }

    if (group.dynamic) {
      group.dynamic.forEach(f => addFileEntry(sidebar, f));
    }
  }
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
