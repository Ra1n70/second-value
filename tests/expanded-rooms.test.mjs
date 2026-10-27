import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const E = require('../game/engine.cjs');
const R = require('../game/room-engine.cjs');

// Tables created under the current rules start with this much cash.
const OPENING = E.startingCashFor(E.RULES_VERSION);
const originalRoles = ['restorer', 'appraiser', 'collector'];
const targets = {
  salvager: [0, 1],
  curator: [2, 3, 4],
  broker: [2],
};
const ids = ['map-print', 'replica-camera', 'studio-camera', 'star-chart', 'travel-radio', 'crew-badge'];
const command = (room, actor, type, fields = {}) => R.applyAction(room, actor, {type, turnId: room.turnId, ...fields});
function open(role, legacy = false) {
  const room = R.createRoom({code: 'ROLEQA', seed: 73, host: {id: 'host', name: 'Host', role, theme: 'harbor'}});
  if (legacy) delete room.rulesVersion;
  R.joinRoom(room, {id: 'guest', name: 'Guest', role: 'appraiser', theme: 'harbor'});
  command(room, 'host', 'ready', {ready: true});
  command(room, 'guest', 'ready', {ready: true});
  command(room, 'host', 'start');
  return room;
}
function fixture(room) {
  room.items = ids.map((id, index) => ({...E.catalogItems(3).find(item => item.catalogId === id), id: `lot-${index}`}));
  return room;
}
function won(role) {
  const room = fixture(open(role));
  command(room, 'host', 'bid', {amount: room.reservePrice, pass: false});
  command(room, 'guest', 'bid', {amount: null, pass: true});
  assert.equal(room.phase, 'dispose');
  return room;
}
const sell = slots => ({mode: 'special', repairSlots: [], pairSlots: [], abilitySlots: slots});

test('new rooms advertise current rules while old rooms keep their catalog across continued auctions', () => {
  assert.equal(R.viewFor(open('broker'), 'host').rulesVersion, 7);
  const legacy = open('appraiser', true);
  assert.equal(R.viewFor(legacy, 'host').rulesVersion, 2);
  const oldIds = new Set(E.catalogItems(2).map(item => item.catalogId));
  const first = structuredClone(legacy.items);
  assert.ok(first.every(item => oldIds.has(item.catalogId)));
  assert.throws(() => command(legacy, 'host', 'configure', {role: 'broker', theme: null}));
  // Complete an old table with the legacy sale payload, then continue it.
  command(legacy, 'host', 'bid', {amount: 1, pass: false});
  command(legacy, 'guest', 'bid', {amount: null, pass: true});
  command(legacy, 'host', 'sell', {mode: 'ordinary', repairSlots: [], pairSlots: []});
  command(legacy, 'host', 'ready', {ready: true});
  command(legacy, 'guest', 'ready', {ready: true});
  command(legacy, 'host', 'continue');
  assert.ok(legacy.items.every(item => oldIds.has(item.catalogId)));
  assert.equal(R.viewFor(legacy, 'host').rulesVersion, 2);
  assert.notDeepEqual(legacy.items, first);
  const lobby = R.createRoom({code: 'OLDQA', seed: 5, host: {id: 'host', name: 'Host', role: 'appraiser'}});
  delete lobby.rulesVersion;
  assert.throws(() => R.joinRoom(lobby, {id: 'other', name: 'Other', role: 'broker'}), /new room/);
  assert.throws(() => command(lobby, 'host', 'configure', {role: 'broker', theme: null}), /new room/);
});

test('all three new role selections settle exactly the shared plan and reject a second credit', () => {
  for (const role of Object.keys(targets)) {
    const room = won(role), slots = targets[role];
    const remainingCash = OPENING - room.reservePrice;
    const expected = E.salePlan(role, room.items, 'special', remainingCash, {abilityIds: slots.map(slot => room.items[slot].id)});
    assert.ok(expected.recovery > room.items.reduce((sum, item) => sum + item.base, 0));
    command(room, 'host', 'sell', sell(slots));
    assert.equal(room.phase, 'result');
    assert.equal(room.players[0].cash, remainingCash + expected.recovery);
    assert.equal(room.receipt.cost, expected.cost);
    assert.equal(room.receipt.bonus, expected.bonus);
    assert.deepEqual(room.receipt.ability, slots);
    assert.equal(room.ledger.length, 1);
    const before = structuredClone(room);
    assert.throws(() => command(room, 'host', 'sell', sell(slots)));
    assert.deepEqual(room, before);
  }
});

test('ability payloads reject foreign roles, duplicate slots, invalid combinations and partial ordinary processing atomically', () => {
  for (const [role, slots, mode] of [
    ['salvager', [0, 0], 'special'], ['salvager', [2], 'special'],
    ['curator', [2, 3], 'special'], ['curator', [0, 2, 3], 'special'],
    ['broker', [2, 3], 'special'], ['broker', [2], 'ordinary'],
    ['restorer', [0], 'special'], ['appraiser', [0], 'special'], ['collector', [0], 'special'],
  ]) {
    const room = won(role), before = structuredClone(room);
    assert.throws(() => command(room, 'host', 'sell', {...sell(slots), mode}));
    assert.deepEqual(room, before, `${role} invalid selection cannot change money or phase`);
  }
  const room = won('broker'), before = structuredClone(room);
  assert.throws(() => command(room, 'guest', 'sell', sell([2])), /winner/);
  assert.deepEqual(room, before);
});

test('expanded roles gain no private truth before hammer; old client payloads do not auto-process', () => {
  for (const role of Object.keys(targets)) {
    const room = fixture(open(role));
    const before = R.viewFor(room, 'host');
    for (const lot of before.lots) {
      assert.equal(lot.known, false);
      for (const key of ['id', 'catalogId', 'base', 'genuine', 'condition', 'category', 'theme', 'repair']) assert.equal(key in lot, false);
    }
    assert.equal(before.can.inspect, false);
    const privateBefore = structuredClone(room);
    assert.throws(() => command(room, 'host', 'inspect', {slot: 0}));
    assert.deepEqual(room, privateBefore);
    command(room, 'host', 'bid', {amount: room.reservePrice, pass: false});
    command(room, 'guest', 'bid', {amount: null, pass: true});
    const base = room.items.reduce((sum, item) => sum + item.base, 0);
    command(room, 'host', 'sell', {mode: 'special', repairSlots: [], pairSlots: []});
    assert.equal(room.receipt.recovery, base);
    assert.equal(room.receipt.cost, 0);
    assert.deepEqual(room.receipt.ability, []);
  }
  assert.equal(originalRoles.length + Object.keys(targets).length, Object.keys(E.ROLES).length);
});
