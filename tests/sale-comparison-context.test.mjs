import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),E=require('../game/engine.cjs'),R=require('../game/room-engine.cjs');
const client=new URL('../game/client/',import.meta.url);
const [app,online,moduleSource]=await Promise.all(['app.js','online.js','sale-comparison.js'].map(file=>readFile(new URL(file,client),'utf8')));
const extract=(source,name)=>{const fn=source.match(new RegExp('  function '+name+'\\([^\\n]*\\) \\{[\\s\\S]*?\\n  \\}'))?.[0];assert.ok(fn,`actual ${name} must exist`);return fn;};
const plain=value=>JSON.parse(JSON.stringify(value)),money=value=>Number(value).toLocaleString('en-US');
const signed=value=>(value>0?'+':value<0?'−':'')+money(Math.abs(value));
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const moduleContext={module:{exports:{}}};runInNewContext(moduleSource,moduleContext);
const cluesContext={module:{exports:{}}};runInNewContext(await readFile(new URL('round-clues.js',client),'utf8'),cluesContext);const Clues=cluesContext.module.exports;
const SaleCompare=moduleContext.module.exports;
const ids=['harbor-clock','crew-badge','harbor-map','studio-camera','map-print','replica-camera'];
const itemsFor=(catalogIds=ids)=>catalogIds.map((id,slot)=>({...structuredClone(E.catalogItems(5).find(item=>item.catalogId===id)),id:`lot-${slot}`}));
const targets={restorer:[0],appraiser:[],collector:[1,2],salvager:[4,5],curator:[1,2,3],broker:[3]};
const optionsFor=(role,items,slots)=>({theme:role==='collector'?'harbor':null,...(role==='restorer'?{repairIds:slots.map(slot=>items[slot].id)}:role==='collector'?{pairIds:slots.map(slot=>items[slot].id)}:role==='appraiser'?{}:{abilityIds:slots.map(slot=>items[slot].id)})});
function fixture(kind,role,{slots=targets[role],paid=900,catalogIds=ids,mode=role==='appraiser'?'ordinary':'special'}={}){
  const items=itemsFor(catalogIds);
  if(kind==='solo'){
    const game=E.newGame(role,73,'harbor',{noBots:true,rulesVersion:6});Object.assign(game,{items,phase:'dispose',winner:'you',bid:paid});
    return {game,saleMode:mode,repairIds:role==='restorer'?slots.map(slot=>items[slot].id):[],pairIds:role==='collector'?slots.map(slot=>items[slot].id):[],abilityIds:['salvager','curator','broker'].includes(role)?slots.map(slot=>items[slot].id):[]};
  }
  const room=R.createRoom({code:'SALE01',seed:73,host:{id:'host',name:'Host',role,theme:'harbor'}});
  room.rulesVersion=6;room.players[0].cash=E.startingCashFor(6);
  R.joinRoom(room,{id:'guest',name:'Guest',role:'appraiser'});
  const act=(id,type,fields={})=>R.applyAction(room,id,{type,turnId:room.turnId,...fields});
  act('host','ready',{ready:true});act('guest','ready',{ready:true});act('host','start');
  room.items=items;room.reservePrice=1;act('host','bid',{amount:paid,pass:false});act('guest','bid',{amount:null,pass:true});
  assert.equal(room.phase,'dispose');
  return {state:{view:R.viewFor(room,'host'),saleMode:mode,repairSlots:role==='restorer'?[...slots]:[],pairSlots:role==='collector'?[...slots]:[],abilitySlots:['salvager','curator','broker'].includes(role)?[...slots]:[]}};
}
function disposal(kind,draft,{engine=E}={}){
  let input=null,calls=0;
  const context={...draft,E:engine,Clues,money,signed,escape,letter:slot=>String.fromCharCode(65+slot),SaleCompare:{markup(value){calls++;input=plain(value);return SaleCompare.markup(value);}},Notes:{buttonMarkup:()=>''},truth:()=>'',repairSelection:()=>'',pairSelection:()=>'',abilitySelection:()=>'',abilityInstruction:()=>'',historyMarkup:()=>'',participants:()=>'',processingSelection:()=>'',references:()=>'',L:{translate:value=>value},playerById:id=>draft.state?.view.players.find(p=>p.id===id),userName:player=>player.name};
  const before=JSON.stringify(draft),source=kind==='solo'?app:online,names=kind==='solo'?['saleSelection','receiptHtml','exactBlocker','disposal']:['plan','receiptMarkup','processingKey','abilityHint','crateLots','disposal'];
  const html=runInNewContext(names.map(name=>extract(source,name)).join('\n')+'\ndisposal();',context);
  assert.equal(JSON.stringify(draft),before,'comparing sale plans cannot change cash, selections or room truth');
  return {input,html,calls};
}
function activeDisabled(html,kind){const tag=html.match(new RegExp('<button[^>]*id="'+(kind==='solo'?'confirm-sale':'online-sell')+'"[^>]*>'))?.[0];assert.ok(tag);return /\bdisabled\b/.test(tag);}

