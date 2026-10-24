import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const E = require('../game/engine.cjs');
const roles = Object.keys(E.ROLES);
const newRoles = ['salvager', 'curator', 'broker'];
const clone = value => JSON.parse(JSON.stringify(value));
const item = id => clone(E.ITEMS.find(candidate => candidate.catalogId === id));
const total = items => items.reduce((sum, candidate) => sum + candidate.base, 0);
const plan = (role, items, ids, cash = 1000) => E.salePlan(role, items, 'special', cash, { abilityIds: ids });

test('current rules retain the expanded catalog and roles while prior silhouette ranges stay locked', () => {
  assert.equal(E.RULES_VERSION, 5);
  assert.equal(roles.length, 6);
  assert.equal(E.catalogItems(1).length, 18);
  assert.equal(E.catalogItems(2).length, 18);
  assert.equal(E.catalogItems(3).length, 24);
  assert.equal(E.catalogItems(4).length, 24);
  assert.equal(E.catalogItems(5).length, 24);
  assert.equal(E.catalogItems(1).find(candidate => candidate.catalogId === 'tea-cup').theme, null);
  assert.equal(E.catalogItems(2).find(candidate => candidate.catalogId === 'tea-cup').theme, 'railway');
  assert.equal(E.catalogFor('radio', 2).max, 160);
  assert.equal(E.catalogFor('radio', { rulesVersion: 3 }).max, 300);
  assert.deepEqual(newRoles.map(role => E.abilitySelectionLimit(role)), [2, 3, 1]);
});

test('original revisions retain exact seeded draws and all three rounds of computer quotes', () => {
  // Goldens captured from source commit 3b1015e, before the role/catalog expansion.
  const expected = {
    1: 'd04c9e9d87784b919493dc3d80289bb26fa2ed9ec696f1c2511f566a6e246347',
    2: '53f26fcc77bca6776728e30752872ff8358d139452a3ff54a14ca94cf6ed3daa',
    3: '084eef706e71d76163e55cffd4a105633efdd8de7843458338276ce9603f4fa2',
  };
  for (const revision of [1, 2, 3]) {
    const signature = JSON.stringify([1, 7, 42, 530, 20261020, 4294967295].map(seed => {
      const game = E.newGame('appraiser', seed, 'harbor', { rulesVersion: revision });
      return {
        seed, items: game.items, priority: game.priority, publicIndex: game.publicIndex,
        quotes: [1, 2, 3].map(round => E.computerBids(game.items, E.rng(seed ^ 0x4F17C2), { round, history: [], publicIndex: game.publicIndex, rulesVersion: revision })),
      };
    }));
    assert.equal(createHash('sha256').update(signature).digest('hex'), expected[revision]);
  }
});

test('crate truth, starting prices and tie priority are independent of chosen role and bot work', () => {
  const sampledRoles = new Set();
  for (let seed = 0; seed < 30; seed++) {
    const original = E.newGame('appraiser', seed, 'harbor', { noBots: true });
    for (const role of roles) {
      const game = E.newGame(role, seed, 'harbor', { noBots: true });
      assert.deepEqual(game.items, original.items);
      assert.deepEqual(game.priority, original.priority);
      assert.equal(game.publicIndex, original.publicIndex);
      assert.deepEqual(game.botRoles, original.botRoles);
      assert.deepEqual(E.salePlan(role, game.items, 'ordinary', 1000), E.salePlan('appraiser', game.items, 'ordinary', 1000));
    }
    const game = E.newGame('appraiser', seed);
    assert.deepEqual(game.items, original.items);
    assert.equal(game.publicIndex, original.publicIndex);
    assert.equal(new Set(game.bots.map(bot => bot.role)).size, 3);
    game.bots.forEach(bot => sampledRoles.add(bot.role));
  }
  assert.deepEqual([...sampledRoles].sort(), [...roles].sort());
});

test('salvage replaces only selected reproductions with fixed proceeds and pays each fee first', () => {
  const items = [item('map-print'), item('replica-camera'), item('studio-camera')];
  const result = plan('salvager', items, items.slice(0, 2).map(candidate => candidate.id), 0);
  assert.equal(result.sale, 510);
  assert.equal(result.cost, 30);
  assert.equal(result.recovery, total(items) + 60);
  assert.equal(result.processing[0].availableBefore, 330);
  assert.equal(result.processing[1].availableBefore, 405);
  for (const candidate of E.ITEMS.filter(candidate => !candidate.genuine)) {
    assert.equal(E.abilityEligibility('salvager', candidate), true);
    const gain = plan('salvager', [candidate], [candidate.id], 15).recovery - candidate.base;
    assert.ok(gain >= 5 && gain <= 55);
  }
  assert.throws(() => plan('salvager', [items[0]], [items[0].id], 14), /fees first/);
  assert.equal(plan('salvager', [items[0]], [items[0].id], 15).recovery, 75);
  assert.throws(() => plan('salvager', items, [items[2].id]), /cannot be salvaged/);
  const poorTarget = { ...item('replica-camera'), base: 100 };
  assert.equal(E.salePlan('salvager', [poorTarget], 'special', 1000).recovery, 100);
  assert.equal(plan('salvager', [poorTarget], [poorTarget.id]).recovery, 75);
});

