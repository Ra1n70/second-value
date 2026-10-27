import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const client=new URL('../game/client/',import.meta.url);
const [online,recoverySource,...localeSources]=await Promise.all(['online.js','recovery.js','locale-es.js','i18n.js','online-locale.js'].map(name=>readFile(new URL(name,client),'utf8')));
const source=online.replace(/\r\n?/g,'\n');
const extract=name=>{const value=source.match(new RegExp('  function '+name+'\\([^\\n]*\\) \\{[\\s\\S]*?\\n  \\}'))?.[0];assert.ok(value,name);return value;};
const recoveryModule={exports:{}};vm.runInNewContext(recoverySource,{module:recoveryModule});
const Recovery=recoveryModule.exports, plain=value=>JSON.parse(JSON.stringify(value));
function view(overrides={}) {
  return {code:'STUCK1',phase:'auction',revision:4,turnId:'STUCK1:1',auctionNumber:1,round:1,
    selfId:'self',hostId:'guest',winnerId:null,receipt:null,history:[],ledger:[],lots:[],
    self:{cash:1000,role:'appraiser'},
    players:[{id:'self',name:'Present',active:true,connected:true,cash:1000,profit:0},
      {id:'guest',name:'Away',active:true,connected:false,offlineSince:15000,ready:false,submitted:false,cash:1000,profit:0}],
    can:{endStalled:false},recovery:{availableAt:135000,blockingPlayerIds:['guest']},...overrides};
}

test('manual-ending projection is gated by server capability and an active human seat',()=>{
  const current=view(),before=JSON.stringify(current);
  assert.deepEqual(plain(Recovery.stalled(current)),{visible:true,availableAt:135000,ready:false});
  assert.equal(Recovery.stalled({...current,can:{endStalled:true}}).ready,true);
  for(const replacement of [
    {...current,phase:'ended'}, {...current,recovery:null}, {...current,recovery:{availableAt:null,blockingPlayerIds:['guest']}},
    {...current,recovery:{availableAt:135000,blockingPlayerIds:[]}}, {...current,selfId:'unknown'},
    {...current,players:current.players.map(player=>player.id==='self'?{...player,active:false}:player)},
    {...current,players:current.players.map(player=>player.id==='self'?{...player,isBot:true}:player)}
  ])assert.equal(Recovery.stalled({...replacement,can:{endStalled:true}}).ready,false);
  assert.equal(Recovery.stalled(null).visible,false);assert.equal(JSON.stringify(current),before);
  assert.equal(Recovery.stableSignature(current),Recovery.stableSignature({...current,serverNow:140000,can:{endStalled:true}}),'a clock-derived button becoming available must not replace bid inputs');
  assert.notEqual(Recovery.stableSignature(current),Recovery.stableSignature({...current,can:{endStalled:false,sell:true}}));
  assert.notEqual(Recovery.stableSignature(current),Recovery.stableSignature({...current,recovery:{availableAt:null,blockingPlayerIds:[]}}));
});

test('real recovery panel shows waiting availability, uses a disabled button until allowed, and never offers it offline',()=>{
  const state={view:view(),connection:'Connected',busy:false};
  const context={state,Recovery,userName:player=>player.name};
  const markup=()=>vm.runInNewContext(extract('recoveryPanel')+'\nrecoveryPanel();',context);
  let html=markup();assert.match(html,/Manual ending available in/);assert.match(html,/id="online-end-stalled" disabled/);
  assert.match(html,/returned to its buyer/);assert.match(html,/Earlier settled results are kept/);assert.match(html,/No bids or sales are made automatically/);
  state.view.can.endStalled=true;html=markup();assert.match(html,/id="online-end-stalled">/);
  state.busy=true;assert.match(markup(),/id="online-end-stalled" disabled/);state.busy=false;
  state.connection='Reconnecting…';assert.doesNotMatch(markup(),/id="online-end-stalled"/);
  state.connection='Connected';state.view.recovery.blockingPlayerIds=[];assert.doesNotMatch(markup(),/id="online-end-stalled"/);
  state.view.phase='ended';assert.equal(markup(),'');
});

function reviewHarness(current=view({can:{endStalled:true}})) {
  const commands=[],elements=new Map(),state={view:current,connection:'Connected',busy:false,draftBid:'777',error:''};
  const body={_html:'',get innerHTML(){return this._html;},set innerHTML(html){this._html=html;elements.clear();for(const id of ['online-review-cancel','online-review-confirm','online-stalled-review-status'])elements.set(id,{disabled:false,hidden:id==='online-stalled-review-status',textContent:'',focus(){},addEventListener(_type,fn){this.click=fn;}});},querySelector(selector){return elements.get(selector.slice(1));}};
  const context=vm.createContext({state,Recovery,pendingReview:null,
    document:{getElementById:id=>id==='online-review-body'?body:null},
    L:{translate:value=>value,localize(){}},money:value=>String(value),
    command:(...args)=>commands.push(args),render(){},poll(){assert.fail('connected confirmation must not poll');},reviewCrosscheck(){return '';}});
  context.review={open:false,scrollTop:0,showModal(){this.open=true;},close(){this.open=false;context.pendingReview=null;}};
  vm.runInContext(extract('updateStalledReview')+'\n'+extract('reviewAction'),context);
  return {state,body,context,commands,get confirm(){return elements.get('online-review-confirm');},get cancel(){return elements.get('online-review-cancel');},get status(){return elements.get('online-stalled-review-status');},open(){context.reviewAction({type:'end-stalled'});}};
}

