import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const source=await readFile(new URL('../game/client/round-clues.js',import.meta.url),'utf8');
function runtime(){
 const context={module:{exports:{}}};
 for(const key of ['SecondValue','game','localStorage','sessionStorage','fetch'])Object.defineProperty(context,key,{get(){throw new Error('Round clues must not read '+key);}});
 runInNewContext(source,context);return context.module.exports;
}
const C=runtime(),publicLot={slot:4,label:'Original harbor survey',base:190,known:true,source:'Public reveal'};
test('stage guards reject early hidden facts even when a caller supplies them',()=>{
 for(const round of [undefined,null,0,1,4,'2',{},NaN])assert.equal(C.markup({round,genuineCount:5,repairableCount:2,publicLot}),'');
 assert.equal(C.markup(null),'');
 const r2=C.markup({round:2,genuineCount:5,repairableCount:2,publicLot});
 assert.match(r2,/New this round/);assert.match(r2,/Genuine objects/);assert.match(r2,/5 \/ 6/);
 assert.doesNotMatch(r2,/Repairable|harbor survey|190|data-round-clue-slot|Already known/);
});
test('zero counts are valid, missing counts are not fabricated, retained truth is not labelled new',()=>{
 const r2=C.markup({round:2,genuineCount:0});assert.match(r2,/0 \/ 6/);
 const r3=C.markup({round:3,genuineCount:0,repairableCount:0});assert.match(r3,/Repairable objects/);assert.match(r3,/round-clues-retained/);assert.match(r3,/Already known/);assert.equal((r3.match(/0 \/ 6/g)||[]).length,2);
 const retainedOnly=C.markup({round:3,genuineCount:4});assert.match(retainedOnly,/Already known/);assert.doesNotMatch(retainedOnly,/round-clues-heading|round-clues-current|Repairable objects|New this round/);
 for(const value of [null,undefined,-1,7,1.5,'0',true,Infinity])assert.equal(C.markup({round:2,genuineCount:value}),'');
 assert.equal(C.markup({round:3}),'');
});
test('only a fully valid public third-round object gets a local navigation button',()=>{
 const good=C.markup({round:3,repairableCount:2,publicLot});assert.match(good,/data-round-clue-slot="4"/);assert.match(good,/Original harbor survey/);assert.match(good,/Base price/);assert.match(good,/190/);assert.match(good,/View object/);
 for(const lot of [{...publicLot,known:false},{...publicLot,known:1},{...publicLot,source:'Private note'},{...publicLot,source:'Crate opened'},{...publicLot,slot:-1},{...publicLot,slot:6},{...publicLot,slot:1.5},{...publicLot,slot:'4'},{...publicLot,label:''},{...publicLot,label:'  '},{...publicLot,label:42},{...publicLot,base:-1},{...publicLot,base:NaN},{...publicLot,base:1.5},{...publicLot,base:'190'},{...publicLot,base:Number.MAX_SAFE_INTEGER+1},null])assert.doesNotMatch(C.markup({round:3,repairableCount:2,publicLot:lot}),/data-round-clue-slot|harbor survey/);
 assert.match(C.markup({round:3,publicLot:{...publicLot,slot:0,base:0}}),/data-round-clue-slot="0"/);
});
test('labels are escaped, normalized output drops extra truth, and repeat renders are deterministic',()=>{
 const dirty={...publicLot,label:'<img src=x onerror="bad()"> & secret',repair:{sale:987654},genuine:false,seed:12345};
 const normalized=C.normalizePublicLot(dirty);assert.deepEqual(Object.keys(normalized).sort(),['base','label','slot']);
 const input={round:3,genuineCount:4,repairableCount:1,publicLot:dirty};
 const html=C.markup(input);assert.match(html,/&lt;img src=x onerror=&quot;bad\(\)&quot;&gt; &amp; secret/);assert.doesNotMatch(html,/<img|987654|12345|repair\.sale/);assert.equal(C.markup(input),html);assert.equal(input.publicLot.label,dirty.label);
 assert.equal([...C.normalizePublicLot({...publicLot,label:'😀'.repeat(170)}).label].length,160);
});
