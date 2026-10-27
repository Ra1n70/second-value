import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url), E = require('../game/engine.cjs'), R = require('../game/room-engine.cjs');
const [online, app] = await Promise.all(['online.js', 'app.js'].map(file => readFile(new URL(`../game/client/${file}`, import.meta.url), 'utf8')));
const shared = async file => { const context = {module: {exports: {}}}; runInNewContext(await readFile(new URL(`../game/client/${file}`, import.meta.url), 'utf8'), context); return context.module.exports; };
const Clues = await shared('round-clues.js'), Show = await shared('auction-show.js');
const extract = (name, source = online) => {
  source = source.match(new RegExp('  function ' + name + '\\([^\\n]*\\) \\{[\\s\\S]*?\\n  \\}'))?.[0];
  assert.ok(source, `actual ${name} must exist`);
  return source;
};
const money = value => Number(value).toLocaleString('en-US');
const signed = value => (value > 0 ? '+' : value < 0 ? '−' : '') + money(Math.abs(value));
const run = (names, call, context = {}, source = online) => runInNewContext(names.map(name => extract(name, source)).join('\n') + '\n' + call, {E, Clues, Show, money, signed, ...context});
const act = (room, id, type, fields = {}) => R.applyAction(room, id, {type, turnId: room.turnId, ...fields});
const total = room => room.items.reduce((sum, item) => sum + item.base, 0);

function table(seed, hostRole = 'restorer', guestRole = 'appraiser') {
  const room = R.createRoom({code: 'RANGE1', seed, host: {id: 'host', name: 'Host', role: hostRole, theme: 'harbor'}});
  R.joinRoom(room, {id: 'guest', name: 'Guest', role: guestRole, theme: 'harbor'});
  for (const id of ['host', 'guest']) act(room, id, 'ready', {ready: true});
  act(room, 'host', 'start');
  return room;
}

test('the crate value range always contains the true ordinary value and uses the reserve to narrow it', () => {
  let narrower = 0;
  for (let seed = 1; seed <= 120; seed++) {
    const room = table(seed);
    for (let round = 1; round <= 3; round++) {
      if (round > 1) { act(room, 'host', 'next'); }
      if (round === 2) act(room, 'guest', 'inspect', {slot: seed % 6});
      for (const id of ['host', 'guest']) {
        const view = R.viewFor(room, id), lots = run(['crateLots'], 'crateLots(view)', {view}), range = Clues.valueRange(lots, view.reservePrice);
        assert.ok(range && range.low <= total(room) && total(room) <= range.high, `seed ${seed} round ${round} ${id}: ${total(room)} outside ${JSON.stringify(range)}`);
        const catalogOnly = Clues.valueRange(lots, 0);
        assert.ok(catalogOnly.low <= range.low && range.high <= catalogOnly.high);
        if (round === 1 && id === 'host' && range.high - range.low < catalogOnly.high - catalogOnly.low) narrower++;
      }
      if (round < 3) for (const id of ['host', 'guest']) act(room, id, 'bid', {amount: null, pass: true});
    }
  }
  assert.ok(narrower >= 100, `the reserve should narrow most opening estimates (${narrower} / 120)`);
});

test('computer thinking pauses are repeatable per round and follow the bidding style', () => {
  const view = {turnId: 'ROOM1:4'};
  for (const [style, least, most] of [['bold', 700, 1600], ['steady', 1200, 2500], ['patient', 1900, 3400]]) {
    const delays = ['computer-1', 'computer-2', 'computer-3'].map(id => run(['thinkMs'], 'thinkMs(view, player)', {view, player: {id, botStyle: style}}));
    for (const delay of delays) assert.ok(delay >= least && delay < most, `${style}: ${delay}`);
    assert.equal(run(['thinkMs'], 'thinkMs(view, player)', {view, player: {id: 'computer-1', botStyle: style}}), delays[0]);
    assert.notEqual(run(['thinkMs'], 'thinkMs(view, player)', {view: {turnId: 'ROOM1:5'}, player: {id: 'computer-1', botStyle: style}}), delays[0], 'a new round draws a new pause');
  }
});

