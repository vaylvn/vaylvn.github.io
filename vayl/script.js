/* ============================================== */
/*                GLOBAL STATE                    */
/* ============================================== */

let socket = null;
let editor = null;
let monacoLoaded = false;
let currentFilePath = null;
let contextFile = null;


/* ============================================== */
/*                WEBSOCKET SETUP                 */
/* ============================================== */

function connectWebSocket() {
    socket = new WebSocket("ws://localhost:8765");

    socket.onopen = () => {
        console.log("Connected to backend");
    };

    socket.onmessage = (event) => {
        handleWebSocketMessage(event.data);
    };

    socket.onclose = () => {
        console.log("Socket closed, retrying...");
        setTimeout(connectWebSocket, 1500);
    };
}

connectWebSocket();


/* ============================================== */
/*             WEBSOCKET MESSAGE HANDLER          */
/* ============================================== */

function handleWebSocketMessage(msg) {
    try {
        const data = JSON.parse(msg);

        // Directory tree
        if (data.virtual_tree) {
            buildSidebar(data.virtual_tree);
            return;
        }

        // File content
        if (data.type === "file") {
            handleFileContent(data.content);
            return;
        }

    } catch {
        // Plain console log
        appendToConsole(msg);
    }
}


/* ============================================== */
/*                CONSOLE OUTPUT                  */
/* ============================================== */

function appendToConsole(text) {
    const out = document.getElementById("console-output");
    out.textContent += text + "\n";
    out.scrollTop = out.scrollHeight;
}


/* ============================================== */
/*                MODE SWITCHING                  */
/* ============================================== */

function switchMode(mode) {
    document.querySelectorAll(".topbar-tab")
        .forEach(t => t.classList.remove("active"));
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
        initMonaco();
        return;
    }

    if (mode === "settings") {
        consolePanel.style.display = "none";
        sidebar.style.display = "none";
        editorPanel.style.display = "flex";
        initMonaco();
        loadSettingsPanel();
        return;
    }

    if (mode === "help") {
        consolePanel.style.display = "none";
        sidebar.style.display = "none";
        editorPanel.style.display = "flex";
        initMonaco();
        loadHelpPanel();
        return;
    }
}


/* ============================================== */
/*                MONACO SETUP                    */
/* ============================================== */

function initMonaco() {
    if (monacoLoaded) {
        // Already created, just resize it
        setTimeout(() => editor.layout(), 50);
        return;
    }

    require.config({
        paths: {
            'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs'
        }
    });

    require(["vs/editor/editor.main"], function () {
        editor = monaco.editor.create(document.getElementById("editor"), {
            value: "",
            language: "yaml",
            theme: "vs-dark",
            automaticLayout: true,
            minimap: { enabled: false },
            fontSize: 14
        });

        monacoLoaded = true;
        setTimeout(() => editor.layout(), 50);
    });
}


/* ============================================== */
/*              FILE I/O HANDLING                 */
/* ============================================== */

function requestFile(path) {
    currentFilePath = path;

    socket.send(JSON.stringify({
        type: "read",
        path: path
    }));
}

function handleFileContent(content) {
    document.getElementById("editor-toolbar").style.display = "flex";

    editor.setValue(content);

    // Ensure visible in case the panel resized
    setTimeout(() => editor.layout(), 50);
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
    alert("Rename dialog coming soon.");
}

function deleteFile(fileObj) {
    alert("Delete dialog coming soon.");
}


/* ============================================== */
/*          SETTINGS / HELP PLACEHOLDERS          */
/* ============================================== */

function loadSettingsPanel() {
    editor.setValue("# Settings panel goes here");
}

function loadHelpPanel() {
    editor.setValue("# Help / documentation goes here");
}


/* ============================================== */
/*             SIDEBAR (ACCORDION)                */
/* ============================================== */

function buildSidebar(root) {
    const sidebar = document.getElementById("sidebar");
    sidebar.innerHTML = "";

    root.forEach((group) => {
        const header = document.createElement("div");
        header.className = "accordion-header";
        header.textContent = group.name;

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
            group.groups.forEach(sub => {
                const subtitle = document.createElement("div");
                subtitle.className = "sidebar-subtitle";
                subtitle.textContent = sub.type;
                content.appendChild(subtitle);

                sub.files.forEach(f => addFileEntry(content, f));
            });
        }
    });
}



const EDITABLE_DIRS = ["variables", "conditionals", "actionpacks"];

function canModifyFile(path) {
    return EDITABLE_DIRS.some(dir => path.startsWith(dir + "/"));
}



