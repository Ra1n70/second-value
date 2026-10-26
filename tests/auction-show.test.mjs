import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const source = await readFile(new URL('../game/client/auction-show.js', import.meta.url),'utf8');

function setup(options = {}) {
  const scenes = [], timers = new Map(), stored = new Map(), languageListeners = [];
  const documentListeners = new Map(), sources = [], requests = [], pendingFetch = [], musicInstances = [], contexts = [];
  let nextTimer = 0, localized = 0, audioCreated = 0, audioStarts = 0, audioStops = 0, decodeCalls = 0;
  if(options.savedSound)stored.set('secondvalue:auction-sound','on');
  if(options.savedMusic)stored.set('secondvalue:auction-music','on');
  const doc = {
    hidden:false,
    body:{appendChild(node){scenes.push(node);node.isConnected=true;}},
    addEventListener(event,callback){if(!documentListeners.has(event))documentListeners.set(event,[]);documentListeners.get(event).push(callback);},
    fire(event,target){for(const callback of documentListeners.get(event)||[])callback({target});},
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
    constructor(){audioCreated++;this.currentTime=0;this.destination={};this.state='suspended';this.listeners={};contexts.push(this);}
    addEventListener(event,fn){this.listeners[event]=fn;}
    resume(){if(options.rejectResume)return Promise.reject(new Error('blocked'));this.state='running';return Promise.resolve();}
    decodeAudioData(){decodeCalls++;return options.rejectDecode?Promise.reject(new Error('bad audio')):Promise.resolve({duration:.5,decoded:decodeCalls});}
    createBufferSource(){const source={connect(){},disconnect(){},start(at){audioStarts++;source.at=at;},stop(){audioStops++;}};sources.push(source);return source;}
    createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
  }
  class Audio {
    constructor(){this.paused=true;this.plays=0;this.pauses=0;this.listeners={};musicInstances.push(this);}
    addEventListener(event,fn){this.listeners[event]=fn;}
    play(){this.plays++;if(options.rejectPlay)return Promise.reject(new Error('autoplay blocked'));if(options.deferPlay)return new Promise((resolve,reject)=>{this.resolve=()=>{this.paused=false;resolve();};this.reject=reject;});this.paused=false;return Promise.resolve();}
    pause(){this.paused=true;this.pauses++;}
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
    ...(options.audio ? {AudioContext,fetch(url){requests.push(url);const response={ok:!options.rejectFetch,arrayBuffer(){return Promise.resolve(new ArrayBuffer(1));}};return options.deferFetch?new Promise(resolve=>pendingFetch.push(()=>resolve(response))):Promise.resolve(response);}} : {}),
    ...(options.music ? {Audio} : {})
  };
  runInNewContext(source,context);
  return {show:context.module.exports,element,scenes,timers,stored,languageListeners,documentListeners,doc,sources,requests,pendingFetch,musicInstances,contexts,get localized(){return localized;},get audioCreated(){return audioCreated;},get audioStarts(){return audioStarts;},get audioStops(){return audioStops;},get decodeCalls(){return decodeCalls;}};
}
const flush=async()=>{for(let count=0;count<24;count++)await Promise.resolve();};

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

test('recorded audio loads only after enable, previews once, and mute stops scheduled sources immediately', async () => {
  const runtime = setup({audio:true,blockStorage:true}), button = runtime.element(), container = runtime.element();
  runtime.show.bindSoundToggle(button);
  runtime.show.bindSoundToggle(button);
  assert.equal(runtime.show.soundEnabled,false);
  assert.equal(runtime.audioCreated,0);
  assert.equal(runtime.requests.length,0);
  runtime.show.present(container,{key:'inspect',event:null});
  runtime.show.present(container,{key:'silent-round',event:'round'});
  assert.equal(runtime.audioStarts,0);
  button.click();
  await flush();
  assert.equal(runtime.show.soundEnabled,true);
  assert.equal(runtime.audioCreated,1);
  assert.equal(runtime.requests.length,3);
  assert.equal(runtime.decodeCalls,3);
  assert.equal(runtime.audioStarts,1,'the enable click previews the loaded paper sample');
  assert.equal(button.getAttribute('aria-pressed'),'true');
  runtime.show.present(container,{key:'sound-hammer',event:'hammer',winningBid:100});
  assert.equal(runtime.audioStarts,3);
  assert.equal(runtime.sources.at(-1).at,.47,'the gavel is scheduled with the hammer animation');
  const beforeMute=runtime.audioStops;
  button.click();
  assert.equal(runtime.show.soundEnabled,false);
  assert.equal(button.getAttribute('aria-pressed'),'false');
  assert.equal(runtime.audioStops-beforeMute,3,'future gavel sources are stopped too');
  runtime.show.present(container,{key:'silent-settled',event:'settled',selfProfit:50});
  assert.equal(runtime.audioStarts,3);
  button.click();await flush();
  assert.equal(runtime.requests.length,3,'re-enabling reuses the decoded samples');
  assert.equal(runtime.decodeCalls,3);
});