test('the thinking pause only hides a computer decision during the round this tab watched open', () => {
  const player = {id: 'computer-1', isBot: true, botStyle: 'steady', submitted: true}, human = {...player, id: 'p0', isBot: false};
  const view = {turnId: 'ROOM1:2', phase: 'auction'}, shown = (clock, thinking, who = player, current = view) => run(['thinkMs', 'shownSubmitted'], 'shownSubmitted(who, current)', {who, current, thinking, performance: {now: () => clock}, state: {view: current}});
  const pause = run(['thinkMs'], 'thinkMs(view, player)', {view, player});
  assert.equal(shown(100, {turn: 'ROOM1:2', start: 100}), false);
  assert.equal(shown(100 + pause, {turn: 'ROOM1:2', start: 100}), true);
  assert.equal(shown(100, {turn: 'ROOM1:2', start: 100}, human), true, 'human decisions show at once');
  assert.equal(shown(100, {turn: null, start: 0}), true, 'a refreshed tab shows decisions as they stand');
  assert.equal(shown(100, {turn: 'ROOM1:2', start: 100}, player, {...view, phase: 'round-summary'}), true);
  assert.equal(shown(100, {turn: 'ROOM1:2', start: 100}, {...player, submitted: false}), false);
});

function fixed(guestRole = 'collector') {
  // A known crate: an Old Harbor pair for the Collector and a repairable clock for the Restorer.
  const room = table(73, 'restorer', guestRole);
  room.items = ['harbor-clock', 'crew-badge', 'harbor-map', 'studio-camera', 'map-print', 'replica-camera'].map((id, slot) => ({...structuredClone(E.catalogItems().find(item => item.catalogId === id)), id: `lot-${slot}`}));
  return room;
}
const review = (room, id) => run(['bidReview'], 'bidReview()', {state: {view: R.viewFor(room, id)}});

test('the bid review compares each seat’s top bid with the crate’s worth to that seat', () => {
  const room = fixed();
  room.reservePrice = 50;
  act(room, 'host', 'bid', {amount: 800, pass: false});
  act(room, 'guest', 'bid', {amount: 300, pass: false});
  assert.equal(room.phase, 'dispose');
  act(room, 'host', 'sell', {mode: 'ordinary', repairSlots: [], pairSlots: []});
  const host = review(room, 'host');
  assert.match(host, /<dt>Your top bid<\/dt><dd><span data-no-localize>800<\/span><\/dd>/);
  assert.match(host, /<dt>Hammer price<\/dt><dd data-no-localize>800<\/dd>/);
  assert.match(host, /<dt[^>]*>Worth to you<\/dt><dd data-no-localize>935<\/dd>/, 'ordinary 890 plus the 45 repair gain');
  assert.match(host, /Worth more to you than you paid:<\/span> <strong class="positive" data-no-localize>\+135/);
  assert.match(host, /Your best sale would have added:<\/span> <strong class="positive" data-no-localize>\+45/, 'the winner sold without repairing');
  const guest = review(room, 'guest');
  assert.match(guest, /<dt[^>]*>Worth to you<\/dt><dd data-no-localize>982<\/dd>/, 'ordinary 890 plus the 92 Old Harbor pair bonus');
  assert.match(guest, /At the hammer price you would still have made:<\/span> <strong class="positive" data-no-localize>\+182/);
  assert.match(guest, /Your top bid was below the hammer price by:<\/span> <strong class="" data-no-localize>500/);
});

