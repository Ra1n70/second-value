import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';

const require = createRequire(import.meta.url);
const E = require('../game/engine.cjs');
const R = require('../game/room-engine.cjs');
const B = require('../game/room-bots.cjs');
const seeds = [1, 7, 42, 530, 20261020, 4294967295];
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clone = value => structuredClone(value);
const total = items => items.reduce((sum, item) => sum + item.base, 0);
const item = id => clone(E.ITEMS.find(candidate => candidate.catalogId === id));
const action = (room, actor, type, fields = {}) => R.applyAction(room, actor, {type, turnId: room.turnId, ...fields});
const rare = E.ITEMS.filter(candidate => candidate.rarity === 'rare');

// Captured immediately before v6, from source 1deedea09d932dc15114bfb6b82fa56b7c06bd9d.
// They include full seeded metadata, prices, source, priority and all quote rounds.
const oldGames = {
  1:'2eb9f39d7d7f3c05044546940e47c8475be5feb2b7cdf413d20148a71988df49',
  2:'9a044c6e10e5936874e09feac474e27e52b2f5db9e0a32fd15edaa0fd37931ab',
  3:'ed0790c8cdbd9e0be5c7d5af137248f77e4ff3b264f8ffddbd1e532a7ab178ad',
  4:'19713c277926b088d218ad4903003e048ec5e2fcf77e2297671a3f945812d600',
  5:'b81617eef441955c1164924f6684e4af1fb692fa16ee89bc98bcbbd9fddc4451'
};
const oldContinuation = {
  1:'bd76ab16a2c83ce21f2c92cfde9b27b03cde3b4cc62899231349b774a3d7377d',
  2:'e5f00621b6b09e5c9ed94ccbd63706914e5a2b64e2f7bc9806df1f037d937f28',
  3:'bf19cafdc75160fd0ff9aad6613801c9757dd13cea1fc40b4eaed83c8cb934c4',
  4:'0fda78bbce220b4e502d7a78f53b5ad7c7c0e63a4ce8c4ae8be6cc8adc84e7ec',
  5:'d9b1da56ab75a62653a0ed90bda03e58810eeb1c7ca5199c0a5b7c2caf6d36bc'
};
const oldRooms = {
  1:'be85f46cbf80332003fcd88b6e9bc69580d4585015131be71fb163c3f14bd6f1',
  2:'03cd12b328f863a00994597dd6afb2153453fc737ed4d4407100b35e8a36ff8a',
  3:'87828890e7a0439a738e2e152d20370eb1ea3b559c229b7fba146327db80e71f',
  4:'bf9e21abf46d917dc930651fe96bed0d42454201433a26435fc274b091975faa',
  5:'17efc0562bde5e2014576362994d66fdb3f924307e63aa2a88d569bf69a6b5e8'
};
function roomFor(seed, rulesVersion = 6) {
  const room = R.createRoom({code:'RAREGD', seed, host:{id:'host',name:'Host',role:'appraiser',theme:'harbor'}});
  room.rulesVersion = rulesVersion;
  room.players[0].cash = E.startingCashFor(rulesVersion);
  R.joinRoom(room, {id:'guest',name:'Guest',role:'restorer',theme:'harbor'});
  for (const actor of ['host','guest']) action(room, actor, 'ready', {ready:true});
  action(room, 'host', 'start');
  return room;
}
function settleSession(session) {
  while (session.game.phase !== 'result') {
    if (session.game.phase === 'inspect') E.performSession(session,'open');
    else if (session.game.phase === 'bid') E.performSession(session,'bid',{amount:1000,pass:false});
    else if (session.game.phase === 'round-summary') E.performSession(session,'next');
    else if (session.game.phase === 'dispose') E.performSession(session,'sell',{mode:'ordinary',selection:{}});
    else assert.fail(session.game.phase);
  }
}

