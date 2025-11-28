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
            contextmenu: false,   // disable Monaco's built-in menu
            minimap: { enabled: false },
            fontSize: 14
        });

        monacoLoaded = true;
        setTimeout(() => editor.layout(), 50);

        // Right-click inside Monaco -> our custom menu
        editor.onMouseDown((e) => {
            if (e.event.rightButton) {
                showEditorContextMenu(e.event.browserEvent);
            }
        });

        // Block browser's native context menu inside editor
        const editorContainer = document.getElementById("editor");
        editorContainer.addEventListener("contextmenu", (e) => {
            e.preventDefault();
        });
    });
}





function showEditorContextMenu(browserEvent) {
    browserEvent.preventDefault();
    browserEvent.stopPropagation();

    // close any existing one
    hideEditorContextMenu();

    const menu = document.getElementById("editor-context-menu");

    menu.style.left = browserEvent.clientX + "px";
    menu.style.top = browserEvent.clientY + "px";
    menu.classList.remove("hidden");
}

function hideEditorContextMenu() {
    const menu = document.getElementById("editor-context-menu");
    if (menu) {
        menu.classList.add("hidden");
    }
}

// Hide when clicking anywhere else
window.addEventListener("click", () => {
    hideEditorContextMenu();
});



function ctxAction(type) {
    if (!editor) return;

    const selection = editor.getSelection();
    if (!selection || selection.isEmpty()) {
        hideEditorContextMenu();
        return;
    }

    // Normalise range so Monaco never rejects edit
    const startLine = Math.min(selection.startLineNumber, selection.endLineNumber);
    const endLine   = Math.max(selection.startLineNumber, selection.endLineNumber);

    const startCol = selection.startLineNumber < selection.endLineNumber
        ? selection.startColumn
        : selection.endColumn;

    const endCol = selection.startLineNumber < selection.endLineNumber
        ? selection.endColumn
        : selection.startColumn;

    const range = new monaco.Range(startLine, startCol, endLine, endCol);

    const model = editor.getModel();
    const text = model.getValueInRange(range);

    // ---------------------------------------------------------------------
    // Splitter that safely handles whitespace, blank lines, and indentation
    // ---------------------------------------------------------------------
    function splitDivider(line) {
        if (!line.trim()) return null;
        if (line.trim().startsWith("#")) return null;

        const match = line.match(/^(.*?)(?:\s*([;|])\s*)(.*)$/);

        if (!match) return null;

        return {
            indent: match[1].match(/^\s*/)[0],
            left: match[1].trim(),
            divider: match[2],
            right: match[3].trim()
        };
    }

    let newText = text;

    // ---------------------------------------------------------------------
    // CLEAN
    // ---------------------------------------------------------------------
    if (type === "clean") {
		const lines = text.split("\n");

		function splitAll(line) {
			if (!line.trim() || line.trim().startsWith("#")) return null;

			const indent = line.match(/^\s*/)[0];

			// Split on ; or |, strip surrounding whitespace
			const parts = line.split(/;|\|/).map(p => p.trim());

			// Capture dividers in the order they appear
			const dividers = [...line.matchAll(/([;|])/g)].map(m => m[1]);

			return { indent, parts, dividers };
		}

		const parsed = lines.map(splitAll);

		// Determine how many columns exist across all lines
		const maxCols = Math.max(...parsed.filter(p => p).map(p => p.parts.length));

		// Compute max width for each column
		const colWidths = Array(maxCols).fill(0);

		parsed.forEach(p => {
			if (!p) return;
			p.parts.forEach((part, i) => {
				colWidths[i] = Math.max(colWidths[i], part.length);
			});
		});

		// Build aligned lines
		newText = lines.map((line, i) => {
			const p = parsed[i];
			if (!p) return line;

			let out = p.indent;

			p.parts.forEach((part, idx) => {
				const padded = part.padEnd(colWidths[idx], " ");
				out += padded;

				// Add original divider if present
				if (p.dividers[idx]) {
					out += " " + p.dividers[idx] + " ";
				}
			});

			return out;
		}).join("\n");
	}


    // ---------------------------------------------------------------------
    // COMPACT
    // ---------------------------------------------------------------------
    if (type === "compact") {
		const lines = text.split("\n");

		newText = lines.map(line => {
			if (!line.trim() || line.trim().startsWith("#")) return line;

			const indent = line.match(/^\s*/)[0];

			// Split into parts (left/right/etc)
			const parts = line.split(/;|\|/).map(p => p.trim());

			// Capture original dividers in order
			const dividers = [...line.matchAll(/([;|])/g)].map(m => m[1]);

			// If no dividers → leave unchanged
			if (!dividers.length) return line;

			// Rebuild with normalized spacing
			let out = indent;

			parts.forEach((part, idx) => {
				out += part;
				if (dividers[idx]) {
					out += " " + dividers[idx] + " ";
				}
			});

			return out;
		}).join("\n");
	}


    // ---------------------------------------------------------------------
    // HIGHLIGHT (unchanged)
    // ---------------------------------------------------------------------
    if (type === "highlight") {
        newText = `<<${text}>>`;
    }

    // APPLY EDIT
    model.pushEditOperations([], [
        { range, text: newText }
    ], () => null);

    hideEditorContextMenu();
}