test('actual solo and room adapters compare all six roles with the same explicit targets and money definitions',()=>{
  for(const role of Object.keys(E.ROLES))for(const kind of ['solo','room']){
    const draft=fixture(kind,role),{input,html}=disposal(kind,draft),items=kind==='solo'?draft.game.items:draft.state.view.lots;
    const ordinary=E.salePlan(role,items,'ordinary',100),special=role==='appraiser'?null:E.salePlan(role,items,'special',100,optionsFor(role,items,targets[role]));
    assert.deepEqual(input.ordinary,plain(ordinary));assert.deepEqual(input.special,plain(special));assert.equal(input.paid,900);assert.equal(input.hasAbility,role!=='appraiser');assert.equal(input.error,'');
    const selected=special??ordinary;assert.ok(html.includes(`<strong>${money(100+selected.recovery)}</strong>`),'cash after sale adds net proceeds to the already-paid balance once');
    assert.ok(html.includes(signed(selected.recovery-900)),'profit subtracts the winning price once');
    assert.equal(activeDisabled(html,kind),false);
  }
});

test('explicit empty target arrays never turn the comparison into an automatic best-ability quote',()=>{
  for(const kind of ['solo','room'])for(const role of Object.keys(E.ROLES)){
    const {input}=disposal(kind,fixture(kind,role,{slots:[]}));
    if(role==='appraiser'){assert.equal(input.special,null);continue;}
    assert.equal(input.special.recovery,input.ordinary.recovery);assert.equal(input.special.cost,0);assert.equal(input.special.bonus,0);
    assert.deepEqual(input.special.repairs,[]);assert.deepEqual(input.special.pair,[]);assert.deepEqual(input.special.ability,[]);
  }
});

test('incomplete Collector and Curator selections invalidate only the ability column',()=>{
  for(const [role,slots] of [['collector',[1]],['curator',[1,2]]])for(const kind of ['solo','room']){
    const draft=fixture(kind,role,{slots}),bad=disposal(kind,draft);
    assert.ok(bad.input.ordinary);assert.equal(bad.input.special,null);assert.ok(bad.input.error);assert.equal(activeDisabled(bad.html,kind),true);
    assert.match(bad.html,/data-sale-comparison-mode="special"[\s\S]*?is-pending|is-pending[\s\S]*?data-sale-comparison-mode="special"/);
    if(kind==='solo')draft.saleMode='ordinary';else draft.state.saleMode='ordinary';
    const ordinary=disposal(kind,draft);assert.deepEqual(ordinary.input.ordinary,bad.input.ordinary);assert.equal(ordinary.input.special,null);assert.equal(activeDisabled(ordinary.html,kind),false);
    assert.equal(ordinary.input.selectedMode,'ordinary');assert.match(ordinary.html,/Selected plan<\/span><h3>Ordinary sale/);
  }
});

