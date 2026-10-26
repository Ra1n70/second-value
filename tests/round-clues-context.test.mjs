import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),E=require('../game/engine.cjs'),R=require('../game/room-engine.cjs');
const client=new URL('../game/client/',import.meta.url);
const [app,online,clueSource,recoverySource]=await Promise.all(['app.js','online.js','round-clues.js','recovery.js'].map(file=>readFile(new URL(file,client),'utf8')));
const extract=(source,name)=>{
  const fn=source.match(new RegExp('  function '+name+'\\([^\\n]*\\) \\{[\\s\\S]*?\\n  \\}'))?.[0];
  assert.ok(fn,`actual ${name} function must exist`);return fn;
};
const moduleFor=source=>{const context={module:{exports:{}}};runInNewContext(source,context);return context.module.exports;};
const Clues=moduleFor(clueSource),Recovery=moduleFor(recoverySource),plain=value=>JSON.parse(JSON.stringify(value));
const functions=(source,names)=>names.map(name=>extract(source,name)).join('\n');
function projection(kind,data){
  let input=null,calls=0;
  const context={E,Clues:{markup(value){calls++;input=plain(value);return Clues.markup(value);}},...(kind==='solo'?{game:data}:{state:{view:data}})};
  const before=JSON.stringify(data),source=kind==='solo'?app:online;
  const html=runInNewContext(functions(source,[...(kind==='solo'?['informationFor']:[]),'roundCluesMarkup'])+'\nroundCluesMarkup();',context);
  assert.equal(JSON.stringify(data),before,'rendering public evidence cannot mutate the game or seat');
  return {html,input,calls};
}
const command=(room,id,type,fields={})=>R.applyAction(room,id,{type,turnId:room.turnId,...fields});
function roomStages(seats=2){
  const room=R.createRoom({code:'CLUES1',seed:73,host:{id:'host',name:'Host',role:'appraiser'}});
  for(let i=1;i<seats;i++)R.joinRoom(room,{id:`p${i}`,name:`Guest ${i}`,role:'restorer'});
  for(const p of room.players)command(room,p.id,'ready',{ready:true});
  command(room,'host','start');const privateSlot=(room.publicIndex+1)%6;
  command(room,'host','inspect',{slot:privateSlot});
  const stages=[];
  for(let round=1;round<=3;round++){
    stages.push({host:R.viewFor(room,'host'),guest:R.viewFor(room,'p1')});
    if(round<3){for(const p of room.players)command(room,p.id,'bid',{amount:900,pass:false});assert.equal(room.phase,'round-summary');command(room,'host','next');}
  }
  return {room,privateSlot,stages};
}

test('actual solo strip adapter gates each clue and never promotes an Appraiser private identity',()=>{
  const game=E.newGame('appraiser',73,'harbor',{noBots:true}),privateSlot=(game.publicIndex+1)%6;
  E.useSkill(game,privateSlot);
  for(const phase of ['inspect','bid'])for(const round of [1,2,3]){
    game.phase=phase;game.round=round;const {input,html}=projection('solo',game);
    assert.equal(input.genuineCount,round>=2?game.items.filter(item=>item.genuine).length:null);
    assert.equal(input.repairableCount,round===3?game.items.filter(item=>item.genuine&&item.condition==='damaged'&&item.repair).length:null);
    assert.equal(input.publicLot?.slot??null,round===3?game.publicIndex:null);
    if(round===1)assert.equal(html,'');
    if(round===2)assert.doesNotMatch(html,/Repairable objects|data-round-clue-slot/);
    assert.ok(!html.includes(game.items[privateSlot].name),'private Appraiser identity stays outside the public strip');
    if(round===3){assert.equal(input.publicLot.source,'Public reveal');assert.equal(input.publicLot.label,game.items[game.publicIndex].name);assert.ok(html.includes(game.items[game.publicIndex].name));}
  }
  for(const phase of ['round-summary','dispose','result']){game.phase=phase;const result=projection('solo',game);assert.equal(result.html,'');assert.equal(result.calls,0);}
});

test('actual 2/4-seat room adapters publish identical stage evidence without another identity',()=>{
  for(const seats of [2,4]){
    const {room,privateSlot,stages}=roomStages(seats);
    for(const [index,{host,guest}] of stages.entries()){
      const round=index+1,a=projection('room',host),b=projection('room',guest);
      assert.equal(a.html,b.html,'public evidence is identical for the Appraiser and another seat');
      assert.deepEqual(a.input,b.input);
      assert.equal(a.input.genuineCount,round>=2?host.public.genuineCount:null);
      assert.equal(a.input.repairableCount,round===3?host.public.repairableCount:null);
      assert.equal(a.input.publicLot?.slot??null,round===3?room.publicIndex:null);
      assert.ok(!a.html.includes(room.items[privateSlot].name));
      if(round===1)assert.equal(a.html,'');
      if(round===2){const poisoned=structuredClone(host);poisoned.public.publicIndex=privateSlot;poisoned.public.repairableCount=6;assert.equal(projection('room',poisoned).html,a.html);}
    }
    const bad=structuredClone(stages[2].host);bad.public.publicIndex=privateSlot;
    assert.equal(projection('room',bad).input.publicLot,null,'known private source cannot become the public reveal');
    bad.phase='result';assert.equal(projection('room',bad).calls,0);
  }
});

