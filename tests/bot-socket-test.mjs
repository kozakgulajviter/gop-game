import assert from 'node:assert/strict';
const api=process.argv[2]||'http://127.0.0.1:8798',key=()=>crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-',''),token=key();
const r=await fetch(api+'/rooms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Bot test',token,bot:true})});assert.equal(r.status,200);const {id}=await r.json();
let ws,latest;const previews=[];let observedDelay=null;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function connect(){ws=new WebSocket(api.replace('http','ws')+'/rooms/'+id+'/ws',['gop',token]);ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='state'){const g=m.state.game;if(g?.botPreview&&!previews.some(p=>p.readyAt===g.botPreview.readyAt))previews.push({...g.botPreview,received:Date.now(),tokens:g.players[1].tokens});if(g?.lastBotMove&&!g.botPreview){const p=previews.findLast(p=>p.x===g.lastBotMove.x&&p.y===g.lastBotMove.y);if(p)observedDelay=Date.now()-p.received;}latest=m.state;}};}
async function wait(p){const end=Date.now()+30000;while(Date.now()<end){if(p())return;await sleep(40);}throw Error('Bot state timeout');}
async function action(type,extra={}){await sleep(180);const v=latest.version;ws.send(JSON.stringify({id:key(),version:v,type,...extra}));await wait(()=>latest.version>v);}
connect();try{
 await wait(()=>latest?.players[1]?.bot&&ws.readyState===1);assert.equal(latest.players[1].connected,true);await action('ready');
 await wait(()=>latest.game?.order[latest.game.turn]===0);
 const before=latest.game.players[1].tokens;
 for(let n=0;n<30&&latest.game.order[latest.game.turn]===0;n++){await action('roll');const[x,y]=latest.game.dice;await action('choose',{x,y});}
 assert.equal(latest.game.order[latest.game.turn],1);ws.close();await sleep(200);connect();await wait(()=>ws.readyState===1&&latest.game.order[latest.game.turn]===0);
 assert.ok(latest.game.players[1].tokens>before);assert.equal(latest.game.players.reduce((n,p)=>n+p.tokens,0)+latest.game.board.filter(x=>x===null).length,36);
 assert.ok(previews.length>0);assert.ok(observedDelay>=1000,'preview too short: '+observedDelay);await action('offer');await wait(()=>latest.game.phase==='finished');assert.equal(latest.game.players.reduce((n,p)=>n+p.tokens,0),36);assert.equal(latest.game.board.filter(x=>x===null).length,0);
 console.log(JSON.stringify({passed:true,server:api,automaticReply:true,previewDelayMs:observedDelay,reconnectedDuringBotTurn:true,automaticFinish:true,result:latest.game.result},null,2));
}finally{ws.close();}