test('funding uses unselected sale proceeds and negative ability gains remain visible without a second bid deduction',()=>{
  for(const kind of ['solo','room']){
    const options={catalogIds:['navy-badge','map-print'],slots:[0],paid:996};
    const insufficient=disposal(kind,fixture(kind,'broker',options));
    assert.equal(insufficient.input.ordinary.recovery,90);assert.equal(insufficient.input.special,null);assert.match(insufficient.input.error,/fees first/);assert.equal(activeDisabled(insufficient.html,kind),true);
    const funded=disposal(kind,fixture(kind,'broker',{...options,paid:995}));
    assert.equal(funded.input.special.bonus,21);assert.equal(funded.input.special.cost,25);assert.equal(funded.input.special.recovery,86);assert.equal(funded.input.special.recovery-funded.input.ordinary.recovery,-4);
    assert.match(funded.html,/Net gain vs ordinary sale<\/span><strong data-no-localize>−4/);
    assert.ok(funded.html.includes('<strong>91</strong>'),'5 left after buying + 86 net proceeds = 91');
    assert.ok(funded.html.includes('−909'),'86 recovery − 995 paid = −909 profit');assert.equal(activeDisabled(funded.html,kind),false);
  }
});

test('actual sale-mode handlers preserve ability drafts while ordinary settlement sends no ability targets',()=>{
  for(const kind of ['solo','room']){
    const draft=fixture(kind,'curator'),button={dataset:kind==='solo'?{sale:'ordinary'}:{onlineSale:'ordinary'},addEventListener(_event,fn){this.click=fn;}},handlers=new Map(),actions=[];
    const main={querySelectorAll:selector=>selector===(kind==='solo'?'[data-sale]':'[data-online-sale]')?[button]:[],querySelector:selector=>selector===(kind==='solo'?'#confirm-sale':'#online-sell')?{addEventListener(event,fn){handlers.set(event,fn);}}:null};
    const context={...draft,main,start(){},poll(){},clearSeat(){},persist(){},save(){},render(){},act:(...args)=>actions.push(plain(args)),command:(...args)=>actions.push(plain(args))};
    const keys=kind==='solo'?['repairIds','pairIds','abilityIds']:['repairSlots','pairSlots','abilitySlots'],source=kind==='solo'?app:online;
    const before=plain(kind==='solo'?draft:draft.state);
    runInNewContext((kind==='solo'?extract(app,'saleSelection')+'\n':'')+extract(source,'bind')+'\nbind();',context);
    button.click();const after=kind==='solo'?context:context.state;
    assert.equal(after.saleMode,'ordinary');for(const key of keys)assert.deepEqual(plain(after[key]),before[key]);
    handlers.get('click')();assert.deepEqual(actions,[kind==='solo'?['sell',{mode:'ordinary',selection:{}}]:['sell',{mode:'ordinary',repairSlots:[],pairSlots:[],abilitySlots:[]}]]);
  }
});

test('a room spectator never computes or receives either private draft comparison',()=>{
  const draft=fixture('room','collector');draft.state.view.selfId='guest';draft.state.view.self={id:'guest',role:'appraiser',theme:null,cash:1000};
  const {calls,html}=disposal('room',draft,{engine:{...E,salePlan:()=>assert.fail('spectators must not compute sale previews')}});
  assert.equal(calls,0);assert.doesNotMatch(html,/sale-comparison|id="online-sell"/);assert.match(html,/Waiting for the winner/);
});

