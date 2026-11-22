import assert from 'node:assert/strict';
const api=process.argv[2]||'http://127.0.0.1:8798',token=()=>crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
const post=async(path,data)=>{const r=await fetch(api+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});return {status:r.status,body:await r.json()};};
const host=token(),guest=token(),created=await post('/rooms',{name:'Test host',token:host});assert.equal(created.status,200);const {id,invite}=created.body;
assert.equal((await post('/rooms/'+id+'/join',{name:'Test guest',token:guest,invite})).status,200);
assert.equal((await post('/rooms/'+id+'/join',{name:'Third',token:token(),invite})).status,409);
function connection(t){const ws=new WebSocket(api.replace('https:','wss:').replace('http:','ws:')+'/rooms/'+id+'/ws',['gop',t]),messages=[];ws.addEventListener('message',e=>messages.push(JSON.parse(e.data)));return {ws,messages};}
const a=connection(host),b=connection(guest),all=[a,b];
async function wait(c,p){const deadline=Date.now()+6000;while(Date.now()<deadline){const m=c.messages.findLast(p);if(m)return m;await new Promise(r=>setTimeout(r,25));}throw Error('Timed out waiting for socket state: '+JSON.stringify(c.messages));}
const state=c=>c.messages.findLast(m=>m.type==='state')?.state;
async function action(c,type,extra={}){await new Promise(r=>setTimeout(r,180));const version=state(c).version;c.ws.send(JSON.stringify({type,version,id:token(),...extra}));return wait(c,m=>m.type==='state'&&m.state.version>version);}
try{
 await wait(a,m=>m.type==='state'&&m.state.players.every(p=>p.connected));await wait(b,m=>m.type==='state'&&m.state.players.every(p=>p.connected));
 await action(a,'ready');await wait(b,m=>m.type==='state'&&m.state.players[0].ready);await action(b,'ready');await wait(a,m=>m.type==='state'&&m.state.game);
 const active=state(a).game.order[0]===0?a:b,other=active===a?b:a;
 await action(active,'roll');const [x,y]=state(active).game.dice;await action(active,'choose',{x,y});await wait(other,m=>m.type==='state'&&m.state.version===state(active).version);assert.deepEqual(state(a),state(b));
 const saved=structuredClone(state(b));b.ws.close();await wait(a,m=>m.type==='state'&&!m.state.players[1].connected);
 const resumed=connection(guest);all.push(resumed);await wait(resumed,m=>m.type==='state'&&m.state.players.every(p=>p.connected));assert.deepEqual(state(resumed).game,saved.game);
 await wait(a,m=>m.type==='state'&&m.state.players.every(p=>p.connected));await action(a,'offer');await wait(resumed,m=>m.type==='state'&&m.state.game.offer===0);await action(resumed,'accept');await wait(a,m=>m.type==='state'&&m.state.game.phase==='finished');assert.deepEqual(state(a),state(resumed));assert.equal(state(a).game.players.reduce((n,p)=>n+p.tokens,0),36);
 console.log(JSON.stringify({passed:true,server:api,realWebSockets:true,sameState:true,reconnected:true,thirdPlayerBlocked:true,consensualFinish:true,result:state(a).game.result},null,2));
}finally{for(const c of all)c.ws.close();}
