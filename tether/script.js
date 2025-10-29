const SIZE = 5;
const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const restartBtn = document.getElementById("restartBtn");

let turn = "A";
let phase = "select";
let selectedIndex = null;
let tempFirst = null;
let validPartnerTiles = [];

const manhattan = (a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const inside = (x,y)=>x>=0 && x<SIZE && y>=0 && y<SIZE;

const players = {
  A:[{x:2,y:1},{x:2,y:3}],
  B:[{x:1,y:2},{x:3,y:2}]
};

const board=[];
const canvas = document.createElement("canvas");
canvas.style.position="absolute";
canvas.style.pointerEvents="none";
canvas.style.zIndex="1";
boardEl.style.position="relative";
boardEl.appendChild(canvas);
const ctx = canvas.getContext("2d");

/* ------------------ BOARD ------------------ */
function createBoard(){
  boardEl.innerHTML="";
  for(let y=0;y<SIZE;y++){
    board[y]=[];
    for(let x=0;x<SIZE;x++){
      const c=document.createElement("div");
      c.className="cell";
      c.dataset.x=x; c.dataset.y=y;
      c.onclick=()=>onClick(x,y);
      board[y][x]=c;
      boardEl.appendChild(c);
    }
  }
  boardEl.appendChild(canvas);
  drawPieces();
}

/* ------------------ RENDERING ------------------ */
function drawPieces(){
  for(let y=0;y<SIZE;y++)
    for(let x=0;x<SIZE;x++)
      board[y][x].classList.remove("playerA","playerB");

  for(const p of players.A) board[p.y][p.x].classList.add("playerA");
  for(const p of players.B) board[p.y][p.x].classList.add("playerB");
  drawTethers();
}

function drawTethers(){
  const rect = boardEl.getBoundingClientRect();
  const cell = rect.width / SIZE;
  canvas.width = rect.width;
  canvas.height = rect.height;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const mid=p=>[p.x*cell+cell/2,p.y*cell+cell/2];
  const pairs=[
    {nodes:players.A,color:"rgba(0,255,255,0.4)"},
    {nodes:players.B,color:"rgba(255,80,80,0.4)"}
  ];
  pairs.forEach(p=>{
    const [a,b]=p.nodes;
    const [x1,y1]=mid(a);
    const [x2,y2]=mid(b);
    ctx.strokeStyle=p.color;
    ctx.lineWidth=4;
    ctx.beginPath();
    ctx.moveTo(x1,y1);
    ctx.lineTo(x2,y2);
    ctx.stroke();
  });
}

/* ------------------ COLLISION LOGIC ------------------ */
function getTethers(){
  return [
    {a:players.A[0],b:players.A[1]},
    {a:players.B[0],b:players.B[1]}
  ];
}

function ccw(P,Q,R){ return (R.y-P.y)*(Q.x-P.x) > (Q.y-P.y)*(R.x-P.x); }

function segmentsIntersect(A,B,C,D){
  return (ccw(A,C,D)!==ccw(B,C,D)) && (ccw(A,B,C)!==ccw(A,B,D));
}

// Check if point P lies directly on the line segment AB
function pointOnSegment(P,A,B){
  const cross = (P.y - A.y) * (B.x - A.x) - (P.x - A.x) * (B.y - A.y);
  if (Math.abs(cross) > 1e-6) return false;
  const dot = (P.x - A.x) * (B.x - A.x) + (P.y - A.y) * (B.y - A.y);
  if (dot < 0) return false;
  const lenSq = (B.x - A.x)**2 + (B.y - A.y)**2;
  return dot <= lenSq;
}

// Block any move that crosses or touches any tether line
function crossesTether(from,to){
  const segs=getTethers();
  for(const s of segs){
    // Ignore touching your own tether endpoints
    if((from.x===s.a.x&&from.y===s.a.y)||(from.x===s.b.x&&from.y===s.b.y)) continue;
    if((to.x===s.a.x&&to.y===s.a.y)||(to.x===s.b.x&&to.y===s.b.y)) continue;

    // True intersection
    if(segmentsIntersect(from,to,s.a,s.b)) return true;
    // Landing directly on a cable
    if(pointOnSegment(to,s.a,s.b)) return true;
  }
  return false;
}

/* ------------------ GAME LOGIC ------------------ */
function occupied(x,y){
  return [...players.A,...players.B].some(p=>p.x===x&&p.y===y);
}

function getPartnerMoves(first){
  const opts = [];
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      if (occupied(x, y)) continue;
      const dist = manhattan({ x, y }, first);
      // ✅ must be exactly distance 2, not 1
      if (dist === 2 && !crossesTether(first, { x, y })) {
        opts.push({ x, y });
      }
    }
  return opts;
}


