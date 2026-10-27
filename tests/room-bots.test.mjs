import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const E = require('../game/engine.cjs');
const R = require('../game/room-engine.cjs');

// Tables created under the current rules start with this much cash.
const OPENING = E.startingCashFor(E.RULES_VERSION);
const B = require('../game/room-bots.cjs');
const command = (room, actor, type, fields = {}) => R.applyAction(room, actor, {type, turnId: room.turnId, ...fields});
const computers = room => room.players.filter(player => player.active && player.isBot);
const humans = room => room.players.filter(player => player.active && !player.isBot);
function lobby(seed = 73) {
  return R.createRoom({code: 'BOTQA1', seed, host: {id: 'host', name: 'Human host', role: 'restorer', theme: 'harbor'}});
}
function add(room, style = 'steady') {
  command(room, room.hostId, 'add-bot', {style});
  return computers(room).at(-1);
}
function begin(count = 1, seed = 73) {
  const room = lobby(seed);
  for (let index = 0; index < count; index++) add(room, ['steady', 'bold', 'patient'][index]);
  command(room, 'host', 'ready', {ready: true});
  command(room, 'host', 'start');
  return room;
}
function rejected(room, actor, type, fields = {}) {
  const before = structuredClone(room);
  assert.throws(() => command(room, actor, type, fields));
  assert.deepEqual(room, before, `${type} rejection must be atomic`);
}
function passToResult(room) {
  let steps = 0;
  while (room.phase !== 'result') {
    assert.ok(++steps <= 6, `computer-only winners must settle without an external sell: ${room.phase}`);
    if (room.phase === 'auction') {
      for (const player of humans(room)) command(room, player.id, 'bid', {amount: null, pass: true});
    } else if (room.phase === 'round-summary') command(room, room.hostId, 'next');
    else assert.fail(`unexpected phase ${room.phase}`);
  }
}

test('host adds and removes ready computers within the four-seat lobby limit; rejected management is atomic', () => {
  const room = lobby();
  R.joinRoom(room, {id: 'guest', name: 'Human guest', role: 'collector', theme: 'railway'});
  assert.equal(R.viewFor(room, 'host').can.addBot, true);
  assert.equal(R.viewFor(room, 'guest').can.addBot, false);
  rejected(room, 'guest', 'add-bot', {style: 'steady'});
  for (const fields of [{}, {style: ''}, {style: 'oracle'}, {style: 1}, {style: ['steady']}, {style: {}}, {style: 'steady', role: 'broker'}, {style: 'steady', id: 'guest'}]) {
    rejected(room, 'host', 'add-bot', fields);
  }
  const first = add(room, 'steady');
  assert.equal(first.ready, true);
  assert.equal(first.cash, OPENING);
  const firstId = first.id;
  const second = add(room, 'bold');
  assert.equal(room.players.length, 4);
  assert.equal(R.viewFor(room, 'host').can.addBot, false);
  rejected(room, 'host', 'add-bot', {style: 'patient'});
  const beforeJoin = structuredClone(room);
  assert.throws(() => R.joinRoom(room, {id: 'overflow', name: 'Extra human', role: 'appraiser'}));
  assert.deepEqual(room, beforeJoin);
  rejected(room, 'guest', 'remove-bot', {playerId: second.id});
  for (const fields of [{}, {playerId: 'guest'}, {playerId: 'host'}, {playerId: 'missing'}, {playerId: second.id, extra: true}]) {
    rejected(room, 'host', 'remove-bot', fields);
  }
  command(room, 'host', 'remove-bot', {playerId: firstId});
  assert.ok(!room.players.some(player => player.id === firstId && player.active));
  const replacement = add(room, 'patient');
  assert.notEqual(replacement.id, firstId, 'removed computer IDs cannot be reused');
  assert.equal(new Set(room.players.map(player => player.id)).size, room.players.length);
  assert.equal(R.viewFor(room, 'host').can.start, false, 'computers do not ready human players');
  command(room, 'host', 'ready', {ready: true});
  command(room, 'guest', 'ready', {ready: true});
  assert.equal(R.viewFor(room, 'host').can.start, true);
  command(room, 'host', 'start');
  rejected(room, 'host', 'add-bot', {style: 'steady'});
  rejected(room, 'host', 'remove-bot', {playerId: replacement.id});
});