test('the bid review names a good pass, an unaffordable price and a missed reserve', () => {
  const pass = fixed('appraiser');
  act(pass, 'host', 'bid', {amount: 990, pass: false});
  act(pass, 'guest', 'bid', {amount: null, pass: true});
  act(pass, 'host', 'sell', {mode: 'ordinary', repairSlots: [], pairSlots: []});
  const appraiser = review(pass, 'guest');
  assert.match(appraiser, /<dd>Passed every round<\/dd>/);
  assert.match(appraiser, /Not buying was right\. At the hammer price you would have lost:<\/span> <strong class="negative" data-no-localize>100/);

  const poor = fixed();
  // The guest arrived at this crate with 500, below the eventual hammer price.
  poor.players.find(player => player.id === 'guest').cash = 500;
  poor.cratePlayers.find(player => player.id === 'guest').cashBefore = 500;
  act(poor, 'host', 'bid', {amount: 800, pass: false});
  act(poor, 'guest', 'bid', {amount: 400, pass: false});
  act(poor, 'host', 'sell', {mode: 'ordinary', repairSlots: [], pairSlots: []});
  assert.match(review(poor, 'guest'), /Your cash was below the hammer price by:<\/span> <strong class="negative" data-no-localize>300/, '800 hammer price against 500 cash');

  const unsold = fixed();
  unsold.reservePrice = 50;
  for (let round = 1; round <= 3; round++) {
    if (round > 1) act(unsold, 'host', 'next');
    for (const id of ['host', 'guest']) act(unsold, id, 'bid', {amount: null, pass: true});
  }
  assert.equal(unsold.phase, 'result');
  const missed = review(unsold, 'host');
  assert.match(missed, /<dt>Auction-house reserve<\/dt><dd data-no-localize>50<\/dd>/);
  assert.match(missed, /Nobody met the reserve\. Buying at the reserve would have made:<\/span> <strong class="positive" data-no-localize>\+885/);
  assert.equal(review({...unsold, cancelledCrate: true}, 'host'), '', 'a cancelled crate has no review');
});

test('the value chip shows the shared range in rooms and solo practice', () => {
  const room = table(9), view = R.viewFor(room, 'host');
  const chip = run(['crateLots', 'publicCounts', 'valueNotice'], 'valueNotice()', {state: {view}});
  const range = Clues.valueRange(run(['crateLots'], 'crateLots(view)', {view}), view.reservePrice);
  assert.match(chip, new RegExp(`<summary><span>Crate value</span><strong data-no-localize>${money(range.low)}–${money(range.high)}</strong></summary>`));
  assert.match(chip, /Estimated from the reserve \(8–12% of this value\), each object’s catalog range and the announced counts\./);
  assert.equal(Clues.valueMarkup([], 50), '', 'no objects, no chip');
  assert.match(Clues.valueMarkup([[{base: 10}, {base: 20}]], 0), /10–20[\s\S]*Estimated from each object’s catalog range and the announced counts\./);

  const session = E.newSession('appraiser', 31, 'harbor'), game = session.game;
  const soloNames = ['informationFor', 'soloLots', 'soloCounts', 'valueNotice'].map(name => extract(name, app)).join('\n');
  const solo = runInNewContext(soloNames + '\nvalueNotice()', {E, Clues, game});
  const truth = game.items.reduce((sum, item) => sum + item.base, 0), [low, high] = solo.match(/data-no-localize>([\d,]+)–([\d,]+)</).slice(1).map(value => Number(value.replace(/,/g, '')));
  assert.ok(low <= truth && truth <= high, `${truth} within ${low}–${high}`);
  game.inspected.push(0);
  const narrowed = runInNewContext(soloNames + '\nvalueNotice()', {E, Clues, game});
  const [low2, high2] = narrowed.match(/data-no-localize>([\d,]+)–([\d,]+)</).slice(1).map(value => Number(value.replace(/,/g, '')));
  assert.ok(low2 >= low && high2 <= high && low2 <= truth && truth <= high2, 'an Appraiser note can only narrow the range');
});

