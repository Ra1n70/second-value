import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const require = createRequire(import.meta.url);
const E = require('../game/engine.cjs');
const R = require('../game/room-engine.cjs');

// Tables created under the current rules start with this much cash.
const OPENING = E.startingCashFor(E.RULES_VERSION);
const clone = value => structuredClone(value);
const total = items => items.reduce((sum, item) => sum + item.base, 0);
const item = id => clone(E.ITEMS.find(candidate => candidate.catalogId === id));
const act = (room, actor, type, fields = {}) => R.applyAction(room, actor, {type, turnId: room.turnId, ...fields});
function readyRoom({rulesVersion = E.RULES_VERSION, hostRole = 'broker', guestRole = 'appraiser'} = {}) {
  const room = R.createRoom({code: 'SOURCE', seed: 42, host: {id: 'host', name: 'Host', role: hostRole, theme: 'harbor'}});
  room.rulesVersion = rulesVersion;
  room.players[0].cash = E.startingCashFor(rulesVersion);
  R.joinRoom(room, {id: 'guest', name: 'Guest', role: guestRole, theme: 'railway'});
  for (const actor of ['host', 'guest']) act(room, actor, 'ready', {ready: true});
  act(room, 'host', 'start');
  return room;
}
function ordinaryReceipt(items, paid) {
  return {...E.salePlan('appraiser', items, 'ordinary', 0), paid, profit: total(items) - paid};
}

test('source draws are deterministic, distinct, and independent of roles, wealth and computer work', async () => {
  assert.equal(E.RULES_VERSION, 7);
  assert.deepEqual(Object.keys(E.SOURCES), ['workshop', 'estate', 'theater']);
  for (const record of Object.values(E.SOURCES)) assert.deepEqual(Object.keys(record), ['name', 'evidence', 'hint', 'story']);
  for (let seed = 0; seed < 48; seed++) {
    const original = E.newGame('appraiser', seed, 'harbor', {noBots: true});
    assert.equal(new Set(original.items.map(candidate => candidate.catalogId)).size, E.CRATE_SIZE);
    assert.ok(Object.hasOwn(E.SOURCES, original.sourceId));
    assert.ok(original.reservePrice >= Math.round(total(original.items) * .08));
    assert.ok(original.reservePrice <= Math.round(total(original.items) * .12));
    for (const role of Object.keys(E.ROLES)) {
      const game = E.newGame(role, seed, 'railway', {startingCash: seed, botCash: [0, 1, 2], noBots: true});
      for (const field of ['sourceId', 'items', 'priority', 'publicIndex', 'reservePrice']) assert.deepEqual(game[field], original[field]);
    }
    const withBots = E.newGame('appraiser', seed);
    assert.deepEqual(withBots.items, original.items);
    assert.equal(withBots.sourceId, original.sourceId);
    assert.equal(withBots.reservePrice, original.reservePrice);
  }
  assert.equal(await readFile(new URL('../game/engine.cjs', import.meta.url), 'utf8'), await readFile(new URL('../game/client/engine.js', import.meta.url), 'utf8'));
});

