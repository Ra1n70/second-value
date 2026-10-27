import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';

const require=createRequire(import.meta.url), E=require('../game/engine.cjs');
const client=new URL('../game/client/',import.meta.url);
const scripts=await Promise.all(['locale-es.js','i18n.js','online-locale.js'].map(name=>readFile(new URL(name,client),'utf8')));
const rare=E.catalogItems(6).filter(item=>item.rarity==='rare');
const collectionModule={exports:{}};
vm.runInNewContext(await readFile(new URL('collection.js',client),'utf8'),{module:collectionModule});
const chineseNames={
  'midnight-regulator':'午夜检修钟','tide-wireless':'潮汐值班电台',
  'blue-line-cup':'蓝线餐车杯','canceled-voyage-medal':'未启航纪念章',
  'last-service-camera':'末班线折叠相机','night-pilot-chart':'夜航引水图',
  'gilded-prop-clock':'加冕礼道具钟','silver-stage-chart':'银墨舞台海图'
};

// Only the locale walker's text and accessible-attribute surface is modeled.
// Game actions and browser rendering are verified by their own integration paths.
class Element {
  constructor(tag,attrs={},text=''){this.nodeType=1;this.tagName=tag.toUpperCase();this.attrs=new Map(Object.entries(attrs));this.childNodes=[];this.parentElement=null;this.open=false;if(text)this.append({nodeType:3,nodeValue:text,parentElement:null});}
  append(node){node.parentElement=this;this.childNodes.push(node);return node;}
  get textContent(){return this.childNodes.map(node=>node.nodeType===3?node.nodeValue:node.textContent).join('');}
  hasAttribute(name){return this.attrs.has(name);}
  getAttribute(name){return this.attrs.get(name)??null;}
  setAttribute(name,value){this.attrs.set(name,String(value));}
  matches(selector){return selector.split(',').some(part=>{part=part.trim();return part.startsWith('[')?this.hasAttribute(part.slice(1,-1)):this.tagName===part.toUpperCase();});}
  closest(selector){for(let node=this;node;node=node.parentElement)if(node.matches(selector))return node;return null;}
  querySelectorAll(selector){const found=[];const visit=node=>{for(const child of node.childNodes)if(child.nodeType===1){if(child.matches(selector))found.push(child);visit(child);}};visit(this);return found;}
}
function parse(markup){
  const decode=value=>value.replace(/&(?:amp|lt|gt|quot|#39);/g,key=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"}[key]));
  const surface=new Element('div'),stack=[surface];
  for(const token of markup.match(/<[^>]+>|[^<]+/g)||[]){
    if(token.startsWith('</')){stack.pop();continue;}
    if(!token.startsWith('<')){stack.at(-1).append({nodeType:3,nodeValue:decode(token),parentElement:null});continue;}
    const tag=token.match(/^<([a-z0-9-]+)/i)?.[1];if(!tag)continue;
    const attrs=Object.fromEntries([...token.matchAll(/([a-z][a-z0-9-]*)(?:="([^"]*)")?/gi)].slice(1).map(([,name,value])=>[name,decode(value??'')]));
    const node=stack.at(-1).append(new Element(tag,attrs));
    if(!token.endsWith('/>')&&!['br','hr','img','input'].includes(tag))stack.push(node);
  }
  return surface;
}
function harness(online){
  let current=new URL('https://game.test/'+(online?'online.html':'index.html'));
  const document={documentElement:{},getElementById(){return null;},querySelector(){return null;},createTreeWalker(container,_show,filter){const found=[];const visit=node=>{for(const child of node.childNodes){if(child.nodeType===3&&filter.acceptNode(child)===1)found.push(child);if(child.nodeType===1)visit(child);}};visit(container);let cursor=0;return{nextNode:()=>found[cursor++]||null};}};
  const context=vm.createContext({document,URL,URLSearchParams,location:{get href(){return current.href;},get search(){return current.search;}},localStorage:{getItem(){return null;},setItem(){}},history:{state:null,replaceState(_state,_title,value){current=new URL(value,current);}},NodeFilter:{SHOW_TEXT:4,FILTER_REJECT:2,FILTER_ACCEPT:1},CustomEvent:class{},addEventListener(){},dispatchEvent(){}});
  context.window=context;for(const source of scripts.slice(0,online?3:2))vm.runInContext(source,context);
  return{base:context.SecondValueLocale,L:online?context.SecondValueOnlineLocale:context.SecondValueLocale};
}
const languages=['zh-CN','es','en','zh-CN','es','en'];
const keys=[
  'Artwork','Enlarge artwork','Close artwork','Press Escape or use Close to return.',
  'Category','All categories','Sort by','Catalog order','Price: low to high','Price: high to low','Reset filters','No matching discoveries.',
  'Discovery book','DISCOVERY ARCHIVE','Objects with a second story.','Seen at the table, remembered here.',
  'Discovered','All objects','Discovered only','Undiscovered object','Identity undiscovered',
  'Settle a purchased crate to record its publicly revealed objects. Everyone at the table can discover them.',
  'Discoveries stay in this browser. Clearing site data removes them; they do not sync across devices.',
  'Storage is unavailable. Discoveries will last only while this page stays open.',
  'Discoveries do not grant coins, change prices or improve abilities.',
  'No discoveries yet.','The next settled crate can start your archive.','Rare find','Virtual coins','No theme',
  'Object story','From the archive','This item has not been discovered. Its identity, value and story remain hidden.',
  'Close discovery book','View discovery book','New discoveries this crate','Newly discovered',
  'Open the discovery book to read their stories.'
];

test('artwork zoom labels translate every confirmed catalog name while keeping identity attributes stable',async()=>{
  const zoomModule={exports:{}},artModule={exports:{}};
  vm.runInNewContext(await readFile(new URL('art-zoom.js',client),'utf8'),{module:zoomModule});
  vm.runInNewContext(await readFile(new URL('art.js',client),'utf8'),{module:artModule});
  const zoom=zoomModule.exports.createViewer({engine:E,art:artModule.exports});
  for(const online of [false,true])for(const item of E.ITEMS){
    const h=harness(online),surface=parse(zoom.trigger(item,true,''));
    const button=surface.querySelectorAll('[aria-label]')[0];
    for(const language of languages){
      h.base.setLanguage(language);h.L.localize(surface);
      assert.equal(button.getAttribute('aria-label'),h.L.translate('Enlarge artwork: '+item.name));
      assert.ok(button.getAttribute('aria-label').includes(h.L.translate(item.name)));
      assert.equal(button.getAttribute('data-art-zoom'),item.catalogId);
      assert.equal(button.getAttribute('data-art-zoom-known'),'true');
      if(language!=='en')assert.notEqual(button.getAttribute('aria-label'),'Enlarge artwork: '+item.name);
    }
  }
});

test('all eight rare identities, stories and provenance translate from the actual v6 catalog and regain their English source',()=>{
  assert.equal(rare.length,8);
  for(const online of [false,true]){
    const h=harness(online);
    for(const item of rare){
      const surface=new Element('article');
      const nodes=[item.name,item.story,item.provenance].map(text=>surface.append(new Element('p',{},text)));
      for(const language of languages){
        h.base.setLanguage(language);h.L.localize(surface);
        for(const [index,key] of [item.name,item.story,item.provenance].entries()){
          assert.equal(nodes[index].textContent,h.L.translate(key),`${language}: ${item.catalogId}`);
          if(language!=='en')assert.notEqual(nodes[index].textContent,key,`${language}: missing ${key}`);
          if(language==='es')assert.doesNotMatch(nodes[index].textContent,/[\u3400-\u9fff]/);
        }
        if(language==='zh-CN')assert.equal(nodes[0].textContent,chineseNames[item.catalogId]);
        if(language==='en')assert.deepEqual(nodes.map(node=>node.textContent),[item.name,item.story,item.provenance]);
      }
    }
  }
});

test('discovery book text, unknown-identity guidance and accessible labels switch in place with stable numeric progress',()=>{
  for(const online of [false,true]){
    const h=harness(online),dialog=new Element('dialog',{'aria-label':'Discovery book'});dialog.open=true;
    const close=dialog.append(new Element('button',{'aria-label':'Close discovery book',title:'Close discovery book'},'Close discovery book'));
    const texts=keys.map(key=>dialog.append(new Element('p',{},key)));
    const progress=dialog.append(new Element('span',{'data-no-localize':''},'7 / 32'));
    const price=dialog.append(new Element('strong',{'data-no-localize':''},'240'));
    for(const language of languages){
      h.base.setLanguage(language);h.L.localize(dialog);
      assert.equal(dialog.open,true,'a live language change does not close the book');
      assert.equal(progress.textContent,'7 / 32');assert.equal(price.textContent,'240');
      assert.equal(dialog.getAttribute('aria-label'),h.L.translate('Discovery book'));
      for(const attribute of ['aria-label','title'])assert.equal(close.getAttribute(attribute),h.L.translate('Close discovery book'));
      for(const [index,key] of keys.entries()){
        assert.equal(texts[index].textContent,h.L.translate(key));
        if(language!=='en')assert.notEqual(texts[index].textContent,key,`${language}: ${key}`);
      }
    }
  }
});

test('new catalog names are included in existing inspection, public reveal and ability-target translations',()=>{
  const h=harness(true),item=rare.find(candidate=>candidate.catalogId==='midnight-regulator');
  const sources=[
    `Public reveal: object B — ${item.name}, Genuine, base 240.`,
    `Select repair: ${item.name}`,
    `${item.name}. Genuine. Condition: damaged. Category: mechanical. Theme: Railway. Base sale price: 240.`
  ];
  for(const language of ['zh-CN','es','en']){
    h.base.setLanguage(language);
    for(const source of sources){
      const translated=h.L.translate(source);
      assert.ok(translated.includes(h.L.translate(item.name)));
      if(language!=='en'){assert.notEqual(translated,source);assert.ok(!translated.includes(item.name));}
      else assert.equal(translated,source);
      if(source.includes('240'))assert.match(translated,/240/);
    }
  }
});

test('actual settled-discovery strip and known-object story markup localize without depending on private extra metadata',()=>{
  const book=collectionModule.exports.createBook({engine:E,storage:{getItem(){return null;},setItem(){}}});
  const ids=book.recordSettlement({key:'locale-settled-crate',phase:'result',sold:true,active:true,rulesVersion:6,
    lots:rare.slice(0,6).map(item=>({catalogId:item.catalogId,known:true,source:'Crate opened'}))});
  assert.equal(ids.length,6);
  for(const online of [false,true]){
    const h=harness(online),strip=parse(book.newDiscoveriesMarkup(ids));
    const knownItem=rare[0];
    const storyMarkup=book.storyMarkup({catalogId:knownItem.catalogId,shape:knownItem.shape},true);
    assert.ok(storyMarkup,'a legally known room projection need not carry story or rarity fields');
    assert.equal(book.storyMarkup({catalogId:knownItem.catalogId,shape:knownItem.shape},false),'');
    const story=parse(storyMarkup);
    for(const language of languages){
      h.base.setLanguage(language);h.L.localize(strip);h.L.localize(story);
      assert.equal(strip.querySelectorAll('[aria-label]')[0].getAttribute('aria-label'),h.L.translate('New discoveries this crate'));
      assert.ok(strip.textContent.includes(h.L.translate('View discovery book')));
      assert.equal(strip.querySelectorAll('strong')[0].textContent,'6');
      for(const item of rare.slice(0,6))assert.ok(strip.textContent.includes(h.L.translate(item.name)));
      assert.ok(story.textContent.includes(h.L.translate('Rare find')));
      assert.ok(story.textContent.includes(h.L.translate(knownItem.story)));
      assert.ok(story.textContent.includes(h.L.translate(knownItem.provenance)));
    }
  }
});