test('exhibition needs three genuine intact categories and caps its net benefit at 95', () => {
  const selected = ['cabinet-clock', 'studio-camera', 'star-chart'].map(item);
  assert.throws(() => plan('curator', selected, selected.map(candidate => candidate.id), 24), /fees first/);
  const funded = [...selected, item('prop-radio')];
  const result = plan('curator', funded, selected.map(candidate => candidate.id), 0);
  assert.equal(result.sale, total(funded));
  assert.equal(result.bonus, 120);
  assert.equal(result.cost, 25);
  assert.equal(result.recovery, total(funded) + 95);
  assert.equal(result.processing[0].availableBefore, 25);
  assert.throws(() => plan('curator', selected, selected.slice(0, 2).map(candidate => candidate.id)), /exactly three/);
  const duplicateCategory = [item('tea-cup'), item('sailor-cup'), item('star-chart')];
  assert.throws(() => plan('curator', duplicateCategory, duplicateCategory.map(candidate => candidate.id)), /different categories/);
  const damaged = [item('cracked-cup'), ...selected.slice(1)];
  assert.throws(() => plan('curator', damaged, damaged.map(candidate => candidate.id)), /genuine, intact/);
  assert.equal(E.abilityEligibility('curator', item('replica-camera')), false);
});

test('customer sale charges packing and delivery, can lose on a low-value target, and never repairs damage', () => {
  const high = item('studio-camera'), low = item('navy-badge'), damaged = item('cracked-cup');
  assert.equal(plan('broker', [high], [high.id], 25).recovery, high.base + 65);
  assert.throws(() => plan('broker', [high], [high.id], 24), /fees first/);
  assert.equal(plan('broker', [high, item('prop-radio')], [high.id], 0).recovery, high.base + 25 + 65);
  const poor = plan('broker', [low], [low.id]);
  assert.equal(poor.bonus, 21);
  assert.equal(poor.recovery, low.base - 4);
  assert.equal(E.salePlan('broker', [low], 'special', 1000).recovery, low.base);
  assert.throws(() => plan('broker', [damaged], [damaged.id]), /genuine.*intact/);
  assert.throws(() => plan('broker', [high, low], [high.id, low.id]), /exactly one/);
});

test('all abilities accept an empty ordinary choice and reject malformed or foreign selections', () => {
  const items = [item('map-print'), item('replica-camera'), item('prop-radio'), item('studio-camera')];
  for (const role of newRoles) {
    assert.equal(plan(role, items, [], 0).cost, 0);
    assert.equal(plan(role, items, [], 0).recovery, total(items));
    assert.deepEqual(plan(role, items, [], 0).ability, []);
    assert.throws(() => plan(role, items, ['not-in-this-crate']), /valid objects/);
    assert.throws(() => plan(role, items, [items[0].id, items[0].id]), /only once/);
    assert.throws(() => E.salePlan(role, items, 'ordinary', 1000, { abilityIds: [items[0].id] }), /special sale/);
    assert.throws(() => E.salePlan(role, items, 'special', 1000, { repairIds: [] }), /Only the restorer/);
  }
  assert.throws(() => plan('salvager', items, items.slice(0, 3).map(candidate => candidate.id)), /at most two/);
  assert.throws(() => plan('appraiser', items, []), /matching role/);
  assert.throws(() => E.salePlan('broker', items, 'special', 1000, { abilityIds: [], ignored: true }), /valid processing options/);
});