function highlighted(html,attribute){return [...html.matchAll(/<button\b[^>]*>/g)].map(match=>match[0]).filter(tag=>/\bis-round-reveal\b/.test(tag)).map(tag=>Number(tag.match(new RegExp(attribute+'="(\\d+)"'))[1]));}
test('actual card renderers highlight only the R3 public slot, including an earlier private inspection',()=>{
  const {room,privateSlot,stages}=roomStages();
  const game=E.newGame('appraiser',73,'harbor',{noBots:true});E.useSkill(game,(game.publicIndex+1)%6);
  for(const round of [1,2,3]){
    game.round=round;
    const solo=runInNewContext(functions(app,['informationFor','objectCards'])+'\nobjectCards();',{game,E,itemArt:()=>''});
    const roomHtml=runInNewContext(extract(online,'cards')+'\ncards();',{state:{view:stages[round-1].host,selected:privateSlot},E,art:()=>'',letter:slot=>String.fromCharCode(65+slot)});
    assert.deepEqual(highlighted(solo,'data-item'),round===3?[game.publicIndex]:[]);
    assert.deepEqual(highlighted(roomHtml,'data-online-lot'),round===3?[room.publicIndex]:[]);
  }
});

function navigation(kind,data){
  const events=[],button={dataset:{roundClueSlot:String(kind==='solo'?data.publicIndex:data.public.publicIndex)},addEventListener(_event,fn){this.click=fn;}};
  const main={querySelectorAll:selector=>selector==='[data-round-clue-slot]'?[button]:[],querySelector:selector=>selector.includes('.object-button')?{focus:options=>events.push(['focus',plain(options)])}:selector==='#selected-object'||selector==='#online-selected-object'?{scrollIntoView:options=>events.push(['scroll',plain(options)])}:null};
  const pending={type:'bid',amount:431,pass:false},context={E,main,window:{matchMedia:()=>({matches:true})},draftBid:'431',pendingAction:pending,pendingReview:pending,save:()=>events.push(['save']),persist:()=>events.push(['persist']),render:()=>events.push(['render']),act:()=>assert.fail('clue navigation must not act'),command:()=>assert.fail('clue navigation must not command'),poll(){},clearSeat(){},start(){}};
  if(kind==='solo')context.game=data;else context.state={view:data,selected:(data.public.publicIndex+1)%6,draftBid:'431',draftTurn:data.turnId,bidOpen:true};
  runInNewContext(functions(kind==='solo'?app:online,[...(kind==='solo'?['informationFor']:[]),'selectRoundClue','bind'])+'\nbind();',context);
  return {context,button,events,pending};
}
test('actual strip click bindings only select the public object and preserve pending bids and turn',()=>{
  const game=E.newGame('appraiser',73,'harbor',{noBots:true});game.round=3;game.phase='bid';game.selected=(game.publicIndex+1)%6;
  const view=roomStages().stages[2].host;
  for(const [kind,data] of [['solo',game],['room',view]]){
    const {context,button,events,pending}=navigation(kind,data),before=plain(kind==='solo'?context.game:context.state);
    button.click();const after=plain(kind==='solo'?context.game:context.state),slot=kind==='solo'?game.publicIndex:view.public.publicIndex;
    assert.equal(after.selected,slot);before.selected=slot;assert.deepEqual(after,before);
    assert.equal(context.pendingAction,pending);assert.equal(context.pendingReview,pending);assert.equal(context.draftBid,'431');
    assert.deepEqual(events.at(-1),['scroll',{block:'nearest',behavior:'auto'}]);
    assert.equal(events.filter(event=>event[0]==='render').length,1);
    for(const invalid of [-1,6,(slot+1)%6,NaN]){button.dataset.roundClueSlot=String(invalid);const count=events.length;button.click();assert.equal(events.length,count);}
    data.round=2;button.dataset.roundClueSlot=String(slot);const count=events.length;button.click();assert.equal(events.length,count,'earlier stages cannot navigate to a private/hidden identity');
  }
});

test('same-turn heartbeat and language listeners preserve strip evidence, selection and pending review',()=>{
  const view=roomStages().stages[2].host;view.serverNow=10;
  const pending={type:'bid',turnId:view.turnId,amount:431,pass:false};let renders=0;
  const state={credentials:{code:view.code},view,draftTurn:view.turnId,draftBid:'431',saleTurn:null,selected:view.public.publicIndex,bidOpen:true,connection:'Connected'};
  const context={state,pendingReview:pending,presenceAnchor:null,lastRoomUpdate:0,performance:{now:()=>10},minimumBid:v=>Math.max(1,v.reservePrice),persist(){},render(){renders++;},updateRecoveryClocks(){},Recovery,review:{open:true,close:()=>assert.fail('heartbeat must preserve pending review')},next:{...structuredClone(view),serverNow:20}};
  const before=projection('room',view).html;
  runInNewContext(extract(online,'acceptView')+'\nacceptView(next);',context);
  assert.equal(renders,0);assert.equal(state.selected,view.public.publicIndex);assert.equal(state.draftBid,'431');assert.equal(context.pendingReview,pending);
  assert.equal(projection('room',state.view).html,before);
  for(const source of [app,online]){
    const listener=source.match(/  window\.addEventListener\('secondvalue:languagechange', \(\) => \{[\s\S]*?\n  \}\);/)?.[0];assert.ok(listener);
    let callback,localized=0;const link={},snapshot=JSON.stringify(state);
    runInNewContext(listener,{...context,window:{addEventListener(_event,fn){callback=fn;}},document:{body:{},getElementById:()=>link,querySelector:()=>link},L:{language:'es',localize(){localized++;}},setConnection:()=>{},pendingAction:pending});
    callback();assert.equal(localized,1);assert.equal(JSON.stringify(state),snapshot);assert.equal(context.pendingReview,pending);
  }
});
