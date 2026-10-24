import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const source = await readFile(new URL('../game/client/notebook.js',import.meta.url),'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function runtime(extra = {}) {
  const context = {module:{exports:{}},...extra};
  Object.defineProperty(context,'SecondValue',{get(){throw new Error('Notebook must not read the engine');}});
  Object.defineProperty(context,'game',{get(){throw new Error('Notebook must not read the game');}});
  runInNewContext(source,context);
  return context.module.exports;
}
const N = runtime();
function storage() {
  const values = new Map();
  return {values,getItem(key){return values.get(key) ?? null;},setItem(key,value){values.set(key,value);}};
}
const unknown = {slot:0,label:'Clock-shaped object',known:false,source:'Unconfirmed',range:{min:60,max:260}};

// A small dialog surface tests focus and DOM identity across caller renders;
// no engine or gameplay state is present in this environment.
function surface() {
  const listeners = {}, doc = {activeElement:null};
  class Element {
    constructor(tag='div') {this.tagName=tag;this.ownerDocument=doc;this.children=[];this.dataset={};this.attrs={};this.events={};this.nodes={};this.isConnected=true;this.hidden=false;this.open=false;this.value='';this._html='';}
    set innerHTML(value) {
      this._html=value;
      if(this.tagName==='dialog') {
        for(const selector of ['[data-close-notebook]','[data-notebook-cards]','[data-notebook-total]','[data-notebook-count]','[data-notebook-storage]']) this.nodes[selector]=new Element();
      } else if(this.tagName==='article') {
        for(const selector of ['[data-note-label]','[data-note-facts]','[data-note-estimate]','[data-note-error]']) this.nodes[selector]=new Element();
        this.nodes['[data-note-estimate]'].value=value.match(/data-note-estimate[^>]*value="([^"]*)"/)?.[1] || '';
        this.marks=['neutral','interested','uncertain'].map(mark=>{const button=new Element('button');button.dataset.noteMark=mark;return button;});
      }
    }
    get innerHTML(){return this._html;}
    querySelector(selector) {
      if(this.nodes[selector])return this.nodes[selector];
      if(selector==='[data-open-notebook]')return this.children.find(child=>child.opener);
      const match=selector.match(/^\[data-note-card="(\d)"\]$/);
      return match?this.children.find(child=>child.dataset.noteCard===match[1]):null;
    }
    querySelectorAll(selector) {
      if(selector==='[data-open-notebook]')return this.children.filter(child=>child.opener);
      if(selector==='[data-note-card]')return this.children.filter(child=>child.dataset.noteCard!==undefined);
      if(selector==='[data-note-mark]')return this.marks || [];
      return [];
    }
    setAttribute(key,value){this.attrs[key]=String(value);if(key==='open')this.open=true;}
    removeAttribute(key){delete this.attrs[key];if(key==='open')this.open=false;}
    addEventListener(event,callback){(this.events[event] ||= []).push(callback);}
    emit(event,fields={}){for(const callback of this.events[event] || [])callback({target:this,preventDefault(){},...fields});}
    click(){this.emit('click');}
    appendChild(child){child.parent=this;child.isConnected=true;this.children.push(child);return child;}
    remove(){this.isConnected=false;if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);}
    showModal(){this.open=true;}
    close(){this.open=false;this.emit('close');}
    focus(){doc.activeElement=this;}
  }
  doc.createElement=tag=>new Element(tag);doc.body=new Element('body');
  const container=new Element('main');doc.body.appendChild(container);
  const opener=()=>{const node=new Element('button');node.opener=true;container.appendChild(node);return node;};
  let localized=0;
  const module=runtime({document:doc,SecondValueLocale:{localize(){localized++;}},addEventListener(event,callback){(listeners[event] ||= []).push(callback);}});
  return {N:module,doc,container,opener,listeners,get dialog(){return doc.body.children.find(child=>child.tagName==='dialog');},get localized(){return localized;}};
}

