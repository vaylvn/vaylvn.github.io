window.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(location.search);
  const isLive = params.has("data");

  document.body.dataset.mode = isLive ? "live" : "config";

  const dataParam = params.get("data");
  const display = document.getElementById("timerDisplay");

  let config = {
    timerName: "default",
    textColor: "#ffffff",
    backgroundColor: "#000000",
    fontFamily: "Inter",
    fontSize: 120,
    format: "MM:SS"
  };

  function formatTime(seconds) {
    if (config.format === "seconds") {
      return seconds.toString();
    } else if (config.format === "text") {
      return seconds === 1 ? "1 second" : `${seconds} seconds`;
    } else if (config.format === "HH:MM:SS") {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    } else {
      // MM:SS (default)
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
  }

  function updateDisplay(seconds) {
    display.textContent = formatTime(seconds);
    display.style.fontSize = config.fontSize + "px";
    display.style.color = config.textColor;
    display.style.fontFamily = config.fontFamily;
    document.getElementById("timerPanel").style.backgroundColor = config.backgroundColor;
  }

  if (!isLive) {
    // Editor mode
    document.getElementById("fontSize").addEventListener("input", (e) => {
      config.fontSize = parseInt(e.target.value);
      document.getElementById("fontSizeVal").textContent = config.fontSize;
      updateDisplay(123);
    });

    ["textColor", "backgroundColor", "fontFamily", "format"].forEach(id => {
      document.getElementById(id).addEventListener("change", (e) => {
        config[id.charAt(0).toLowerCase() + id.slice(1)] = e.target.value;
        updateDisplay(123);
        updateShareUrl();
      });
    });

    document.getElementById("timerNameInput").addEventListener("input", (e) => {
      config.timerName = e.target.value;
      updateShareUrl();
    });

    function updateShareUrl() {
      const encoded = btoa(JSON.stringify(config));
      document.getElementById("shareUrl").value = `${location.origin}${location.pathname}?data=${encoded}`;
    }

    document.getElementById("copyUrl").addEventListener("click", () => {
      navigator.clipboard.writeText(document.getElementById("shareUrl").value);
    });

    document.getElementById("importUrl").addEventListener("click", () => {
      try {
        const u = new URL(document.getElementById("urlImport").value.trim());
        const enc = u.searchParams.get("data");
        if (!enc) throw new Error("No data param");
        const cfg = JSON.parse(atob(enc));
        Object.assign(config, cfg);

        document.getElementById("timerNameInput").value = config.timerName;
        document.getElementById("textColor").value = config.textColor;
        document.getElementById("backgroundColor").value = config.backgroundColor;
        document.getElementById("fontFamily").value = config.fontFamily;
        document.getElementById("fontSize").value = config.fontSize;
        document.getElementById("fontSizeVal").textContent = config.fontSize;
        document.getElementById("format").value = config.format;

        updateDisplay(123);
        updateShareUrl();
      } catch (e) {
        alert("Invalid URL: " + e.message);
      }
    });

    updateDisplay(123);
    updateShareUrl();
  } else {
    // Live mode
    try {
      config = JSON.parse(atob(dataParam));
    } catch (e) {
      document.body.innerHTML = "<h3>Invalid or corrupted timer data.</h3>";
      throw e;
    }

    async function pollTimer() {
      try {
        const r = await fetch(`http://127.0.0.1:5000/polltimer?name=${encodeURIComponent(config.timerName)}`);
        const data = await r.json();

        if (data.remaining !== undefined) {
          updateDisplay(data.remaining);
        }
      } catch (err) {
        console.warn("pollTimer error", err);
      }

      setTimeout(pollTimer, 100);
    }

    updateDisplay(0);
    pollTimer();
  }
});
