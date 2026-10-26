import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const E=createRequire(import.meta.url)('../game/engine.cjs');
const client=new URL('../game/client/',import.meta.url);
const online=await readFile(new URL('online.js',client),'utf8');
const localeSources=await Promise.all(['locale-es.js','i18n.js','online-locale.js'].map(name=>readFile(new URL(name,client),'utf8')));
const extract=name=>online.match(new RegExp('  function '+name+'\\([^\\n]*\\) \\{[\\s\\S]*?\\n  \\}'))?.[0];
const styles={steady:'Steady',bold:'Bold',patient:'Patient'},hints={steady:'Balances price and risk.',bold:'Takes more risk when the value is uncertain.',patient:'Waits for clearer clues, then bids with confidence.'};
const markup=state=>vm.runInNewContext(['computerBadge','lobbyBotControls','lobbyPlayer'].map(extract).join('\n')+'\nlobbyBotControls()+lobbyPlayer(state.view.players[1]);',{state,E,Art:{portraitFor(){return null;}},sprite(){return '';},botStyles:styles,botStyleHints:hints,userName:p=>p.name,escape:v=>String(v).replaceAll('"','&quot;')});

test('computer controls follow host capabilities and preserve selected style across fresh markup',()=>{
  const bot={id:'computer-1',name:'Marlow',role:'restorer',active:true,isBot:true,botStyle:'patient',ready:true};
  const state={botStyle:'bold',view:{selfId:'host',hostId:'host',can:{addBot:true,removeBot:true},players:[{id:'host'},bot]}};
  let html=markup(state);
  assert.match(html,/id="online-add-bot"/);assert.match(html,/value="bold" selected/);assert.match(html,/data-online-remove-bot="computer-1"/);
  assert.match(html,/Computer<\/span> · <span>Patient/);assert.match(html,/Always ready/);assert.doesNotMatch(html,/is-offline/);
  state.view.can.addBot=false;html=markup(state);assert.match(html,/id="online-add-bot" disabled/);assert.match(html,/All four seats are occupied/);
  state.view.selfId='guest';state.view.can={addBot:false,removeBot:false};html=markup(state);assert.doesNotMatch(html,/online-add-bot|data-online-remove-bot/);assert.match(html,/Computer/);
  state.view.selfId='host';state.view.can={};html=markup(state);assert.doesNotMatch(html,/online-add-bot|data-online-remove-bot/);
});

test('real computer UI handlers send the selected style and server assigned ID without profile or private data',()=>{
  const handlers=new Map(),buttons=[{dataset:{onlineRemoveBot:'computer-7'},addEventListener(_event,fn){this.click=fn;}}],commands=[];
  const hint={textContent:''},state={botStyle:'steady'};
  const main={querySelector(selector){if(selector==='#online-bot-style-hint')return hint;return {addEventListener(event,fn){handlers.set(selector+':'+event,fn);}};},querySelectorAll(selector){return selector==='[data-online-remove-bot]'?buttons:[];}};
  const context={main,state,botStyles:styles,botStyleHints:hints,L:{localize(){}},poll(){},clearSeat(){},command:(...args)=>commands.push(args)};
  vm.runInNewContext(extract('bind')+'\nbind();',context);
  handlers.get('#online-bot-style:change')({target:{value:'bold'}});handlers.get('#online-add-bot:click')();buttons[0].click();
  assert.deepEqual(JSON.parse(JSON.stringify(commands)),[['add-bot',{style:'bold'}],['remove-bot',{playerId:'computer-7'}]]);
  assert.equal(hint.textContent,hints.bold);
  handlers.get('#online-bot-style:change')({target:{value:'untrusted-style'}});assert.equal(state.botStyle,'bold');
});

test('computer controls, single-human warning, rules and engine errors switch CN/ES/EN',()=>{
  let url=new URL('https://secondvalue.test/online.html');
  const document={documentElement:{},getElementById(){return null;},querySelector(){return null;}};
  const location={get href(){return url.href;},get search(){return url.search;}};
  const context=vm.createContext({document,location,URL,URLSearchParams,localStorage:{getItem(){return null;},setItem(){}},history:{state:null,replaceState(_s,_t,value){url=new URL(value,url);}},CustomEvent:class{},addEventListener(){},dispatchEvent(){}});context.window=context;
  for(const source of localeSources)vm.runInContext(source,context);
  const copy=[...localeSources[2].split('  const words = {')[1].split("    'Room recovery'")[0].matchAll(/^    '([^']+)':/gm)].map(match=>match[1]);
  copy.push(...Object.values(styles),'Remove');
  assert.ok(copy.length>20);
  for(const language of ['zh-CN','es','en','es','zh-CN','en']){
    context.SecondValueLocale.setLanguage(language);
    for(const phrase of copy){const translated=context.SecondValueOnlineLocale.translate(phrase);
      if(language==='en')assert.equal(translated,phrase);else assert.notEqual(translated,phrase,`${language}: ${phrase}`);
      if(language==='es')assert.doesNotMatch(translated,/[\u3400-\u9fff]/);
      assert.equal(context.SecondValueOnlineLocale.translate(translated),translated);
    }
  }
});
