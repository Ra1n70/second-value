import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const require=createRequire(import.meta.url), E=require('../game/engine.cjs');
const source=await readFile(new URL('../game/client/tutorial.js',import.meta.url),'utf8');
function setup(options={}) {
  const events={},dialogEvents={},writes=[],reads=[],nodes=[],liveGame={cash:812,phase:'bid',draft:630};
  let bodyAppends=0,closeHelp=0,networkCalls=0,localized=0;
  const dialog={open:false,isConnected:true,innerHTML:'',setAttribute(){},removeAttribute(){this.open=false;},
    addEventListener(name,callback){dialogEvents[name]=callback;},
    showModal(){this.open=true;},close(){this.open=false;},
    querySelector(){return {focus(){}};}};
  const help={open:true,close(){this.open=false;closeHelp++;}};
  const doc={body:{appendChild(node){nodes.push(node);bodyAppends++;}},activeElement:{isConnected:true,closest(){return null;},focus(){}},
    addEventListener(name,callback){(events[name] ||= []).push(callback);},
    createElement(){return dialog;},getElementById(id){return id==='help'?help:null;}};
  const locale={language:'en',localize(){localized++;},setLanguage(language){this.language=language;(events['secondvalue:languagechange']||[]).forEach(callback=>callback());}};
  const context={module:{exports:{}},SecondValue:E,SecondValueLocale:locale,document:doc,liveGame,
    addEventListener(name,callback){(events[name] ||= []).push(callback);},
    localStorage:{getItem(key){reads.push(key);if(options.blockStorage)throw new Error('blocked');return '{malformed progress';},setItem(key,value){if(options.blockStorage)throw new Error('blocked');writes.push([key,value]);}},
    fetch(){networkCalls++;throw new Error('No network is allowed for tutorial.');}};
  runInNewContext(source,context);
  function target(attributes={}) {
    return {dataset:attributes,closest(selector){if(selector==='[data-open-tutorial]')return attributes.open?this:null;if(selector==='[data-tutorial-select]')return 'tutorialSelect' in attributes?this:null;if(selector==='[data-tutorial-mode]')return 'tutorialMode' in attributes?this:null;if(selector==='[data-tutorial-action]')return 'tutorialAction' in attributes?this:null;return null;}};
  }
  return {api:context.module.exports,doc,dialog,events,dialogEvents,writes,reads,liveGame,locale,
    open(){events.click[0]({target:target({open:true}),preventDefault(){}});},
    click(action){dialogEvents.click({target:target({tutorialAction:action})});},
    select(index){dialogEvents.click({target:target({tutorialSelect:String(index)})});},
    mode(mode){dialogEvents.click({target:target({tutorialMode:mode})});},
    draft(value){dialogEvents.input({target:{id:'tutorial-bid',value}});},
    review(){dialogEvents.submit({preventDefault(){}});},
    get appends(){return bodyAppends;},get helpClosed(){return closeHelp;},get networkCalls(){return networkCalls;},get localized(){return localized;}};
}
function bid(practice,amount) {
  practice.act('select',0);practice.act('next');practice.act('draft',String(amount));practice.act('review');practice.act('confirm');
  return practice;
}

test('a curated crate comes from the current catalog and never mutates it',()=>{
  const before=JSON.stringify(E.catalogItems()),runtime=setup(),practice=runtime.api.createPractice(E);
  assert.equal(practice.items.length,6);
  assert.equal(practice.base,400);assert.equal(practice.reserve,40);assert.equal(practice.startingCash,1000);
  assert.equal(practice.state.stage,0);assert.equal(practice.state.selected,null);
  assert.equal(practice.items[0].catalogId,'harbor-clock');
  practice.items[0].base=9999;practice.items[0].repair.cost=9999;
  assert.equal(practice.items[0].base,180);assert.equal(practice.items[0].repair.cost,80);
  assert.throws(()=>practice.act('next'),/Choose an object first/);
  for(const slot of [-1,6,0.5,'0'])assert.throws(()=>practice.act('select',slot),/valid practice object/);
  assert.equal(JSON.stringify(E.catalogItems()),before);
});

test('practice validates whole-number bids and uses the real final-round reserve and tie rules',()=>{
  const runtime=setup();
  for(const value of ['',0,-1,39,1001,'1,000','42.5','NaN','1e3','Infinity']) {
    const practice=runtime.api.createPractice(E);
    practice.act('select',0);practice.act('next');practice.act('draft',value);
    assert.throws(()=>practice.act('review'),/whole-number practice bid/);
    assert.equal(practice.state.review,false);
    assert.equal(practice.state.bid,null);
  }
  for(const [amount,won,winning] of [[40,false,300],[299,false,300],[300,true,300],[350,true,350],[1000,true,1000]]) {
    const practice=bid(runtime.api.createPractice(E),amount);
    assert.equal(practice.state.stage,2);assert.equal(practice.state.won,won);assert.equal(practice.state.winningBid,winning);
  }
});