test('seeded opportunities vary, automatic processing is bounded, and overbidding can still lose', () => {
  const caps = { restorer: 120, appraiser: 0, collector: 120, salvager: 110, curator: 95, broker: 65 };
  const opportunities = Object.fromEntries(roles.map(role => [role, 0]));
  const misses = Object.fromEntries(roles.map(role => [role, 0]));
  for (let seed = 0; seed < 240; seed++) {
    const items = E.newGame('appraiser', seed, 'harbor', { noBots: true }).items;
    const ordinary = total(items);
    for (const role of roles) {
      const result = E.salePlan(role, items, 'special', 1000, { theme: 'harbor' });
      assert.equal(result.recovery, result.sale + result.bonus - result.cost);
      const gain = result.recovery - ordinary;
      assert.ok(gain >= 0 && gain <= caps[role], `${role} gain ${gain}`);
      if (gain) opportunities[role]++; else misses[role]++;
      assert.ok(result.recovery - (ordinary + 121) < 0, 'an overbid beats every capped role benefit');
    }
  }
  for (const role of roles.filter(candidate => candidate !== 'appraiser')) {
    assert.ok(opportunities[role] > 0, `${role} needs real opportunities`);
    assert.ok(misses[role] > 0, `${role} must sometimes have no processing advantage`);
  }
});

test('old revision 2 sessions restore prior cash, losses, future crates and locked bot roles', () => {
  const expected = { restorer: [1150, 725], appraiser: [1070, 665], collector: [1162, 742] };
  for (const role of ['restorer', 'appraiser', 'collector']) {
    const [firstRecovery, lastRecovery] = expected[role];
    const raw = { version: 5, rulesVersion: 2, seed: 42, role, theme: role === 'collector' ? 'harbor' : null,
      actions: [{ type: 'open' }, { type: 'bid', amount: 1000, pass: false }, { type: 'sell', mode: 'special', selection: {} }, { type: 'continue' }, { type: 'open' }, { type: 'bid', amount: firstRecovery, pass: false }, { type: 'sell', mode: 'special', selection: {} }] };
    const restored = E.restoreSession(raw);
    assert.ok(restored);
    assert.equal(restored.cash, lastRecovery);
    assert.equal(restored.history[0].cash, firstRecovery);
    assert.equal(restored.history[1].profit, lastRecovery - firstRecovery);
    assert.deepEqual(restored.game.items.map(candidate => candidate.catalogId), ['sailor-cup', 'map-print', 'toy-camera', 'harbor-map', 'replica-cup', 'station-clock']);
    assert.deepEqual(restored.players.slice(1).map(player => player.role), ['collector', 'restorer', 'appraiser']);
  }
});

function finishAuction(session) {
  while (!['dispose', 'result'].includes(session.game.phase)) {
    if (session.game.phase === 'inspect') E.performSession(session, 'open');
    else if (session.game.phase === 'bid') E.performSession(session, 'bid', { amount: session.cash, pass: false });
    else E.performSession(session, 'next');
  }
}

test('new role settlements replay selected IDs and continuations retain the bot roster', () => {
  for (const role of newRoles) {
    let session;
    for (let seed = 0; seed < 30; seed++) {
      const candidate = E.newSession(role, seed); finishAuction(candidate);
      if (candidate.game.phase === 'dispose') { session = candidate; break; }
    }
    assert.ok(session, `${role} can win a deterministic fixture`);
    const roster = session.players.slice(1).map(player => ({ role: player.role, theme: player.theme }));
    const automatic = E.salePlan(role, session.game.items, 'special', session.cash - session.game.bid);
    const ids = automatic.ability;
    const before = JSON.stringify(session);
    assert.throws(() => E.performSession(session, 'sell', { mode: 'special', selection: { abilityIds: ['foreign-object'] } }), /valid objects/);
    assert.equal(JSON.stringify(session), before, 'rejected selection is atomic');
    E.performSession(session, 'sell', { mode: 'special', selection: { abilityIds: ids } });
    assert.deepEqual(session.game.actions.at(-1).selection, { abilityIds: ids });
    assert.equal(session.game.receipt.cash, session.cash);
    assert.deepEqual(E.restoreSession(clone(session)), session);
    const tampered = clone(session);
    tampered.actions.at(-1).selection.abilityIds = ['foreign-object'];
    assert.equal(E.restoreSession(tampered), null);
    if (!session.ended) {
      E.performSession(session, 'continue');
      assert.deepEqual(session.game.bots.map(bot => ({ role: bot.role, theme: bot.theme })), roster);
      assert.deepEqual(E.restoreSession(clone(session)), session);
    }
  }
});

test('server and browser use byte-identical rules and equivalent new-role sale plans', async () => {
  const server = await readFile(new URL('../game/engine.cjs', import.meta.url), 'utf8');
  const browser = await readFile(new URL('../game/client/engine.js', import.meta.url), 'utf8');
  assert.equal(browser, server);
  const sandbox = {};
  vm.runInNewContext(browser, sandbox);
  for (const role of newRoles) {
    const items = E.newGame(role, 7, 'harbor', { noBots: true }).items;
    assert.deepEqual(clone(sandbox.SecondValue.salePlan(role, items, 'special', 1000)), E.salePlan(role, items, 'special', 1000));
  }
});
