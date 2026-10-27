import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const E = require('../game/engine.cjs');
const R = require('../game/room-engine.cjs');

// Tables created under the current rules start with this much cash.
const OPENING = E.startingCashFor(E.RULES_VERSION);
const baseValue = items => items.reduce((sum, item) => sum + item.base, 0);
const clone = value => structuredClone(value);
const command = (room, actor, type, fields = {}) => R.applyAction(room, actor, {type, turnId: room.turnId, ...fields});
function roomWithTwo(rulesVersion = E.RULES_VERSION) {
  const room = R.createRoom({code: 'RESERVE', seed: 42, host: {id: 'host', name: 'Host', role: 'appraiser'}});
  room.rulesVersion = rulesVersion;
  R.joinRoom(room, {id: 'guest', name: 'Guest', role: 'restorer'});
  for (const actor of ['host', 'guest']) command(room, actor, 'ready', {ready: true});
  command(room, 'host', 'start');
  return room;
}

test('a crate reserve is bounded, deterministic and independent of roles, wealth and bot work', () => {
  const observedRates = new Set();
  for (let seed = 0; seed < 80; seed++) {
    const original = E.newGame('appraiser', seed, 'harbor', {noBots: true});
    const total = baseValue(original.items);
    assert.ok(Number.isSafeInteger(original.reservePrice));
    assert.ok(original.reservePrice >= Math.round(total * .08));
    assert.ok(original.reservePrice <= Math.round(total * .12));
    for (const rate of [8, 9, 10, 11, 12]) if (Math.round(total * rate / 100) === original.reservePrice) observedRates.add(rate);
    for (const role of Object.keys(E.ROLES)) {
      const game = E.newGame(role, seed, 'harbor', {startingCash: seed, botCash: [0, 10, 20]});
      assert.equal(game.reservePrice, original.reservePrice);
      assert.deepEqual(game.items, original.items);
      assert.deepEqual(game.priority, original.priority);
      assert.equal(game.publicIndex, original.publicIndex);
      assert.ok(game.bots.every(bot => bot.bid === 0 || bot.bid >= game.reservePrice));
    }
  }
  assert.deepEqual([...observedRates].sort((a, b) => a - b), [8, 9, 10, 11, 12]);
});

test('reserve applies to sole bidders and final-round ties without changing early-sale thresholds', () => {
  const bids = amount => [{id: 'a', bid: amount}, {id: 'b', bid: 0}];
  for (const round of [1, 2, 3]) {
    const low = E.resolveRound(bids(99), ['a', 'b'], round, 100);
    assert.equal(low.hammered, false);
    assert.equal(low.winner, null);
    assert.equal(E.resolveRound(bids(100), ['a', 'b'], round, 100).winner, 'a');
    assert.equal(E.resolveRound(bids(0), ['a', 'b'], round, 100).winner, null);
  }
  const tied = [{id: 'a', bid: 100}, {id: 'b', bid: 100}];
  assert.equal(E.resolveRound(tied, ['b', 'a'], 1, 100).hammered, false);
  assert.equal(E.resolveRound(tied, ['b', 'a'], 2, 100).hammered, false);
  assert.equal(E.resolveRound(tied, ['b', 'a'], 3, 100).winner, 'b');
  assert.equal(E.resolveRound(tied, ['b', 'a'], 3, 101).winner, null);
  assert.equal(E.resolveRound([{id: 'a', bid: 600}, {id: 'b', bid: 400}], ['a', 'b'], 1, 100).hammered, false);
  assert.equal(E.resolveRound([{id: 'a', bid: 600}, {id: 'b', bid: 400}], ['a', 'b'], 2, 100).hammered, true);
});

