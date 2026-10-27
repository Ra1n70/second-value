import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url), E=require('../game/engine.cjs');
const source=await readFile(new URL('../game/client/collection.js',import.meta.url),'utf8');
function api() {
  const context={module:{exports:{}}};
  for(const key of ['fetch','sessionStorage','SecondValue'])Object.defineProperty(context,key,{get(){throw new Error('Unexpected access: '+key);}});
  runInNewContext(source,context);
  return context.module.exports;
}
const C=api(), plain=value=>JSON.parse(JSON.stringify(value));
function store(initial=null) {
  const values=new Map(initial===null?[]:[[C.STORAGE_KEY,initial]]), writes=[];
  return {getItem:key=>values.get(key)??null,setItem(key,value){values.set(key,value);writes.push({key,value});},values,writes};
}
const catalog=E.catalogItems(5), lots=catalog.slice(0,6).map(item=>({...item,known:true,source:'Crate opened'}));
const settled=(overrides={})=>({key:'room:example:1',phase:'result',sold:true,active:true,rulesVersion:5,lots,...overrides});
function freeze(value){if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;}
function storageTabs() {
  const disk=new Map(), queue=[], tabs=[], writes=[];
  let interleave=null;
  function tab(name) {
    const listeners=new Map(), target={name};
    const storage={getItem:key=>disk.get(key)??null,setItem(key,value){
      if(interleave?.name===name){const action=interleave.run;interleave=null;action();}
      const oldValue=disk.get(key)??null;
      if(oldValue===value)return;
      disk.set(key,value);writes.push({name,key,value});
      for(const other of tabs)if(other!==target)queue.push({target:other,event:{key,oldValue,newValue:value,storageArea:other.storage}});
    }};
    const context={module:{exports:{}},SecondValue:E,localStorage:storage,addEventListener(type,listener){
      if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(listener);
    }};
    runInNewContext(source,context);
    Object.assign(target,{storage,book:context.module.exports,dispatch(event){for(const listener of listeners.get('storage')||[])listener(event);}});
    tabs.push(target);return target;
  }
  function drain() {
    let count=0;
    while(queue.length){assert.ok(++count<20,'storage notifications must converge instead of echoing forever');const next=queue.shift();next.target.dispatch(next.event);}
    return count;
  }
  return {disk,queue,writes,tab,drain,interleave(name,run){interleave={name,run};}};
}

test('only a complete public purchased settlement may register discoveries',()=>{
  const storage=store(), book=C.createBook({engine:E,storage});
  for(const value of [null,{},settled({phase:'auction'}),settled({phase:'round-summary'}),settled({phase:'dispose'}),settled({sold:false}),settled({sold:1}),settled({active:false}),settled({active:undefined}),settled({rulesVersion:99}),settled({rulesVersion:'5'}),settled({key:''}),settled({key:'x'.repeat(513)}),settled({lots:lots.slice(0,5)}),settled({lots:[...lots,lots[0]]}),settled({lots:[...lots.slice(0,5),null]}),settled({lots:[...lots.slice(0,5),lots[0]]})])assert.deepEqual(plain(book.recordSettlement(value)),[]);
  for(const source of ['Private note','Public reveal','Unconfirmed',undefined])assert.deepEqual(plain(book.recordSettlement(settled({lots:lots.map((item,index)=>index?item:{...item,source})}))),[]);
  for(const known of [false,1,undefined])assert.deepEqual(plain(book.recordSettlement(settled({lots:lots.map((item,index)=>index?item:{...item,known})}))),[]);
  assert.deepEqual(plain(book.recordSettlement(settled({lots:lots.map((item,index)=>index?item:{...item,catalogId:'future-hidden-identity'})}))),[]);
  assert.equal(storage.writes.length,0);assert.equal(book.snapshot().count,0);
});