test('all three sources occur at similar rates and bias probabilities rather than guarantee contents', () => {
  const stats = Object.fromEntries(Object.keys(E.SOURCES).map(id => [id, {crates: 0, damaged: 0, mechanical: 0, intact: 0, themed: 0, reproduction: 0, missed: false}]));
  for (let seed = 0; seed < 6000; seed++) {
    const game = E.newGame('appraiser', seed, 'harbor', {noBots: true}), s = stats[game.sourceId];
    s.crates++;
    for (const candidate of game.items) {
      s.damaged += candidate.genuine && candidate.condition === 'damaged' ? 1 : 0;
      s.mechanical += candidate.category === 'mechanical' ? 1 : 0;
      s.intact += candidate.genuine && candidate.condition === 'intact' ? 1 : 0;
      s.themed += candidate.genuine && !!candidate.theme ? 1 : 0;
      s.reproduction += !candidate.genuine ? 1 : 0;
    }
    if (game.sourceId === 'workshop' && !game.items.some(candidate => candidate.genuine && candidate.condition === 'damaged')) s.missed = true;
    if (game.sourceId === 'estate' && game.items.some(candidate => !candidate.genuine)) s.missed = true;
    if (game.sourceId === 'theater' && game.items.some(candidate => candidate.genuine)) s.missed = true;
  }
  const rate = (id, field) => stats[id][field] / (stats[id].crates * E.CRATE_SIZE);
  for (const s of Object.values(stats)) {
    assert.ok(s.crates > 1800 && s.crates < 2200);
    assert.equal(s.missed, true, 'source hints must never become guaranteed contents');
  }
  for (const other of ['estate', 'theater']) {
    assert.ok(rate('workshop', 'damaged') > rate(other, 'damaged') + .2);
    assert.ok(rate('workshop', 'mechanical') > rate(other, 'mechanical') + .1);
  }
  for (const other of ['workshop', 'theater']) {
    assert.ok(rate('estate', 'intact') > rate(other, 'intact') + .3);
    assert.ok(rate('estate', 'themed') > rate(other, 'themed') + .05);
  }
  for (const other of ['workshop', 'estate']) assert.ok(rate('theater', 'reproduction') > rate(other, 'reproduction') + .3);
});

test('rules 4 retain their exact seeded draws, public information, reserves and all three quote rounds', () => {
  // Captured from the pre-source engine at source commit 33a2eb6 and compared in memory.
  const signature = JSON.stringify([1, 7, 42, 530, 20261020, 4294967295].map(seed => {
    const game = E.newGame('appraiser', seed, 'harbor', {rulesVersion: 4});
    assert.equal(game.sourceId, null);
    return {seed, items: game.items, priority: game.priority, publicIndex: game.publicIndex, reservePrice: game.reservePrice,
      quotes: [1, 2, 3].map(round => E.computerBids(game.items, E.rng(seed ^ 0x4F17C2), {round, history: [], publicIndex: game.publicIndex, rulesVersion: 4, reservePrice: game.reservePrice}))};
  }));
  assert.equal(createHash('sha256').update(signature).digest('hex'), 'c36d267df448f8ddc104f8fa8f0cb0f99dc8e7d8ba60db5e1162e4d33da8481a');
  for (const rulesVersion of [1, 2, 3, 4, 5]) {
    const session = E.newSession('appraiser', 42, 'harbor', {rulesVersion});
    E.performSession(session, 'open');
    E.performSession(session, 'bid', {amount: 1000, pass: false});
    if (session.game.phase === 'dispose') E.performSession(session, 'sell', {mode: 'ordinary', selection: {}});
    assert.deepEqual(E.restoreSession(clone(session)), session);
  }
});

test('new computer estimates use the public source without reading unknown identities', () => {
  const game = E.newGame('appraiser', 42, 'harbor', {noBots: true});
  const alternative = game.items.map((candidate, index) => ({...E.ITEMS.find(other => other.shape === candidate.shape && other.catalogId !== candidate.catalogId), id: 'other-' + index}));
  const context = {round: 1, rulesVersion: 5, sourceId: game.sourceId, reservePrice: game.reservePrice, botRoles: ['restorer', 'collector', 'broker']};
  assert.deepEqual(E.computerBids(game.items, E.rng(52), context), E.computerBids(alternative, E.rng(52), context));
  const workshop = E.computerBids(game.items, E.rng(52), {...context, sourceId: 'workshop'});
  const theater = E.computerBids(game.items, E.rng(52), {...context, sourceId: 'theater'});
  assert.notDeepEqual(workshop.map(bot => bot.bid), theater.map(bot => bot.bid));
});

