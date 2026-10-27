import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const E = require('../game/engine.cjs');
const R = require('../game/room-engine.cjs');
const B = require('../game/room-bots.cjs');
const command = (room, actor, type, fields = {}) => R.applyAction(room, actor, {type, turnId: room.turnId, ...fields});

// Two human opponents can keep an expensive contest open with equal bids.
// The computer receives only its ordinary seat projection at every round.
function expensiveContest(style = 'patient', seed = 411, cash = E.STARTING_CASH) {
  const room = R.createRoom({code: 'STRAT1', seed, host: {id: 'host', name: 'Host', role: 'restorer'}});
  command(room, 'host', 'add-bot', {style});
  const botId = room.players.find(player => player.isBot).id;
  // This budget fixture also represents a computer carrying an earlier loss.
  const computer = room.players.find(player => player.id === botId);
  computer.cash = cash; computer.profit = cash - E.STARTING_CASH;
  R.joinRoom(room, {id: 'guest', name: 'Guest', role: 'appraiser'});
  for (const id of ['host', 'guest']) command(room, id, 'ready', {ready: true});
  command(room, 'host', 'start');
  let earlierView;
  for (let round = 1; round <= 2; round++) {
    command(room, 'host', 'bid', {amount: 900, pass: false});
    command(room, 'guest', 'bid', {amount: 900, pass: false});
    assert.equal(room.phase, 'round-summary');
    command(room, 'host', 'next');
    if (round === 1) earlierView = R.viewFor(room, botId);
  }
  return {room, botId, view: R.viewFor(room, botId), earlierView};
}

test('a patient computer may take a safe final-round opportunity after expensive earlier public bids', () => {
  const {room, botId, view} = expensiveContest('patient', 411, 600);
  assert.equal(view.round, 3);
  assert.ok(view.public.genuineCount !== null && view.public.repairableCount !== null);
  assert.ok(view.lots.some(lot => lot.known));
  const withoutHistory = structuredClone(view);
  withoutHistory.history = [];
  const ownQuote = B.chooseBid(withoutHistory), finalQuote = B.chooseBid(view);
  assert.equal(ownQuote.pass, false, 'the current clues support a positive quote without rival-price anchoring');
  assert.equal(finalQuote.pass, false, 'previous public bids cannot force a final-round pass');
  assert.ok(finalQuote.amount >= view.reservePrice && finalQuote.amount <= view.self.cash);
  assert.ok(finalQuote.amount <= ownQuote.amount, 'the patient buyer does not chase the expensive previous quote');
  assert.ok(finalQuote.amount < 900);
  assert.equal(room.players.find(player => player.id === botId).bid.pass, false, 'the authoritative room submits that safe quote');
  command(room, 'host', 'bid', {amount: null, pass: true});
  command(room, 'guest', 'bid', {amount: null, pass: true});
  assert.equal(room.phase, 'result');
  assert.equal(room.winnerId, botId, 'rivals lowering or passing can now create a real purchase opportunity');
  assert.equal(room.ledger.length, 1);
  assert.equal(room.receipt.paid, finalQuote.amount);
});

test('final-round strategy remains deterministic and cannot read current sealed quotes or unknown truth fields', () => {
  const {view} = expensiveContest();
  for (const style of Object.keys(B.STYLES)) {
    const input = structuredClone(view);
    input.self.botStyle = style;
    const before = structuredClone(input), decision = B.chooseBid(input);
    assert.deepEqual(input, before, 'choosing a quote cannot mutate the seat projection');
    assert.deepEqual(B.chooseBid(structuredClone(input)), decision);
    const poisoned = structuredClone(input);
    for (const lot of poisoned.lots.filter(lot => !lot.known)) {
      Object.assign(lot, {catalogId: 'unexposed', base: 99999999, genuine: false, theme: 'harbor', repair: {cost: 0, sale: 999999999}});
    }
    for (const rival of poisoned.players.filter(player => player.id !== poisoned.selfId)) {
      rival.bid = {amount: 999999, pass: false};
      rival.inspected = [0, 1];
    }
    poisoned.self.bid = {amount: 99999, pass: false};
    poisoned.items = [{name: 'Private room truth', base: 999999999}];
    assert.deepEqual(B.chooseBid(poisoned), decision, 'only confirmed clues and previous public history can affect the quote');
  }
});

test('every style respects cash, reserve and phase boundaries after an expensive public contest', () => {
  const {view} = expensiveContest();
  for (const style of Object.keys(B.STYLES)) {
    for (const cash of [-1, 0, view.reservePrice - 1, view.reservePrice, view.reservePrice + 1, 250, 1000]) {
      const input = structuredClone(view);
      input.self.botStyle = style; input.self.cash = cash;
      const result = B.chooseBid(input);
      if (cash < view.reservePrice) assert.deepEqual(result, {amount: null, pass: true});
      else if (result.pass) assert.equal(result.amount, null);
      else {
        assert.ok(Number.isSafeInteger(result.amount));
        assert.ok(result.amount >= view.reservePrice && result.amount <= cash);
      }
    }
    const closed = structuredClone(view);
    closed.self.botStyle = style; closed.phase = 'result';
    assert.deepEqual(B.chooseBid(closed), {amount: null, pass: true});
  }
});

test('patient computers may still watch an expensive contest before the final round', () => {
  const {earlierView} = expensiveContest('patient', 411, 600);
  assert.equal(earlierView.round, 2);
  assert.equal(earlierView.public.repairableCount, null);
  assert.deepEqual(B.chooseBid(earlierView), {amount: null, pass: true});
});