test('solo practice reviews each settled crate with the same verdicts', () => {
  const finish = (amount, role = 'collector') => {
    const session = E.newSession(role, 11, 'harbor');
    E.performSession(session, 'open');
    for (let round = 1; session.game.phase !== 'dispose' && session.game.phase !== 'result'; round++) {
      E.performSession(session, 'bid', amount === null ? {amount: null, pass: true} : {amount, pass: false});
      if (session.game.phase === 'round-summary') { E.performSession(session, 'next'); E.performSession(session, 'open'); }
      assert.ok(round < 4);
    }
    if (session.game.phase === 'dispose') E.performSession(session, 'sell', {mode: 'ordinary', selection: {}});
    return session.game;
  };
  const review = game => runInNewContext(extract('bidReview', app) + '\nbidReview()', {E, Show, game});
  const won = finish(1000);
  assert.equal(won.winner, 'you');
  const best = E.salePlan('collector', won.items, 'special', E.getCash(won) - won.bid, {theme: 'harbor'}).recovery;
  const mine = review(won);
  assert.match(mine, new RegExp(`<dt>Hammer price</dt><dd data-no-localize>${money(won.bid)}</dd>`));
  assert.match(mine, new RegExp(`Worth to you</dt><dd data-no-localize>${money(best)}</dd>`));
  assert.match(mine, best >= won.bid ? /Worth more to you than you paid:/ : /You paid more than it was worth to you:/);
  if (best > won.receipt.recovery) assert.match(mine, /Your best sale would have added:/);

  const passed = finish(null);
  assert.notEqual(passed.winner, 'you');
  const theirs = review(passed);
  assert.match(theirs, /<dd>Passed every round<\/dd>/);
  assert.match(theirs, passed.winner ? /<dt>Hammer price<\/dt>/ : /<dt>Auction-house reserve<\/dt>/);
});

test('solo seats read Deciding only during the round this page watched open', () => {
  const game = {phase: 'inspect', round: 2}, session = {seed: 5, auctionNumber: 3}, bot = {id: 'bot-1'};
  const names = ['roundKey', 'thinkMs', 'stillThinking'].map(name => extract(name, app)).join('\n');
  const thinkingAt = (clock, thinking, current = game) => runInNewContext(names + '\nstillThinking(bot)', {game: current, session, bot, thinking, performance: {now: () => clock}});
  const pause = runInNewContext(names + '\nthinkMs(roundKey(), bot)', {game, session, bot});
  assert.ok(pause >= 900 && pause < 2900);
  assert.equal(thinkingAt(10, {turn: '5:3:2', start: 0}), true);
  assert.equal(thinkingAt(pause, {turn: '5:3:2', start: 0}), false);
  assert.equal(thinkingAt(10, {turn: '5:3:1', start: 0}), false, 'an older round never pauses');
  assert.equal(thinkingAt(10, {turn: '5:3:2', start: 0}, {...game, phase: 'round-summary'}), false);
});

test('announced genuine and repairable counts narrow the value range and never exclude the true value', () => {
  let narrower = 0;
  for (let seed = 1; seed <= 150; seed++) {
    const room = table(seed);
    for (let round = 1; round <= 3; round++) {
      if (round > 1) act(room, 'host', 'next');
      const view = R.viewFor(room, 'host'), lots = run(['crateLots'], 'crateLots(view)', {view});
      const counts = {genuine: view.public.genuineCount, repairable: view.public.repairableCount};
      const withCounts = Clues.valueRange(lots, view.reservePrice, counts), without = Clues.valueRange(lots, view.reservePrice);
      assert.ok(withCounts.low <= total(room) && total(room) <= withCounts.high, `seed ${seed} round ${round}: ${total(room)} outside ${JSON.stringify(withCounts)}`);
      assert.ok(without.low <= withCounts.low && withCounts.high <= without.high);
      if (round === 2 && withCounts.high - withCounts.low < without.high - without.low) narrower++;
      if (round < 3) for (const id of ['host', 'guest']) act(room, id, 'bid', {amount: null, pass: true});
    }
  }
  assert.ok(narrower >= 60, `the genuine count should often narrow round 2 (${narrower} / 150)`);
});