test('review, edit, back, retry, and replay preserve only the teaching state',()=>{
  const runtime=setup(),practice=runtime.api.createPractice(E);
  practice.act('select',4);practice.act('next');practice.act('draft','700');practice.act('review');
  assert.equal(practice.state.review,true);assert.equal(practice.state.bid,null);
  practice.act('edit');practice.act('draft','350');practice.act('back');
  assert.equal(practice.state.stage,0);assert.equal(practice.state.draft,'350');
  practice.act('next');assert.throws(()=>practice.act('confirm'),/unavailable/);
  practice.act('review');practice.act('confirm');practice.act('retry');
  assert.equal(practice.state.stage,1);assert.equal(practice.state.bid,null);
  practice.act('review');practice.act('confirm');practice.act('compare');practice.act('back');
  assert.equal(practice.state.stage,2);
  practice.act('reset');assert.equal(practice.state.stage,0);assert.equal(practice.state.selected,null);assert.equal(practice.state.draft,'350');
  assert.deepEqual(runtime.liveGame,{cash:812,phase:'bid',draft:630});assert.equal(runtime.networkCalls,0);
});

test('ordinary and explicit Restorer sale receipts charge bid and fee exactly once, including a loss',()=>{
  const runtime=setup(),before=JSON.stringify(E.catalogItems());
  for(const [mode,amount,sale,cost,recovery,profit,cash] of [['ordinary',350,400,0,400,50,1050],['special',350,525,80,445,95,1095],['special',1000,525,80,445,-555,445]]) {
    const practice=bid(runtime.api.createPractice(E),amount);practice.act('compare');practice.act('mode',mode);
    const plan=practice.plan();assert.equal(plan.recovery,recovery);assert.equal(plan.cost,cost);
    practice.act('settle');const receipt=practice.state.receipt;
    assert.equal(receipt.sale,sale);assert.equal(receipt.cost,cost);assert.equal(receipt.recovery,recovery);assert.equal(receipt.profit,profit);assert.equal(receipt.cash,cash);assert.equal(receipt.comparison,false);
    assert.throws(()=>practice.act('settle'),/unavailable/);
    assert.equal(practice.state.receipt.cash,cash);
  }
  assert.equal(JSON.stringify(E.catalogItems()),before);
});

test('a losing bid offers a labeled comparison while the learner cash remains unchanged',()=>{
  const practice=bid(setup().api.createPractice(E),299);
  practice.act('compare');practice.act('mode','special');practice.act('settle');
  assert.equal(practice.state.receipt.comparison,true);assert.equal(practice.state.receipt.winningBid,300);
  assert.equal(practice.state.receipt.profit,145);assert.equal(practice.state.receipt.cash,1000);
});

test('the modal binds safely across polling, closes help, and completion touches only its own optional flag',()=>{
  const runtime=setup(),{api,doc,dialog}=runtime;
  api.bind(doc);api.bind(doc);assert.equal(runtime.events.click.length,1);
  assert.match(api.buttonMarkup(),/data-open-tutorial>Learn in one crate/);
  runtime.open();assert.equal(dialog.open,true);assert.equal(runtime.helpClosed,1);assert.equal(runtime.appends,1);
  runtime.select(0);runtime.click('next');runtime.draft('1000');runtime.review();
  assert.match(dialog.innerHTML,/Sealed bid/);runtime.click('edit');assert.match(dialog.innerHTML,/value="1000"/);
  runtime.review();runtime.click('confirm');runtime.click('compare');runtime.mode('special');runtime.click('settle');
  assert.match(dialog.innerHTML,/−555/);assert.match(dialog.innerHTML,/Practice receipt/);
  runtime.click('finish');assert.equal(dialog.open,false);
  assert.deepEqual(runtime.writes,[['secondvalue:tutorial-complete','true']]);
  assert.deepEqual(runtime.reads,[]);assert.equal(runtime.networkCalls,0);assert.deepEqual(runtime.liveGame,{cash:812,phase:'bid',draft:630});
  runtime.open();assert.equal(runtime.appends,1);assert.match(dialog.innerHTML,/Choose an object and read the public clue/);
  runtime.click('close');assert.equal(dialog.open,false);
});

test('blocked storage and malformed saved progress cannot affect the lesson, and locale changes keep the open input',()=>{
  const runtime=setup({blockStorage:true});runtime.api.bind(runtime.doc);runtime.open();runtime.select(1);runtime.click('next');runtime.draft('450');
  const before=runtime.dialog.innerHTML,localizedBefore=runtime.localized;
  runtime.locale.setLanguage('es');assert.equal(runtime.dialog.innerHTML,before);assert.equal(runtime.localized,localizedBefore+1);
  runtime.review();runtime.click('confirm');runtime.click('compare');runtime.click('settle');
  assert.doesNotThrow(()=>runtime.click('finish'));assert.equal(runtime.dialog.open,false);
  runtime.open();assert.match(runtime.dialog.innerHTML,/Choose an object and read the public clue/);
  assert.deepEqual(runtime.reads,[]);assert.deepEqual(runtime.writes,[]);assert.equal(runtime.networkCalls,0);
});
