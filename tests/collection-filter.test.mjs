import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../game/client/collection.js',import.meta.url),'utf8');
const load=()=>{const context={module:{exports:{}}};vm.runInNewContext(source,context);return context.module.exports;};
const C=load(), indexes=entries=>Array.from(entries,entry=>entry.index);
function hidden(id) {
  const item={catalogId:id};
  for(const key of ['base','category'])Object.defineProperty(item,key,{get(){throw new Error('Hidden '+key+' was accessed');}});
  return item;
}

test('all-object selection keeps catalog order without reading hidden category or price',()=>{
  const items=[hidden('a'),hidden('b'),hidden('c')];
  for(const options of [{filter:'all',category:'ceramic',sort:'price-desc'},{filter:'other',category:'mechanical',sort:'price-asc'},null,undefined]) {
    const selected=C.selectEntries(items,['a'],options);
    assert.deepEqual(indexes(selected),[0,1,2]);
    assert.equal(selected[0].item,items[0]);
  }
});

test('category and prices only inspect discovered entries and ties use original catalog index',()=>{
  const items=[hidden('hidden-a'),{catalogId:'a',category:'ceramic',base:90},
    {catalogId:'b',category:'mechanical',base:10},{catalogId:'c',category:'ceramic',base:90},
    hidden('hidden-b'),{catalogId:'d',category:'ceramic',base:20}];
  const discovered=['d','c','b','a','unknown','a'];
  assert.deepEqual(indexes(C.selectEntries(items,discovered,{filter:'discovered',category:'ceramic',sort:'catalog'})),[1,3,5]);
  assert.deepEqual(indexes(C.selectEntries(items,discovered,{filter:'discovered',category:'ceramic',sort:'price-asc'})),[5,1,3]);
  assert.deepEqual(indexes(C.selectEntries(items,discovered,{filter:'discovered',sort:'price-desc'})),[1,3,5,2]);
  assert.deepEqual(indexes(C.selectEntries(items,discovered,{filter:'discovered',sort:'price-asc'})),[2,5,1,3]);
  assert.deepEqual(items.map(item=>item.catalogId),['hidden-a','a','b','c','hidden-b','d']);
  assert.deepEqual(discovered,['d','c','b','a','unknown','a']);
});

test('malformed filter options fall back safely without inventing discoveries',()=>{
  const items=[hidden('hidden'),{catalogId:'known',category:'ceramic',base:70}];
  for(const options of [{filter:'discovered',category:'constructor',sort:'random'},
    {filter:'discovered',category:'<script>',sort:'price'},
    {filter:'discovered',category:{},sort:{}}, {filter:'discovered'}]) {
    assert.deepEqual(indexes(C.selectEntries(items,['known'],options)),[1]);
  }
  for(const ids of [null,undefined,{},'known'])assert.deepEqual(indexes(C.selectEntries(items,ids,{filter:'discovered'})),[]);
  for(const items of [null,undefined,{},'items'])assert.deepEqual(indexes(C.selectEntries(items,[],{filter:'discovered'})),[]);
});

