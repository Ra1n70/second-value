import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const require=createRequire(import.meta.url), E=require('../game/engine.cjs');
// The lessons practise with the opening cash of a table under the current rules.
const OPENING=E.startingCashFor(E.RULES_VERSION);
const source=await readFile(new URL('../game/client/tutorial.js',import.meta.url),'utf8');
const artModule={exports:{}};
runInNewContext(await readFile(new URL('../game/client/art.js',import.meta.url),'utf8'),{module:artModule});
const Art=artModule.exports;
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
  if(options.art)context.SecondValueArt=options.art;
  runInNewContext(source,context);
  function target(attributes={}) {
    return {dataset:attributes,closest(selector){if(selector==='[data-open-tutorial]')return attributes.open?this:null;if(selector==='[data-tutorial-select]')return 'tutorialSelect' in attributes?this:null;if(selector==='[data-tutorial-mode]')return 'tutorialMode' in attributes?this:null;if(selector==='[data-tutorial-action]')return 'tutorialAction' in attributes?this:null;if(selector==='[data-tutorial-pick]')return 'tutorialPick' in attributes?this:null;if(selector==='[data-tutorial-lesson]')return 'tutorialLesson' in attributes?this:null;return null;}};
  }
  return {api:context.module.exports,doc,dialog,events,dialogEvents,writes,reads,liveGame,locale,
    open(){events.click[0]({target:target({open:true}),preventDefault(){}});},
    click(action){dialogEvents.click({target:target({tutorialAction:action})});},
    select(index){dialogEvents.click({target:target({tutorialSelect:String(index)})});},
    mode(mode){dialogEvents.click({target:target({tutorialMode:mode})});},
    pick(index){dialogEvents.click({target:target({tutorialPick:String(index)})});},
    lesson(id){dialogEvents.click({target:target({tutorialLesson:id})});},
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
  assert.equal(practice.base,400);assert.equal(practice.reserve,40);assert.equal(practice.startingCash,OPENING);assert.equal(OPENING,1500);
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
  for(const value of ['',0,-1,39,OPENING+1,'1,500','42.5','NaN','1e3','Infinity']) {
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
  for(const [mode,amount,sale,cost,recovery,profit,cash] of [['ordinary',350,400,0,400,50,OPENING+50],['special',350,525,80,445,95,OPENING+95],['special',1000,525,80,445,-555,OPENING-555]]) {
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
  assert.equal(practice.state.receipt.profit,145);assert.equal(practice.state.receipt.cash,OPENING);
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

test('real art metadata renders nested WebP assets through public clues, reveal and repair lesson',()=>{
  const runtime=setup({art:Art});runtime.api.bind(runtime.doc);runtime.open();
  const items=Array.from(runtime.api.createPractice(E).items);
  const images=()=>Array.from(runtime.dialog.innerHTML.matchAll(/background-image:url\('([^']+)'\)/g),match=>match[1]);
  const styles=()=>Array.from(runtime.dialog.innerHTML.matchAll(/class="tutorial-art"[^>]+style="([^"]+)"/g),match=>match[1]);
  const contained='background-size:contain;background-repeat:no-repeat;background-position:center';
  const knownPaths=items.map(item=>Art.visualFor(item,true).sheet);
  for(const path of knownPaths)assert.match(path,/^assets\/catalog-original-v2\/[\w-]+\.webp$/);
  assert.deepEqual(images(),items.map((item,index)=>Art.visualFor(item,index===3).sheet));
  assert.equal(images().filter(path=>path==='assets/covered-lots-v1.png').length,5,'only the publicly revealed toy camera uses identity art before hammer');
  assert.ok(images().includes(knownPaths[3]));
  for(const [index,item] of items.entries()) {
    if(index===3)assert.ok(styles()[index].includes(contained),'the single-cell toy camera must fit its wide tutorial box without stretching');
    else {
      const visual=Art.visualFor(item,false),x=100*visual.column/(visual.columns-1),y=100*visual.row/(visual.rows-1);
      assert.ok(styles()[index].includes(`background-size:${visual.columns*100}% ${visual.rows*100}%;background-position:${x}% ${y}%`),'covered atlas cells keep their original size and grid position');
      assert.ok(!styles()[index].includes('contain'));
    }
  }
  assert.doesNotMatch(runtime.dialog.innerHTML,/tutorial-art-fallback|catalog-lots-v1\.png/);
  for(const path of knownPaths.filter((_,index)=>index!==3))assert.ok(!images().includes(path),'covered objects must not reveal their new identity art');
  runtime.select(0);runtime.click('next');runtime.draft('350');runtime.review();runtime.click('confirm');
  assert.deepEqual(images(),knownPaths,'all six actual identity paths survive the tutorial asset allowlist after hammer');
  assert.doesNotMatch(runtime.dialog.innerHTML,/tutorial-art-fallback/);
  assert.equal(styles().filter(style=>style.includes(contained)).length,6,'every revealed standalone image preserves aspect ratio in the 70-by-57 lesson boxes');
  runtime.click('compare');
  assert.deepEqual(images(),[knownPaths[0]],'the repair explanation keeps the same standalone harbor-clock WebP');
  assert.ok(styles()[0].includes(contained));
  assert.doesNotMatch(runtime.dialog.innerHTML,/tutorial-art-fallback/);
  assert.equal(runtime.networkCalls,0);
});

function drill(role,picks) {
  const practice=setup().api.createDrill(E,role);
  for(const index of picks)practice.act('pick',index);
  return practice;
}
const plain=value=>JSON.parse(JSON.stringify(value));
test('the Collector drill scores pairs with the shared engine and explains each rejected pick',()=>{
  const before=JSON.stringify(E.catalogItems()),practice=drill('collector',[0,4]);
  assert.deepEqual(plain(practice.items.map(item=>item.catalogId)),['harbor-clock','crew-badge','navy-badge','replica-badge','harbor-map','railway-map']);
  assert.ok(practice.notes().every(note=>note.ok));
  assert.throws(()=>practice.act('pick',1),/Remove a choice/);
  practice.act('check');
  assert.deepEqual(plain(practice.state.receipt),{sale:810,bonus:92,cost:0,recovery:902,profit:142,ordinaryProfit:50,bestProfit:142,best:[0,4],cash:OPENING+142});
  practice.act('retry');assert.equal(practice.state.stage,0);assert.deepEqual(plain(practice.state.selected),[0,4]);
  practice.act('pick',4);practice.act('pick',1);practice.act('check');
  assert.equal(practice.state.receipt.profit,120);assert.equal(practice.state.receipt.bestProfit,142);assert.deepEqual(plain(practice.state.receipt.best),[0,4]);
  const reasons=picks=>drill('collector',picks).notes().map(note=>note.reason);
  assert.deepEqual(plain(reasons([3,5])),['Reproductions never count toward a pair.','Not an Old Harbor piece. Your theme is locked.']);
  assert.deepEqual(plain(reasons([1,2])),Array(2).fill('Same category as your other choice. A pair needs two categories.'));
  assert.deepEqual(plain(reasons([2,3])),[null,'Reproductions never count toward a pair.'],'an ineligible pick does not make a valid one share its category');
  const invalid=drill('collector',[1,2]);
  assert.throws(()=>invalid.act('check'),/do not qualify/);assert.equal(invalid.state.stage,0);assert.equal(invalid.state.receipt,null);
  assert.throws(()=>drill('collector',[0]).act('check'),/exactly two/);
  for(const slot of [-1,6,0.5,'0'])assert.throws(()=>drill('collector',[]).act('pick',slot),/valid practice object/);
  assert.throws(()=>setup().api.createDrill(E,'appraiser'),/valid practice drill/);
  assert.equal(JSON.stringify(E.catalogItems()),before);
});

test('the Curator drill needs three intact genuine categories and shows the capped, fee-paying exhibition',()=>{
  const best=drill('curator',[0,1,5]);
  assert.deepEqual(plain(best.notes().map(note=>note.bonus)),[40,40,20],'the rangefinder and tea cup hit the 40 cap');
  best.act('check');
  assert.deepEqual(plain(best.state.receipt),{sale:1010,bonus:100,cost:25,recovery:1085,profit:185,ordinaryProfit:110,bestProfit:185,best:[0,1,5],cash:OPENING+185});
  const cheaperCup=drill('curator',[0,2,5]);cheaperCup.act('check');
  assert.equal(cheaperCup.state.receipt.profit,169);assert.deepEqual(plain(cheaperCup.state.receipt.best),[0,1,5]);
  assert.deepEqual(plain(drill('curator',[1,2,3]).notes().map(note=>note.reason)),[...Array(2).fill('Shares a category with another choice. Use three categories.'),'Only intact objects can be exhibited.']);
  assert.deepEqual(plain(drill('curator',[0,4,5]).notes().map(note=>note.reason)),[null,'Reproductions cannot be exhibited.',null]);
  assert.throws(()=>drill('curator',[0,1]).act('check'),/exactly three/);
  const reset=drill('curator',[0,1,5]);reset.act('reset');assert.deepEqual(plain(reset.state),{stage:0,selected:[],receipt:null});
});

test('lesson tabs keep each lesson in place, and drills never write the completion flag',()=>{
  const runtime=setup(),{dialog}=runtime;runtime.api.bind(runtime.doc);runtime.open();
  assert.match(dialog.innerHTML,/data-tutorial-lesson="restorer" aria-pressed="true"/);
  runtime.select(0);runtime.click('next');
  runtime.lesson('collector');
  assert.match(dialog.innerHTML,/Quick drill · Collector/);assert.match(dialog.innerHTML,/Deliver a matching pair/);
  assert.match(dialog.innerHTML,/data-tutorial-action="check" disabled/);
  runtime.pick(0);runtime.pick(4);
  assert.match(dialog.innerHTML,/data-tutorial-pick="1" aria-pressed="false" disabled/,'a full selection disables other objects like the real sale');
  runtime.click('check');assert.match(dialog.innerHTML,/Drill receipt/);assert.match(dialog.innerHTML,/\+142/);assert.match(dialog.innerHTML,/You found the best choice/);
  runtime.lesson('restorer');assert.match(dialog.innerHTML,/Enter a sealed bid, then review it/,'switching back keeps the guided crate step');
  runtime.lesson('collector');assert.match(dialog.innerHTML,/Drill receipt/);
  runtime.lesson('curator');runtime.pick(0);runtime.pick(2);runtime.pick(5);runtime.click('check');
  assert.match(dialog.innerHTML,/A better choice was available/);assert.match(dialog.innerHTML,/Hand-painted tea cup/);
  runtime.click('finish');assert.equal(dialog.open,false);assert.deepEqual(plain(runtime.writes),[]);
  runtime.open();assert.match(dialog.innerHTML,/Choose an object and read the public clue/);
  runtime.lesson('curator');assert.match(dialog.innerHTML,/data-tutorial-action="check" disabled/,'reopening resets the drills');
  assert.equal(runtime.networkCalls,0);assert.deepEqual(plain(runtime.liveGame),{cash:812,phase:'bid',draft:630});
});
