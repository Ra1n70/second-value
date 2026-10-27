import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url), R = require('../game/room-engine.cjs');
const command = (room, actor, type, fields = {}, trusted = false) => R.applyAction(room, actor, {type, turnId:room.turnId, ...fields}, trusted);
function begin() {
  const room = R.createRoom({code:'STALL1', seed:73, host:{id:'host', name:'Host', role:'appraiser'}});
  R.joinRoom(room, {id:'guest', name:'Guest', role:'restorer'});
  for (const id of ['host', 'guest']) command(room, id, 'ready', {ready:true});
  command(room, 'host', 'start');
  return room;
}
function buy(room) {
  command(room, 'host', 'bid', {amount:room.reservePrice, pass:false});
  command(room, 'guest', 'bid', {amount:null, pass:true});
  assert.equal(room.phase, 'dispose');
}
function settle(room) {
  buy(room);
  command(room, 'host', 'sell', {mode:'ordinary', repairSlots:[], pairSlots:[]});
  assert.equal(room.phase, 'result');
}
function rejected(room, actor, fields, trusted) {
  const before = structuredClone(room);
  assert.throws(() => R.applyAction(room, actor, fields, trusted));
  assert.deepEqual(room, before, 'rejections must not change money or state');
}

test('required blockers depend on the phase, required human decisions and active membership', () => {
  const room = begin();
  room.players.push({...structuredClone(room.players[1]), id:'bot', isBot:true, ready:true});
  assert.deepEqual(R.blockingPlayerIds(room), ['host', 'guest']);
  room.players[1].bid = {amount:null, pass:true};
  assert.deepEqual(R.blockingPlayerIds(room), ['host']);
  room.phase = 'round-summary';
  assert.deepEqual(R.blockingPlayerIds(room), ['host']);
  room.phase = 'dispose'; room.winnerId = 'guest';
  assert.deepEqual(R.blockingPlayerIds(room), ['guest']);
  room.winnerId = 'bot';
  assert.deepEqual(R.blockingPlayerIds(room), []);
  room.phase = 'result';
  assert.deepEqual(R.blockingPlayerIds(room), ['host', 'guest']);
  for (const player of room.players) player.ready = true;
  assert.deepEqual(R.blockingPlayerIds(room), ['host']);
  room.players[1].ready = false;
  assert.deepEqual(R.blockingPlayerIds(room), ['guest']);
  room.players[1].active = false;
  assert.deepEqual(R.blockingPlayerIds(room), ['host']);
  for (const phase of ['lobby', 'ended']) { room.phase = phase; assert.deepEqual(R.blockingPlayerIds(room), []); }
});

test('end-stalled requires trusted exact eligibility, a current turn and an active human actor', () => {
  const room = begin(), action = {type:'end-stalled', turnId:room.turnId};
  for (const trusted of [undefined, false, 1, 'true', {}]) rejected(room, 'host', action, trusted);
  rejected(room, 'guest', {...action, eligible:true}, true);
  rejected(room, 'guest', {...action, turnId:'old-turn'}, true);
  room.players.push({...structuredClone(room.players[1]), id:'bot', isBot:true});
  rejected(room, 'bot', action, true);
  room.players[1].active = false;
  rejected(room, 'guest', action, true);
  room.phase = 'lobby';
  rejected(room, 'host', action, true);
});

test('cancelling an unopened auction or round summary exposes no hidden identities or discovery candidates', () => {
  for (const summary of [false, true]) {
    const room = begin(), identities = room.items.map(item => item.catalogId), cash = room.players.map(player => player.cash);
    if (summary) {
      command(room, 'host', 'bid', {amount:null, pass:true});
      command(room, 'guest', 'bid', {amount:null, pass:true});
      assert.equal(room.phase, 'round-summary');
    }
    command(room, 'guest', 'end-stalled', {}, true);
    assert.equal(room.phase, 'ended');
    assert.deepEqual(room.players.map(player => player.cash), cash);
    assert.equal(room.cancelledRefund, 0);
    assert.deepEqual(room.ledger, []);
    for (const id of ['host', 'guest']) {
      const view = R.viewFor(room, id), serialized = JSON.stringify(view);
      assert.equal(view.cancelledCrate, true);
      assert.deepEqual(view.lots, []);
      assert.deepEqual(view.history, []);
      assert.deepEqual(view.priority, []);
      assert.equal(view.winnerId, null);
      assert.equal(view.winningBid, null);
      assert.equal(view.receipt, null);
      assert.equal(view.valuation, null);
      assert.equal(view.public.publicIndex, null);
      for (const identity of identities) assert.ok(!serialized.includes(identity));
    }
  }
});

test('disposal cancellation refunds exactly the current bid once while preserving previous settled profit and ledger', () => {
  const room = begin();
  settle(room);
  const ledger = structuredClone(room.ledger), previous = room.players.map(player => ({cash:player.cash, profit:player.profit}));
  for (const id of ['host', 'guest']) command(room, id, 'ready', {ready:true});
  command(room, 'host', 'continue');
  const paid = room.reservePrice;
  buy(room);
  assert.equal(room.players[0].cash, previous[0].cash - paid);
  const oldTurn = room.turnId;
  command(room, 'guest', 'end-stalled', {}, true);
  assert.equal(room.cancelledRefund, paid);
  assert.deepEqual(room.players.map(player => ({cash:player.cash, profit:player.profit})), previous);
  assert.deepEqual(room.ledger, ledger);
  assert.deepEqual(room.items, []);
  assert.deepEqual(room.cratePlayers, []);
  assert.equal(Object.hasOwn(room, 'valuation'), false);
  rejected(room, 'guest', {type:'end-stalled', turnId:oldTurn}, true);
  rejected(room, 'guest', {type:'end-stalled', turnId:room.turnId}, true);
});

test('ending an already settled result preserves its receipt, truth, valuation, cash and ledger without a refund marker', () => {
  const room = begin();
  settle(room);
  const before = structuredClone(room);
  command(room, 'guest', 'end-stalled', {}, true);
  assert.equal(room.phase, 'ended');
  for (const key of ['items', 'history', 'priority', 'winnerId', 'winningBid', 'receipt', 'ledger', 'valuation', 'players']) assert.deepEqual(room[key], before[key]);
  const view = R.viewFor(room, 'guest');
  assert.equal(Object.hasOwn(view, 'cancelledCrate'), false);
  assert.equal(Object.hasOwn(view, 'cancelledRefund'), false);
  assert.equal(view.lots.length, 6);
  assert.ok(view.lots.every(item => item.known));
});