test('estimates accept optional nonnegative whole numbers only and sum only valid filled entries', () => {
  for(const [raw,expected] of [['0',0],['999999',999999],[' 12 ',12],[0,0],['',null],[' ',null],['-1',null],['1.5',null],['1e3',null],['+2',null],['1,000',null],['1000000',null],[Infinity,null],[{},null]]) assert.equal(N.parseEstimate(raw),expected);
  const notes={items:{0:{estimate:'0'},1:{estimate:'125'},2:{estimate:'bad'},3:{estimate:'999999'},4:{estimate:''}}};
  assert.deepEqual(plain(N.estimateSummary(notes)),{count:3,total:1000124});
  assert.deepEqual(plain(N.estimateSummary(notes,[unknown])),{count:1,total:0});
});

test('storage keys isolate players and crates and persist only manual marks and valid estimates', () => {
  const store=storage(), first='room:ABCD:alice:1', otherPlayer='room:ABCD:bob:1', otherCrate='room:ABCD:alice:2';
  const manual={version:1,items:{0:{mark:'interested',estimate:'123',base:330},1:{mark:'uncertain',estimate:'bad'}},itemsTruth:'must not persist'};
  store.setItem(N.storageKey(first),JSON.stringify(N.normalizeNotes(manual)));
  assert.equal(N.loadNotes(store,first).items[0].estimate,'123');
  assert.equal(N.loadNotes(store,first).items[0].mark,'interested');
  assert.equal(N.loadNotes(store,otherPlayer).items[0].estimate,'');
  assert.equal(N.loadNotes(store,otherCrate).items[0].mark,'neutral');
  assert.notEqual(N.storageKey(first),N.storageKey(otherPlayer));
  assert.notEqual(N.storageKey(first),N.storageKey(otherCrate));
  assert.doesNotMatch(store.getItem(N.storageKey(first)),/base|itemsTruth|330/);
  assert.equal(N.storageKey(null),null);assert.equal(N.storageKey(''),null);
});

test('malformed or blocked storage falls back to a blank private notebook', () => {
  const store=storage(),key='solo:12:1';
  for(const raw of ['{','null','[]','{"version":2,"items":{"0":{"estimate":"42"}}}','{"version":1,"items":[1,2,3]}']) {
    store.setItem(N.storageKey(key),raw);
    assert.equal(N.loadNotes(store,key).items[0].estimate,'');
  }
  const blocked={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}};
  assert.equal(N.loadNotes(blocked,key).items[0].mark,'neutral');
  assert.equal(N.loadNotes(null,key).items[0].estimate,'');
  const normalized=N.normalizeNotes({version:1,items:{0:{mark:'<script>',estimate:'-1'},1:{mark:'uncertain',estimate:0}}});
  assert.deepEqual(plain(normalized.items[0]),{mark:'neutral',estimate:''});
  assert.deepEqual(plain(normalized.items[1]),{mark:'uncertain',estimate:'0'});
});

test('unknown projections drop hidden facts and facts markup never reveals supplied hidden values', () => {
  const dirty={...unknown,base:987654,genuine:true,condition:'damaged',catalogId:'secret-identity',repair:{sale:12345},source:'Private note'};
  const safe=N.normalizeLots([dirty])[0];
  assert.deepEqual(Object.keys(safe).sort(),['known','label','range','slot','source']);
  assert.equal(safe.source,'Unconfirmed');
  const html=N.factsMarkup(dirty);
  assert.match(html,/Catalog range/);assert.match(html,/60–260/);
  assert.doesNotMatch(html,/987654|12345|secret-identity|Genuine|Damaged|Private note/);
  assert.match(html,/No confirmed identity yet/);
});

test('known facts retain their public or private source while untrusted source and attributes cannot inject HTML', () => {
  const known={slot:1,label:'<img src=x onerror=x>',known:true,source:'Private note',base:125,genuine:false,condition:'intact'};
  const html=N.factsMarkup(known);
  assert.match(html,/Private note/);assert.match(html,/Reproduction/);assert.match(html,/125/);
  assert.doesNotMatch(html,/<img|onerror/);
  const malicious=N.factsMarkup({...known,source:'<svg onload=x>',condition:'<img>'});
  assert.doesNotMatch(malicious,/<svg|<img|onload/);
  assert.equal(N.normalizeLots([known,known,{slot:9,known:true}]).length,1);
  assert.match(N.buttonMarkup(),/data-open-notebook/);
});