test('a public settlement persists only whitelisted identities and replay returns an isolated copy',()=>{
  const storage=store(), book=C.createBook({engine:E,storage});
  const input=freeze(settled({key:'do-not-persist-room-or-seed',lots:lots.map(item=>({...item,secret:'do-not-persist',seed:987654,slot:2}))}));
  const fresh=book.recordSettlement(input), ids=lots.map(item=>item.catalogId);
  assert.deepEqual(plain(fresh),ids);
  fresh[0]='tampered';
  assert.deepEqual(plain(book.recordSettlement(input)),ids);
  assert.equal(storage.writes.length,1);
  const saved=JSON.parse(storage.getItem(C.STORAGE_KEY));
  assert.deepEqual(Object.keys(saved).sort(),['found','version']);assert.equal(saved.version,1);assert.deepEqual(saved.found,[...ids].sort());
  assert.doesNotMatch(storage.writes[0].value,/do-not-persist|987654|slot|source|base|phase|room|secret/);
  assert.equal(book.snapshot().count,6);
  assert.deepEqual(plain(book.recordSettlement(settled({phase:'dispose'}))),[]);
});

test('a settlement key cannot be reused for other contents and repeated identities do not count again',()=>{
  const storage=store(), book=C.createBook({engine:E,storage});
  book.recordSettlement(settled());
  const other=catalog.slice(3,9).map(item=>({...item,known:true,source:'Crate opened'}));
  assert.deepEqual(plain(book.recordSettlement(settled({lots:other}))),[]);assert.equal(book.snapshot().count,6);
  assert.deepEqual(plain(book.recordSettlement(settled({key:'second-crate',lots:other}))),other.slice(3).map(item=>item.catalogId));
  assert.equal(book.snapshot().count,9);
  assert.deepEqual(plain(book.recordSettlement(settled({key:'third-crate'}))),[]);assert.equal(book.snapshot().count,9);
  assert.deepEqual(plain(book.recordSettlement(settled({key:'second-crate',lots:other}))),other.slice(3).map(item=>item.catalogId));
  const restored=C.createBook({engine:E,storage});
  assert.deepEqual(plain(restored.recordSettlement(settled({key:'second-crate',lots:other}))),[]);
});

test('malformed or hostile local records are normalized before merging',()=>{
  const first=catalog[0].catalogId;
  for(const initial of ['not json','null',JSON.stringify({version:2,found:[first]}),JSON.stringify({version:1,found:'not an array'}),JSON.stringify({version:1,found:Array(2049).fill(first)})]) {
    const storage=store(initial), book=C.createBook({engine:E,storage});assert.equal(book.snapshot().count,0);assert.equal(book.recordSettlement(settled()).length,6);
  }
  const storage=store(JSON.stringify({version:1,found:[first,first,'unknown',null,12,{},['x']],seed:12345}));
  const book=C.createBook({engine:E,storage});assert.deepEqual(plain(book.snapshot().found),[first]);
  assert.equal(book.recordSettlement(settled()).length,5);
  assert.deepEqual(Object.keys(JSON.parse(storage.getItem(C.STORAGE_KEY))).sort(),['found','version']);
});

test('blocked reads and failed writes retain safe in-memory discovery without blocking play',()=>{
  for(const storage of [null,{getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}},{getItem(){return null;},setItem(){throw new Error('quota');}},{getItem(){return null;}}]) {
    const book=C.createBook({engine:E,storage});
    assert.equal(book.recordSettlement(settled()).length,6);
    assert.equal(book.snapshot().count,6);assert.equal(book.snapshot().storageAvailable,false);
    assert.equal(book.recordSettlement(settled()).length,6);
  }
});

test('another tab cannot be overwritten by a previously loaded browser archive',()=>{
  const storage=store(), first=C.createBook({engine:E,storage}), second=C.createBook({engine:E,storage});
  assert.equal(second.snapshot().count,0);
  first.recordSettlement(settled());
  const next=catalog.slice(3,9).map(item=>({...item,known:true,source:'Crate opened'}));
  assert.equal(second.recordSettlement(settled({key:'other-tab-crate',lots:next})).length,3);
  assert.equal(first.snapshot().count,9);assert.equal(second.snapshot().count,9);
  assert.deepEqual(JSON.parse(storage.getItem(C.STORAGE_KEY)).found,catalog.slice(0,9).map(item=>item.catalogId).sort());
});