test('2–4 seat tables preseal computer decisions while preserving the human confirmation boundary', () => {
  for (const seats of [2, 3, 4]) {
    const room = begin(seats - 1, seats * 1337);
    assert.equal(room.phase, 'auction');
    assert.equal(room.history.length, 0);
    assert.equal(room.players.length, seats);
    assert.ok(computers(room).every(player => player.bid && typeof player.bid.pass === 'boolean'));
    const view = R.viewFor(room, 'host');
    assert.equal(view.self.submitted, false);
    for (const bot of view.players.filter(player => player.isBot)) {
      assert.equal(bot.submitted, true);
      assert.ok(['steady', 'bold', 'patient'].includes(bot.botStyle));
      for (const secret of ['bid', 'inspected', 'token', 'hash', 'targets']) assert.equal(secret in bot, false);
    }
    assert.ok(view.lots.every(lot => !lot.known));
    const balances = room.players.map(player => player.cash);
    assert.deepEqual(balances, new Array(seats).fill(OPENING));
    command(room, 'host', 'bid', {amount: null, pass: true});
    assert.equal(room.history.length, 1, 'the final human confirmation reveals exactly once');
    assert.notEqual(room.phase, 'auction');
    assert.equal(room.history[0].bids.length, seats);
  }
});

test('a submitted human can still withdraw until another human confirms, without changing sealed computer bids', () => {
  const room = lobby(411);
  const bot = add(room, 'bold');
  R.joinRoom(room, {id: 'guest', name: 'Human guest', role: 'appraiser'});
  for (const id of ['host', 'guest']) command(room, id, 'ready', {ready: true});
  command(room, 'host', 'start');
  const computerBid = structuredClone(room.players.find(player => player.id === bot.id).bid);
  const turnId = room.turnId;
  command(room, 'host', 'bid', {amount: room.reservePrice, pass: false});
  assert.equal(room.phase, 'auction');
  assert.equal(room.history.length, 0);
  assert.equal(R.viewFor(room, 'host').can.withdraw, true);
  assert.equal(R.viewFor(room, 'guest').self.bid, null);
  command(room, 'host', 'withdraw');
  assert.equal(room.turnId, turnId);
  assert.equal(R.viewFor(room, 'host').self.bid, null);
  assert.deepEqual(room.players.find(player => player.id === bot.id).bid, computerBid);
  command(room, 'guest', 'bid', {amount: null, pass: true});
  assert.equal(room.phase, 'auction');
  command(room, 'host', 'bid', {amount: null, pass: true});
  assert.equal(room.history.length, 1);
  assert.notEqual(room.turnId, turnId);
  const before = structuredClone(room);
  assert.throws(() => R.applyAction(room, 'host', {type: 'withdraw', turnId}));
  assert.deepEqual(room, before);
});

test('computer Appraiser inspections remain private and obey the two-inspection crate budget', () => {
  const room = lobby(512);
  const bot = add(room, 'steady');
  bot.role = 'appraiser'; bot.theme = null;
  command(room, 'host', 'ready', {ready: true});
  command(room, 'host', 'start');
  const inspected = room.players.find(player => player.id === bot.id).inspected;
  assert.ok(inspected.length >= 1 && inspected.length <= 2);
  assert.equal(new Set(inspected).size, inspected.length);
  assert.ok(inspected.every(slot => Number.isInteger(slot) && slot >= 0 && slot < 6));
  const ownView = R.viewFor(room, bot.id), humanView = R.viewFor(room, 'host');
  assert.equal(ownView.lots.filter(lot => lot.known).length, inspected.length);
  assert.equal(humanView.lots.filter(lot => lot.known).length, 0);
  assert.equal(humanView.public.genuineCount, null);
  for (const lot of humanView.lots) {
    for (const key of ['catalogId', 'base', 'genuine', 'condition', 'theme', 'repair']) assert.equal(key in lot, false);
  }
  rejected(room, bot.id, 'bid', {amount: null, pass: true});
  rejected(room, bot.id, 'withdraw');
  rejected(room, bot.id, 'inspect', {slot: 0});
  for (const round of [1, 2]) {
    room.players.find(player => player.id === bot.id).bid = {amount: room.reservePrice, pass: false};
    command(room, 'host', 'bid', {amount: room.reservePrice, pass: false});
    assert.equal(room.phase, 'round-summary');
    command(room, 'host', 'next');
    assert.equal(room.round, round + 1);
    assert.equal(room.players.find(player => player.id === bot.id).inspected.length, 2, 'later rounds cannot replenish inspections');
    const projection = R.viewFor(room, 'host');
    assert.equal(projection.lots.filter(lot => lot.known).length, room.round === 3 ? 1 : 0);
  }
});