test('late sample loading cannot replay an auction event or an enable preview cancelled by mute',async()=>{
  const runtime=setup({audio:true,deferFetch:true}),button=runtime.element(),container=runtime.element();
  runtime.show.bindSoundToggle(button);runtime.show.present(container,{key:'initial'});button.click();await flush();
  runtime.show.present(container,{key:'hammer',event:'hammer'});
  assert.equal(runtime.audioStarts,0);
  button.click();runtime.pendingFetch.forEach(resolve=>resolve());await flush();
  assert.equal(runtime.audioStarts,0,'neither the old event nor cancelled preview plays after load');
  button.click();await flush();assert.equal(runtime.audioStarts,1,'only the new explicit enable previews');
  runtime.show.present(container,{key:'hammer',event:'hammer'});
  assert.equal(runtime.audioStarts,1,'polling still cannot replay the same auction');
});

test('an audio device suspension shows a paused control and the next gesture resumes cached samples',async()=>{
  const runtime=setup({audio:true}),button=runtime.element();runtime.show.bindSoundToggle(button);button.click();await flush();
  const context=runtime.contexts[0];context.state='suspended';context.listeners.statechange();
  assert.equal(runtime.show.soundEnabled,false);assert.match(button.innerHTML,/Sound paused/);
  runtime.doc.fire('pointerdown');await flush();
  assert.equal(runtime.show.soundEnabled,true);assert.equal(runtime.requests.length,3);assert.equal(runtime.audioCreated,1);
});

test('an explicit enable retries failed samples while sharing pending retries and retaining successful buffers',async()=>{
  const options={audio:true,rejectFetch:true},runtime=setup(options),button=runtime.element();
  runtime.show.bindSoundToggle(button);button.click();await flush();
  assert.equal(runtime.show.soundEnabled,false);assert.equal(runtime.requests.length,3);assert.equal(runtime.audioStarts,0);
  options.rejectFetch=false;options.deferFetch=true;button.click();await flush();
  assert.equal(runtime.requests.length,6,'the user retries the three failed requests without a reload');
  button.click();button.click();await flush();
  assert.equal(runtime.requests.length,6,'re-enabling during loading shares the in-flight retries');
  runtime.pendingFetch.forEach(resolve=>resolve());await flush();
  assert.equal(runtime.show.soundEnabled,true);assert.equal(runtime.audioStarts,1,'only the current enable gets its preview');
  assert.equal(runtime.decodeCalls,3);assert.equal(runtime.audioCreated,1);
  button.click();button.click();await flush();
  assert.equal(runtime.requests.length,6,'successful decoded samples stay cached');assert.equal(runtime.audioStarts,2);
});

test('unavailable, blocked, failed downloads and failed decoding leave audio off without breaking presentation',async()=>{
  for(const options of [{},{audio:true,rejectResume:true},{audio:true,rejectFetch:true},{audio:true,rejectDecode:true}]){
    const runtime=setup(options),button=runtime.element(),container=runtime.element();runtime.show.bindSoundToggle(button);button.click();await flush();
    assert.equal(runtime.show.soundEnabled,false);assert.equal(button.getAttribute('aria-pressed'),'false');assert.equal(runtime.audioStarts,0);
    runtime.show.present(container,{key:'initial'});assert.equal(runtime.show.present(container,{key:'round',event:'round'}),true);
  }
});