test('polling and language switches preserve open dialog, focused input, invalid draft and marks', () => {
  const ui=surface(),store=storage(),key='room:ABCD:alice:1',open=ui.opener();
  ui.N.bind(ui.container,{key,lots:[unknown],storage:store,scope:'tab'});
  const dialog=ui.dialog,grid=dialog.querySelector('[data-notebook-cards]'),card=grid.children[0],input=card.querySelector('[data-note-estimate]');
  assert.match(dialog.innerHTML,/Saved in this tab/);
  open.click();input.focus();input.value='12e';input.emit('input');
  const interested=card.querySelectorAll('[data-note-mark]')[1];interested.click();
  const replacement=ui.opener();open.remove();
  ui.N.bind(ui.container,{key,lots:[{...unknown,known:true,source:'Public reveal',base:180,genuine:true,condition:'damaged'}],storage:store,scope:'tab'});
  assert.equal(ui.dialog,dialog);assert.equal(dialog.open,true);
  assert.equal(card.querySelector('[data-note-estimate]'),input);assert.equal(input.value,'12e');assert.equal(ui.doc.activeElement,input);
  assert.equal(input.attrs['aria-invalid'],'true');assert.equal(card.querySelector('[data-note-error]').hidden,false);
  assert.match(card.querySelector('[data-note-facts]').innerHTML,/Public reveal/);
  assert.equal(interested.attrs['aria-pressed'],'true');
  ui.listeners['secondvalue:languagechange'].forEach(callback=>callback());
  assert.equal(input.value,'12e');assert.equal(ui.doc.activeElement,input);assert.equal(ui.dialog,dialog);
  input.value='123';input.emit('input');
  assert.equal(dialog.querySelector('[data-notebook-total]').textContent,'123');
  assert.equal(ui.N.loadNotes(store,key).items[0].estimate,'123');
  dialog.emit('cancel');assert.equal(dialog.open,false);assert.equal(ui.doc.activeElement,replacement);
  replacement.click();assert.equal(dialog.open,true);
});

test('crate changes close the old dialog, restore only that crate notes, and null keys fully reset', () => {
  const ui=surface(),store=storage(),open=ui.opener();
  ui.N.bind(ui.container,{key:'solo:10:1',lots:[unknown],storage:store});open.click();
  const old=ui.dialog,input=old.querySelector('[data-notebook-cards]').children[0].querySelector('[data-note-estimate]');
  input.value='999';input.emit('input');
  ui.N.bind(ui.container,{key:'solo:10:2',lots:[unknown],storage:store});
  assert.equal(old.open,false);assert.equal(old.isConnected,false);assert.notEqual(ui.dialog,old);
  open.click();assert.equal(ui.dialog.open,true,'a retained opener must follow the new crate');
  assert.equal(ui.dialog.querySelector('[data-notebook-cards]').children[0].querySelector('[data-note-estimate]').value,'');
  ui.N.bind(ui.container,{key:'solo:10:1',lots:[unknown],storage:store});
  assert.equal(ui.dialog.querySelector('[data-notebook-cards]').children[0].querySelector('[data-note-estimate]').value,'999');
  ui.N.bind(ui.container,{key:null,lots:[],storage:store});assert.equal(ui.dialog,undefined);
});

test('blocked storage does not interrupt edits and labels are escaped in dialog cards', () => {
  const ui=surface(),blocked={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}};
  ui.opener();ui.N.bind(ui.container,{key:'solo:1:1',lots:[{...unknown,label:'<img src=x onerror=alert(1)>'}],storage:blocked});
  const dialog=ui.dialog,card=dialog.querySelector('[data-notebook-cards]').children[0],input=card.querySelector('[data-note-estimate]');
  assert.match(card.innerHTML,/&lt;img src=x onerror=alert\(1\)&gt;/);assert.doesNotMatch(card.innerHTML,/<img/);
  input.value='42';assert.doesNotThrow(()=>input.emit('input'));
  assert.equal(dialog.querySelector('[data-notebook-total]').textContent,'42');
  assert.equal(dialog.querySelector('[data-notebook-storage]').hidden,false);
});