test('solo rejects an under-reserve bid atomically and recomputes the same reserve on restore', () => {
  const session = E.newSession('appraiser', 42);
  E.performSession(session, 'open');
  const before = clone(session);
  assert.throws(() => E.performSession(session, 'bid', {amount: session.game.reservePrice - 1, pass: false}));
  assert.deepEqual(session, before);
  const tampered = clone(session);
  tampered.game.reservePrice = 1;
  assert.deepEqual(E.restoreSession(tampered), session);
  for (let round = 1; round <= 3; round++) {
    const game = E.newGame('appraiser', 42, 'harbor', {startingCash: 1, botCash: [0, 0, 0]});
    while (game.round < round) { E.openBidding(game); E.placeBid(game, null, true); E.nextRound(game); }
    assert.ok(game.bots.every(bot => bot.bid === 0));
    E.openBidding(game);
    const snapshot = clone(game);
    assert.throws(() => E.placeBid(game, 1, false), /Pass this round/);
    assert.deepEqual(game, snapshot);
    E.placeBid(game, null, true);
    assert.equal(game.winner, null);
  }
});

test('multiplayer exposes only its public reserve, rejects low bids and supports withdrawal at the reserve', () => {
  const room = roomWithTwo();
  const view = R.viewFor(room, 'host');
  assert.ok(view.reservePrice > 1);
  assert.equal(view.reservePrice, R.viewFor(room, 'guest').reservePrice);
  for (const key of ['reserveRate', 'totalValue', 'baseValue', 'seed']) assert.equal(key in view, false);
  assert.ok(view.lots.every(lot => !lot.known && !('base' in lot)));
  const before = clone(room);
  assert.throws(() => command(room, 'host', 'bid', {amount: room.reservePrice - 1, pass: false}));
  assert.deepEqual(room, before);
  command(room, 'host', 'bid', {amount: room.reservePrice, pass: false});
  assert.equal(R.viewFor(room, 'guest').players[0].submitted, true);
  assert.equal(room.players[0].cash, OPENING);
  command(room, 'host', 'withdraw');
  assert.equal(room.players[0].bid, null);
  command(room, 'host', 'bid', {amount: room.reservePrice, pass: false});
  command(room, 'guest', 'bid', {amount: null, pass: true});
  assert.equal(room.winningBid, room.reservePrice);
  assert.equal(room.players[0].cash, OPENING - room.reservePrice);
});

test('all-pass keeps the reserve through three rounds, charges nobody and generates a fresh bounded crate', () => {
  const room = roomWithTwo();
  const reserve = room.reservePrice;
  const firstItems = clone(room.items);
  for (let round = 1; round <= 3; round++) {
    assert.equal(room.reservePrice, reserve);
    for (const actor of ['host', 'guest']) command(room, actor, 'bid', {amount: null, pass: true});
    assert.equal(room.winnerId, null);
    assert.ok(room.players.every(player => player.cash === OPENING));
    if (round < 3) command(room, 'host', 'next');
  }
  assert.equal(room.phase, 'result');
  assert.equal(room.ledger.length, 1);
  for (const actor of ['host', 'guest']) command(room, actor, 'ready', {ready: true});
  command(room, 'host', 'continue');
  assert.equal(room.auctionNumber, 2);
  assert.notDeepEqual(room.items, firstItems);
  assert.ok(room.reservePrice >= Math.round(baseValue(room.items) * .08));
  assert.ok(room.reservePrice <= Math.round(baseValue(room.items) * .12));
});

test('rules 1-3 retain one-unit sales and replays; old rule-3 rooms stay on their economics', () => {
  for (const rulesVersion of [1, 2, 3]) {
    const game = E.newGame('appraiser', 42, 'harbor', {rulesVersion});
    assert.equal(game.reservePrice || 0, 0);
    E.openBidding(game);
    E.placeBid(game, 1, false);
    assert.equal(E.resolveRound([{id: 'you', bid: 1}, {id: 'other', bid: 0}], ['you', 'other'], 1).winner, 'you');
    assert.deepEqual(E.restore(clone(game)), game);
  }
  const room = roomWithTwo(3);
  assert.equal(R.viewFor(room, 'host').reservePrice || 0, 0);
  command(room, 'host', 'bid', {amount: 1, pass: false});
  command(room, 'guest', 'bid', {amount: null, pass: true});
  assert.equal(room.winningBid, 1);
  command(room, 'host', 'sell', {mode: 'ordinary', repairSlots: [], pairSlots: []});
  for (const actor of ['host', 'guest']) command(room, actor, 'ready', {ready: true});
  command(room, 'host', 'continue');
  assert.equal(room.rulesVersion, 3);
  assert.equal(room.reservePrice || 0, 0);
});
