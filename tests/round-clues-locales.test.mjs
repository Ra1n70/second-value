import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const client=new URL('../game/client/',import.meta.url);
const scripts=await Promise.all(['locale-es.js','i18n.js','online-locale.js','round-clues.js'].map(name=>readFile(new URL(name,client),'utf8')));
const exported={exports:{}};vm.runInNewContext(scripts[3],{module:exported});
const clues=exported.exports;
// This small surface runs the actual language walker on the module's markup.
// It covers text and label mutation; a real browser covers rendering/clicks.
class Element {
  constructor(tag,attrs={}){this.nodeType=1;this.tagName=tag.toUpperCase();this.attrs=new Map(Object.entries(attrs));this.childNodes=[];this.parentElement=null;}
  append(node){node.parentElement=this;this.childNodes.push(node);return node;}
  get textContent(){return this.childNodes.map(n=>n.nodeType===3?n.nodeValue:n.textContent).join('');}
  hasAttribute(key){return this.attrs.has(key);}
  getAttribute(key){return this.attrs.get(key)??null;}
  setAttribute(key,value){this.attrs.set(key,String(value));}
  matches(selector){return selector.split(',').some(s=>{s=s.trim();return s.startsWith('[')?this.hasAttribute(s.slice(1,-1)):this.tagName===s.toUpperCase();});}
  closest(selector){for(let node=this;node;node=node.parentElement)if(node.matches(selector))return node;return null;}
  querySelectorAll(selector){const result=[];const visit=node=>{for(const child of node.childNodes)if(child.nodeType===1){if(child.matches(selector))result.push(child);visit(child);}};visit(this);return result;}
}
const decode=s=>s.replace(/&(?:amp|lt|gt|quot|#39);/g,x=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"}[x]));
function parse(markup){
  const root=new Element('div'),stack=[root];
  for(const token of markup.match(/<[^>]+>|[^<]+/g)||[]){
    if(token.startsWith('</')){stack.pop();continue;}
    if(token.startsWith('<')){
      const tag=token.match(/^<([a-z0-9-]+)/i)?.[1];if(!tag)continue;
      const attrs=Object.fromEntries([...token.matchAll(/([a-z][a-z0-9-]*)(?:="([^"]*)")?/gi)].slice(1).map(([,name,value])=>[name,decode(value??'')]));
      const node=stack.at(-1).append(new Element(tag,attrs));if(!token.endsWith('/>')&&!['br','hr','img','input'].includes(tag))stack.push(node);
    }else stack.at(-1).append({nodeType:3,nodeValue:decode(token),parentElement:null});
  }
  return root;
}
function runtime(online){
  let url=new URL('https://game.test/'+(online?'online.html':'index.html'));
  const document={documentElement:{},getElementById(){return null;},querySelector(){return null;},createTreeWalker(container,_show,filter){const text=[];const visit=node=>{for(const child of node.childNodes){if(child.nodeType===3&&filter.acceptNode(child)===1)text.push(child);if(child.nodeType===1)visit(child);}};visit(container);let i=0;return {nextNode:()=>text[i++]||null};}};
  const context=vm.createContext({document,location:{get href(){return url.href;},get search(){return url.search;}},URL,URLSearchParams,
    localStorage:{getItem(){return null;},setItem(){}},history:{state:null,replaceState(_state,_title,value){url=new URL(value,url);}},
    NodeFilter:{SHOW_TEXT:4,FILTER_REJECT:2,FILTER_ACCEPT:1},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},addEventListener(){},dispatchEvent(){}});
  context.window=context;for(const source of scripts.slice(0,online?3:2))vm.runInContext(source,context);
  return {base:context.SecondValueLocale,L:online?context.SecondValueOnlineLocale:context.SecondValueLocale};
}
const publicLot={slot:2,label:'Harbor crew badge',base:100,known:true,source:'Public reveal'};
test('real round-2 clue markup switches its new information and keeps count intact',()=>{
  const markup=clues.markup({round:2,genuineCount:4,repairableCount:null,publicLot:null});assert.ok(markup);
  for(const online of [false,true]){
    const h=runtime(online),surface=parse(markup);
    for(const language of ['zh-CN','es','en','es','zh-CN','en']){
      h.base.setLanguage(language);h.L.localize(surface);
      assert.equal(surface.querySelectorAll('[aria-label]')[0].getAttribute('aria-label'),h.L.translate('New this round'));
      assert.ok(surface.textContent.includes(h.L.translate('New this round')));
      assert.ok(surface.textContent.includes(h.L.translate('Genuine objects')));
      assert.match(surface.textContent,/4\s*\/\s*6/);
      if(language!=='en')assert.ok(!surface.textContent.includes('New this round'));
    }
  }
});
test('real round-3 clue markup localizes old versus new clues and public catalog identity',()=>{
  const markup=clues.markup({round:3,genuineCount:4,repairableCount:2,publicLot});assert.ok(markup);
  for(const online of [false,true]){
    const h=runtime(online),surface=parse(markup);
    const numbers=surface.textContent.match(/\d+/g);
    for(const language of ['zh-CN','es','en','zh-CN','es','en']){
      h.base.setLanguage(language);h.L.localize(surface);
      assert.equal(surface.querySelectorAll('[aria-label]')[0].getAttribute('aria-label'),h.L.translate('New this round'));
      for(const source of ['New this round','Already known','Genuine objects','Repairable objects','Public reveal','Base price','View object'])assert.ok(surface.textContent.includes(h.L.translate(source)),`${online}/${language}: ${source}`);
      assert.ok(surface.textContent.includes(h.L.translate(publicLot.label)));
      assert.deepEqual(surface.textContent.match(/\d+/g),numbers,'numeric facts remain unchanged');
      if(language!=='en'){assert.ok(!surface.textContent.includes(publicLot.label));assert.ok(!surface.textContent.includes('Already known'));}
    }
  }
});