test('v6 adds eight fixed identities without changing the catalogs or draw/quote goldens of rules 1–5', () => {
  assert.equal(E.RULES_VERSION, 7);
  assert.equal(E.ITEMS.length, 32);
  assert.equal(rare.length, 8);
  assert.equal(rare.filter(candidate => candidate.genuine && candidate.condition === 'damaged').length, 2);
  assert.equal(rare.filter(candidate => candidate.genuine && candidate.condition === 'intact').length, 4);
  assert.equal(rare.filter(candidate => !candidate.genuine).length, 2);
  assert.equal(new Set(E.ITEMS.map(candidate => candidate.catalogId)).size, 32);
  assert.deepEqual(E.catalogFor('clock', 5), {shape:'clock',label:E.SHAPES.clock,min:60,max:260});
  assert.deepEqual(E.catalogFor('clock', 6), {shape:'clock',label:E.SHAPES.clock,min:55,max:260});
  for (const rulesVersion of [1,2,3,4,5]) {
    assert.equal(E.catalogItems(rulesVersion).length, rulesVersion < 3 ? 18 : 24);
    assert.ok(E.catalogItems(rulesVersion).every(candidate => !candidate.rarity));
    const signature = seeds.map(seed => {
      const game = E.newGame('appraiser',seed,'harbor',{rulesVersion});
      return {seed,items:game.items,priority:game.priority,publicIndex:game.publicIndex,reservePrice:game.reservePrice,sourceId:game.sourceId,
        quotes:[1,2,3].map(round => E.computerBids(game.items,E.rng(seed^0x4F17C2),{round,history:[],publicIndex:game.publicIndex,rulesVersion,reservePrice:game.reservePrice,sourceId:game.sourceId}))};
    });
    assert.equal(hash(signature), oldGames[rulesVersion], `rules ${rulesVersion} seeded truth or quote changed`);
  }
});

test('old replay continuations and multiplayer projections/decisions retain their pre-v6 signatures', () => {
  for (const rulesVersion of [1,2,3,4,5]) {
    const session = E.newSession('appraiser',42,'harbor',{rulesVersion});
    settleSession(session);
    const restored = E.restoreSession(clone(session));
    assert.deepEqual(restored, session);
    E.performSession(restored,'continue');
    assert.equal(hash(restored), oldContinuation[rulesVersion]);
    assert.equal(restored.rulesVersion, rulesVersion);
    assert.ok(restored.game.items.every(candidate => !candidate.rarity));
    assert.equal(hash(seeds.map(seed => {
      const room = roomFor(seed, rulesVersion), view = R.viewFor(room,'host');
      return {view,decision:B.chooseBid({...view,self:{...view.self,botStyle:'steady'}})};
    })), oldRooms[rulesVersion]);
  }
});

test('the shared prior applies source and rarity independently, including known projections without rarity fields', () => {
  const clock = item('midnight-regulator'), ordinary = item('station-clock');
  assert.equal(E.catalogWeight('workshop', clock, 6), 6.4 * .15);
  assert.equal(E.catalogWeight('estate', clock, 6), 1.5 * .15);
  assert.equal(E.catalogWeight('theater', item('gilded-prop-clock'), 6), 4 * .15);
  assert.equal(E.catalogWeight('workshop', ordinary, 6), 6.4);
  assert.equal(E.catalogWeight('workshop', ordinary, 5), 6.4);
  assert.equal(E.catalogWeight('workshop', ordinary, 4), 1);
  const projected = {...clock}; delete projected.rarity; delete projected.story; delete projected.provenance;
  assert.equal(E.catalogWeight('workshop', projected, 6), E.catalogWeight('workshop', clock, 6));
});

test('real seeded crates use lower-weight rare identities without replacement, role changes or guaranteed rare slots', () => {
  let withRare = 0;
  const seen = new Set(), sources = new Set();
  for (let seed = 0; seed < 1800; seed++) {
    const game = E.newGame('appraiser',seed,'harbor',{noBots:true});
    sources.add(game.sourceId);
    assert.equal(new Set(game.items.map(candidate => candidate.catalogId)).size, E.CRATE_SIZE);
    if (game.items.some(candidate => candidate.rarity === 'rare')) withRare++;
    for (const candidate of game.items) if (candidate.rarity === 'rare') seen.add(candidate.catalogId);
    if (seed < 20) {
      const other = E.newGame('restorer',seed,'railway',{noBots:true,startingCash:0,botCash:[0,0,0]});
      assert.deepEqual(other.items, game.items);
      assert.equal(other.reservePrice, game.reservePrice);
    }
  }
  assert.equal(sources.size, 3);
  assert.equal(seen.size, 8);
  assert.ok(withRare / 1800 > .24 && withRare / 1800 < .37, 'lower-weight catalog should yield about one rare-bearing crate in three, not one rare per crate');
});

