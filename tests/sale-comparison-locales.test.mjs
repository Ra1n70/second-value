import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const client=new URL('../game/client/',import.meta.url);
const scripts=await Promise.all(['locale-es.js','i18n.js','online-locale.js','sale-comparison.js'].map(name=>readFile(new URL(name,client),'utf8')));
const exported={exports:{}};vm.runInNewContext(scripts[3],{module:exported});
const comparison=exported.exports;
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
const ordinary={sale:400,cost:0,bonus:0,recovery:400};
const special={sale:525,cost:80,bonus:0,recovery:445};
const languages=['zh-CN','es','en','es','zh-CN','en'];
const numbers=surface=>surface.textContent.match(/[+−-]?\d[\d,]*/g)||[];
function assertVisible(surface,h,keys){for(const key of keys){const translated=h.L.translate(key);assert.ok(surface.textContent.includes(translated),key);if(h.L.language!=='en')assert.notEqual(translated,key,key);}}

test('actual sale comparison cards switch gross, costs, net recovery and profit/loss without altering signed amounts',()=>{
  const markup=comparison.markup({ordinary,special,paid:430,selectedMode:'special',hasAbility:true,error:''});assert.ok(markup);
  assert.match(markup,/[−-]30/,'ordinary plan is a loss');assert.match(markup,/\+15/,'ability plan is profitable');
  for(const online of [false,true]){
    const h=runtime(online),surface=parse(markup),amounts=numbers(surface);
    for(const language of languages){
      h.base.setLanguage(language);h.L.localize(surface);
      assertVisible(surface,h,['Sale comparison','Ordinary sale','Ability processing','Selected plan','Sale proceeds before fees','Processing fees','Net recovery','Final profit / loss','Winning bid','Net gain vs ordinary sale','Sale proceeds include ability bonuses.','Final profit / loss = net recovery − winning bid.']);
      assert.deepEqual(numbers(surface),amounts,'all signed prices and fees survive every language change');
      const label=surface.querySelectorAll('[aria-label]')[0];if(label)assert.equal(label.getAttribute('aria-label'),h.L.translate('Sale comparison'));
      if(language==='zh-CN'){assert.ok(surface.textContent.includes('售出收入（未扣费用）'));assert.ok(surface.textContent.includes('回收金额（已扣费用）'));assert.ok(surface.textContent.includes('最终盈亏'));}
    }
  }
});

test('incomplete ability selection and existing processing errors localize in place',()=>{
  for(const error of ['', 'Not enough cash to pay the selected processing fees first.']){
    const markup=comparison.markup({ordinary,special:null,paid:430,selectedMode:'special',hasAbility:true,error});
    for(const online of [false,true]){
      const h=runtime(online),surface=parse(markup),amounts=numbers(surface);
      assert.equal(surface.querySelectorAll('article')[1].querySelectorAll('dd').length,0,'pending ability has no invented numeric values');
      for(const language of languages){
        h.base.setLanguage(language);h.L.localize(surface);
        assertVisible(surface,h,['Ordinary sale','Ability processing',error||'Choose the ability targets to compare.']);
        assert.deepEqual(numbers(surface),amounts);
        assert.doesNotMatch(surface.textContent,/undefined|NaN/);
      }
    }
  }
});

test('bonus-inclusive gross and fee-deducted net labels retain distinct amounts in all languages',()=>{
  const markup=comparison.markup({ordinary,special:{sale:400,bonus:80,cost:25,recovery:455},paid:430,selectedMode:'special',hasAbility:true});
  for(const online of [false,true]){
    const h=runtime(online),surface=parse(markup),specialCard=surface.querySelectorAll('article')[1];
    for(const language of languages){
      h.base.setLanguage(language);h.L.localize(surface);
      for(const [key,amount] of [['Sale proceeds before fees','480'],['Processing fees','−25'],['Net recovery','455'],['Final profit / loss','+25']]){
        const label=specialCard.querySelectorAll('dt').find(node=>node.textContent===h.L.translate(key));assert.ok(label,key);
        const value=label.parentElement.querySelectorAll('dd')[0];assert.equal(value.textContent,amount,`${language}: ${key}`);
      }
    }
  }
});

test('ordinary-only role and defensive sale preview fallback translate in both documents',()=>{
  for(const [input,expected] of [
    [{ordinary,special:null,paid:430,selectedMode:'ordinary',hasAbility:false},'Your role uses ordinary sale prices.'],
    [{ordinary:null,special:null,paid:430,selectedMode:'ordinary',hasAbility:true},'Sale preview unavailable.'],
  ]){
    const markup=comparison.markup(input);assert.ok(markup);
    for(const online of [false,true]){
      const h=runtime(online),surface=parse(markup),amounts=numbers(surface);
      for(const language of languages){h.base.setLanguage(language);h.L.localize(surface);assertVisible(surface,h,[expected]);assert.deepEqual(numbers(surface),amounts);}
    }
  }
});
