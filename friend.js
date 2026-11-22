(()=>{'use strict';
const API=location.hostname==='127.0.0.1'?'http://127.0.0.1:8798':'https://ai1ok-gop-rooms.ai1okportal.workers.dev',ui=Object.fromEntries(['opponent','lobby','netName','createRoom','joinRoom','roomPanel','inviteLink','copyInvite','shareInvite','readyBtn','reconnectBtn','participants','netStatus','netGame','turnStatus','botMoveNote','netRoll','offerFinish','netDieA','netDieB','diceHelp','netChoices','finishPanel','finishText','acceptFinish','rejectFinish','netBoard','netStats','netLog'].map(id=>[id,document.getElementById(id)]));
const key=()=>crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
let room=null,ws=null,state=null,you=null,pending=false,retry=null,heartbeat=null,lastPong=0,attempts=0,closed=false;
const text=(el,value)=>el.textContent=value;
function status(s,error=false){text(ui.netStatus,s);ui.netStatus.className='notice '+(error?'error':ws?.readyState===1?'connected':'');}
function save(){localStorage.setItem('gopRoom:'+room.id,JSON.stringify(room));}
function invitation(){return location.origin+location.pathname+'#room='+room.id+'&invite='+room.invite;}
async function post(path,data){const c=new AbortController(),t=setTimeout(()=>c.abort(),15000);try{const r=await fetch(API+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:c.signal});const b=await r.json();if(!r.ok)throw Error(b.error||'Помилка сервера.');return b;}finally{clearTimeout(t);}}
async function enter(create){
 ui.createRoom.disabled=ui.joinRoom.disabled=true;status('З’єднуємося із сервером гри…');
 try{
  const playerName=ui.netName.value.trim()||'Козак';
  if(create){const token=key(),b=await post('/rooms',{name:playerName,token,bot:ui.opponent.value==='bot'});room={...b,token,name:playerName};save();location.hash='room='+room.id+'&invite='+room.invite;}
  else{room.token=room.token||key();room.name=playerName;save();await post('/rooms/'+room.id+'/join',{name:playerName,token:room.token,invite:room.invite});}
  ui.lobby.hidden=true;ui.roomPanel.hidden=false;ui.inviteLink.value=invitation();connect();
 }catch(e){status(e.name==='AbortError'?'Сервер не відповів. Спробуйте ще раз.':e.message,true);}finally{ui.createRoom.disabled=ui.joinRoom.disabled=false;}
}
function connect(){
 clearTimeout(retry);clearInterval(heartbeat);closed=false;pending=false;
 if(ws){ws.onclose=null;ws.close();}status('Підключаємо кімнату…');
 const socket=ws=new WebSocket(API.replace('https:','wss:').replace('http:','ws:')+'/rooms/'+room.id+'/ws',['gop',room.token]);
 socket.onopen=()=>{attempts=0;lastPong=Date.now();status('Зв’язок установлено.');heartbeat=setInterval(()=>{if(Date.now()-lastPong>55000){socket.close();return;}if(socket.readyState===1)socket.send(JSON.stringify({type:'ping'}));},20000);};
 socket.onmessage=e=>{
  let m;try{m=JSON.parse(e.data);}catch{return;}
  lastPong=Date.now();if(m.type==='pong')return;
  pending=false;if(m.type==='error'){status(m.message,true);render();return;}
  if(m.type==='state'){if(state&&m.state.version<state.version)return;you=m.you;state=m.state;render();status(state.players.length<2?'Кімната готова. Надішліть посилання другу.':state.players.every(p=>p.connected)?'Обидва гравці підключені.':'Очікуємо повернення другого гравця.');}
 };
 socket.onclose=e=>{if(socket!==ws)return;clearInterval(heartbeat);pending=false;render();if(e.code===4001||e.code===4004){closed=true;status(e.code===4001?'Ваше місце відкрито в іншій вкладці.':'Строк кімнати минув. Створіть нову.',true);return;}status('Зв’язок перервано. Відновлюємо кімнату…',true);retry=setTimeout(connect,Math.min(15000,1000*2**Math.min(attempts++,4)));};
 socket.onerror=()=>status('Немає зв’язку з сервером. Перевірте інтернет.',true);
}
function send(type,data={}){if(!state||pending||ws?.readyState!==1){status('Зачекайте на з’єднання з кімнатою.',true);return;}pending=true;ws.send(JSON.stringify({type,id:key(),version:state.version,...data}));render();}
function element(tag,cls,value){const e=document.createElement(tag);e.className=cls;if(value!==undefined)e.textContent=value;return e;}
function previewSector(x,y,on){
 const cell=ui.netBoard.querySelector('[data-sector="'+x+','+y+'"]');
 if(cell)cell.classList.toggle('sector-preview',on);
}
function render(){
 if(!state)return;const online=ws?.readyState===1,both=state.players.length===2&&state.players.every(p=>p.connected),g=state.game;
 const hasBot=!!state.players[1]?.bot;ui.shareInvite.hidden=hasBot||!navigator.share;document.querySelector('label[for=inviteLink]').textContent=hasBot?'Посилання для повернення до цієї партії':'Посилання для друга';
 text(ui.participants,state.players.map((p,i)=>(i===you?'Ви: ':(p.bot?'Автогравець: ':'Друг: '))+p.name+' — '+(p.connected?'підключений':'немає зв’язку')+(p.ready?' · готовий':'')).join('\n'));
 ui.readyBtn.hidden=!!g;ui.readyBtn.disabled=!online||pending;ui.netGame.hidden=!g;if(!g)return;
 const active=g.order[g.turn],myTurn=active===you,playing=g.phase==='playing',allowed=online&&both&&!pending&&playing&&g.offer===null;
 ui.netRoll.disabled=!allowed||!myTurn||!!g.dice;ui.offerFinish.disabled=!allowed;
 text(ui.turnStatus,!playing?g.result:!both?'Очікуємо повернення гравця.':g.offer!==null?'Пропозиція завершення — очікуємо відповідь.':myTurn?'Ваш хід, '+g.players[you].name+'.':g.players[active].name+(state.players[active].bot?': думає…':': хід друга.'));
 const preview=playing&&g.offer===null?g.botPreview:null;
 ui.botMoveNote.hidden=!hasBot||(!preview&&!g.lastBotMove);
 text(ui.botMoveNote,preview?'Комп’ютер обирає сектор ('+preview.x+','+preview.y+') — зараз зробить хід.':g.lastBotMove?'Останній хід комп’ютера: '+g.lastBotMove.message:'');
 text(ui.netDieA,g.dice?.[0]||'–');text(ui.netDieB,g.dice?.[1]||'–');text(ui.diceHelp,g.dice?'Оберіть сектор за кубиками.':'Кубики визначає сервер.');ui.netChoices.replaceChildren();
 if(g.dice){const [a,b]=g.dice,pairs=a===b?[[a,b]]:[[a,b],[b,a]];for(const [x,y] of pairs){const btn=element('button','btn primary','Обрати сектор ('+x+','+y+')');btn.disabled=!allowed||!myTurn;btn.setAttribute('aria-controls','sector-'+x+'-'+y);
 btn.onpointerenter=()=>{if(!btn.disabled)previewSector(x,y,true);};
 btn.onpointerleave=()=>{if(document.activeElement!==btn)previewSector(x,y,false);};
 btn.onfocus=()=>{if(!btn.disabled)previewSector(x,y,true);};
 btn.onblur=()=>previewSector(x,y,false);
 btn.onclick=()=>send('choose',{x,y});ui.netChoices.append(btn);}}
 ui.finishPanel.hidden=g.offer===null;ui.acceptFinish.hidden=g.offer===you;ui.acceptFinish.disabled=ui.rejectFinish.disabled=!online||!both||pending;text(ui.finishText,g.offer===you?'Ви запропонували завершити. Друг має підтвердити.':'Друг пропонує завершити партію та розподілити залишок фішок.');
 ui.netStats.replaceChildren();for(const p of g.players){const row=element('div','stat'+(playing&&p.id===active?' turn':''));row.append(element('span','name',p.name+(p.id===you?' (ви)':'')),element('span','score',p.tokens));ui.netStats.append(row);}
 ui.netLog.replaceChildren(...g.log.map(l=>element('p','',l)));ui.netBoard.replaceChildren();
 function tile(cls,value){const e=element('div','tile '+cls,value);ui.netBoard.append(e);return e;}
 function corner(){const e=tile('corner-logo'),img=document.createElement('img');img.className='flag-img';img.src='flag-corner.svg';img.alt='Прапор';e.append(img);}
 corner();for(let x=1;x<=6;x++)tile('edge',x);corner();
 for(let y=1;y<=6;y++){tile('edge',y);for(let x=1;x<=6;x++){const i=(y-1)*6+x-1,c=tile('cell '+(x===y?'pink':(x+y)%2===0?'blue':'yellow'));c.dataset.sector=x+','+y;c.id='sector-'+x+'-'+y;
 const candidate=playing&&g.offer===null&&g.dice&&((x===g.dice[0]&&y===g.dice[1])||(x===g.dice[1]&&y===g.dice[0]));
 if(candidate)c.classList.add('sector-option');
 if(preview?.x===x&&preview?.y===y)c.classList.add('bot-preview');
 if(g.lastBotMove?.x===x&&g.lastBotMove?.y===y){c.classList.add('bot-last');const badge=element('span','bot-last-badge','ПК');badge.title='Останній хід комп’ютера';c.append(badge);}
 c.setAttribute('aria-label','Сектор '+x+','+y+(g.board[i]===null?' — є чорна фішка':' — чорної фішки немає'));
 c.append(element('div','coord-main',x+':'+y));if(g.board[i]===null)c.append(element('div','black-token'));const here=g.players.filter(p=>p.position===i);const target=here.length>1?element('div','player-stack stack-'+here.length):c;if(target!==c)c.append(target);for(const p of here)target.append(element('div','player-piece '+(here.length>1?'stacked ':'')+'p'+(p.id+1),p.id===0?'С':'В'));}tile('edge',y);}corner();for(let x=1;x<=6;x++)tile('edge',x);corner();
}
ui.createRoom.onclick=()=>enter(true);ui.joinRoom.onclick=()=>enter(false);ui.readyBtn.onclick=()=>send('ready');ui.netRoll.onclick=()=>send('roll');ui.offerFinish.onclick=()=>send('offer');ui.acceptFinish.onclick=()=>send('accept');ui.rejectFinish.onclick=()=>send('reject');ui.reconnectBtn.onclick=()=>connect();
ui.copyInvite.onclick=async()=>{try{await navigator.clipboard.writeText(ui.inviteLink.value);status('Посилання скопійовано. Надішліть його другу.');}catch{ui.inviteLink.focus();ui.inviteLink.select();status('Виділіть і скопіюйте посилання вручну.');}};
ui.shareInvite.hidden=!navigator.share;ui.shareInvite.onclick=async()=>{try{await navigator.share({title:'ГОП — зіграємо разом',url:invitation()});}catch{}};
addEventListener('online',()=>{if(room&&!closed&&ui.lobby.hidden)connect();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&room&&!closed&&ui.lobby.hidden){if(ws?.readyState!==1||Date.now()-lastPong>55000)connect();else ws.send(JSON.stringify({type:'sync'}));}});
if(new URLSearchParams(location.search).get('opponent')==='bot')ui.opponent.value='bot';
const hash=new URLSearchParams(location.hash.slice(1)),id=hash.get('room'),invite=hash.get('invite');
if(id&&invite&&/^[a-f0-9-]{36}$/.test(id)&&/^[a-f0-9]{64}$/.test(invite)){try{room=JSON.parse(localStorage.getItem('gopRoom:'+id)||'null');}catch{}if(!room||room.invite!==invite)room={id,invite};ui.createRoom.hidden=true;ui.opponent.hidden=true;document.querySelector('label[for=opponent]').hidden=true;ui.joinRoom.hidden=false;ui.netName.value=room.name||'';status(room.token?'Ваше місце збережено. Натисніть «Приєднатися» для повернення.':'Вас запросили до гри. Вкажіть ім’я та приєднайтеся.');}
})();