// Minimal browser surface for exercising the actual collection event handlers.
// Replacing innerHTML resets scroll, as a real dialog render can, so preservation
// assertions depend on the module restoring it rather than on this test fixture.
function harness(discovered=[0,1,2,3,4,5]) {
  const rootListeners=new Map(), dialogListeners=new Map(), storageWrites=[], zoomCalls=[];
  const items=Array.from({length:32},(_,index)=>({catalogId:'item-'+index,name:'Object '+index,
    base:[80,20,90,60,90,15][index%6],category:index%2?'ceramic':'mechanical',
    shape:'clock',theme:null,condition:'intact',genuine:true,rarity:'common'}));
  for(const item of items.slice(6))for(const key of ['base','category'])Object.defineProperty(item,key,{get(){throw new Error('Hidden '+key+' was accessed');}});
  const saved=JSON.stringify({version:1,found:discovered.map(index=>items[index].catalogId)});
  const storage={getItem(){return saved;},setItem(key,value){storageWrites.push({key,value});}};
  let dialog=null;
  const document={activeElement:null,body:{append(node){dialog=node;}},addEventListener(){},querySelector(){return null;},createElement(){
    return {open:false,scrollTop:0,nodes:new Map(),_html:'',
      set innerHTML(html){
        this._html=html;this.scrollTop=0;this.nodes=new Map();
        for(const match of html.matchAll(/<(button|select)\b([^>]*)>/g)) {
          const attrs=new Map(Array.from(match[2].matchAll(/([a-z][a-z0-9-]*)="([^"]*)"/g),entry=>[entry[1],entry[2]]));
          const node={id:attrs.get('id')||'',tagName:match[1].toUpperCase(),owner:this,
            getAttribute:key=>attrs.get(key)??null,hasAttribute:key=>attrs.has(key),
            closest(selector){return selector==='button'&&this.tagName==='BUTTON'?this:null;},
            focus(){document.activeElement=this;}};
          if(node.id)this.nodes.set('#'+node.id,node);
          if(attrs.has('data-collection-index'))this.nodes.set('[data-collection-index="'+attrs.get('data-collection-index')+'"]',node);
        }
        if(html.includes('class="collection-detail"'))this.nodes.set('.collection-detail',{scrollTop:0});
      },
      get innerHTML(){return this._html;},
      setAttribute(){},addEventListener(type,listener){dialogListeners.set(type,listener);},
      contains(node){return node?.owner===this;},querySelector(selector){return this.nodes.get(selector)||null;},
      showModal(){this.open=true;},close(){this.open=false;dialogListeners.get('close')?.();}};
  }};
  const context={module:{exports:{}},document,localStorage:storage,
    SecondValue:{RULES_VERSION:6,THEMES:{},catalogItems(){return items;}},
    SecondValueArt:{visualFor(item){return {sheet:'assets/'+item.catalogId+'.png',columns:1,rows:1,column:0,row:0};}},
    SecondValueArtZoom:{trigger(item,known,content){zoomCalls.push({item,known,content});return '<button type="button" class="test-art-zoom">'+content+'</button>';}},
    addEventListener(type,listener){if(!rootListeners.has(type))rootListeners.set(type,[]);rootListeners.get(type).push(listener);}};
  context.SecondValueLocale={language:'en',localize(){},setLanguage(language){this.language=language;emit('secondvalue:languagechange');}};
  function emit(type,event={}) {for(const listener of rootListeners.get(type)||[])listener(event);}
  vm.runInNewContext(source,context);
  const book=context.module.exports;
  book.open();
  const node=id=>dialog.querySelector('#'+id);
  const click=id=>{const target=id.startsWith('[')?dialog.querySelector(id):node(id);assert.ok(target,id);document.activeElement=target;dialogListeners.get('click')({target});};
  const change=(id,value)=>{const target=node(id);assert.ok(target,id);target.value=value;document.activeElement=target;dialogListeners.get('change')({target});};
  const cardIndexes=()=>Array.from(dialog.innerHTML.matchAll(/data-collection-index="(\d+)"/g),match=>Number(match[1]));
  const selectedValue=id=>dialog.innerHTML.match(new RegExp('<select id="'+id+'">([\\s\\S]*?)</select>'))?.[1].match(/<option value="([^"]+)" selected>/)?.[1];
  return {book,items,storage,storageWrites,zoomCalls,context,document,get dialog(){return dialog;},click,change,emit,cardIndexes,selectedValue,saved};
}

