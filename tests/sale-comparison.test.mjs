import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),E=require('../game/engine.cjs');
const source=await readFile(new URL('../game/client/sale-comparison.js',import.meta.url),'utf8');
function runtime(){const context={module:{exports:{}}};for(const key of ['SecondValue','game','fetch','localStorage','sessionStorage'])Object.defineProperty(context,key,{get(){throw new Error('Sale comparison must not read '+key);}});runInNewContext(source,context);return context.module.exports;}
const C=runtime(),ordinary={sale:400,bonus:0,cost:0,recovery:400},special={sale:400,bonus:100,cost:25,recovery:475};
function part(html,mode){return html.match(new RegExp('<article[^>]*data-sale-comparison-mode="'+mode+'"[^>]*>([\\s\\S]*?)</article>'))?.[0]||'';}
test('two independently supplied plans show gross including bonus, fees, net recovery and profit',()=>{
 const html=C.markup({ordinary,special,paid:450,hasAbility:true,selectedMode:'ordinary'}),normal=part(html,'ordinary'),ability=part(html,'special');
 assert.match(normal,/data-no-localize>400</);assert.match(normal,/data-no-localize>−50</);assert.match(ability,/data-no-localize>500</);assert.match(ability,/data-no-localize>−25</);assert.match(ability,/data-no-localize>475</);assert.match(ability,/data-no-localize>\+25</);
 assert.match(normal,/is-selected/);assert.doesNotMatch(ability,/is-selected/);assert.match(html,/data-no-localize>\+75</);
 assert.equal((html.match(/<span>Winning bid<\/span>/g)||[]).length,1);assert.match(html,/Sale proceeds include ability bonuses/);assert.match(html,/net recovery − winning bid/);
});
test('missing or failed special selection keeps ordinary baseline without inventing special numbers',()=>{
 const html=C.markup({ordinary,special:null,paid:450,hasAbility:true,selectedMode:'special',error:'Select exactly three exhibition objects.'}),normal=part(html,'ordinary'),ability=part(html,'special');
 assert.match(normal,/400/);assert.match(normal,/−50/);assert.match(ability,/is-selected/);assert.match(ability,/Choose the ability targets/);assert.match(ability,/Select exactly three/);assert.doesNotMatch(ability,/<dl|data-no-localize|400|−50/);assert.doesNotMatch(html,/Net gain vs ordinary sale/);
 const fallback=C.markup({ordinary,special:ordinary,paid:450,hasAbility:true,error:'Bad selection'});assert.doesNotMatch(part(fallback,'special'),/<dl|400/);
});
test('negative ability effect remains visible and does not auto-select the ordinary plan',()=>{
 const a={sale:70,bonus:0,cost:0,recovery:70},b={sale:70,bonus:21,cost:25,recovery:66};
 const html=C.markup({ordinary:a,special:b,paid:60,hasAbility:true,selectedMode:'special'});
 assert.match(part(html,'ordinary'),/\+10/);assert.match(part(html,'special'),/\+6/);assert.match(part(html,'special'),/is-selected/);assert.doesNotMatch(part(html,'ordinary'),/is-selected/);assert.match(html,/sale-comparison-difference is-loss/);assert.match(html,/data-no-localize>−4</);
});
test('no-ability role shows a single ordinary card and ignores irrelevant special/errors',()=>{
 const html=C.markup({ordinary,special,paid:400,hasAbility:false,selectedMode:'ordinary',error:'hidden-error'});
 assert.match(html,/has-single/);assert.match(html,/Your role uses ordinary sale prices/);assert.equal((html.match(/data-sale-comparison-mode/g)||[]).length,1);assert.doesNotMatch(html,/Ability processing|hidden-error|Net gain vs ordinary sale/);assert.match(html,/data-no-localize>0</);
});
test('invalid plans and prices do not coerce string/NaN fields into plausible currency',()=>{
 for(const bad of [null,{}, {...special,cost:-1},{...special,cost:'25'},{...special,recovery:NaN},{...special,recovery:470},{sale:Number.MAX_SAFE_INTEGER,bonus:1,cost:0,recovery:Number.MAX_SAFE_INTEGER}])assert.equal(C.normalizePlan(bad),null);
 const html=C.markup({ordinary,special,paid:'450',hasAbility:true});assert.match(html,/data-no-localize>—</);assert.doesNotMatch(part(html,'ordinary'),/−50/);assert.doesNotMatch(part(html,'special'),/\+25/);
 const empty=C.markup(null);assert.match(empty,/Ordinary sale/);assert.match(empty,/Sale preview unavailable/);assert.doesNotMatch(empty,/>0</);
 const zero=C.normalizePlan({sale:0,bonus:0,cost:0,recovery:0});assert.equal(zero.recovery,0);
});
test('error text is escaped, plans remain immutable, and real engine plans are accepted',()=>{
 const html=C.markup({ordinary,special:null,paid:200,hasAbility:true,error:'<img src=x onerror="bad()"> & fail'});assert.match(html,/&lt;img src=x onerror=&quot;bad\(\)&quot;&gt; &amp; fail/);assert.doesNotMatch(html,/<img/);
 const input={ordinary:{...ordinary},special:{...special},paid:200,hasAbility:true,selectedMode:'special'},copy=structuredClone(input);assert.equal(C.markup(input),C.markup(input));assert.deepEqual(input,copy);
 const items=E.catalogItems().filter(i=>['harbor-clock','replica-cup','crew-badge','tea-cup','toy-camera','harbor-map'].includes(i.catalogId));
 for(const role of Object.keys(E.ROLES)){const normal=E.salePlan(role,items,'ordinary',1000),ability=E.salePlan(role,items,'special',1000,{theme:'harbor'});assert.ok(C.normalizePlan(normal));assert.ok(C.normalizePlan(ability));assert.match(C.markup({ordinary:normal,special:ability,paid:900,hasAbility:role!=='appraiser',selectedMode:'ordinary'}),/Sale comparison/);}
});
