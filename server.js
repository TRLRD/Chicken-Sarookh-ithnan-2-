const path=require("path");
const http=require("http");
const express=require("express");
const {Server}=require("socket.io");

const app=express();
const server=http.createServer(app);
const io=new Server(server);
app.use(express.static(path.join(__dirname,"public")));

const rooms=new Map();
const W=1200,H=700,MAX=8,MIN=2;
const COLORS=["#7dd3fc","#86efac","#f9a8d4","#c4b5fd","#fde68a","#fdba74","#67e8f9","#a7f3d0"];

function code(){let c;do{c=Math.random().toString(36).slice(2,6).toUpperCase()}while(rooms.has(c));return c}
function cleanName(n){return String(n||"Chicken").replace(/[<>]/g,"").trim().slice(0,16)||"Chicken"}
function spawn(i){const a=[{x:180,y:180},{x:1020,y:180},{x:180,y:520},{x:1020,y:520},{x:600,y:160},{x:600,y:540},{x:300,y:350},{x:900,y:350}][i%8];return {...a}}
function newRocket(speed=260){const a=Math.random()*Math.PI*2;return {x:W/2,y:H/2,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,r:25}}
function publicRoom(r){
 return {code:r.code,hostId:r.hostId,state:r.state,round:r.round,scores:Object.fromEntries(Object.values(r.players).map(p=>[p.id,p.score])),players:Object.values(r.players).map(p=>({id:p.id,name:p.name,color:p.color,alive:p.alive,score:p.score}))};
}
function broadcast(r){io.to(r.code).emit("state",publicRoom(r))}
function emitGame(r){io.to(r.code).emit("gameState",{players:Object.values(r.players).map(p=>({id:p.id,x:p.x,y:p.y,name:p.name,color:p.color,alive:p.alive,score:p.score})),rocket:r.rocket,rockets:r.rockets,round:r.round,state:r.state,event:r.event,eventUntil:r.eventUntil});}

function startRound(r){
 clearTimers(r); r.state="countdown"; r.round++; r.event=null;r.eventUntil=0;
 let i=0;for(const p of Object.values(r.players)){p.alive=true;p.x=spawn(i).x;p.y=spawn(i).y;p.vx=0;p.vy=0;p.lastDx=0;p.lastDy=-1;p.dashUntil=0;p.dashCooldown=0;p.kickCooldown=0;i++}
 r.rocket=newRocket(210);r.rockets=[r.rocket];r.roundStartedAt=Date.now()+3200;
 broadcast(r);io.to(r.code).emit("countdown");
 r.countdownTimer=setTimeout(()=>{r.state="playing";broadcast(r);},3200);
 r.tick=setInterval(()=>tick(r),50);
 r.chaosTimer=setInterval(()=>maybeChaos(r),22000);
}
function clearTimers(r){if(r.tick)clearInterval(r.tick);if(r.chaosTimer)clearInterval(r.chaosTimer);if(r.countdownTimer)clearTimeout(r.countdownTimer);if(r.nextTimer)clearTimeout(r.nextTimer)}
function tick(r){
 if(r.state!=="playing")return;
 const now=Date.now(),dt=.05;
 const speedBoost=r.event==="ROCKET BOOST"&&now<r.eventUntil?1.75:1;
 const chickenBoost=r.event==="CHICKEN PANIC"&&now<r.eventUntil?1.35:1;
 if(r.eventUntil&&now>=r.eventUntil){r.event=null;r.rockets=r.rockets.slice(0,1)}
 for(const p of Object.values(r.players)){
  if(!p.alive)continue;
  if(p.dashUntil>now){p.x+=p.lastDx*11;p.y+=p.lastDy*11}
  else {const mag=Math.hypot(p.vx,p.vy)||1;p.x+=p.vx*dt*chickenBoost;p.y+=p.vy*dt*chickenBoost}
  p.x=Math.max(35,Math.min(W-35,p.x));p.y=Math.max(45,Math.min(H-35,p.y));
  p.dashCooldown=Math.max(0,p.dashCooldown-dt);p.kickCooldown=Math.max(0,p.kickCooldown-dt);
 }
 for(const q of r.rockets){
  q.x+=q.vx*dt*speedBoost;q.y+=q.vy*dt*speedBoost;
  if(q.x<q.r){q.x=q.r;q.vx=Math.abs(q.vx)} if(q.x>W-q.r){q.x=W-q.r;q.vx=-Math.abs(q.vx)}
  if(q.y<q.r){q.y=q.r;q.vy=Math.abs(q.vy)} if(q.y>H-q.r){q.y=H-q.r;q.vy=-Math.abs(q.vy)}
  for(const p of Object.values(r.players))if(p.alive&&Math.hypot(p.x-q.x,p.y-q.y)<q.r+22){p.alive=false;io.to(r.code).emit("hit",p.id)}
 }
 const alive=Object.values(r.players).filter(p=>p.alive);
 if(alive.length<=1&&Object.keys(r.players).length>=MIN)finishRound(r,alive[0]);
 emitGame(r);
}
function finishRound(r,winner){
 r.state="roundEnd";clearTimers(r);
 if(winner){winner.score++;io.to(r.code).emit("winner",{id:winner.id,name:winner.name,score:winner.score})}
 broadcast(r);
 if(winner&&winner.score>=3){r.state="matchEnd";io.to(r.code).emit("matchWinner",{id:winner.id,name:winner.name});broadcast(r)}
 else r.nextTimer=setTimeout(()=>{if(rooms.has(r.code))startRound(r)},3500);
}
function maybeChaos(r){
 if(r.state!=="playing"||r.event)return;
 const events=["ROCKET BOOST","DOUBLE SAROOKH","SHRINKING ARENA","CHICKEN PANIC"];
 const e=events[Math.floor(Math.random()*events.length)];r.event=e;r.eventUntil=Date.now()+5000;
 if(e==="DOUBLE SAROOKH"&&r.rockets.length<2){const q=newRocket(280);r.rockets.push(q)}
 if(e==="SHRINKING ARENA")r.arenaShrinkUntil=Date.now()+5000;
 io.to(r.code).emit("event",{name:e,duration:5000});
}
function leave(socket){
 const r=socket.room&&rooms.get(socket.room);if(!r)return;
 delete r.players[socket.id];
 if(!Object.keys(r.players).length){clearTimers(r);rooms.delete(r.code);return}
 if(r.hostId===socket.id)r.hostId=Object.keys(r.players)[0];
 io.to(r.code).emit("notice",socket.data.name+" left the game.");
 if(Object.keys(r.players).length<MIN&&r.state!=="lobby"){clearTimers(r);r.state="lobby"}
 broadcast(r);
}

