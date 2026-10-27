import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createRoomApi} from '../lib/room-api.mjs';
import {createSqliteD1} from './helpers/sqlite-d1.mjs';

const E = createRequire(import.meta.url)('../game/engine.cjs');
// Rooms created under the current rules start with this much cash.
const OPENING = E.startingCashFor(E.RULES_VERSION);
const SITE = 'https://stalled-room.test', START = Date.UTC(2026, 9, 26, 12);
const migration = await readFile(new URL('../drizzle/0000_natural_firebrand.sql', import.meta.url), 'utf8');
async function harness(t) {
  const db = createSqliteD1(':memory:');
  t.after(() => db.close());
  for (const sql of migration.split(/-->\s*statement-breakpoint/).filter(sql => sql.trim())) await db.prepare(sql).run();
  let now = START, sequence = 0, beforeUpdate = null;
  const database = {prepare(sql) {
    const statement = db.prepare(sql);
    if (!/UPDATE\s+auction_rooms\s+SET/i.test(sql)) return statement;
    return {...statement, bind(...values) {
      const bound = statement.bind(...values);
      return {...bound, async run() {
        if (beforeUpdate) await beforeUpdate(JSON.parse(values[1]));
        return bound.run();
      }};
    }};
  }};
  const h = {
    db, now:() => now, advance:ms => { now += ms; },
    async request(path, {method = 'GET', member, body, token = member?.token} = {}) {
      const response = await createRoomApi({db:database, clock:() => now})(new Request(SITE + path, {
        method, headers:{Origin:SITE, ...(body ? {'Content-Type':'application/json'} : {}), ...(token ? {Authorization:`Bearer ${token}`} : {})},
        ...(body ? {body:JSON.stringify(body)} : {}),
      }));
      return {status:response.status, body:await response.json()};
    },
    async create(name = 'Host') {
      const result = await h.request('/api/rooms', {method:'POST', body:{name, role:'appraiser', theme:'harbor'}});
      assert.equal(result.status, 201);
      return result.body;
    },
    async join(host, name = 'Guest') {
      const result = await h.request(`/api/rooms/${host.roomCode}/join`, {method:'POST', body:{name, role:'restorer', theme:'harbor'}});
      assert.equal(result.status, 201);
      return result.body;
    },
    async view(member) {
      const result = await h.request(`/api/rooms/${member.roomCode}`, {member});
      assert.equal(result.status, 200);
      return result.body.view;
    },
    action(member, command, requestId = `stalled-test-${++sequence}`) {
      return h.request(`/api/rooms/${member.roomCode}/actions`, {method:'POST', member, body:{requestId, command}});
    },
    async command(member, fields) {
      return h.action(member, {turnId:(await h.view(member)).turnId, ...fields});
    },
    async begin() {
      const host = await h.create(), guest = await h.join(host);
      for (const member of [host, guest]) assert.equal((await h.command(member, {type:'ready', ready:true})).status, 200);
      assert.equal((await h.command(host, {type:'start'})).status, 200);
      return {host, guest};
    },
    async buy(host, guest) {
      const view = await h.view(host);
      assert.equal((await h.action(host, {type:'bid', turnId:view.turnId, amount:view.reservePrice, pass:false})).status, 200);
      const result = await h.command(guest, {type:'bid', amount:null, pass:true});
      assert.equal(result.status, 200); assert.equal(result.body.view.phase, 'dispose');
      return result.body.view;
    },
    async record(code) {
      const row = await db.prepare('SELECT record_json FROM auction_rooms WHERE code = ?').bind(code).first();
      return JSON.parse(row.record_json);
    },
    async race(code, callbacks) {
      const before = db.stats.casConflicts, release = db.barrierRoomReads(code, callbacks.length), timer = setTimeout(release, 3000);
      try {
        const results = await Promise.all(callbacks.map(callback => callback()));
        assert.ok(db.stats.casConflicts > before, 'must exercise a real CAS retry');
        return results;
      } finally { clearTimeout(timer); release(); }
    },
    pauseCancellationWrite() {
      let reached, release;
      const blocked = new Promise(resolve => { reached = resolve; }), gate = new Promise(resolve => { release = resolve; });
      beforeUpdate = async record => {
        if (!record.state.cancelledCrate) return;
        beforeUpdate = null; reached(); await gate;
      };
      return {blocked, release};
    },
  };
  return h;
}
function noPrivateState(view, members) {
  const forbidden = new Set(['credentials', 'token', 'hash', 'lastSeen', 'traffic', 'requests', 'seed', 'cratePlayers']);
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) { assert.ok(!forbidden.has(key), key); visit(child); }
  };
  visit(view);
  const text = JSON.stringify(view);
  for (const member of members) assert.ok(!text.includes(member.token));
  for (const lot of view.lots) if (!lot.known) for (const key of ['catalogId', 'name', 'base', 'condition', 'genuine']) assert.equal(Object.hasOwn(lot, key), false);
}

