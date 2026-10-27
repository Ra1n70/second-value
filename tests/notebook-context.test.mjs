import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),E=require('../game/engine.cjs');
const app=await readFile(new URL('../game/client/app.js',import.meta.url),'utf8');
const online=(await readFile(new URL('../game/client/online.js',import.meta.url),'utf8')).replace(/\r\n?/g,'\n');
const plain=value=>JSON.parse(JSON.stringify(value));
const appBind=app.match(/  function bindNotebook\(\) \{[\s\S]*?\n  \}/)?.[0];
const roomBind=online.match(/    let settlement=null;\n    if\(view&&\['result','ended'\][\s\S]*?    Notes\.bind\(main,[^\n]+\);/)?.[0];
assert.ok(appBind&&roomBind,'Exercise the actual caller adapters, not a duplicated implementation.');
function soloDecision(game){
 let context;const original=JSON.stringify(game);
 runInNewContext(appBind+'\nbindNotebook();',{game,session:{seed:1,auctionNumber:1},main:{},E,window:{localStorage:{}},informationFor:()=>({known:false,source:'Unconfirmed'}),Notes:{bind(_container,options){context=options;}}});
 assert.equal(JSON.stringify(game),original,'Building a journal context cannot change game truth or funds.');
 return plain(context.decision);
}
function roomDecision(view,{reconnecting=false,busy=false}={}){
 let context;
 runInNewContext(roomBind,{view,reconnecting,state:{busy},main:{},E,noteStorage:{},Notes:{bind(_container,options){context=options;}}});
 return plain(context.decision);
}
const studio={id:'studio',shape:'camera',catalogId:'studio-camera',base:330,genuine:true,condition:'intact'};
const game=()=>({rulesVersion:5,phase:'result',round:1,winner:'bot-0',items:[studio],bots:[{id:'bot-0',role:'broker',theme:null}],botStartingCash:[1000],history:[{highest:100}],receipt:{recovery:0}});
test('solo computer buyer comparison uses funded buyer recovery rather than zero human receipt',()=>{
 assert.deepEqual(soloDecision(game()).settlement,{sold:true,winningBid:100,recovery:395,youWon:false});
 const noFeeCash=game();noFeeCash.botStartingCash=[100];assert.equal(soloDecision(noFeeCash).settlement.recovery,330,'selected object cannot pay its own upfront fee');
});
test('solo actual human sale is retained, disposal is hidden, and unsold has no recovery numbers',()=>{
 const human=game();human.winner='you';human.receipt={recovery:330};assert.equal(soloDecision(human).settlement.recovery,330);
 human.phase='dispose';assert.equal(soloDecision(human).settlement,null);assert.equal(soloDecision(human).editable,false);
 human.phase='inspect';assert.equal(soloDecision(human).editable,true);human.phase='bid';assert.equal(soloDecision(human).editable,true);
 human.phase='result';human.winner=null;assert.deepEqual(soloDecision(human).settlement,{sold:false});
});
test('room comparison only receives actual settled receipt, including finished sessions',()=>{
 const view={code:'TEST',selfId:'me',auctionNumber:1,round:2,phase:'dispose',winnerId:'other',winningBid:100,receipt:{recovery:330},lots:[]};
 assert.equal(roomDecision(view).settlement,null);
 for(const phase of ['result','ended'])assert.deepEqual(roomDecision({...view,phase}).settlement,{sold:true,winningBid:100,recovery:330,youWon:false});
 assert.deepEqual(roomDecision({...view,phase:'result',winnerId:null,receipt:null}).settlement,{sold:false});
});
test('room records freeze while reconnecting or sending a command and reopen on fresh auction view',()=>{
 const view={code:'TEST',selfId:'me',auctionNumber:1,round:2,phase:'auction',lots:[]};
 assert.equal(roomDecision(view).editable,true);assert.equal(roomDecision(view,{reconnecting:true}).editable,false);assert.equal(roomDecision(view,{busy:true}).editable,false);
 assert.equal(roomDecision(view).editable,true);assert.equal(roomDecision({...view,phase:'round-summary'}).editable,false);
});