test('interleaved tab writes converge to the complete persisted union without notification loops',()=>{
  const shared=storageTabs(), a=shared.tab('A'), b=shared.tab('B');
  const next=catalog.slice(3,9).map(item=>({...item,known:true,source:'Crate opened'}));
  shared.interleave('A',()=>b.book.recordSettlement(settled({key:'B-crate',lots:next})));
  a.book.recordSettlement(settled({key:'A-crate'}));
  // B read an empty archive and committed first; A's already-prepared six-ID
  // snapshot then overwrote it. Notification payloads still retain both writes.
  assert.equal(JSON.parse(shared.disk.get(C.STORAGE_KEY)).found.length,6);
  assert.equal(shared.writes.length,2);
  shared.drain();
  const expected=catalog.slice(0,9).map(item=>item.catalogId).sort();
  assert.deepEqual(JSON.parse(shared.disk.get(C.STORAGE_KEY)).found,expected);
  assert.deepEqual(plain(a.book.snapshot().found),expected);assert.deepEqual(plain(b.book.snapshot().found),expected);
  assert.equal(shared.writes.length,3);
  const refreshed=shared.tab('refreshed');assert.deepEqual(plain(refreshed.book.snapshot().found),expected);
  const stable=shared.disk.get(C.STORAGE_KEY), writeCount=shared.writes.length;
  for(const target of [a,b,refreshed])target.dispatch({key:C.STORAGE_KEY,newValue:stable,storageArea:target.storage});
  assert.equal(shared.drain(),0);assert.equal(shared.writes.length,writeCount);
});

test('storage event payloads are schema-checked and explicit clears do not resurrect cached discoveries',()=>{
  const shared=storageTabs(), a=shared.tab('A');
  a.book.recordSettlement(settled());const before=shared.writes.length;
  for(const newValue of ['not json','null',JSON.stringify({version:2,found:[catalog[8].catalogId]}),JSON.stringify({version:1,found:'hidden identity'}),JSON.stringify({version:1,found:Array(2049).fill(catalog[8].catalogId)})])a.dispatch({key:C.STORAGE_KEY,newValue,storageArea:a.storage});
  a.dispatch({key:'unrelated-key',newValue:JSON.stringify({version:1,found:[catalog[8].catalogId]})});
  assert.equal(a.book.snapshot().count,6);assert.equal(shared.writes.length,before);
  a.dispatch({key:C.STORAGE_KEY,newValue:JSON.stringify({version:1,found:[catalog[8].catalogId,'<private-future-id>',null,123,{},catalog[8].catalogId],room:'secret',seed:123456}),storageArea:a.storage});
  assert.equal(a.book.snapshot().count,7);
  const persisted=shared.disk.get(C.STORAGE_KEY);
  assert.equal(JSON.parse(persisted).found.length,7);assert.doesNotMatch(persisted,/private|future|secret|room|seed|123456/);
  shared.disk.delete(C.STORAGE_KEY);
  a.dispatch({key:C.STORAGE_KEY,newValue:null,storageArea:a.storage});
  assert.equal(a.book.snapshot().count,0);assert.equal(a.book.newDiscoveriesMarkup(lots.map(item=>item.catalogId)),'');
  const clearedWrites=shared.writes.length;
  // A stale write notification queued before removeItem must not write old IDs
  // back after the latest disk value has been explicitly removed.
  a.dispatch({key:C.STORAGE_KEY,newValue:persisted,storageArea:a.storage});
  assert.equal(a.book.snapshot().count,0);assert.equal(shared.disk.has(C.STORAGE_KEY),false);assert.equal(shared.writes.length,clearedWrites);
  a.dispatch({key:null,newValue:null,storageArea:a.storage});assert.equal(a.book.snapshot().count,0);
});

test('persistence status recovers only after a later successful write',()=>{
  const storage=store(), realSet=storage.setItem;
  storage.setItem=()=>{throw new Error('quota');};
  const book=C.createBook({engine:E,storage});book.recordSettlement(settled());
  assert.equal(book.snapshot().storageAvailable,false);
  storage.setItem=realSet;
  assert.equal(book.snapshot().storageAvailable,false);
  const next=catalog.slice(3,9).map(item=>({...item,known:true,source:'Crate opened'}));
  book.recordSettlement(settled({key:'after-quota-cleared',lots:next}));
  assert.equal(book.snapshot().storageAvailable,true);assert.equal(JSON.parse(storage.getItem(C.STORAGE_KEY)).found.length,9);
});

