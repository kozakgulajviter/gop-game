(()=>{
 const game=document.querySelector('main.grid'),field=game.querySelector('section.card'),menu=game.querySelector('aside.card');
 document.body.classList.add('game-layout');field.classList.add('field-panel');menu.classList.add('menu-panel');
 menu.prepend(field.querySelector('.game-top'));
 function fold(node,title,open=false){const d=document.createElement('details'),s=document.createElement('summary');s.textContent=title;d.append(s,node);d.open=open;return d;}
 menu.querySelectorAll('details').forEach(d=>d.open=false);
 const log=menu.querySelector('.log');if(log){const h=log.previousElementSibling;if(h?.tagName==='H2')h.remove();menu.append(fold(log,'Історія ходів'));}
 const setup=document.querySelector('.setup');if(setup){const d=fold(setup,'Гравці та налаштування',true);menu.append(d);document.querySelector('#startBtn').addEventListener('click',()=>d.open=false);}
 const room=document.querySelector('#roomPanel'),status=document.querySelector('#netStatus');
 if(room){const d=fold(room,'Кімната та запрошення');
   // Keep the lobby usable until both players start; move the same controls, not copies.
   document.querySelector('#lobby').after(d);d.open=true;
   const update=()=>{document.body.classList.toggle('playing-layout',!game.hidden);if(!game.hidden&&d.parentElement!==menu){menu.append(d);menu.prepend(status);d.open=false;}};
   new MutationObserver(update).observe(game,{attributes:true,attributeFilter:['hidden']});update();
 }else document.body.classList.add('playing-layout');
})();
