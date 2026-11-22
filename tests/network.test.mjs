import {test} from 'node:test';import assert from 'node:assert/strict';import {newGame,act} from '../server/engine.mjs';import {GopRoom} from '../server/worker.mjs';
const fixture=()=>newGame(['A','B'],()=>1);
import {botStep} from '../server/engine.mjs';
test('bot preview keeps token for 1200ms, records capture, and extra turn keeps last marker',()=>{
 const g=fixture();g.turn=1;g.dice=[3,3];assert.equal(botStep(g,1,undefined,1000),true);
 assert.deepEqual(g.botPreview,{x:3,y:3,readyAt:2200});assert.equal(g.board[14],null);assert.equal(g.players[1].tokens,0);
 assert.equal(botStep(g,1,undefined,2199),false);assert.equal(g.board[14],null);
 botStep(g,1,undefined,2200);assert.equal(g.players[1].tokens,1);assert.equal(g.turn,1);assert.equal(g.lastBotMove.captured,true);assert.equal(g.botPreview,null);
 botStep(g,1,()=>3,3400);botStep(g,1,undefined,4600);assert.equal(g.lastBotMove.captured,true);
 botStep(g,1,undefined,5800);assert.equal(g.lastBotMove.captured,false);assert.equal(g.players[1].tokens,1);
 act(g,0,{type:'offer'});botStep(g,1);assert.equal(g.botPreview,null);assert.equal(g.phase,'finished');
});
test('bot chooses legal black token, then support; keeps dice and normal extra-turn rules',()=>{
 const g=fixture();g.turn=1;g.dice=[2,3];g.board[13]=0;botStep(g);botStep(g,1,undefined,g.botPreview.readyAt);assert.equal(g.players[1].position,8);assert.equal(g.players[1].tokens,1);
 g.turn=1;g.dice=[2,3];g.players[0].position=13;botStep(g);botStep(g,1,undefined,g.botPreview.readyAt);assert.equal(g.players[1].position,13);assert.equal(g.turn,1);
 g.dice=[4,4];botStep(g);botStep(g,1,undefined,g.botPreview.readyAt);assert.equal(g.turn,1);assert.equal(g.players[1].tokens,2);
});
test('bot persists through alarm wakeups, pauses offline, resumes, accepts finish and protects seat',async()=>{
 const h=harness();const info=await (await h.room.fetch(req('/create',{id:'bot-test',name:'Human',token,bot:true}))).json();
 assert.equal((await h.room.fetch(req('/rooms/bot-test/join',{invite:info.invite,token:token2,name:'Intruder'}))).status,409);
 const w=h.socket(0);await h.room.webSocketMessage(w,JSON.stringify({type:'ready',id:'e'.repeat(64),version:0}));
 let s=h.data.get('room');assert.ok(s.game);s.game.turn=s.game.order.indexOf(1);s.game.dice=[2,3];h.data.set('room',s);
 w.readyState=3;await h.room.alarm();assert.deepEqual(h.data.get('room'),s);
 w.readyState=1;await new GopRoom(h.room.ctx,{}).alarm();s=h.data.get('room');assert.ok(s.game.botPreview);s.game.botPreview.readyAt=0;h.data.set('room',s);await h.room.alarm();s=h.data.get('room');assert.equal(s.game.players[1].tokens,1);assert.equal(s.game.order[s.game.turn],0);
 w.a.last=0;await h.room.webSocketMessage(w,JSON.stringify({type:'offer',id:'f'.repeat(64),version:s.version}));await h.room.alarm();s=h.data.get('room');assert.equal(s.game.phase,'finished');assert.equal(s.game.players.reduce((n,p)=>n+p.tokens,0),36);assert.equal(s.game.board.filter(x=>x===null).length,0);
 const version=s.version;await h.room.alarm();assert.equal(h.data.get('room').version,version);
});
test('36 dice pairs: legal sectors, captures and double turns',()=>{for(let a=1;a<=6;a++)for(let b=1;b<=6;b++){const g=fixture();let seq=[a,b];act(g,0,{type:'roll'},()=>seq.shift());assert.throws(()=>act(g,1,{type:'choose',x:a,y:b}));assert.throws(()=>act(g,0,{type:'choose',x:0,y:0}));act(g,0,{type:'choose',x:a,y:b});assert.equal(g.players[0].tokens,1);assert.equal(g.turn,a===b?0:1);}});
test('brother support uses actual piece position; stacks with doubles',()=>{const g=fixture();g.board[7]=1;g.players[1].position=7;g.dice=[2,2];act(g,0,{type:'choose',x:2,y:2});assert.equal(g.extra,1);assert.equal(g.turn,0);assert.equal(g.players[0].tokens,0);});
test('both must consent; offer freezes moves; reject resumes; draw and cleared board',()=>{const g=fixture();act(g,0,{type:'offer'});assert.throws(()=>act(g,0,{type:'accept'}));assert.throws(()=>act(g,0,{type:'roll'}));act(g,1,{type:'reject'});act(g,1,{type:'offer'});act(g,0,{type:'accept'});assert.deepEqual(g.players.map(p=>p.tokens),[18,18]);assert.equal(g.board.filter(v=>v===null).length,0);assert.match(g.result,/Нічия/);assert.throws(()=>act(g,0,{type:'roll'}));});
test('50 full games maintain all 36 tokens and finish naturally',()=>{let seed=37;const roll=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return Math.floor(seed/4294967296*6)+1;};for(let run=0;run<50;run++){const g=newGame(['A','B'],roll);let turns=0;while(g.phase==='playing'&&turns++<20000){const id=g.order[g.turn];act(g,id,{type:'roll'},roll);const [x,y]=g.dice;act(g,id,{type:'choose',x,y});assert.equal(g.players.reduce((s,p)=>s+p.tokens,0)+g.board.filter(v=>v===null).length,36);}assert.ok(turns<20000);assert.equal(g.phase,'finished');}});
function harness(){const data=new Map(),sockets=[];const ctx={storage:{get:async k=>structuredClone(data.get(k)),put:async(k,v)=>data.set(k,structuredClone(v)),setAlarm:async()=>{},deleteAll:async()=>data.clear()},blockConcurrencyWhile:f=>f(),getWebSockets:()=>sockets};const room=new GopRoom(ctx,{});const socket=slot=>{const w={readyState:1,a:{slot,last:0},messages:[],deserializeAttachment(){return this.a;},serializeAttachment(a){this.a=a;},send(s){this.messages.push(JSON.parse(s));},close(){this.readyState=3;}};sockets.push(w);return w;};return {room,data,sockets,socket};}
const token='a'.repeat(64),token2='b'.repeat(64),req=(path,b)=>new Request('https://example'+path,{method:'POST',body:JSON.stringify(b)});
test('join retry, third player blocked, credentials never broadcast, version/turn enforcement and reconnect state',async()=>{const h=harness();let r=await h.room.fetch(req('/create',{id:'test',name:'Host',token}));const info=await r.json();assert.equal(r.status,200);r=await h.room.fetch(req('/rooms/test/join',{invite:'bad',token:token2}));assert.equal(r.status,403);const join={invite:info.invite,token:token2,name:'Guest'};assert.equal((await h.room.fetch(req('/rooms/test/join',join))).status,200);assert.equal((await h.room.fetch(req('/rooms/test/join',join))).status,200);assert.equal(h.data.get('room').players.length,2);assert.equal((await h.room.fetch(req('/rooms/test/join',{...join,token:'c'.repeat(64)}))).status,409);
 const w0=h.socket(0),w1=h.socket(1);h.room.broadcast(h.data.get('room'));assert.ok(!JSON.stringify(w0.messages).includes(token));assert.ok(!JSON.stringify(w0.messages).includes(info.invite));
 let seq=1;const send=async(w,type,extra={})=>{w.a.last=0;await h.room.webSocketMessage(w,JSON.stringify({id:(seq++).toString(16).padStart(64,'0'),version:h.data.get('room').version,type,...extra}));};await send(w0,'ready');await send(w1,'ready');assert.ok(h.data.get('room').game);
 const saved=structuredClone(h.data.get('room')),id=saved.game.order[0],w=id?w1:w0,other=id?w0:w1;
 await send(other,'roll');assert.equal(other.messages.at(-1).type,'error');assert.deepEqual(h.data.get('room'),saved);
 await send(w,'roll',{version:-1});assert.deepEqual(h.data.get('room'),saved);
 const action={type:'roll',version:saved.version,id:'d'.repeat(64)};w.a.last=0;await h.room.webSocketMessage(w,JSON.stringify(action));const after=structuredClone(h.data.get('room'));await h.room.webSocketMessage(w,JSON.stringify(action));assert.deepEqual(h.data.get('room'),after);
 other.readyState=3;const [x,y]=after.game.dice;await send(w,'choose',{x,y});assert.deepEqual(h.data.get('room'),after);
 const restored=new GopRoom(h.room.ctx,{});other.readyState=1;await restored.webSocketMessage(other,JSON.stringify({type:'sync'}));assert.deepEqual(other.messages.at(-1).state.game,after.game);
 const expired=h.data.get('room');expired.expires=0;h.data.set('room',expired);await h.room.alarm();assert.equal(h.data.size,0);assert.equal(w.readyState,3);
});
