import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';

const require=createRequire(import.meta.url),E=require('../game/engine.cjs'),R=require('../game/room-engine.cjs');
const [solo,online,artSource]=await Promise.all(['app.js','online.js','art.js'].map(file=>readFile(new URL('../game/client/'+file,import.meta.url),'utf8')));
const artContext={module:{exports:{}}};runInNewContext(artSource,artContext);const Art=artContext.module.exports;
const plain=value=>JSON.parse(JSON.stringify(value));
function extract(source,name){const fn=source.match(new RegExp('  function '+name+'\\([^\\n]*\\) \\{[\\s\\S]*?\\n  \\}'))?.[0];assert.ok(fn,name);return fn;}
const act=(room,id,type,fields={})=>R.applyAction(room,id,{type,turnId:room.turnId,...fields});
const rareIds=['midnight-regulator','tide-wireless','blue-line-cup','canceled-voyage-medal','gilded-prop-clock','silver-stage-chart'];
function roomFor(seats){
  const room=R.createRoom({code:'BOOKQA',seed:73,host:{id:'host',name:'Host',role:'appraiser'}});
  for(let n=1;n<seats;n++)R.joinRoom(room,{id:'guest'+n,name:'Guest '+n,role:'restorer'});
  for(const player of room.players)act(room,player.id,'ready',{ready:true});act(room,'host','start');
  room.items=rareIds.map((id,index)=>({...E.catalogItems(6).find(item=>item.catalogId===id),id:'rare-'+index}));
  return room;
}
function discovery(kind,data){
  const calls=[],Book={recordSettlement(value){calls.push(plain(value));return value.lots.map(lot=>lot.catalogId);},newDiscoveriesMarkup:ids=>ids.join(',')};
  const context=kind==='solo'?{game:data,session:{seed:73,auctionNumber:1},Book}:{state:{view:data},Book};
  const html=runInNewContext(extract(kind==='solo'?solo:online,'settledDiscoveries')+'\nsettledDiscoveries();',context);
  return {calls,html};
}

test('every new identity has distinct revealed art while unknown art depends only on public outline',()=>{
  const rares=E.catalogItems(6).filter(item=>item.rarity==='rare');assert.equal(rares.length,8);
  const cells=new Set();
  for(const item of rares){
    const known=Art.visualFor(item,true),covered=Art.visualFor({shape:item.shape},false);
    assert.equal(known.sheet,'assets/rare-lots-v1.png');assert.equal(known.columns,4);assert.equal(known.rows,2);
    cells.add(known.column+':'+known.row);
    for(const flag of [false,undefined,null,1,'true'])assert.deepEqual(Art.visualFor(item,flag),covered);
    assert.deepEqual(Art.visualFor({...item,catalogId:'another-hidden-identity'},false),covered);
  }
  assert.equal(cells.size,8);
});

test('solo discovery hook never reads hidden items before a sold result',()=>{
  for(const phase of ['inspect','bid','round-summary','dispose']){
    const game={phase,winner:'you',get items(){assert.fail('hidden items must not be read');}};
    assert.deepEqual(discovery('solo',game),{calls:[],html:''});
  }
  assert.deepEqual(discovery('solo',{phase:'result',winner:null,get items(){assert.fail('unsold crate must not register');}}),{calls:[],html:''});
  const game={phase:'result',rulesVersion:6,winner:'bot-0',items:rareIds.map(id=>E.catalogItems(6).find(item=>item.catalogId===id))};
  const before=JSON.stringify(game),result=discovery('solo',game);
  assert.equal(result.calls.length,1);assert.equal(JSON.stringify(game),before);
  assert.equal(result.calls[0].sold,true);assert.equal(result.calls[0].active,true);
  assert.ok(result.calls[0].lots.every(item=>item.known===true&&item.source==='Crate opened'));
  assert.equal(result.html,rareIds.join(','),'a computer buyer also lets the observing human discover the public crate');
});

test('2-4 player adapters record the same public identities only after actual settlement',()=>{
  for(const seats of [2,3,4]){
    const room=roomFor(seats);act(room,'host','inspect',{slot:0});
    for(const player of room.players){
      const view=R.viewFor(room,player.id);assert.deepEqual(discovery('room',view),{calls:[],html:''});
      for(const lot of view.lots)if(!lot.known)for(const key of ['catalogId','rarity','story','provenance','base'])assert.ok(!Object.hasOwn(lot,key));
    }
    act(room,'host','bid',{amount:room.reservePrice,pass:false});
    for(const player of room.players.slice(1))act(room,player.id,'bid',{amount:null,pass:true});
    assert.equal(room.phase,'dispose');
    for(const player of room.players)assert.deepEqual(discovery('room',R.viewFor(room,player.id)),{calls:[],html:''});
    act(room,'host','sell',{mode:'ordinary',repairSlots:[],pairSlots:[],abilitySlots:[]});
    const before=JSON.stringify(room);
    for(const player of room.players){
      const view=R.viewFor(room,player.id),{calls,html}=discovery('room',view);
      assert.equal(calls.length,1);assert.equal(calls[0].active,true);assert.equal(calls[0].phase,'result');
      assert.equal(calls[0].rulesVersion,6);assert.deepEqual(calls[0].lots.map(item=>item.catalogId),rareIds);
      assert.ok(calls[0].lots.every(item=>item.known===true&&item.source==='Crate opened'));
      assert.equal(html,rareIds.join(','));
    }
    assert.equal(JSON.stringify(room),before,'discovering never changes money, roles or authoritative room state');
    act(room,'host','finish');assert.equal(discovery('room',R.viewFor(room,'host')).calls[0].phase,'ended');
  }
});

test('rare stories are gated by confirmed identity and canonical rules catalog',()=>{
  const item=E.catalogItems(6).find(candidate=>candidate.catalogId==='midnight-regulator');
  for(const kind of ['solo','room']){
    const calls=[],Book={storyMarkup(value,known){calls.push({value,known});return value?.story||'';}};
    const context={E,Book,...(kind==='solo'?{game:{rulesVersion:6}}:{state:{view:{rulesVersion:6}}})};
    const invoke=(value,known)=>runInNewContext(extract(kind==='solo'?solo:online,'rareStory')+`\nrareStory(input${kind==='solo'?', confirmed':''});`,{...context,input:value,confirmed:known});
    assert.equal(invoke({...item,known:false},false),'');assert.equal(calls.length,0);
    assert.equal(invoke({...item,known:true},true),item.story);assert.equal(calls[0].known,true);
    assert.equal(invoke({...item,catalogId:'not-in-catalog',known:true},true),'');
    if(kind==='solo')context.game.rulesVersion=5;else context.state.view.rulesVersion=5;
    assert.equal(invoke({...item,known:true},true),'','old rules cannot load a new rare identity');
  }
});