function toggleAccordion(header, content) {
    const isOpen = content.style.display === "block";
    closeAllAccordions();

    if (!isOpen) {
        content.style.display = "block";
        header.classList.add("open");
    }
}

function closeAllAccordions() {
    document.querySelectorAll(".accordion-content")
        .forEach(c => c.style.display = "none");

    document.querySelectorAll(".accordion-header")
        .forEach(h => h.classList.remove("open"));
}


/* ============================================== */
/*           SIDEBAR FILE ENTRIES                 */
/* ============================================== */

function addFileEntry(parent, file) {
    const row = document.createElement("div");
    row.className = "sidebar-file-row";

    const item = document.createElement("div");
    item.className = "sidebar-item";
    item.textContent = file.name;

    const menu = document.createElement("div");
    menu.className = "file-menu-icon";
    menu.textContent = "⋮";

    // Always load file on click
    item.onclick = () => loadFile(file.path);

    // Only allow rename/delete for files inside editable dirs
    if (!canModifyFile(file.path)) {
        menu.style.display = "none";  // remove kebab menu entirely
    } else {
        menu.onclick = (e) => {
            e.stopPropagation();
            openContextMenu(e.clientX, e.clientY, file.path);
        };
    }

    row.appendChild(item);
    row.appendChild(menu);
    parent.appendChild(row);
}


function loadFile(path) {
    currentFilePath = path;

    // Request file content from backend
    socket.send(JSON.stringify({
        type: "load_file",
        path: path
    }));
}


/* ============================================== */
/*                CONTEXT MENU                    */
/* ============================================== */



editor.onDidChangeCursorSelection(e => {
    const sel = e.selection;
    const start = sel.startLineNumber;
    const end = sel.endLineNumber;

    // Hide if no meaningful selection
    if (start === end) {
        hideSelectionTools();
        return;
    }

    showSelectionTools(start, end);
});

function showSelectionTools(startLine, endLine) {
    const pos = editor.getScrolledVisiblePosition({ lineNumber: startLine, column: 1 });
    const box = document.getElementById("selection-tools");

    box.style.left = pos.left + "px";
    box.style.top = (pos.top - 35) + "px";
    box.style.display = "block";

    currentSelection = { startLine, endLine };
}

function hideSelectionTools() {
    document.getElementById("selection-tools").style.display = "none";
}


function formatClean() {
    const { startLine, endLine } = currentSelection;

    let lines = [];
    for (let i = startLine; i <= endLine; i++) {
        lines.push(editor.getModel().getLineContent(i));
    }

    // Split each line by separators
    const parsed = lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed.startsWith("-")) return { raw: line };

        // Accept both ; and |
        let parts = trimmed.slice(1).split(/;|\|/g).map(p => p.trim());
        return { parts, indent: line.search(/\S/) };
    });

    // Determine max widths for each column
    const colWidths = [];
    parsed.forEach(p => {
        if (!p.parts) return;
        p.parts.forEach((seg, i) => {
            colWidths[i] = Math.max(colWidths[i] || 0, seg.length);
        });
    });

    // Rebuild the lines
    const rebuilt = parsed.map(p => {
        if (!p.parts) return p.raw;

        const aligned = p.parts
            .map((seg, i) => seg.padEnd(colWidths[i]))
            .join(" | ");

        return " ".repeat(p.indent) + "- " + aligned;
    });

    // Replace text in editor
    editor.executeEdits(null, [{
        range: new monaco.Range(startLine, 1, endLine, editor.getModel().getLineMaxColumn(endLine)),
        text: rebuilt.join("\n")
    }]);

    hideSelectionTools();
}

function formatCompact() {
    const { startLine, endLine } = currentSelection;

    let lines = [];
    for (let i = startLine; i <= endLine; i++) {
        const line = editor.getModel().getLineContent(i);

        if (!line.trim().startsWith("-")) {
            lines.push(line);
            continue;
        }

        const indent = line.search(/\S/);
        const content = line.trim().slice(1);

        let parts = content.split(/;|\|/g).map(p => p.trim());
        lines.push(" ".repeat(indent) + "- " + parts.join(" | "));
    }

    editor.executeEdits(null, [{
        range: new monaco.Range(startLine, 1, endLine, editor.getModel().getLineMaxColumn(endLine)),
        text: lines.join("\n")
    }]);

    hideSelectionTools();
}





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
    if (!canModifyFile(contextFile)) return;
    renameFile();
}

function contextDelete() {
    if (!canModifyFile(contextFile)) return;
    deleteFile();
}

