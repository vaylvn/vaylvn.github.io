const SIZE = 20;
const MAX_ACTIONS = 30;

let year = 0;
let score = 0;
let actions = MAX_ACTIONS;
let running = false;
let loop = null;

const gridEl = document.getElementById('grid');
const yearEl = document.getElementById('year');
const actionsEl = document.getElementById('actions');
const scoreEl = document.getElementById('score');

const lifespans = [12, 8, 5];
const seedChance = [0.35, 0.2, 0.1];
const spreadRadius = [1, 2, 3];

const tile = () => ({
  moisture: Math.floor(Math.random()*2)+1,
  nutrients: Math.floor(Math.random()*2)+1,
  tier: null,
  age: 0
});

let grid = Array.from({length:SIZE},()=>Array.from({length:SIZE},tile));

function render() {
  gridEl.innerHTML='';
  grid.forEach((row,y)=>row.forEach((c,x)=>{
    const d=document.createElement('div');
    d.className=`tile moisture-${c.moisture}`;
    if(c.tier!==null)d.classList.add(`tier-${c.tier}`);
    d.onclick=()=>clickTile(x,y);
    gridEl.appendChild(d);
  }));
  yearEl.textContent=year;
  actionsEl.textContent=actions;
  scoreEl.textContent=score;
}

function clickTile(x,y){
  if(running||actions<=0)return;
  const c=grid[y][x];
  c.tier = c.tier===null?0:(c.tier+1)%3;
  c.age=0;
  actions--;
  render();
}

function neighbors(x,y,r){
  const out=[];
  for(let dy=-r;dy<=r;dy++)
    for(let dx=-r;dx<=r;dx++){
      if(dx||dy){
        const nx=x+dx, ny=y+dy;
        if(nx>=0&&ny>=0&&nx<SIZE&&ny<SIZE)
          out.push(grid[ny][nx]);
      }
    }
  return out;
}

function simulateYear(){
  year++;

  // decay + upkeep
  grid.flat().forEach(c=>{
    if(Math.random()<0.5)c.moisture=Math.max(0,c.moisture-1);
    if(c.tier!==null){
      c.age++;
      c.nutrients=Math.max(0,c.nutrients-(c.tier+1));
      if(c.moisture===0||c.nutrients===0||c.age>lifespans[c.tier]){
        c.tier=null;c.age=0;
      }
    }
  });

  // seeding
  grid.forEach((row,y)=>row.forEach((c,x)=>{
    if(c.tier===null||c.age<2)return;
    if(Math.random()<seedChance[c.tier]){
      const targets=neighbors(x,y,spreadRadius[c.tier])
        .filter(t=>t.tier===null&&t.moisture>=1&&t.nutrients>=1);
      if(targets.length){
        const t=targets[Math.floor(Math.random()*targets.length)];
        t.tier=c.tier;
        t.age=0;
      }
    }
  }));

  // diversity + scoring
  const counts=[0,0,0];
  grid.flat().forEach(c=>{
    if(c.tier!==null){
      counts[c.tier]++;
      if(c.tier===1)score++;
      if(c.tier===2)score+=3;
    }
  });

  const total=counts.reduce((a,b)=>a+b,0);
  counts.forEach((n,i)=>{
    if(n/total>0.7){
      grid.flat().forEach(c=>{
        if(c.tier===i)c.nutrients=Math.max(0,c.nutrients-1);
      });
    }
  });

  // mother nature
  if(Math.random()<0.1){
    const cx=Math.floor(Math.random()*SIZE);
    const cy=Math.floor(Math.random()*SIZE);
    neighbors(cx,cy,1).forEach(c=>c.moisture=0);
  }

  // collapse
  if(total===0){
    clearInterval(loop);
    running=false;
    console.log("Run ended. Final score:",score);
  }
}

document.getElementById('run').onclick=()=>{
  if(running)return;
  running=true;
  loop=setInterval(()=>{simulateYear();render();},900);
};

render();
