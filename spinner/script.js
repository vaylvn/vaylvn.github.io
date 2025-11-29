// Connect to the SSE stream
const evt = new EventSource("http://127.0.0.1:5000/spinnerstream");

evt.onmessage = (ev) => {
    try {
        const data = JSON.parse(ev.data);

        if (data.cmd === "spin") {
            console.log("Received spin command from Vayl");
            startSpin(); // <-- call your actual spin function
        }

    } catch (e) {
        console.warn("Bad spinnerstream message:", e);
    }
};



window.addEventListener("DOMContentLoaded", () => {
  const GOOGLE_FONTS = [
    "Roboto","Lato","Poppins","Montserrat","Merriweather",
    "Open Sans","Raleway","Oswald","Playfair+Display"
  ];

  const params = new URLSearchParams(location.search);
  const dataParam = params.get("data");
  const canvas = document.getElementById("spinnerCanvas");
  const ctx = canvas.getContext("2d");

  let config = {
    spinDelay:0,autoSpin:false,spinDuration:4000,
    dividerColor:"#ffffff",dividerWidth:2,
    rimColor:"#000000",rimWidth:3,
    arrowOutline:"#ffffff",arrowWidth:2,
    sound:"none",customSound:"",tickDensity:30,
    segments:[]
  };
  let spinning=false,currentRotation=0,cachedAudio=null;

  function ensureFontLoaded(font){ if(font) document.fonts.load(`16px '${font}'`).then(()=>drawSpinner(config)); }
  function preloadAudio(src){
    if(!src){cachedAudio=null;return;}
    try{ cachedAudio=new Audio(src); cachedAudio.load(); }catch{}
  }
  function playSoundOnce(src,vol=0.4){
    try{
      const a=cachedAudio?cachedAudio.cloneNode():new Audio(src);
      a.volume=vol;a.currentTime=0;a.play().catch(()=>{});
    }catch{}
  }




  function drawSpinner(cfg,rotation=0){
    currentRotation=rotation;
    const total=cfg.segments.reduce((a,b)=>a+b.weight,0)||1;
    ctx.clearRect(0,0,400,400);
    const radius=200-cfg.rimWidth/2;
    let start=rotation;
	
	
	
	cfg.segments.forEach(seg=>{
		  const ang = (seg.weight / total) * 2 * Math.PI;

		  ctx.beginPath();
		  ctx.moveTo(200, 200);
		  ctx.arc(200, 200, radius, start, start + ang);
		  ctx.closePath();
		  ctx.fillStyle = seg.color || "#888";
		  ctx.fill();

		  const mid = start + ang / 2;

		  ctx.save();
		  ctx.translate(200, 200);
		  ctx.rotate(mid);

		  ctx.textAlign = "right";
		  ctx.textBaseline = "middle";   // <-- key fix

		  const weight = (seg.bold ? "bold " : "") + (seg.italic ? "italic " : "");
		  ctx.font = `${weight}${seg.size || 16}px '${seg.font || "sans-serif"}', sans-serif`;
		  ctx.fillStyle = "#000";

		  // Vertical centering offset — 5% of font size
		  const verticalAdjust = (seg.size || 16) * 0.05;

		  ctx.fillText(seg.label, radius - 20, verticalAdjust);

	
			if (seg.outlineWidth > 0) {
				ctx.lineWidth = seg.outlineWidth;
				ctx.strokeStyle = seg.outlineColor || "#000";
				ctx.strokeText(seg.label, radius - 20, verticalAdjust);
			}


		  if (seg.underline) {
			const w = ctx.measureText(seg.label).width;
			ctx.beginPath();
			ctx.moveTo(radius - 20 - w, verticalAdjust + 3);
			ctx.lineTo(radius - 20,     verticalAdjust + 3);
			ctx.lineWidth = 1;
			ctx.strokeStyle = "#000";
			ctx.stroke();
		  }

		  ctx.restore();
		  start += ang;
		});

			
	
	
	/*
    cfg.segments.forEach(seg=>{
      const ang=(seg.weight/total)*2*Math.PI;
      ctx.beginPath();ctx.moveTo(200,200);
      ctx.arc(200,200,radius,start,start+ang);ctx.closePath();
      ctx.fillStyle=seg.color||"#888";ctx.fill();
      const mid=start+ang/2;
      ctx.save();ctx.translate(200,200);ctx.rotate(mid);ctx.textAlign="right";
      const weight=(seg.bold?"bold ":"")+(seg.italic?"italic ":"");
      ctx.font=`${weight}${seg.size||16}px '${seg.font||"sans-serif"}',sans-serif`;
      ctx.fillStyle="#000";ctx.fillText(seg.label,radius-20,5);
      if(seg.underline){
        const w=ctx.measureText(seg.label).width;
        ctx.beginPath();ctx.moveTo(radius-20-w,8);ctx.lineTo(radius-20,8);
        ctx.lineWidth=1;ctx.strokeStyle="#000";ctx.stroke();
      }
      ctx.restore();start+=ang;
    });
	*/
	
	
    start=rotation;
    cfg.segments.forEach(seg=>{
      const ang=(seg.weight/total)*2*Math.PI,angle=start+ang;
      ctx.beginPath();ctx.moveTo(200,200);
      ctx.lineTo(200+radius*Math.cos(angle),200+radius*Math.sin(angle));
      ctx.strokeStyle=cfg.dividerColor;ctx.lineWidth=cfg.dividerWidth;ctx.stroke();
      start+=ang;
    });
    ctx.beginPath();ctx.arc(200,200,radius,0,Math.PI*2);
    ctx.strokeStyle=cfg.rimColor;ctx.lineWidth=cfg.rimWidth;ctx.stroke();

    let arrowColor="#000";
    {
      const norm=((rotation%(2*Math.PI))+2*Math.PI)%(2*Math.PI);
      const arrowAngle=(1.5*Math.PI - norm + 2*Math.PI)%(2*Math.PI);
      let cum=0;for(const seg of cfg.segments){
        const segAng=(seg.weight/total)*2*Math.PI;
        if(arrowAngle>=cum && arrowAngle<cum+segAng){arrowColor=seg.color;break;}
        cum+=segAng;
      }
    }
    ctx.beginPath();ctx.moveTo(190,0);ctx.lineTo(210,0);ctx.lineTo(200,20);
    ctx.closePath();ctx.fillStyle=arrowColor;ctx.fill();
    ctx.lineWidth=cfg.arrowWidth;ctx.strokeStyle=cfg.arrowOutline;ctx.stroke();
  }

  function startSpin(){
	  if (spinning || !config.segments.length) return;
	  spinning = true;
	  const duration = config.spinDuration, startTime = performance.now();
	  const startRot = currentRotation, targetRot = startRot + 10 * Math.PI + Math.random() * Math.PI;
	  const sounds = { click:"sounds/click.mp3", tick:"sounds/tick.mp3", boop:"sounds/boop.mp3", beep:"sounds/beep.mp3" };
	  const chosen = config.customSound || sounds[config.sound];
	  const totalTicks = config.tickDensity; let lastTick = -1;

	  requestAnimationFrame(function anim(now) {
		const p = Math.min((now - startTime) / duration, 1);
		const eased = 1 - Math.pow(1 - p, 3);
		drawSpinner(config, startRot + eased * (targetRot - startRot));
		const tickIndex = Math.floor(eased * totalTicks);

		if (tickIndex > lastTick) {
		  lastTick = tickIndex;
		  if (config.sound !== "none" && chosen) playSoundOnce(chosen, 0.35);
		}

		if (p < 1) {
		  requestAnimationFrame(anim);
		} else {
		  spinning = false;
		  if (config.sound !== "none" && chosen) playSoundOnce(chosen, 0.5);

		  // --- 🧩 New code: determine result + send it outward ---
		  const finalRotation = (startRot + (targetRot - startRot)) % (2 * Math.PI);
			const offset = Math.PI / 2;
			const normalized = (2 * Math.PI - ((finalRotation + offset) % (2 * Math.PI))) % (2 * Math.PI);
			const index = Math.floor((normalized / (2 * Math.PI)) * config.segments.length);
			const landedSegment = config.segments[index];
			const result = landedSegment?.label || "Unknown";


		  // Send result to local Flask listener
		  fetch("http://127.0.0.1:5000/spinresult", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ result })
		  }).catch(err => console.warn("Failed to send spin result:", err));

		  console.log("Spinner result:", result);
		  // --- End new code ---
		}
	  });
	}



  /* Editor Logic */
  if(!dataParam){
    const tb=document.getElementById("segments");
    const updateVal=(id,val)=>document.getElementById(id).textContent=val;
    ["dividerWidth","rimWidth","arrowWidth","spinDuration","tickDensity"].forEach(id=>{
      const s=document.getElementById(id);
      s.oninput=()=>{updateVal(id+"Val",s.value);update();};
    });
    ["dividerColor","rimColor","arrowOutline","soundSelect","customSoundUrl"]
      .forEach(id=>document.getElementById(id).oninput=update);

    function fontSelect(v="Roboto"){return `<select class="font">${GOOGLE_FONTS.map(f=>`<option${f===v?" selected":""}>${f}</option>`).join("")}</select>`;}
    function styleBtn(n,a){return `<span class="styleBtn${a?" active":""}" data-style="${n}">${n[0].toUpperCase()}</span>`;}
    
	function addRow(seg){
      const r=document.createElement("tr");
      r.innerHTML=`<td><input class="label" value="${seg.label}"></td>
        <td><input type="color" class="color" value="${seg.color}"></td>
        <td><input type="number" class="weight" min="1" value="${seg.weight}"></td>
        <td>${fontSelect(seg.font)}</td>
        <td><input type="number" class="size mini" min="8" max="40" value="${seg.size}"></td>
        <td>${styleBtn("bold",seg.bold)}</td>
        <td>${styleBtn("italic",seg.italic)}</td>
        <td>${styleBtn("underline",seg.underline)}</td>
		
		<td><input type="color" class="outlineColor" value="${seg.outlineColor || "#000000"}"></td>
		<td><input type="number" class="outlineWidth" min="0" max="10" value="${seg.outlineWidth || 2}"></td>
        
		<td><button class="remove">✕</button></td>`;
      tb.appendChild(r);
      r.querySelector(".remove").onclick=()=>{r.remove();update();};
      r.querySelectorAll("input,select").forEach(e=>e.oninput=update);
      r.querySelectorAll(".styleBtn").forEach(b=>b.onclick=()=>{b.classList.toggle("active");update();});
    }

    document.getElementById("addSegment").onclick=()=>{
      const s={label:"",color:"#"+Math.floor(Math.random()*16777215).toString(16).padStart(6,"0"),
        weight:1,font:"Roboto",size:16,bold:false,italic:false,underline:false};
      addRow(s);update();
    };

    ["spinDelay","autoSpin"].forEach(id=>document.getElementById(id).oninput=update);
    document.getElementById("copyUrl").onclick=()=>navigator.clipboard.writeText(document.getElementById("shareUrl").value);
    document.getElementById("importUrl").onclick=()=>{
      try{
        const u=new URL(document.getElementById("urlImport").value.trim());
        const enc=u.searchParams.get("data");if(!enc)throw 0;
        const cfg=JSON.parse(atob(enc));tb.innerHTML="";Object.assign(config,cfg);
        ["spinDelay","spinDuration","tickDensity","dividerColor","rimColor","arrowOutline"]
          .forEach(id=>{if(config[id]!=null)document.getElementById(id).value=config[id];});
        ["dividerWidth","rimWidth","arrowWidth"].forEach(id=>{
          document.getElementById(id).value=config[id];
          document.getElementById(id+"Val").textContent=config[id];
        });
        document.getElementById("soundSelect").value=config.sound||"none";
        document.getElementById("customSoundUrl").value=config.customSound||"";
        document.getElementById("tickDensityVal").textContent=config.tickDensity;
        config.segments.forEach(addRow);update();
      }catch{alert("Invalid URL");}
    };

    function update(){
      const rows=[...tb.querySelectorAll("tr")];
      config.segments=rows.map(r=>{
        ensureFontLoaded(r.querySelector(".font").value);
        const st={};r.querySelectorAll(".styleBtn").forEach(b=>st[b.dataset.style]=b.classList.contains("active"));
        return{
          label:r.querySelector(".label").value,
		  color:r.querySelector(".color").value,
          weight:parseFloat(r.querySelector(".weight").value)||1,
          font:r.querySelector(".font").value,
		  size:parseFloat(r.querySelector(".size").value)||16,
		  outlineColor: r.querySelector(".outlineColor").value || "#000000",
		  outlineWidth: parseFloat(r.querySelector(".outlineWidth").value) || 0,
		  ...st
        };
      });
      config.spinDelay=parseFloat(document.getElementById("spinDelay").value)||0;
      config.autoSpin=document.getElementById("autoSpin").checked;
      config.spinDuration=parseFloat(document.getElementById("spinDuration").value)||4000;
      config.dividerColor=document.getElementById("dividerColor").value;
      config.dividerWidth=parseFloat(document.getElementById("dividerWidth").value)||2;
      config.rimColor=document.getElementById("rimColor").value;
      config.rimWidth=parseFloat(document.getElementById("rimWidth").value)||3;
      config.arrowOutline=document.getElementById("arrowOutline").value;
      config.arrowWidth=parseFloat(document.getElementById("arrowWidth").value)||2;
      config.sound=document.getElementById("soundSelect").value;
      config.customSound=document.getElementById("customSoundUrl").value.trim();
      config.tickDensity=parseFloat(document.getElementById("tickDensity").value)||30;
      drawSpinner(config);
      const sounds={click:"sounds/click.mp3",tick:"sounds/tick.mp3",boop:"sounds/boop.mp3",beep:"sounds/beep.mp3"};
      const chosen=config.customSound||sounds[config.sound];
      if(config.sound!=="none"&&chosen)preloadAudio(chosen);
      const encoded=btoa(JSON.stringify(config));
      document.getElementById("shareUrl").value=`${location.origin}${location.pathname}?data=${encoded}`;
    }

    addRow({label:"Sample",color:"#ff3b3b",weight:1,font:"Roboto",size:16,bold:false,italic:false,underline:false});
    update();canvas.onclick=startSpin;
  } else {
    document.getElementById("editor").style.display="none";
    try{
      config=JSON.parse(atob(dataParam));
      drawSpinner(config);canvas.onclick=startSpin;
      if(config.autoSpin)setTimeout(startSpin,(config.spinDelay??0)*1000);
    }catch{document.body.innerHTML="<h3>Invalid or corrupted spinner data.</h3>";}
  }
});