test('valuation rows use the actual ordinary or loss-making choice while opponents get funded best plans', () => {
  const items = ['studio-camera', 'navy-badge', 'star-chart', 'prop-radio', 'harbor-clock', 'replica-cup'].map(item);
  const paid = 800, receipt = ordinaryReceipt(items, paid);
  const players = [{id: 'winner', name: 'Winner', role: 'broker', cashBefore: 1000}, {id: 'other', name: 'Other', role: 'broker', cashBefore: 1000}, {id: 'poor', name: 'Poor', role: 'broker', cashBefore: 799}];
  const before = clone({items, players, receipt});
  const board = E.valuationBoard(items, players, {winnerId: 'winner', winningBid: paid, receipt});
  assert.equal(board.ordinary, total(items));
  assert.equal(board.winningBid, paid);
  assert.equal(board.rows[0].actual, true);
  assert.equal(board.rows[0].abilityGain, 0);
  assert.equal(board.rows[0].profit, receipt.profit);
  assert.equal(board.rows[1].actual, false);
  assert.equal(board.rows[1].abilityGain, 65);
  assert.equal(board.rows[2].affordable, false);
  for (const field of ['sale', 'cost', 'bonus', 'recovery', 'abilityGain', 'profit']) assert.equal(board.rows[2][field], null);
  assert.deepEqual({items, players, receipt}, before, 'valuation must never pay or modify anyone');
  const badPlan = E.salePlan('broker', items, 'special', 200, {abilityIds: [items[1].id]});
  const badReceipt = {...badPlan, paid, profit: badPlan.recovery - paid};
  const bad = E.valuationBoard(items, players, {winnerId: 'winner', winningBid: paid, receipt: badReceipt});
  assert.equal(bad.rows[0].abilityGain, -4);
  assert.equal(bad.rows[0].cost, 25);
  assert.equal(bad.rows[0].bonus, 21);
  assert.equal(bad.rows[0].recovery, badReceipt.recovery);
  assert.equal(bad.rows[0].profit, badReceipt.profit);
});

test('valuation respects up-front processing funds and locked themes, and unsold crates have no board', () => {
  const items = [item('studio-camera')], paid = 100, receipt = ordinaryReceipt(items, paid);
  const players = [{id: 'winner', name: 'Winner', role: 'broker', cashBefore: 100}, {id: 'funded', name: 'Funded', role: 'broker', cashBefore: 125}, {id: 'no-fee', name: 'No fee', role: 'broker', cashBefore: 100}];
  const board = E.valuationBoard(items, players, {winnerId: 'winner', winningBid: paid, receipt});
  assert.equal(board.rows[1].abilityGain, 65);
  assert.equal(board.rows[2].affordable, true);
  assert.equal(board.rows[2].abilityGain, 0, 'selected object cannot fund its own packing fee');
  const themed = [item('harbor-map'), item('crew-badge')];
  const themePlayers = [{id: 'winner', name: 'Winner', role: 'collector', theme: 'railway', cashBefore: 1000}, {id: 'harbor', name: 'Harbor', role: 'collector', theme: 'harbor', cashBefore: 1000}];
  const themedBoard = E.valuationBoard(themed, themePlayers, {winnerId: 'winner', winningBid: paid, receipt: ordinaryReceipt(themed, paid)});
  assert.equal(themedBoard.rows[0].abilityGain, 0);
  assert.equal(themedBoard.rows[1].abilityGain, Math.floor(total(themed) / 4));
  assert.equal(E.valuationBoard(items, players, {winnerId: null, winningBid: 0, receipt}), null);
  assert.equal(E.valuationBoard(items, players, {winnerId: 'winner', winningBid: paid, receipt: null}), null);
});