test('old rules cannot record future identities and unknown identities never gain presentation',()=>{
  const storage=store(), book=C.createBook({engine:E,storage});
  const current=E.catalogItems(E.RULES_VERSION), future=current.find(item=>!catalog.some(old=>old.catalogId===item.catalogId));
  if(future)assert.deepEqual(plain(book.recordSettlement(settled({lots:[...lots.slice(0,5),{...future,known:true,source:'Crate opened'}]}))),[]);
  assert.equal(book.newDiscoveriesMarkup(current.map(item=>item.catalogId)),'');
  assert.equal(book.storyMarkup(undefined,true),'');
  for(const item of current)assert.equal(book.storyMarkup(item,false),'');
});

test('story and discovery markup use canonical confirmed metadata, escape copy and have no economic action',()=>{
  const entries=Array.from({length:6},(_,i)=>({catalogId:'id-'+i,id:'id-'+i,shape:'clock',name:i?'Item '+i:'<img src=x onerror="steal()">',base:20+i,genuine:true,condition:'intact',category:'mechanical',theme:null,rarity:i?'common':'rare',story:'Canonical <story> & no script',provenance:'Archive <record>'}));
  const engine={RULES_VERSION:6,THEMES:{},catalogItems(version){if(version!==6)throw new Error('unknown version');return entries;}};
  for(const key of ['salePlan','performSession','placeBid'])Object.defineProperty(engine,key,{get(){throw new Error('Discovery cannot access '+key);}});
  const book=C.createBook({engine,storage:store()});
  assert.equal(book.storyMarkup({...entries[0],shape:'cup'},true),'');
  assert.equal(book.storyMarkup(entries[1],true),'');
  const story=book.storyMarkup({catalogId:'id-0',shape:'clock',story:'FORGED PRIVATE STORY'},true);
  assert.match(story,/Canonical &lt;story&gt; &amp; no script/);assert.doesNotMatch(story,/FORGED|<story>|<script/);
  const fresh=book.recordSettlement(settled({rulesVersion:6,lots:entries.map(item=>({...item,known:true,source:'Crate opened'}))}));
  const html=book.newDiscoveriesMarkup([...fresh,fresh[0],'future']);
  assert.match(html,/data-no-localize>6<\/strong>/);assert.match(html,/&lt;img src=x onerror=&quot;steal\(\)&quot;&gt;/);
  assert.doesNotMatch(html,/<img|data-sale|data-bid|data-inspect|FORGED/);assert.match(html,/data-open-collection/);
  assert.equal(book.newDiscoveriesMarkup(null),'');
});

test('an unopened archive renders only anonymous entries and never asks artwork for hidden identities',()=>{
  let captured=null, artworkCalls=0;
  const document={activeElement:null,body:{append(value){captured=value;}},addEventListener(){},querySelector(){return null;},createElement(){
    return {innerHTML:'',scrollTop:0,open:false,setAttribute(){},addEventListener(){},contains(){return false;},querySelector(){return {focus(){}};},showModal(){this.open=true;}};
  }};
  const book=C.createBook({engine:E,storage:store(),document,art:{visualFor(){artworkCalls++;return {sheet:'assets/revealed-identity.png',columns:1,rows:1,column:0,row:0};}}});
  book.open();
  assert.equal(captured.open,true);assert.equal(artworkCalls,0);
  assert.match(captured.innerHTML,/Undiscovered object/);assert.match(captured.innerHTML,/data-no-localize>0 \/ \d+</);
  assert.doesNotMatch(captured.innerHTML,/revealed-identity\.png|data-catalog-id|data-collection-id|collection-detail-price|collection-detail-tags|collection-rarity/);
  for(const item of E.catalogItems(E.RULES_VERSION)) {assert.equal(captured.innerHTML.includes(item.name),false);assert.equal(captured.innerHTML.includes(item.catalogId),false);if(item.story)assert.equal(captured.innerHTML.includes(item.story),false);}
  book.recordSettlement(settled());book.open();
  assert.ok(artworkCalls>0);assert.match(captured.innerHTML,/6 \/ \d+</);assert.match(captured.innerHTML,/Repair fee/);assert.match(captured.innerHTML,/Restored sale price/);
  for(const item of E.catalogItems(E.RULES_VERSION).filter(item=>!lots.some(lot=>lot.catalogId===item.catalogId))) {assert.equal(captured.innerHTML.includes(item.name),false);assert.equal(captured.innerHTML.includes(item.catalogId),false);}
});
