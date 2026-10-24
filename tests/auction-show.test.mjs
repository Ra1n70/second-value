import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const source = await readFile(new URL('../game/client/auction-show.js', import.meta.url),'utf8');

function setup(options = {}) {
  const scenes = [], timers = new Map(), stored = new Map(), languageListeners = [];
  let nextTimer = 0, localized = 0, audioCreated = 0, audioStarts = 0, audioStops = 0;
  const doc = {
    body:{appendChild(node){scenes.push(node);node.isConnected=true;}},
    addEventListener(){},
    createElement(){return element();}
  };
  function element() {
    const classes = new Set(), attrs = {}, listeners = {};
    return {
      ownerDocument:doc, innerHTML:'', isConnected:true,
      classList:{add(...values){values.forEach(value=>classes.add(value));},remove(...values){values.forEach(value=>classes.delete(value));},contains(value){return classes.has(value);}},
      setAttribute(key,value){attrs[key]=value;},getAttribute(key){return attrs[key];},
      addEventListener(key,callback){listeners[key]=callback;},click(){listeners.click?.();},
      remove(){this.isConnected=false;}
    };
  }
  class AudioContext {
    constructor(){audioCreated++;this.currentTime=0;this.destination={};}
    resume(){return Promise.resolve();}
    createOscillator(){return {frequency:{setValueAtTime(){}},connect(){},disconnect(){},start(){audioStarts++;},stop(){audioStops++;}};}
    createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
  }
  const context = {
    module:{exports:{}},document:doc,
    SecondValue:{ROLES:{broker:{short:'Antique Dealer'},restorer:{short:'Restorer'}}},
    SecondValueArt:{portraitFor(role){return {sheet:`assets/portrait-${role}-v2.png`,columns:1,rows:1,column:0,row:0};}},
    SecondValueLocale:{localize(){localized++;}},
    localStorage:{getItem(key){if(options.blockStorage)throw new Error('blocked');return stored.get(key) || null;},setItem(key,value){if(options.blockStorage)throw new Error('blocked');stored.set(key,value);}},
    addEventListener(event,callback){if(event==='secondvalue:languagechange')languageListeners.push(callback);},
    matchMedia(){return {matches:Boolean(options.reduced)};},
    setTimeout(callback){const id=++nextTimer;timers.set(id,callback);return id;},
    clearTimeout(id){timers.delete(id);},
    ...(options.audio ? {AudioContext} : {})
  };
  runInNewContext(source,context);
  return {show:context.module.exports,element,scenes,timers,stored,languageListeners,get localized(){return localized;},get audioCreated(){return audioCreated;},get audioStarts(){return audioStarts;},get audioStops(){return audioStops;}};
}

test('public source evidence contains no extra crate facts and escapes the supplied source copy', () => {
  const {show} = setup();
  assert.equal(show.sourceMarkup(null,{}),'');
  assert.equal(show.sourceMarkup('__proto__',{}),'');
  const markup = show.sourceMarkup('workshop',{workshop:{name:'<img onerror=x>',evidence:'A faded repair tag',hint:'Mechanical objects are more likely.',story:'A watchmaker’s collection.'}});
  assert.match(markup,/provenance-workshop/);
  assert.match(markup,/A faded repair tag/);
  assert.match(markup,/&lt;img onerror=x&gt;/);
  assert.doesNotMatch(markup,/<img/);
  assert.match(markup,/Exact identities and values remain hidden/);
});

test('valuation distinguishes the actual sale, affordable alternatives, and unfunded bids without fabricating profit', () => {
  const {show} = setup();
  assert.equal(show.valuationMarkup(null),'');
  const markup = show.valuationMarkup({ordinary:860,winningBid:800,rows:[
    {id:'a',name:'<b>Sound on</b>',role:'broker',actual:true,affordable:true,recovery:925,cost:25,abilityGain:65,profit:125},
    {id:'b',name:'If you had won',role:'restorer',actual:false,affordable:true,recovery:860,cost:0,abilityGain:0,profit:60},
    {id:'c',name:'No cash',role:'broker',actual:false,affordable:false,cashBefore:500,recovery:null,cost:null,abilityGain:null,profit:null}
  ]});
  assert.match(markup,/data-user-text>&lt;b&gt;Sound on&lt;\/b&gt;/);
  assert.match(markup,/Actual sale/);
  assert.match(markup,/If you had won/);
  assert.match(markup,/>\+125</);
  assert.match(markup,/>\+65</);
  const unfunded = markup.split('valuation-card is-hypothetical is-unaffordable')[1];
  assert.match(unfunded,/Not enough cash/);
  assert.match(unfunded,/Cash before bidding/);
  assert.doesNotMatch(unfunded,/Profit at this price|Sale after fees/);
  assert.match(markup,/They are not earnings/);
});

