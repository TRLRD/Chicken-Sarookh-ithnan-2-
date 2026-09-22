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
 {type:"CHAOS",label:"CHAOS",rarity:"epic",weight:5,duration:4000},
 {type:"MAGNET",label:"MAGNET",rarity:"rare",weight:15,duration:6000},
 {type:"TIMEBURST",label:"TIME BURST",rarity:"rare",weight:15,duration:4500},
 {type:"PHASE",label:"PHASE",rarity:"epic",weight:5,duration:3000},
 {type:"SCOREBOOST",label:"SCORE BOOST",rarity:"uncommon",weight:30,duration:7000},
 {type:"REPULSE",label:"REPULSE",rarity:"rare",weight:15,duration:3000}
];

function code(){let c;do c=Math.random().toString(36).slice(2,6).toUpperCase();while(rooms.has(c));return c}
function cleanName(n){return String(n||"Chicken").replace(/[<>]/g,"").trim().slice(0,16)||"Chicken"}
const COSMETICS={upper:["none","crown","sunglasses","chef","halo","viking","pilot","cowboy","wizard","headphones","knight"],lower:["none","boots","skates","flames","jet","goldboots","ice","lightning","sneakers","hover"]};
function cleanCosmetics(c){c=c&&typeof c==="object"?c:{};return {color:COLORS.includes(c.color)?c.color:COLORS[0],upper:COSMETICS.upper.includes(c.upper)?c.upper:"none",lower:COSMETICS.lower.includes(c.lower)?c.lower:"none"}}
function spawn(i){return [{x:180,y:180},{x:1020,y:180},{x:180,y:520},{x:1020,y:520},{x:600,y:160},{x:600,y:540},{x:300,y:350},{x:900,y:350}][i%8]}
function newRocket(speed=210,r=25){const a=Math.random()*Math.PI*2;return {x:W/2,y:H/2,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,r,id:Math.random().toString(36).slice(2),bounceSpeed:1.06}}
function pickPower(){const total=POWERUPS.reduce((s,p)=>s+p.weight,0);let n=Math.random()*total;for(const p of POWERUPS){n-=p.weight;if(n<=0)return p}return POWERUPS[0]}
function publicRoom(r){
 return {code:r.code,hostId:r.hostId,state:r.state,round:r.round,maxRounds:r.maxRounds||3,players:Object.values(r.players).map(p=>({id:p.id,name:p.name,color:p.color,upper:p.upper,lower:p.lower,alive:p.alive,connected:p.connected!==false,score:p.score,roundScore:p.roundScore||0}))};
}
function broadcast(r){io.to(r.code).emit("state",publicRoom(r))}
function emitGame(r){
 io.to(r.code).emit("gameState",{players:Object.values(r.players).map(p=>({
  id:p.id,x:p.x,y:p.y,targetX:p.x,targetY:p.y,name:p.name,color:p.color,upper:p.upper,lower:p.lower,alive:p.alive,connected:p.connected!==false,score:p.score,roundScore:p.roundScore||0,
  dashCooldown:p.dashCooldown,speedUntil:p.speedUntil,shield:p.shield,magnetUntil:p.magnetUntil,timeBurstUntil:p.timeBurstUntil,phaseUntil:p.phaseUntil,scoreBoostUntil:p.scoreBoostUntil,repulseUntil:p.repulseUntil
 })),rockets:r.rockets,round:r.round,state:r.state,event:r.event,eventUntil:r.eventUntil,
 powerups:r.powerups.map(q=>({id:q.id,x:q.x,y:q.y,rarity:q.rarity})),serverNow:Date.now(),roundStartedAt:r.roundStartedAt||0});
}
function clearTimers(r){for(const k of ["tick","chaosTimer","scoreTimer","countdownTimer","nextTimer","powerupTimer"])if(r[k]){clearInterval(r[k]);clearTimeout(r[k]);r[k]=null}}
function startRound(r){
 clearTimers(r);r.state="countdown";r.round++;r.event=null;r.eventUntil=0;r.powerups=[];
 for(const p of Object.values(r.players)){p.alive=true;p.roundScore=0;p.x=W/2;p.y=H/2;p.vx=0;p.vy=0;p.lastDx=0;p.lastDy=-1;p.dashUntil=0;p.dashCooldown=0;p.kickCooldown=0;p.speedUntil=0;p.shield=false;p.magnetUntil=0;p.timeBurstUntil=0;p.phaseUntil=0;p.scoreBoostUntil=0;p.repulseUntil=0;p.roundSurvival=0}
 r.rocket=null;r.rockets=[];r.roundStartedAt=Date.now();r.lastScoreTick=Date.now();
 console.log("ROUND PREP START",{round:r.round,state:r.state,rockets:r.rockets.length});
 broadcast(r);io.to(r.code).emit("countdown",{duration:5000});
 r.countdownTimer=setTimeout(()=>{
  if(!rooms.has(r.code)||r.state!=="countdown")return;
  console.log("PREP COMPLETE",{round:r.round,state:r.state,rocketsBeforeSpawn:r.rockets.length});
  r.state="playing";
  r.roundStartedAt=Date.now();
  if(r.rockets.length!==0)r.rockets=[];
  r.rocket=newRocket(210);
  r.rockets=[r.rocket];
  console.log("ROCKET SPAWNED",{round:r.round,rockets:r.rockets.length});
  broadcast(r);emitGame(r);
},5000);
 r.tick=setInterval(()=>tick(r),TICK);r.chaosTimer=setInterval(()=>maybeChaos(r),22000);r.powerupTimer=setInterval(()=>spawnPowerup(r),7000);
 r.scoreTimer=setInterval(()=>awardSurvival(r),1000);
}
function awardSurvival(r){
 if(r.state!=="playing")return;const now=Date.now();
 for(const p of Object.values(r.players))if(p.connected!==false&&p.alive){
  p.roundScore+=p.scoreBoostUntil>now?20:10;p.roundSurvival++;
  if(p.roundSurvival%10===0){p.roundScore+=50;io.to(r.code).emit("scoreFx",{id:p.id,amount:50,label:"SURVIVAL BONUS"})}
 }
 broadcast(r);
}
function finishRound(r,winner){
 if(r.state!=="playing")return;
 r.state="roundEnd";clearTimers(r);
 for(const p of Object.values(r.players))p.score+=(p.roundScore||0);
 if(winner){winner.roundWins++;winner.score+=250;io.to(r.code).emit("roundWinner",{id:winner.id,name:winner.name,bonus:250})}
 broadcast(r);emitGame(r);
 if(r.round>=(r.maxRounds||3)){r.state="matchEnd";broadcast(r);io.to(r.code).emit("matchResults",finalResults(r))}
 else r.nextTimer=setTimeout(()=>{if(rooms.has(r.code))startRound(r)},4200);
}
function finalResults(r){
 return Object.values(r.players).sort((a,b)=>b.score-a.score||b.roundWins-a.roundWins).map((p,i)=>({
  place:i+1,id:p.id,name:p.name,score:p.score,roundWins:p.roundWins,survival:p.totalSurvival,
  powerups:p.powerupsCollected,kicks:p.kicksLanded,dashes:p.dashesUsed,color:p.color,upper:p.upper,lower:p.lower
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
 r.powerups.push(q);io.to(r.code).emit("powerupSpawn",{id:q.id,x:q.x,y:q.y,rarity:q.rarity});
}
function collect(r,p,q){
 r.powerups=r.powerups.filter(x=>x.id!==q.id);p.powerupsCollected++;
 if(q.type==="SPEED")p.speedUntil=Date.now()+q.duration;
 if(q.type==="DASH")p.dashCooldown=0;
 if(q.type==="SHIELD")p.shield=true;
 if(q.type==="ZAP"){
  const targets=Object.values(r.players).filter(x=>x.alive&&x.id!==p.id);
  if(targets.length){const t=targets[Math.floor(Math.random()*targets.length)];const lost=Math.min(75,t.roundScore||0);t.roundScore-=lost;p.roundScore+=lost;io.to(r.code).emit("scoreFx",{id:p.id,amount:lost,label:"SCORE ZAP"});io.to(r.code).emit("scoreFx",{id:t.id,amount:-lost,label:"ZAPPED"})}
 }
 if(q.type==="REDIRECT"){for(const rocket of r.rockets){rocket.vx*=-1;rocket.vy*=-1}p.redirectUntil=Date.now()+q.duration}
 if(q.type==="CHAOS"){r.event="CHICKEN PANIC";r.eventUntil=Date.now()+q.duration}
 if(q.type==="MAGNET")p.magnetUntil=Date.now()+q.duration;
 if(q.type==="TIMEBURST")p.timeBurstUntil=Date.now()+q.duration;
 if(q.type==="PHASE")p.phaseUntil=Date.now()+q.duration;
 if(q.type==="SCOREBOOST")p.scoreBoostUntil=Date.now()+q.duration;
 if(q.type==="REPULSE")p.repulseUntil=Date.now()+q.duration;
 io.to(r.code).emit("powerup",{id:p.id,type:q.type,label:q.label,duration:q.duration});
}
function tick(r){
 if(r.state!=="playing"&&r.state!=="countdown")return;
 const now=Date.now(),dt=TICK/1000;
 if(r.state==="countdown"){for(const p of Object.values(r.players))if(p.connected!==false&&p.alive){p.x+=p.vx*dt;p.y+=p.vy*dt;p.x=Math.max(35,Math.min(W-35,p.x));p.y=Math.max(45,Math.min(H-35,p.y));}emitGame(r);return;}
 const speedBoost=r.event==="ROCKET BOOST"&&now<r.eventUntil?1.75:1;
 const panic=r.event==="CHICKEN PANIC"&&now<r.eventUntil?1.35:1;
 if(r.eventUntil&&now>=r.eventUntil){r.event=null;r.rockets=r.rockets.slice(0,1);if(r.rockets[0])r.rockets[0].r=25;r.blackoutUntil=0}
 if(r.event==="BLACKOUT"&&now<r.eventUntil){}
 for(const p of Object.values(r.players))if(p.connected!==false&&p.alive){
  const mult=(p.speedUntil>now?1.55:1)*panic;
  p.x+=p.vx*dt*mult;p.y+=p.vy*dt*mult
  p.x=Math.max(35,Math.min(W-35,p.x));p.y=Math.max(45,Math.min(H-35,p.y));
  p.dashCooldown=Math.max(0,p.dashCooldown-dt);p.kickCooldown=Math.max(0,p.kickCooldown-dt);
  for(const q of [...r.powerups]){
   if(p.magnetUntil>now&&Math.hypot(p.x-q.x,p.y-q.y)<170){const dx=p.x-q.x,dy=p.y-q.y,d=Math.hypot(dx,dy)||1;q.x+=dx/d*3;q.y+=dy/d*3}
   if(Math.hypot(p.x-q.x,p.y-q.y)<34){collect(r,p,q);break}
 }
 }
 const shieldBlocked=new Set();
 for(const q of r.rockets){
  const prevX=q.x,prevY=q.y;
  q.x+=q.vx*dt*speedBoost;q.y+=q.vy*dt*speedBoost;
  if(q.x<q.r){q.x=q.r;q.vx=Math.abs(q.vx);q.vx*=q.bounceSpeed;q.vy*=q.bounceSpeed}
  if(q.x>W-q.r){q.x=W-q.r;q.vx=-Math.abs(q.vx);q.vx*=q.bounceSpeed;q.vy*=q.bounceSpeed}
  if(q.y<q.r){q.y=q.r;q.vy=Math.abs(q.vy);q.vx*=q.bounceSpeed;q.vy*=q.bounceSpeed}
  if(q.y>H-q.r){q.y=H-q.r;q.vy=-Math.abs(q.vy);q.vx*=q.bounceSpeed;q.vy*=q.bounceSpeed}
  const timeBurst=Object.values(r.players).some(p=>p.connected!==false&&p.alive&&p.timeBurstUntil>now&&Math.hypot(p.x-q.x,p.y-q.y)<260)?0.55:1;
  if(timeBurst!==1){q.vx*=timeBurst;q.vy*=timeBurst}
  for(const p of Object.values(r.players))if(p.connected!==false&&p.alive&&p.repulseUntil>now&&Math.hypot(p.x-q.x,p.y-q.y)<210){const dx=q.x-p.x,dy=q.y-p.y,d=Math.hypot(dx,dy)||1;q.vx+=dx/d*5;q.vy+=dy/d*5}
  const currentSpeed=Math.hypot(q.vx,q.vy),maxSpeed=560;if(currentSpeed>maxSpeed){const k=maxSpeed/currentSpeed;q.vx*=k;q.vy*=k}
  for(const p of Object.values(r.players))if(p.connected!==false&&p.alive){
   if(shieldBlocked.has(p.id))continue;
   const dx=q.x-prevX,dy=q.y-prevY,len2=dx*dx+dy*dy;
   const t=len2?Math.max(0,Math.min(1,((p.x-prevX)*dx+(p.y-prevY)*dy)/len2)):0;
   const cx=prevX+dx*t,cy=prevY+dy*t;
   const hitRadius=Math.max(18,q.r*.72)+18;
   if(Math.hypot(p.x-cx,p.y-cy)<hitRadius){
    if(p.shield){p.shield=false;shieldBlocked.add(p.id);io.to(r.code).emit("shieldBreak",p.id)}
    else if(p.phaseUntil>now){io.to(r.code).emit("phaseHit",p.id)}
    else{p.alive=false;p.totalSurvival+=Math.floor((now-r.roundStartedAt)/1000);io.to(r.code).emit("hit",p.id)}
   }
  }
 }
 const alive=Object.values(r.players).filter(p=>p.connected!==false&&p.alive);
 if(alive.length<=1&&Object.values(r.players).filter(p=>p.connected!==false).length>=1)finishRound(r,alive[0]);
 emitGame(r);
}
function leave(socket){
 const r=socket.room&&rooms.get(socket.room);if(!r)return;
 const p=r.players[socket.id];if(p){p.connected=false;p.alive=false;}
 const connected=Object.values(r.players).filter(x=>x.connected!==false);
 if(!connected.length){clearTimers(r);rooms.delete(r.code);return}
 if(r.hostId===socket.id)r.hostId=connected[0].id;
 io.to(r.code).emit("notice",socket.data.name+" left the game.");
 if(["countdown","playing","roundEnd"].includes(r.state)&&connected.length<MIN){
  clearTimers(r);r.state="matchEnd";r.rockets=[];r.powerups=[];broadcast(r);io.to(r.code).emit("matchResults",finalResults(r));
 }else if(r.state==="playing"){const alive=connected.filter(x=>x.alive);if(alive.length<=1&&connected.length>=1)finishRound(r,alive[0]||null)}
 if(connected.length<MIN&&r.state!=="lobby"&&r.state!=="matchEnd"&&r.state!=="playing"&&r.state!=="countdown"&&r.state!=="roundEnd"){clearTimers(r);r.state="lobby"}
 broadcast(r);
}
io.on("connection",socket=>{
 socket.on("create",name=>{
  if(socket.room)return;
  const c=code(),data=typeof name==="object"?name:{name},pos=spawn(0),cos=cleanCosmetics(data.cosmetics),p={id:socket.id,name:cleanName(data.name),color:cos.color,upper:cos.upper,lower:cos.lower,connected:true,score:0,roundScore:0,roundWins:0,totalSurvival:0,powerupsCollected:0,kicksLanded:0,dashesUsed:0,alive:true,x:pos.x,y:pos.y,vx:0,vy:0,lastDx:0,lastDy:-1,dashCooldown:0,kickCooldown:0,speedUntil:0,shield:false,magnetUntil:0,timeBurstUntil:0,phaseUntil:0,scoreBoostUntil:0,repulseUntil:0};
  const r={code:c,hostId:socket.id,players:{[socket.id]:p},state:"lobby",round:0,maxRounds:3,rocket:null,rockets:[],event:null,eventUntil:0,blackoutUntil:0,powerups:[],rematchVotes:new Set(),rematchCancelled:false};
  rooms.set(c,r);socket.join(c);socket.room=c;socket.data.name=p.name;socket.emit("joined",publicRoom(r));broadcast(r);
 });
 socket.on("join",(payload={})=>{
  const {room,name}=payload;
  const r=rooms.get(String(room||"").toUpperCase());
  if(!r)return socket.emit("errorMsg","Room not found!");
  if(Object.values(r.players).filter(p=>p.connected!==false).length>=MAX)return socket.emit("errorMsg","Room is full!");
  if(r.state!=="lobby"&&r.state!=="matchEnd")return socket.emit("errorMsg","Game already started!");
  const data=typeof name==="object"?name:{...payload,name};
  const names=new Set(Object.values(r.players).map(p=>p.name.toLowerCase()));let n=cleanName(data.name),base=n,i=2;while(names.has(n.toLowerCase()))n=(base.slice(0,13)+" "+i++).trim();
  const idx=Object.keys(r.players).length,s=spawn(idx),cos=cleanCosmetics(data.cosmetics),p={id:socket.id,name:n,color:cos.color,upper:cos.upper,lower:cos.lower,connected:true,score:0,roundScore:0,roundWins:0,totalSurvival:0,powerupsCollected:0,kicksLanded:0,dashesUsed:0,alive:true,x:s.x,y:s.y,vx:0,vy:0,lastDx:0,lastDy:-1,dashCooldown:0,kickCooldown:0,speedUntil:0,shield:false,magnetUntil:0,timeBurstUntil:0,phaseUntil:0,scoreBoostUntil:0,repulseUntil:0};
  r.players[socket.id]=p;socket.join(r.code);socket.room=r.code;socket.data.name=n;socket.emit("joined",publicRoom(r));broadcast(r);
 });
 socket.on("setCosmetics",data=>{const r=rooms.get(socket.room),p=r?.players[socket.id];if(!r||!p||r.state!=="lobby")return;const cos=cleanCosmetics(data);p.color=cos.color;p.upper=cos.upper;p.lower=cos.lower;broadcast(r)});
 socket.on("start",()=>{const r=rooms.get(socket.room);if(!r||r.hostId!==socket.id||Object.values(r.players).filter(p=>p.connected!==false).length<MIN)return;for(const p of Object.values(r.players)){p.score=0;p.roundScore=0;p.roundWins=0;p.totalSurvival=0;p.powerupsCollected=0;p.kicksLanded=0;p.dashesUsed=0}startRound(r)});
 socket.on("input",({x,y})=>{
  const r=rooms.get(socket.room),p=r?.players[socket.id];if(!p||!p.alive||!["playing","countdown"].includes(r.state))return;
  x=Math.max(-1,Math.min(1,Number(x)||0));y=Math.max(-1,Math.min(1,Number(y)||0));const m=Math.hypot(x,y);if(m>1){x/=m;y/=m}
  p.vx=x*260;p.vy=y*260;if(m>.1){p.lastDx=x;p.lastDy=y}
 });
 socket.on("dash",()=>{
  const r=rooms.get(socket.room),p=r?.players[socket.id];
  if(!p||!p.alive||!["playing","countdown"].includes(r.state)||p.dashCooldown>0)return;
  p.dashCooldown=2;
const dx=p.lastDx||0,dy=p.lastDy||-1;
const dashDistance=110;
p.x=Math.max(35,Math.min(W-35,p.x+dx*dashDistance));
p.y=Math.max(45,Math.min(H-35,p.y+dy*dashDistance));
p.vx=dx*260;p.vy=dy*260;
p.dashesUsed++;
io.to(r.code).emit("action",{type:"dash",id:p.id});
 });
 socket.on("kick",()=>{
  const r=rooms.get(socket.room),p=r?.players[socket.id];if(!p||!p.alive||r.state!=="playing"||p.kickCooldown>0)return;
  p.kickCooldown=2;let target=null,best=75;
  for(const q of Object.values(r.players))if(q.alive&&q.id!==p.id){const d=Math.hypot(q.x-p.x,q.y-p.y);if(d<best){best=d;target=q}}
  if(target){const dx=target.x-p.x,dy=target.y-p.y,m=Math.hypot(dx,dy)||1;target.x=Math.max(35,Math.min(W-35,target.x+dx/m*100));target.y=Math.max(45,Math.min(H-35,target.y+dy/m*100));p.kicksLanded++;p.roundScore+=25;io.to(r.code).emit("scoreFx",{id:p.id,amount:25,label:"KICK BONUS"});io.to(r.code).emit("action",{type:"kick",id:p.id,target:target.id})}
 });
 socket.on("setRounds",value=>{const r=rooms.get(socket.room);if(!r||r.hostId!==socket.id||r.state!=="lobby")return;const n=Math.max(1,Math.min(9,Number(value)||3));r.maxRounds=n;broadcast(r)});
 socket.on("again",()=>{
 const r=rooms.get(socket.room);if(!r||r.state!=="matchEnd"||r.rematchCancelled)return;
 const eligible=Object.values(r.players).filter(p=>p.connected!==false);if(!eligible.some(p=>p.id===socket.id))return;
 r.rematchVotes??=new Set();r.rematchVotes.add(socket.id);
 const count=[...r.rematchVotes].filter(id=>r.players[id]?.connected!==false).length;
 io.to(r.code).emit("rematch",{count,total:eligible.length});
 if(eligible.every(p=>r.rematchVotes.has(p.id))){r.rematchVotes.clear();r.rematchCancelled=false;for(const p of eligible){p.score=0;p.roundScore=0;p.roundWins=0;p.totalSurvival=0;p.powerupsCollected=0;p.kicksLanded=0;p.dashesUsed=0;p.alive=true}startRound(r)}
});
 socket.on("returnLobby",()=>{const r=rooms.get(socket.room);if(!r)return;clearTimers(r);r.rematchVotes=new Set();r.rematchCancelled=true;r.state="lobby";r.round=0;r.event=null;r.eventUntil=0;r.powerups=[];r.rockets=[];for(const p of Object.values(r.players)){if(p.connected!==false){p.score=0;p.roundScore=0;p.roundWins=0;p.alive=true}}broadcast(r);io.to(r.code).emit("rematchCancelled",{message:"A player returned to the lobby. Return to lobby to start a new room/game."})});
 socket.on("disconnect",()=>leave(socket));
});
server.listen(process.env.PORT||3000,()=>console.log("Chicken Sarookh 2 running on port "+(process.env.PORT||3000)));
