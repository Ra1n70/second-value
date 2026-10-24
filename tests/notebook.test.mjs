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
        const section=this.nodes['[data-notebook-decisions]']=new Element('section');
        for(const selector of ['[data-decision-tabs]','[data-decision-form]','[data-decision-comparison]'])section.nodes[selector]=new Element();
      } else if(this.tagName==='article') {
        for(const selector of ['[data-note-label]','[data-note-facts]','[data-note-estimate]','[data-note-error]']) this.nodes[selector]=new Element();
        this.nodes['[data-note-estimate]'].value=value.match(/data-note-estimate[^>]*value="([^"]*)"/)?.[1] || '';
        this.marks=['neutral','interested','uncertain'].map(mark=>{const button=new Element('button');button.dataset.noteMark=mark;return button;});
      }
      if(value.includes('data-decision-round='))this.roundTabs=[...value.matchAll(/data-decision-round="([1-3])"/g)].map(match=>{const button=new Element('button');button.dataset.decisionRound=match[1];return button;});
      if(value.includes('data-decision-ceiling')){
        for(const selector of ['[data-decision-ceiling]','[data-decision-plan]','[data-decision-reason]','[data-decision-error]','[data-decision-status]'])this.nodes[selector]=new Element();
        this.nodes['[data-decision-ceiling]'].value=value.match(/data-decision-ceiling[^>]*value="([^"]*)"/)?.[1]||'';
        this.nodes['[data-decision-plan]'].value=value.match(/<option value="([^"]*)" selected/)?.[1]||'';
        this.nodes['[data-decision-reason]'].value=(value.match(/data-decision-reason[^>]*>([\s\S]*?)<\/textarea>/)?.[1]||'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
      }
    }
    get innerHTML(){return this._html;}
    querySelector(selector) {
      if(this.nodes[selector])return this.nodes[selector];
      if(selector==='[data-open-notebook]')return this.children.find(child=>child.opener);
      const match=selector.match(/^\[data-note-card="(\d)"\]$/);
      const found=match?this.children.find(child=>child.dataset.noteCard===match[1]):null;
      if(found)return found;
      for(const node of [...Object.values(this.nodes),...this.children]){const child=node.querySelector(selector);if(child)return child;}
      return null;
    }
    querySelectorAll(selector) {
      if(selector==='[data-open-notebook]')return this.children.filter(child=>child.opener);
      if(selector==='[data-note-card]')return this.children.filter(child=>child.dataset.noteCard!==undefined);
      if(selector==='[data-note-mark]')return this.marks || [];
      if(selector==='[data-decision-round]')return this.roundTabs || [];
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

test('round records retain old v1 item notes and persist only authored, bounded fields',()=>{
  const notes=N.normalizeNotes({version:1,items:{0:{mark:'interested',estimate:'80'}},rounds:{1:{ceiling:'0',stance:'watch',reason:'😀'.repeat(170),winningBid:700,recovery:900},2:{ceiling:'12e',stance:'bad',reason:42},3:{ceiling:'999999',stance:'bid',reason:'line\nreason\u0000'}}});
  assert.equal(notes.items[0].estimate,'80');
  assert.equal(notes.rounds[1].ceiling,'0');assert.equal(notes.rounds[1].stance,'watch');assert.equal([...notes.rounds[1].reason].length,160);
  assert.deepEqual(Object.keys(notes.rounds[1]).sort(),['ceiling','reason','stance']);
  assert.deepEqual(plain(notes.rounds[2]),{ceiling:'',stance:'',reason:''});
  assert.equal(notes.rounds[3].reason,'line\nreason');
  assert.equal(N.normalizeNotes({version:1,items:{0:{estimate:'55'}}}).rounds[1].ceiling,'');
  assert.equal(N.normalizeNotes({version:2,rounds:{1:{ceiling:100}}}).rounds[1].ceiling,'');
});

test('decision context strips extra truth and shows no comparison until a valid settlement',()=>{
  assert.equal(N.normalizeDecision({round:0,editable:true}),null);
  const context=N.normalizeDecision({round:2,editable:true,items:['hidden'],settlement:{sold:true,winningBid:700,recovery:850,youWon:false,secret:42}});
  assert.equal(context.editable,false);assert.deepEqual(Object.keys(context).sort(),['editable','round','settlement']);
  assert.deepEqual(Object.keys(context.settlement).sort(),['recovery','sold','winningBid','youWon']);
  assert.equal(N.normalizeDecision({round:1,editable:true,settlement:{sold:true,winningBid:-1,recovery:30}}).settlement,null);
  assert.deepEqual(plain(N.normalizeDecision({round:3,settlement:{sold:false,winningBid:987654}}).settlement),{sold:false});
  const html=N.comparisonMarkup({rounds:{1:{ceiling:'300'}}},{round:1,editable:false,settlement:null});
  assert.match(html,/Comparison appears after settlement/);assert.doesNotMatch(html,/Winning bid|recovery|300/);
});

test('settlement compares manual ceilings to the actual buyer price, without hypothetical profit claims',()=>{
  const notes={rounds:{1:{ceiling:'0',stance:'watch',reason:'<script>bad</script>'},2:{ceiling:'850',stance:'bid',reason:'new clue'},3:{ceiling:'999999',stance:'bid',reason:'unplayed'}}};
  const html=N.comparisonMarkup(notes,{round:2,editable:false,settlement:{sold:true,winningBid:700,recovery:830,youWon:false}});
  assert.match(html,/Buyer's actual recovery/);assert.match(html,/830/);assert.match(html,/−700/);assert.match(html,/\+150/);
  assert.match(html,/role and sale choice/);assert.match(html,/Timing and tie priority/);
  assert.doesNotMatch(html,/Round 3|999999|<script>|hypothetical|profit/);
  const unsold=N.comparisonMarkup(notes,{round:3,settlement:{sold:false,winningBid:777,recovery:999}});
  assert.match(unsold,/No sale/);assert.doesNotMatch(unsold,/777|999|Winning bid/);
});

test('round input focus and invalid draft survive polling, language changes, and temporary readonly',()=>{
  const ui=surface(),store=storage(),key='room:ABC:alice:1';ui.opener();
  const options={key,lots:[unknown],storage:store,decision:{round:1,editable:true,settlement:null}};
  ui.N.bind(ui.container,options);
  const section=ui.dialog.querySelector('[data-notebook-decisions]'),form=section.querySelector('[data-decision-form]'),input=form.querySelector('[data-decision-ceiling]'),reason=form.querySelector('[data-decision-reason]');
  input.focus();input.value='12e';input.emit('input');reason.value='Winning bid <script> stays literal';reason.emit('input');
  assert.match(form.innerHTML,/data-decision-reason data-no-localize data-user-text/);
  assert.match(form.innerHTML,/<small id="sv-round-reason-help">Optional reason/);
  assert.doesNotMatch(form.innerHTML,/data-decision-ceiling data-no-localize|textarea[^>]*placeholder/);
  ui.N.bind(ui.container,options);ui.listeners['secondvalue:languagechange'].forEach(callback=>callback());
  assert.equal(form.querySelector('[data-decision-ceiling]'),input);assert.equal(input.value,'12e');assert.equal(ui.doc.activeElement,input);
  assert.equal(form.querySelector('[data-decision-error]').hidden,false);assert.equal(reason.value,'Winning bid <script> stays literal');
  ui.N.bind(ui.container,{...options,decision:{round:1,editable:false}});assert.equal(input.readOnly,true);
  input.value='999';input.emit('input');assert.equal(input.value,'12e');
  ui.N.bind(ui.container,options);assert.equal(input.readOnly,false);input.value='620';input.emit('input');
  assert.equal(ui.N.loadNotes(store,key).rounds[1].ceiling,'620');
  assert.equal(ui.N.loadNotes(store,key).rounds[1].reason,'Winning bid <script> stays literal');
  assert.doesNotMatch(store.getItem(ui.N.storageKey(key)),/settlement|recovery|winningBid/);
});

test('past rounds lock, stale input events cannot write a later round, and settlement keeps all records',()=>{
  const ui=surface(),store=storage(),key='room:ABC:alice:1';ui.opener();
  const bind=decision=>ui.N.bind(ui.container,{key,lots:[unknown],storage:store,decision});
  bind({round:1,editable:true});
  const section=ui.dialog.querySelector('[data-notebook-decisions]'),tabs=section.querySelector('[data-decision-tabs]'),form=section.querySelector('[data-decision-form]');
  const oldInput=form.querySelector('[data-decision-ceiling]'),oldReason=form.querySelector('[data-decision-reason]'),oldPlan=form.querySelector('[data-decision-plan]');
  oldInput.value='500';oldInput.emit('input');oldReason.value='first clue';oldReason.emit('input');oldPlan.value='watch';oldPlan.emit('change');
  bind({round:1,editable:false});oldReason.value='after reveal';oldReason.emit('input');assert.equal(oldReason.value,'first clue');assert.equal(oldPlan.disabled,true);
  bind({round:2,editable:true});const newInput=form.querySelector('[data-decision-ceiling]');assert.notEqual(newInput,oldInput);assert.equal(newInput.value,'');assert.equal(tabs.querySelectorAll('[data-decision-round]').length,2);
  newInput.value='640';newInput.emit('input');oldInput.value='900';oldInput.emit('input');assert.equal(ui.N.loadNotes(store,key).rounds[1].ceiling,'500');assert.equal(ui.N.loadNotes(store,key).rounds[2].ceiling,'640');
  tabs.querySelectorAll('[data-decision-round]')[0].click();assert.equal(form.querySelector('[data-decision-ceiling]').readOnly,true);assert.equal(form.querySelector('[data-decision-ceiling]').value,'500');
  bind({round:2,editable:true});assert.equal(form.querySelector('[data-decision-ceiling]').readOnly,true,'poll must retain an intentional past-round selection');
  tabs.querySelectorAll('[data-decision-round]')[1].click();assert.equal(form.querySelector('[data-decision-ceiling]').readOnly,false);
  bind({round:2,editable:false,settlement:{sold:true,winningBid:600,recovery:750,youWon:false}});
  assert.equal(form.querySelector('[data-decision-ceiling]').readOnly,true);const html=section.querySelector('[data-decision-comparison]').innerHTML;assert.match(html,/−100/);assert.match(html,/\+40/);assert.match(html,/750/);assert.doesNotMatch(html,/Round 3/);
  assert.equal(ui.N.loadNotes(store,key).rounds[1].stance,'watch');assert.equal(ui.N.loadNotes(store,key).rounds[1].reason,'first clue');
});

test('round records restore per seat/crate and blocked storage retains in-memory decisions safely',()=>{
  const ui=surface(),store=storage(),key='solo:1:1';ui.opener();
  const bind=key=>ui.N.bind(ui.container,{key,lots:[unknown],storage:store,decision:{round:1,editable:true}});
  bind(key);const section=()=>ui.dialog.querySelector('[data-notebook-decisions]'),form=()=>section().querySelector('[data-decision-form]');
  const reason=form().querySelector('[data-decision-reason]');reason.value='😀'.repeat(170);reason.emit('input');assert.equal([...reason.value].length,160);
  form().querySelector('[data-decision-ceiling]').value='0';form().querySelector('[data-decision-ceiling]').emit('input');
  bind('solo:1:2');assert.equal(form().querySelector('[data-decision-ceiling]').value,'');bind(key);assert.equal(form().querySelector('[data-decision-ceiling]').value,'0');assert.equal([...form().querySelector('[data-decision-reason]').value].length,160);
  const blocked={getItem(){throw new Error('no');},setItem(){throw new Error('no');}};
  ui.N.bind(ui.container,{key:'room:ABC:bob:1',lots:[unknown],storage:blocked,decision:{round:1,editable:true}});
  const input=form().querySelector('[data-decision-ceiling]');input.value='400';assert.doesNotThrow(()=>input.emit('input'));assert.equal(input.value,'400');assert.equal(ui.dialog.querySelector('[data-notebook-storage]').hidden,false);
});
