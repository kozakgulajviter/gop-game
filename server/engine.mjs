// Authoritative two-player GOP rules; shared by production server and tests.
export function die(){let n;do{n=crypto.getRandomValues(new Uint32Array(1))[0];}while(n>=4294967292);return n%6+1;}
export function newGame(names,roll=die){
 const players=names.map((name,id)=>({id,name,tokens:0,sectors:0,position:null,orderRoll:roll()+roll()}));
 return {players,board:Array(36).fill(null),order:[0,1].sort((a,b)=>players[b].orderRoll-players[a].orderRoll||a-b),turn:0,extra:0,dice:null,phase:'playing',log:['Партію розпочато.'],offer:null};
}
export function finish(g,early=false){
 if(early){let k=0;g.board=g.board.map(owner=>{if(owner!==null)return owner;const id=g.order[(g.turn+k++)%2];g.players[id].tokens++;return id;});}
 const max=Math.max(...g.players.map(p=>p.tokens)),w=g.players.filter(p=>p.tokens===max).map(p=>p.name);
 g.phase='finished';g.dice=null;g.botPreview=null;g.offer=null;g.result=(early?'Завершено за згодою обох. ':'Усі сектори звільнено. ')+(w.length>1?'Нічия: ':'Переможець: ')+w.join(', ')+'. Результат: '+max+' фішок.';
 g.log.unshift(g.result);
}
export function act(g,id,cmd,roll=die){
 if(g.phase!=='playing')throw Error('Партію вже завершено.');
 if(cmd.type==='offer'){if(g.offer!==null)throw Error('Пропозицію вже надіслано.');g.offer=id;return;}
 if(cmd.type==='reject'){if(g.offer===null)throw Error('Немає пропозиції.');g.offer=null;return;}
 if(cmd.type==='accept'){if(g.offer===null||g.offer===id)throw Error('Завершення має підтвердити другий гравець.');finish(g,true);return;}
 if(g.offer!==null)throw Error('Спочатку дайте відповідь щодо завершення партії.');
 if(g.order[g.turn]!==id)throw Error('Зараз хід іншого гравця.');
 if(cmd.type==='roll'){if(g.dice)throw Error('Спочатку оберіть сектор.');g.dice=[roll(),roll()];return;}
 if(cmd.type!=='choose')throw Error('Невідома дія.');
 const [a,b]=g.dice||[],{x,y}=cmd;
 if(!Number.isInteger(x)||!Number.isInteger(y)||!((x===a&&y===b)||(x===b&&y===a)))throw Error('Цей сектор не відповідає кубикам.');
 const i=(y-1)*6+x-1,p=g.players[id];let extra=a===b?1:0;
 let message=p.name+' обрав ('+x+','+y+'). ';
 if(g.board[i]===null){g.board[i]=id;p.tokens++;p.sectors++;message+='Чорну фішку забрано.';}
 else if(g.players.some(q=>q.id!==id&&q.position===i)){extra++;message+='Братерська підтримка: додатковий хід.';}
 else message+='Сектор уже звільнений.';
 if(a===b)message+=' Дубль: додатковий хід.';
 p.position=i;g.log.unshift(message);g.log=g.log.slice(0,30);g.dice=null;
 if(g.board.every(o=>o!==null)){finish(g);return;}
 g.extra+=extra;if(g.extra>0)g.extra--;else g.turn=(g.turn+1)%2;
}

export function botStep(g,id=1,roll=die,now=Date.now()){
 if(g.phase!=='playing')return false;
 if(g.offer!==null){if(g.offer!==id){act(g,id,{type:'accept'},roll);return true;}return false;}
 if(g.order[g.turn]!==id)return false;
 if(!g.dice){g.botPreview=null;act(g,id,{type:'roll'},roll);return true;}
 if(g.botPreview){
  if(now<g.botPreview.readyAt)return false;
  const {x,y}=g.botPreview,i=(y-1)*6+x-1,captured=g.board[i]===null;
  act(g,id,{type:'choose',x,y},roll);g.botPreview=null;g.lastBotMove={x,y,captured,message:g.log.find(l=>l.startsWith(g.players[id].name+' обрав'))||g.result};return true;
 }
 const [a,b]=g.dice,score=(x,y)=>{const i=(y-1)*6+x-1;return g.board[i]===null?2:g.players.some(p=>p.id!==id&&p.position===i)?1:0;};
 const x=score(a,b)>=score(b,a)?a:b,y=x===a?b:a;g.botPreview={x,y,readyAt:now+1200};return true;
}
