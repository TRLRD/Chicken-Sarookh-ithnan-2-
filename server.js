const path=require("path");
const http=require("http");
const express=require("express");
const {Server}=require("socket.io");

const app=express(), server=http.createServer(app), io=new Server(server);
app.use(express.static(path.join(__dirname,"public")));

const rooms=new Map();
const W=1200,H=700,MAX=8,MIN=2,TICK=50;
const COLORS=["#7dd3fc","#86efac","#f9a8d4","#c4b5fd","#fde68a","#fdba74","#67e8f9","#a7f3d0"];
const POWERUPS=[
 {type:"SPEED",label:"SPEED BURST",rarity:"common",weight:50,duration:5000},
 {type:"DASH",label:"MEGA DASH",rarity:"common",weight:50,duration:7000},
 {type:"SHIELD",label:"SHIELD",rarity:"uncommon",weight:30,duration:0},
 {type:"ZAP",label:"SCORE ZAP",rarity:"uncommon",weight:30,duration:0},
 {type:"REDIRECT",label:"ROCKET REDIRECT",rarity:"rare",weight:15,duration:5000},
 {type:"CHAOS",label:"CHAOS",rarity:"epic",weight:5,duration:4000}
];

function code(){let c;do c=Math.random().toString(36).slice(2,6).toUpperCase();while(rooms.has(c));return c}
function cleanName(n){return String(n||"Chicken").replace(/[<>]/g,"").trim().slice(0,16)||"Chicken"}
const COSMETICS={upper:["none","crown","sunglasses","chef","halo"],lower:["none","boots","skates","flames","jet"]};
function cleanCosmetics(c){c=c&&typeof c==="object"?c:{};return {color:COLORS.includes(c.color)?c.color:COLORS[0],upper:COSMETICS.upper.includes(c.upper)?c.upper:"none",lower:COSMETICS.lower.includes(c.lower)?c.lower:"none"}}
function spawn(i){return [{x:180,y:180},{x:1020,y:180},{x:180,y:520},{x:1020,y:520},{x:600,y:160},{x:600,y:540},{x:300,y:350},{x:900,y:350}][i%8]}
function newRocket(speed=210,r=25){const a=Math.random()*Math.PI*2;return {x:W/2,y:H/2,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,r,id:Math.random().toString(36).slice(2),bounceSpeed:1.06}}
function pickPower(){const total=POWERUPS.reduce((s,p)=>s+p.weight,0);let n=Math.random()*total;for(const p of POWERUPS){n-=p.weight;if(n<=0)return p}return POWERUPS[0]}
function publicRoom(r){
 return {code:r.code,hostId:r.hostId,state:r.state,round:r.round,players:Object.values(r.players).map(p=>({id:p.id,name:p.name,color:p.color,upper:p.upper,lower:p.lower,alive:p.alive,connected:p.connected!==false,score:p.score}))};
}
function broadcast(r){io.to(r.code).emit("state",publicRoom(r))}
function emitGame(r){
 io.to(r.code).emit("gameState",{players:Object.values(r.players).map(p=>({
  id:p.id,x:p.x,y:p.y,targetX:p.x,targetY:p.y,name:p.name,color:p.color,upper:p.upper,lower:p.lower,alive:p.alive,connected:p.connected!==false,score:p.score,
  dashCooldown:p.dashCooldown,speedUntil:p.speedUntil,shield:p.shield
 })),rockets:r.rockets,round:r.round,state:r.state,event:r.event,eventUntil:r.eventUntil,
 powerups:r.powerups.map(q=>({id:q.id,x:q.x,y:q.y,type:q.type,label:q.label,rarity:q.rarity})),serverNow:Date.now(),roundStartedAt:r.roundStartedAt||0});
}
function clearTimers(r){for(const k of ["tick","chaosTimer","scoreTimer","countdownTimer","nextTimer","powerupTimer"])if(r[k]){clearInterval(r[k]);clearTimeout(r[k]);r[k]=null}}
function startRound(r){
 clearTimers(r);r.state="countdown";r.round++;r.event=null;r.eventUntil=0;r.powerups=[];
 let i=0;for(const p of Object.values(r.players)){p.alive=true;const s=spawn(i++);p.x=s.x;p.y=s.y;p.vx=0;p.vy=0;p.lastDx=0;p.lastDy=-1;p.dashUntil=0;p.dashCooldown=0;p.kickCooldown=0;p.speedUntil=0;p.shield=false;p.roundSurvival=0}
 r.rocket=newRocket(210);r.rockets=[r.rocket];r.roundStartedAt=Date.now()+3200;r.lastScoreTick=Date.now();
 broadcast(r);io.to(r.code).emit("countdown");
 r.countdownTimer=setTimeout(()=>{r.state="playing";r.roundStartedAt=Date.now();broadcast(r)},3200);
 r.tick=setInterval(()=>tick(r),TICK);r.chaosTimer=setInterval(()=>maybeChaos(r),22000);r.powerupTimer=setInterval(()=>spawnPowerup(r),7000);
 r.scoreTimer=setInterval(()=>awardSurvival(r),1000);
}
function awardSurvival(r){
 if(r.state!=="playing")return;const now=Date.now();
 for(const p of Object.values(r.players))if(p.connected!==false&&p.alive){
  p.score+=10;p.roundSurvival++;
  if(p.roundSurvival%10===0){p.score+=50;io.to(r.code).emit("scoreFx",{id:p.id,amount:50,label:"SURVIVAL BONUS"})}
 }
 broadcast(r);
}
function finishRound(r,winner){
 if(r.state!=="playing")return;
 r.state="roundEnd";clearTimers(r);
 if(winner){winner.roundWins++;io.to(r.code).emit("roundWinner",{id:winner.id,name:winner.name})}
 broadcast(r);emitGame(r);
 if(winner&&winner.roundWins>=3){r.state="matchEnd";broadcast(r);io.to(r.code).emit("matchResults",finalResults(r))}
 else r.nextTimer=setTimeout(()=>{if(rooms.has(r.code))startRound(r)},4200);
}
function finalResults(r){
 return Object.values(r.players).sort((a,b)=>b.score-a.score||b.roundWins-a.roundWins).map((p,i)=>({
  place:i+1,id:p.id,name:p.name,score:p.score,roundWins:p.roundWins,survival:p.totalSurvival,
  powerups:p.powerupsCollected,kicks:p.kicksLanded,dashes:p.dashesUsed
 }));
}
function maybeChaos(r){
 if(r.state!=="playing"||r.event)return;
 const events=["ROCKET BOOST","DOUBLE SAROOKH","GIANT SAROOKH","SHRINKING ARENA","CHICKEN PANIC","BLACKOUT"];
 const e=events[Math.floor(Math.random()*events.length)];r.event=e;r.eventUntil=Date.now()+5000;if(e==="DOUBLE SAROOKH"&&r.rockets.length<2)r.rockets.push(newRocket(210));
 if(e==="GIANT SAROOKH")r.rockets[0].r=52;
 if(e==="BLACKOUT")r.blackoutUntil=r.eventUntil;
 io.to(r.code).emit("event",{name:e,duration:5000});
}
function spawnPowerup(r){
 if(r.state!=="playing"||r.powerups.length>=3)return;
 const p=pickPower(),q={id:Math.random().toString(36).slice(2),x:80+Math.random()*(W-160),y:80+Math.random()*(H-160),...p};
 r.powerups.push(q);io.to(r.code).emit("powerupSpawn",q);
}
function collect(r,p,q){
 r.powerups=r.powerups.filter(x=>x.id!==q.id);p.powerupsCollected++;
 if(q.type==="SPEED")p.speedUntil=Date.now()+q.duration;
 if(q.type==="DASH")p.dashCooldown=0;
 if(q.type==="SHIELD")p.shield=true;
 if(q.type==="ZAP"){
  const targets=Object.values(r.players).filter(x=>x.alive&&x.id!==p.id);
  if(targets.length){const t=targets[Math.floor(Math.random()*targets.length)];const lost=Math.min(75,t.score);t.score-=lost;p.score+=lost;io.to(r.code).emit("scoreFx",{id:p.id,amount:lost,label:"SCORE ZAP"});io.to(r.code).emit("scoreFx",{id:t.id,amount:-lost,label:"ZAPPED"})}
 }
 if(q.type==="REDIRECT"){for(const rocket of r.rockets){rocket.vx*=-1;rocket.vy*=-1}p.redirectUntil=Date.now()+q.duration}
 if(q.type==="CHAOS"){r.event="CHICKEN PANIC";r.eventUntil=Date.now()+q.duration}
 io.to(r.code).emit("powerup",{id:p.id,type:q.type,label:q.label});
}
function tick(r){
 if(r.state!=="playing")return;
 const now=Date.now(),dt=TICK/1000;
 const speedBoost=r.event==="ROCKET BOOST"&&now<r.eventUntil?1.75:1;
 const panic=r.event==="CHICKEN PANIC"&&now<r.eventUntil?1.35:1;
 if(r.eventUntil&&now>=r.eventUntil){r.event=null;r.rockets=r.rockets.slice(0,1);if(r.rockets[0])r.rockets[0].r=25;r.blackoutUntil=0}
 if(r.event==="BLACKOUT"&&now<r.eventUntil){}
 for(const p of Object.values(r.players))if(p.connected!==false&&p.alive){
  const mult=(p.speedUntil>now?1.55:1)*panic;
  if(p.dashUntil>now){p.x+=p.lastDx*11;p.y+=p.lastDy*11}else{p.x+=p.vx*dt*mult;p.y+=p.vy*dt*mult}
  p.x=Math.max(35,Math.min(W-35,p.x));p.y=Math.max(45,Math.min(H-35,p.y));
  p.dashCooldown=Math.max(0,p.dashCooldown-dt);p.kickCooldown=Math.max(0,p.kickCooldown-dt);
  for(const q of [...r.powerups])if(Math.hypot(p.x-q.x,p.y-q.y)<34){collect(r,p,q);break}
 }
 for(const q of r.rockets){
  q.x+=q.vx*dt*speedBoost;q.y+=q.vy*dt*speedBoost;
  if(q.x<q.r){q.x=q.r;q.vx=Math.abs(q.vx);q.vx*=q.bounceSpeed;q.vy*=q.bounceSpeed}
  if(q.x>W-q.r){q.x=W-q.r;q.vx=-Math.abs(q.vx);q.vx*=q.bounceSpeed;q.vy*=q.bounceSpeed}
  if(q.y<q.r){q.y=q.r;q.vy=Math.abs(q.vy);q.vx*=q.bounceSpeed;q.vy*=q.bounceSpeed}
  if(q.y>H-q.r){q.y=H-q.r;q.vy=-Math.abs(q.vy);q.vx*=q.bounceSpeed;q.vy*=q.bounceSpeed}
  const currentSpeed=Math.hypot(q.vx,q.vy),maxSpeed=560;if(currentSpeed>maxSpeed){const k=maxSpeed/currentSpeed;q.vx*=k;q.vy*=k}
  for(const p of Object.values(r.players))if(p.connected!==false&&p.alive&&Math.hypot(p.x-q.x,p.y-q.y)<q.r+22){
   if(p.shield){p.shield=false;io.to(r.code).emit("shieldBreak",p.id)}
   else{p.alive=false;p.totalSurvival+=Math.floor((now-r.roundStartedAt)/1000);io.to(r.code).emit("hit",p.id)}
  }
 }
 const alive=Object.values(r.players).filter(p=>p.connected!==false&&p.alive);
 if(alive.length<=1&&Object.values(r.players).filter(p=>p.connected!==false).length>=1)finishRound(r,alive[0]);
 emitGame(r);
}
function leave(socket){
 const r=socket.room&&rooms.get(socket.room);if(!r)return;
 delete r.players[socket.id];
 const p=r.players[socket.id];if(p){p.connected=false;p.alive=false;}
 const connected=Object.values(r.players).filter(x=>x.connected!==false);
 if(!connected.length){clearTimers(r);rooms.delete(r.code);return}
 if(r.hostId===socket.id)r.hostId=connected[0].id;
 io.to(r.code).emit("notice",socket.data.name+" left the game.");
 if(r.state==="playing"){const alive=connected.filter(x=>x.alive);if(alive.length<=1&&connected.length>=1)finishRound(r,alive[0]||null)}
 if(connected.length<MIN&&r.state!=="lobby"&&r.state!=="matchEnd"&&r.state!=="playing"){clearTimers(r);r.state="lobby"}
 broadcast(r);
}
io.on("connection",socket=>{
 socket.on("create",name=>{
  if(socket.room)return;
  const c=code(),data=typeof name==="object"?name:{name},pos=spawn(0),cos=cleanCosmetics(data.cosmetics),p={id:socket.id,name:cleanName(data.name),color:cos.color,upper:cos.upper,lower:cos.lower,connected:true,score:0,roundWins:0,totalSurvival:0,powerupsCollected:0,kicksLanded:0,dashesUsed:0,alive:true,x:pos.x,y:pos.y,vx:0,vy:0,lastDx:0,lastDy:-1,dashCooldown:0,kickCooldown:0,speedUntil:0,shield:false};
  const r={code:c,hostId:socket.id,players:{[socket.id]:p},state:"lobby",round:0,rocket:null,rockets:[],event:null,eventUntil:0,blackoutUntil:0,powerups:[]};
  rooms.set(c,r);socket.join(c);socket.room=c;socket.data.name=p.name;socket.emit("joined",publicRoom(r));broadcast(r);
 });
 socket.on("join",({room,name})=>{
  const r=rooms.get(String(room||"").toUpperCase());
  if(!r)return socket.emit("errorMsg","Room not found!");
  if(Object.keys(r.players).length>=MAX)return socket.emit("errorMsg","Room is full!");
  if(r.state!=="lobby"&&r.state!=="matchEnd")return socket.emit("errorMsg","Game already started!");
  const data=typeof name==="object"?name:{name};
  const names=new Set(Object.values(r.players).map(p=>p.name.toLowerCase()));let n=cleanName(data.name),base=n,i=2;while(names.has(n.toLowerCase()))n=(base.slice(0,13)+" "+i++).trim();
  const idx=Object.keys(r.players).length,s=spawn(idx),cos=cleanCosmetics(data.cosmetics),p={id:socket.id,name:n,color:cos.color,upper:cos.upper,lower:cos.lower,connected:true,score:0,roundWins:0,totalSurvival:0,powerupsCollected:0,kicksLanded:0,dashesUsed:0,alive:true,x:s.x,y:s.y,vx:0,vy:0,lastDx:0,lastDy:-1,dashCooldown:0,kickCooldown:0,speedUntil:0,shield:false};
  r.players[socket.id]=p;socket.join(r.code);socket.room=r.code;socket.data.name=n;socket.emit("joined",publicRoom(r));broadcast(r);
 });
 socket.on("start",()=>{const r=rooms.get(socket.room);if(!r||r.hostId!==socket.id||Object.keys(r.players).length<MIN)return;for(const p of Object.values(r.players)){p.score=0;p.roundWins=0;p.totalSurvival=0;p.powerupsCollected=0;p.kicksLanded=0;p.dashesUsed=0}startRound(r)});
 socket.on("input",({x,y})=>{
  const r=rooms.get(socket.room),p=r?.players[socket.id];if(!p||!p.alive||r.state!=="playing")return;
  x=Math.max(-1,Math.min(1,Number(x)||0));y=Math.max(-1,Math.min(1,Number(y)||0));const m=Math.hypot(x,y);if(m>1){x/=m;y/=m}
  p.vx=x*260;p.vy=y*260;if(m>.1){p.lastDx=x;p.lastDy=y}
 });
 socket.on("dash",()=>{
  const r=rooms.get(socket.room),p=r?.players[socket.id];if(!p||!p.alive||r.state!=="playing"||p.dashCooldown>0)return;
  p.dashCooldown=p.dashCooldown<=0?2:0;p.dashUntil=Date.now()+170;p.dashesUsed++;io.to(r.code).emit("action",{type:"dash",id:p.id});
 });
 socket.on("kick",()=>{
  const r=rooms.get(socket.room),p=r?.players[socket.id];if(!p||!p.alive||r.state!=="playing"||p.kickCooldown>0)return;
  p.kickCooldown=2;let target=null,best=75;
  for(const q of Object.values(r.players))if(q.alive&&q.id!==p.id){const d=Math.hypot(q.x-p.x,q.y-p.y);if(d<best){best=d;target=q}}
  if(target){const dx=target.x-p.x,dy=target.y-p.y,m=Math.hypot(dx,dy)||1;target.x=Math.max(35,Math.min(W-35,target.x+dx/m*100));target.y=Math.max(45,Math.min(H-35,target.y+dy/m*100));p.kicksLanded++;p.score+=25;io.to(r.code).emit("scoreFx",{id:p.id,amount:25,label:"KICK BONUS"});io.to(r.code).emit("action",{type:"kick",id:p.id,target:target.id})}
 });
 socket.on("again",()=>{const r=rooms.get(socket.room);if(r&&r.hostId===socket.id&&r.state==="matchEnd"){for(const p of Object.values(r.players)){p.score=0;p.roundWins=0}startRound(r)}});
 socket.on("disconnect",()=>leave(socket));
});
server.listen(process.env.PORT||3000,()=>console.log("Chicken Sarookh 2 running on port "+(process.env.PORT||3000)));
