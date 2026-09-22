const socket=io();const $=id=>document.getElementById(id);const menu=$("menu"),lobby=$("lobby"),game=$("game"),canvas=$("canvas"),ctx=canvas.getContext("2d");let me=null,room=null,players={},rockets=[],state="lobby",eventName=null,eventUntil=0,keys={},last=0,audio=null;
function show(s){[menu,lobby,game].forEach(x=>x.classList.add("hidden"));s.classList.remove("hidden")}
function err(t){$("error").textContent=t;setTimeout(()=>{$("error").textContent=""},3000)}
$("showJoin").onclick=()=>$("joinBox").classList.remove("hidden");
$("create").onclick=()=>{if(!$("name").value.trim())return err("Enter your name!");socket.emit("create",$("name").value)};
$("join").onclick=()=>{if(!$("name").value.trim())return err("Enter your name!");socket.emit("join",{room:$("room").value,name:$("name").value})};
$("start").onclick=()=>socket.emit("start");
socket.on("errorMsg",err);
socket.on("joined",r=>{room=r;me=r.players.find(p=>p.id===socket.id);show(lobby);renderLobby(r)});
function renderLobby(r){$("roomCode").textContent=r.code;$("players").innerHTML=r.players.map(p=>`<div class="player" style="border-left:5px solid ${p.color}">🐔 ${esc(p.name)} ${p.id===r.hostId?'<span class="host">HOST</span>':''}</div>`).join("");$("start").classList.toggle("hidden",r.hostId!==socket.id||r.players.length<2);$("lobbyMsg").textContent=r.players.length<2?"Waiting for at least 2 players...":"Ready! Host can start."}
socket.on("state",r=>{room=r;me=r.players.find(p=>p.id===socket.id)||me;players={};r.players.forEach(p=>players[p.id]=p);state=r.state;if(r.state==="lobby"||r.state==="matchEnd")renderLobby(r);if(r.state==="playing"||r.state==="countdown"||r.state==="roundEnd")show(game);if(r.state==="matchEnd")show(game);$("round").textContent=r.round?"ROUND "+r.round:"";$("scores").textContent=r.players.map(p=>p.name+"  "+p.score).join("\n")});
socket.on("gameState",d=>{players={};d.players.forEach(p=>players[p.id]=p);rockets=d.rockets||[];state=d.state;eventName=d.event;eventUntil=d.eventUntil||0;draw()});
socket.on("countdown",()=>{show(game);let n=3;$("countdown").classList.remove("hidden");$("countdown").textContent=n;const t=setInterval(()=>{n--;if(n<=0){clearInterval(t);$("countdown").textContent="SAROOKH!";setTimeout(()=>$("countdown").classList.add("hidden"),500)}else $("countdown").textContent=n},1000)});
socket.on("event",e=>{eventName=e.name;eventUntil=Date.now()+e.duration;$("event").textContent=e.name});
socket.on("winner",w=>{showOverlay("🏆 "+esc(w.name)+" WINS!","ROUND WINNER")});
socket.on("matchWinner",w=>{showOverlay("🏆 "+esc(w.name)+" WINS THE MATCH!","3 ROUND WINS");if(socket.id===room.hostId){const b=document.createElement("button");b.textContent="PLAY AGAIN";b.className="overlayButton";b.onclick=()=>{hideOverlay();socket.emit("again")};$("overlay").appendChild(b)}})
socket.on("hit",id=>{if(id===socket.id)flash()});socket.on("notice",t=>{eventName=t;eventUntil=Date.now()+2500});
function showOverlay(title,sub){$("overlay").innerHTML=`<div>${title}</div><small>${sub}</small></div>`;$("overlay").classList.remove("hidden")}
function hideOverlay(){$("overlay").classList.add("hidden")}
function flash(){canvas.animate([{filter:"brightness(2)"},{filter:"brightness(1)"}],250)}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function sound(freq,dur=.08){try{audio??=new AudioContext();const o=audio.createOscillator(),g=audio.createGain();o.frequency.value=freq;g.gain.value=.04;o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+dur)}catch{}}
addEventListener("keydown",e=>{if(["INPUT"].includes(document.activeElement.tagName))return;keys[e.key.toLowerCase()]=true;if(e.code==="Space"){e.preventDefault();socket.emit("dash");sound(700)}if(e.key.toLowerCase()==="e"){socket.emit("kick");sound(180)}});
addEventListener("keyup",e=>keys[e.key.toLowerCase()]=false);
setInterval(()=>{let x=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0),y=(keys.s||keys.arrowdown?1:0)-(keys.w||keys.arrowup?1:0);if(x||y)socket.emit("input",{x,y});else socket.emit("input",{x:0,y:0})},50);
function draw(){
 ctx.clearRect(0,0,1200,700);
 const shrink=eventName==="SHRINKING ARENA"&&Date.now()<eventUntil, pad=shrink?90:30;
 ctx.fillStyle="#0d1629";ctx.fillRect(0,0,1200,700);
 ctx.strokeStyle="#334155";ctx.lineWidth=6;ctx.strokeRect(pad,pad,1200-pad*2,700-pad*2);
 ctx.globalAlpha=.12;for(let x=pad+30;x<1200-pad;x+=60){ctx.beginPath();ctx.moveTo(x,pad);ctx.lineTo(x,700-pad);ctx.stroke()}for(let y=pad+30;y<700-pad;y+=60){ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(1200-pad,y);ctx.stroke()}ctx.globalAlpha=1;
 for(const p of Object.values(players))drawChicken(p);
 for(const r of rockets)drawRocket(r);
 $("event").textContent=eventName&&Date.now()<eventUntil?eventName:"";$("cooldown").textContent="DASH: "+(me&&me.alive?"READY":"OUT");
}
function drawChicken(p){
 ctx.save();ctx.globalAlpha=p.alive?1:.35;ctx.translate(p.x,p.y);
 ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(0,3,24,0,Math.PI*2);ctx.fill();
 ctx.fillStyle="#f8fafc";ctx.beginPath();ctx.arc(0,-16,18,0,Math.PI*2);ctx.fill();
 ctx.fillStyle="#ef4444";ctx.beginPath();ctx.arc(-8,-33,7,0,Math.PI*2);ctx.arc(0,-35,7,0,Math.PI*2);ctx.arc(8,-33,7,0,Math.PI*2);ctx.fill();
 ctx.fillStyle="#f59e0b";ctx.beginPath();ctx.moveTo(18,-15);ctx.lineTo(34,-9);ctx.lineTo(18,-3);ctx.fill();
 ctx.fillStyle="#111827";ctx.beginPath();ctx.arc(-6,-20,3,0,7);ctx.arc(6,-20,3,0,7);ctx.fill();
 ctx.strokeStyle="#f59e0b";ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-8,25);ctx.lineTo(-10,34);ctx.moveTo(8,25);ctx.lineTo(10,34);ctx.stroke();
 ctx.font="bold 16px system-ui";ctx.textAlign="center";ctx.fillStyle="#fff";ctx.fillText(p.name,0,-48);if(!p.alive){ctx.fillStyle="#fb7185";ctx.fillText("OUT",0,52)}ctx.restore();
}
function drawRocket(r){ctx.save();ctx.translate(r.x,r.y);ctx.rotate(Math.atan2(r.vy,r.vx));ctx.shadowBlur=20;ctx.shadowColor="#f97316";ctx.fillStyle="#ef4444";ctx.beginPath();ctx.moveTo(32,0);ctx.lineTo(-18,-16);ctx.lineTo(-25,0);ctx.lineTo(-18,16);ctx.closePath();ctx.fill();ctx.fillStyle="#fbbf24";ctx.beginPath();ctx.moveTo(-24,0);ctx.lineTo(-45,-12);ctx.lineTo(-45,12);ctx.closePath();ctx.fill();ctx.fillStyle="#cbd5e1";ctx.beginPath();ctx.arc(8,0,6,0,7);ctx.fill();ctx.restore()}
function animate(t){requestAnimationFrame(animate);if(t-last>33){last=t;draw()}}requestAnimationFrame(animate);