io.on("connection",socket=>{
 socket.on("create",name=>{
  if(socket.room)return;
  const c=code(),p={id:socket.id,name:cleanName(name),color:COLORS[0],score:0,alive:true,x:W/2,y:H/2,vx:0,vy:0,lastDx:0,lastDy:-1,dashCooldown:0,kickCooldown:0};
  const r={code:c,hostId:socket.id,players:{[socket.id]:p},state:"lobby",round:0,scores:{},rocket:null,rockets:[],event:null,eventUntil:0};
  rooms.set(c,r);socket.join(c);socket.room=c;socket.data.name=p.name;socket.emit("joined",publicRoom(r));broadcast(r);
 });
 socket.on("join",({room,name})=>{
  const r=rooms.get(String(room||"").toUpperCase());
  if(!r)return socket.emit("errorMsg","Room not found!");
  if(Object.keys(r.players).length>=MAX)return socket.emit("errorMsg","Room is full!");
  if(r.state!=="lobby"&&r.state!=="matchEnd")return socket.emit("errorMsg","Game already started!");
  const names=new Set(Object.values(r.players).map(p=>p.name.toLowerCase()));let n=cleanName(name),base=n,i=2;while(names.has(n.toLowerCase()))n=(base.slice(0,13)+" "+i++).trim();
  const idx=Object.keys(r.players).length,p={id:socket.id,name:n,color:COLORS[idx%COLORS.length],score:0,alive:true,x:0,y:0,vx:0,vy:0,lastDx:0,lastDy:-1,dashCooldown:0,kickCooldown:0};
  r.players[socket.id]=p;socket.join(r.code);socket.room=r.code;socket.data.name=n;socket.emit("joined",publicRoom(r));broadcast(r);
 });
 socket.on("start",()=>{
  const r=rooms.get(socket.room);if(!r||r.hostId!==socket.id||Object.keys(r.players).length<MIN)return;
  for(const p of Object.values(r.players))p.score=0;startRound(r);
 });
 socket.on("input",({x,y})=>{
  const r=rooms.get(socket.room),p=r?.players[socket.id];if(!p||!p.alive||r.state!=="playing")return;
  x=Math.max(-1,Math.min(1,Number(x)||0));y=Math.max(-1,Math.min(1,Number(y)||0));
  const m=Math.hypot(x,y);if(m>1){x/=m;y/=m} p.vx=x*260;p.vy=y*260;if(m>.1){p.lastDx=x;p.lastDy=y}
 });
 socket.on("dash",()=>{
  const r=rooms.get(socket.room),p=r?.players[socket.id];if(!p||!p.alive||r.state!=="playing"||p.dashCooldown>0)return;
  p.dashCooldown=2;p.dashUntil=Date.now()+170;io.to(r.code).emit("action",{type:"dash",id:p.id});
 });
 socket.on("kick",()=>{
  const r=rooms.get(socket.room),p=r?.players[socket.id];if(!p||!p.alive||r.state!=="playing"||p.kickCooldown>0)return;
  p.kickCooldown=2;let target=null,best=75;
  for(const q of Object.values(r.players))if(q.alive&&q.id!==p.id){const d=Math.hypot(q.x-p.x,q.y-p.y);if(d<best){best=d;target=q}}
  if(target){const dx=target.x-p.x,dy=target.y-p.y,m=Math.hypot(dx,dy)||1;target.x=Math.max(35,Math.min(W-35,target.x+dx/m*100));target.y=Math.max(45,Math.min(H-35,target.y+dy/m*100));io.to(r.code).emit("action",{type:"kick",id:p.id,target:target.id})}
 });
 socket.on("again",()=>{const r=rooms.get(socket.room);if(r&&r.hostId===socket.id&&r.state==="matchEnd"){for(const p of Object.values(r.players))p.score=0;startRound(r)}});
 socket.on("disconnect",()=>leave(socket));
});
server.listen(process.env.PORT||3000,()=>console.log("Chicken Sarookh 2 running on port "+(process.env.PORT||3000)));