test('restored first state is a baseline and polling or language re-renders cannot replay a scene', () => {
  const runtime = setup(), container = runtime.element(), {show,scenes,timers} = runtime;
  assert.equal(show.present(container,{key:'restored-result',event:'settled',selfProfit:150}),false);
  assert.equal(scenes.length,0);
  assert.equal(show.present(container,{key:'next-inspect',event:null}),false);
  assert.equal(show.present(container,{key:'next-hammer',event:'hammer',winningBid:500,winnerName:'<button>name</button>',bids:[{name:'<svg>',bid:500}]}),true);
  assert.equal(scenes.length,1);
  assert.match(scenes[0].innerHTML,/data-user-text>&lt;button&gt;name&lt;\/button&gt;/);
  assert.match(scenes[0].innerHTML,/data-user-text>&lt;svg&gt;/);
  assert.equal(container.classList.contains('sv-show-hammer'),true);
  assert.equal(show.present(container,{key:'next-hammer',event:'hammer'}),false);
  assert.equal(container.classList.contains('sv-show-hammer'),false);
  assert.equal(scenes.length,1);
  runtime.languageListeners.forEach(callback=>callback());
  assert.equal(scenes.length,1);
  assert.equal(runtime.localized,2);
  [...timers.values()][0]();
  assert.equal(scenes[0].isConnected,false);
  assert.equal(show.present(container,{key:'next-hammer',event:'hammer'}),false);
});

test('reduced motion keeps a readable brief scene and never applies the table animation class', () => {
  const runtime = setup({reduced:true}), container = runtime.element();
  runtime.show.present(container,{key:'inspect',event:null});
  assert.equal(runtime.show.present(container,{key:'round',event:'round'}),true);
  assert.match(runtime.scenes[0].className,/is-reduced-motion/);
  assert.equal(container.classList.contains('sv-show-round'),false);
  assert.match(runtime.scenes[0].innerHTML,/No hammer this round/);
});

test('only explicitly canonical solo names opt into translation, and remain HTML-escaped', () => {
  const runtime = setup(), container = runtime.element();
  const row={id:'you',name:'You <script>',role:'restorer',actual:true,affordable:true,recovery:500,cost:0,abilityGain:0,profit:100};
  const board={ordinary:500,winningBid:400,rows:[row]};
  assert.match(runtime.show.valuationMarkup(board),/strong data-user-text>You &lt;script&gt;/);
  assert.match(runtime.show.valuationMarkup({...board,localizeNames:true}),/strong>You &lt;script&gt;/);
  runtime.show.present(container,{key:'inspect',event:null});
  runtime.show.present(container,{key:'hammer',event:'hammer',localizeNames:true,winnerName:'You',bids:[{name:'You',bid:400}],winningBid:400});
  assert.doesNotMatch(runtime.scenes[0].innerHTML,/data-user-text/);
  assert.match(runtime.scenes[0].innerHTML,/>You</);
});

test('desktop valuation fills its width for two, three, and four seats', () => {
  const {show} = setup();
  const row={id:'a',name:'Seat',role:'restorer',actual:false,affordable:true,recovery:500,cost:0,abilityGain:0,profit:100};
  for(const count of [2,3,4]) {
    const markup=show.valuationMarkup({ordinary:500,winningBid:400,rows:Array.from({length:count},(_,index)=>({...row,id:String(index)}))});
    assert.match(markup,new RegExp(`class="valuation-grid" style="--valuation-columns:${count}"`));
  }
});

test('audio is off until a user enables it, can be muted immediately, and optional storage failures do not break play', () => {
  const runtime = setup({audio:true,blockStorage:true}), button = runtime.element(), container = runtime.element();
  runtime.show.bindSoundToggle(button);
  runtime.show.bindSoundToggle(button);
  assert.equal(runtime.show.soundEnabled,false);
  assert.equal(runtime.audioCreated,0);
  runtime.show.present(container,{key:'inspect',event:null});
  runtime.show.present(container,{key:'silent-round',event:'round'});
  assert.equal(runtime.audioStarts,0);
  button.click();
  assert.equal(runtime.show.soundEnabled,true);
  assert.equal(runtime.audioCreated,1);
  assert.equal(button.getAttribute('aria-pressed'),'true');
  runtime.show.present(container,{key:'sound-hammer',event:'hammer',winningBid:100});
  assert.equal(runtime.audioStarts,4);
  const beforeMute=runtime.audioStops;
  button.click();
  assert.equal(runtime.show.soundEnabled,false);
  assert.equal(button.getAttribute('aria-pressed'),'false');
  assert.equal(runtime.audioStops-beforeMute,4);
  runtime.show.present(container,{key:'silent-settled',event:'settled',selfProfit:50});
  assert.equal(runtime.audioStarts,4);
});