// ===========================
//        TAG SYSTEM
// ===========================

const TAGS = {
    global: [
        { tag: "[g:user]", desc: "Name of the user who triggered the event" },
        { tag: "[g:time]", desc: "Current system time" },
        { tag: "[g:rfollower]", desc: "Random follower" },
        { tag: "[g:channel]", desc: "The channel name" }
    ],

    events: {
        raid: [
            { tag: "[e:viewers]", desc: "Number of viewers in the raid" },
            { tag: "[e:raider]", desc: "Name of the raiding streamer" }
        ],
        follow: [
            { tag: "[e:follower]", desc: "Name of the follower" }
        ],
        redemption: [
            { tag: "[e:reward]", desc: "Name of the channel point reward" },
            { tag: "[e:message]", desc: "User message for the reward" }
        ]
    }
};

function getEventNameFromPath(path) {
    if (!path) return null;

    const file = path.split("/").pop();
    if (!file.endsWith(".yml")) return null;

    return file.replace(".yml", "");
}

function buildTagList() {
    const list = document.getElementById("tag-list");
    list.innerHTML = "";

    const eventName = getEventNameFromPath(currentFilePath);

    // Global tags
    list.innerHTML += `<div class="tag-header">Global Tags</div>`;
    TAGS.global.forEach(t => {
        list.innerHTML += `
            <div class="tag-item" data-tag="${t.tag}" title="${t.desc}"
                 onclick="insertTag('${t.tag}')">${t.tag}</div>
        `;
    });

    // Event tags (if applicable)
    if (eventName && TAGS.events[eventName]) {
        list.innerHTML += `<div class="tag-header">Event Tags (${eventName})</div>`;

        TAGS.events[eventName].forEach(t => {
            list.innerHTML += `
                <div class="tag-item" data-tag="${t.tag}" title="${t.desc}"
                     onclick="insertTag('${t.tag}')">${t.tag}</div>
            `;
        });
    }
}

function insertTag(tag) {
    editor.focus();
    editor.trigger("tagInsert", "type", { text: tag });
}

function filterTagList() {
    const search = document.getElementById("tag-search").value.toLowerCase();
    const items = document.querySelectorAll("#tag-list .tag-item");

    items.forEach(item => {
        const tag = item.dataset.tag.toLowerCase();
        item.style.display = tag.includes(search) ? "block" : "none";
    });
}



window.addEventListener("click", (e) => {
    const panel = document.getElementById("tag-panel");
    const toggle = document.getElementById("tag-toggle-btn");

    if (!panel.contains(e.target) && e.target !== toggle) {
        panel.classList.remove("open");
    }
});



function toggleTagPanel() {
    const panel = document.getElementById("tag-panel");

    // First-time build or rebuild of list
    buildTagList();

    if (panel.classList.contains("open")) {
        panel.classList.remove("open");
    } else {
        panel.classList.add("open");
    }
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

function addFileEntry(container, file) {
    const row = document.createElement("div");
    row.className = "sidebar-file-row";

    const label = document.createElement("div");
    label.className = "sidebar-item";
    label.textContent = file.display;
    label.onclick = () => requestFile(file.path);

    const menu = document.createElement("div");
    menu.className = "file-menu-icon";
    menu.innerHTML = "⋮";
    menu.onclick = (e) => {
        e.stopPropagation();
        openContextMenu(e, file);
    };

    row.appendChild(label);
    row.appendChild(menu);
    container.appendChild(row);
}


/* ============================================== */
/*                CONTEXT MENU                    */
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