test('computer winners of all six roles settle the funded shared sale plan once and publish a normal receipt', () => {
  const ids = ['harbor-clock', 'crew-badge', 'harbor-map', 'studio-camera', 'map-print', 'replica-camera'];
  for (const role of Object.keys(E.ROLES)) {
    const room = lobby(600), bot = add(room, 'bold');
    bot.role = role; bot.theme = role === 'collector' ? 'harbor' : null;
    command(room, 'host', 'ready', {ready: true});
    command(room, 'host', 'start');
    // A controlled crate isolates settlement from the computer's estimate model.
    room.items = ids.map((id, slot) => ({...E.catalogItems(5).find(item => item.catalogId === id), id: `lot-${slot}`}));
    const winner = room.players.find(player => player.id === bot.id);
    winner.bid = {amount: room.reservePrice, pass: false};
    const startingCash = winner.cash;
    const expected = E.salePlan(role, room.items, 'special', startingCash - room.reservePrice, {theme: winner.theme});
    command(room, 'host', 'bid', {amount: null, pass: true});
    assert.equal(room.phase, 'result', `${role} must not wait for an impossible browser sale`);
    assert.equal(room.winnerId, bot.id);
    assert.equal(room.winningBid, room.reservePrice);
    assert.equal(room.receipt.recovery, expected.recovery);
    assert.equal(room.receipt.sale, expected.sale);
    assert.equal(room.receipt.cost, expected.cost);
    assert.equal(room.receipt.bonus, expected.bonus);
    assert.equal(room.receipt.profit, expected.recovery - room.reservePrice);
    assert.equal(room.players.find(player => player.id === bot.id).cash, startingCash - room.reservePrice + expected.recovery);
    assert.equal(room.players.find(player => player.id === bot.id).ready, true);
    assert.equal(room.ledger.length, 1);
    assert.equal(room.ledger[0].winnerId, bot.id);
    assert.ok(R.viewFor(room, 'host').valuation);
    const settled = structuredClone(room);
    assert.throws(() => command(room, 'host', 'sell', {mode: 'ordinary', repairSlots: [], pairSlots: []}));
    assert.deepEqual(room, settled, 'a result cannot be credited again');
    for (const processing of expected.processing ?? []) assert.ok(processing.availableBefore >= processing.cost);
  }
});

test('2–4 seat computer sessions carry balances across five crates with one ledger entry per crate', () => {
  for (const seats of [2, 3, 4]) {
    const room = begin(seats - 1, seats * 211);
    for (let auction = 1; auction <= 5; auction++) {
      assert.equal(room.auctionNumber, auction);
      const balances = new Map(room.players.map(player => [player.id, player.cash]));
      const turnId = room.turnId;
      passToResult(room);
      assert.equal(room.ledger.length, auction);
      assert.equal(new Set(room.ledger.map(entry => entry.auctionNumber)).size, auction);
      assert.equal(room.players.find(player => player.id === 'host').cash, OPENING);
      for (const player of room.players) {
        assert.ok(Number.isSafeInteger(player.cash) && player.cash >= 0);
        assert.equal(player.profit, player.cash - OPENING);
        assert.equal(player.cash, balances.get(player.id) + (room.winnerId === player.id ? room.receipt.profit : 0));
        if (player.isBot) assert.equal(player.ready, true);
      }
      const after = structuredClone(room);
      assert.throws(() => R.applyAction(room, 'host', {type: 'bid', amount: null, pass: true, turnId}));
      assert.deepEqual(room, after);
      if (auction < 5) {
        // A lone human host opens the next crate directly; readying first still works.
        assert.equal(R.viewFor(room, 'host').can.continue, true);
        if (auction % 2) command(room, 'host', 'ready', {ready: true});
        command(room, 'host', 'continue');
        assert.equal(room.phase, 'auction');
        assert.equal(room.history.length, 0);
      }
    }
    command(room, 'host', 'finish');
    assert.equal(room.phase, 'ended');
  }
});

