/* ============================================== */
/*                GLOBAL STATE                    */
/* ============================================== */

let socket = null;
let editor = null;
let monacoLoaded = false;
let currentFilePath = null;
let contextFile = null;
let currentSelection = null;

let HL_META = JSON.parse(localStorage.getItem("vayl_highlights") || "{}");
let highlightDecorations = [];


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
            redrawHighlights(currentFilePath);
            return;
        }

    } catch {
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
        initSelectionTools();
        setTimeout(() => editor.layout(), 50);
    });
}


/* ============================================== */
/*         SAFE SELECTION TOOL INITIALISER        */
/* ============================================== */

function initSelectionTools() {
    if (!editor) return;

    editor.onDidChangeCursorSelection(e => {
        const sel = e.selection;
        const start = sel.startLineNumber;
        const end = sel.endLineNumber;

        if (start === end) {
            hideSelectionTools();
            return;
        }

        showSelectionTools(start, end);
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

function loadFile(path) {
    currentFilePath = path;

    socket.send(JSON.stringify({
        type: "load_file",
        path: path
    }));
}

function handleFileContent(content) {
    document.getElementById("editor-toolbar").style.display = "flex";

    editor.setValue(content);
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

function renameFile() {
    alert("Rename dialog coming soon.");
}

function deleteFile() {
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
	return true;
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

    item.onclick = () => loadFile(file.path);

    if (!canModifyFile(file.path)) {
        menu.style.display = "none";
    } else {
        menu.onclick = (e) => {
			e.stopPropagation();
			openContextMenu(e, file.path);
		};

    }

    row.appendChild(item);
    row.appendChild(menu);
    parent.appendChild(row);
}


/* ============================================== */
/*                CONTEXT MENU                    */
/* ============================================== */

function openContextMenu(event, file) {
    contextFile = file;

    const menu = document.getElementById("context-menu");
    menu.classList.remove("hidden");

    menu.style.top = event.clientY + "px";
    menu.style.left = event.clientX + "px";
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


/* ============================================== */
/*           SELECTION TOOL POPUP UI              */
/* ============================================== */

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


/* ============================================== */
/*                 CLEAN FORMAT                   */
/* ============================================== */

function formatClean() {
    const { startLine, endLine } = currentSelection;

    let lines = [];
    for (let i = startLine; i <= endLine; i++) {
        lines.push(editor.getModel().getLineContent(i));
    }

    const parsed = lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed.startsWith("-")) return { raw: line };

        let parts = trimmed.slice(1).split(/;|\|/g).map(p => p.trim());
        return { parts, indent: line.search(/\S/) };
    });

    const colWidths = [];
    parsed.forEach(p => {
        if (!p.parts) return;
        p.parts.forEach((seg, i) => {
            colWidths[i] = Math.max(colWidths[i] || 0, seg.length);
        });
    });

    const rebuilt = parsed.map(p => {
        if (!p.parts) return p.raw;

        const aligned = p.parts
            .map((seg, i) => seg.padEnd(colWidths[i]))
            .join(" | ");

        return " ".repeat(p.indent) + "- " + aligned;
    });

    editor.executeEdits(null, [{
        range: new monaco.Range(startLine, 1, endLine,
            editor.getModel().getLineMaxColumn(endLine)),
        text: rebuilt.join("\n")
    }]);

    hideSelectionTools();
}


/* ============================================== */
/*               COMPACT FORMAT                   */
/* ============================================== */

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
        range: new monaco.Range(startLine, 1, endLine,
            editor.getModel().getLineMaxColumn(endLine)),
        text: lines.join("\n")
    }]);

    hideSelectionTools();
}


/* ============================================== */
/*               HIGHLIGHT COLOR PICKER           */
/* ============================================== */

function openHighlightPicker() {
    const picker = document.getElementById("highlight-color-picker");

    picker.oninput = (e) => {
        const color = e.target.value;
        applyHighlightToSelection(color);
    };

    picker.click();
}


/* ============================================== */
/*                  HIGHLIGHTING                  */
/* ============================================== */

function applyHighlightToSelection(color) {
    const file = currentFilePath;
    const { startLine, endLine } = currentSelection;

    HL_META[file] = HL_META[file] || {};

    for (let line = startLine; line <= endLine; line++) {
        HL_META[file][line] = color;
    }

    localStorage.setItem("vayl_highlights", JSON.stringify(HL_META));
    redrawHighlights(file);
}

function redrawHighlights(file) {
    const meta = HL_META[file] || {};

    const decorations = Object.entries(meta).map(([line, color]) => ({
        range: new monaco.Range(Number(line), 1, Number(line), 1),
        options: {
            isWholeLine: true,
            beforeContentClassName: 'dynamic-hl-' + Number(line)
        }
    }));

    highlightDecorations =
        editor.deltaDecorations(highlightDecorations, decorations);

    injectDynamicHighlightCSS(meta);
}

function injectDynamicHighlightCSS(meta) {
    let css = "";

    for (const [line, color] of Object.entries(meta)) {
        css += `
        .monaco-editor .dynamic-hl-${line} {
            border-left: 4px solid ${color} !important;
        }`;
    }

    let style = document.getElementById("dynamic-highlight-style");
    if (!style) {
        style = document.createElement("style");
        style.id = "dynamic-highlight-style";
        document.head.appendChild(style);
    }

    style.innerHTML = css;
}