test('an affordable good-value crate can be bid at the reserve even when that exhausts the remaining cash', () => {
  const {view} = expensiveContest();
  for (const style of Object.keys(B.STYLES)) {
    const input = structuredClone(view);
    input.self.botStyle = style; input.self.cash = input.reservePrice;
    // Before the final round a patient buyer may still deliberately watch.
    // Here the final-round value comfortably supports the small legal reserve.
    assert.deepEqual(B.chooseBid(input), {amount: input.reservePrice, pass: false});
  }
});

function uncertainView(code = 'SAMPLE0') {
  const shapes = ['clock', 'cup', 'badge', 'camera', 'radio', 'map'];
  return {
    code, phase: 'auction', selfId: 'computer-1', rulesVersion: 5,
    auctionNumber: 1, round: 1, reservePrice: 90, sourceId: 'theater',
    self: {id: 'computer-1', role: 'appraiser', theme: null, cash: 1000, isBot: true, botStyle: 'steady', bid: null, inspected: [], inspectionsLeft: 0},
    lots: shapes.map((shape, slot) => ({shape, slot, known: false, range: E.catalogFor(shape, 5)})),
    public: {genuineCount: null, repairableCount: null}, history: [],
    players: [{id: 'host', cash: 1000}, {id: 'computer-1', cash: 1000}]
  };
}

test('valuation keeps expensive processing work bounded even with six fully uncertain appearances', () => {
  const original = E.salePlan;
  let calls = 0;
  E.salePlan = (...args) => { calls++; return original(...args); };
  try {
    for (const style of Object.keys(B.STYLES)) {
      calls = 0;
      const view = uncertainView();
      view.self.botStyle = style;
      const decision = B.chooseBid(view);
      assert.equal(decision.pass, false);
      assert.ok(calls > 0 && calls <= 96, `valuation used ${calls} expensive processing calls`);
    }
  } finally { E.salePlan = original; }
});

test('weighted sampling avoids large price swings between equivalent public views', () => {
  const quotes = [];
  for (let index = 0; index < 40; index++) {
    const result = B.chooseBid(uncertainView(`SAMPLE${index}`));
    assert.equal(result.pass, false);
    quotes.push(result.amount);
  }
  // Room-code variation may add the intentional small bidding jitter, while
  // equal public source/reserve clues should not produce hundreds of coins of
  // extra drift solely because a different uniform reservoir was selected.
  assert.ok(Math.max(...quotes) - Math.min(...quotes) < 90);
});

function confidenceSnapshots(seed, mirrorComputer = false) {
  const room = R.createRoom({code: 'CONFID', seed, host: {id: 'host', name: 'Host', role: 'restorer'}});
  command(room, 'host', 'add-bot', {style: 'patient'});
  const botId = room.players.find(player => player.isBot).id;
  R.joinRoom(room, {id: 'guest', name: 'Guest', role: 'appraiser'});
  for (const id of ['host', 'guest']) command(room, id, 'ready', {ready: true});
  command(room, 'host', 'start');
  const views = [R.viewFor(room, botId)];
  for (let round = 1; round <= 2; round++) {
    const amount = mirrorComputer ? room.players.find(player => player.id === botId).bid.amount ?? room.reservePrice : 900;
    for (const id of ['host', 'guest']) command(room, id, 'bid', {amount, pass: false});
    assert.equal(room.phase, 'round-summary');
    command(room, 'host', 'next');
    views.push(R.viewFor(room, botId));
  }
  return views;
}
function styleQuotes(view) {
  return Object.fromEntries(Object.keys(B.STYLES).map(style => {
    const input = structuredClone(view);
    input.self.botStyle = style;
    const decision = B.chooseBid(input);
    assert.equal(decision.pass, false);
    return [style, decision.amount];
  }));
}

test('styles differ by confidence: bold competes early while patient can lead with clearer final-round clues', () => {
  const risky = confidenceSnapshots(123)[0];
  assert.equal(risky.round, 1);
  assert.equal(risky.public.genuineCount, null);
  assert.ok(risky.lots.every(lot => !lot.known));
  const uncertainQuotes = styleQuotes(risky);
  assert.ok(uncertainQuotes.bold > uncertainQuotes.steady);
  assert.ok(uncertainQuotes.bold > uncertainQuotes.patient);

  const confident = confidenceSnapshots(1)[2];
  assert.equal(confident.round, 3);
  assert.ok(confident.lots.some(lot => lot.known));
  assert.ok(confident.public.genuineCount !== null && confident.public.repairableCount !== null);
  const clearerQuotes = styleQuotes(confident);
  assert.ok(clearerQuotes.patient > clearerQuotes.bold);
  assert.ok(clearerQuotes.patient > clearerQuotes.steady);
});

test('patient valuation responds to newly published genuine counts rather than only raising bids with the round', () => {
  const [first, second] = confidenceSnapshots(2, true);
  assert.equal(first.public.genuineCount, null);
  assert.equal(second.public.genuineCount, 6);
  assert.ok(first.lots.every(lot => !lot.known) && second.lots.every(lot => !lot.known));
  const before = B.chooseBid(first), after = B.chooseBid(second);
  assert.equal(before.pass, false);
  assert.equal(after.pass, false);
  const withoutNewCount = structuredClone(second);
  withoutNewCount.public.genuineCount = null;
  const lessInformed = B.chooseBid(withoutNewCount);
  assert.equal(lessInformed.pass, false);
  // The controlled comparison holds the round, prior prices, cash and all
  // appearances fixed. The newly published count supplies the extra information.
  assert.ok(after.amount > lessInformed.amount);
  assert.notEqual(after.amount, before.amount);
});