test('the ability blocker speaks only when the public facts rule an ability out', () => {
  const pick = ids => ids.map(id => [Clues.identityOf(E.catalogItems().find(item => item.catalogId === id))]);
  const fakes = pick(['replica-cup', 'replica-badge', 'toy-camera', 'prop-radio', 'map-print', 'replica-camera']);
  for (const role of ['curator', 'collector', 'restorer', 'broker']) assert.match(Clues.abilityBlocker(role, 'harbor', fakes), /^Not possible in this crate/, role);
  assert.equal(Clues.abilityBlocker('salvager', null, fakes), '');
  assert.equal(Clues.abilityBlocker('appraiser', null, fakes), '', 'the Appraiser has no after-sale ability');
  const exhibit = pick(['studio-camera', 'tea-cup', 'crew-badge', 'replica-cup', 'map-print', 'harbor-clock']);
  assert.equal(Clues.abilityBlocker('curator', null, exhibit), '');
  assert.match(Clues.abilityBlocker('salvager', null, pick(['studio-camera', 'tea-cup', 'crew-badge', 'harbor-map', 'harbor-clock', 'navy-badge'])), /every object is genuine/);
  assert.match(Clues.abilityBlocker('collector', 'railway', exhibit), /two genuine objects in your theme/, 'only the tea cup is Railway');
  for (let seed = 1; seed <= 150; seed++) {
    const room = table(seed);
    for (let round = 1; round <= 3; round++) {
      if (round > 1) act(room, 'host', 'next');
      const view = R.viewFor(room, 'host'), lots = run(['crateLots'], 'crateLots(view)', {view}), counts = {genuine: view.public.genuineCount, repairable: view.public.repairableCount};
      for (const [role, theme] of [['curator', null], ['collector', 'harbor'], ['collector', 'railway'], ['restorer', null], ['salvager', null], ['broker', null]]) {
        if (!Clues.abilityBlocker(role, theme, lots, counts)) continue;
        const exact = Clues.abilityBlocker(role, theme, room.items.map(item => [Clues.identityOf(item)]));
        assert.ok(exact, `seed ${seed} round ${round}: ${role} was blocked early but the opened crate allows it`);
        const plan = E.salePlan(role, room.items, 'special', 1500, {theme: theme ?? 'harbor'});
        assert.equal(plan.recovery, room.items.reduce((sum, item) => sum + item.base, 0), `${role} blocked yet the engine found an ability use`);
      }
      if (round < 3) for (const id of ['host', 'guest']) act(room, id, 'bid', {amount: null, pass: true});
    }
  }
});

test('solo practice feeds the announced counts into its value chip', () => {
  const session = E.newSession('curator', 47, 'harbor'), game = session.game;
  const names = ['informationFor', 'soloLots', 'soloCounts', 'valueNotice'].map(name => extract(name, app)).join('\n');
  const chip = round => { game.round = round; return runInNewContext(names + '\n[soloCounts(), valueNotice()]', {E, Clues, game}); };
  const genuine = game.items.filter(item => item.genuine).length, repairable = game.items.filter(item => item.genuine && item.condition === 'damaged' && item.repair).length;
  assert.deepEqual(JSON.parse(JSON.stringify(chip(1)[0])), {genuine: null, repairable: null});
  assert.deepEqual(JSON.parse(JSON.stringify(chip(2)[0])), {genuine, repairable: null});
  const [counts, markup] = chip(3);
  assert.deepEqual(JSON.parse(JSON.stringify(counts)), {genuine, repairable});
  const lots = runInNewContext(names + '\nsoloLots()', {E, Clues, game}), range = Clues.valueRange(lots, game.reservePrice, counts);
  assert.match(markup, new RegExp(`${money(range.low)}–${money(range.high)}`));
});

test('an exact break-even reads as break-even, never as making zero', () => {
  const won = Show.bidReviewMarkup({outcome: 'won', top: 600, price: 600, worth: 600, recovery: 600});
  assert.match(won, /<p>You paid exactly what it was worth to you\.<\/p>/);
  assert.doesNotMatch(won, /Worth more to you than you paid|data-no-localize>0</);
  const sold = Show.bidReviewMarkup({outcome: 'sold', top: 550, price: 600, worth: 600});
  assert.match(sold, /<p>At the hammer price you would have broken even\.<\/p><p><span>Your top bid was below the hammer price by:<\/span> <strong class="" data-no-localize>50<\/strong><\/p>/);
  assert.doesNotMatch(sold, /would still have made/);
  assert.match(Show.bidReviewMarkup({outcome: 'sold', top: 0, price: 600, worth: 601}), /would still have made:<\/span> <strong class="positive" data-no-localize>\+1/);
});