test('actual render dispatch keeps comparison previews out of bidding and settled screens',()=>{
  const main={innerHTML:'',contains:()=>false,querySelectorAll:()=>[],insertAdjacentHTML(){}};
  const document={activeElement:null,body:{classList:{toggle(){}},dataset:{}}},noPreview=()=>assert.fail('only disposal may render sale comparisons');
  for(const phase of ['inspect','bid','round-summary','result']){
    const game={phase,round:1,history:[],winner:null},context={game,session:{seed:1,auctionNumber:1},main,document,rolePicker:()=>'',inspection:()=>'',roundSummary:()=>'',result:()=>'',disposal:noPreview,sessionBanner:()=>'',bidderSeats:()=>'',L:{localize(){}},bind(){},bindNotebook(){},Tutorial:{bind(){}},Show:{sourceMarkup:()=>'',present(){}},E};
    runInNewContext(extract(app,'render')+'\nrender();',{...context,roundKey:()=>'solo',renderedRound:'solo',renderedPhase:null,thinking:{},updateThinking(){},revealNextStep(){}});
  }
  for(const phase of ['auction','round-summary','result','ended']){
    const context={state:{credentials:{code:'SALE01'},connection:'Connected',view:{phase,round:1,auctionNumber:1,lots:[],selfId:'host',self:{cash:100,role:'appraiser'},winnerId:null}},renderedTurn:null,main,document,window:{sessionStorage:{}},toolbar:()=>'',status:()=>'',seats:()=>'',recoveryPanel:()=>'',auction:()=>'',roundSummary:()=>'',result:()=>'',disposal:noPreview,L:{localize(){}},bind(){},Tutorial:{bind(){}},updateRecoveryClocks(){},Notes:{bind(){}},Show:{sourceMarkup:()=>'',valuationMarkup:()=>''},showCurrentScene(){},E};
    runInNewContext(extract(online,'render')+'\nrender();',{...context,scheduleThinking(){}});
  }
});

test('the room sale hint names an unused ability gain but never selects it or changes the comparison',()=>{
  const empty=fixture('room','collector',{slots:[]}),{input,html}=disposal('room',empty);
  assert.match(html,/Your ability can add value here/);
  assert.match(html,/<li><span data-no-localize>A<\/span> · <span>Old Harbor mantel clock<\/span><\/li><li><span data-no-localize>C<\/span> · <span>Original harbor survey<\/span><\/li><\/ul><p><span>Net gain vs ordinary sale<\/span> <strong class="positive">\+92<\/strong>/,'the most valuable Old Harbor pair, as the engine plans it');
  assert.equal(input.special.recovery,input.ordinary.recovery,'the hint does not turn into a selected ability quote');
  assert.deepEqual(plain(empty.state.pairSlots),[]);
  assert.doesNotMatch(disposal('room',fixture('room','collector')).html,/Your ability can add value here/,'a chosen pair replaces the hint');
  assert.doesNotMatch(disposal('room',fixture('room','appraiser',{slots:[]})).html,/Your ability can add value here/);
  assert.ok(html.indexOf('online-sale-controls')<html.indexOf('sale-comparison'),'sale choices come first in the main column');
});

test('a crate that cannot host the winner’s ability sells at ordinary prices and says why', () => {
  const oneGenuine = ['crew-badge', 'replica-cup', 'replica-badge', 'toy-camera', 'map-print', 'replica-camera'];
  for (const kind of ['solo', 'room']) {
    const {html, input} = disposal(kind, fixture(kind, 'curator', {slots: [], catalogIds: oneGenuine, mode: 'ordinary'}));
    assert.match(html, /<p class="sale-ability-blocked">Not possible in this crate: an exhibition needs three genuine, intact objects from different categories\.<\/p>/, kind);
    assert.doesNotMatch(html, kind === 'solo' ? /data-sale="special"/ : /data-online-sale="special"/, `${kind}: no ability button`);
    assert.equal(input.special, null, `${kind}: no ability column in the comparison`);
    assert.doesNotMatch(disposal(kind, fixture(kind, 'curator', {slots: []})).html, /sale-ability-blocked/, `${kind}: a crate with an exhibition shows no warning`);
  }
});
