import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const R = require('../game/room-engine.cjs');
const command = (room, actor, type, fields = {}) => R.applyAction(room, actor, {type, turnId: room.turnId, ...fields});
function table() {
  const room = R.createRoom({code: 'MATCH5', seed: 515, host: {id: 'host', name: 'Host', role: 'restorer', theme: 'harbor'}});
  R.joinRoom(room, {id: 'guest', name: 'Guest', role: 'appraiser'});
  return room;
}
function start(room) {
  for (const id of ['host', 'guest']) command(room, id, 'ready', {ready: true});
  command(room, 'host', 'start');
}
function rejected(room, actor, type, fields, message) {
  const before = structuredClone(room);
  assert.throws(() => command(room, actor, type, fields), message);
  assert.deepEqual(room, before, `${type} rejection must be atomic`);
}
// The host buys every crate and sells at ordinary prices; the guest always passes.
function playCrate(room) {
  for (let steps = 0; !['result', 'ended'].includes(room.phase); steps++) {
    assert.ok(steps < 8, `crate did not settle: ${room.phase}`);
    if (room.phase === 'auction') {
      command(room, 'host', 'bid', {amount: 200, pass: false});
      command(room, 'guest', 'bid', {amount: null, pass: true});
    } else if (room.phase === 'round-summary') command(room, 'host', 'next');
    else if (room.phase === 'dispose') command(room, room.winnerId, 'sell', {mode: 'ordinary', repairSlots: [], pairSlots: []});
    else assert.fail(`unexpected phase ${room.phase}`);
  }
}

test('only the lobby host sets the match length, and other humans confirm it again', () => {
  const room = table();
  assert.equal(room.crateLimit, null);
  assert.equal(Object.hasOwn(R.viewFor(room, 'guest'), 'crateLimit'), false, 'free-play projections stay unchanged');
  command(room, 'guest', 'ready', {ready: true});
  command(room, 'host', 'ready', {ready: true});
  rejected(room, 'guest', 'match-length', {crates: 5}, /Only the host/);
  for (const crates of [3, '5', 0, undefined]) rejected(room, 'host', 'match-length', {crates}, /valid match length/);
  command(room, 'host', 'match-length', {crates: 5});
  assert.equal(R.viewFor(room, 'guest').crateLimit, 5);
  assert.equal(room.players.find(player => player.id === 'guest').ready, false, 'the guest readied for a different length');
  assert.equal(room.players.find(player => player.id === 'host').ready, true);
  const revision = room.revision;
  command(room, 'host', 'match-length', {crates: 5});
  assert.equal(room.revision, revision, 'repeating the same length is a no-op');
  command(room, 'host', 'match-length', {crates: null});
  assert.equal(room.crateLimit, null);
  command(room, 'host', 'match-length', {crates: 5});
  start(room);
  rejected(room, 'host', 'match-length', {crates: null}, /not available in this phase/);
});

test('a five-crate match ends with final standings after the fifth settled crate', () => {
  const room = table();
  command(room, 'host', 'match-length', {crates: 5});
  start(room);
  for (let crate = 1; crate <= 5; crate++) {
    assert.equal(room.auctionNumber, crate);
    playCrate(room);
    if (crate < 5) {
      assert.equal(room.phase, 'result');
      for (const id of ['host', 'guest']) command(room, id, 'ready', {ready: true});
      command(room, 'host', 'continue');
    }
  }
  assert.equal(room.phase, 'ended');
  assert.equal(room.endedReason, 'The five-crate match is complete.');
  assert.equal(room.ledger.length, 5);
  const view = R.viewFor(room, 'guest');
  assert.equal(view.crateLimit, 5);
  assert.ok(view.receipt, 'the last crate keeps its receipt on the final standings');
  assert.equal(view.can.continue, false);
  assert.equal(view.can.ready, false);
  assert.throws(() => command(room, 'host', 'continue'), /room has ended/);
});

test('free play and rooms saved before match lengths keep opening crates after the fifth', () => {
  for (const legacy of [false, true]) {
    const room = table();
    if (legacy) delete room.crateLimit;
    start(room);
    for (let crate = 1; crate <= 5; crate++) {
      playCrate(room);
      assert.equal(room.phase, 'result');
      for (const id of ['host', 'guest']) command(room, id, 'ready', {ready: true});
      command(room, 'host', 'continue');
    }
    assert.equal(room.auctionNumber, 6);
    assert.equal(room.phase, 'auction');
  }
});
