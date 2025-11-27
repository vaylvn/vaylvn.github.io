/* ============================================== */
/*                WEBSOCKET SETUP                 */
/* ============================================== */

let socket = null;
let editor = null;
let currentFilePath = null;

function connectWebSocket() {
    socket = new WebSocket("ws://localhost:8765");

    socket.onopen = () => {
        console.log("Connected to backend");
    };

    socket.onmessage = (event) => {
        handleServerMessage(event.data);
    };

    socket.onclose = () => {
        console.log("Socket closed, reconnecting...");
        setTimeout(connectWebSocket, 1500);
    };
}

connectWebSocket();


/* ============================================== */
/*               CONSOLE HANDLING                 */
/* ============================================== */

function handleServerMessage(msg) {
    // If JSON, might be a directory update
    if (msg.startsWith("{") || msg.startsWith("[")) {
        try {
            let data = JSON.parse(msg);

            // directory tree
            if (data.virtual_tree) {
                buildSidebar(data.virtual_tree);
                return;
            }

        } catch {
            // fallback to plain console
        }
    }

    // Append to console panel
    const div = document.getElementById("console-output");
    div.textContent += msg + "\n";
    div.scrollTop = div.scrollHeight;
}

function showConsole() {
    switchMode("console");
}


/* ============================================== */
/*                MODE SWITCHING                  */
/* ============================================== */

function switchMode(mode) {
    document.querySelectorAll(".topbar-tab").forEach(t => t.classList.remove("active"));
    document.getElementById("tab-" + mode).classList.add("active");

    const consolePanel = document.getElementById("console-panel");
    const sidebar = document.getElementById("sidebar");
    const editorPanel = document.getElementById("editor-panel");

    if (mode === "console") {
        consolePanel.style.display = "block";
        sidebar.style.display = "none";
        editorPanel.style.display = "none";
        return;
    }

    if (mode === "config") {
        consolePanel.style.display = "none";
        sidebar.style.display = "block";
        editorPanel.style.display = "flex";
        return;
    }

    if (mode === "settings") {
        consolePanel.style.display = "none";
        sidebar.style.display = "none";
        editorPanel.style.display = "flex";
        loadSettingsPanel();
        return;
    }

    if (mode === "help") {
        consolePanel.style.display = "none";
        sidebar.style.display = "none";
        editorPanel.style.display = "flex";
        loadHelpPanel();
        return;
    }
}


/* ============================================== */
/*              SIDEBAR BUILDING                  */
/* ============================================== */

function buildSidebar(root) {
    const sidebar = document.getElementById("sidebar");
    sidebar.innerHTML = "";

    root.forEach((group, index) => {
        const header = document.createElement("div");
        header.className = "accordion-header";
        header.textContent = group.name;
        header.dataset.section = index;

        const content = document.createElement("div");
        content.className = "accordion-content";

        sidebar.appendChild(header);
        sidebar.appendChild(content);

        header.onclick = () => toggleAccordion(header, content);

        if (group.files) {
            group.files.forEach(f => addFileEntry(content, f));
        }

        if (group.dynamic) {
            group.dynamic.forEach(f => addFileEntry(content, f));
        }

        if (group.groups) {
            group.groups.forEach(group2 => {
                const sub = document.createElement("div");
                sub.className = "sidebar-subtitle";
                sub.textContent = group2.type;
                content.appendChild(sub);

                group2.files.forEach(f => addFileEntry(content, f));
            });
        }
    });
}

function toggleAccordion(header, content) {
    const isOpen = content.style.display === "block";
    closeAllAccordion();
    if (!isOpen) {
        content.style.display = "block";
        header.classList.add("open");
    }
}

function closeAllAccordion() {
    document.querySelectorAll(".accordion-content").forEach(c => c.style.display = "none");
    document.querySelectorAll(".accordion-header").forEach(h => h.classList.remove("open"));
}


/* ============================================== */
/*             SIDEBAR FILE ENTRIES               */
/* ============================================== */

let contextFile = null;

function addFileEntry(container, file) {
    const row = document.createElement("div");
    row.className = "sidebar-file-row";

    const item = document.createElement("div");
    item.className = "sidebar-item";
    item.textContent = file.display;
    item.onclick = () => requestFile(file.path);

    const menu = document.createElement("div");
    menu.className = "file-menu-icon";
    menu.innerHTML = "⋮";
    menu.onclick = (e) => {
        e.stopPropagation();
        openContextMenu(e, file);
    };

    row.appendChild(item);
    row.appendChild(menu);
    container.appendChild(row);
}


/* ============================================== */
/*               CONTEXT MENU UX                  */
/* ============================================== */

function openContextMenu(e, file) {
    contextFile = file;

    const menu = document.getElementById("context-menu");
    menu.classList.remove("hidden");

    menu.style.top = e.clientY + "px";
    menu.style.left = e.clientX + "px";
}

window.addEventListener("click", () => {
    document.getElementById("context-menu").classList.add("hidden");
});

function contextRename() {
    renameFile(contextFile);
}

function contextDelete() {
    deleteFile(contextFile);
}


/* ============================================== */
/*                  FILE I/O                      */
/* ============================================== */

function requestFile(path) {
    currentFilePath = path;
    socket.send(JSON.stringify({ type: "read", path }));
}

function handleFileContent(content) {
    editor.setValue(content);
}

function saveFile() {
    if (!currentFilePath) return;

    socket.send(JSON.stringify({
        type: "write",
        path: currentFilePath,
        content: editor.getValue()
    }));
}

function renameFile(fileObj) {
    alert("Rename coming soon.");
}

function deleteFile(fileObj) {
    alert("Delete coming soon.");
}


/* ============================================== */
/*                SETTINGS & HELP                 */
/* ============================================== */

function loadSettingsPanel() {
    editor.setValue("# Settings panel will go here\n");
}

function loadHelpPanel() {
    editor.setValue("# Help / documentation will go here\n");
}


/* ============================================== */
/*               MONACO INITIALISATION            */
/* ============================================== */

require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' }});

require(["vs/editor/editor.main"], function () {
    editor = monaco.editor.create(document.getElementById("editor"), {
        value: "",
        language: "yaml",
        theme: "vs-dark",
        automaticLayout: true,
        fontSize: 14,
        minimap: { enabled: false }
    });
});


/* ============================================== */
/*          HANDLE MESSAGES FROM SERVER           */
/* ============================================== */

socket.addEventListener("message", (event) => {
    try {
        const data = JSON.parse(event.data);

        if (data.type === "file") {
            handleFileContent(data.content);
            return;
        }

        if (data.virtual_tree) {
            buildSidebar(data.virtual_tree);
            return;
        }
    } catch {
        handleServerMessage(event.data);
    }
});
