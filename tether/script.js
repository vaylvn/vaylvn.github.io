const SIZE = 5;
const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const restartBtn = document.getElementById("restartBtn");

let board = [];
let turn = "A";
let selected = null; // selected piece and move state

const manhattan = (a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const inside = (x,y)=>x>=0 && x<SIZE && y>=0 && y<SIZE;

const players = {
  A: [{x:2,y:1},{x:2,y:3}],
  B: [{x:1,y:2},{x:3,y:2}]
};

function createBoard(){
  boardEl.innerHTML="";
  board=[];
  for(let y=0;y<SIZE;y++){
    const row=[];
    for(let x=0;x<SIZE;x++){
      const cell=document.createElement("div");
      cell.className="cell";
      cell.dataset.x=x;
      cell.dataset.y=y;
      cell.addEventListener("click",()=>onClick(x,y));
      boardEl.appendChild(cell);
      row.push(cell);
    }
    board.push(row);
  }
  render();
}

function render(){
  for(let y=0;y<SIZE;y++)
    for(let x=0;x<SIZE;x++)
      board[y][x].className="cell";

  for(const p of players.A)
    board[p.y][p.x].classList.add("playerA");
  for(const p of players.B)
    board[p.y][p.x].classList.add("playerB");
}

function occupied(x,y){
  return [...players.A,...players.B].some(p=>p.x===x&&p.y===y);
}

function validPartnerMoves(first){
  const opts=[];
  for(let y=0;y<SIZE;y++){
    for(let x=0;x<SIZE;x++){
      if(!occupied(x,y) && manhattan({x,y},first)<=2 && manhattan({x,y},first)>0)
        opts.push({x,y});
    }
  }
  return opts;
}

function onClick(x,y){
  const me = players[turn];
  const cells = board.flat();

  // step 1: selecting your own piece
  const myIndex = me.findIndex(p=>p.x===x && p.y===y);
  if(myIndex>=0 && !selected){
    cells.forEach(c=>c.classList.remove("highlight","valid"));
    selected={index:myIndex};
    board[y][x].classList.add("highlight");
    return;
  }

  // must have selected something
  if(!selected) return;

  const node = me[selected.index];
  const dx=Math.abs(node.x-x), dy=Math.abs(node.y-y);
  if(dx+dy!==1 || occupied(x,y)){
    selected=null;
    cells.forEach(c=>c.classList.remove("highlight","valid"));
    return;
  }

  // move first node tentatively
  const newNode={x,y};
  const otherIndex=selected.index===0?1:0;
  const valid=validPartnerMoves(newNode);

  cells.forEach(c=>c.classList.remove("valid"));
  valid.forEach(v=>board[v.y][v.x].classList.add("valid"));

  // wait for second click to confirm partner position
  boardEl.onclick = e=>{
    const target=e.target;
    if(!target.classList.contains("valid")) return;
    const nx=+target.dataset.x, ny=+target.dataset.y;

    // commit move
    me[selected.index]=newNode;
    me[otherIndex]={x:nx,y:ny};

    boardEl.onclick=null;
    selected=null;
    render();

    // check win condition
    const opp = players[turn==="A"?"B":"A"];
    if(!hasAnyLegalMove(opp)){
      statusEl.textContent=`Player ${turn} wins!`;
      boardEl.style.pointerEvents="none";
    } else {
      turn = turn==="A"?"B":"A";
      statusEl.textContent=`Player ${turn}'s turn`;
    }
  };
}

function hasAnyLegalMove(nodes){
  for(let i=0;i<2;i++){
    const node=nodes[i];
    const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
    for(const [dx,dy] of dirs){
      const nx=node.x+dx, ny=node.y+dy;
      if(!inside(nx,ny) || occupied(nx,ny)) continue;
      const valid=validPartnerMoves({x:nx,y:ny});
      if(valid.length>0) return true;
    }
  }
  return false;
}

restartBtn.onclick=()=>{
  players.A=[{x:2,y:1},{x:2,y:3}];
  players.B=[{x:1,y:2},{x:3,y:2}];
  turn="A";
  selected=null;
  boardEl.style.pointerEvents="auto";
  statusEl.textContent="Player A's turn";
  render();
};

createBoard();
