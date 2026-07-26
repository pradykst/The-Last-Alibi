const html = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>The Last Alibi · Interactive Demo</title>
<meta name="description" content="A playable simulation of The Last Alibi investigation flow, with separately evidenced Sui testnet protocol receipts.">
<style>
:root{color-scheme:dark;--ink:#f5e8d1;--muted:#b9aa9d;--gold:#d5a85b;--wine:#70263a;--panel:#170f13;--line:#5c3b38;--green:#57d9a3}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 70% 0,#281019 0,transparent 42%),#070608;color:var(--ink);font:15px/1.5 Inter,system-ui,sans-serif;min-height:100vh}button,select{font:inherit}button{cursor:pointer}.shell{max-width:1180px;margin:auto;padding:24px}.top{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #34252a;padding:8px 0 20px}.brand{font:700 22px Georgia,serif;letter-spacing:.08em}.badge{border:1px solid var(--gold);padding:7px 10px;color:#f5cf87;font-size:11px;letter-spacing:.12em;text-transform:uppercase}.hero{display:grid;grid-template-columns:1.2fr .8fr;gap:34px;align-items:end;padding:60px 0}.hero h1{font:700 clamp(54px,8vw,100px)/.9 Georgia,serif;margin:0}.hero p{color:var(--muted);max-width:620px}.card{background:rgba(23,15,19,.94);border:1px solid var(--line);padding:24px}.cta{width:100%;background:var(--wine);color:#fff;border:1px solid #c57b69;padding:15px 18px;text-align:left}.cta:hover{background:#8a3048}.screen{display:none}.screen.active{display:block}.statusbar{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 18px}.pill{border:1px solid #49353a;padding:7px 10px;font-size:12px;color:var(--muted)}.pill.ok{border-color:#2c7d61;color:var(--green)}.rooms{display:grid;grid-template-columns:repeat(2,1fr);gap:18px}.room{min-height:220px;background-size:cover;background-position:center;border:1px solid var(--line);position:relative;overflow:hidden}.room:after{content:"";position:absolute;inset:0;background:linear-gradient(transparent,#090608 88%)}.room button{position:absolute;inset:0;border:0;background:transparent;color:#fff;text-align:left;padding:18px;z-index:1;display:flex;align-items:flex-end;font:700 22px Georgia,serif}.room.visited{outline:2px solid var(--green)}.panel-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:18px}.log{min-height:210px}.log h2,.card h2{font:700 28px Georgia,serif;margin-top:0}.message{padding:12px;border-left:2px solid var(--gold);background:#0d090b;margin:10px 0}.message.agent{border-color:#3e9bd8}.small{font-size:12px;color:var(--muted)}.actions{display:flex;gap:10px;flex-wrap:wrap}.secondary{background:#141014;color:var(--ink);border:1px solid var(--line);padding:11px 14px}.receipt{font:12px ui-monospace,monospace;color:#a8d9ff;word-break:break-all}.accuse{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.accuse select{background:#0c090b;color:var(--ink);border:1px solid var(--line);padding:12px}.verdict{text-align:center;padding:80px 20px}.verdict strong{display:block;font:800 clamp(90px,20vw,220px)/1 Georgia,serif;color:var(--green)}.notice{position:sticky;bottom:0;background:#110b0e;border-top:1px solid var(--gold);padding:10px 18px;text-align:center;color:#e9c985;font-size:12px;z-index:5}@media(max-width:760px){.hero,.panel-grid{grid-template-columns:1fr}.rooms{grid-template-columns:1fr}.shell{padding:16px}.hero{padding:34px 0}.accuse{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="shell">
<header class="top"><div class="brand">THE LAST ALIBI</div><div class="badge">Interactive demo simulation</div></header>
<main>
<section id="start" class="screen active hero">
<div><p class="small">CASE FILE · 001</p><h1>The Last<br>Exhibit</h1><p>Explore four rooms, question suspects, collect evidence, request a certified warrant, and commit one final accusation.</p></div>
<div class="card"><h2>The rules of truth</h2><p>Agents may persuade. Only accepted canonical transitions can change case state.</p><button class="cta" onclick="begin()">Begin investigation →</button><p class="small">This lightweight build simulates partner responses for product demonstration. Real Sui testnet proof evidence is linked inside the game.</p></div>
</section>
<section id="game" class="screen">
<div class="statusbar"><span class="pill ok">Practice demo active</span><span class="pill" id="evidenceCount">Evidence 0/4</span><span class="pill" id="warrantState">Warrant pending</span><span class="pill">Candidate mask 0xffffffffffffffff</span></div>
<div class="rooms" id="rooms"></div>
<div class="panel-grid">
<section class="card log"><h2 id="suspectTitle">Investigation notebook</h2><div id="dialogue"><p class="small">Choose a room to inspect its evidence and question its suspect.</p></div><div class="actions"><button id="ask" class="secondary" onclick="askAgent()" disabled>Question suspect agent</button><button id="warrant" class="secondary" onclick="requestWarrant()" disabled>Request certified warrant</button></div></section>
<section class="card"><h2>Technical receipts</h2><div id="receipts"><p class="small">No demo operation has completed yet.</p></div><p><a style="color:#9fc7ff" target="_blank" href="https://suiscan.xyz/testnet/tx/CFJgdKZZYyWuLiCLQ477DqCyZ9UY73gVbofeVZMBeFYT">Inspect genuine Sui testnet Groth16 acceptance ↗</a></p></section>
</div>
<section class="card" style="margin-top:18px"><h2>Commit an accusation</h2><div class="accuse"><select id="suspect"><option>Ada Vale</option><option>Marcus Reed</option><option>Celeste Moreau</option><option>Theo Lin</option></select><select id="room"><option>Grand Gallery</option><option>Restoration Lab</option><option>Archive Vault</option><option>Rooftop Conservatory</option></select><select id="weapon"><option>Ceremonial Dagger</option><option>Bronze Bust</option></select><select id="time"><option>Before Blackout</option><option>After Blackout</option></select></div><button class="cta" style="margin-top:14px" onclick="accuse()">Confirm private accusation →</button></section>
</section>
<section id="end" class="screen verdict"><p class="small">TERMINAL BINARY VERDICT</p><strong id="result">YES</strong><p>The hidden case remains undisclosed.</p><div id="terminalReceipt" class="receipt"></div><button class="secondary" onclick="restart()">Play again</button></section>
</main>
</div>
<div class="notice">DEMO SIMULATION · Partner activity shown in this lightweight build is simulated. Separate Sui testnet receipts are genuine and inspectable.</div>
<script>
const sha='5577d0dc2ad4e7cb63b3bbeb4a3efe6d6285b019';
const base='https://raw.githubusercontent.com/pradykst/The-Last-Alibi/'+sha+'/apps/web/public/assets/rooms/';
const data=[
 {name:'Grand Gallery',slug:'grand-gallery',suspect:'Marcus Reed',evidence:'A velvet rope was cut cleanly near the central case.',reply:'I heard the alarm before I crossed the west arch. Check the display glass—not my gloves.'},
 {name:'Restoration Lab',slug:'restoration-lab',suspect:'Ada Vale',evidence:'Fresh solvent marks interrupt the restoration ledger.',reply:'The curator moved the dagger after the inventory. I stayed with the conservation table.'},
 {name:'Archive Vault',slug:'archive-vault',suspect:'Celeste Moreau',evidence:'The access ledger records an unexplained two-minute gap.',reply:'Someone used an old staff credential. The blackout concealed the exact timestamp.'},
 {name:'Rooftop Conservatory',slug:'rooftop-conservatory',suspect:'Theo Lin',evidence:'Rainwater footprints end beside the service stair.',reply:'I saw a silhouette descend before the lights failed. It was carrying something narrow.'}
];
let active=-1,visited=new Set(),warrant=false;
function show(id){document.querySelectorAll('.screen').forEach(x=>x.classList.remove('active'));document.getElementById(id).classList.add('active');scrollTo(0,0)}
function begin(){show('game');renderRooms()}
function renderRooms(){document.getElementById('rooms').innerHTML=data.map((r,i)=>'<article class="room '+(visited.has(i)?'visited':'')+'" style="background-image:url('+base+r.slug+'/background.png)"><button onclick="visit('+i+')">'+r.name+'</button></article>').join('')}
function visit(i){active=i;visited.add(i);renderRooms();document.getElementById('evidenceCount').textContent='Evidence '+visited.size+'/4';document.getElementById('suspectTitle').textContent=data[i].suspect+' · '+data[i].name;document.getElementById('dialogue').innerHTML='<div class="message"><b>Public observation</b><br>'+data[i].evidence+'</div><p class="small">Suspect testimony is narrative, not canonical evidence.</p>';document.getElementById('ask').disabled=false;document.getElementById('warrant').disabled=visited.size<2||warrant}
function askAgent(){if(active<0)return;const box=document.getElementById('dialogue');box.innerHTML+='<div class="message agent" id="agentWait">Requesting demo agent response…</div>';document.getElementById('ask').disabled=true;setTimeout(()=>{document.getElementById('agentWait').innerHTML='<b>'+data[active].suspect+'</b><br>'+data[active].reply+'<br><span class="small">Response verification: simulated for this demo build</span>';addReceipt('0G response · demo simulation · accepted');document.getElementById('ask').disabled=false},650)}
function requestWarrant(){warrant=true;document.getElementById('warrant').disabled=true;document.getElementById('warrantState').textContent='Proof generating';addReceipt('Query nonce 0 · prover simulation pending');setTimeout(()=>{document.getElementById('warrantState').textContent='Warrant accepted';document.getElementById('warrantState').classList.add('ok');addReceipt('Sui transition · demo simulation · candidate count 16');addReceipt('Replay protection · nonce consumed')},850)}
function addReceipt(text){const r=document.getElementById('receipts');if(r.querySelector('.small'))r.innerHTML='';r.innerHTML+='<p class="receipt">'+text+'</p>'}
function accuse(){show('end');const yes=document.getElementById('suspect').value==='Ada Vale'&&document.getElementById('room').value==='Grand Gallery'&&document.getElementById('weapon').value==='Ceremonial Dagger'&&document.getElementById('time').value==='Before Blackout';document.getElementById('result').textContent=yes?'YES':'NO';document.getElementById('terminalReceipt').textContent='Demo terminal flow · proof simulated · Seal decision simulated · binary result only'}
function restart(){active=-1;visited=new Set();warrant=false;document.getElementById('receipts').innerHTML='<p class="small">No demo operation has completed yet.</p>';document.getElementById('warrantState').textContent='Warrant pending';document.getElementById('warrantState').classList.remove('ok');show('start')}
</script>
</body>
</html>`;
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') {
      return Response.json({ status: 'ok', mode: 'demo-simulation', liveEvidence: { suiTestnet: true, browserPartnerCalls: false } });
    }
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60' } });
  }
};