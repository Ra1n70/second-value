/* Optional, isolated teaching crate. It never creates a game, seat or request. */
(function (root, factory) {
  const tutorial = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = tutorial;
  else root.SecondValueTutorial = tutorial;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const COMPLETE_KEY = 'secondvalue:tutorial-complete';
  const ITEM_IDS = ['harbor-clock','replica-cup','crew-badge','toy-camera','prop-radio','map-print'];
  const STEPS = ['Read clues','Seal a bid','Reveal the crate','Choose a sale'];
  const bound = new WeakSet();
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const money = value => Number(value).toLocaleString('en-US');
  const signed = value => (value > 0 ? '+' : value < 0 ? '−' : '') + money(Math.abs(value));
  let dialog = null, practice = null, error = '', previousFocus = null;

  function createPractice(engine) {
    if (!engine?.catalogItems || !engine?.salePlan || !engine?.resolveRound) throw new Error('The practice engine is unavailable.');
    const catalog = engine.catalogItems();
    const items = ITEM_IDS.map(id => {
      const item = catalog.find(candidate => candidate.catalogId === id);
      if (!item) throw new Error('The practice catalog is unavailable.');
      return {...item,id:`tutorial:${id}`,repair:item.repair ? {...item.repair} : undefined};
    });
    const base = items.reduce((sum,item)=>sum+item.base,0);
    const reserve = Math.round(base / 10), startingCash = 1000, rivalBid = 300;
    let state;
    function reset() { state={stage:0,selected:null,draft:'350',review:false,bid:null,won:null,winningBid:null,mode:'ordinary',receipt:null}; }
    reset();
    function validBid() {
      const text=String(state.draft).trim(), amount=Number(text);
      if (!/^\d+$/.test(text) || !Number.isSafeInteger(amount) || amount<reserve || amount>startingCash) throw new Error('Enter a whole-number practice bid from 40 to 1,000.');
      return amount;
    }
    function plan(mode=state.mode) {
      if (state.winningBid === null) throw new Error('Reveal the practice bids first.');
      if (!['ordinary','special'].includes(mode)) throw new Error('Choose a valid sale method.');
      return engine.salePlan('restorer',items,mode,startingCash-state.winningBid,{repairIds:mode==='special'?[items[0].id]:[]});
    }
    function act(action,value) {
      if (action==='reset') {reset();return;}
      if (action==='select' && state.stage===0) {
        if(!Number.isInteger(value)||value<0||value>=items.length)throw new Error('Choose a valid practice object.');
        state.selected=value;return;
      }
      if (action==='next' && state.stage===0) {
        if(state.selected===null)throw new Error('Choose an object first.');
        state.stage=1;return;
      }
      if (action==='draft' && state.stage===1 && !state.review) {state.draft=String(value);return;}
      if (action==='review' && state.stage===1 && !state.review) {validBid();state.review=true;return;}
      if (action==='edit' && state.stage===1 && state.review) {state.review=false;return;}
      if (action==='confirm' && state.stage===1 && state.review) {
        const amount=validBid();
        const reveal=engine.resolveRound([{id:'you',name:'You',bid:amount},{id:'tutorial-rival',name:'Practice rival',bid:rivalBid}],['you','tutorial-rival'],3,reserve);
        state.bid=amount;state.won=reveal.winner==='you';state.winningBid=reveal.highest;state.stage=2;state.review=false;return;
      }
      if (action==='retry' && state.stage===2) {state.stage=1;state.bid=null;state.won=null;state.winningBid=null;state.review=false;return;}
      if (action==='compare' && state.stage===2) {state.stage=3;state.mode='ordinary';return;}
      if (action==='mode' && state.stage===3 && !state.receipt) {plan(value);state.mode=value;return;}
      if (action==='settle' && state.stage===3 && !state.receipt) {
        const sale=plan();
        state.receipt={...sale,winningBid:state.winningBid,profit:sale.recovery-state.winningBid,cash:state.won?startingCash-state.winningBid+sale.recovery:startingCash,comparison:!state.won};
        return;
      }
      if (action==='back' && state.stage===1) {state.stage=0;state.review=false;return;}
      if (action==='back' && state.stage===3 && !state.receipt) {state.stage=2;return;}
      throw new Error('That practice action is unavailable at this step.');
    }
    return Object.freeze({act,plan,get state(){return JSON.parse(JSON.stringify(state));},get items(){return items.map(item=>({...item,repair:item.repair?{...item.repair}:undefined}));},base,reserve,startingCash,rivalBid});
  }

  function buttonMarkup() {return '<button type="button" class="tutorial-entry" data-open-tutorial>Learn in one crate</button>';}
  function localize(node) {(root.SecondValueOnlineLocale || root.SecondValueLocale)?.localize?.(node);}
  function art(item,known) {
    const config=root.SecondValueArt?.visualFor?.(item,known);
    if(!config || !/^assets\/(?:[\w-]+\/)*[\w-]+\.(?:png|svg|webp)$/.test(config.sheet))return '<span class="tutorial-art-fallback" aria-hidden="true">?</span>';
    const x=config.columns>1?100*config.column/(config.columns-1):0,y=config.rows>1?100*config.row/(config.rows-1):0;
    const position=config.columns===1&&config.rows===1?'background-size:contain;background-repeat:no-repeat;background-position:center':`background-size:${config.columns*100}% ${config.rows*100}%;background-position:${x}% ${y}%`;
    return `<span class="tutorial-art" aria-hidden="true" style="background-image:url('${config.sheet}');${position}"></span>`;
  }
  function facts() {return `<div class="tutorial-facts"><div><span>Practice cash</span><strong>${money(practice.startingCash)}</strong></div><div><span>Auction-house reserve</span><strong>${money(practice.reserve)}</strong></div><div><span>Round</span><strong>3 / 3</strong></div></div>`;}
  function controls(content) {return `<div class="tutorial-actions">${content}</div>`;}
  function inspectMarkup(state) {
    const items=practice.items, selected=state.selected===null?null:items[state.selected], known=state.selected===3;
    const possibilities=selected?root.SecondValue.catalogItems().filter(item=>item.shape===selected.shape):[];
    return `<h3>Choose an object and read the public clue.</h3><div class="tutorial-public"><span class="tutorial-public-title">Final-round practice</span><p><span>Source</span><strong>Watchmaker's clearance</strong></p><p><span>Genuine objects</span> <strong>2 / 6</strong><span class="tutorial-clue-divider">·</span><span>Repairable objects</span> <strong>1</strong></p><p><span>Public reveal</span><span>Plastic toy camera</span><strong>35</strong></p></div><div class="tutorial-objects">${items.map((item,index)=>`<button type="button" data-tutorial-select="${index}" aria-pressed="${state.selected===index}"><span class="tutorial-object-letter" data-no-localize>${String.fromCharCode(65+index)}</span>${art(item,index===3)}<span>${index===3?item.name:root.SecondValue.SHAPES[item.shape]}</span></button>`).join('')}</div><div class="tutorial-clue-panel"><span class="tutorial-kicker">What you know</span>${selected?`<h4>${known?selected.name:root.SecondValue.SHAPES[selected.shape]}</h4><p>${known?'This object is public. Everyone sees the same identity and value.':'A silhouette suggests a category, not an exact identity.'}</p><dl><div><dt>${known?'Base price':'Catalog range'}</dt><dd>${known?selected.base:Math.min(...possibilities.map(item=>item.base))+'–'+Math.max(...possibilities.map(item=>item.base))}</dd></div></dl>`:'<p>Choose an object first.</p>'}</div><details class="tutorial-round-note"><summary>Why the final round?</summary><p>This example starts in round 3.</p><p>Earlier rounds can sell early at 1.8× or 1.3× the runner-up bid. In the final round, the highest valid bid wins.</p><p>You have priority if bids tie.</p></details>${controls(`<button type="button" class="primary" data-tutorial-action="next" ${selected?'':'disabled'}>Continue to bidding</button>`)}`;
  }
  function biddingMarkup(state) {
    return `<h3>Enter a sealed bid, then review it.</h3>${facts()}<p class="tutorial-task-note">The rival's quote is scripted for this lesson and stays hidden until reveal.</p>${state.review?`<div class="tutorial-bid-review"><span>Sealed bid</span><strong>${money(Number(state.draft))}</strong><p>Nothing has been submitted. You can still return and edit.</p></div>${controls('<button type="button" data-tutorial-action="edit">Return and edit</button><button type="button" class="primary" data-tutorial-action="confirm">Confirm and reveal</button>')}`:`<form class="tutorial-bid-form"><label for="tutorial-bid">Your bid</label><div><input id="tutorial-bid" type="number" min="${practice.reserve}" max="${practice.startingCash}" step="1" inputmode="numeric" value="${escape(state.draft)}" required><button type="submit" class="primary">Review sealed bid</button></div></form>${controls('<button type="button" class="text-button" data-tutorial-action="back">Back to clues</button>')}`}`;
  }
  function revealMarkup(state) {
    return `<h3>${state.won?(state.bid===practice.rivalBid?'Equal bids: your published priority wins.':'Your bid wins.'):'Your bid did not win. Your practice cash stays unchanged.'}</h3><div class="tutorial-quotes"><div><span>You</span><strong>${money(state.bid)}</strong></div><div><span>Practice rival</span><strong>${money(practice.rivalBid)}</strong></div><div class="tutorial-hammer"><span>Winning bid</span><strong>${money(state.winningBid)}</strong></div></div><div class="tutorial-revealed">${practice.items.map(item=>`<article>${art(item,true)}<div><strong>${item.name}</strong><span><span>${item.genuine?'Genuine':'Reproduction'}</span>${item.condition==='damaged'?' · <span>Damaged</span>':''}</span></div><b>${money(item.base)}</b></article>`).join('')}</div><div class="tutorial-value"><span>Ordinary crate value</span><strong>${money(practice.base)}</strong></div>${controls(`<button type="button" class="text-button" data-tutorial-action="retry">Try another bid</button><button type="button" class="primary" data-tutorial-action="compare">${state.won?'Continue to sale choices':'Compare sale choices'}</button>`)}`;
  }
  function saleMarkup(state) {
    const plan=practice.plan(),ordinary=practice.plan('ordinary'),repair=practice.plan('special'),receipt=state.receipt;
    if(receipt)return `<h3>${receipt.comparison?'Hypothetical comparison':'Practice receipt'}</h3>${receipt.comparison?'<p class="tutorial-task-note">You are comparing the scripted winner\'s crate. This does not change your cash.</p>':''}<dl class="tutorial-receipt"><div><dt>Winning bid</dt><dd>−${money(receipt.winningBid)}</dd></div><div><dt>Sale proceeds</dt><dd>+${money(receipt.sale)}</dd></div><div><dt>Repair fee</dt><dd>−${money(receipt.cost)}</dd></div><div class="tutorial-receipt-total"><dt>Profit after bid and fees</dt><dd class="${receipt.profit<0?'is-loss':'is-gain'}">${signed(receipt.profit)}</dd></div><div><dt>Your practice cash</dt><dd>${money(receipt.cash)}</dd></div></dl><p class="tutorial-takeaway">A better repair cannot make every purchase profitable.</p>${controls('<button type="button" data-tutorial-action="reset">Replay this crate</button><button type="button" class="primary" data-tutorial-action="finish">Finish tutorial</button>')}`;
    return `<h3>Compare two sale choices.</h3>${!state.won?'<p class="tutorial-task-note">You are comparing the scripted winner\'s crate. This does not change your cash.</p>':'<p class="tutorial-task-note">Choose a sale, then check the full receipt.</p>'}<div class="tutorial-sale-options"><button type="button" data-tutorial-mode="ordinary" aria-pressed="${state.mode==='ordinary'}"><strong>Ordinary sale</strong><span><span>Sale after fees</span><b>${money(ordinary.recovery)}</b></span><span><span>Processing fees</span><b>0</b></span></button><button type="button" data-tutorial-mode="special" aria-pressed="${state.mode==='special'}"><strong>Repair the clock</strong><span><span>Sale after fees</span><b>${money(repair.recovery)}</b></span><span><span>Repair fee</span><b>${money(repair.cost)}</b></span></button></div><div class="tutorial-repair-explainer">${art(practice.items[0],true)}<div><strong>Old Harbor mantel clock</strong><dl><div><dt>Ordinary sale</dt><dd>${money(practice.items[0].base)}</dd></div><div><dt>Repair sale price</dt><dd>${money(practice.items[0].repair.sale)}</dd></div><div><dt>Repair fee</dt><dd>${money(practice.items[0].repair.cost)}</dd></div><div><dt>Net gain vs ordinary sale</dt><dd>${signed(repair.recovery-ordinary.recovery)}</dd></div></dl></div></div><div class="tutorial-value"><span>Profit at this price</span><strong class="${plan.recovery-state.winningBid<0?'is-loss':'is-gain'}">${signed(plan.recovery-state.winningBid)}</strong></div>${controls(`<button type="button" class="text-button" data-tutorial-action="back">Back to reveal</button><button type="button" class="primary" data-tutorial-action="settle">${state.won?'Confirm practice sale':'Finish comparison'}</button>`)}`;
  }
  function render() {
    if(!dialog || !practice)return;
    const state=practice.state, language=root.SecondValueLocale?.language || 'en';
    dialog.innerHTML=`<div class="tutorial-header"><div><span class="tutorial-kicker">Practice example · Restorer</span><h2 id="tutorial-title">One guided crate</h2></div><div class="tutorial-header-tools"><label class="tutorial-language" data-no-localize><select aria-label="Language / 语言 / Idioma" data-tutorial-language><option value="en" ${language==='en'?'selected':''}>English</option><option value="zh-CN" ${language==='zh-CN'?'selected':''}>中文</option><option value="es" ${language==='es'?'selected':''}>Español</option></select></label><button type="button" class="text-button" data-tutorial-action="close" aria-label="Close tutorial">Close</button></div></div><p class="tutorial-isolation">Scripted bids. Your real games and cash are untouched.</p><ol class="tutorial-steps">${STEPS.map((step,index)=>`<li class="${index===state.stage?'is-current':index<state.stage?'is-complete':''}" ${index===state.stage?'aria-current="step"':''}><span aria-hidden="true">${index+1}</span><b>${step}</b></li>`).join('')}</ol><section class="tutorial-body">${error?`<p class="tutorial-error" role="alert">${escape(error)}</p>`:''}${[inspectMarkup,biddingMarkup,revealMarkup,saleMarkup][state.stage](state)}</section><footer class="tutorial-footer"><span>This is an isolated lesson. Closing it leaves your real auction exactly as it was.</span><button type="button" class="text-button" data-tutorial-action="reset">Start again</button></footer>`;
    localize(dialog);
  }
  function close() {
    if(!dialog)return;
    if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');
    if(previousFocus?.isConnected && !previousFocus.closest?.('dialog:not([open])'))previousFocus.focus?.();
  }
  function dispatch(action,value) {
    if(action==='close'){close();return;}
    if(action==='finish') {
      if(!practice.state.receipt)return;
      try {root.localStorage?.setItem(COMPLETE_KEY,'true');}catch {/* Completion is optional. */}
      close();return;
    }
    error='';
    try {practice.act(action,value);}catch(problem){error=problem.message;}
    render();
    if(action==='edit' || (action==='review' && error))dialog.querySelector('#tutorial-bid')?.focus();
  }
  function open() {
    const doc=root.document;
    if(!doc?.body || !root.SecondValue)return;
    previousFocus=doc.activeElement;
    for(const id of ['help','online-help']) {
      const help=doc.getElementById(id);
      if(help?.open)help.close();
    }
    if(!dialog) {
      dialog=doc.createElement('dialog');dialog.className='tutorial-dialog';dialog.id='secondvalue-tutorial';dialog.setAttribute('aria-labelledby','tutorial-title');
      dialog.addEventListener('click',event=>{
        const selected=event.target.closest?.('[data-tutorial-select]'),mode=event.target.closest?.('[data-tutorial-mode]'),action=event.target.closest?.('[data-tutorial-action]');
        if(selected)dispatch('select',Number(selected.dataset.tutorialSelect));
        else if(mode)dispatch('mode',mode.dataset.tutorialMode);
        else if(action)dispatch(action.dataset.tutorialAction);
      });
      dialog.addEventListener('input',event=>{if(event.target.id==='tutorial-bid')practice.act('draft',event.target.value);});
      dialog.addEventListener('submit',event=>{event.preventDefault();dispatch('review');});
      dialog.addEventListener('change',event=>{if(event.target.matches?.('[data-tutorial-language]'))root.SecondValueLocale?.setLanguage?.(event.target.value);});
      doc.body.appendChild(dialog);
    }
    // Each opening is a clean four-step example, never a real-game restore.
    practice=createPractice(root.SecondValue);error='';render();
    if(!dialog.open) {if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');}
  }
  function bind(container) {
    if(!container || bound.has(container))return;
    bound.add(container);
    container.addEventListener('click',event=>{if(event.target.closest?.('[data-open-tutorial]')){event.preventDefault();open();}});
  }
  root.addEventListener?.('secondvalue:languagechange',()=>{
    if(!dialog?.open)return;
    const selector=dialog.querySelector('[data-tutorial-language]');
    if(selector)selector.value=root.SecondValueLocale?.language || 'en';
    localize(dialog);
  });
  return Object.freeze({buttonMarkup,bind,createPractice});
});
