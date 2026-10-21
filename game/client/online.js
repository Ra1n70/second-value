(() => {
  'use strict';
  const E = window.SecondValue, Art = window.SecondValueArt, L = window.SecondValueOnlineLocale;
  const main = document.getElementById('online-game'), review = document.getElementById('online-review');
  const STORAGE = 'second-value-online-seat-v1';
  const money = value => Number(value || 0).toLocaleString('en-US');
  const signed = value => (value > 0 ? '+' : value < 0 ? '−' : '') + money(Math.abs(value || 0));
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const state = {credentials:null,view:null,error:'',transientError:false,connection:'Connecting…',busy:false,polling:false,selected:0,draftBid:'300',draftTurn:null,bidOpen:false,repairSlots:[],pairSlots:[],abilitySlots:[],saleMode:'ordinary',saleTurn:null,name:'',role:'restorer',theme:'harbor',roomCode:new URLSearchParams(location.search).get('room') || ''};
  let timer = null;
  let syncEpoch = 0;
  let pendingReview = null;
  function persist() {
    try {
      if (state.credentials) sessionStorage.setItem(STORAGE, JSON.stringify({...state.credentials,draftBid:state.draftBid,draftTurn:state.draftTurn,selected:state.selected,saleTurn:state.saleTurn,saleMode:state.saleMode,repairSlots:state.repairSlots,pairSlots:state.pairSlots,abilitySlots:state.abilitySlots}));
      else sessionStorage.removeItem(STORAGE);
    } catch { /* The live seat still works when tab storage is unavailable. */ }
  }
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE) || 'null');
    if (saved && typeof saved.code === 'string' && typeof saved.token === 'string' && typeof saved.playerId === 'string' && (!state.roomCode || state.roomCode.toUpperCase() === saved.code)) {
      state.credentials = {code:saved.code,token:saved.token,playerId:saved.playerId};
      if (typeof saved.draftBid === 'string') state.draftBid = saved.draftBid;
      if (typeof saved.draftTurn === 'string') state.draftTurn = saved.draftTurn;
      if (Number.isInteger(saved.selected)) state.selected = saved.selected;
      if (typeof saved.saleTurn === 'string') state.saleTurn = saved.saleTurn;
      state.saleMode = saved.saleMode === 'special' ? 'special' : 'ordinary';
      for (const key of ['repairSlots','pairSlots','abilitySlots']) state[key] = Array.isArray(saved[key]) ? saved[key].filter(slot => Number.isInteger(slot) && slot >= 0 && slot < 6) : [];
    }
  } catch { /* Start from the entrance if this tab has no usable saved seat. */ }
  function sprite(config) {
    if (!config) return '';
    const x = config.columns > 1 ? 100 * config.column / (config.columns - 1) : 0;
    const y = config.rows > 1 ? 100 * config.row / (config.rows - 1) : 0;
    return `<span class="sprite-image" aria-hidden="true" style="--sprite-aspect:${config.sheet === 'assets/catalog-lots-v1.png' ? 1.5 : 1};background-image:url('${config.sheet}');background-size:${config.columns * 100}% ${config.rows * 100}%;background-position:${x}% ${y}%"></span>`;
  }
  const art = lot => sprite(Art.visualFor(lot, lot.known));
  const userName = player => `<span data-user-text>${escape(player?.name || '—')}</span>`;
  const selfPlayer = () => state.view?.players.find(player => player.id === state.view.selfId);
  const playerById = id => state.view?.players.find(player => player.id === id);
  const letter = slot => String.fromCharCode(65 + slot);
  function setConnection(message) {
    const changed = state.connection !== message;
    state.connection = message;
    const element = document.getElementById('connection-status');
    element.textContent = L.translate(message);
    element.classList.toggle('is-disconnected', message !== 'Connected' && message !== 'MULTIPLAYER');
    if (changed && state.view) render();
  }
  function clearSeat() {
    syncEpoch++;
    clearTimeout(timer); timer = null;
    state.credentials = null; state.view = null; state.draftTurn = null; state.saleTurn = null;
    state.error = ''; state.transientError = false; state.busy = false; state.bidOpen = false; persist();
    if (review.open) review.close();
    setConnection('MULTIPLAYER'); render();
  }
  const request = (path, options = {}) => window.SecondValueRoomTransport.requestJSON(path, options);
  function authHeaders(credentials = state.credentials) { return {Authorization:`Bearer ${credentials.token}`}; }
  function acceptView(view) {
    if (!view || !state.credentials || view.code !== state.credentials.code) return;
    if (state.view && view.revision < state.view.revision) return;
    const previous = state.view;
    if (state.draftTurn !== view.turnId) {
      state.draftTurn = view.turnId;
      state.draftBid = String(Math.min(300, view.self.cash));
      state.bidOpen = false;
    }
    if (state.saleTurn !== `${view.auctionNumber}:${view.phase}` && view.phase === 'dispose') {
      state.saleTurn = `${view.auctionNumber}:${view.phase}`;
      state.saleMode = view.self.role === 'appraiser' ? 'ordinary' : 'special';
      state.repairSlots = []; state.pairSlots = []; state.abilitySlots = [];
    }
    if (!view.lots.some(lot => lot.slot === state.selected)) state.selected = view.lots[0]?.slot || 0;
    state.view = view;
    if (view.phase !== 'auction' && pendingReview && ['bid','withdraw'].includes(pendingReview.type) && review.open) review.close();
    persist();
    if (JSON.stringify(previous) !== JSON.stringify(view)) render();
  }
  function handleError(error, fromPoll = false) {
    if (error.status === 401 || error.status === 404) {
      clearSeat(); state.error = 'This room is no longer available. Return to the room entrance to join again.'; render(); return;
    }
    if (fromPoll) {
      if (!state.view) { state.error = 'Connection lost. Retrying automatically; your seat is saved.'; state.transientError = true; }
      if (review.open) review.close();
      setConnection('Reconnecting…');
      render();
    } else if (error.network || error.status >= 500) {
      state.error = 'The request may have reached the room. Reconnecting to check its latest state.';
      state.transientError = true;
      if (review.open) review.close();
      setConnection('Reconnecting…'); render();
    } else { state.error = error.message; state.transientError = false; render(); }
  }
  async function poll() {
    clearTimeout(timer); timer = null;
    if (!state.credentials) return;
    if (state.polling || state.busy) { timer = setTimeout(poll, 1000); return; }
    state.polling = true;
    const credentials = state.credentials;
    const epoch = syncEpoch;
    try {
      const payload = await request(`/api/rooms/${encodeURIComponent(credentials.code)}`, {headers:authHeaders(credentials)});
      if (state.credentials?.token !== credentials.token || epoch !== syncEpoch) return;
      if (state.transientError) { state.error = ''; state.transientError = false; }
      setConnection('Connected'); acceptView(payload.view);
    } catch (error) { if (state.credentials?.token === credentials.token && epoch === syncEpoch) handleError(error, true); }
    finally { state.polling = false; if (state.credentials) timer = setTimeout(poll, 1000); }
  }
  async function command(type, fields = {}) {
    if (state.busy || !state.credentials || !state.view) return;
    if (state.connection !== 'Connected') { poll(); return; }
    syncEpoch++;
    state.busy = true; state.error = ''; state.transientError = false; render();
    const credentials = state.credentials;
    let refreshNeeded = false;
    try {
      const payload = await request(`/api/rooms/${encodeURIComponent(credentials.code)}/actions`, {method:'POST',headers:authHeaders(credentials),body:JSON.stringify({requestId:crypto.randomUUID(),command:{type,turnId:state.view.turnId,...fields}})});
      if (state.credentials?.token !== credentials.token) return;
      if (payload.left) { clearSeat(); return; }
      setConnection('Connected'); acceptView(payload.view);
    } catch (error) { if (state.credentials?.token === credentials.token) { refreshNeeded = true; handleError(error); } }
    finally { state.busy = false; render(); if (state.credentials) { clearTimeout(timer); timer = setTimeout(poll, refreshNeeded ? 0 : 1000); } }
  }
  async function enter(join) {
    if (state.busy) return;
    const name = (main.querySelector('#online-name')?.value.trim() || '').normalize('NFKC');
    const code = main.querySelector('#online-room-code')?.value.trim().toUpperCase() || '';
    state.name = name; state.roomCode = code;
    if (!name) { state.error = 'Please enter your nickname.'; render(); return; }
    if ([...name].length > 20 || /[\p{Cc}\p{Cf}]/u.test(name)) { state.error = 'Enter a name from 1 to 20 characters.'; render(); return; }
    if (join && !code) { state.error = 'Please enter a room code.'; render(); return; }
    state.busy = true; state.error = ''; render();
    try {
      const payload = await request(join ? `/api/rooms/${encodeURIComponent(code)}/join` : '/api/rooms', {method:'POST',body:JSON.stringify({name,role:state.role,theme:state.theme})});
      state.credentials = {code:payload.roomCode,playerId:payload.playerId,token:payload.token};
      state.draftTurn = null; state.view = null; setConnection('Connected'); acceptView(payload.view);
      const url = new URL(location.href); url.searchParams.set('room', payload.roomCode); history.replaceState(null, '', url);
      persist();
    } catch (error) { state.error = error.message; }
    finally { state.busy = false; render(); if (state.credentials) poll(); }
  }
  function entry() {
    return `<section class="online-entry"><div><span class="eyebrow">SHARE A TABLE</span><h1><span>Your friends.</span><br><span>Their secret bids.</span></h1><p>Invite your crew to the Old Harbor. One shared crate, different talents, and a reason to think twice before raising your paddle.</p><div class="entry-badges"><span>2–4 players</span><span>Room code</span><span>No chat required</span></div></div><section class="online-paper"><h2>Take a seat</h2><p class="small">Create a table, or join your friends.</p><form class="online-form" id="online-entry-form"><label for="online-name">Your nickname<input id="online-name" name="nickname" autocomplete="nickname" maxlength="40" value="${escape(state.name)}" placeholder="e.g. SilverFox" required></label><button type="button" class="primary" id="online-create">Create a room</button><span class="entry-divider">or join a room</span><label for="online-room-code">Room code</label><div class="online-join-row"><input id="online-room-code" name="room" maxlength="8" value="${escape(state.roomCode)}" placeholder="Enter room code" aria-label="Room code" autocomplete="off" autocapitalize="characters" spellcheck="false"><button type="submit">Join room</button></div><small>Your name stays visible at this table. No account needed.</small></form></section></section>`;
  }
  function toolbar(inGame = false) {
    const view = state.view;
    return `<div class="online-room-toolbar ${inGame ? 'in-game-toolbar' : ''}"><div class="online-room-heading"><span class="eyebrow">Room</span><strong class="online-room-code" data-no-localize>${escape(view.code)}</strong><span class="small muted">${view.players.filter(player => player.active).length} / 4 players</span></div><div class="toolbar-actions"><button type="button" id="online-copy">Copy invite</button>${view.can.leave ? '<button type="button" class="text-button" id="online-leave">Leave room</button>' : ''}</div></div>`;
  }
  function lobby() {
    const view = state.view, me = selfPlayer();
    return `${toolbar()}<section class="online-lobby"><div class="online-lobby-layout"><div><h2>Choose your edge</h2><p class="lobby-intro">Your role stays locked for the session. Other players may choose the same role.</p>${(view.rulesVersion ?? 2) >= 3 ? '<p class="role-roster-label">Six roles. One shared auction.</p>' : ''}<div class="role-grid expanded-roles">${Object.entries(E.ROLES).filter(([id]) => (view.rulesVersion ?? 2) >= 3 || ['restorer','collector','appraiser'].includes(id)).map(([id, role]) => `<button type="button" class="role-card" data-online-role="${id}" aria-pressed="${me.role === id}" aria-label="Choose ${role.short}"><span class="role-heading"><span class="role-portrait">${sprite(Art.portraitFor(id))}</span><h3>${role.short}</h3></span><p class="gold">${role.tagline}</p><span class="skill"><strong>${role.skill}</strong><span>${role.passive}</span></span><p class="risk">${role.risk}</p></button>`).join('')}</div>${me.role === 'collector' ? `<fieldset class="theme-picker"><legend>Choose a collection theme</legend><p class="small muted">The theme stays locked for the session.</p><div class="theme-options">${Object.entries(E.THEMES).map(([id,name]) => `<button type="button" data-online-theme="${id}" aria-pressed="${me.theme === id}">${name}</button>`).join('')}</div></fieldset>` : ''}</div><aside class="online-lobby-side"><section class="online-paper"><h3>At this table</h3>${view.players.filter(player => player.active).map(player => `<div class="online-lobby-player"><span class="role-portrait">${sprite(Art.portraitFor(player.role))}</span><div class="player-copy"><strong>${userName(player)}${player.id === view.selfId ? ' <span class="small">· <span>You</span></span>' : ''}</strong><small><span>${E.ROLES[player.role].short}</span>${player.id === view.hostId ? ' · <span>Host</span>' : ''}</small><small>${player.ready ? 'Ready' : 'Not ready'}</small></div><span class="player-presence ${player.connected ? '' : 'is-offline'}" aria-label="${player.connected ? 'Online' : 'Offline'}"></span></div>`).join('')}${view.players.filter(player => player.active).length < 2 ? '<p class="online-lobby-empty">Waiting for another player…</p>' : ''}<button type="button" id="online-ready" class="${me.ready ? 'secondary' : 'primary'}">${me.ready ? 'Change my choice' : 'Ready to play'}</button>${view.hostId === view.selfId ? `<button type="button" class="primary" id="online-start" ${view.can.start ? '' : 'disabled'}>Start auction</button><p class="host-note">You need at least two players, and everyone must be ready.</p>` : '<p class="host-note">The host starts when everyone is ready.</p>'}</section></aside></div></section>`;
  }
  function seats() {
    const view = state.view, revealed = view.phase !== 'auction', last = view.history.at(-1), players = view.players.filter(player => player.active);
    return `<section class="bidder-seats" aria-label="At the table" style="--seat-count:${players.length}">${players.map((player,index) => {
      const bid = revealed ? last?.bids.find(entry => entry.id === player.id) : null;
      const status = !player.connected ? 'Disconnected' : view.phase === 'result' ? (player.ready ? 'Ready for next crate' : 'Not ready') : view.phase === 'ended' ? 'Session finished' : view.phase === 'dispose' ? (player.id === view.winnerId ? 'Settling the crate' : 'Waiting for settlement') : revealed && bid ? (bid.bid > 0 ? money(bid.bid) : 'Passed') : player.submitted ? 'Submitted' : 'Deciding';
      return `<div class="bidder-seat ${player.id === view.selfId ? 'is-self' : ''} ${view.winnerId === player.id ? 'is-winner' : ''} ${player.connected ? '' : 'is-offline'}"><span class="seat-portrait">${sprite(Art.portraitFor(player.role,player.id === view.selfId))}</span><div class="seat-info"><div class="seat-name"><strong>${userName(player)}${player.id === view.selfId ? ' <span class="small">· <span>You</span></span>' : ''}</strong><small><span>${E.ROLES[player.role].short}</span> · ${money(player.cash)}</small></div><span class="seat-status ${player.submitted && !revealed ? 'is-submitted' : ''}">${status}</span></div><span class="bid-paddle" aria-hidden="true">${index+1}</span></div>`;
    }).join('')}</section>`;
  }
  function status() {
    const view = state.view, me = selfPlayer();
    const stages = {auction:'Review clues','round-summary':'Bids revealed',dispose:'Sell your crate',result:'Crate settled',ended:'Session finished'};
    return `<div class="online-room-status"><div><strong>Auction ${view.auctionNumber}</strong><span class="small muted">Round ${view.round} / 3</span><span class="small"><span>Your cash</span> <strong class="cash-value">${money(view.self.cash)}</strong></span><span class="small"><span>Cash change</span> <strong class="${me.profit < 0 ? 'negative' : 'positive'}">${signed(me.profit)}</strong></span></div><span class="small gold">${stages[view.phase]}</span></div>`;
  }
  function manifest() {
    const view = state.view;
    if (view.round === 1) return '<span>Six covered objects. Only their silhouettes are confirmed.</span>';
    return `<span>Genuine objects: ${view.public.genuineCount} / 6.</span>${view.public.repairableCount !== null ? `<br><span>Repairable objects: ${view.public.repairableCount}.</span>` : ''}`;
  }
  function attributes(lot) {
    return `<span>${lot.genuine ? 'Genuine' : 'Reproduction'}</span> · <span>${({intact:'Intact',damaged:'Damaged',unrepairable:'Unrepairable'})[lot.condition]}</span> · <span>${lot.category}</span> · <span>${E.THEMES[lot.theme] || 'No collection theme'}</span>${lot.repair ? `<br><span>Workshop fee</span> ${money(lot.repair.cost)} · <span>Restored sale price</span> ${money(lot.repair.sale)}` : ''}`;
  }
  function cards() {
    return state.view.lots.map(lot => `<button type="button" class="object-button ${lot.known ? 'object-known' : ''}" data-online-lot="${lot.slot}" aria-label="Select object ${lot.slot+1}" aria-controls="online-selected-object" aria-pressed="${state.selected === lot.slot}"><span class="object-head"><span class="object-letter">${letter(lot.slot)}</span><span class="object-status ${lot.source === 'Public reveal' ? 'public-status' : ''}">${lot.source}</span></span><span class="object-art" aria-hidden="true">${art(lot)}${lot.known ? `<span class="authenticity-stamp ${lot.genuine ? 'is-genuine' : 'is-reproduction'}">${lot.genuine ? 'Genuine' : 'Reproduction'}</span>` : ''}</span><span class="object-label">${lot.known ? lot.name : E.SHAPES[lot.shape]}</span><span class="object-range"><span>${lot.known ? 'Base price' : 'Catalog range'}</span><span>${lot.known ? lot.base : lot.range.min+'–'+lot.range.max}</span></span></button>`).join('');
  }
  function dossier() {
    const lot = state.view.lots.find(item => item.slot === state.selected);
    if (!lot) return '';
    return `<section class="object-detail ${lot.known ? 'detail-known' : ''}" id="online-selected-object" aria-labelledby="online-object-title"><div class="detail-heading"><span class="detail-letter">${letter(lot.slot)}</span><div><span class="eyebrow">SELECTED OBJECT</span><h3 id="online-object-title">${lot.known ? lot.name : E.SHAPES[lot.shape]}</h3></div></div><div class="detail-body"><div class="detail-visual" aria-hidden="true">${art(lot)}${lot.known ? `<span class="authenticity-stamp ${lot.genuine ? 'is-genuine' : 'is-reproduction'}">${lot.genuine ? 'Genuine' : 'Reproduction'}</span>` : ''}</div><div><span class="detail-badge">${lot.source}</span><dl class="detail-facts"><div><dt>${lot.known ? 'Base price' : 'Catalog range'}</dt><dd>${lot.known ? money(lot.base) : lot.range.min+'–'+lot.range.max}</dd></div><div><dt>${lot.known ? 'Authenticity' : 'Identity'}</dt><dd>${lot.known ? lot.genuine ? 'Genuine' : 'Reproduction' : 'Unconfirmed'}</dd></div></dl></div></div>${lot.known ? `<details class="detail-extra"><summary>Condition & ability details</summary><p>${attributes(lot)}</p></details>` : `<p class="detail-explanation">Only the silhouette is confirmed. Exact identity, condition and value remain hidden.</p><details class="detail-catalog"><summary>Possible catalog matches</summary>${E.catalogItems(state.view.rulesVersion ?? 2).filter(item => item.shape === lot.shape).map(item => `<div><span>${item.name}</span><strong>${item.base}</strong></div>`).join('')}<p class="small muted">These are possibilities, not a confirmed identity.</p></details>`}<div class="detail-manifest"><span class="eyebrow">Auctioneer’s manifest</span><p>${manifest()}</p></div></section>`;
  }
  function dock() {
    const view = state.view, lot = view.lots.find(item => item.slot === state.selected);
    const submitted = view.self.submitted;
    if (submitted) return `<section class="online-dock is-submitted" aria-label="Your auction controls"><div class="dock-context"><span class="eyebrow">${view.self.bid?.pass ? 'Your pass is sealed' : 'Your bid is sealed'}</span><strong class="pending-bid">${view.self.bid?.pass ? 'PASS' : money(view.self.bid?.amount)}</strong><span class="small">One bid for all six objects.</span></div><div class="dock-skill">${waitingFor(view.players.filter(player => player.active && !player.submitted))}<p>The last submission reveals all bids immediately.</p></div><button type="button" id="online-withdraw" ${view.can.withdraw ? '' : 'disabled'}>Withdraw & edit</button></section>`;
    if (!state.bidOpen) return `<section class="online-dock" aria-label="Your auction controls"><div class="dock-context"><span class="eyebrow">YOUR AUCTION DESK</span><strong>Inspecting object ${letter(state.selected)}</strong><span class="small">One bid for all six objects.</span></div><div class="dock-skill">${view.self.role === 'appraiser' ? `<button type="button" class="skill-button" id="online-inspect" ${!view.can.inspect || lot?.known ? 'disabled' : ''}><span>Authenticate</span><span>${view.self.inspectionsLeft} / 2 inspections left</span></button><p>${lot?.known ? 'Information already confirmed' : 'Choose an object, then authenticate it. Two uses for this entire crate.'}</p>` : `<strong>${E.ROLES[view.self.role].skill}</strong><p>Available after winning</p>`}</div><div class="dock-primary"><button type="button" class="primary" id="online-open-bid">Prepare a bid →</button><small>All players must submit before bids reveal.</small></div></section>`;
    const cash = view.self.cash, amount = Number(state.draftBid), valid = Number.isSafeInteger(amount) && amount > 0 && amount <= cash;
    return `<section class="online-dock" aria-label="Your auction controls"><button type="button" class="back-button" id="online-back-clues">← Return to clues</button><form id="online-bid-form" class="online-bid-editor" novalidate><div class="bid-editor"><label for="online-bid-input">Your sealed bid</label><div class="amount-input"><button type="button" id="online-bid-decrease" aria-label="Decrease bid by 25" ${cash < 1 ? 'disabled' : ''}>−</button><input type="number" id="online-bid-input" min="1" max="${Math.max(1,cash)}" step="1" inputmode="numeric" value="${escape(state.draftBid)}" ${cash < 1 ? 'disabled' : ''} aria-describedby="online-bid-limit"><button type="button" id="online-bid-increase" aria-label="Increase bid by 25" ${cash < 1 ? 'disabled' : ''}>+</button></div><input type="range" id="online-bid-range" min="1" max="${Math.max(1,cash)}" step="1" value="${Math.max(1,Math.min(cash,amount || 1))}" aria-label="Adjust bid" ${cash < 1 ? 'disabled' : ''}></div><div class="dock-balance"><span class="small">Cash after purchase</span><strong id="online-bid-balance">${valid ? money(cash-amount) : '—'}</strong><small id="online-bid-limit">Your bid limit: ${money(cash)}.</small></div><div class="bid-actions"><button type="button" id="online-pass">Pass this round</button><button type="submit" class="primary" ${cash < 1 ? 'disabled' : ''}>Review bid →</button></div></form></section>`;
  }
  function references() {
    const view = state.view;
    return `<div class="online-reference"><details><summary>Round rules</summary><p>${view.round === 1 ? 'Early sale needs at least 1.8× the runner-up bid.' : view.round === 2 ? 'Early sale needs at least 1.3× the runner-up bid.' : 'Final round: the highest bid wins. Ties follow the published priority.'}</p><p>Tie priority</p><div class="priority-list">${view.priority.map(id => userName(playerById(id))).join('<span>→</span>')}</div></details>${view.history.length ? `<details><summary>Public bid history</summary>${historyTable()}</details>` : ''}<details><summary>Your role ability</summary><p>${E.ROLES[view.self.role].passive}</p></details><details><summary>Public catalog · possible identities and prices</summary>${[...new Set(view.lots.map(lot => lot.shape))].map(shape => `<p><strong>${E.SHAPES[shape]}</strong></p>${E.catalogItems(view.rulesVersion ?? 2).filter(item => item.shape === shape).map(item => `<div class="catalog-definition"><span>${item.name}</span><span>${item.base} base</span><small>${attributes(item)}</small></div>`).join('')}`).join('')}<p>These are possibilities, not a confirmed identity.</p></details></div>`;
  }
  function auction() {
    const view = state.view;
    const next = view.round === 1 ? 'If no sale: next round reveals the genuine count.' : view.round === 2 ? 'If no sale: next round reveals one identity and the repairable count.' : 'Final round: the highest bid wins. Ties follow the published priority.';
    return `<div class="workbench-head"><div><h2 class="lot-title">Shared auction table</h2><span class="round-preview">${next}</span></div><span class="tag">${view.players.filter(player => player.submitted).length} / ${view.players.filter(player => player.active).length} submitted</span></div><div class="workbench-grid"><section class="auction-table-column"><div class="crate"><div class="crate-top"><span>One crate / six objects</span><span>Choose an object to see its details.</span></div><div class="objects">${cards()}</div><a class="mobile-detail-link" href="#online-selected-object">Selected object details ↓</a></div></section><aside class="workbench-sidebar">${dossier()}</aside></div>${dock()}${references()}`;
  }
  function historyTable() {
    const view = state.view, players = view.players;
    return `<table class="online-bid-history"><thead><tr><th>Round</th>${players.map(player => `<th>${userName(player)}</th>`).join('')}</tr></thead><tbody>${view.history.map(round => `<tr><td>${round.round} / 3</td>${players.map(player => { const bid = round.bids.find(entry => entry.id === player.id); return `<td>${bid?.bid ? money(bid.bid) : '—'}</td>`; }).join('')}</tr>`).join('')}</tbody></table>`;
  }
  function roundSummary() {
    const view = state.view, last = view.history.at(-1);
    return `<div class="online-reveal"><section class="reveal-main"><span class="eyebrow">Bids revealed</span><h2>No hammer. Not yet.</h2><p class="reveal-description">This round did not sell. All cash stays unchanged.</p>${historyTable()}<p class="small muted">Leading bid: ${money(last?.highest)}.</p><p class="small muted">Runner-up: ${money(last?.second)}.</p><p class="small muted">Required for early sale: ${money(last?.required)}.</p></section><aside class="online-paper"><h3>Waiting for the next round</h3><p class="small">${view.round === 1 ? 'If no sale: next round reveals the genuine count.' : 'If no sale: next round reveals one identity and the repairable count.'}</p>${view.selfId === view.hostId ? `<button type="button" class="primary" id="online-next" ${view.can.next ? '' : 'disabled'}>Open next round</button>` : '<p class="small">The host opens the next round.</p>'}</aside></div>`;
  }
  function truth() {
    return `<div class="online-truth-grid">${state.view.lots.map(lot => `<article class="online-truth-card"><div class="truth-art" aria-hidden="true">${art(lot)}</div><span class="eyebrow">Object ${letter(lot.slot)}</span><h3>${lot.name}</h3><p>${attributes(lot)}</p><strong><span>Base price</span> ${money(lot.base)}</strong></article>`).join('')}</div>`;
  }
  function plan() {
    const view = state.view;
    const options = {theme:view.self.theme};
    if (view.self.role === 'restorer') options.repairIds = state.repairSlots.map(slot => view.lots.find(lot => lot.slot === slot).id);
    if (view.self.role === 'collector') options.pairIds = state.pairSlots.map(slot => view.lots.find(lot => lot.slot === slot).id);
    if (['salvager','curator','broker'].includes(view.self.role)) options.abilityIds = state.abilitySlots.map(slot => view.lots.find(lot => lot.slot === slot).id);
    return E.salePlan(view.self.role, view.lots, state.saleMode, view.self.cash, options);
  }
  function receiptMarkup(receipt, preview = false) {
    const paid = receipt.paid ?? state.view.winningBid ?? 0;
    const profit = receipt.profit ?? receipt.recovery - paid;
    const cash = receipt.cash ?? state.view.self.cash + receipt.recovery;
    const abilitySelection = receipt.ability?.length ? `<p class="processing-receipt"><span>Ability selection:</span>${receipt.ability.map(value => { const lot = state.view.lots.find(item => item.id === value || item.slot === value); return lot ? `<span style="display:block">${escape(lot.name)}</span>` : ''; }).join('')}</p>` : '';
    return `<h3>${preview ? 'Sale preview' : 'Your settlement'}</h3><div class="receipt-line"><span>Winning bid</span><strong>−${money(paid)}</strong></div><div class="receipt-line"><span>Sale proceeds</span><strong>${money(receipt.sale)}</strong></div><div class="receipt-line"><span>Ability bonus</span><strong>${money(receipt.bonus)}</strong></div><div class="receipt-line"><span>Processing fees</span><strong>−${money(receipt.cost)}</strong></div>${abilitySelection}<div class="receipt-profit"><span>${profit < 0 ? 'Crate loss' : 'Crate profit'}</span><strong class="${profit < 0 ? 'negative' : 'positive'}">${signed(profit)}</strong></div><div class="receipt-line"><span>Cash after sale</span><strong>${money(cash)}</strong></div>`;
  }
  function processingKey() {
    return state.view.self.role === 'restorer' ? 'repairSlots' : state.view.self.role === 'collector' ? 'pairSlots' : 'abilitySlots';
  }
  function abilityInstruction() {
    return ({restorer:'Choose up to two repairs.',collector:'Choose two objects for one matching pair.',salvager:'Choose up to two reproductions. Each sells for 90, with a 15 processing fee.',curator:'Choose exactly three genuine, intact objects from different categories. Pay one 25 fee.',broker:'Choose one genuine, intact object. Packing and delivery cost 25; a low-value customer sale can lose money.'})[state.view.self.role] || '';
  }
  function processingSelection() {
    const view = state.view, role = view.self.role, selected = state[processingKey()];
    const candidates = view.lots.filter(lot => role === 'restorer' ? lot.genuine && lot.condition === 'damaged' && lot.repair && lot.repair.sale-lot.repair.cost-lot.base > 0 : role === 'collector' ? lot.genuine && lot.theme === view.self.theme : E.abilityEligibility(role,lot));
    const limit = E.abilitySelectionLimit(role);
    const hint = lot => role === 'restorer' ? `Repair fee ${money(lot.repair.cost)} · sale ${money(lot.repair.sale)} · gain +${money(lot.repair.sale-lot.repair.cost-lot.base)}` : role === 'collector' ? attributes(lot) : role === 'salvager' ? `<span>Parts sale price</span> 90 · <span>Parts fee</span> 15 · <span>Net parts gain</span> <strong class="${75-lot.base < 0 ? 'negative' : 'positive'}">${signed(75-lot.base)}</strong>` : role === 'curator' ? `<span>${lot.category}</span> · <span>Exhibition bonus</span> +${Math.min(40,Math.floor(lot.base/5))}` : `<span>Customer premium</span> +${Math.min(90,Math.floor(lot.base*.3))} · <span>Packing &amp; delivery</span> 25 · <span>Net gain vs ordinary sale</span> <strong class="${Math.min(90,Math.floor(lot.base*.3))-25 < 0 ? 'negative' : 'positive'}">${signed(Math.min(90,Math.floor(lot.base*.3))-25)}</strong>`;
    return `<section class="processing-selection"><h3>${E.ROLES[role].skill}</h3><p class="small muted">${abilityInstruction()}</p>${role === 'curator' ? '<p class="small muted">Exhibition bonus: 20% per object, rounded down, up to 40 each.</p>' : role === 'broker' ? '<p class="small muted">Customer premium: 30% of base price, rounded down, up to 90.</p>' : ''}<p class="selection-count"><span>${selected.length} / ${limit}</span> <span>selected</span></p>${candidates.map(lot => `<label class="online-sale-option ${selected.includes(lot.slot) ? 'is-selected' : ''}"><input type="checkbox" data-online-processing="${lot.slot}" ${selected.includes(lot.slot) ? 'checked' : ''} ${selected.length >= limit && !selected.includes(lot.slot) ? 'disabled' : ''}><span><strong><span>Object ${letter(lot.slot)}</span> · <span>${lot.name}</span></strong><small>${hint(lot)}</small></span></label>`).join('')}${!candidates.length ? '<p class="small muted">No eligible objects for this ability. Sell at ordinary prices.</p>' : ''}${!selected.length ? '<p class="small muted">No objects selected. Ordinary sale applies with no ability fee.</p>' : ''}<p class="small muted">Unselected objects fund fees first; selected objects cannot fund their own processing.</p><p class="small muted">Nothing is selected automatically. Compare the net gain before confirming.</p></section>`;
  }
  function disposal() {
    const view = state.view, isWinner = view.winnerId === view.selfId;
    let planValue = null, selectionError = '';
    if (isWinner) { try { planValue = plan(); } catch (error) { selectionError = error.message; } }
    const ordinary = isWinner ? E.salePlan(view.self.role,view.lots,'ordinary',view.self.cash) : null;
    const delta = planValue ? planValue.recovery-ordinary.recovery : 0;
    const comparison = planValue ? `<div class="ability-net"><span>Net gain vs ordinary sale</span><strong class="${delta < 0 ? 'negative' : 'positive'}">${signed(delta)}</strong></div>` : '';
    return `<div class="online-reveal"><section class="reveal-main"><span class="eyebrow">${isWinner ? 'Won the crate' : 'Waiting for settlement'}</span><h2>${userName(playerById(view.winnerId))} <span>Won the crate</span></h2><p class="reveal-description">Everyone can now see the crate’s identities.</p>${truth()}${isWinner ? `<div class="online-sale-controls"><button type="button" data-online-sale="ordinary" aria-pressed="${state.saleMode === 'ordinary'}">Sell at ordinary prices</button>${view.self.role !== 'appraiser' ? `<button type="button" data-online-sale="special" aria-pressed="${state.saleMode === 'special'}">Use my role ability</button>` : '<p class="small muted">Your role uses ordinary sale prices.</p>'}</div>${state.saleMode === 'special' && view.self.role !== 'appraiser' ? processingSelection() : ''}` : '<p class="online-wait-copy" style="margin-top:22px">The winner is choosing how to sell.</p>'}</section><aside class="online-paper">${isWinner ? planValue ? receiptMarkup(planValue,true)+comparison : `<h3>Your sale plan</h3><p class="error">${escape(L.translate(selectionError))}</p>` : `<h3>Waiting for the winner</h3><p class="small">The winner is choosing how to sell.</p><p class="small" style="margin-top:14px"><span>Winning bid</span> <strong>${money(view.winningBid)}</strong></p>`}${isWinner ? `<button type="button" class="primary" id="online-sell" ${!view.can.sell || !planValue ? 'disabled' : ''}>Settle this crate</button>` : ''}</aside></div>${references()}`;
  }
  function scoreboard() {
    const view = state.view, ranking = [...view.players].sort((a,b) => b.cash-a.cash);
    return `<div class="online-scoreboard">${ranking.map((player,index) => `<div class="online-score ${player.id === view.selfId ? 'is-self' : ''}"><span class="score-place">${index > 0 && player.cash === ranking[index-1].cash ? ranking.findIndex(p => p.cash === player.cash)+1 : index+1}</span><div class="score-name"><strong>${userName(player)}${player.id === view.selfId ? ' <span class="small">· <span>You</span></span>' : ''}</strong><small><span>${E.ROLES[player.role].short}</span>${view.phase !== 'ended' ? ` · <span>${player.ready ? 'Ready for next crate' : 'Not ready'}</span>` : ''}</small></div><strong class="score-money">${money(player.cash)}<small class="${player.profit < 0 ? 'negative' : 'positive'}">${signed(player.profit)}</small></strong></div>`).join('')}</div>`;
  }
  function waitingFor(players) {
    if (!players.length) return '<p class="online-ready-message">Everyone is ready.</p>';
    return `<div class="online-waiting"><span>Waiting for</span>${players.map(player => `<span class="online-wait-chip ${player.connected ? '' : 'is-offline'}" title="${escape(player.name)}" data-user-text>${escape(player.name)}</span>`).join('')}</div>`;
  }
  function sessionLedger() {
    const view = state.view;
    if (!view.ledger.length) return '';
    let previousCash = E.STARTING_CASH;
    const entries = view.ledger.map(entry => {
      const player = entry.players.find(candidate => candidate.id === view.selfId);
      const cash = player?.cash ?? previousCash, change = cash - previousCash;
      previousCash = cash;
      const buyer = entry.players.find(candidate => candidate.id === entry.winnerId);
      return `<article class="online-ledger-entry"><div class="online-ledger-heading"><strong>Auction ${entry.auctionNumber}</strong><span>${buyer ? userName(buyer) : '<span>No sale</span>'}</span><span><span>Hammer price</span> ${money(entry.paid)}</span></div><div class="online-ledger-totals"><span><span>Your crate change</span> <strong class="${change < 0 ? 'negative' : 'positive'}">${signed(change)}</strong></span><span><span>Cash after sale</span> <strong>${money(cash)}</strong></span></div></article>`;
    });
    return `<details class="online-reference online-session-ledger" id="online-session-ledger"><summary><span>Session ledger</span> · ${view.ledger.length}</summary><p class="small muted">Newest crate first. Changes are for each crate, not the whole session.</p><div class="online-ledger-list">${entries.reverse().join('')}</div></details>`;
  }
  function result() {
    const view = state.view, me = selfPlayer(), ended = view.phase === 'ended';
    return `<div class="online-reveal"><section class="reveal-main"><span class="eyebrow">${ended ? 'Session finished' : 'Crate settled'}</span><h2>${ended ? 'Final standings' : 'Crate settled'}</h2><p class="reveal-description">${ended ? 'Ranked by current cash.' : 'You can leave after this settled crate.'}</p>${scoreboard()}${sessionLedger()}${view.history.length ? `<details class="online-reference"><summary>Public bid history</summary>${historyTable()}</details>` : ''}</section><aside class="online-paper">${view.receipt && view.winnerId === view.selfId ? receiptMarkup(view.receipt) : `<h3>${ended ? 'Session finished' : 'Your next move'}</h3><p class="small"><span>Your cash</span> <strong>${money(view.self.cash)}</strong></p><p class="small"><span>Cash change</span> <strong>${signed(me.profit)}</strong></p>`}${ended ? '<button type="button" class="primary" id="online-return">Return to rooms</button>' : `<button type="button" id="online-ready" class="${me.ready ? 'secondary' : 'primary'}" ${view.can.ready ? '' : 'disabled'}>${me.ready ? 'Change my choice' : 'Ready for another crate'}</button>${view.hostId === view.selfId ? `<button type="button" class="primary" id="online-continue" ${view.can.continue ? '' : 'disabled'}>Continue auction</button><button type="button" class="text-button" id="online-finish" ${view.can.finish ? '' : 'disabled'}>Finish session</button>` : ''}${waitingFor(view.players.filter(player => player.active && !player.ready))}<p class="small" style="margin-top:14px">Everyone must be ready before the host opens another crate.</p>`}</aside></div>`;
  }
  function render() {
    const ledgerOpen = Boolean(main.querySelector('#online-session-ledger')?.open);
    const active = document.activeElement;
    const focusId = main.contains(active) ? active.id : null;
    const selection = focusId && 'selectionStart' in active ? {start:active.selectionStart,end:active.selectionEnd} : null;
    const view = state.view;
    document.body.classList.toggle('tabletop-mode', Boolean(view && view.phase !== 'lobby'));
    document.body.classList.toggle('in-session', Boolean(view && view.phase !== 'lobby'));
    document.body.dataset.phase = view?.phase || 'entrance';
    let body;
    if (!state.credentials) body = entry();
    else if (!view) body = '<section class="online-entry"><div><span class="eyebrow">Connecting…</span><h1>Take a seat</h1><p>Connection lost. Retrying automatically; your seat is saved.</p></div><section class="online-paper"><button type="button" class="primary" id="online-reconnect">Reconnect</button><button type="button" class="text-button" id="online-return">Back to entrance</button></section></section>';
    else if (view.phase === 'lobby') body = lobby();
    else body = `${toolbar(true)}${status()}${seats()}${view.players.some(player => player.active && !player.connected) ? '<p class="online-notice">Someone is disconnected. Keep this room open while they return in their original tab.</p>' : ''}${({auction, 'round-summary':roundSummary, dispose:disposal, result, ended:result})[view.phase]()}`;
    const reconnecting = Boolean(state.credentials && state.view && state.connection !== 'Connected');
    main.innerHTML = `${state.error ? `<div class="online-error-banner" role="alert">${escape(state.error)}</div>` : ''}${reconnecting ? '<section class="online-network-banner" role="status"><div><strong>Reconnecting to the room…</strong><p>Your last room view and draft are kept. Wait for a fresh update before submitting.</p></div><button type="button" id="online-reconnect">Retry connection</button></section>' : ''}${body}`;
    if (ledgerOpen && main.querySelector('#online-session-ledger')) main.querySelector('#online-session-ledger').open = true;
    L.localize(main);
    bind();
    if (state.busy) main.querySelectorAll('button,input').forEach(element => element.disabled = true);
    if (reconnecting) main.querySelectorAll('#online-ready,#online-start,#online-next,#online-continue,#online-finish,#online-leave,#online-inspect,#online-withdraw,#online-sell,#online-pass,#online-bid-form button[type="submit"],[data-online-role],[data-online-theme]').forEach(element => element.disabled = true);
    if (focusId) {
      const replacement = document.getElementById(focusId);
      if (replacement && !replacement.disabled) { replacement.focus({preventScroll:true}); if (selection && selection.start !== null) { try { replacement.setSelectionRange(selection.start,selection.end); } catch {} } }
    }
  }
  function updateBid(value) {
    state.draftBid = String(value); persist();
    const input = main.querySelector('#online-bid-input'), range = main.querySelector('#online-bid-range'), balance = main.querySelector('#online-bid-balance');
    const amount = Number(value), cash = state.view.self.cash;
    if (input && input.value !== String(value)) input.value = String(value);
    if (range) range.value = String(Math.max(1,Math.min(cash,amount || 1)));
    if (balance) balance.textContent = Number.isSafeInteger(amount) && amount > 0 && amount <= cash ? money(cash-amount) : '—';
  }
  function reviewAction(action) {
    if (state.connection !== 'Connected') { poll(); return; }
    pendingReview = {...action,turnId:state.view?.turnId};
    const passing = action.type === 'bid' && action.pass;
    const submit = action.type === 'bid', leaving = action.type === 'leave';
    const title = submit ? passing ? 'Review your pass' : 'Review your sealed bid' : leaving ? 'Leave this room?' : 'Finish session';
    const description = submit ? 'You can withdraw until the last player submits. If you are last, confirming reveals all bids immediately.' : leaving ? 'Your current room seat will be released.' : 'The host will finish this session for everyone. Current results stay final.';
    const body = document.getElementById('online-review-body');
    body.innerHTML = `<span class="eyebrow">${submit ? 'NOT SUBMITTED YET' : 'Your next move'}</span><h2 id="online-review-title">${title}</h2>${submit ? `<p class="online-review-scope">${passing ? 'No purchase if you pass.' : 'One bid for all six objects.'}</p><div class="review-amount"><span>Your choice</span><strong>${passing ? 'PASS' : money(action.amount)}</strong></div><div class="online-review-balance"><span>${passing ? 'Your cash' : 'Cash if you win'}</span><strong>${money(state.view.self.cash-(passing ? 0 : action.amount))}</strong></div>${passing ? '' : '<p class="small muted">Before sale proceeds and ability costs.</p>'}` : ''}<p class="online-review-description">${description}</p><div class="review-actions"><button type="button" id="online-review-cancel">${submit ? 'Withdraw & edit' : 'Cancel'}</button><button type="button" class="primary" id="online-review-confirm">${submit ? passing ? 'Confirm pass' : 'Confirm bid' : leaving ? 'Confirm leave' : 'Confirm finish'}</button></div>`;
    L.localize(body);
    body.querySelector('#online-review-cancel').addEventListener('click', () => review.close());
    body.querySelector('#online-review-confirm').addEventListener('click', () => {
      const pending = pendingReview;
      review.close();
      if (!pending) return;
      if (pending.turnId !== state.view?.turnId) { state.error = 'This round has already revealed. Review the result below.'; render(); return; }
      const {type,turnId,...fields} = pending; command(type,fields);
    });
    review.showModal(); body.querySelector('#online-review-cancel').focus();
  }
  function bind() {
    const on = (selector, event, fn) => main.querySelector(selector)?.addEventListener(event, fn);
    on('#online-name','input',event => { state.name = event.target.value; });
    on('#online-room-code','input',event => { state.roomCode = event.target.value; });
    on('#online-create','click',() => enter(false));
    on('#online-entry-form','submit',event => { event.preventDefault(); enter(true); });
    on('#online-reconnect','click',poll);
    on('#online-return','click',clearSeat);
    on('#online-copy','click',async event => {
      const url = new URL('online.html',location.href); url.searchParams.set('room',state.view.code);
      url.searchParams.set('lang',L.language);
      try { await navigator.clipboard.writeText(url.href); event.target.textContent = L.translate('Invite copied'); }
      catch { state.error = `Copy this room code: ${state.view.code}`; render(); }
    });
    on('#online-leave','click',() => reviewAction({type:'leave'}));
    main.querySelectorAll('[data-online-role]').forEach(button => button.addEventListener('click',() => command('configure',{role:button.dataset.onlineRole,theme:selfPlayer().theme || 'harbor'})));
    main.querySelectorAll('[data-online-theme]').forEach(button => button.addEventListener('click',() => command('configure',{role:state.view.self.role,theme:button.dataset.onlineTheme})));
    on('#online-ready','click',() => command('ready',{ready:!selfPlayer().ready}));
    on('#online-start','click',() => command('start'));
    on('#online-next','click',() => command('next'));
    on('#online-continue','click',() => command('continue'));
    on('#online-finish','click',() => reviewAction({type:'finish'}));
    main.querySelectorAll('[data-online-lot]').forEach(button => button.addEventListener('click',() => { state.selected = Number(button.dataset.onlineLot); persist(); render(); main.querySelector(`[data-online-lot="${state.selected}"]`)?.focus({preventScroll:true}); }));
    on('#online-inspect','click',() => command('inspect',{slot:state.selected}));
    on('#online-open-bid','click',() => { state.bidOpen = true; render(); main.querySelector('#online-bid-input')?.focus({preventScroll:true}); });
    on('#online-back-clues','click',() => { state.bidOpen = false; render(); });
    on('#online-bid-input','input',event => updateBid(event.target.value));
    on('#online-bid-range','input',event => updateBid(event.target.value));
    on('#online-bid-decrease','click',() => updateBid(Math.max(1,Math.min(state.view.self.cash,Math.floor(Number(state.draftBid) || 1)-25))));
    on('#online-bid-increase','click',() => updateBid(Math.max(1,Math.min(state.view.self.cash,Math.floor(Number(state.draftBid) || 1)+25))));
    on('#online-bid-form','submit',event => {
      event.preventDefault(); const amount = Number(state.draftBid);
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > state.view.self.cash) { state.error = `Your bid limit: ${money(state.view.self.cash)}.`; render(); return; }
      reviewAction({type:'bid',amount,pass:false});
    });
    on('#online-pass','click',() => reviewAction({type:'bid',amount:null,pass:true}));
    on('#online-withdraw','click',() => command('withdraw'));
    main.querySelectorAll('[data-online-sale]').forEach(button => button.addEventListener('click',() => { state.saleMode = button.dataset.onlineSale; if (state.saleMode === 'ordinary') { state.repairSlots = []; state.pairSlots = []; state.abilitySlots = []; } persist(); render(); }));
    main.querySelectorAll('[data-online-processing]').forEach(input => input.addEventListener('change',() => {
      const key = processingKey(), slot = Number(input.dataset.onlineProcessing);
      state[key] = input.checked ? [...state[key],slot] : state[key].filter(id => id !== slot); persist(); render(); main.querySelector(`[data-online-processing="${slot}"]`)?.focus({preventScroll:true});
    }));
    on('#online-sell','click',() => command('sell',{mode:state.saleMode,repairSlots:state.saleMode === 'special' ? state.repairSlots : [],pairSlots:state.saleMode === 'special' ? state.pairSlots : [],abilitySlots:state.saleMode === 'special' ? state.abilitySlots : []}));
  }
  document.getElementById('online-help-button').addEventListener('click', () => document.getElementById('online-help').showModal());
  document.getElementById('online-close-help').addEventListener('click', () => document.getElementById('online-help').close());
  review.addEventListener('close', () => { pendingReview = null; });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state.credentials && !state.busy && !state.polling) poll(); });
  document.getElementById('practice-link').href = 'index.html?lang='+encodeURIComponent(L.language);
  document.querySelector('.wordmark').href = 'online.html?lang='+encodeURIComponent(L.language);
  window.addEventListener('secondvalue:languagechange', () => {
    // Translate the current nodes directly. Do not replace inputs or dialogs,
    // issue a room action, or reset the current bid/processing selection.
    L.localize(document.body);
    setConnection(state.connection);
    document.getElementById('practice-link').href = 'index.html?lang='+encodeURIComponent(L.language);
    document.querySelector('.wordmark').href = 'online.html?lang='+encodeURIComponent(L.language);
  });
  L.localize(document.body); render();
  if (state.credentials) poll(); else setConnection('MULTIPLAYER');
})();


