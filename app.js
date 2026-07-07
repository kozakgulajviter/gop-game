(function(){
  const SIZE = 6;
  const STORAGE_KEY = 'gopGameHistoryV2';
  const FLAG_SRC = 'flag-corner.svg';
  const defaultNames = ['Козак','Захисник','Побратим','Вартовий'];
  const icons = ['С','В','К','Г'];
  let players = [];
  let board = [];
  let order = [];
  let currentOrderIndex = 0;
  let dice = null;
  let waitingChoice = false;
  let extraTurns = 0;
  let gameActive = false;
  let hoverChoice = null;

  const ui = {
    playersCount: document.getElementById('playersCount'),
    playerFields: document.getElementById('playerFields'),
    startBtn: document.getElementById('startBtn'),
    rollBtn: document.getElementById('rollBtn'),
    stopBtn: document.getElementById('stopBtn'),
    board: document.getElementById('board'),
    stats: document.getElementById('stats'),
    status: document.getElementById('status'),
    dieA: document.getElementById('dieA'),
    dieB: document.getElementById('dieB'),
    diceText: document.getElementById('diceText'),
    choices: document.getElementById('choices'),
    log: document.getElementById('log'),
    history: document.getElementById('history'),
    clearHistoryBtn: document.getElementById('clearHistoryBtn')
  };

  function rnd(n){ return Math.floor(Math.random() * n) + 1; }
  function coordToIndex(x,y){ return (y - 1) * SIZE + (x - 1); }
  function cellName(x,y){ return `(${x},${y})`; }
  function activePlayer(){ return players[order[currentOrderIndex]]; }
  function playerName(p){ return p && p.name ? p.name : `Гравець ${p.id + 1}`; }
  function setStatus(text){ ui.status.textContent = text; }
  function log(text){ const p = document.createElement('p'); p.textContent = text; ui.log.prepend(p); }
  function sectorColor(x,y){ if (x === y) return 'pink'; return ((x + y) % 2 === 0) ? 'blue' : 'yellow'; }
  function addTile(cls, text){ const el = document.createElement('div'); el.className = cls; if (text !== undefined) el.textContent = text; ui.board.appendChild(el); return el; }
  function addCorner(){ const el = addTile('tile corner-logo'); el.innerHTML = `<img class="flag-img" src="${FLAG_SRC}" alt="Прапор">`; }
  function isHoveredChoice(x,y){ return hoverChoice && hoverChoice.x === x && hoverChoice.y === y; }
  function setHoverChoice(x,y){ hoverChoice = {x,y}; renderBoard(); }
  function clearHoverChoice(){ hoverChoice = null; renderBoard(); }

  function playersOnCell(cellIndex){
    return players.filter(p => p.position === cellIndex);
  }

  function hoverChoiceClass(x,y,data,cellIndex){
    if(!isHoveredChoice(x,y)) return '';
    const p = activePlayer();
    const hasBrotherPiece = playersOnCell(cellIndex).some(other => p && other.id !== p.id);
    const isBrotherSector = p && data.owner !== null && data.owner !== p.id;
    if(data.owner === null) return 'choice-hover-red';
    if(isBrotherSector || hasBrotherPiece) return 'choice-hover-green';
    return 'choice-hover-white';
  }

  function addPlayerPieces(el, cellIndex){
    const here = playersOnCell(cellIndex);
    if(!here.length) return;
    if(here.length === 1){
      const piece = document.createElement('div');
      piece.className = `player-piece p${here[0].id + 1}`;
      piece.textContent = icons[here[0].id];
      el.appendChild(piece);
      return;
    }
    const stack = document.createElement('div');
    stack.className = `player-stack stack-${here.length}`;
    here.forEach(p => {
      const piece = document.createElement('div');
      piece.className = `player-piece stacked p${p.id + 1}`;
      piece.textContent = icons[p.id];
      stack.appendChild(piece);
    });
    el.appendChild(stack);
  }

  function renderPlayerInputs(){
    const count = Number(ui.playersCount.value);
    ui.playerFields.innerHTML = '';
    for(let i=0; i<count; i++){
      const label = document.createElement('label');
      label.className = 'name-field';
      label.innerHTML = `<span class="mini p${i+1}">${icons[i]}</span><b>Гравець ${i+1}</b>`;
      const input = document.createElement('input');
      input.id = `playerName${i}`;
      input.maxLength = 24;
      input.placeholder = defaultNames[i];
      input.value = localStorage.getItem(`gopName${i}`) || defaultNames[i];
      input.addEventListener('input', () => localStorage.setItem(`gopName${i}`, input.value.trim()));
      label.appendChild(input);
      ui.playerFields.appendChild(label);
    }
  }

  function initBoard(){
    board = Array.from({length: SIZE * SIZE}, () => ({owner: null, supporters: []}));
    renderBoard();
  }

  function startGame(){
    const count = Number(ui.playersCount.value);
    players = Array.from({length: count}, (_, i) => {
      const input = document.getElementById(`playerName${i}`);
      const name = (input && input.value.trim()) || defaultNames[i] || `Гравець ${i+1}`;
      return {id: i, name, tokens: 0, sectors: 0, orderRoll: 0, position: null};
    });
    board = Array.from({length: SIZE * SIZE}, () => ({owner: null, supporters: []}));
    players.forEach(p => { p.orderRoll = rnd(6) + rnd(6); });
    order = players.map(p => p.id).sort((a,b) => players[b].orderRoll - players[a].orderRoll || a-b);
    currentOrderIndex = 0; dice = null; waitingChoice = false; extraTurns = 0; gameActive = true; hoverChoice = null;
    ui.rollBtn.disabled = false; ui.stopBtn.disabled = false; ui.playersCount.disabled = true;
    ui.playerFields.querySelectorAll('input').forEach(i => i.disabled = true);
    ui.dieA.textContent = '–'; ui.dieB.textContent = '–'; ui.diceText.textContent = 'Кубики ще не кинуто';
    ui.choices.innerHTML = ''; ui.log.innerHTML = '';
    log(`Порядок ходу: ${order.map(id => `${playerName(players[id])} — ${players[id].orderRoll}`).join('; ')}.`);
    setStatus(`${playerName(activePlayer())}: кидай кубики.`);
    renderBoard(); renderStats();
  }

  function renderBoard(){
    ui.board.innerHTML = '';
    addCorner();
    for(let x=1; x<=SIZE; x++) addTile('tile edge', x);
    addCorner();
    for(let y=1; y<=SIZE; y++){
      addTile('tile edge', y);
      for(let x=1; x<=SIZE; x++){
        const i = coordToIndex(x,y);
        const data = board[i];
        const el = addTile(`tile cell ${sectorColor(x,y)}`);
        if(waitingChoice && dice && ((x === dice.a && y === dice.b) || (x === dice.b && y === dice.a))) el.className += ' choice';
        const hoverClass = hoverChoiceClass(x,y,data,i);
        if(hoverClass) el.className += ` ${hoverClass}`;
        const coord = document.createElement('div');
        coord.className = 'coord-main';
        coord.textContent = `${x}:${y}`;
        el.appendChild(coord);
        if(data.owner === null){
          const black = document.createElement('div');
          black.className = 'black-token';
          el.appendChild(black);
        }
        addPlayerPieces(el, i);
      }
      addTile('tile edge', y);
    }
    addCorner();
    for(let x=1; x<=SIZE; x++) addTile('tile edge', x);
    addCorner();
  }

  function renderStats(){
    ui.stats.innerHTML = '';
    if(!players.length){ ui.stats.innerHTML = '<div class="stat"><span class="name">Партію ще не почато</span><span class="pill">0</span></div>'; return; }
    players.forEach(p => {
      const div = document.createElement('div');
      div.className = 'stat' + (gameActive && activePlayer() && activePlayer().id === p.id ? ' turn' : '');
      const left = document.createElement('span');
      left.className = 'name';
      left.innerHTML = `<span class="mini p${p.id+1}">${icons[p.id]}</span> `;
      left.appendChild(document.createTextNode(playerName(p)));
      const right = document.createElement('span');
      right.className = 'score';
      right.textContent = p.tokens;
      const meta = document.createElement('span');
      meta.className = 'pill';
      const posText = p.position === null ? 'ще не ходив' : `позиція: ${cellName((p.position % SIZE) + 1, Math.floor(p.position / SIZE) + 1)}`;
      meta.textContent = `сектори: ${p.sectors}; ${posText}`;
      div.appendChild(left); div.appendChild(right); div.appendChild(meta);
      ui.stats.appendChild(div);
    });
  }

  function rollDice(){
    if(!gameActive) return;
    if(waitingChoice){ setStatus('Спочатку обери сектор за поточним кидком.'); return; }
    const a = rnd(6), b = rnd(6);
    dice = {a,b}; waitingChoice = true; hoverChoice = null;
    ui.dieA.textContent = a; ui.dieB.textContent = b;
    ui.diceText.textContent = a === b ? `Дубль ${a}:${b} — буде додатковий хід.` : `Обери сектор ${cellName(a,b)} або ${cellName(b,a)}.`;
    buildChoices(); renderBoard(); setStatus(`${playerName(activePlayer())}: обери сектор.`);
  }

  function buildChoices(){
    ui.choices.innerHTML = '';
    const pairs = [[dice.a,dice.b]];
    if(dice.a !== dice.b) pairs.push([dice.b,dice.a]);
    pairs.forEach(([x,y]) => {
      const b = document.createElement('button');
      b.className = 'btn primary';
      b.textContent = `Обрати сектор ${cellName(x,y)}`;
      b.addEventListener('mouseenter', () => setHoverChoice(x,y));
      b.addEventListener('mouseleave', clearHoverChoice);
      b.addEventListener('focus', () => setHoverChoice(x,y));
      b.addEventListener('blur', clearHoverChoice);
      b.addEventListener('click', () => chooseSector(x,y));
      ui.choices.appendChild(b);
    });
  }

  function chooseSector(x,y){
    if(!gameActive || !waitingChoice) return;
    const p = activePlayer();
    const i = coordToIndex(x,y), cell = board[i];
    let gainedExtra = dice.a === dice.b ? 1 : 0;
    let message = `${playerName(p)} переставив фішку на сектор ${cellName(x,y)}. `;
    if(cell.owner === null){
      cell.owner = p.id; p.tokens++; p.sectors++;
      message += 'Чорну фішку забрано, сектор звільнено.';
    } else if(cell.owner !== p.id){
      if(!cell.supporters.includes(p.id)) cell.supporters.push(p.id);
      gainedExtra++;
      message += `Це вже звільнений сектор гравця ${playerName(players[cell.owner])}. Братерська підтримка: додатковий хід.`;
    } else {
      message += 'Це вже власний звільнений сектор. Нова чорна фішка не нараховується.';
    }
    p.position = i;
    if(dice.a === dice.b) message += ' Козацька удача: дубль дає ще один хід.';
    log(message);
    waitingChoice = false; dice = null; hoverChoice = null; ui.choices.innerHTML = '';
    renderBoard(); renderStats();
    if(isBoardClear()){ finishGame('Усі 36 секторів звільнено. Гру завершено.'); return; }
    finishTurn(gainedExtra);
  }

  function finishTurn(gainedExtra){
    extraTurns += gainedExtra;
    if(extraTurns > 0){ extraTurns--; setStatus(`${playerName(activePlayer())}: додатковий хід. Кидай кубики.`); }
    else { currentOrderIndex = (currentOrderIndex + 1) % order.length; setStatus(`${playerName(activePlayer())}: твій хід. Кидай кубики.`); }
    ui.dieA.textContent = '–'; ui.dieB.textContent = '–'; ui.diceText.textContent = 'Кубики ще не кинуто';
    renderStats();
  }

  function isBoardClear(){ return board.every(c => c.owner !== null); }
  function remainingTokens(){ return board.filter(c => c.owner === null).length; }
  function stopEarly(){
    if(!gameActive) return;
    const rem = remainingTokens();
    if(rem > 0){
      for(let k=0; k<rem; k++){ const pid = order[(currentOrderIndex + k) % order.length]; players[pid].tokens++; }
      log(`Гру зупинено достроково. Залишок чорних фішок (${rem}) розподілено максимально рівно між гравцями.`);
    }
    finishGame('Гру завершено достроково.');
  }

  function finishGame(reason){
    gameActive = false; waitingChoice = false; hoverChoice = null; ui.rollBtn.disabled = true; ui.stopBtn.disabled = true; ui.playersCount.disabled = false;
    ui.playerFields.querySelectorAll('input').forEach(i => i.disabled = false); ui.choices.innerHTML = '';
    const max = Math.max(...players.map(p => p.tokens));
    const winners = players.filter(p => p.tokens === max).map(playerName).join(', ');
    setStatus(`${reason} Переможець: ${winners}. Результат: ${max} фішок.`);
    log(`Переможець: ${winners}. Найбільше фішок: ${max}.`);
    saveGameHistory({date: new Date().toLocaleString('uk-UA'), reason, winners, max, players: players.map(p => ({name: playerName(p), tokens: p.tokens, sectors: p.sectors}))});
    renderStats(); renderBoard(); renderHistory();
  }

  function loadHistory(){ try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch(e){ return []; } }
  function saveGameHistory(record){ const history = loadHistory(); history.unshift(record); localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0,10))); }
  function renderHistory(){
    const history = loadHistory(); ui.history.innerHTML = '';
    if(!history.length){ const empty = document.createElement('div'); empty.className = 'history-row'; empty.textContent = 'Історії ще немає.'; ui.history.appendChild(empty); return; }
    history.forEach(item => {
      const row = document.createElement('div'); row.className = 'history-row';
      const title = document.createElement('b'); title.textContent = `${item.date} — переможець: ${item.winners}`;
      const detail = document.createElement('span'); detail.className = 'small'; detail.textContent = item.players.map(p => `${p.name}: ${p.tokens}`).join(' • ');
      row.appendChild(title); row.appendChild(detail); ui.history.appendChild(row);
    });
  }
  function clearHistory(){ localStorage.removeItem(STORAGE_KEY); renderHistory(); }

  ui.playersCount.addEventListener('change', renderPlayerInputs);
  ui.startBtn.addEventListener('click', startGame);
  ui.rollBtn.addEventListener('click', rollDice);
  ui.stopBtn.addEventListener('click', stopEarly);
  ui.clearHistoryBtn.addEventListener('click', clearHistory);
  renderPlayerInputs(); initBoard(); renderStats(); renderHistory();
})();
