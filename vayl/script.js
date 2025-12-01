



/* ============================================== */
/*                GLOBAL STATE                    */
/* ============================================== */

let socket = null;
let editor = null;
let monacoLoaded = false;
let currentFilePath = null;
let contextFile = null;
let contextNode = null;

let openFolders = new Set();

let serverInfo = null;

let lastSavedContent = "";


/* ============================================== */
/*                WEBSOCKET SETUP                 */
/* ============================================== */

function connectWebSocket(overrideURL = null) {
    const wsURL = overrideURL || "ws://localhost:8765";

    socket = new WebSocket(wsURL);

    socket.onopen = () => {
        console.log("Connected to backend");
        logMessage("success", "Connected", "Connected to Vayl");
    };

    socket.onmessage = (event) => {
        handleWebSocketMessage(event.data);
    };
	
	socket.onerror = (err) => {
		debug("WS Error", err.toString());
	};

    socket.onclose = () => {
        debug("WS Closed", "retrying...");
        setTimeout(() => connectWebSocket(overrideURL), 1500);
    };
}

(function maybeForceHTTP() {
    const params = new URLSearchParams(location.search);
    const hasCode = params.has("code");

    // Only force HTTP if using a QR connection (mobile/tablet use case)
    if (hasCode && location.protocol === "https:") {
        location.href = "http://" + location.host + location.pathname + location.search;
    }
})();