test('host transfer always selects a human and the final human leaving ends a computer-filled room', () => {
  const room = lobby();
  const bot = add(room);
  R.joinRoom(room, {id: 'guest', name: 'Next human host', role: 'appraiser'});
  command(room, 'host', 'leave');
  assert.equal(room.hostId, 'guest', 'the earlier computer seat is never promoted to host');
  assert.notEqual(room.hostId, bot.id);
  assert.equal(R.viewFor(room, 'guest').can.addBot, true);
  command(room, 'guest', 'leave');
  assert.equal(room.phase, 'ended');
  assert.ok(!room.hostId || !room.players.find(player => player.id === room.hostId)?.isBot);
  const settled = begin(3, 992);
  passToResult(settled);
  command(settled, 'host', 'leave');
  assert.equal(settled.phase, 'ended');
  assert.equal(computers(settled).length, 3);
});

test('legacy rooms without computer metadata keep their original roles and human readiness semantics', () => {
  const room = lobby(37);
  delete room.rulesVersion;
  delete room.nextBotId;
  for (const player of room.players) { delete player.isBot; delete player.botStyle; }
  add(room, 'steady');
  assert.ok(['restorer', 'appraiser', 'collector'].includes(computers(room)[0].role));
  command(room, 'host', 'ready', {ready: true});
  command(room, 'host', 'start');
  assert.equal(R.viewFor(room, 'host').rulesVersion, 2);
  const oldCatalog = new Set(E.catalogItems(2).map(item => item.catalogId));
  assert.ok(room.items.every(item => oldCatalog.has(item.catalogId)));
  passToResult(room);
  assert.equal(room.ledger.length, 1);
  assert.equal(room.players.find(player => player.id === 'host').ready, false);
});

test('computer bid decisions are deterministic, budget bounded, style dependent and ignore unconfirmed or sealed fields', () => {
  const room = begin(1, 9921), bot = computers(room)[0];
  const view = R.viewFor(room, bot.id);
  view.self.cash = 10000;
  view.self.role = 'appraiser'; view.self.theme = null;
  view.self.bid = null; view.self.submitted = false;
  const quotes = new Map();
  for (const style of Object.keys(B.STYLES)) {
    const input = structuredClone(view);
    input.self.botStyle = style;
    const before = structuredClone(input), result = B.chooseBid(input);
    assert.deepEqual(input, before, 'computing a quote cannot mutate projected state');
    assert.deepEqual(B.chooseBid(structuredClone(input)), result);
    assert.equal(typeof result.pass, 'boolean');
    if (result.pass) assert.equal(result.amount, null);
    else {
      assert.ok(Number.isSafeInteger(result.amount));
      assert.ok(result.amount >= Math.max(1, view.reservePrice) && result.amount <= input.self.cash);
    }
    quotes.set(style, result.amount ?? 0);
    const injected = structuredClone(input);
    for (const lot of injected.lots.filter(lot => !lot.known)) {
      Object.assign(lot, {base: 99999999, genuine: false, condition: 'damaged', catalogId: 'hidden-truth', repair: {cost: 0, sale: 999999999}});
    }
    injected.self.bid = {amount: 8888, pass: false};
    for (const rival of injected.players.filter(player => player.id !== injected.selfId)) {
      rival.bid = {amount: 9999, pass: false}; rival.inspected = [0, 1];
    }
    injected.items = [{name: 'Unexposed room truth', base: 999999999}];
    assert.deepEqual(B.chooseBid(injected), result, 'unknown object extras and current sealed quotes cannot affect the decision');
  }
  assert.ok(new Set(quotes.values()).size > 1, 'styles can value the same clues differently without a universal price ranking');
  const poor = structuredClone(view);
  poor.self.cash = Math.max(0, poor.reservePrice - 1);
  assert.deepEqual(B.chooseBid(poor), {amount: null, pass: true});
  const patient = structuredClone(view);
  patient.self.botStyle = 'patient'; patient.round = 2;
  patient.history = [{bids: [{id: 'host', bid: 10000}]}];
  assert.deepEqual(B.chooseBid(patient), {amount: null, pass: true}, 'patient computer can sit out an expensive public contest');
});

test('only a lone human host skips the ready step; other humans must still ready up', () => {
  const room = lobby();
  add(room);
  R.joinRoom(room, {id: 'guest', name: 'Guest', role: 'appraiser'});
  for (const id of ['host', 'guest']) command(room, id, 'ready', {ready: true});
  command(room, 'host', 'start');
  passToResult(room);
  assert.equal(R.viewFor(room, 'host').can.continue, false);
  rejected(room, 'host', 'continue');
  command(room, 'guest', 'ready', {ready: true});
  rejected(room, 'host', 'continue');
  command(room, 'host', 'ready', {ready: true});
  command(room, 'host', 'continue');
  assert.equal(room.auctionNumber, 2);
});
