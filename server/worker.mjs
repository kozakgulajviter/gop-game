import {newGame,act,botStep} from './engine.mjs';
const TTL=24*60*60*1000;
const origins=new Set(['https://kozakgulajviter.github.io']);
const key=()=>crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
const validKey=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const name=s=>String(s||'Гравець').trim().slice(0,24)||'Гравець';
async function body(r){if(Number(r.headers.get('content-length')||0)>2048)throw Error('Завеликий запит.');const t=await r.text();if(t.length>2048)throw Error('Завеликий запит.');return JSON.parse(t);}
export default {async fetch(request,env){
 const u=new URL(request.url),origin=request.headers.get('Origin');
 if(origin&&!origins.has(origin)&&origin!==env.DEV_ORIGIN)return json({error:'Недозволене джерело.'},403);
 if(request.method==='OPTIONS')return new Response(null,{headers:{'Access-Control-Allow-Origin':origin||'https://kozakgulajviter.github.io','Access-Control-Allow-Methods':'POST, GET, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'86400'}});
 let response;
 try{
  if(u.pathname==='/health')response=json({ok:true,version:30});
  else if(u.pathname==='/rooms'&&request.method==='POST'){
   const b=await body(request);if(!validKey(b.token))return json({error:'Неправильний ключ.'},400);
   const ip=request.headers.get('CF-Connecting-IP')||'unknown';
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip)))).map(x=>x.toString(16).padStart(2,'0')).join('');
   const gate=env.ROOMS.get(env.ROOMS.idFromName('rate:'+digest));
   const limited=await gate.fetch(new Request('https://internal/limit',{method:'POST'}));
   if(!limited.ok)response=limited;
   else{const id=crypto.randomUUID();response=await env.ROOMS.get(env.ROOMS.idFromName(id)).fetch(new Request('https://internal/create',{method:'POST',body:JSON.stringify({id,name:name(b.name),token:b.token,bot:b.bot===true})}));}
  }else{
   const m=u.pathname.match(/^\/rooms\/([a-f0-9-]{36})\/(join|ws)$/);
   if(!m)response=json({error:'Не знайдено.'},404);
   else response=await env.ROOMS.get(env.ROOMS.idFromName(m[1])).fetch(request);
  }
 }catch{response=json({error:'Не вдалося виконати запит. Спробуйте ще раз.'},400);}
 if(response.status===101)return response;
 const headers=new Headers(response.headers);headers.set('Access-Control-Allow-Origin',origin||'https://kozakgulajviter.github.io');headers.set('Vary','Origin');return new Response(response.body,{status:response.status,headers});
}};
export class GopRoom{
 constructor(ctx,env){this.ctx=ctx;this.env=env;}
 async fetch(r){return this.ctx.blockConcurrencyWhile(async()=>{
  const path=new URL(r.url).pathname;
  if(path==='/limit'){
   const now=Date.now();let v=await this.ctx.storage.get('rate')||{start:now,count:0};if(now-v.start>3600000)v={start:now,count:0};
   if(v.count>=10)return json({error:'До 10 нових кімнат на годину. Спробуйте пізніше.'},429);
   v.count++;await this.ctx.storage.put('rate',v);await this.ctx.storage.setAlarm(v.start+3600000);return json({ok:true});
  }
  let s=await this.ctx.storage.get('room');
  if(path==='/create'&&r.method==='POST'){
   if(s)return json({error:'Кімната вже існує.'},409);const b=await body(r);
   s={id:b.id,invite:key(),expires:Date.now()+TTL,version:0,players:[{name:b.name,token:b.token,ready:false,seen:[]}],game:null};
   if(b.bot===true)s.players.push({name:'Комп’ютер',bot:true,token:key(),ready:true,seen:[]});
   await this.ctx.storage.put('room',s);await this.ctx.storage.setAlarm(s.expires);return json({id:s.id,invite:s.invite,expires:s.expires});
  }
  if(!s||Date.now()>=s.expires)return json({error:'Кімната не існує або строк 24 години минув.'},404);
  if(path.endsWith('/join')&&r.method==='POST'){
   const b=await body(r);if(!validKey(b.token)||b.invite!==s.invite)return json({error:'Неправильне запрошення.'},403);
   let slot=s.players.findIndex(p=>p.token===b.token);
   if(slot<0){if(s.players.length>=2)return json({error:'У кімнаті вже двоє гравців.'},409);slot=1;s.players.push({name:name(b.name),token:b.token,ready:false,seen:[]});s.version++;await this.ctx.storage.put('room',s);this.broadcast(s);}
   return json({slot,expires:s.expires});
  }
  if(path.endsWith('/ws')&&r.headers.get('Upgrade')?.toLowerCase()==='websocket'){
   const protocols=(r.headers.get('Sec-WebSocket-Protocol')||'').split(',').map(x=>x.trim()),slot=s.players.findIndex(p=>!p.bot&&p.token===protocols[1]);
   if(protocols[0]!=='gop'||slot<0)return json({error:'Немає доступу до місця гравця.'},403);
   for(const old of this.ctx.getWebSockets()){if(old.deserializeAttachment()?.slot===slot)old.close(4001,'Відкрито на іншій вкладці.');}
   const pair=new WebSocketPair(),[client,server]=Object.values(pair);this.ctx.acceptWebSocket(server);server.serializeAttachment({slot,last:0});
   await this.scheduleBot(s);this.broadcast(s);return new Response(null,{status:101,webSocket:client,headers:{'Sec-WebSocket-Protocol':'gop'}});
  }
  return json({error:'Непідтримувана дія.'},400);
 });}
 connected(s){const result=[false,!!s?.players[1]?.bot];for(const w of this.ctx.getWebSockets())if(w.readyState===1)result[w.deserializeAttachment().slot]=true;return result;}
 send(w,v){try{w.send(JSON.stringify(v));}catch{}}
 broadcast(s){const connected=this.connected(s);for(const w of this.ctx.getWebSockets())this.send(w,{type:'state',you:w.deserializeAttachment().slot,state:{id:s.id,expires:s.expires,version:s.version,players:s.players.map((p,i)=>({name:p.name,ready:p.ready,bot:!!p.bot,connected:connected[i]})),game:s.game}});}
 async webSocketMessage(ws,raw){return this.ctx.blockConcurrencyWhile(async()=>{
  try{
   if(ws.readyState!==1)return;
   if(typeof raw!=='string'||raw.length>1024)throw Error('Завелике повідомлення.');
   const a=ws.deserializeAttachment(),cmd=JSON.parse(raw),s=await this.ctx.storage.get('room');
   if(!s||Date.now()>=s.expires){ws.close(4004,'Строк кімнати минув.');return;}
   if(cmd.type==='ping'){this.send(ws,{type:'pong'});return;}
   if(cmd.type==='sync'){await this.scheduleBot(s);this.broadcast(s);return;}
   if(!validKey(cmd.id))throw Error('Неправильний номер дії.');
   if(s.players[a.slot].seen.includes(cmd.id)){this.broadcast(s);return;}
   if(Date.now()-a.last<150)throw Error('Зачекайте перед наступною дією.');
   if(cmd.version!==s.version){this.broadcast(s);throw Error('Стан оновився. Повторіть дію.');}
   if(cmd.type==='ready'){
    if(s.game)throw Error('Партія вже почалася.');s.players[a.slot].ready=true;
    if(s.players.length===2&&s.players.every(p=>p.ready)&&this.connected(s).every(Boolean))s.game=newGame(s.players.map(p=>p.name));
   }else{
    if(!s.game)throw Error('Обидва гравці мають натиснути «Готовий».');
    if(!this.connected(s).every(Boolean))throw Error('Очікуємо повернення другого гравця.');
    act(s.game,a.slot,cmd);
   }
   a.last=Date.now();ws.serializeAttachment(a);s.players[a.slot].seen.push(cmd.id);s.players[a.slot].seen=s.players[a.slot].seen.slice(-64);s.version++;
   await this.ctx.storage.put('room',s);await this.scheduleBot(s);this.broadcast(s);
  }catch(e){this.send(ws,{type:'error',message:e.message});}
 });}
 async webSocketClose(ws,code){return this.ctx.blockConcurrencyWhile(async()=>{try{ws.close(code===1006?1000:code);}catch{}const s=await this.ctx.storage.get('room');if(s)this.broadcast(s);});}
 async webSocketError(ws){return this.ctx.blockConcurrencyWhile(async()=>{try{ws.close(1011);}catch{}const s=await this.ctx.storage.get('room');if(s)this.broadcast(s);});}
 async scheduleBot(s){
  const g=s.game,needed=s.players[1]?.bot&&g?.phase==='playing'&&(g.offer===0||g.order[g.turn]===1)&&this.connected(s)[0];
  await this.ctx.storage.setAlarm(needed?Math.min(s.expires,(g?.botPreview?.readyAt&&g.offer===null?Math.max(Date.now()+50,g.botPreview.readyAt):Date.now()+1200)):s.expires);
 }
 async alarm(){return this.ctx.blockConcurrencyWhile(async()=>{
  const s=await this.ctx.storage.get('room');
  if(!s||Date.now()>=s.expires){for(const ws of this.ctx.getWebSockets())ws.close(4004,'Строк кімнати минув.');await this.ctx.storage.deleteAll();return;}
  if(s.players[1]?.bot&&this.connected(s)[0]&&s.game&&botStep(s.game)){s.version++;await this.ctx.storage.put('room',s);this.broadcast(s);}
  await this.scheduleBot(s);
 });}
}