// Auto-detect connection info from URL (?code=...)
(function initConnection() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (code) {
        debug("QR", `code param detected: ${code}`);

        try {
            const decoded = atob(code);  // "ip:port"
            debug("QR", `decoded: ${decoded}`);

            const [ip, port] = decoded.split(":");

            const wsURL = `ws://${ip}:${port}`;
            debug("WS", `connecting to ${wsURL}`);

            connectWebSocket(wsURL);
            return;
        } catch (err) {
            debug("QR Error", err.toString());
        }
    }

    // Fallback (PC)
    debug("WS", "no code param, using localhost");
    connectWebSocket("ws://localhost:8765");
})();






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
		
		if (data.type === "server_info") {
			serverInfo = data; // { lan_ip, port }
			return;
		}



        // File content
        if (data.type === "file") {
            handleFileContent(data.content);
            return;
        }
		
		if (data.type === "created") {
			buildSidebar(data.virtual_tree);

			currentFilePath = data.path;      // track new file
			requestFile(data.path);           // load into editor

			// WAIT for DOM → THEN select file
			setTimeout(() => {
				selectTreeFile(data.path);

				// also auto-open parent folder path if needed
				autoOpenFolderFor(data.path);

			}, 60);
		}

		if (data.type === "log") {
            logMessage(data.category, data.header, data.message);
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



function openShareModal() {
    if (!serverInfo) {
        alert("Server info not received yet");
        return;
    }

    const modal = document.getElementById("share-modal");
    modal.classList.remove("hidden");

    const conn = `${serverInfo.lan_ip}:${serverInfo.port}`;
    const encoded = btoa(conn); // base64

    const url = `http://widget.vayl.uk/vayl/?code=${encoded}`;
    generateQR(url);
}




function closeShareModal() {
    document.getElementById("share-modal").classList.add("hidden");
}

function generateQR(text) {
    const container = document.getElementById("qr-canvas");

    // clear old QR if modal reopened
    container.innerHTML = "";

    new QRCode(container, {
        text: text,
        width: 220,
        height: 220,
        colorDark: "#ffffff",
        colorLight: "#181818",
        correctLevel: QRCode.CorrectLevel.H
    });
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

	if (mode === "macro") {
		consolePanel.style.display = "none";
        sidebar.style.display = "none";
        editorPanel.style.display = "none";
        loadMacroPanel();
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
function loadMacroPanel() {
	return
}
/* ============================================== */




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
				"editor.background": "#222228",
				"editor.foreground": "#C7C7C7",
				"editorLineNumber.foreground": "#444444",
				"editor.lineHighlightBackground": "#1A1A1E",
				"editorCursor.foreground": "#E6E6E6",
				"editor.selectionBackground": "#83848A",
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

		editor.onDidChangeModelContent(() => {
			applyHighlightDecorations();
			updateSaveButtonState();
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

function updateSaveButtonState() {
    const btn = document.querySelector(".editor-btn");

    if (!btn) return;

    const current = editor.getValue();

    if (current === lastSavedContent) {
        btn.disabled = true;
        btn.classList.add("disabled");
    } else {
        btn.disabled = false;
        btn.classList.remove("disabled");
    }
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
		const picker = document.getElementById("highlight-color-picker");

		picker.onchange = () => {
			const color = picker.value; // #rrggbb

			insertHighlightBlock(startLine, endLine, color);
			applyHighlightDecorations(); // re-scan & apply
		};

		picker.click();
	}


    // APPLY EDIT
    model.pushEditOperations([], [
        { range, text: newText }
    ], () => null);

    hideEditorContextMenu();
}

function insertHighlightBlock(startLine, endLine, color) {
    const model = editor.getModel();

    model.pushEditOperations([], [
        // Insert start tag BEFORE the block
        {
            range: new monaco.Range(startLine, 1, startLine, 1),
            text: `# [hl:${color}]\n`
        },

        // Insert end tag AFTER the block
        {
            range: new monaco.Range(endLine + 2, 1, endLine + 2, 1),
            text: `# [hl]\n`
        }
    ], () => null);
}

let highlightDecorations = [];

function applyHighlightDecorations() {
    const model = editor.getModel();
    const lines = model.getLinesContent();

    let decorations = [];
    let activeColor = null;
    let blockStart = null;

    for (let i = 0; i < lines.length; i++) {
        const lineNo = i + 1;
        const line = lines[i];

        // detect start tag: # @highlight: COLOR
        const startMatch = line.match(/^#\s*\[hl\s*:\s*#?([0-9a-fA-F]{6})\s*\]/i);
        if (startMatch) {
            activeColor = "#" + startMatch[1].trim();
            blockStart = lineNo;
            continue;
        }

        // detect end: # @endhighlight
        if (line.match(/^#\s*\[hl\s*\]/i)) {
            activeColor = null;
            blockStart = null;
            continue;
        }

        // apply decoration if inside block
        if (activeColor) {
            const color = activeColor;
            const className = createHighlightCssClass(color);

            decorations.push({
                range: new monaco.Range(lineNo, 1, lineNo, 1),
                options: {
                    isWholeLine: true,
                    className: className
                }
            });
        }
    }

    highlightDecorations = editor.deltaDecorations(highlightDecorations, decorations);
}

function createHighlightCssClass(color) {
    const safe = color.replace(/[^a-z0-9]/gi, "");
    const className = "hl_" + safe;

    // Convert #rrggbb → r,g,b
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);

    const alpha = 0.25; // ← adjust to taste

    if (!document.querySelector(`style[data-hl="${className}"]`)) {
        const style = document.createElement("style");
        style.dataset.hl = className;
        style.innerHTML = `
            .${className} {
                background-color: rgba(${r}, ${g}, ${b}, ${alpha}) !important;
            }
        `;
        document.head.appendChild(style);
    }

    return className;
}







/* ============================================== */
/*                     ACTIONS                    */
/* ============================================== */

const ACTIONS = [
	{ action: "obs:scene", desc: "Switch to an OBS scene", template: "obs:scene | <scene>"}, 
	{ action: "obs:show", desc: "Show an OBS source", template: "obs:show | <source>"}, 
	{ action: "obs:hide", desc: "Hide an OBS source", template: "obs:hide | <source>"}, 
	{ action: "obs:toggle", desc: "Toggle an OBS source", template: "obs:toggle | <source>"}, 
	{ action: "obs:label", desc: "Modify an OBS label", template: "obs:label | <source> | <text> | <color>"}, 
    { action: "chat", desc: "Send a chat message", template: "chat | <message>"},
    { action: "announce", desc: "Send a chat announcement", template: "announce | <message>" },
];

function loadActions() {
    const list = document.getElementById("action-float-list");
	list.innerHTML = ""; 
    ACTIONS.forEach(t => {
        list.innerHTML += `
            <div class="action-item" onclick="insertAction('${t.template}')" title="${t.desc}">
                ${t.action}
            </div>
        `;
    });
}

function insertAction(action) {
    editor.focus();
    editor.trigger("actionInsert", "type", { text: action});
}

function filterActionList() {
    const q = document.getElementById("action-float-search").value.toLowerCase();
    const items = document.querySelectorAll("#action-float .action-item");

    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(q) ? "block" : "none";
    });
}

document.getElementById("action-float-search").addEventListener("input", filterActionList);

function toggleActionPanel() {
    const p = document.getElementById("action-float");

	const b = document.getElementById("btn-action");

    if (p.classList.contains("hidden")) {
        loadActions();
        p.classList.remove("hidden");
		b.innerHTML = "Hide Actions";
    } else {
        p.classList.add("hidden");
		b.innerHTML = "Show Actions";
    }
}

document.getElementById("action-float-close").onclick = toggleActionPanel;

(function enableActionFloatDrag() {
    const panel = document.getElementById("action-float");
    const container = document.getElementById("editor-container");
    const header = document.getElementById("action-float-header");

    let isDown = false, offsetX = 0, offsetY = 0;

    header.addEventListener("mousedown", (e) => {
        isDown = true;
        offsetX = e.clientX - panel.offsetLeft;
        offsetY = e.clientY - panel.offsetTop;
    });

    document.addEventListener("mousemove", (e) => {
        if (!isDown) return;

        const x = e.clientX - offsetX;
        const y = e.clientY - offsetY;

        const rect = container.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();

        let newLeft = x;
        let newTop = y;

        // Prevent leaving container horizontally
        if (newLeft < 0) newLeft = 0;
        if (newLeft + panelRect.width > rect.width)
            newLeft = rect.width - panelRect.width;

        // Prevent leaving container vertically
        if (newTop < 0) newTop = 0;
        if (newTop + panelRect.height > rect.height)
            newTop = rect.height - panelRect.height;

        panel.style.left = newLeft + "px";
        panel.style.top = newTop + "px";
    });

    document.addEventListener("mouseup", () => isDown = false);
})();

/* ============================================== */
















/* ============================================== */
/*                 TAG DEFINITIONS                */
/* ============================================== */

const TAGS = {
    generic: [
        { tag: "[time]", desc: "Current system time" },
        { tag: "[channel]", desc: "Channel name" },
		{ tag: "[followers]", desc: "Total follower count" },
		{ tag: "[rfollower]", desc: "Random follower" },
		{ tag: "[subscribers]", desc: "Total subscriber count" },
		{ tag: "[rsubscriber]", desc: "Random subscriber" },
		{ tag: "[viewers]", desc: "Total viewer count" },
		{ tag: "[ruser]", desc: "Random viewer username" },
		{ tag: "[system:dateus]", desc: "Current date (US)" },
		{ tag: "[system:dateuk]", desc: "Current date (UK)" },
		{ tag: "[system:time]", desc: "Current time" },
		{ tag: "[uptime:seconds]", desc: "Total stream uptime" },
		{ tag: "[rnumber:min-max]", desc: "Random number" },
    ],

    events: {
        raid: [
			{ tag: "[user]", desc: "Name of the user who triggered the event" },
            { tag: "[viewers]", desc: "Viewer count in the raid" },
        ],
        follow: [
            { tag: "[e:follower]", desc: "Name of the follower" }
        ],
        redemption: [
            { tag: "[e:reward]", desc: "Reward name" },
            { tag: "[e:message]", desc: "User message for reward" }
        ]
    }
};

function loadGenericTags() {
    const list = document.getElementById("tag-float-list");
	list.innerHTML = ""; 
    /* list.innerHTML += `<div class="tag-section-title">Global</div>`; */

    TAGS.generic.forEach(t => {
        list.innerHTML += `
            <div class="tag-item" onclick="insertTag('${t.tag}')" title="${t.desc}">
                ${t.tag}
            </div>
        `;
    });
}

function loadEventTags() {
    const list = document.getElementById("event-tag-section");
    const inner = document.getElementById("event-tag-list");

    inner.innerHTML = "";

    const file = currentFilePath?.split("/").pop();
    if (!file) return;

    const eventName = file.replace(".yml", "");

    if (!TAGS.events[eventName]) {
        list.style.display = "none";
        return;
    }

    list.style.display = "block";

    TAGS.events[eventName].forEach(t => {
        inner.innerHTML += `
            <div class="tag-item" onclick="insertTag('${t.tag}')" title="${t.desc}">
                ${t.tag}
            </div>
        `;
    });
}



(function enableTagFloatDrag() {
    const panel = document.getElementById("tag-float");
    const container = document.getElementById("editor-container");
    const header = document.getElementById("tag-float-header");

    let isDown = false, offsetX = 0, offsetY = 0;

    header.addEventListener("mousedown", (e) => {
        isDown = true;
        offsetX = e.clientX - panel.offsetLeft;
        offsetY = e.clientY - panel.offsetTop;
    });

    document.addEventListener("mousemove", (e) => {
        if (!isDown) return;

        const x = e.clientX - offsetX;
        const y = e.clientY - offsetY;

        const rect = container.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();

        let newLeft = x;
        let newTop = y;

        // Prevent leaving container horizontally
        if (newLeft < 0) newLeft = 0;
        if (newLeft + panelRect.width > rect.width)
            newLeft = rect.width - panelRect.width;

        // Prevent leaving container vertically
        if (newTop < 0) newTop = 0;
        if (newTop + panelRect.height > rect.height)
            newTop = rect.height - panelRect.height;

        panel.style.left = newLeft + "px";
        panel.style.top = newTop + "px";
    });

    document.addEventListener("mouseup", () => isDown = false);
})();

function toggleTagPanel() {
    const p = document.getElementById("tag-float");

	const b = document.getElementById("btn-tag");
	

    if (p.classList.contains("hidden")) {
        refreshTagPanel();
        p.classList.remove("hidden");
		b.innerHTML = "Hide Tags";
    } else {
        p.classList.add("hidden");
		b.innerHTML = "Show Tags";
    }
}

document.getElementById("tag-float-close").onclick = toggleTagPanel;

function refreshTagPanel() {
    const genericList = document.getElementById("tag-float-list");
    const eventSection = document.getElementById("event-tag-section");

    // reset both areas
    genericList.innerHTML = "";
    eventSection.style.display = "none";

    // load event tags if applicable
    if (currentFilePath?.startsWith("configuration/event/")) {
        loadEventTags();
    }

    // always load generic tags
    loadGenericTags();
}

function filterFloatTagList() {
    const q = document.getElementById("tag-float-search").value.toLowerCase();
    const items = document.querySelectorAll("#tag-float .tag-item");

    items.forEach(item => {
        const t = item.textContent.toLowerCase();
        item.style.display = t.includes(q) ? "block" : "none";
    });
}

function insertTag(tag) {
    editor.focus();
    editor.trigger("tagInsert", "type", { text: tag });
}

document.getElementById("tag-float-search").addEventListener("input", filterFloatTagList);
























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
	lastSavedContent = content;
	updateSaveButtonState();

	
    // Ensure visible in case the panel resized
    setTimeout(() => editor.layout(), 50);
	
	setTimeout(() => applyHighlightDecorations(), 60);
}

function saveFile() {
    if (!currentFilePath) return;

    socket.send(JSON.stringify({
        type: "write",
        path: currentFilePath,
        content: editor.getValue()
    }));
	
	lastSavedContent = editor.getValue();
	updateSaveButtonState();
	
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

const PROTECTED_FOLDERS = new Set([
    "configuration",
    "configuration/actionpacks",
    "configuration/conditionals",
    "configuration/event",

    "data",
    "data/variables",
    "data/variables/boolean",
    "data/variables/text",
    "data/variables/list",
    "data/variables/number",
    "data/variables/table"
]);


function buildSidebar(tree) {
    console.log("BUILD SIDEBAR CALLED WITH:", tree);

    const container = document.getElementById("tree-container");
    container.innerHTML = "";  // Only clears the tree, not the search bar

    tree.forEach(item => renderNode(container, item, 0));
	restoreOpenFolders();

}

function restoreOpenFolders() {
    document.querySelectorAll(".tree-folder").forEach(folder => {
        const path = folder.dataset?.path;
        if (!path) return;

        if (openFolders.has(path)) {
            const children = folder.nextSibling;
            children.style.display = "block";
        }
    });
}



function renderNode(container, node, depth) {
    const indent = depth * 14;

    if (node.type === "folder") {
        const folderEl = document.createElement("div");
        folderEl.className = "tree-folder";
		folderEl.dataset.path = node.path;
        folderEl.style.paddingLeft = indent + "px";
        folderEl.textContent = "📁 " + node.name;
        container.appendChild(folderEl);

        // Children container
        const childrenEl = document.createElement("div");
        childrenEl.className = "tree-children";
        childrenEl.style.display = "none";
        container.appendChild(childrenEl);

        // Click to toggle open/closed
        const path = node.path;

		folderEl.onclick = () => {
			const isOpen = childrenEl.style.display === "block";

			if (isOpen) {
				openFolders.delete(path);
				childrenEl.style.display = "none";
			} else {
				openFolders.add(path);
				childrenEl.style.display = "block";
			}

			folderEl.classList.toggle("collapsed", !isOpen);
		};

        // Right-click: open context menu for this folder
        folderEl.oncontextmenu = (e) => {
            e.preventDefault();
            contextNode = node;              // <── store which node was clicked
            showTreeContextMenu(e, node);    // use shared menu
        };

        // Recurse into children
        node.children.forEach(child =>
            renderNode(childrenEl, child, depth + 2)
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

        // Right-click: context menu for this file
        el.oncontextmenu = (e) => {
            e.preventDefault();
            contextNode = node;
            showTreeContextMenu(e, node);
        };

        container.appendChild(el);
    }
}


function showTreeContextMenu(e, node) {
    const menu = document.getElementById("context-menu");
    if (!menu) return;

    const newFileItem   = menu.querySelector('[data-action="new-file"]');
    const newFolderItem = menu.querySelector('[data-action="new-folder"]');
    const renameItem    = menu.querySelector('[data-action="rename"]');
    const deleteItem    = menu.querySelector('[data-action="delete"]');

    const isFolder = node.type === "folder";
    const isFile   = node.type === "file";

    // if backend sets node.locked = true on core folders, this will work:
    const isLocked = !!node.locked || isCoreLockedPath(node.path);

    // For folders:
    //   - show New File / New Folder (unless locked)
    //   - show Rename/Delete unless locked
    // For files:
    //   - hide New File / New Folder
    //   - show Rename/Delete always
    if (newFileItem) {
        newFileItem.style.display = (isFolder && !isLocked) ? "block" : "none";
    }
    if (newFolderItem) {
        newFolderItem.style.display = (isFolder && !isLocked) ? "block" : "none";
    }
    if (renameItem) {
        renameItem.style.display = isLocked ? "none" : "block";
    }
    if (deleteItem) {
        deleteItem.style.display = isLocked ? "none" : "block";
    }

    menu.style.left = e.clientX + "px";
    menu.style.top  = e.clientY + "px";
    menu.classList.remove("hidden");
}

// helper: guard core system folders if backend doesn't send node.locked
function isCoreLockedPath(path) {
    if (!path) return false;
    return (
        path === "configuration" ||
        path === "configuration/variables" ||
        path === "configuration/variables/boolean" ||
        path === "configuration/variables/text" ||
        path === "configuration/variables/list" ||
        path === "configuration/variables/table"
    );
}

// hide menu when clicking elsewhere
window.addEventListener("click", () => {
    const menu = document.getElementById("context-menu");
    if (menu) menu.classList.add("hidden");
});


function createFile() {
    if (!contextNode) return;
    if (contextNode.type !== "folder") return;  // safety

    const folderPath = contextNode.path;
    const name = prompt("File name (without extension):");
    if (!name) return;

    const isTable = folderPath.includes("/table");
    const ext = isTable ? ".yml" : ".txt";

    socket.send(JSON.stringify({
        type: "create",
        folder: false,
        path: `${folderPath}/${name}${ext}`
    }));
}



function createFolder() {
    if (!contextNode) return;
    if (contextNode.type !== "folder") return;

    const folderPath = contextNode.path;
    const name = prompt("Folder name:");
    if (!name) return;

    socket.send(JSON.stringify({
        type: "create",
        folder: true,
        path: `${folderPath}/${name}`
    }));
}

function renameNode() {
    if (!contextNode) return;

    // Don't allow rename if locked
    if (isCoreLockedPath(contextNode.path) || contextNode.locked) {
        alert("This folder is locked and cannot be renamed.");
        return;
    }

    const oldPath = contextNode.path;
    const oldName = oldPath.split("/").pop();
    const newName = prompt("New name:", oldName);
    if (!newName || newName === oldName) return;

    socket.send(JSON.stringify({
        type: "rename",
        path: oldPath,
        new_name: newName,
        is_folder: contextNode.type === "folder"
    }));
}

function deleteNode() {
    if (!contextNode) return;

    if (isCoreLockedPath(contextNode.path) || contextNode.locked) {
        alert("This folder is locked and cannot be deleted.");
        return;
    }

    const label = contextNode.type === "folder" ? "folder" : "file";
    if (!confirm(`Delete this ${label}? ${contextNode.path}`)) return;

    socket.send(JSON.stringify({
        type: "delete",
        path: contextNode.path,
        is_folder: contextNode.type === "folder"
    }));
}



function selectTreeFile(path) {
    document.querySelectorAll(".tree-file").forEach(el => {
        el.classList.toggle("selected", el.dataset.path === path);
    });
}

document.getElementById("tree-search").addEventListener("input", () => {
    const query = document.getElementById("tree-search").value.toLowerCase();

    const files = document.querySelectorAll(".tree-file");
    const folders = document.querySelectorAll(".tree-folder");

    // 1. Filter files
    files.forEach(f => {
        const text = f.textContent.toLowerCase();
        const match = text.includes(query);

        f.style.display = match ? "block" : "none";

        // auto‐expand ancestors
        if (match) {
            let parent = f.parentElement;
            while (parent && parent.classList.contains("tree-children")) {
                parent.style.display = "block";
                parent = parent.previousSibling; // folder element
            }
        }
    });

    // 2. Hide folders that contain no visible children
    folders.forEach(folder => {
        const container = folder.nextElementSibling; // .tree-children
        if (!container) return;

        const visible = [...container.querySelectorAll(".tree-file, .tree-folder")]
            .some(el => el.style.display !== "none");

        folder.style.display = visible ? "block" : "none";
        container.style.display = visible ? "block" : "none";
    });
});




/* ============================================== */



















function debug(header, msg) {
    logMessage("info", header, msg);
}


function logMessage(type, header, detail) {
    const out = document.getElementById("console-output");

    // Detect if user is currently at (or very near) the bottom
    const isAtBottom =
        out.scrollTop + out.clientHeight >= out.scrollHeight - 10;

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

    // Only autoscroll if user hasn't scrolled up
    if (isAtBottom) {
        out.scrollTop = out.scrollHeight;
    }
}






window.addEventListener("load", () => {
    const modal = document.getElementById("welcome-modal");
    const closeBtn = document.getElementById("welcome-close");

    modal.classList.remove("hidden");

    closeBtn.onclick = () => {
        modal.classList.add("hidden");
    };
});