test('ending requires an explicit review then confirmation; cancel and unavailable capabilities submit nothing',()=>{
  const h=reviewHarness();h.open();
  assert.equal(h.context.review.open,true);assert.equal(h.commands.length,0);assert.equal(h.state.draftBid,'777');
  assert.match(h.body.innerHTML,/End this stalled session\?/);assert.match(h.body.innerHTML,/unfinished crate is cancelled/);
  assert.match(h.body.innerHTML,/paid winning bid is returned to its buyer/);assert.match(h.body.innerHTML,/Earlier settled results stay unchanged/);
  h.cancel.click();assert.equal(h.context.review.open,false);assert.equal(h.commands.length,0);
  h.open();h.confirm.click();assert.deepEqual(plain(h.commands),[['end-stalled',{}]]);
  assert.equal(h.context.review.open,false);assert.equal(h.state.view.self.cash,1000,'client cannot locally refund or credit money');
  const unavailable=reviewHarness(view());unavailable.open();assert.equal(unavailable.context.review.open,false);assert.equal(unavailable.commands.length,0);
  const settled=reviewHarness(view({phase:'result',can:{endStalled:true}}));settled.open();
  assert.match(settled.body.innerHTML,/already settled/);assert.match(settled.body.innerHTML,/no refund is issued/);
});

test('a returned player, stale turn or interrupted connection invalidates an already-open confirmation',()=>{
  for(const change of [h=>{h.state.view.can.endStalled=false;h.state.view.recovery.blockingPlayerIds=[];},h=>{h.state.view.turnId='new-turn';},h=>{h.state.connection='Reconnecting…';}]) {
    const h=reviewHarness();h.open();change(h);h.context.updateStalledReview();
    assert.equal(h.confirm.disabled,true);assert.equal(h.status.hidden,false);assert.ok(h.status.textContent.length);
    h.confirm.click();assert.equal(h.commands.length,0);assert.equal(h.context.review.open,true);
    assert.equal(h.state.draftBid,'777');
  }
});

test('the real recovery button only opens review, while the fresh-room button clears the seat flow',()=>{
  const handlers=new Map(),reviews=[],commands=[];let freshRooms=0;
  const main={querySelectorAll(){return [];},querySelector(selector){return {addEventListener(type,fn){handlers.set(selector+':'+type,fn);}};}};
  vm.runInNewContext(extract('bind')+'\nbind();',{main,state:{},poll(){},clearSeat(){},newRoom(){freshRooms++;},reviewAction:action=>reviews.push(action),command:(...args)=>commands.push(args)});
  assert.equal(commands.length,0);assert.equal(reviews.length,0);
  handlers.get('#online-end-stalled:click')();
  assert.deepEqual(plain(reviews),[{type:'end-stalled'}]);assert.equal(commands.length,0);
  handlers.get('#online-new-room:click')();assert.equal(freshRooms,1);assert.equal(commands.length,0);
});

test('countdown and server eligibility only update existing controls, preserving bid draft and unrelated review',()=>{
  const wait={hidden:false},ready={hidden:true},count={textContent:''},offline={dataset:{offlineSince:'15000'},textContent:''},button={disabled:true};
  const input={value:'777',selectionStart:1,selectionEnd:2};
  const selectors={'[data-offline-since]':[offline],'[data-room-update-clock]':[],'[data-stalled-countdown]':[count],'[data-stalled-wait]':[wait],'[data-stalled-ready]':[ready]};
  const context=vm.createContext({Recovery,state:{view:view(),connection:'Connected',busy:false,draftBid:'777'},
    performance:{now:()=>0},presenceAnchor:{serverNow:100000,receivedAt:0},lastRoomUpdate:0,pendingReview:{type:'bid',amount:777},
    review:{open:true,close(){assert.fail('a clock must not close a bid review');}},
    main:{querySelectorAll:selector=>selectors[selector]||[],querySelector:selector=>selector==='#online-end-stalled'?button:input,
      set innerHTML(_html){assert.fail('a clock must not rerender the game');}},command(){assert.fail('a clock must not issue a room action');}});
  vm.runInContext(extract('updateRecoveryClocks'),context);context.updateRecoveryClocks();
  assert.equal(count.textContent,'0:35');assert.equal(button.disabled,true);assert.equal(wait.hidden,false);
  context.presenceAnchor.serverNow=140000;context.updateRecoveryClocks();assert.equal(count.textContent,'0:00');assert.equal(button.disabled,true,'local elapsed time must not grant a server capability');
  context.state.view.can.endStalled=true;context.updateRecoveryClocks();
  assert.equal(button.disabled,false);assert.equal(wait.hidden,true);assert.equal(ready.hidden,false);
  assert.equal(input.value,'777');assert.equal(context.pendingReview.amount,777);assert.equal(context.review.open,true);
});

