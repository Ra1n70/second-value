import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),E=require('../game/engine.cjs'),R=require('../game/room-engine.cjs');
const app=await readFile(new URL('../game/client/app.js',import.meta.url),'utf8'),online=await readFile(new URL('../game/client/online.js',import.meta.url),'utf8');
const extract=(source,name)=>source.match(new RegExp('  function '+name+'\\([^\\n]*\\) \\{[\\s\\S]*?\\n  \\}'))?.[0];
const soloAdapter=extract(app,'reviewCrosscheck'),info=extract(app,'informationFor'),roomAdapter=extract(online,'reviewCrosscheck'),accept=extract(online,'acceptView');
assert.ok(soloAdapter&&info&&roomAdapter&&accept);
const plain=value=>JSON.parse(JSON.stringify(value));
function captureSolo(game,{blocked=false}={}){
 let input;const storage={},window={};Object.defineProperty(window,'localStorage',{get(){if(blocked)throw new Error('blocked');return storage;}});
 const ctx={game,session:{seed:99,auctionNumber:2},E,window,Notes:{reviewMarkup(options){input=options;return '<crosscheck>';}}},before=JSON.stringify(game);
 runInNewContext(info+'\n'+soloAdapter+'\nreviewCrosscheck({amount:400,pass:false});',ctx);assert.equal(JSON.stringify(game),before);return {input:plain(input),storage:input.storage};
}
function captureRoom(view){let input;const before=JSON.stringify(view);runInNewContext(roomAdapter+'\nreviewCrosscheck({amount:400,pass:false});',{state:{view},E,window:{sessionStorage:{}},Notes:{reviewMarkup(options){input=options;return '<crosscheck>';}}});assert.equal(JSON.stringify(view),before);return plain(input);}
const act=(room,id,type,fields={})=>R.applyAction(room,id,{type,turnId:room.turnId,...fields});
function room(n){const r=R.createRoom({code:'CROSSCHECK',seed:73,host:{id:'p0',name:'Host',role:'appraiser'}});for(let i=1;i<n;i++)R.joinRoom(r,{id:'p'+i,name:'Guest'+i,role:'restorer'});for(const p of r.players)act(r,p.id,'ready',{ready:true});act(r,'p0','start');return r;}
test('actual solo adapter projects only known facts and stage-appropriate public counts',()=>{
 const g=E.newGame('appraiser',73,'harbor',{noBots:true}),early=captureSolo(g).input;
 assert.equal(early.clues.genuineCount,null);assert.equal(early.clues.repairableCount,null);assert.equal(early.key,'solo:99:2');assert.ok(early.lots.every(l=>!l.known&&!Object.hasOwn(l,'base')));
 E.useSkill(g,0);const own=captureSolo(g).input;assert.equal(own.lots[0].base,g.items[0].base);assert.equal(own.lots[0].source,'Private note');
 g.round=2;assert.equal(captureSolo(g).input.clues.genuineCount,g.items.filter(i=>i.genuine).length);assert.equal(captureSolo(g).input.clues.repairableCount,null);
 g.round=3;assert.equal(captureSolo(g).input.clues.repairableCount,g.items.filter(i=>i.genuine&&i.condition==='damaged'&&i.repair).length);assert.equal(captureSolo(g).input.lots[g.publicIndex].source,'Public reveal');
 assert.equal(captureSolo(g,{blocked:true}).storage,undefined);
});
test('actual 2/3/4-seat adapters cannot copy another seat private identities or note key',()=>{
 for(const n of [2,3,4]){const r=room(n);act(r,'p0','inspect',{slot:0});const host=captureRoom(R.viewFor(r,'p0')),guest=captureRoom(R.viewFor(r,'p1'));
  assert.equal(host.key,'room:CROSSCHECK:p0:1');assert.equal(guest.key,'room:CROSSCHECK:p1:1');assert.equal(host.lots[0].source,'Private note');assert.equal(guest.lots[0].known,false);assert.equal(Object.hasOwn(guest.lots[0],'base'),false);assert.equal(guest.clues.genuineCount,null);
 }
});
function acceptContext(view,turnId){
 const ctx={state:{credentials:{code:view.code},view,draftTurn:view.turnId,saleTurn:null,selected:0,bidOpen:false},pendingReview:{type:'bid',turnId,amount:400,pass:false},presenceAnchor:null,lastRoomUpdate:0,performance:{now:()=>0},minimumBid:v=>Math.max(1,v.reservePrice),persist(){},render(){},updateRecoveryClocks(){},Recovery:{stableSignature:v=>JSON.stringify(v)}};
 ctx.review={open:true,close(){this.open=false;ctx.pendingReview=null;}};return ctx;
}
test('skipped intermediate view cannot leave a stale confirmation open in a later auction turn',()=>{
 const v=R.viewFor(room(2),'p0'),ctx=acceptContext(v,v.turnId);runInNewContext(accept+'\nacceptView(next);',{...ctx,next:{...v,revision:v.revision+2,turnId:v.turnId+':new',round:2}});
 assert.equal(ctx.review.open,false);
});
test('same-turn heartbeat and peer submission leave pending confirmation untouched',()=>{
 const v=R.viewFor(room(2),'p0'),ctx=acceptContext(v,v.turnId),pending=ctx.pendingReview;
 runInNewContext(accept+'\nacceptView(next);',{...ctx,next:{...v,revision:v.revision+1,serverNow:123,players:v.players.map((p,i)=>i===1?{...p,submitted:true}:p)}});
 assert.equal(ctx.review.open,true);assert.equal(ctx.pendingReview,pending);assert.equal(ctx.pendingReview.amount,400);
});
