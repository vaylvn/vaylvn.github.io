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
		logMessage("success", "Connected", "Connected to Vayl");
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

		console.log("TREE RECEIVED:", data.virtual_tree);

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
        // Non-JSON messages become console entries
        if (msg.toLowerCase().includes("error")) {
            logMessage("error", "Error", msg);
        } else {
            logMessage("info", "Console", msg);
        }
    }
}



/* ============================================== */
/*                CONSOLE OUTPUT                  */
/* ============================================== */

function appendToConsole(text) {
    logMessage("info", "Console", text);
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
		
		
		monaco.editor.defineTheme("vayl-dark", {
			base: "vs-dark",
			inherit: true,
			rules: [
				// Base text
				{ token: "", foreground: "C7C7C7" },

				// YAML keys
				{ token: "key.yaml", foreground: "6EC1FF", fontStyle: "bold" },

				// Strings
				{ token: "string.yaml", foreground: "E3E3E3" },

				// Numbers
				{ token: "number.yaml", foreground: "E3E3E3" },

				// Booleans (true/false)
				{ token: "keyword", foreground: "FFC766", fontStyle: "bold" },

				// Comments
				{ token: "comment.yaml", foreground: "555555", fontStyle: "italic" }
			],
			colors: {
				"editor.background": "#0D0D0D",
				"editor.foreground": "#C7C7C7",
				"editorLineNumber.foreground": "#444444",
				"editor.lineHighlightBackground": "#1A1A1A",
				"editorCursor.foreground": "#4FDFFF",
				"editor.selectionBackground": "#224E5A",
				"editorIndentGuide.background": "#1F1F1F",
				"editorIndentGuide.activeBackground": "#3A3A3A"
			}
		});



		
		
		
        editor = monaco.editor.create(document.getElementById("editor"), {
			value: "",
			language: "yaml",
			theme: "vayl-dark",   // <── use your theme
			automaticLayout: true,
			contextmenu: false,
			minimap: { enabled: false },
			fontFamily: "JetBrains Mono, monospace",
			fontSize: 14,
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
        { tag: "[user]", desc: "Name of the user who triggered the event" },
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

    // If clicked outside panel & not clicking the toggle button:
    if (!panel.contains(e.target) && e.target !== toggle) {
        panel.classList.remove("open");
        panel.classList.add("hidden");
    }
});




function toggleTagPanel() {
    const panel = document.getElementById("tag-panel");

    buildTagList();

    // If currently hidden → show and slide in
    if (panel.classList.contains("hidden")) {
        panel.classList.remove("hidden");
        panel.classList.add("open");
    }
    // If open → close and hide
    else {
        panel.classList.remove("open");
        panel.classList.add("hidden");
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
/*              SIDEBAR / TREE SYSTEM             */
/* ============================================== */

function buildSidebar(tree) {
    console.log("BUILD SIDEBAR CALLED WITH:", tree);
    const sidebar = document.getElementById("sidebar");
    sidebar.innerHTML = "";
    tree.forEach(item => renderNode(sidebar, item, 0));
}

function renderNode(container, node, depth) {
    const indent = depth * 14;

	if (node.type === "folder") {
		const folderEl = document.createElement("div");
		folderEl.className = "tree-folder";
		folderEl.style.paddingLeft = indent + "px";
		folderEl.textContent = node.name + "/";
		container.appendChild(folderEl);

		// Children container
		const childrenEl = document.createElement("div");
		childrenEl.className = "tree-children";
		childrenEl.style.display = "none";
		container.appendChild(childrenEl);

		// Toggle
		folderEl.onclick = () => {
			const isOpen = childrenEl.style.display === "block";
			childrenEl.style.display = isOpen ? "none" : "block";
			folderEl.classList.toggle("collapsed", !isOpen);
		};

		// Recurse
		node.children.forEach(child =>
			renderNode(childrenEl, child, depth + 1)
		);
	}



    if (node.type === "file") {
        const el = document.createElement("div");
        el.className = "tree-file";
        el.style.paddingLeft = indent + "px";
        el.textContent = "📄 " + node.name.replace(/\.[^.]+$/, "");
        el.dataset.path = node.path;

        el.onclick = () => {
            selectTreeFile(node.path);
            requestFile(node.path);
        };

        container.appendChild(el);
    }
}

function selectTreeFile(path) {
    document.querySelectorAll(".tree-file").forEach(el => {
        el.classList.toggle("selected", el.dataset.path === path);
    });
}


/* ============================================== */




















function logMessage(type, header, detail) {
    const out = document.getElementById("console-output");

    const card = document.createElement("div");
    card.className = `log-card log-${type}`;

    const h = document.createElement("div");
    h.className = "log-header";
    h.textContent = header;

    const d = document.createElement("div");
    d.className = "log-detail";
    d.textContent = detail;

    card.appendChild(h);
    card.appendChild(d);

    out.appendChild(card);
    out.scrollTop = out.scrollHeight;
}