test('real controls auto-select discovered mode, reset all-object browsing, and keep complete progress',()=>{
  const h=harness();
  assert.deepEqual(h.cardIndexes(),Array.from({length:32},(_,i)=>i));
  assert.match(h.dialog.innerHTML,/data-no-localize>6 \/ 32<\/strong>/);
  for(const category of ['all','mechanical','ceramic','insignia','imaging','instrument','document'])assert.match(h.dialog.innerHTML,new RegExp('<option value="'+category+'"'));
  for(const text of ['Category','All categories','Sort by','Catalog order','Price: low to high','Price: high to low','Reset filters'])assert.ok(h.dialog.innerHTML.includes(text));
  h.change('collection-category','ceramic');
  assert.deepEqual(h.cardIndexes(),[1,3,5]);
  assert.match(h.dialog.innerHTML,/id="collection-discovered"[^>]+aria-pressed="true"/);
  h.change('collection-sort','price-desc');
  assert.deepEqual(h.cardIndexes(),[3,1,5]);
  assert.match(h.dialog.innerHTML,/data-no-localize>6 \/ 32<\/strong>/);
  h.click('collection-all');
  assert.equal(h.selectedValue('collection-category'),'all');assert.equal(h.selectedValue('collection-sort'),'catalog');
  assert.deepEqual(h.cardIndexes(),Array.from({length:32},(_,i)=>i));
  h.change('collection-sort','price-asc');
  assert.deepEqual(h.cardIndexes(),[5,1,3,0,2,4]);
  assert.match(h.dialog.innerHTML,/id="collection-discovered"[^>]+aria-pressed="true"/);
  h.click('collection-reset');
  assert.equal(h.selectedValue('collection-category'),'all');assert.equal(h.selectedValue('collection-sort'),'catalog');
  assert.deepEqual(h.cardIndexes(),Array.from({length:32},(_,i)=>i));
  assert.equal(h.storageWrites.length,0,'view preferences must not persist any record');
});

test('empty filters render a matching-discoveries message without reducing discovered progress',()=>{
  const h=harness();
  h.change('collection-category','instrument');
  assert.deepEqual(h.cardIndexes(),[]);assert.match(h.dialog.innerHTML,/No matching discoveries\./);
  assert.match(h.dialog.innerHTML,/data-no-localize>6 \/ 32<\/strong>/);
  assert.doesNotMatch(h.dialog.innerHTML,/collection-detail-price|test-art-zoom/);
  h.click('collection-reset');assert.equal(h.cardIndexes().length,32);
});

test('selected discovery, filters, focus and both scroll positions survive language and storage refreshes',()=>{
  const h=harness();
  h.change('collection-category','ceramic');h.change('collection-sort','price-desc');
  h.click('[data-collection-index="1"]');
  h.dialog.scrollTop=321;h.dialog.querySelector('.collection-detail').scrollTop=87;
  h.document.activeElement=h.dialog.querySelector('#collection-category');
  function check() {
    assert.equal(h.selectedValue('collection-category'),'ceramic');assert.equal(h.selectedValue('collection-sort'),'price-desc');
    assert.deepEqual(h.cardIndexes(),[3,1,5]);
    assert.match(h.dialog.innerHTML,/data-collection-index="1" aria-pressed="true"/);
    assert.equal(h.dialog.scrollTop,321);assert.equal(h.dialog.querySelector('.collection-detail').scrollTop,87);
    assert.equal(h.document.activeElement.id,'collection-category');
  }
  h.context.SecondValueLocale.setLanguage('zh-CN');check();
  h.context.SecondValueLocale.setLanguage('es');check();
  h.emit('storage',{key:C.STORAGE_KEY,newValue:h.saved,storageArea:h.storage});check();
  h.book.snapshot();h.book.newDiscoveriesMarkup([]);check();
  assert.equal(h.storageWrites.length,0);
});

test('art zoom wraps confirmed detail art only, leaving anonymous entries and card buttons unnested',()=>{
  const unseen=harness([]);
  assert.equal(unseen.zoomCalls.length,0);assert.doesNotMatch(unseen.dialog.innerHTML,/test-art-zoom/);
  const h=harness();
  assert.equal(h.zoomCalls.length,1);assert.equal(h.zoomCalls[0].known,true);assert.equal(h.zoomCalls[0].item,h.items[0]);
  assert.match(h.zoomCalls[0].content,/collection-art is-detail/);
  const cardHtml=h.dialog.innerHTML.match(/<div class="collection-grid">([\s\S]*?)<\/div><aside/)[1];
  assert.doesNotMatch(cardHtml,/test-art-zoom/);
  assert.equal(Array.from(cardHtml.matchAll(/<button\b/g)).length,32);
  h.click('[data-collection-index="10"]');
  assert.equal(h.zoomCalls.length,1,'unknown detail must not become an art trigger');
});
