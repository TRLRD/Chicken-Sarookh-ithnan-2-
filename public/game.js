const socket=io();const $=id=>document.getElementById(id),menu=$("menu"),lobby=$("lobby"),game=$("game"),results=$("results"),canvas=$("canvas"),ctx=canvas.getContext("2d");let cosmetics={color:"#7dd3fc",upper:"none",lower:"none"},room=null,me=null,players={},rockets=[],powerups=[],eventName=null,eventUntil=0,keys={},last=0,audio=null,settings=JSON.parse(localStorage.getItem("cs2audio")||'{"music":0.18,"sfx":0.35,"muteMusic":false,"muteSfx":false}'),musicTimer=null,fx=[],activePower=null,rematch={count:0,total:0,cancelled:false},rainbowUntil=0;

function show(s){[menu,lobby,game,results].forEach(x=>x.classList.add("hidden"));s.classList.remove("hidden")}
function err(t){$("error").textContent=t;setTimeout(()=>$("error").textContent="",3000)}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function sound(freq=500,dur=.08){if(settings.muteSfx)return;try{audio??=new AudioContext();const o=audio.createOscillator(),g=audio.createGain();o.type="square";o.frequency.value=freq;g.gain.value=settings.sfx*.16;o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+dur)}catch{}}
function musicTone(freq,dur=.18,gain=.1,type="sawtooth"){if(settings.muteMusic)return;try{audio??=new AudioContext();const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(settings.music*gain,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+dur);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+dur)}catch{}}
function startMusic(mode){if(musicTimer)clearInterval(musicTimer);if(settings.muteMusic)return;const boss=[55,55,73,55,82,65,55,49,55,73,98,82,65,55];const menuSeq=[220,277,330,277];let i=0;musicTimer=setInterval(()=>{if(mode==="game"){musicTone(boss[i%boss.length],.24,.15,"sawtooth");if(i%2===0)musicTone(boss[(i+3)%boss.length]/2,.34,.12,"square");if(i%4===3)musicTone(165,.12,.06,"triangle")}else{musicTone(menuSeq[i%menuSeq.length],.16,.055,"triangle")}i++},220)}
function avatarMarkup(c,mini=""){const u=["none","crown","sunglasses","chef","halo","viking","pilot","cowboy","wizard","headphones","knight"].includes(c?.upper)?c.upper:"none",l=["none","boots","skates","flames","jet","goldboots","ice","lightning","sneakers","hover"].includes(c?.lower)?c.lower:"none",col=c?.color||"#7dd3fc";return `<div class="avatarModel ${mini}" style="--c:${col}" data-upper="${u}" data-lower="${l}"><div class="crest"></div><div class="body"><div class="wing wingL"></div><div class="wing wingR"></div></div><div class="head"><div class="eye eyeL"></div><div class="eye eyeR"></div><div class="beak"></div></div><div class="leg legL"></div><div class="leg legR"></div><div class="accessory upper"></div><div class="accessory lower"></div></div>`}
function updateCosmetics(){cosmetics={color:$("colorChoice").value,upper:$("upperChoice").value,lower:$("lowerChoice").value};$("avatarPreview").innerHTML=avatarMarkup(cosmetics,"preview");}
["colorChoice","upperChoice","lowerChoice"].forEach(id=>$(id).onchange=updateCosmetics);updateCosmetics();
$("showJoin").onclick=()=>$("joinBox").classList.remove("hidden");
$("create").onclick=()=>{if(!$("name").value.trim())return err("Enter your name!");$("name").blur();startMusic("lobby");socket.emit("create",{name:$("name").value,cosmetics})};
$("join").onclick=()=>{if(!$("name").value.trim())return err("Enter your name!");$("name").blur();$("room").blur();startMusic("lobby");socket.emit("join",{room:$("room").value,name:$("name").value,cosmetics})};
$("start").onclick=()=>{document.activeElement?.blur();socket.emit("start")};
$("roundSetting").onchange=()=>socket.emit("setRounds",Number($("roundSetting").value));
function syncRoomAvatar(){const c={color:$("roomColorChoice").value,upper:$("roomUpperChoice").value,lower:$("roomLowerChoice").value};$("roomAvatarPreview").innerHTML=avatarMarkup(c,"preview");socket.emit("setCosmetics",c)}
["roomColorChoice","roomUpperChoice","roomLowerChoice"].forEach(id=>$(id).onchange=syncRoomAvatar);
$("copyCode").onclick=async()=>{try{await navigator.clipboard.writeText(room.code);toast("ROOM CODE COPIED")}catch{}};
$("returnLobby").onclick=()=>socket.emit("returnLobby");
$("playAgain").onclick=()=>socket.emit("again");
socket.on("errorMsg",err);
socket.on("joined",r=>{room=r;me=r.players.find(p=>p.id===socket.id);show(lobby);renderLobby(r)});
function renderLobby(r){$("roomCode").textContent=r.code;$("players").innerHTML=r.players.map(p=>`<div class="player" style="--c:${p.color}">${avatarMarkup(p,"tiny")}<b>${esc(p.name)}</b>${p.id===r.hostId?'<span class="host">HOST</span>':'<span class="status">READY</span>'}</div>`).join("");$("roundSetting").value=String(r.maxRounds||3);const self=r.players.find(p=>p.id===socket.id);if(self){$("roomColorChoice").value=self.color;$("roomUpperChoice").value=self.upper||"none";$("roomLowerChoice").value=self.lower||"none";$("roomAvatarPreview").innerHTML=avatarMarkup(self,"preview")}$("roundSetting").disabled=r.hostId!==socket.id;$("roundSetting").closest("label").classList.toggle("hidden",r.hostId!==socket.id);$("start").classList.toggle("hidden",r.hostId!==socket.id||r.players.length<2);$("lobbyMsg").textContent=r.players.length<2?"Waiting for another chicken...":"All set. Host, launch the chaos.";startMusic("lobby")}
socket.on("state",r=>{room=r;me=r.players.find(p=>p.id===socket.id)||me;players={};r.players.forEach(p=>players[p.id]=p);if(r.state==="lobby")renderLobby(r);if(["playing","countdown","roundEnd"].includes(r.state)){show(game);startMusic("game")}if(r.state==="matchEnd")show(game);renderLB();$("round").textContent=r.round?"ROUND "+r.round:"";});
socket.on("gameState",d=>{players={};d.players.forEach(p=>players[p.id]=p);rockets=d.rockets||[];powerups=d.powerups||[];eventName=d.event;eventUntil=d.eventUntil||0;const self=players[socket.id];$("spectator").classList.toggle("hidden",!!self?.alive||!self);renderLB();draw()});
socket.on("countdown",d=>{show(game);let n=Math.ceil((d?.duration||5000)/1000);$("countdown").classList.remove("hidden");$("countdown").textContent=n;sound(440,.12);const t=setInterval(()=>{n--;if(n<=0){clearInterval(t);$("countdown").textContent="SAROOKH!";sound(880,.25);setTimeout(()=>$("countdown").classList.add("hidden"),550)}else{$("countdown").textContent=n;sound(440+n*80,.12)}},1000)});
socket.on("roundWinner",w=>{toast("ROUND SURVIVOR: "+w.name);});
socket.on("matchResults",list=>{rematch={count:0,total:list.length,cancelled:false};showResults(list)});
socket.on("hit",id=>{if(id===socket.id){flash();sound(90,.18)}});
socket.on("shieldBreak",id=>{fx.push({x:players[id]?.x||600,y:players[id]?.y||350,text:"🛡 SHIELD BLOCKED!",t:Date.now(),kind:"shield"});if(id===socket.id){toast("🛡️ SHIELD SAVED YOU");flash()};sound(980,.16);});
socket.on("event",e=>{eventName=e.name;eventUntil=Date.now()+e.duration;toast("⚠ "+e.name+" ⚠");sound(330,.12);musicTone(55,.4,.18,"square")});
socket.on("notice",t=>{toast(t);const n=$("leaveNotice");n.textContent=t;n.classList.remove("hidden");clearTimeout(n.t);n.t=setTimeout(()=>n.classList.add("hidden"),3200)});
socket.on("scoreFx",d=>{const sp=players[d.id];fx.push({x:sp?.x||600,y:sp?.y||350,text:(d.amount>0?"+":"")+d.amount+" "+d.label,t:Date.now()});sound(d.amount>0?760:140,.1)});
socket.on("powerup",d=>{
 if(d.id===socket.id){
  const duration=d.duration||1800;activePower={type:d.type,label:d.label,until:Date.now()+duration,duration};
  rainbowUntil=Date.now()+1800;
  toast("⚡ "+d.label);
  const p=players[d.id];fx.push({x:p?.x||600,y:p?.y||350,text:"+"+d.label,t:Date.now(),kind:"power"});
 }
 sound(d.type==="SHIELD"?900:620,.12)
});
socket.on("rematch",d=>{rematch={count:d.count,total:d.total,cancelled:false};updateRematchUI()});
socket.on("rematchCancelled",d=>{rematch.cancelled=true;updateRematchUI();toast(d.message||"Rematch cancelled")});

