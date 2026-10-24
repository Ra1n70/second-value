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
  'Round decisions', 'Optional: record your thinking before bids reveal. This does not submit a bid.',
  'Your maximum price', 'Optional whole-number ceiling', 'My plan', 'No plan recorded',
  'Plan to bid', 'Watch this round', 'Reason', 'Optional reason (up to 160 characters)',
  'Editable until this round reveals.', 'This record is read-only right now.', 'Review your decisions',
  'Winning bid', "Buyer's actual recovery", "This is the buyer's recovery after fees, using their role and sale choice.",
  'Your ceiling minus winning bid', 'Price comparison only. Timing and tie priority also affect who wins.',
  'No sale. There is no winning price to compare.', 'Comparison appears after settlement.',
  'Not recorded', 'For the whole crate',
];
test('round decisions and comparison copy translate in both documents and return to English',()=>{
  for(const online of [false,true]){
    const h=runtime(online);
    for(const language of ['zh-CN','es','en','es','zh-CN','en']){
      h.base.setLanguage(language);
      for(const source of copy){
        const translated=h.locale.translate(source);
        if(language==='en')assert.equal(translated,source);
        else {assert.notEqual(translated,source,`${online}/${language}: ${source}`);assert.doesNotMatch(translated,/undefined|NaN/);}
        if(language==='es')assert.doesNotMatch(translated,/[\u3400-\u9fff]/);
        if(source.includes('160'))assert.match(translated,/160/);
        assert.equal(h.locale.translate(translated),translated,`${online}/${language}: idempotent`);
      }
    }
  }
});
test('standalone notebook round labels translate in solo and multiplayer without changing round numbers',()=>{
  for(const online of [false,true]){
    const h=runtime(online);
    for(const language of ['zh-CN','es','en']){
      h.base.setLanguage(language);
      for(const round of [1,2,3])assert.equal(h.locale.translate('Round '+round),language==='zh-CN'?`第 ${round} 轮`:language==='es'?`Ronda ${round}`:`Round ${round}`);
    }
  }
});
