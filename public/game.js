const socket=io();const $=id=>document.getElementById(id);const menu=$("menu"),lobby=$("lobby"),game=$("game"),results=$("results"),canvas=$("canvas"),ctx=canvas.getContext("2d");let room=null,me=null,players={},rockets=[],powerups=[],eventName=null,eventUntil=0,keys={},last=0,audio=null,settings=JSON.parse(localStorage.getItem("cs2audio")||'{"music":.18,"sfx":.35,"muteMusic":false,"muteSfx":false}'),musicTimer=null,localPos={},fx=[];

function show(s){[menu,lobby,game,results].forEach(x=>x.classList.add("hidden"));s.classList.remove("hidden")}
function err(t){$("error").textContent=t;setTimeout(()=>$("error").textContent="",3000)}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function sound(freq=500,dur=.08){if(settings.muteSfx)return;try{audio??=new AudioContext();const o=audio.createOscillator(),g=audio.createGain();o.frequency.value=freq;g.gain.value=settings.sfx*.12;o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+dur)}catch{}}
function startMusic(mode){if(settings.muteMusic)return;if(musicTimer)clearInterval(musicTimer);const seq=mode==="game"?[110,165,220,165,277,220]:mode==="menu"?[220,277,330,277]:[165,196,247,196];let i=0;musicTimer=setInterval(()=>sound(seq[i++%seq.length],.13),360)}
$("showJoin").onclick=()=>$("joinBox").classList.remove("hidden");
$("create").onclick=()=>{if(!$("name").value.trim())return err("Enter your name!");startMusic("lobby");socket.emit("create",$("name").value)};
$("join").onclick=()=>{if(!$("name").value.trim())return err("Enter your name!");startMusic("lobby");socket.emit("join",{room:$("room").value,name:$("name").value})};
$("start").onclick=()=>socket.emit("start");
$("copyCode").onclick=async()=>{try{await navigator.clipboard.writeText(room.code);toast("ROOM CODE COPIED")}catch{}};
$("returnLobby").onclick=()=>{show(lobby);renderLobby(room)};
$("playAgain").onclick=()=>socket.emit("again");
socket.on("errorMsg",err);
socket.on("joined",r=>{room=r;me=r.players.find(p=>p.id===socket.id);show(lobby);renderLobby(r)});
function renderLobby(r){$("roomCode").textContent=r.code;$("players").innerHTML=r.players.map(p=>`<div class="player" style="--c:${p.color}">🐔 <b>${esc(p.name)}</b>${p.id===r.hostId?'<span class="host">HOST</span>':'<span class="status">READY</span>'}</div>`).join("");$("start").classList.toggle("hidden",r.hostId!==socket.id||r.players.length<2);$("lobbyMsg").textContent=r.players.length<2?"Waiting for another chicken...":"All set. Host, launch the chaos.";startMusic("lobby")}
socket.on("state",r=>{room=r;me=r.players.find(p=>p.id===socket.id)||me;players={};r.players.forEach(p=>players[p.id]=p);if(r.state==="lobby")renderLobby(r);if(["playing","countdown","roundEnd"].includes(r.state)){show(game);startMusic("game")}if(r.state==="matchEnd")show(game);renderLB();$("round").textContent=r.round?"ROUND "+r.round:"";});
socket.on("gameState",d=>{players={};d.players.forEach(p=>{players[p.id]=p;if(!localPos[p.id])localPos[p.id]={x:p.x,y:p.y};});rockets=d.rockets||[];powerups=d.powerups||[];eventName=d.event;eventUntil=d.eventUntil||0;renderLB();draw()});
socket.on("countdown",()=>{show(game);let n=3;$("countdown").classList.remove("hidden");$("countdown").textContent=n;sound(440,.12);const t=setInterval(()=>{n--;if(n<=0){clearInterval(t);$("countdown").textContent="SAROOKH!";sound(880,.25);setTimeout(()=>$("countdown").classList.add("hidden"),550)}else{$("countdown").textContent=n;sound(440+n*80,.12)}},1000)});
socket.on("roundWinner",w=>{toast("ROUND SURVIVOR: "+w.name);});
socket.on("matchResults",list=>showResults(list));
socket.on("hit",id=>{if(id===socket.id){flash();sound(90,.18)}});
socket.on("shieldBreak",id=>{if(id===socket.id)toast("🛡️ SHIELD SAVED YOU")});
socket.on("event",e=>{eventName=e.name;eventUntil=Date.now()+e.duration;toast(e.name);sound(330,.12)});
socket.on("notice",t=>toast(t));
socket.on("scoreFx",d=>{fx.push({x:localPos[d.id]?.x||600,y:localPos[d.id]?.y||350,text:(d.amount>0?"+":"")+d.amount+" "+d.label,t:Date.now()});sound(d.amount>0?760:140,.1)});
socket.on("powerup",d=>{if(d.id===socket.id)toast("⚡ "+d.label);sound(620,.12)});
socket.on("action",d=>{if(d.id===socket.id)sound(d.type==="dash"?700:180,.08)});
function renderLB(){const arr=Object.values(players).sort((a,b)=>b.score-a.score);$("lbRows").innerHTML=arr.map((p,i)=>`<div class="lbRow ${p.id===socket.id?"me":""} ${p.alive?"":"dead"}"><span class="rank">${i+1}</span><span>${esc(p.name)}</span><span class="score">${p.score}</span></div>`).join("");const alive=arr.filter(p=>p.alive).length;$("alive").textContent=alive+" ALIVE";const self=players[socket.id];$("personal").innerHTML=self?`<small>SCORE</small> ${self.score}`:""}
function showResults(list){show(results);const top=list.slice(0,3);$("podium").innerHTML=top.map((p,i)=>`<div class="pod ${i===0?"first":""}"><div class="medal">${["🥇","🥈","🥉"][i]}</div><div class="name">${esc(p.name)}</div><div class="pts">${p.score}</div><small>${p.roundWins} rounds</small></div>`).join("");$("otherPlayers").innerHTML=list.slice(3).map(p=>`<div class="otherRow"><span>${p.place}. ${esc(p.name)}</span><b>${p.score}</b></div>`).join("")||"<div class='otherRow'>No other players</div>";$("playAgain").classList.toggle("hidden",room?.hostId!==socket.id);startMusic("results")}
function toast(t){$("toast").textContent=t;clearTimeout(toast.t);toast.t=setTimeout(()=>$("toast").textContent="",1800)}
function flash(){canvas.animate([{filter:"brightness(2.2)"},{filter:"brightness(1)"}],240)}
function addKeys(e,v){if(document.activeElement.tagName==="INPUT")return;keys[e.key.toLowerCase()]=v}
addEventListener("keydown",e=>{addKeys(e,true);if(e.code==="Space"){e.preventDefault();socket.emit("dash")}if(e.key.toLowerCase()==="e")socket.emit("kick")});
addEventListener("keyup",e=>addKeys(e,false));
setInterval(()=>{let x=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0),y=(keys.s||keys.arrowdown?1:0)-(keys.w||keys.arrowup?1:0);socket.emit("input",{x,y})},50);
function draw(){
 ctx.clearRect(0,0,1200,700);ctx.fillStyle="#0b1425";ctx.fillRect(0,0,1200,700);
 const shrink=eventName==="SHRINKING ARENA"&&Date.now()<eventUntil,pad=shrink?90:30;
 ctx.strokeStyle=shrink?"#fb7185":"#30415d";ctx.lineWidth=6;ctx.strokeRect(pad,pad,1200-pad*2,700-pad*2);
 ctx.globalAlpha=.12;ctx.strokeStyle="#94a3b8";for(let x=pad+30;x<1200-pad;x+=60){ctx.beginPath();ctx.moveTo(x,pad);ctx.lineTo(x,700-pad);ctx.stroke()}for(let y=pad+30;y<700-pad;y+=60){ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(1200-pad,y);ctx.stroke()}ctx.globalAlpha=1;
 for(const q of powerups)drawPower(q);for(const p of Object.values(players))drawChicken(p);for(const r of rockets)drawRocket(r);
 $("event").textContent=eventName&&Date.now()<eventUntil?eventName:"";const self=players[socket.id];$("cooldown").textContent=self?"DASH "+(self.dashCooldown>0?self.dashCooldown.toFixed(1)+"s":"READY"):"DASH READY";$("powerStatus").textContent=self?.shield?"🛡️ SHIELD READY":"";drawFx();
}
function smooth(p){const q=localPos[p.id]??={x:p.x,y:p.y};q.x+=(p.x-q.x)*.34;q.y+=(p.y-q.y)*.34;return q}
function drawChicken(p){
 const q=smooth(p),moving=Math.hypot(p.x-q.x,p.y-q.y)>1;ctx.save();ctx.globalAlpha=p.alive?1:.28;ctx.translate(q.x,q.y);
 const bob=moving?Math.sin(Date.now()/70)*2:Math.sin(Date.now()/500);ctx.translate(0,bob);
 ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(0,3,24,0,Math.PI*2);ctx.fill();
 ctx.fillStyle="#f8fafc";ctx.beginPath();ctx.arc(0,-16,18,0,Math.PI*2);ctx.fill();
 ctx.fillStyle="#ef4444";ctx.beginPath();ctx.arc(-8,-33,7,0,7);ctx.arc(0,-35,7,0,7);ctx.arc(8,-33,7,0,7);ctx.fill();
 ctx.fillStyle="#f59e0b";ctx.beginPath();ctx.moveTo(18,-15);ctx.lineTo(34,-9);ctx.lineTo(18,-3);ctx.fill();
 ctx.fillStyle="#111827";ctx.beginPath();ctx.arc(-6,-20,3,0,7);ctx.arc(6,-20,3,0,7);ctx.fill();
 const step=moving?Math.sin(Date.now()/55)*5:0;ctx.strokeStyle="#f59e0b";ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-8,25);ctx.lineTo(-10-step,34);ctx.moveTo(8,25);ctx.lineTo(10+step,34);ctx.stroke();
 if(p.shield){ctx.strokeStyle="#67e8f9";ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,34,0,7);ctx.stroke()}ctx.font="bold 16px system-ui";ctx.textAlign="center";ctx.fillStyle="#fff";ctx.fillText(p.name,0,-50);if(!p.alive){ctx.fillStyle="#fb7185";ctx.fillText("OUT",0,52)}ctx.restore();
}
function drawPower(q){const t=Date.now()/300;ctx.save();ctx.translate(q.x,q.y);ctx.rotate(t*.15);ctx.fillStyle=q.rarity==="epic"?"#f0abfc":q.rarity==="rare"?"#a5b4fc":q.rarity==="uncommon"?"#86efac":"#fde68a";ctx.shadowBlur=18;ctx.shadowColor=ctx.fillStyle;ctx.beginPath();ctx.roundRect(-16,-16,32,32,8);ctx.fill();ctx.rotate(-t*.15);ctx.font="bold 9px system-ui";ctx.textAlign="center";ctx.fillStyle="#111827";ctx.fillText(q.type.slice(0,5),0,3);ctx.restore()}
function drawRocket(r){ctx.save();ctx.translate(r.x,r.y);ctx.rotate(Math.atan2(r.vy,r.vx));ctx.shadowBlur=20;ctx.shadowColor="#f97316";ctx.fillStyle="#ef4444";ctx.beginPath();ctx.moveTo(32,0);ctx.lineTo(-18,-16);ctx.lineTo(-25,0);ctx.lineTo(-18,16);ctx.closePath();ctx.fill();ctx.fillStyle="#fbbf24";ctx.beginPath();ctx.moveTo(-24,0);ctx.lineTo(-45,-12);ctx.lineTo(-45,12);ctx.closePath();ctx.fill();ctx.fillStyle="#cbd5e1";ctx.beginPath();ctx.arc(8,0,6,0,7);ctx.fill();ctx.restore()}
function drawFx(){const now=Date.now();fx=fx.filter(f=>now-f.t<1000);ctx.font="900 18px system-ui";ctx.textAlign="center";for(const f of fx){ctx.globalAlpha=1-(now-f.t)/1000;ctx.fillStyle="#fbbf24";ctx.fillText(f.text,f.x,f.y-(now-f.t)*.04)}ctx.globalAlpha=1}
function animate(t){requestAnimationFrame(animate);if(t-last>16){last=t;draw()}}requestAnimationFrame(animate);startMusic("menu");