socket.on("action",d=>{if(d.id===socket.id)sound(d.type==="dash"?700:180,.08)});
function updateRematchUI(){const b=$("playAgain");if(!b)return;b.textContent=rematch.cancelled?"RETURN TO LOBBY":"PLAY AGAIN "+rematch.count+"/"+rematch.total;b.disabled=rematch.cancelled}
function renderLB(){const arr=Object.values(players).sort((a,b)=>(b.roundScore||0)-(a.roundScore||0));$("lbRows").innerHTML=arr.map((p,i)=>`<div class="lbRow ${p.id===socket.id?"me":""} ${p.alive?"":"dead"}"><span class="rank">${i+1}</span>${avatarMarkup(p,"lbAvatar")}<span class="lbName">${esc(p.name)} <small class="lbState">${p.connected===false?"LEFT":p.alive?"":"OUT"}</small></span><span class="score"><b>${p.roundScore||0}</b><small>${p.score||0} total</small></span></div>`).join("");const alive=arr.filter(p=>p.alive&&p.connected!==false).length;$("alive").textContent=alive+" ALIVE";const self=players[socket.id];$("personal").innerHTML=self?`<small>ROUND SCORE</small> ${self.roundScore||0} <em>TOTAL ${self.score||0}</em>`:""}
function confetti(big=false){const card=$("results").querySelector(".resultsCard");let layer=card.querySelector(".confettiLayer");if(!layer){layer=document.createElement("div");layer.className="confettiLayer";card.appendChild(layer)}const count=big?110:55;for(let i=0;i<count;i++){const s=document.createElement("i");s.style.left=(Math.random()*100)+"%";s.style.setProperty("--x",((Math.random()-.5)*420)+"px");s.style.setProperty("--r",((Math.random()*900)-450)+"deg");s.style.animationDelay=(Math.random()*.35)+"s";layer.appendChild(s);setTimeout(()=>s.remove(),3500)}}
function showResults(list){show(results);startMusic("results");const top=list.slice(0,3),podium=$("podium");podium.innerHTML=top.map((p,i)=>`<div class="pod resultHidden ${i===0?"first":""}" data-place="${i+1}"><div class="medal">${["1ST","2ND","3RD"][i]}</div>${avatarMarkup(p,"resultAvatar")}<div class="name">${esc(p.name)}</div><div class="pts">${p.score} TOTAL</div><small>${p.roundWins} round wins</small></div>`).join("");$("otherPlayers").innerHTML=list.slice(3).map(p=>`<div class="otherRow">${avatarMarkup(p,"tiny")}<span>${p.place}. ${esc(p.name)}</span><b>${p.score}</b></div>`).join("")||"<div class='otherRow'>No other players</div>";$("otherPlayers").classList.add("resultHiddenRest");$("playAgain").classList.add("resultHiddenRest");$("playAgain").disabled=false;updateRematchUI();setTimeout(()=>{podium.querySelector('[data-place="3"]')?.classList.add("revealThird");toast("🥉 3RD PLACE")},700);setTimeout(()=>{podium.querySelector('[data-place="2"]')?.classList.add("revealSecond");confetti(false);toast("🥈 2ND PLACE")},2200);setTimeout(()=>{podium.querySelector('[data-place="1"]')?.classList.add("revealFirst");confetti(true);sound(980,.35);sound(1240,.5);toast("🏆 1ST PLACE!")},3800);setTimeout(()=>{$("otherPlayers").classList.remove("resultHiddenRest");$("playAgain").classList.remove("resultHiddenRest");updateRematchUI()},5200)}
function toast(t){$("toast").textContent=t;clearTimeout(toast.t);toast.t=setTimeout(()=>$("toast").textContent="",1800)}
function flash(){canvas.animate([{filter:"brightness(2.2)"},{filter:"brightness(1)"}],240)}
function addKeys(e,v){const tag=document.activeElement?.tagName;if(game.classList.contains("hidden")&&(tag==="INPUT"||tag==="SELECT"||tag==="TEXTAREA"))return;keys[e.key.toLowerCase()]=v}
const inputState={up:false,down:false,left:false,right:false};
function setDirectionKey(code,value){
 if(code==="KeyW"||code==="ArrowUp")inputState.up=value;
 if(code==="KeyS"||code==="ArrowDown")inputState.down=value;
 if(code==="KeyA"||code==="ArrowLeft")inputState.left=value;
 if(code==="KeyD"||code==="ArrowRight")inputState.right=value;
}
addEventListener("keydown",e=>{
 if(["KeyW","KeyA","KeyS","KeyD","ArrowUp","ArrowLeft","ArrowDown","ArrowRight","Space"].includes(e.code))e.preventDefault();
 setDirectionKey(e.code,true);
 if(e.code==="Space"&&!e.repeat)socket.emit("dash");
 if(e.code==="KeyE"&&!e.repeat)socket.emit("kick");
 sendInput();
});
addEventListener("keyup",e=>{setDirectionKey(e.code,false);sendInput()});
function clearInput(){inputState.up=inputState.down=inputState.left=inputState.right=false;sendInput()}
addEventListener("blur",clearInput);
addEventListener("visibilitychange",()=>{if(document.hidden)clearInput()});
function sendInput(){
 let x=(inputState.right?1:0)-(inputState.left?1:0);
 let y=(inputState.down?1:0)-(inputState.up?1:0);
 if(game.classList.contains("hidden")){x=0;y=0}
 socket.emit("input",{x,y});
}
setInterval(sendInput,50);
function draw(){
 ctx.clearRect(0,0,1200,700);ctx.fillStyle="#0b1425";ctx.fillRect(0,0,1200,700);
 const shrink=eventName==="SHRINKING ARENA"&&Date.now()<eventUntil,pad=shrink?90:30;
 ctx.strokeStyle=shrink?"#fb7185":"#30415d";ctx.lineWidth=6;ctx.strokeRect(pad,pad,1200-pad*2,700-pad*2);
 ctx.globalAlpha=.12;ctx.strokeStyle="#94a3b8";for(let x=pad+30;x<1200-pad;x+=60){ctx.beginPath();ctx.moveTo(x,pad);ctx.lineTo(x,700-pad);ctx.stroke()}for(let y=pad+30;y<700-pad;y+=60){ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(1200-pad,y);ctx.stroke()}ctx.globalAlpha=1;
 for(const q of powerups)drawPower(q);for(const p of Object.values(players))drawChicken(p,false);for(const r of rockets)drawRocket(r);
 $("event").textContent=eventName&&Date.now()<eventUntil?eventName:"";const self=players[socket.id];$("cooldown").textContent=self?"DASH "+(self.dashCooldown>0?self.dashCooldown.toFixed(1)+"s":"READY"):"DASH READY";
 const ap=activePower&&activePower.until>Date.now()?activePower:null;
 if(!ap&&self?.shield)$("powerStatus").textContent="🛡️ SHIELD READY";else if(ap){const left=Math.max(0,ap.until-Date.now()),sec=Math.ceil(left/1000);$("powerStatus").textContent="⚡ "+ap.label+(ap.duration>1800?" • "+sec+"s":"")}else $("powerStatus").textContent="";
 drawFx();
}
function drawChicken(p,hidden=false){
 const q={x:p.x,y:p.y},moving=Math.hypot(p.vx||0,p.vy||0)>1;ctx.save();ctx.globalAlpha=p.connected===false?.12:p.alive?1:.35;ctx.translate(q.x,q.y);
 const bob=moving?Math.sin(Date.now()/70)*2:Math.sin(Date.now()/500);ctx.translate(0,bob);
 if(p.id===socket.id&&rainbowUntil>Date.now()){ctx.shadowBlur=24;ctx.shadowColor="hsl("+((Date.now()/5)%360)+" 100% 65%)";ctx.strokeStyle="hsl("+((Date.now()/4)%360)+" 100% 70%)";ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,31+Math.sin(Date.now()/80)*2,0,7);ctx.stroke()}
 ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(0,3,24,0,Math.PI*2);ctx.fill();
 ctx.fillStyle="#f8fafc";ctx.beginPath();ctx.arc(0,-16,18,0,Math.PI*2);ctx.fill();
 ctx.fillStyle="#ef4444";ctx.beginPath();ctx.arc(-8,-33,7,0,7);ctx.arc(0,-35,7,0,7);ctx.arc(8,-33,7,0,7);ctx.fill();
 ctx.fillStyle="#f59e0b";ctx.beginPath();ctx.moveTo(18,-15);ctx.lineTo(34,-9);ctx.lineTo(18,-3);ctx.fill();
 ctx.fillStyle="#111827";ctx.beginPath();ctx.arc(-6,-20,3,0,7);ctx.arc(6,-20,3,0,7);ctx.fill();
 const step=moving?Math.sin(Date.now()/55)*5:0;ctx.strokeStyle="#f59e0b";ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-8,25);ctx.lineTo(-10-step,34);ctx.moveTo(8,25);ctx.lineTo(10+step,34);ctx.stroke();
 if(p.lower==="boots"){ctx.lineWidth=7;ctx.strokeStyle="#334155";ctx.beginPath();ctx.moveTo(-9,27);ctx.lineTo(-11-step,35);ctx.moveTo(9,27);ctx.lineTo(11+step,35);ctx.stroke()}
 if(p.lower==="skates"){ctx.strokeStyle="#cbd5e1";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-13,35);ctx.lineTo(-3,35);ctx.moveTo(7,35);ctx.lineTo(17,35);ctx.stroke()}
 if(p.lower==="flames"){const f=Math.sin(Date.now()/75)*2;ctx.fillStyle="#fb7185";ctx.beginPath();ctx.moveTo(-15,37);ctx.lineTo(-11,24-f);ctx.lineTo(-7,31);ctx.lineTo(-4,20+f);ctx.lineTo(0,37);ctx.closePath();ctx.moveTo(5,37);ctx.lineTo(9,27+f);ctx.lineTo(13,32);ctx.lineTo(17,22-f);ctx.lineTo(19,37);ctx.closePath();ctx.fill();ctx.fillStyle="#fbbf24";ctx.beginPath();ctx.moveTo(-11,36);ctx.lineTo(-8,28-f);ctx.lineTo(-5,36);ctx.closePath();ctx.moveTo(9,36);ctx.lineTo(12,29-f);ctx.lineTo(15,36);ctx.closePath();ctx.fill()}
 if(p.lower==="goldboots"){ctx.strokeStyle="#fbbf24";ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(-10,28);ctx.lineTo(-12,37);ctx.moveTo(10,28);ctx.lineTo(12,37);ctx.stroke()}
 if(p.lower==="ice"){ctx.fillStyle="#67e8f9";ctx.beginPath();ctx.moveTo(-16,38);ctx.lineTo(-8,26);ctx.lineTo(0,38);ctx.closePath();ctx.moveTo(4,38);ctx.lineTo(12,26);ctx.lineTo(20,38);ctx.closePath();ctx.fill()}
 if(p.lower==="lightning"){ctx.fillStyle="#fde047";ctx.beginPath();ctx.moveTo(-14,25);ctx.lineTo(-4,25);ctx.lineTo(-10,34);ctx.lineTo(0,34);ctx.lineTo(-13,48);ctx.closePath();ctx.moveTo(5,25);ctx.lineTo(15,25);ctx.lineTo(9,34);ctx.lineTo(19,34);ctx.lineTo(6,48);ctx.closePath();ctx.fill()}
 if(p.lower==="sneakers"){ctx.fillStyle="#f8fafc";ctx.strokeStyle="#334155";ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(-17,29,15,10,5);ctx.roundRect(2,29,15,10,5);ctx.fill();ctx.stroke()}
 if(p.lower==="hover"){ctx.fillStyle="#38bdf8";ctx.shadowBlur=12;ctx.shadowColor="#38bdf8";ctx.beginPath();ctx.ellipse(-9,35,12,5,0,0,7);ctx.ellipse(9,35,12,5,0,0,7);ctx.fill();ctx.shadowBlur=0}
 if(p.lower==="jet"){const j=Math.sin(Date.now()/65)*2;ctx.fillStyle="#64748b";ctx.beginPath();ctx.roundRect(-16,27,10,11,3);ctx.roundRect(6,27,10,11,3);ctx.fill();ctx.fillStyle="#cbd5e1";ctx.fillRect(-14,29,6,4);ctx.fillRect(8,29,6,4);ctx.fillStyle="#fb923c";ctx.shadowBlur=10;ctx.shadowColor="#fb923c";ctx.beginPath();ctx.moveTo(-13,38);ctx.lineTo(-7,38);ctx.lineTo(-10,49+j);ctx.closePath();ctx.moveTo(7,38);ctx.lineTo(13,38);ctx.lineTo(10,49-j);ctx.closePath();ctx.fill();ctx.fillStyle="#fde68a";ctx.beginPath();ctx.moveTo(-11,40);ctx.lineTo(-8,40);ctx.lineTo(-10,46+j);ctx.closePath();ctx.moveTo(8,40);ctx.lineTo(11,40);ctx.lineTo(10,46-j);ctx.closePath();ctx.fill();ctx.shadowBlur=0}
 if(p.upper==="crown"){ctx.fillStyle="#fbbf24";ctx.beginPath();ctx.moveTo(-14,-29);ctx.lineTo(-10,-42);ctx.lineTo(-2,-34);ctx.lineTo(5,-43);ctx.lineTo(13,-29);ctx.closePath();ctx.fill()}
 if(p.upper==="sunglasses"){ctx.fillStyle="#111827";ctx.fillRect(-14,-24,11,7);ctx.fillRect(3,-24,11,7);ctx.fillRect(-3,-22,6,3)}
 if(p.upper==="chef"){ctx.fillStyle="#f8fafc";ctx.beginPath();ctx.arc(-7,-40,7,0,7);ctx.arc(2,-43,9,0,7);ctx.arc(11,-39,6,0,7);ctx.fill()}
 if(p.upper==="halo"){ctx.strokeStyle="#fde68a";ctx.lineWidth=4;ctx.beginPath();ctx.ellipse(0,-43,18,6,0,0,7);ctx.stroke()}
 if(p.upper==="viking"){ctx.fillStyle="#94a3b8";ctx.strokeStyle="#0b1220";ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(-18,-42,36,15,5);ctx.fill();ctx.stroke();ctx.fillStyle="#e2e8f0";ctx.beginPath();ctx.moveTo(-17,-39);ctx.lineTo(-28,-49);ctx.lineTo(-18,-47);ctx.moveTo(17,-39);ctx.lineTo(28,-49);ctx.lineTo(18,-47);ctx.fill()}
 if(p.upper==="pilot"){ctx.strokeStyle="#1e293b";ctx.lineWidth=4;ctx.beginPath();ctx.arc(-7,-20,8,0,7);ctx.arc(7,-20,8,0,7);ctx.moveTo(0,-20);ctx.lineTo(-2,-20);ctx.stroke()}
 if(p.upper==="cowboy"){ctx.fillStyle="#a16207";ctx.beginPath();ctx.ellipse(0,-40,24,6,0,0,7);ctx.roundRect(-13,-47,26,9,4);ctx.fill()}
 if(p.upper==="wizard"){ctx.fillStyle="#7c3aed";ctx.beginPath();ctx.moveTo(-18,-38);ctx.lineTo(0,-60);ctx.lineTo(18,-38);ctx.closePath();ctx.fill();ctx.fillStyle="#fde68a";ctx.beginPath();ctx.arc(0,-51,3,0,7);ctx.fill()}
 if(p.upper==="headphones"){ctx.strokeStyle="#38bdf8";ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,-18,24,Math.PI,0);ctx.stroke();ctx.fillStyle="#0f172a";ctx.fillRect(-25,-20,7,14);ctx.fillRect(18,-20,7,14)}
 if(p.upper==="knight"){ctx.fillStyle="#64748b";ctx.beginPath();ctx.roundRect(-18,-42,36,17,6);ctx.fill();ctx.strokeStyle="#e2e8f0";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-13,-35);ctx.lineTo(13,-35);ctx.stroke()}
 if(p.shield){const pulse=34+Math.sin(Date.now()/180)*2;ctx.strokeStyle="#67e8f9";ctx.lineWidth=3;ctx.shadowBlur=16;ctx.shadowColor="#67e8f9";ctx.beginPath();ctx.arc(0,0,pulse,0,7);ctx.stroke();ctx.shadowBlur=0}ctx.font="bold 16px system-ui";ctx.textAlign="center";ctx.fillStyle="#fff";ctx.fillText(p.name,0,-50);if(!p.alive){ctx.fillStyle="#fb7185";ctx.fillText("OUT",0,52)}ctx.restore();
}
function drawPower(q){
 const now=Date.now(),t=now/300;ctx.save();ctx.translate(q.x,q.y+Math.sin(now/220+q.x)*4);ctx.rotate(t*.12);
 ctx.shadowBlur=20;ctx.shadowColor="rgba(255,255,255,.8)";
 const g=ctx.createLinearGradient(-16,-16,16,16);g.addColorStop(0,"#ff4d6d");g.addColorStop(.2,"#ffd166");g.addColorStop(.4,"#7cffcb");g.addColorStop(.6,"#58a6ff");g.addColorStop(.8,"#a78bfa");g.addColorStop(1,"#ff4dff");ctx.fillStyle=g;
 ctx.beginPath();ctx.roundRect(-16,-16,32,32,8);ctx.fill();ctx.strokeStyle="#fff8";ctx.lineWidth=2;ctx.stroke();
 ctx.rotate(-t*.12);ctx.fillStyle="#fff";ctx.font="900 15px system-ui";ctx.textAlign="center";ctx.fillText("?",0,6);
 for(let i=0;i<4;i++){const a=t*1.7+i*Math.PI/2;ctx.globalAlpha=.65;ctx.fillRect(Math.cos(a)*23-2,Math.sin(a)*23-2,4,4)}ctx.restore()
}
function drawRocket(r){ctx.save();ctx.translate(r.x,r.y);const giant=r.r>40;ctx.globalAlpha=.25;ctx.fillStyle="#fb923c";ctx.shadowBlur=22;ctx.shadowColor="#fb923c";ctx.beginPath();ctx.ellipse(-30,0,giant?45:28,giant?13:8,0,0,7);ctx.fill();ctx.globalAlpha=1;ctx.rotate(Math.atan2(r.vy,r.vx));ctx.shadowBlur=giant?34:20;ctx.shadowColor="#f97316";ctx.fillStyle=giant?"#fb1f3f":"#ef4444";ctx.beginPath();ctx.moveTo(giant?58:32,0);ctx.lineTo(giant?-30:-18,giant?-27:-16);ctx.lineTo(giant?-40:-25,0);ctx.lineTo(giant?-30: -18,giant?27:16);ctx.closePath();ctx.fill();ctx.fillStyle="#fbbf24";ctx.beginPath();ctx.moveTo(giant?-39:-24,0);ctx.lineTo(giant?-72:-45,-18);ctx.lineTo(giant?-72:-45,18);ctx.closePath();ctx.fill();ctx.fillStyle="#cbd5e1";ctx.beginPath();ctx.arc(8,0,6,0,7);ctx.fill();ctx.restore()}
function drawFx(){const now=Date.now();fx=fx.filter(f=>now-f.t<1000);ctx.font="900 18px system-ui";ctx.textAlign="center";for(const f of fx){ctx.globalAlpha=1-(now-f.t)/1000;ctx.fillStyle="#fbbf24";ctx.fillText(f.text,f.x,f.y-(now-f.t)*.04)}ctx.globalAlpha=1}
function animate(t){requestAnimationFrame(animate);if(t-last>16){last=t;draw()}}requestAnimationFrame(animate);startMusic("menu");