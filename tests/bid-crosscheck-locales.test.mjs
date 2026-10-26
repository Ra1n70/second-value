import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const client = new URL('../game/client/',import.meta.url);
const sources = await Promise.all(['locale-es.js','i18n.js','online-locale.js'].map(name=>readFile(new URL(name,client),'utf8')));
function runtime(online) {
  let url = new URL('https://secondvalue.test/'+(online?'online.html':'index.html'));
  const document = {documentElement:{},getElementById(){return null;},querySelector(){return null;}};
  const location = {get href(){return url.href;},get search(){return url.search;}};
  const context = vm.createContext({document,location,URL,URLSearchParams,
    localStorage:{getItem(){return null;},setItem(){}},
    history:{state:null,replaceState(_state,_title,value){url=new URL(value,url);}},
    CustomEvent:class {constructor(type,options){this.type=type;this.detail=options?.detail;}},
    addEventListener(){},dispatchEvent(){}});
  context.window=context;
  for(const source of sources.slice(0,online?3:2))vm.runInContext(source,context);
  return {base:context.SecondValueLocale,locale:online?context.SecondValueOnlineLocale:context.SecondValueLocale};
}
const copy = [
  'Check your bid', 'Your recorded maximum', 'No maximum recorded this round.',
  'Your recorded maximum is invalid.', 'Your notes do not set or limit your bid.',
  'Above your recorded maximum by', 'You recorded a plan to watch this round.',
  'You can still confirm this bid, or return to edit.', 'Clues available this round',
  'Genuine objects', 'Repairable objects', 'No object identities confirmed yet.',
  'Source clues describe possibilities, not guaranteed contents.',
];

test('bid crosscheck copy switches CN, ES and EN in both clients without rewriting its English source',()=>{
  for(const online of [false,true]){
    const h=runtime(online);
    assert.equal(h.base.language,'en');
    for(const language of ['zh-CN','es','en','es','zh-CN','en']){
      h.base.setLanguage(language);
      for(const source of copy){
        const translated=h.locale.translate(source);
        if(language==='en')assert.equal(translated,source);
        else {assert.notEqual(translated,source,`${online}/${language}: ${source}`);assert.doesNotMatch(translated,/undefined|NaN/);}
        if(language==='es')assert.doesNotMatch(translated,/[\u3400-\u9fff]/);
        assert.equal(h.locale.translate(translated),translated,`${online}/${language}: idempotent`);
      }
    }
  }
});

test('review labels keep recorded maximum separate from actual sealed bid and optional warnings nonblocking',()=>{
  for(const online of [false,true]){
    const h=runtime(online);
    for(const language of ['zh-CN','es']){
      h.base.setLanguage(language);
      assert.notEqual(h.locale.translate('Your recorded maximum'),h.locale.translate('Your sealed bid'));
      assert.notEqual(h.locale.translate('No maximum recorded this round.'),h.locale.translate('Your recorded maximum is invalid.'));
      assert.match(h.locale.translate('You can still confirm this bid, or return to edit.'),language==='zh-CN'?/仍可确认/:/Puedes confirmar/);
      assert.match(h.locale.translate('Your notes do not set or limit your bid.'),language==='zh-CN'?/不会.*限制/:/no fijan ni limitan/);
    }
  }
});
