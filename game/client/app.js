(() => {
  'use strict';
  const E = window.SecondValue;
  const L = window.SecondValueLocale;
  const Art = window.SecondValueArt;
  const Show = window.SecondValueShow;
  const Clues = window.SecondValueRoundClues;
  const SaleCompare = window.SecondValueSaleComparison;
  const Book = window.SecondValueCollection;
  const Zoom = window.SecondValueArtZoom;
  const Notes = window.SecondValueNotebook;
  const Tutorial = window.SecondValueTutorial;
  const main = document.getElementById('game');
  const STORAGE = 'second-value-step-one-v1';
  const money = value => value.toLocaleString('en-US');
  const signed = value => (value > 0 ? '+' : value < 0 ? '−' : '') + money(Math.abs(value));
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const minimumBid = () => Math.max(1,game?.reservePrice || 0);
  const defaultBid = () => String(Math.max(minimumBid(),Math.min(300,E.getCash(game))));
  let selectedRole = 'restorer';
  let selectedTheme = 'harbor';
  let session = null;
  let game = null;
  let saleMode = 'special';
  let repairIds = [];
  let pairIds = [];
  let abilityIds = [];
  let upgraded = false;
  let draftBid = '300';
  let storageAvailable = true;
  let pendingAction = null;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) || 'null');
    if (saved && Object.hasOwn(E.ROLES,saved.selectedRole)) selectedRole = saved.selectedRole;
    if (saved && Object.hasOwn(E.THEMES,saved.selectedTheme)) selectedTheme = saved.selectedTheme;
    session = E.restoreSession(saved && saved.session);
    game = session && session.game;
    upgraded = Boolean(saved && (saved.game || saved.session) && !session);
    if(game) draftBid = typeof saved.draftBid==='string'?saved.draftBid:defaultBid();
    if(game && game.phase==='dispose' && saved.saleDraft) {
      saleMode = saved.saleDraft.mode==='ordinary'?'ordinary':'special';
      repairIds = Array.isArray(saved.saleDraft.repairIds)?saved.saleDraft.repairIds.filter(id=>game.items.some(item=>item.id===id)):[];
      pairIds = Array.isArray(saved.saleDraft.pairIds)?saved.saleDraft.pairIds.filter(id=>game.items.some(item=>item.id===id)):[];
      abilityIds = Array.isArray(saved.saleDraft.abilityIds)?saved.saleDraft.abilityIds.filter(id=>game.items.some(item=>item.id===id)):[];
    }
    if(game && game.role==='appraiser')saleMode='ordinary';
  } catch { storageAvailable = false; }

  function save() {
    try { localStorage.setItem(STORAGE, JSON.stringify({selectedRole,selectedTheme,session,draftBid,saleDraft:{mode:saleMode,repairIds,pairIds,abilityIds}})); }
    catch { storageAvailable = false; }
  }
  function start() {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    session = E.newSession(selectedRole,seed,selectedTheme);game=session.game;resetDraft();upgraded=false;save();render();
  }
  function resetDraft() {
    saleMode=game.role==='appraiser'?'ordinary':'special';repairIds=[];pairIds=[];abilityIds=[];draftBid=defaultBid();
  }
  function act(type,payload={}) {
    E.performSession(session,type,payload);game=session.game;
  }
  function sprite(config) {
    if(!config)return '';
    const x=config.columns>1?100*config.column/(config.columns-1):0;
    const y=config.rows>1?100*config.row/(config.rows-1):0;
    return `<span class="sprite-image" aria-hidden="true" style="--sprite-aspect:${config.sheet==='assets/catalog-lots-v1.png'?1.5:1};background-image:url('${config.sheet}');background-size:${config.columns*100}% ${config.rows*100}%;background-position:${x}% ${y}%"></span>`;
  }
  function itemArt(item,known) {
    return sprite(Art.visualFor(item,known))||`<span class="artifact ${item.shape}"><span>?</span></span>`;
  }
  function bidderSeats() {
    const revealed=['round-summary','dispose','result'].includes(game.phase);
    const last=revealed?game.history.at(-1):null;
    const people=[...game.bots,{id:'you',name:'You',role:game.role}];
    return `<section class="bidder-seats" aria-label="At the table">${people.map(person=>{
      const self=person.id==='you',bid=last?.bids.find(entry=>entry.id===person.id)?.bid;
      const status=revealed?(bid?money(bid):'Passed'):self?(game.phase==='bid'?'Draft bid':'Your turn'):'Sealed bid';
      return `<div class="bidder-seat ${self?'is-self':''} ${revealed&&game.winner===person.id?'is-winner':''}"><span class="seat-portrait">${sprite(Art.portraitFor(person.role,self))}</span><div class="seat-info"><div class="seat-name"><strong>${person.name}</strong><small>${E.ROLES[person.role].short}</small></div><span class="seat-status ${revealed?'is-revealed':''}">${status}</span></div><span class="bid-paddle" aria-hidden="true">${self?'IV':['bot-0','bot-1','bot-2'].indexOf(person.id)+1}</span></div>`;
    }).join('')}</section>`;
  }
  function sessionBanner() {
    const profit=session.cash-E.STARTING_CASH;
    const cash=game.phase==='dispose'?E.getCash(game)-game.bid:game.phase==='result'?session.cash:E.getCash(game);
    const cashLabel=game.phase==='dispose'?'Cash after purchase':game.phase==='result'?'Current cash':'Available cash';
    const stage=session.ended?'SESSION FINISHED':({inspect:'Review clues',bid:'Prepare your bid','round-summary':'Bids revealed',dispose:'Sell your crate',result:'AUCTION SETTLED'})[game.phase];
    const role=E.ROLES[game.role];
    return `<div class="session-banner compact-status" aria-label="Session progress">
      <div class="status-location"><strong>Auction ${session.auctionNumber}</strong><span class="small muted">ROUND ${game.round} / 3</span></div>
      <div class="status-metric"><span class="small muted">${cashLabel}</span><strong>${money(cash)}</strong></div>
      <div class="status-metric"><span class="small muted">Settled profit</span><strong class="${profit<0?'negative':'positive'}">${signed(profit)}</strong></div>
      <div class="status-role"><strong>${role.short}</strong><span class="small muted">${game.role==='appraiser'?`${2-game.inspected.length} / 2 uses left`:game.role==='collector'?E.THEMES[game.theme]:role.skill}</span></div>
      <span class="status-stage" aria-current="step">${stage}</span>
    </div>`;
  }
  function rolePicker() {
    return `<div class="intro"><div><span class="eyebrow">YOUR EDGE IS A CHOICE</span><h1>Same crate.<br>A different kind of value.</h1><p>Some see damage. Some see a fake. Some see the missing piece. Choose your role and find out what you are willing to pay.</p>${Tutorial.buttonMarkup()}</div><span class="tag session-tag">CONTINUOUS AUCTIONS · 1,000 STARTING COINS</span></div>
      <p class="role-roster-label">Six roles. One shared auction.</p><div class="role-grid expanded-roles">${Object.entries(E.ROLES).map(([id,role])=>`<button type="button" class="role-card" data-role="${id}" aria-pressed="${selectedRole===id}" aria-label="Choose ${role.short}"><span class="role-heading"><span class="role-portrait" aria-hidden="true">${sprite(Art.portraitFor(id))}</span><h3>${role.name}</h3></span><p class="gold">${role.tagline}</p><span class="skill"><strong>${role.skill}</strong><span>${role.passive}</span></span><p class="risk">The risk: ${role.risk}</p></button>`).join('')}</div>
      ${selectedRole==='collector'?`<fieldset class="theme-picker"><legend>Choose your collection theme</legend><p class="small muted">Lock it before the session begins. Keep the same theme for every crate.</p><div class="theme-options">${Object.entries(E.THEMES).map(([id,name])=>`<button type="button" data-theme="${id}" aria-label="${name}" aria-pressed="${selectedTheme===id}"><span>${name}</span><small>${id==='harbor'?'More matching objects, smaller pair bonuses.':'Rarer matches, larger pair bonuses.'}</small></button>`).join('')}</div></fieldset>`:''}
      <div class="bottom-actions"><p>Cash carries between crates. Continue or leave after any settled auction.<br>Your role and collection theme stay locked for the session.</p><button type="button" class="primary" id="start-game">Enter as ${E.ROLES[selectedRole].short} →</button></div><p class="small muted" style="margin-top:14px">These values are a first draft, not balanced competitive rules.</p>${upgraded?'<p class="storage-note">Continuous auctions now carry your cash. Start a new session with the updated rules.</p>':''}${!storageAvailable?'<p class="storage-note">Browser storage is unavailable. This practice will reset if you refresh.</p>':''}`;
  }
  function publicClue() {
    const genuine=game.items.filter(item=>item.genuine).length;
    const repairable=game.items.filter(item=>item.repair).length;
    const lines=game.round===1?['Only silhouettes are visible at first. Authenticity and prices are unconfirmed.']:[];
    if(game.round>=2)lines.push(`Confirmed genuine objects: ${genuine} / ${game.items.length}.`);
    if(game.round>=3){const item=game.items[game.publicIndex];lines.push(`Public reveal: object ${String.fromCharCode(65+game.publicIndex)} — ${item.name}, ${item.genuine?'Genuine':'Reproduction'}, base ${item.base}.`);lines.push(itemAttributes(item));lines.push(`The manifest also confirms ${repairable} repairable ${repairable===1?'object':'objects'}.`);}
    return lines.join('<br>');
  }
  function roundRule() {
    return game.round===3?'Final round: the highest bid wins. Ties follow the published priority.':`Early hammer: the highest bid must reach ${game.round===1?'1.8':'1.3'}× the runner-up. Otherwise, another round opens.`;
  }
  function nextCluePreview() {
    return game.round===1?'If no sale: next round reveals the genuine count.':game.round===2?'If no sale: next round reveals one identity and the repairable count.':'Final round: the highest bid wins. Ties follow the published priority.';
  }
  function reserveNotice() {
    if(!game.reservePrice)return '';
    const unable=E.getCash(game)<minimumBid();
    return `<details class="auction-reserve reserve-compact ${unable?'is-unaffordable':''}"><summary><span>Auction-house reserve</span><strong>${money(game.reservePrice)}</strong></summary><div class="reserve-explanation"><strong>Minimum bid · fixed for this crate</strong><p>${unable?'Your cash is below the reserve. You can pass this round.':'A winning bid must meet the reserve. This amount stays fixed for all three rounds.'}</p></div></details>`;
  }
  function historyMarkup() {
    if(!game.history.length)return '';
    const ids=['you',...game.bots.map(b=>b.id)];
    return `<section class="bid-history" aria-label="Previous round bids"><span class="eyebrow">PUBLIC BID HISTORY</span><div class="bid-history-row history-heading"><span>Round</span>${ids.map(bidderName).map(name=>`<span>${name}</span>`).join('')}</div>${game.history.map(round=>`<div class="bid-history-row"><span>${round.round} / 3</span>${ids.map(id=>{const value=round.bids.find(b=>b.id===id).bid;return `<span>${value?money(value):'—'}</span>`;}).join('')}</div>`).join('')}</section>`;
  }
  function roundSummary() {
    const last=game.history.at(-1);
    const leader=last.bids[0];
    return `<div class="workbench-head"><div><span class="eyebrow">ROUND ${game.round} / 3 · BIDS REVEALED</span><h2 class="lot-title">No hammer. Not yet.</h2></div><div class="workbench-tools">${reserveNotice()}${Notes.buttonMarkup()}</div></div>
      <div class="auction-layout phase-layout"><section><p class="muted">This round did not sell. Everyone’s cash is unchanged.</p>${historyMarkup()}
      <div class="round-readout"><span class="eyebrow">WHY THE AUCTION CONTINUES</span><p>${last.highest?`Leading bid: ${bidderName(leader.id)} at ${money(last.highest)}.`:'No offers were made in this round.'}</p><p>Runner-up bid: ${money(last.second)}.</p><p>${last.reservePrice&&last.highest<last.reservePrice?'No bid met the reserve. Nobody pays.':`Early sale required a leading bid of at least ${money(last.required)}.`}</p></div></section>
      <aside class="side-panel stage-controls phase-controls"><div class="stage-heading"><span class="eyebrow">NEXT ROUND</span><h3>Next move</h3></div><p>${game.round===1?'Next: the manifest reveals how many objects are genuine.':'Next: one object’s identity and base price will be revealed.'}</p><button type="button" class="primary full" id="next-round">Open round ${game.round+1} →</button><div class="stage-support"><p>Previous bids are not charges or minimums. You may raise, lower, or skip your next bid.</p><p>${abilityStatus()}</p><p class="priority">${game.round===1?'Next-round early hammer: 1.3× the runner-up.':'Next round is final: highest bid wins.'}</p></div></aside></div>`;
  }
  function bidderName(id) { return id==='you'?'You':game.bots.find(bot=>bot.id===id).name; }
  function participants(revealed=false) {
    const rows=game.bots.map(bot=>`<div class="participant"><span class="avatar" aria-hidden="true">${bot.name[0]}</span><span>${bot.name}<span class="muted"> · ${E.ROLES[bot.role].short}</span>${bot.theme?`<small class="muted" style="display:block">${E.THEMES[bot.theme]}</small>`:''}<small class="muted" style="display:block"><span>Cash:</span> ${money(game.botStartingCash[Number(bot.id.slice(4))])}</small></span><span class="right">${revealed?(bot.bid?money(bot.bid):'Passed'):(game.botStartingCash[Number(bot.id.slice(4))]?'Computer · sealed':'No cash · passing')}</span></div>`).join('');
    return revealed?`<div class="participants"><span class="eyebrow">THE SEALED BIDS</span>${rows}<div class="participant"><span class="avatar" aria-hidden="true">Y</span><span>You</span><span class="right">${game.passed?'Passed':money(game.bid)}</span></div></div>`:`<details class="participants table-details"><summary>Other bidders · 3 computers</summary>${rows}</details>`;
  }
  function catalog() {
    const shapes=[...new Set(game.items.map(item=>item.shape))];
    return `<details class="catalog"><summary>Public catalog · possible identities and prices</summary>${shapes.map(shape=>{const entry=E.catalogFor(shape,game);return `<div class="catalog-item"><span>${entry.label}</span><span>${entry.min}–${entry.max}</span></div>${E.catalogItems(game).filter(item=>item.shape===shape).map(item=>`<div class="catalog-definition"><span>${item.name}</span><span>${item.base} base</span><small>${itemAttributes(item)}</small></div>`).join('')}`;}).join('')}<p class="small muted">Ranges cover catalog possibilities, not a guaranteed sale quote for this crate. Role bonuses and workshop fees are separate.</p></details>`;
  }
  function abilityStatus() {
    if(game.role==='appraiser')return `${2-game.inspected.length} / 2 inspections remain for the entire crate.`;
    if(game.role==='collector')return `<span>Locked theme:</span> <span>${E.THEMES[game.theme]}</span><br><span>Your ability is used after winning. Judge this crate from public clues.</span>`;
    return 'Your ability is used after winning. Judge this crate from public clues.';
  }
  function itemAttributes(item) {
    const conditions={intact:'Intact',damaged:'Damaged',unrepairable:'Unrepairable'};
    return `<span>${item.genuine?'Genuine':'Reproduction'}</span> · <span>${conditions[item.condition]||item.condition}</span> · <span>${item.category}</span> · <span>${E.THEMES[item.theme]||'No collection theme'}</span>${item.repair?`<br><span>Workshop fee</span> ${item.repair.cost} · <span>Restored sale price</span> ${item.repair.sale} · <span>Net repair gain</span> +${item.repair.sale-item.repair.cost-item.base}`:''}`;
  }
  function informationFor(index) {
    const publicKnown=game.round===3&&index===game.publicIndex;
    const privateKnown=game.role==='appraiser'&&game.inspected.includes(index);
    return {known:publicKnown||privateKnown,source:publicKnown?'Public reveal':privateKnown?'Private note':'Unconfirmed'};
  }
  function roundCluesMarkup() {
    if(!game||!['inspect','bid'].includes(game.phase))return '';
    const round=game.round,countsPublic=round===2||round===3;
    let publicLot=null;
    if(round===3&&Number.isInteger(game.publicIndex)&&game.publicIndex>=0&&game.publicIndex<game.items.length) {
      const info=informationFor(game.publicIndex),item=game.items[game.publicIndex];
      if(info.known&&info.source==='Public reveal')publicLot={slot:game.publicIndex,label:item.name,base:item.base,known:true,source:info.source};
    }
    return Clues.markup({round,genuineCount:countsPublic?game.items.filter(item=>item.genuine).length:null,repairableCount:round===3?game.items.filter(item=>item.genuine&&item.condition==='damaged'&&item.repair).length:null,publicLot});
  }
  function selectRoundClue(slot) {
    if(!game||!['inspect','bid'].includes(game.phase)||game.round!==3||!Number.isInteger(slot)||slot!==game.publicIndex||slot<0||slot>=game.items.length)return;
    if(informationFor(slot).source!=='Public reveal')return;
    game.selected=slot;save();render();
    main.querySelector(`.object-button[data-item="${slot}"]`)?.focus({preventScroll:true});
    main.querySelector('#selected-object')?.scrollIntoView({block:'nearest',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?'auto':'smooth'});
  }
  function objectCards() {
    return game.items.map((item,index)=>{
      const info=informationFor(index),range=E.catalogFor(item.shape,game);
      const newPublic=game.round===3&&index===game.publicIndex&&info.source==='Public reveal';
      return `<button type="button" class="object-button ${info.known?'object-known':''} ${newPublic?'is-round-reveal':''}" data-item="${index}" aria-label="Select object ${index+1}" aria-controls="selected-object" aria-pressed="${game.selected===index}"><span class="object-head"><span class="object-letter">${String.fromCharCode(65+index)}</span><span class="object-status ${info.source==='Public reveal'?'public-status':''} ${newPublic?'round-reveal-mark':''}">${newPublic?'New this round':info.source}</span></span><span class="object-art" aria-hidden="true">${itemArt(item,info.known)}${info.known?`<span class="authenticity-stamp ${item.genuine?'is-genuine':'is-reproduction'}">${item.genuine?'Genuine':'Reproduction'}</span>`:''}</span><span class="object-label">${info.known?item.name:E.SHAPES[item.shape]}</span><span class="object-range"><span>${info.known?'Base price':'Catalog range'}</span><span>${info.known?item.base:range.min+'–'+range.max}</span></span></button>`;
    }).join('');
  }
  function confirmedNotes() {
    const indices=game.items.map((_,index)=>index).filter(index=>informationFor(index).known);
    return `<section class="confirmed-notes" aria-label="Confirmed information"><div class="notes-heading"><span class="eyebrow">CONFIRMED INFORMATION</span><span class="small muted">${indices.length} / ${game.items.length} confirmed</span></div>${indices.length?indices.map(index=>{const item=game.items[index],info=informationFor(index);return `<button type="button" class="confirmed-note" data-item="${index}" aria-pressed="${game.selected===index}"><span class="note-letter">${String.fromCharCode(65+index)}</span><span class="note-identity"><span>${item.name}</span><small><span>${info.source}</span> · <span>${item.genuine?'Genuine':'Reproduction'}</span></small></span><span class="note-price"><span>${item.base} base</span></span></button>`;}).join(''):'<p class="small muted">No objects confirmed yet. Catalog ranges describe possibilities, not actual prices.</p>'}</section>`;
  }
  function rareStory(item, known) {
    if(known!==true)return '';
    const entry=E.catalogItems(game).find(candidate=>candidate.catalogId===item.catalogId);
    return Book.storyMarkup(entry,true);
  }
  function objectDetail() {
    const item=game.items[game.selected],info=informationFor(game.selected),range=E.catalogFor(item.shape,game);
    const facts=info.known
      ? `<div><dt>Base price</dt><dd>${money(item.base)}</dd></div><div><dt>Authenticity</dt><dd>${item.genuine?'Genuine':'Reproduction'}</dd></div>`
      : `<div><dt>Catalog range</dt><dd>${range.min}–${range.max}</dd></div><div><dt>Identity</dt><dd>Unconfirmed</dd></div>`;
    return `<section class="object-detail ${info.known?'detail-known':''}" id="selected-object" aria-labelledby="object-detail-title">
      <div class="detail-heading"><span class="detail-letter">${String.fromCharCode(65+game.selected)}</span><div><span class="eyebrow">SELECTED OBJECT</span><h3 id="object-detail-title">${info.known?item.name:E.SHAPES[item.shape]}</h3></div></div>
      <div class="detail-body"><div class="detail-visual">${Zoom.trigger(item,info.known,itemArt(item,info.known))}${info.known?`<span class="authenticity-stamp ${item.genuine?'is-genuine':'is-reproduction'}">${item.genuine?'Genuine':'Reproduction'}</span>`:''}</div><div><span class="detail-badge">${info.source}</span><dl class="detail-facts">${facts}</dl></div></div>
      ${info.known?`<details class="detail-extra"><summary>Condition & ability details</summary><p>${itemAttributes(item)}</p></details>`:`<p class="detail-explanation">Only the silhouette is confirmed. Exact identity, condition and value remain hidden.</p><details class="detail-catalog"><summary>Possible catalog matches</summary>${E.catalogItems(game).filter(candidate=>candidate.shape===item.shape).map(candidate=>`<div><span>${candidate.name}</span><strong>${candidate.base} base</strong></div>`).join('')}<p class="small muted">These are possibilities, not a confirmed identity.</p></details>`}
      ${rareStory(item,info.known)}<div class="detail-manifest"><span class="eyebrow">Auctioneer’s manifest</span><p>${publicClue()}</p></div>
    </section>`;
  }
  function actionDock() {
    if(game.phase==='bid')return `<section class="action-dock dock-bid" aria-label="Your auction controls">${bidControls()}</section>`;
    const role=E.ROLES[game.role],known=informationFor(game.selected).known;
    const exhausted=game.inspected.length>=2;
    const skillPanel=game.role==='appraiser'?`<button type="button" class="skill-button" id="use-skill" ${known||exhausted?'disabled':''}><span>${known?'Information already confirmed':role.skill}</span><span>${2-game.inspected.length} / 2 uses left</span></button><p class="skill-result" id="skill-result" aria-live="polite">${known?'Read this object’s confirmed details above.':exhausted?'No private note for this object. Both inspection uses are spent.':'Choose an object, then authenticate it. Two uses for this entire crate.'}</p>`:`<strong>${role.skill}</strong><p class="role-tool">${abilityStatus()}</p>`;
    return `<section class="action-dock dock-inspect" aria-label="Your auction controls"><div class="dock-context"><span class="eyebrow">YOUR AUCTION DESK</span><strong>Target: object ${String.fromCharCode(65+game.selected)}</strong><span class="small muted">Bids stay sealed until you confirm.</span></div><div class="dock-skill">${skillPanel}</div><div class="dock-primary">${E.getCash(game)<minimumBid()?'<button type="button" class="primary" id="pass-bid">Pass this round</button>':'<button type="button" class="primary" id="open-bidding">Prepare a bid →</button>'}<small>${game.reservePrice&&E.getCash(game)<minimumBid()?'Your cash is below the reserve. You can pass this round.':'Opening the bid form submits nothing. You can come back.'}</small></div></section>`;
  }
  function inspection() {
    return `<div class="workbench-head"><div class="lot-heading"><div><h2 class="lot-title">The auction table</h2><span class="round-preview">${nextCluePreview()}</span></div></div><div class="workbench-tools">${reserveNotice()}${Notes.buttonMarkup()}<details class="round-rules"><summary>Round rules</summary><div class="round-rules-content"><p>${roundRule()}</p><p>Tie priority</p><p>${game.priority.map(bidderName).join(' → ')}</p></div></details></div></div>
      ${roundCluesMarkup()}<div class="workbench-grid"><section class="auction-table-column"><div class="crate"><div class="crate-top"><span>One crate / six objects</span><span>Choose an object to see its details.</span></div><div class="objects">${objectCards()}</div><a class="mobile-detail-link" href="#selected-object">Selected object details ↓</a></div>
      </section><aside class="workbench-sidebar">${objectDetail()}</aside></div>${actionDock()}
      <div class="table-reference"><details class="known-register"><summary>Confirmed notes</summary>${confirmedNotes()}</details>${game.history.length?`<details class="previous-bids"><summary>Previous round bids</summary>${historyMarkup()}</details>`:''}${catalog()}${participants()}<details class="role-reference"><summary>Your role ability</summary><p>${E.ROLES[game.role].passive}</p></details>${session.rulesVersion<4?'<details class="rules-reference"><summary>Saved session rules</summary><p>This saved session keeps its original rules. New sessions use the updated balance.</p></details>':''}</div>`;
  }
  function bidControls() {
    const cash=E.getCash(game),minimum=minimumBid(),maximum=Math.max(minimum,cash),unable=cash<minimum;
    const amount=Number(draftBid),valid=Number.isSafeInteger(amount)&&amount>=minimum&&amount<=cash;
    return `<button type="button" class="back-button" id="back-to-clues">← Return to clues</button><form id="bid-form" novalidate><div class="bid-editor"><label for="bid-input"><span>Your sealed bid</span><span>Whole crate</span></label><div class="amount-input"><button type="button" id="bid-decrease" aria-label="Decrease bid by 25" ${unable?'disabled':''}>−</button><input id="bid-input" type="number" min="${minimum}" max="${maximum}" step="1" inputmode="numeric" value="${escape(draftBid)}" ${unable?'disabled':''} aria-describedby="bid-limit bid-error"><button type="button" id="bid-increase" aria-label="Increase bid by 25" ${unable?'disabled':''}>+</button></div><input id="bid-range" type="range" min="${minimum}" max="${maximum}" step="1" value="${Math.max(minimum,Math.min(maximum,amount||minimum))}" ${unable?'disabled':''} aria-label="Adjust bid"></div><div class="dock-balance"><span>Cash after purchase</span><strong id="bid-balance">${valid?money(cash-amount):'—'}</strong><small>Before sale proceeds and ability costs.</small><small id="bid-limit">Your bid limit: ${money(cash)}.</small></div><div class="bid-actions"><button type="button" id="pass-bid">Pass this round</button><button type="submit" class="primary" ${unable?'disabled':''}>Review bid →</button></div><div id="bid-error" class="error" role="alert"></div></form>`;
  }
  function reviewCrosscheck(action) {
    let storage;
    try { storage=window.localStorage; } catch { /* Match the in-memory notebook when storage is blocked. */ }
    const source=E.SOURCES[game.sourceId];
    const lots=game.items.map((item,slot)=>{
      const info=informationFor(slot);
      return {slot,label:info.known?item.name:E.SHAPES[item.shape],known:info.known,source:info.source,range:E.catalogFor(item.shape,game),...(info.known?{base:item.base,genuine:item.genuine,condition:item.condition}:{})};
    });
    return Notes.reviewMarkup({key:`solo:${session.seed}:${session.auctionNumber}`,storage,round:game.round,amount:action.amount,pass:action.pass===true,lots,clues:{
      genuineCount:game.round>=2?game.items.filter(item=>item.genuine).length:null,
      repairableCount:game.round===3?game.items.filter(item=>item.genuine&&item.condition==='damaged'&&item.repair).length:null,
      sourceName:source?.name,sourceHint:source?.hint
    }});
  }
  function reviewAction(action) {
    pendingAction=action;
    const leaving=action.type==='finish',passing=action.pass===true;
    const title=leaving?'Leave this session?':passing?'Pass this round?':'Ready to reveal your bid?';
    const summary=leaving?`<span>Final cash</span><strong>${money(session.cash)}</strong>`:passing?'<span>Your choice</span><strong>PASS</strong>':`<span>Your sealed bid</span><strong>${money(action.amount)}<small>VIRTUAL COINS</small></strong>`;
    const explanation=leaving?'Your completed auctions stay final. You can keep playing by going back.':passing?'You will make no offer this round. Confirming reveals all bids immediately.': 'Confirming reveals all bids immediately. This round cannot be withdrawn after reveal.';
    const passRisk=game.round<3?'Another bidder may buy now. A next round opens only if this round does not sell.':'Another bidder may buy now. This is the final round.';
    const body=document.getElementById('review-body');
    body.innerHTML=`<span class="eyebrow">${leaving?'SESSION EXIT':'NOT SUBMITTED YET'}</span><h2 id="review-title">${title}</h2><div class="review-amount">${summary}</div>${!leaving?reviewCrosscheck(action):''}${!leaving&&!passing?`<div class="receipt-line"><span>Cash after purchase</span><strong>${money(E.getCash(game)-action.amount)}</strong></div><p class="small muted">Before sale proceeds and ability costs.</p>`:''}<p id="review-description"><span>${explanation}</span>${passing?`<br><span class="pass-risk">${passRisk}</span>`:''}</p>${!leaving?'<p class="reveal-boundary">After reveal, bids and passes are final for this round.</p>':''}<div class="review-actions"><button type="button" id="cancel-review">${leaving?'Keep playing':passing?'Cancel pass':'Withdraw & edit'}</button><button type="button" class="primary" id="confirm-review">${leaving?'Confirm exit':passing?'Confirm pass & reveal':'Confirm & reveal bids'}</button></div><div id="review-error" class="error" role="alert"></div>`;
    L.localize(body);
    body.querySelector('#cancel-review').addEventListener('click',()=>review.close());
    body.querySelector('#confirm-review').addEventListener('click',()=>{
      if(!pendingAction)return;
      try {
        if(pendingAction.type==='finish')act('finish');
        else {act('bid',{amount:pendingAction.amount,pass:pendingAction.pass});saleMode=game.role==='appraiser'?'ordinary':'special';repairIds=[];pairIds=[];abilityIds=[];}
        review.close();save();render();
      } catch(error) {body.querySelector('#review-error').textContent=L.translate(error.message);}
    });
    save();review.showModal();body.querySelector('#cancel-review').focus({preventScroll:true});review.scrollTop=0;
  }
  function truth() {
    return `<div class="truth-grid">${game.items.map(item=>`<div class="truth-row"><span class="truth-art">${Zoom.trigger(item,true,itemArt(item,true))}</span><div><p>${item.name}</p><small>${itemAttributes(item)}</small></div><strong>${item.base} base</strong></div>`).join('')}</div>`;
  }
  function receiptHtml(receipt,preview) {
    const processed=(ids,label)=>ids?.length?`<p class="small muted processing-receipt"><span>${label}</span>${ids.map(id=>`<span style="display:block">${escape(game.items.find(item=>item.id===id).name)}</span>`).join('')}</p>`:'';
    return `<div class="receipt" aria-live="polite"><span class="eyebrow">${preview?'SALE PREVIEW':'FINAL RECEIPT'} · VIRTUAL COINS</span><div class="receipt-line"><span>Cash before this crate</span><strong>${money(E.getCash(game))}</strong></div><div class="receipt-line"><span>Winning bid</span><strong>${receipt.paid?'−'+money(receipt.paid):'0'}</strong></div><div class="receipt-line"><span>Sale proceeds</span><strong>${signed(receipt.sale)}</strong></div><div class="receipt-line"><span>Ability bonus</span><strong>${signed(receipt.bonus)}</strong></div><div class="receipt-line"><span>Processing fees</span><strong>${receipt.cost?'−'+money(receipt.cost):'0'}</strong></div>${processed(receipt.repairs,'Repairs selected:')}${processed(receipt.pair,'Collection pair:')}${processed(receipt.ability,'Ability selection:')}<div class="receipt-profit"><span>${receipt.profit<0?'Crate loss':'Crate profit'}</span><strong class="${receipt.profit<0?'negative':'positive'}">${signed(receipt.profit)}</strong></div><div class="receipt-line"><span>${preview?'Cash after sale':'Cash after this crate'}</span><strong>${money(receipt.cash)}</strong></div></div>`;
  }
  function disposal() {
    let special=null,specialError='';
    const options={theme:game.theme,...saleSelection()};
    const ordinary=E.salePlan(game.role,game.items,'ordinary',E.getCash(game)-game.bid);
    if(game.role!=='appraiser') {
      try { special=E.salePlan(game.role,game.items,'special',E.getCash(game)-game.bid,options); }
      catch(error) { specialError=error.message; }
    }
    const plan=saleMode==='special'&&game.role!=='appraiser'?special:ordinary;
    const selectionError=plan?'':specialError;
    const preview=plan?{...plan,paid:game.bid,profit:plan.recovery-game.bid,cash:E.getCash(game)-game.bid+plan.recovery}:null;
    const comparison=SaleCompare.markup({ordinary,special,paid:game.bid,selectedMode:saleMode,hasAbility:game.role!=='appraiser',error:specialError});
    const specialLabel=game.role==='restorer'?'Repair selected objects':game.role==='collector'?'Deliver selected collection':E.ROLES[game.role].skill;
    const selection=game.role==='restorer'?repairSelection():game.role==='collector'?pairSelection():abilitySelection();
    return `<div class="workbench-head"><div><span class="eyebrow">SOLD TO YOU · ${money(game.bid)} COINS</span><h2 class="lot-title">Choose how to sell</h2></div><div class="workbench-tools">${Notes.buttonMarkup()}</div></div>
      <div class="auction-layout phase-layout sale-disposal"><section>${truth()}${comparison}<div class="sale-options">${game.role!=='appraiser'?`<button type="button" data-sale="special" aria-pressed="${saleMode==='special'}" class="sale-option"><span>${specialLabel}<small>${game.role==='restorer'?'Choose up to two repairs. Fees must be funded before each repair.':game.role==='collector'?'Choose one genuine pair in your locked theme, with different identities and categories.':abilityInstruction()}</small></span></button>`:''}<button type="button" data-sale="ordinary" aria-pressed="${saleMode==='ordinary'}" class="sale-option"><span>Sell at ordinary prices<small>Every role receives the same base prices.</small></span></button></div>${saleMode==='special'?selection:''}<p class="small muted" style="margin-top:15px">All objects are sold now. Your cash carries into the next auction; item storage comes later.</p><details class="previous-bids"><summary>Previous round bids</summary>${historyMarkup()}${participants(true)}</details></section>
      <aside class="side-panel stage-controls phase-controls"><div class="stage-heading"><span class="eyebrow">03 / PROCESS & SELL</span><h3>Your settlement</h3></div><p>Review processing choices, then settle this crate.</p><div class="sale-selected-summary"><span>Selected plan</span><h3>${saleMode==='special'&&game.role!=='appraiser'?'Ability processing':'Ordinary sale'}</h3>${preview?`<div class="receipt-profit"><span>Final profit / loss</span><strong class="${preview.profit<0?'negative':'positive'}">${signed(preview.profit)}</strong></div><div class="receipt-line"><span>Cash after sale</span><strong>${money(preview.cash)}</strong></div><details class="latest-receipt"><summary>Sale preview</summary>${receiptHtml(preview,true)}</details>`:'<p class="selection-warning">Choose the ability targets to compare.</p>'}</div><button type="button" class="primary full" id="confirm-sale" ${!plan?'disabled':''}>Confirm sale & settle crate →</button><p class="action-hint">Your chosen sale can make a profit or a loss. The purchase price is already locked.</p><div id="sale-error" class="error" role="alert">${escape(selectionError)}</div></aside></div>`;
  }
  function repairSelection() {
    const eligible=game.items.filter(item=>item.genuine&&item.repair);
    return `<section class="processing-selection"><h3>Choose repairs</h3><p class="small muted">Unselected objects sell first to fund fees. Each selected object is repaired once and then sold.</p><p class="selection-count">${repairIds.length} / 2 repairs selected</p>${eligible.length?eligible.map(item=>`<button type="button" class="processing-object" data-repair="${escape(item.id)}" aria-pressed="${repairIds.includes(item.id)}" aria-label="Select repair: ${escape(item.name)}" ${repairIds.length>=2&&!repairIds.includes(item.id)?'disabled':''}><span>${item.name}</span><small><span>Workshop fee</span> ${item.repair.cost} · <span>Restored sale price</span> ${item.repair.sale} · <span>Net repair gain</span> +${item.repair.sale-item.repair.cost-item.base}</small></button>`).join(''):'<p class="muted small">No eligible repairs in this crate. Sell at ordinary prices.</p>'}<p class="small muted">At most 60 extra per object and 120 per crate. The actual gain also cannot exceed 25% of an object’s base price.</p></section>`;
  }
  function pairSelection() {
    const eligible=game.items.filter(item=>item.genuine&&item.theme===game.theme);
    return `<section class="processing-selection"><h3>Choose a collection pair</h3><p class="small muted"><span>Locked theme:</span> <span>${E.THEMES[game.theme]}</span></p><p class="selection-count">${pairIds.length} / 2 collection objects selected</p>${eligible.length?eligible.map(item=>`<button type="button" class="processing-object" data-pair="${escape(item.id)}" aria-pressed="${pairIds.includes(item.id)}" aria-label="Select collection: ${escape(item.name)}" ${pairIds.length>=2&&!pairIds.includes(item.id)?'disabled':''}><span>${item.name}</span><small><span>${item.category}</span> · <span>${item.base} base</span></small></button>`).join(''):'<p class="muted small">No genuine objects match your locked theme.</p>'}<p class="small muted">One pair only. Bonus is 25% of the pair’s base prices, rounded down, up to 120. Each object is sold once.</p></section>`;
  }
  function saleSelection() {
    return game.role==='restorer'?{repairIds}:game.role==='collector'?{pairIds}:{abilityIds};
  }
  function abilityInstruction() {
    return ({salvager:'Choose up to two reproductions. Each sells for 90, with a 15 processing fee.',curator:'Choose exactly three genuine, intact objects from different categories. Pay one 25 fee.',broker:'Choose one genuine, intact object. Packing and delivery cost 25; a low-value customer sale can lose money.'})[game.role]||'';
  }
  function abilitySelection() {
    if(!['salvager','curator','broker'].includes(game.role))return '';
    const eligible=game.items.filter(item=>E.abilityEligibility(game.role,item));
    const limit=E.abilitySelectionLimit(game.role);
    const hint=item=>game.role==='salvager'?`<span>Parts sale price</span> 90 · <span>Parts fee</span> 15 · <span>Net parts gain</span> <strong class="${75-item.base<0?'negative':'positive'}">${signed(75-item.base)}</strong>`:game.role==='curator'?`<span>${item.category}</span> · <span>Exhibition bonus</span> +${Math.min(40,Math.floor(item.base/5))}`:`<span>Customer premium</span> +${Math.min(90,Math.floor(item.base*.3))} · <span>Packing &amp; delivery</span> 25 · <span>Net gain vs ordinary sale</span> <strong class="${Math.min(90,Math.floor(item.base*.3))-25<0?'negative':'positive'}">${signed(Math.min(90,Math.floor(item.base*.3))-25)}</strong>`;
    return `<section class="processing-selection"><h3>${E.ROLES[game.role].skill}</h3><p class="small muted">${abilityInstruction()}</p>${game.role==='curator'?'<p class="small muted">Exhibition bonus: 20% per object, rounded down, up to 40 each.</p>':game.role==='broker'?'<p class="small muted">Customer premium: 30% of base price, rounded down, up to 90.</p>':''}<p class="selection-count"><span>${abilityIds.length} / ${limit}</span> <span>selected</span></p>${eligible.map(item=>`<button type="button" class="processing-object" data-ability="${escape(item.id)}" aria-pressed="${abilityIds.includes(item.id)}" aria-label="Select ability object: ${escape(item.name)}" ${abilityIds.length>=limit&&!abilityIds.includes(item.id)?'disabled':''}><span>${item.name}</span><small>${hint(item)}</small></button>`).join('')}${!eligible.length?'<p class="muted small">No eligible objects for this ability. Sell at ordinary prices.</p>':''}${!abilityIds.length?'<p class="small muted">No objects selected. Ordinary sale applies with no ability fee.</p>':''}<p class="small muted">Unselected objects fund fees first; selected objects cannot fund their own processing.</p><p class="small muted">Nothing is selected automatically. Compare the net gain before confirming.</p></section>`;
  }
  function settledDiscoveries() {
    if(!game||game.phase!=='result'||!game.winner)return '';
    const ids=Book.recordSettlement({key:`solo:${session.seed}:${session.auctionNumber}`,phase:'result',sold:true,active:true,rulesVersion:game.rulesVersion??1,lots:game.items.map(item=>({...item,known:true,source:'Crate opened'}))});
    return Book.newDiscoveriesMarkup(ids);
  }
  function result() {
    const board=E.sessionStandings(session),won=game.winner==='you';
    const outcome=!game.winner?(game.reservePrice?'No bid met the reserve. Nobody pays.':'The final round had no bids. Nothing was charged.'):won?`You bought the crate for ${money(game.bid)} and ${game.receipt.profit<0?'lost':'made'} ${money(Math.abs(game.receipt.profit))}.`:game.passed?'You passed this crate. Your cash is unchanged.':`${bidderName(game.winner)} bought the crate. Your cash is unchanged.`;
    const total=session.cash-E.STARTING_CASH;
    const actions=session.ended?'<button type="button" class="primary" id="new-session">Start a new session →</button><button type="button" id="change-role">Choose a different role</button>':'<button type="button" class="primary" id="continue-session">Continue to the next auction →</button><button type="button" id="finish-session">Leave & settle session</button>';
    return `<div class="result-heading workbench-head"><div><span class="eyebrow">${session.ended?'SESSION FINISHED':'AUCTION SETTLED'}</span><h1>${session.ended?'Your session is settled.':'One crate down. Your next decision.'}</h1><p>${outcome}</p></div><div class="workbench-tools">${Notes.buttonMarkup()}</div></div>${valuationMarkup()}${settledDiscoveries()}
      <div class="auction-layout phase-layout"><section><h3>${session.ended?'Final standings':'Current standings'}</h3><p class="small muted">Ranking uses cumulative cash across this session.</p><div class="score-list">${board.map(player=>`<div class="score-row ${player.id==='you'?'self':''}" ${player.id==='you'?'aria-label="Your session standing"':''}><span class="score-rank">${1+board.filter(other=>other.cash>player.cash).length}</span><span class="score-name">${player.name}<small>${E.ROLES[player.role].short}${player.id==='you'?' · You':''}</small></span><span class="score-cash">${money(player.cash)}<small class="${player.profit<0?'negative':'positive'}" style="display:block;font-size:11px;text-align:right">${signed(player.profit)} profit</small></span></div>`).join('')}</div>${ledgerHtml()}<details class="catalog"><summary>Reveal this crate & all bids</summary>${truth()}${historyMarkup()}</details></section>
      <aside class="side-panel stage-controls phase-controls"><div class="stage-heading"><span class="eyebrow">04 / SESSION RESULT</span><h3>Next move</h3></div><div class="session-total"><div class="receipt-line"><span>Current cash</span><strong>${money(session.cash)}</strong></div><div class="receipt-line"><span>Total profit</span><strong class="${total<0?'negative':'positive'}">${signed(total)}</strong></div><p>${session.history.length} ${session.history.length===1?'crate':'crates'} settled.</p></div><p>${session.ended?'Your final cash includes every completed auction. No extra payout is added.':'Carry your cash into another auction, or leave with your current balance.'}</p><div class="restart-row session-decisions">${actions}</div><p class="action-hint">${session.ended?'A new session starts everyone at 1,000 coins. This session’s result stays final.':'The next crate has fresh objects and ability uses. Everyone keeps their own current cash.'}</p><div id="session-error" class="error" role="alert"></div><details class="latest-receipt"><summary>Latest crate receipt</summary>${receiptHtml(game.receipt,false)}<p>Crate profit = sale proceeds + ability bonus − winning bid − processing fees.</p></details></aside></div>`;
  }
  function ledgerHtml() {
    return `<details class="catalog session-ledger"><summary>Session ledger · ${session.history.length} ${session.history.length===1?'crate':'crates'}</summary><div class="ledger-row ledger-header"><span>Auction</span><span>Buyer</span><span>Winning bid</span><span>Your profit</span><span>Your cash</span></div>${session.history.map(record=>`<div class="ledger-row"><span>${record.auctionNumber}</span><span>${record.winner?bidderName(record.winner):'No sale'}</span><span>${money(record.paid)}</span><span class="${record.profit<0?'negative':'positive'}">${signed(record.profit)}</span><span>${money(record.cash)}</span></div>`).join('')}</details>`;
  }
  function valuationMarkup() {
    if(!game.winner)return '';
    const winningBid=game.history.at(-1)?.highest;
    const players=[{id:'you',name:'You',role:game.role,theme:game.theme,cashBefore:E.getCash(game)},...game.bots.map((bot,index)=>({...bot,cashBefore:game.botStartingCash?.[index]??E.STARTING_CASH}))];
    const winner=players.find(player=>player.id===game.winner);
    let receipt=game.receipt;
    if(game.winner!=='you') {
      const plan=E.salePlan(winner.role,game.items,'special',winner.cashBefore-winningBid,{theme:winner.theme});
      receipt={...plan,profit:plan.recovery-winningBid};
    }
    return Show.valuationMarkup({...E.valuationBoard(game.items,players,{winnerId:game.winner,winningBid,receipt}),localizeNames:true});
  }
  function render() {
    document.body.classList.toggle('in-session',Boolean(session));
    document.body.classList.toggle('tabletop-mode',Boolean(session));
    document.body.dataset.phase=game?game.phase:'roles';
    main.innerHTML=!game?rolePicker():game.phase==='inspect'||game.phase==='bid'?inspection():game.phase==='round-summary'?roundSummary():game.phase==='dispose'?disposal():result();
    if(session)main.insertAdjacentHTML('afterbegin',sessionBanner()+bidderSeats()+(['inspect','bid','round-summary'].includes(game.phase)?Show.sourceMarkup(game.sourceId,E.SOURCES):''));
    L.localize(main);
    bind();
    Tutorial.bind(document);
    bindNotebook();
    if(game) {
      const last=game.history.at(-1);
      const event=game.phase==='round-summary'?'round':game.phase==='dispose'?'hammer':game.phase==='result'?(game.winner==='you'?'settled':game.winner?'hammer':'round'):null;
      Show.present(main,{key:`solo:${session.seed}:${session.auctionNumber}:${game.round}:${game.phase}`,event,bids:last?.bids,winnerName:game.winner?bidderName(game.winner):'',winningBid:last?.highest,selfProfit:game.phase==='result'?game.receipt?.profit:null,localizeNames:true});
    }
  }
  function bindNotebook() {
    let storage;
    try { storage=window.localStorage; } catch { /* Notes still work in memory. */ }
    let settlement=null;
    if(game?.phase==='result') {
      if(!game.winner)settlement={sold:false};
      else {
        const winningBid=game.history.at(-1).highest;
        // The solo receipt records the human balance, so a computer buyer's
        // real recovery is derived with the same funded plan as its standing.
        let recovery=game.receipt.recovery;
        if(game.winner!=='you') {
          const index=game.bots.findIndex(bot=>bot.id===game.winner),buyer=game.bots[index];
          recovery=E.salePlan(buyer.role,game.items,'special',(game.botStartingCash?.[index]??E.STARTING_CASH)-winningBid,{theme:buyer.theme}).recovery;
        }
        settlement={sold:true,winningBid,recovery,youWon:game.winner==='you'};
      }
    }
    const decision=game?{round:game.round,editable:['inspect','bid'].includes(game.phase),settlement}:null;
    Notes.bind(main,{key:game?`solo:${session.seed}:${session.auctionNumber}`:null,storage,decision,lots:game?game.items.map((item,slot)=>{
      const info=informationFor(slot),opened=['dispose','result'].includes(game.phase),known=opened||info.known;
      return {slot,label:known?item.name:E.SHAPES[item.shape],known,source:opened?'Crate opened':info.source,range:E.catalogFor(item.shape,game),...(known?{base:item.base,genuine:item.genuine,condition:item.condition}:{})};
    }):[]});
  }
  function bind() {
    main.querySelectorAll('[data-round-clue-slot]').forEach(button=>button.addEventListener('click',()=>selectRoundClue(Number(button.dataset.roundClueSlot))));
    main.querySelectorAll('[data-role]').forEach(button=>button.addEventListener('click',()=>{selectedRole=button.dataset.role;save();render();}));
    main.querySelectorAll('[data-theme]').forEach(button=>button.addEventListener('click',()=>{selectedTheme=button.dataset.theme;save();render();}));
    main.querySelector('#start-game')?.addEventListener('click',start);
    main.querySelectorAll('[data-item]').forEach(button=>button.addEventListener('click',()=>{game.selected=Number(button.dataset.item);save();render();main.querySelector(`.object-button[data-item="${game.selected}"]`)?.focus({preventScroll:true});}));
    main.querySelector('#use-skill')?.addEventListener('click',()=>{try{act('inspect',{index:game.selected});save();render();}catch(error){main.querySelector('#skill-result').textContent=L.translate(error.message);}});
    main.querySelector('#open-bidding')?.addEventListener('click',()=>{act('open');save();render();});
    main.querySelector('#back-to-clues')?.addEventListener('click',()=>{try{act('back');save();render();main.querySelector('#open-bidding')?.focus({preventScroll:true});}catch(error){main.querySelector('#bid-error').textContent=L.translate(error.message);}});
    main.querySelector('#next-round')?.addEventListener('click',()=>{act('next');save();render();});
    const input=main.querySelector('#bid-input');const range=main.querySelector('#bid-range');
    function updateBidDraft() {
      const amount=Number(draftBid),cash=E.getCash(game);
      main.querySelector('#bid-balance').textContent=Number.isSafeInteger(amount)&&amount>=minimumBid()&&amount<=cash?money(cash-amount):'—';
      main.querySelector('#bid-error').textContent='';save();
    }
    input?.addEventListener('input',()=>{draftBid=input.value;const amount=Number(draftBid);if(Number.isFinite(amount))range.value=String(Math.max(minimumBid(),Math.min(E.getCash(game),amount)));updateBidDraft();});
    range?.addEventListener('input',()=>{draftBid=range.value;input.value=draftBid;updateBidDraft();});
    function stepBid(delta) {
      const amount=Number(draftBid);
      draftBid=String(Math.max(minimumBid(),Math.min(E.getCash(game),(Number.isSafeInteger(amount)?amount:minimumBid())+delta)));
      input.value=draftBid;range.value=draftBid;updateBidDraft();
    }
    main.querySelector('#bid-decrease')?.addEventListener('click',()=>stepBid(-25));
    main.querySelector('#bid-increase')?.addEventListener('click',()=>stepBid(25));
    main.querySelector('#bid-form')?.addEventListener('submit',event=>{event.preventDefault();try{const amount=Number(input.value),cash=E.getCash(game),minimum=minimumBid();if(cash<minimum)throw new Error(`You need at least ${money(minimum)} to bid on this crate. Pass this round.`);if(!Number.isSafeInteger(amount)||amount<minimum||amount>cash)throw new Error(`Enter a whole-number bid from ${money(minimum)} to ${money(cash)}.`);reviewAction({type:'bid',amount,pass:false});}catch(error){main.querySelector('#bid-error').textContent=L.translate(error.message);}});
    main.querySelector('#pass-bid')?.addEventListener('click',()=>{if(game.phase==='inspect'){act('open');save();render();}reviewAction({type:'bid',amount:null,pass:true});});
    main.querySelectorAll('[data-sale]').forEach(button=>button.addEventListener('click',()=>{saleMode=button.dataset.sale;save();render();}));
    main.querySelectorAll('[data-repair]').forEach(button=>button.addEventListener('click',()=>{const id=button.dataset.repair;repairIds=repairIds.includes(id)?repairIds.filter(value=>value!==id):[...repairIds,id];save();render();}));
    main.querySelectorAll('[data-pair]').forEach(button=>button.addEventListener('click',()=>{const id=button.dataset.pair;pairIds=pairIds.includes(id)?pairIds.filter(value=>value!==id):[...pairIds,id];save();render();}));
    main.querySelectorAll('[data-ability]').forEach(button=>button.addEventListener('click',()=>{const id=button.dataset.ability;abilityIds=abilityIds.includes(id)?abilityIds.filter(value=>value!==id):[...abilityIds,id];save();render();main.querySelector(`[data-ability="${id}"]`)?.focus({preventScroll:true});}));
    main.querySelector('#confirm-sale')?.addEventListener('click',()=>{try{const selection=saleMode==='ordinary'?{}:saleSelection();act('sell',{mode:saleMode,selection});save();render();}catch(error){main.querySelector('#sale-error').textContent=L.translate(error.message);}});
    main.querySelector('#new-session')?.addEventListener('click',start);
    main.querySelector('#continue-session')?.addEventListener('click',()=>{try{act('continue');resetDraft();save();render();}catch(error){main.querySelector('#session-error').textContent=L.translate(error.message);}});
    main.querySelector('#finish-session')?.addEventListener('click',()=>reviewAction({type:'finish'}));
    main.querySelector('#change-role')?.addEventListener('click',()=>{session=null;game=null;save();render();});
  }
  const help=document.getElementById('help');
  Show.bindSoundToggle(document.getElementById('auction-sound'));
  Show.bindMusicToggle(document.getElementById('auction-music'));
  const review=document.getElementById('action-review');
  review.addEventListener('close',()=>{if(!review.open)pendingAction=null;});
  document.getElementById('close-review').addEventListener('click',()=>review.close());
  review.addEventListener('click',event=>{if(event.target===review){const rect=review.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)review.close();}});
  document.getElementById('help-button').addEventListener('click',()=>help.showModal());
  document.getElementById('close-help').addEventListener('click',()=>help.close());
  help.addEventListener('click',event=>{if(event.target===help){const rect=help.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)help.close();}});
  window.addEventListener('secondvalue:languagechange', () => {
    // Existing DOM, focus, pending review and the saved game remain intact.
    L.localize(document.body);
  });
  L.localize(document.body);
  render();
})();