test('rooms expose the source immediately but keep valuation and hidden truth private until settlement', () => {
  const room = readyRoom();
  const source = room.sourceId, original = clone(room.items), funds = room.players.map(player => player.cash);
  for (const actor of ['host', 'guest']) {
    const view = R.viewFor(room, actor);
    assert.equal(view.sourceId, source);
    assert.equal(Object.hasOwn(view, 'valuation'), false);
    for (const field of ['cratePlayers', 'sourceWeight', 'items', 'seed']) assert.equal(Object.hasOwn(view, field), false);
    assert.ok(view.lots.every(lot => !lot.known && !Object.hasOwn(lot, 'base') && !Object.hasOwn(lot, 'catalogId')));
  }
  act(room, 'guest', 'inspect', {slot: 0});
  assert.equal(R.viewFor(room, 'host').lots[0].known, false);
  assert.equal(R.viewFor(room, 'guest').lots[0].known, true);
  act(room, 'host', 'bid', {amount: 800, pass: false});
  act(room, 'guest', 'bid', {amount: null, pass: true});
  assert.equal(room.phase, 'dispose');
  assert.equal(Object.hasOwn(room, 'valuation'), false);
  assert.equal(Object.hasOwn(R.viewFor(room, 'host'), 'valuation'), false);
  assert.equal(room.sourceId, source);
  assert.deepEqual(room.items, original);
  act(room, 'host', 'sell', {mode: 'ordinary', repairSlots: [], pairSlots: []});
  assert.equal(room.phase, 'result');
  const host = R.viewFor(room, 'host'), guest = R.viewFor(room, 'guest');
  assert.deepEqual(host.valuation, guest.valuation);
  assert.deepEqual(host.valuation.rows.map(row => row.cashBefore), funds);
  assert.equal(host.valuation.rows[0].actual, true);
  assert.equal(host.valuation.rows[0].abilityGain, 0);
  assert.equal(host.valuation.rows[0].profit, room.receipt.profit);
  assert.deepEqual(room.players.map(player => player.cash), [OPENING + room.receipt.profit, OPENING]);
  const settled = clone(room);
  assert.throws(() => act(room, 'host', 'sell', {mode: 'ordinary', repairSlots: [], pairSlots: []}));
  assert.deepEqual(room, settled);
  act(room, 'host', 'finish');
  assert.deepEqual(R.viewFor(room, 'host').valuation, host.valuation);
});

test('room sources stay locked across rounds, all-pass yields no board, and continuing clears old valuation', () => {
  const room = readyRoom(), source = room.sourceId, original = clone(room.items), reserve = room.reservePrice;
  for (let round = 1; round <= 3; round++) {
    assert.equal(room.sourceId, source);
    assert.deepEqual(room.items, original);
    assert.equal(room.reservePrice, reserve);
    for (const actor of ['host', 'guest']) act(room, actor, 'bid', {amount: null, pass: true});
    if (round < 3) {
      assert.equal(Object.hasOwn(R.viewFor(room, 'host'), 'valuation'), false);
      act(room, 'host', 'next');
    }
  }
  assert.equal(room.phase, 'result');
  assert.equal(R.viewFor(room, 'host').valuation, null);
  assert.ok(room.players.every(player => player.cash === OPENING));
  for (const actor of ['host', 'guest']) act(room, actor, 'ready', {ready: true});
  act(room, 'host', 'continue');
  assert.equal(room.auctionNumber, 2);
  assert.ok(Object.hasOwn(E.SOURCES, room.sourceId));
  assert.equal(Object.hasOwn(room, 'valuation'), false);
  assert.equal(Object.hasOwn(R.viewFor(room, 'guest'), 'valuation'), false);
});

test('legacy settled rooms reconstruct prior funds including a winner who later left', () => {
  const room = readyRoom({rulesVersion: 4});
  assert.equal(room.sourceId, null);
  delete room.cratePlayers;
  act(room, 'host', 'bid', {amount: 800, pass: false});
  act(room, 'guest', 'bid', {amount: null, pass: true});
  act(room, 'host', 'sell', {mode: 'ordinary', repairSlots: [], pairSlots: []});
  assert.deepEqual(room.valuation.rows.map(row => row.cashBefore), [E.startingCashFor(4), E.startingCashFor(4)]);
  delete room.valuation;
  act(room, 'host', 'leave');
  const view = R.viewFor(room, 'guest');
  assert.equal(view.phase, 'ended');
  assert.deepEqual(view.valuation.rows.map(row => row.cashBefore), [E.startingCashFor(4), E.startingCashFor(4)]);
  assert.equal(view.valuation.rows.find(row => row.id === 'host').profit, room.receipt.profit);
});