test('new objects use the unchanged six-role qualifications, fees and capped rewards', () => {
  for (const [id, gain] of [['midnight-regulator',60],['tide-wireless',35]]) {
    const candidate = item(id), plan = E.salePlan('restorer',[candidate],'special',candidate.repair.cost,{repairIds:[candidate.id]});
    assert.equal(plan.recovery-candidate.base, gain);
    assert.ok(gain <= Math.min(60,Math.floor(candidate.base/4)));
    assert.throws(() => E.salePlan('restorer',[candidate],'special',candidate.repair.cost-1,{repairIds:[candidate.id]}), /fees first/);
  }
  for (const [id,gain] of [['blue-line-cup',20],['canceled-voyage-medal',8],['last-service-camera',59],['night-pilot-chart',38]]) {
    const candidate = item(id), plan = E.salePlan('broker',[candidate],'special',25,{abilityIds:[candidate.id]});
    assert.equal(plan.recovery-candidate.base, gain);
    assert.equal(plan.cost, 25);
    assert.ok(gain <= 65);
    assert.throws(() => E.salePlan('broker',[candidate],'special',24,{abilityIds:[candidate.id]}), /fees first/);
  }
  for (const [id,gain] of [['gilded-prop-clock',20],['silver-stage-chart',50]]) {
    const candidate = item(id), plan = E.salePlan('salvager',[candidate],'special',15,{abilityIds:[candidate.id]});
    assert.equal(plan.recovery, 75);
    assert.equal(plan.recovery-candidate.base, gain);
    assert.equal(E.abilityEligibility('restorer',candidate), false);
    assert.equal(E.abilityEligibility('curator',candidate), false);
    assert.equal(E.abilityEligibility('broker',candidate), false);
  }
  for (const [ids,theme,bonus] of [[['midnight-regulator','blue-line-cup'],'railway',97],[['last-service-camera','blue-line-cup'],'railway',107],[['night-pilot-chart','canceled-voyage-medal'],'harbor',80]]) {
    const pair = ids.map(item);
    assert.equal(E.salePlan('collector',pair,'special',0,{theme,pairIds:pair.map(candidate=>candidate.id)}).bonus, bonus);
  }
  const invalid = ['night-pilot-chart','silver-stage-chart'].map(item);
  assert.throws(() => E.salePlan('collector',invalid,'special',100,{theme:'harbor',pairIds:invalid.map(candidate=>candidate.id)}), /valid pair/);
  const exhibit = ['blue-line-cup','last-service-camera','night-pilot-chart'].map(item);
  assert.equal(E.salePlan('curator',exhibit,'special',25,{abilityIds:exhibit.map(candidate=>candidate.id)}).recovery-total(exhibit), 85);
  assert.equal(E.salePlan('appraiser',rare,'special',100).recovery, total(rare), 'rarity never grants a sale multiplier');
});