test('recovery waits for the 15s offline threshold plus 120s, and elapsed time alone never bids or settles', async t => {
  const h = await harness(t), {host, guest} = await h.begin();
  h.advance(14999);
  let view = await h.view(host);
  assert.deepEqual(view.recovery, {availableAt:null, blockingPlayerIds:[]});
  h.advance(1);
  view = await h.view(host);
  assert.deepEqual(view.recovery, {availableAt:START + 135000, blockingPlayerIds:[guest.playerId]});
  assert.equal(view.can.endStalled, false);
  h.advance(119999);
  view = await h.view(host);
  assert.equal(view.can.endStalled, false);
  assert.equal((await h.action(host, {type:'end-stalled', turnId:view.turnId})).status, 409);
  h.advance(1);
  view = await h.view(host);
  assert.equal(view.can.endStalled, true);
  assert.equal(view.phase, 'auction');
  assert.ok(view.players.every(player => !player.submitted && player.cash === OPENING));
  assert.deepEqual(view.history, []);
  noPrivateState(view, [host, guest]);
  const cancelled = await h.action(host, {type:'end-stalled', turnId:view.turnId});
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.view.cancelledCrate, true);
  assert.equal(cancelled.body.view.cancelledRefund, 0);
  assert.deepEqual(cancelled.body.view.lots, []);
  assert.equal(cancelled.body.view.can.endStalled, false);
});

test('submitted, inactive and computer players are not offline auction blockers; a nonhost human can end a stalled room', async t => {
  const h = await harness(t), {host, guest} = await h.begin();
  await h.command(host, {type:'bid', amount:null, pass:true});
  h.advance(135000);
  let view = await h.view(guest);
  assert.equal(view.can.endStalled, false);
  assert.deepEqual(view.recovery.blockingPlayerIds, []);
  await h.command(host, {type:'withdraw'});
  h.advance(135000);
  view = await h.view(guest);
  assert.equal(view.can.endStalled, true);
  assert.deepEqual(view.recovery.blockingPlayerIds, [host.playerId]);
  assert.equal((await h.action(guest, {type:'end-stalled', turnId:view.turnId})).status, 200);

  const other = await h.create('Bot host');
  await h.command(other, {type:'add-bot', style:'steady'});
  await h.command(other, {type:'ready', ready:true});
  await h.command(other, {type:'start'});
  h.advance(135000);
  const bots = await h.view(other);
  assert.equal(bots.can.endStalled, false);
  assert.deepEqual(bots.recovery.blockingPlayerIds, []);
});

test('only the offline host blocks a round summary, and a reconnect immediately revokes eligibility', async t => {
  const h = await harness(t), {host, guest} = await h.begin();
  await h.command(host, {type:'bid', amount:null, pass:true});
  await h.command(guest, {type:'bid', amount:null, pass:true});
  h.advance(135000);
  const view = await h.view(guest);
  assert.equal(view.phase, 'round-summary');
  assert.equal(view.can.endStalled, true);
  assert.deepEqual(view.recovery.blockingPlayerIds, [host.playerId]);
  await h.view(host);
  const refused = await h.action(guest, {type:'end-stalled', turnId:view.turnId});
  assert.equal(refused.status, 409);
  assert.equal((await h.view(guest)).phase, 'round-summary');
});

test('same-ID and different-ID concurrent cancellations refund the current bid at most once', async t => {
  for (const sameId of [true, false]) {
    const h = await harness(t), {host, guest} = await h.begin();
    const purchased = await h.buy(host, guest), beforeCash = purchased.players.find(player => player.id === host.playerId).cash;
    h.advance(135000);
    const view = await h.view(guest), command = {type:'end-stalled', turnId:view.turnId};
    assert.equal(view.can.endStalled, true);
    const ids = sameId ? ['cancel-same-id', 'cancel-same-id'] : ['cancel-first-id', 'cancel-other-id'];
    const results = await h.race(host.roomCode, ids.map(id => () => h.action(guest, command, id)));
    assert.deepEqual(results.map(result => result.status).sort(), sameId ? [200, 200] : [200, 409]);
    const ended = await h.view(guest);
    assert.equal(ended.phase, 'ended');
    assert.equal(ended.cancelledRefund, purchased.winningBid);
    assert.equal(ended.players.find(player => player.id === host.playerId).cash, beforeCash + purchased.winningBid);
    assert.equal(ended.players.find(player => player.id === host.playerId).profit, 0);
    assert.deepEqual(ended.lots, []);
    assert.deepEqual(ended.ledger, []);
    noPrivateState(ended, [host, guest]);
    const successful = results.findIndex(result => result.status === 200);
    assert.equal((await h.action(guest, command, ids[successful])).status, 200, 'cached request remains idempotent after ending');
    assert.equal((await h.action(guest, command, 'cancel-stale-id')).status, 409);
  }
});

