import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const source=await readFile(new URL('../game/client/notebook.js',import.meta.url),'utf8');
const context={module:{exports:{}}};
for(const name of ['SecondValue','game','fetch'])Object.defineProperty(context,name,{get(){throw new Error('Review card cannot read '+name);}});
runInNewContext(source,context);
const N=context.module.exports,plain=value=>JSON.parse(JSON.stringify(value));
const key='room:CHECK:alice:1';
function store(rounds={}){
 const values=new Map([[N.storageKey(key),JSON.stringify({version:1,items:{},rounds})]]);
 let writes=0;
 return {values,get writes(){return writes;},getItem(k){return values.get(k)||null;},setItem(){writes++;throw new Error('Review cannot write notes');}};
}
const options=storage=>({key,storage,round:2,amount:500,pass:false,lots:[],clues:{genuineCount:3}});

test('review reads only exact player, crate, storage and requested round without mutation',()=>{
 const storage=store({1:{ceiling:'900',stance:'bid'},2:{ceiling:'450',stance:'watch'}}),before=[...storage.values.entries()];
 assert.deepEqual(plain(N.readRoundDecision(options(storage))),{ceiling:450,stance:'watch',invalid:false});
 for(const other of ['room:CHECK:bob:1','room:CHECK:alice:2'])assert.equal(N.readRoundDecision({...options(storage),key:other}).ceiling,null);
 assert.equal(N.readRoundDecision({...options(storage),round:3}).ceiling,null,'Do not fill the current blank from an earlier round');
 assert.equal(N.readRoundDecision({...options(storage),storage:store()}).ceiling,null);
 assert.match(N.reviewMarkup(options(storage)),/Above your recorded maximum by/);
 assert.deepEqual([...storage.values.entries()],before);assert.equal(storage.writes,0);
});

test('above maximum is a nonblocking difference; equal and below do not warn',()=>{
 const storage=store({2:{ceiling:'450',stance:'bid'}});
 const above=N.reviewMarkup(options(storage));assert.match(above,/data-no-localize>\+50</);assert.match(above,/You can still confirm this bid, or return to edit\./);assert.doesNotMatch(above,/<button|disabled|recommended bid|Total value/);
 for(const amount of [450,400])assert.doesNotMatch(N.reviewMarkup({...options(storage),amount}),/Above your recorded maximum by|bid-crosscheck-warning/);
});

test('zero is recorded, missing is optional, invalid stored drafts do not masquerade as zero',()=>{
 const zero=store({2:{ceiling:'0'}});assert.equal(N.readRoundDecision(options(zero)).ceiling,0);assert.match(N.reviewMarkup(options(zero)),/data-no-localize>\+500</);
 const empty=store(),html=N.reviewMarkup(options(empty));assert.match(html,/No maximum recorded this round\./);assert.match(html,/Your notes do not set or limit your bid\./);assert.doesNotMatch(html,/Above your recorded maximum by/);
 const malformed=store({2:{ceiling:'12e'}});assert.equal(N.readRoundDecision(options(malformed)).ceiling,null);assert.doesNotMatch(N.reviewMarkup(options(malformed)),/Above your recorded maximum by/);
 for(const round of [0,4,null,'2'])assert.equal(N.reviewMarkup({...options(empty),round}),'');
});

test('watch reminder is specific to actual bid review and all reminders disappear for pass',()=>{
 const storage=store({2:{ceiling:'450',stance:'watch'}});
 assert.match(N.reviewMarkup(options(storage)),/You recorded a plan to watch this round\./);
 const passing=N.reviewMarkup({...options(storage),pass:true,amount:null});assert.doesNotMatch(passing,/Above your recorded maximum by|You recorded a plan to watch this round\.|bid-crosscheck-warning/);assert.match(passing,/Watch this round/);
 for(const amount of [NaN,Infinity,-1,'500',null])assert.doesNotMatch(N.reviewMarkup({...options(storage),amount}),/Above your recorded maximum by|bid-crosscheck-warning/);
});

test('review includes permitted public counts and safe private facts but strips unknown truth',()=>{
 const storage=store(),hidden={slot:0,label:'SECRET-NAME',known:false,source:'Private note',base:987654,genuine:true,condition:'damaged',catalogId:'secret-id'};
 const privateLot={slot:1,label:'Known camera',known:true,source:'Private note',base:140,genuine:true,condition:'damaged'};
 const html=N.reviewMarkup({...options(storage),round:3,lots:[hidden,privateLot],clues:{genuineCount:3,repairableCount:2,sourceName:"Watchmaker's clearance",sourceHint:'Mechanical objects and genuine damaged pieces are more likely.'}});
 assert.match(html,/Known camera/);assert.match(html,/Private note/);assert.match(html,/data-no-localize>140</);assert.match(html,/Genuine objects/);assert.match(html,/Repairable objects/);assert.match(html,/Source clues describe possibilities, not guaranteed contents\./);
 assert.doesNotMatch(html,/SECRET-NAME|987654|secret-id|damaged<|genuine<|repair.*cost/);
 const r1=N.reviewMarkup({...options(storage),round:1,clues:{genuineCount:3,repairableCount:2}});assert.doesNotMatch(r1,/Genuine objects|Repairable objects/);assert.match(r1,/No object identities confirmed yet\./);
 const r2=N.reviewMarkup({...options(storage),round:2,clues:{genuineCount:0,repairableCount:2}});assert.match(r2,/data-no-localize>0 \/ 6/);assert.doesNotMatch(r2,/Repairable objects/);
 const invalid=N.reviewMarkup({...options(storage),round:3,clues:{genuineCount:7,repairableCount:-1}});assert.doesNotMatch(invalid,/Genuine objects|Repairable objects/);
});

test('all displayed labels and source text are escaped and numeric amounts cannot inject HTML',()=>{
 const html=N.reviewMarkup({...options(store()),lots:[{slot:0,label:'<img src=x onerror=bad()>',known:true,source:'Private note',base:20}],clues:{sourceName:'<svg onload=bad()>',sourceHint:'<script>bad()</script>'}});
 assert.doesNotMatch(html,/<img|<svg|<script/);assert.match(html,/&lt;img/);assert.match(html,/&lt;svg/);assert.match(html,/&lt;script/);
 const amount=N.reviewMarkup({...options(store()),amount:'<img src=x>'});assert.doesNotMatch(amount,/<img|&lt;img/);
});