test('cancelled results show the exact crate-wide refund without sale profit, discoveries or reveal animation',()=>{
  const current=view({phase:'ended',round:0,cancelledCrate:true,cancelledRefund:450,winnerId:'self',winningBid:450,receipt:{profit:999},self:{cash:1080,role:'appraiser'}});
  const before=JSON.stringify(current),context={state:{view:current,busy:false},selfPlayer:()=>current.players[0],money:value=>Number(value).toLocaleString('en-US'),
    signed:value=>String(value),scoreboard:()=>'<standings>',sessionLedger:()=>'<prior-ledger>',settledDiscoveries(){assert.fail('cancelled result cannot register discoveries');},receiptMarkup(){assert.fail('cancelled result cannot show sale receipt');},
    Book:{recordSettlement(){assert.fail('cancelled crate cannot enter discovery storage');}},Show:{present(){assert.fail('cancelled crate cannot animate a reveal or sale');}}};
  const functions=vm.runInNewContext(['cancelledResult','result','showCurrentScene','status'].map(extract).join('\n')+'\n({result,showCurrentScene,status});',context);
  let html=functions.result();
  assert.match(html,/Unfinished crate cancelled/);assert.match(html,/Winning bid returned<\/span><strong data-no-localize>450<\/strong>/);
  assert.match(html,/Returned to the buyer; this is not sale profit/);assert.match(html,/Your cash<\/span><strong data-no-localize>1,080/);
  assert.match(html,/<prior-ledger>/);assert.match(html,/id="online-new-room"/);assert.doesNotMatch(html,/Crate profit|Crate loss|Sale proceeds|New discoveries|Your settlement|\+450/);
  assert.match(functions.status(),/Unfinished crate cancelled/);assert.doesNotMatch(functions.status(),/Round 0 \/ 3/);
  functions.showCurrentScene();
  assert.equal(vm.runInNewContext(extract('settledDiscoveries')+'\nsettledDiscoveries();',context),'');
  assert.equal(JSON.stringify(current),before);
  current.cancelledRefund=0;html=functions.result();assert.match(html,/No winning bid had been paid/);assert.doesNotMatch(html,/Winning bid returned/);
});

test('creating a new room clears saved-seat state and the old room query, preserving language',()=>{
  let url=null,persisted=null;
  const state={credentials:{code:'STUCK1',token:'fixture-only'},view:view(),roomCode:'STUCK1',draftTurn:'STUCK1:1',saleTurn:'STUCK1:1',bidOpen:true};
  const context={state,syncEpoch:0,timer:null,presenceAnchor:null,lastRoomUpdate:0,clearTimeout(){},performance:{now:()=>0},review:{open:false},
    location:{href:'https://secondvalue.test/online.html?lang=es&room=STUCK1'},URL,
    history:{replaceState(_state,_title,value){url=new URL(value);}},persist(){persisted=state.credentials;},render(){},setConnection(value){state.connection=value;}};
  vm.runInNewContext(extract('clearSeat')+'\n'+extract('newRoom')+'\nnewRoom();',context);
  assert.equal(state.credentials,null);assert.equal(persisted,null);assert.equal(state.view,null);assert.equal(state.roomCode,'');assert.equal(state.bidOpen,false);
  assert.equal(url.searchParams.has('room'),false);assert.equal(url.searchParams.get('lang'),'es');
});

test('new recovery actions, cancellation copy and API race errors translate CN/ES/EN without changing amounts',()=>{
  let url=new URL('https://secondvalue.test/online.html');
  const context=vm.createContext({document:{documentElement:{},getElementById(){return null;},querySelector(){return null;}},
    location:{get href(){return url.href;},get search(){return url.search;}},URL,URLSearchParams,
    localStorage:{getItem(){return null;},setItem(){}},history:{state:null,replaceState(_s,_t,value){url=new URL(value,url);}},CustomEvent:class{},addEventListener(){},dispatchEvent(){}});context.window=context;
  for(const source of localeSources)vm.runInContext(source,context);
  const block=localeSources[2].split("    'Room recovery':'房间连接恢复',")[1].split("    'Offline for'")[0];
  const copy=Array.from(block.matchAll(/^    '([^']+)':/gm),match=>match[1]);assert.ok(copy.length>=20);
  for(const language of ['zh-CN','es','en','zh-CN','es','en']) {
    context.SecondValueLocale.setLanguage(language);
    for(const phrase of copy) {
      const translated=context.SecondValueOnlineLocale.translate(phrase);
      if(language==='en')assert.equal(translated,phrase);else assert.notEqual(translated,phrase,language+': '+phrase);
      if(language==='es')assert.doesNotMatch(translated,/[\u3400-\u9fff]/);
      assert.equal(context.SecondValueOnlineLocale.translate(translated),translated);
    }
    for(const amount of ['450','1,080','0:35'])assert.equal(context.SecondValueOnlineLocale.translate(amount),amount);
  }
});