test('music is independently opt in, loops at low volume and survives language updates without duplicate playback',async()=>{
  const runtime=setup({audio:true,music:true}),sound=runtime.element(),music=runtime.element();
  runtime.show.bindSoundToggle(sound);runtime.show.bindMusicToggle(music);runtime.show.bindMusicToggle(music);
  assert.equal(runtime.musicInstances.length,0);assert.equal(runtime.requests.length,0);assert.equal(runtime.show.musicEnabled,false);
  music.click();await flush();const track=runtime.musicInstances[0];
  assert.equal(runtime.show.musicEnabled,true);assert.equal(runtime.show.soundEnabled,false);assert.equal(runtime.requests.length,0);
  assert.equal(track.src,'/assets/audio/old-harbor-v1.mp3');assert.equal(track.loop,true);assert.equal(track.preload,'none');assert.equal(track.volume,.18);
  runtime.languageListeners.forEach(fn=>fn());assert.equal(track.plays,1);assert.equal(runtime.musicInstances.length,1);
  sound.click();await flush();assert.equal(runtime.show.musicEnabled,true);assert.equal(track.plays,1);
  music.click();assert.equal(track.paused,true);assert.equal(runtime.show.musicEnabled,false);assert.equal(runtime.show.soundEnabled,true);
});

test('saved on preferences wait for a gesture and visibility pauses and resumes the same music instance',async()=>{
  const runtime=setup({audio:true,music:true,savedSound:true,savedMusic:true}),sound=runtime.element(),music=runtime.element();
  runtime.show.bindSoundToggle(sound);runtime.show.bindMusicToggle(music);
  assert.match(sound.innerHTML,/Sound paused/);assert.match(music.innerHTML,/Music paused/);
  assert.equal(runtime.musicInstances.length,0);assert.equal(runtime.audioCreated,0);assert.equal(runtime.requests.length,0);
  runtime.doc.fire('pointerdown',{closest(){return {};}});await flush();
  assert.equal(runtime.musicInstances.length,0,'toggle capture cannot race the click handler');
  runtime.doc.fire('pointerdown');await flush();
  assert.equal(runtime.show.musicEnabled,true);assert.equal(runtime.show.soundEnabled,true);assert.equal(runtime.audioStarts,0,'restoring preferences does not chime');
  const track=runtime.musicInstances[0];runtime.doc.hidden=true;runtime.doc.fire('visibilitychange');
  assert.equal(track.paused,true);assert.equal(runtime.show.musicEnabled,false);assert.match(music.innerHTML,/Music paused/);
  runtime.doc.hidden=false;runtime.doc.fire('visibilitychange');await flush();
  assert.equal(track.plays,2);assert.equal(runtime.musicInstances.length,1);assert.equal(runtime.show.musicEnabled,true);
  assert.equal(runtime.documentListeners.get('pointerdown').length,1,'both controls share one gesture listener');
});

test('blocked or failed music never claims to be playing and a late play promise cannot undo mute',async()=>{
  for(const options of [{},{music:true,rejectPlay:true}]){
    const runtime=setup(options),button=runtime.element();runtime.show.bindMusicToggle(button);button.click();await flush();
    assert.equal(runtime.show.musicEnabled,false);assert.equal(button.getAttribute('aria-pressed'),'false');assert.match(button.innerHTML,/Music off/);
  }
  const runtime=setup({music:true,deferPlay:true}),button=runtime.element();runtime.show.bindMusicToggle(button);button.click();
  assert.equal(runtime.show.musicEnabled,false,'pending autoplay is not reported as playing');
  const track=runtime.musicInstances[0];button.click();track.resolve();await flush();
  assert.equal(runtime.show.musicEnabled,false);assert.equal(track.paused,true);
  button.click();track.resolve();await flush();assert.equal(runtime.show.musicEnabled,true);
  track.listeners.error();assert.equal(runtime.show.musicEnabled,false);assert.equal(track.paused,true);
});