function clearHints(){
  board.flat().forEach(c=>c.classList.remove("highlight","valid","adjacent"));
}

function highlightAdjacents(p){
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  dirs.forEach(([dx,dy])=>{
    const nx=p.x+dx, ny=p.y+dy;
    if(!inside(nx,ny)||occupied(nx,ny)) return;
    const from=p, to={x:nx,y:ny};
    if(!crossesTether(from,to))
      board[ny][nx].classList.add("adjacent");
  });
}

/* ------------------ FLOW ------------------ */
function onClick(x,y){
  const me = players[turn];
  const myIndex = me.findIndex(p=>p.x===x&&p.y===y);

  // Phase 1: select your piece
  if(phase==="select"){
    if(myIndex===-1) return;
    clearHints();
    selectedIndex=myIndex;
    board[y][x].classList.add("highlight");
    highlightAdjacents(me[selectedIndex]);
    phase="chooseFirstMove";
    return;
  }

  // Phase 2: choose where to move that piece
  if(phase==="chooseFirstMove"){
    const sel=me[selectedIndex];
    const dx=Math.abs(sel.x-x), dy=Math.abs(sel.y-y);
    if(dx+dy!==1 || occupied(x,y) || !board[y][x].classList.contains("adjacent")){
      clearHints(); phase="select"; selectedIndex=null; return;
    }
    const stepFrom=sel, stepTo={x,y};
    if(crossesTether(stepFrom,stepTo)){ clearHints(); phase="select"; selectedIndex=null; return; }

    tempFirst={x,y};
    validPartnerTiles=getPartnerMoves(tempFirst);
    clearHints();
    validPartnerTiles.forEach(v=>board[v.y][v.x].classList.add("valid"));
    phase="choosePartner";
    return;
  }

  // Phase 3: choose partner move
  if(phase==="choosePartner"){
    const match=validPartnerTiles.find(v=>v.x===x&&v.y===y);
    if(!match) return;
    const otherIndex=selectedIndex===0?1:0;
    me[selectedIndex]=tempFirst;
    me[otherIndex]={x:match.x,y:match.y};

    clearHints();
    drawPieces();

    const opp=players[turn==="A"?"B":"A"];
    if(!hasAnyLegalMove(opp)){
      statusEl.textContent=`Player ${turn} wins!`;
      boardEl.style.pointerEvents="none";
      return;
    }

    turn=turn==="A"?"B":"A";
    statusEl.textContent=`Player ${turn}'s turn`;
    phase="select"; selectedIndex=null; tempFirst=null; validPartnerTiles=[];
  }
}

function hasAnyLegalMove(nodes){
  for(let i=0;i<2;i++){
    const node=nodes[i];
    const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
    for(const [dx,dy] of dirs){
      const nx=node.x+dx, ny=node.y+dy;
      if(!inside(nx,ny)||occupied(nx,ny)) continue;
      if(crossesTether(node,{x:nx,y:ny})) continue;
      const valids=getPartnerMoves({x:nx,y:ny});
      if(valids.length>0) return true;
    }
  }
  return false;
}

/* ------------------ RESET ------------------ */
restartBtn.onclick=()=>{
  players.A=[{x:2,y:1},{x:2,y:3}];
  players.B=[{x:1,y:2},{x:3,y:2}];
  turn="A";
  phase="select";
  selectedIndex=null;
  tempFirst=null;
  validPartnerTiles=[];
  boardEl.style.pointerEvents="auto";
  statusEl.textContent="Player A's turn";
  clearHints();
  drawPieces();
};

createBoard();