function decisionFromMoments(view, mean, deviation) {
  const text = `${view.code}:${view.self.id}:${view.auctionNumber}:${view.round}:bid`;
  let seed = 2166136261;
  for (let i=0; i<text.length; i++) seed = Math.imul(seed^text.charCodeAt(i),16777619);
  const random = E.rng(seed>>>0);
  const valueCeiling = Math.floor(mean*.94-deviation*.38), ceiling = Math.min(1000,valueCeiling);
  const quote = Math.max(1,Math.min(ceiling,Math.round(valueCeiling*.97*(.95+random()*.10)/5)*5));
  return {amount:quote,pass:false};
}
test('multiplayer estimates use the same rare prior for unknown and already-confirmed identities', () => {
  const known = item('midnight-regulator');
  const projection = Object.fromEntries(['catalogId','name','base','genuine','condition','category','theme','repair','shape'].map(key => [key,known[key]]));
  const view = {code:'RAREWT',phase:'auction',rulesVersion:6,auctionNumber:1,round:3,reservePrice:0,sourceId:'workshop',
    self:{id:'bot',role:'appraiser',theme:null,cash:1000,botStyle:'steady'}, public:{genuineCount:null,repairableCount:null},history:[],
    lots:[{shape:'clock',known:false},{...projection,known:true},{shape:'radio',known:false}]};
  const catalog = E.catalogItems(6), allWeight = catalog.reduce((sum,candidate)=>sum+E.catalogWeight('workshop',candidate,6),0);
  let mass=0, sum=0, squares=0;
  for (const a of catalog.filter(candidate=>candidate.shape==='clock'&&candidate.catalogId!==known.catalogId)) {
    for (const c of catalog.filter(candidate=>candidate.shape==='radio')) {
      const aw=E.catalogWeight('workshop',a,6), bw=E.catalogWeight('workshop',known,6), cw=E.catalogWeight('workshop',c,6);
      const likelihood=aw/allWeight*bw/(allWeight-aw)*cw/(allWeight-aw-bw), recovery=a.base+known.base+c.base;
      mass+=likelihood;sum+=recovery*likelihood;squares+=recovery*recovery*likelihood;
    }
  }
  const mean=sum/mass,deviation=Math.sqrt(Math.max(0,squares/mass-mean*mean));
  assert.deepEqual(B.chooseBid(view), decisionFromMoments(view,mean,deviation));
  const poisoned=clone(view);
  for (const lot of poisoned.lots.filter(lot=>!lot.known)) Object.assign(lot,{catalogId:'private-truth',rarity:'rare',base:9999999,story:'Hidden story',genuine:false});
  assert.deepEqual(B.chooseBid(poisoned), B.chooseBid(view));
  const original=E.salePlan;let calls=0;
  E.salePlan=(...args)=>{calls++;return original(...args);};
  try {
    const full={...view,round:1,lots:['clock','cup','badge','camera','radio','map'].map(shape=>({shape,known:false,range:E.catalogFor(shape,6)}))};
    B.chooseBid(full);
    assert.ok(calls>0&&calls<=96);
  } finally {E.salePlan=original;}
});

test('single-player source estimates honor the rare prior without identifying unknown objects', () => {
  const source='workshop', pool=E.catalogItems(6).filter(candidate=>candidate.shape==='clock');
  const weighted=pool.map(candidate=>({candidate,weight:E.catalogWeight(source,candidate,6)}));
  const mass=weighted.reduce((sum,row)=>sum+row.weight,0);
  const expected=weighted.reduce((sum,row)=>sum+E.salePlan('broker',[row.candidate],'special',1000).recovery*row.weight,0)/mass;
  const random=E.rng(123);random();random();random();const risk=random();
  const first=item('midnight-regulator'), context={round:1,rulesVersion:6,sourceId:source,botRoles:['broker','restorer','collector']};
  const bots=E.computerBids([first],E.rng(123),context);
  assert.equal(bots[0].bid,Math.min(1000,Math.max(1,Math.round(expected*(.26+risk*.42)/10)*10)));
  const other={...first,catalogId:'unknown-truth',name:'Unknown',base:9999999,genuine:false,story:'Private',repair:null};
  assert.deepEqual(E.computerBids([other],E.rng(123),context),bots);
});

test('unknown v6 room cards do not expose rare identities, art or stories; private inspection stays private', () => {
  let room;
  for (let seed=0; seed<100; seed++) {
    const candidate=roomFor(seed);
    if(candidate.items.some(lot=>lot.rarity==='rare')){room=candidate;break;}
  }
  assert.ok(room);
  const slot=room.items.findIndex(lot=>lot.rarity==='rare');
  for(const viewer of ['host','guest']) {
    const lot=R.viewFor(room,viewer).lots[slot];
    assert.equal(lot.known,false);
    assert.deepEqual(Object.keys(lot).sort(),['slot','shape','range','known','source'].sort());
  }
  action(room,'host','inspect',{slot});
  const privateLot=R.viewFor(room,'host').lots[slot], otherLot=R.viewFor(room,'guest').lots[slot];
  assert.equal(privateLot.catalogId,room.items[slot].catalogId);
  assert.equal(privateLot.source,'Private note');
  assert.equal(otherLot.known,false);
  assert.equal(otherLot.catalogId,undefined);
  assert.equal(privateLot.rarity,undefined,'client resolves known identity metadata from the public catalog');
  assert.equal(privateLot.story,undefined);
});