test('a required player reconnecting before cancellation commits forces CAS retry and revokes the stale authorization', async t => {
  const h = await harness(t), {host, guest} = await h.begin();
  h.advance(135000);
  const view = await h.view(host), pause = h.pauseCancellationWrite(), before = h.db.stats.casConflicts;
  const pending = h.action(host, {type:'end-stalled', turnId:view.turnId});
  const timeout = setTimeout(pause.release, 3000);
  try {
    await pause.blocked;
    const reconnected = await h.view(guest);
    assert.equal(reconnected.phase, 'auction');
    pause.release();
    assert.equal((await pending).status, 409);
    assert.ok(h.db.stats.casConflicts > before);
    const current = await h.view(host);
    assert.equal(current.phase, 'auction');
    assert.equal(current.can.endStalled, false);
    assert.ok(current.players.every(player => player.cash === OPENING));
    assert.equal(Object.hasOwn(current, 'cancelledCrate'), false);
  } finally { clearTimeout(timeout); pause.release(); }
});

test('settled results can end for an offline unready player or an offline all-ready host without cancelling settlement', async t => {
  for (const allReady of [false, true]) {
    const h = await harness(t), {host, guest} = await h.begin();
    await h.buy(host, guest);
    const sold = await h.command(host, {type:'sell', mode:'ordinary', repairSlots:[], pairSlots:[]});
    assert.equal(sold.status, 200);
    if (allReady) for (const member of [host, guest]) await h.command(member, {type:'ready', ready:true});
    const actor = allReady ? guest : host, blocking = allReady ? host : guest;
    h.advance(135000);
    const view = await h.view(actor);
    assert.equal(view.can.endStalled, true);
    assert.deepEqual(view.recovery.blockingPlayerIds, [blocking.playerId]);
    const ended = await h.action(actor, {type:'end-stalled', turnId:view.turnId});
    assert.equal(ended.status, 200);
    assert.equal(ended.body.view.phase, 'ended');
    for (const key of ['lots', 'ledger', 'receipt', 'valuation', 'players']) assert.deepEqual(ended.body.view[key], view[key]);
    assert.equal(Object.hasOwn(ended.body.view, 'cancelledCrate'), false);
    assert.equal(Object.hasOwn(ended.body.view, 'cancelledRefund'), false);
  }
});

test('a stalled result racing the returning host continuation cannot cancel the new crate with the old turn', async t => {
  const h = await harness(t), {host, guest} = await h.begin();
  await h.buy(host, guest);
  await h.command(host, {type:'sell', mode:'ordinary', repairSlots:[], pairSlots:[]});
  for (const member of [host, guest]) await h.command(member, {type:'ready', ready:true});
  h.advance(135000);
  const before = await h.view(guest);
  assert.equal(before.can.endStalled, true);
  const results = await h.race(host.roomCode, [
    () => h.action(guest, {type:'end-stalled', turnId:before.turnId}),
    () => h.action(host, {type:'continue', turnId:before.turnId}),
  ]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  const current = await h.view(guest);
  assert.ok(['ended', 'auction'].includes(current.phase));
  assert.deepEqual(current.ledger, before.ledger);
  assert.deepEqual(current.players.map(player => [player.cash, player.profit]), before.players.map(player => [player.cash, player.profit]));
  assert.equal(Object.hasOwn(current, 'cancelledCrate'), false);
  assert.equal(Object.hasOwn(current, 'cancelledRefund'), false);
  assert.equal(current.auctionNumber, current.phase === 'auction' ? 2 : 1);
  if (current.phase === 'auction') assert.ok(current.lots.every(lot => !lot.known));
});

test('clients cannot forge eligibility or end with invalid credentials, a stale turn, or a lobby action', async t => {
  const h = await harness(t), host = await h.create(), guest = await h.join(host);
  h.advance(135000);
  let view = await h.view(guest);
  assert.equal(view.can.endStalled, false);
  assert.equal((await h.action(guest, {type:'end-stalled', turnId:view.turnId})).status, 409);
  for (const member of [host, guest]) await h.command(member, {type:'ready', ready:true});
  await h.command(host, {type:'start'});
  view = await h.view(guest);
  for (const extra of [{eligible:true}, {canEndStalled:true}, {recovery:{availableAt:0}}]) {
    assert.equal((await h.action(guest, {type:'end-stalled', turnId:view.turnId, ...extra})).status, 409);
  }
  assert.equal((await h.request(`/api/rooms/${host.roomCode}/actions`, {method:'POST', token:'a'.repeat(43), body:{requestId:'unauthorized-cancel', command:{type:'end-stalled', turnId:view.turnId}}})).status, 401);
  h.advance(135000);
  assert.equal((await h.action(guest, {type:'end-stalled', turnId:'stale-turn'})).status, 409);
  const current = await h.view(guest);
  assert.equal(current.phase, 'auction');
  assert.ok(current.players.every(player => player.cash === OPENING));
});
