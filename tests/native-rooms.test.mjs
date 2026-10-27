import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import { createRoomApi } from '../lib/room-api.mjs';
import { createSqliteD1 } from './helpers/sqlite-d1.mjs';

const SITE = 'https://second-value.test.chatgpt.site';
const hostProfile = { name: 'Private Appraiser', role: 'appraiser', theme: 'harbor' };
const guestProfile = { name: 'Workshop Guest', role: 'restorer', theme: 'railway' };
const migration = await readFile(new URL('../drizzle/0000_natural_firebrand.sql', import.meta.url), 'utf8');
const E = createRequire(import.meta.url)('../game/engine.cjs');
let sequence = 0;
const requestId = () => `native-room-request-${++sequence}`;

async function openDatabase(directory) {
  if (process.env.NATIVE_TEST_D1 === 'miniflare') {
    const { Miniflare } = await import('miniflare');
    const runtime = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("D1 test fixture"); } };',
      compatibilityDate: '2026-05-15', cf: false, inspectorPort: 0,
      d1Databases: { DB: 'native-room-test' }, d1Persist: path.join(directory, 'd1'),
    });
    return { db: await runtime.getD1Database('DB'), close: () => runtime.dispose() };
  }
  const db = createSqliteD1(path.join(directory, 'rooms.sqlite'));
  return { db, close: () => db.close() };
}

async function harness(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'second-value-native-test-'));
  let opened = await openDatabase(directory);
  let now = Date.UTC(2026, 9, 19, 12);
  for (const sql of migration.split(/-->\s*statement-breakpoint/).filter(sql => sql.trim())) await opened.db.prepare(sql).run();
  t.after(async () => { await opened.close(); await rm(directory, { recursive: true, force: true }); });
  const api = {
    get db() { return opened.db; },
    advance(milliseconds) { now += milliseconds; },
    async reopen() { await opened.close(); opened = await openDatabase(directory); },
    async request(endpoint, { method = 'GET', body, raw, member, token = member?.token, origin = SITE, headers = {} } = {}) {
      const request = new Request(SITE + endpoint, {
        method,
        headers: {
          ...(origin === null ? {} : { Origin: origin }),
          ...(body !== undefined || raw !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : raw !== undefined ? { body: raw } : {}),
      });
      // Every request gets a fresh handler, as separate Worker isolates would.
      const response = await createRoomApi({ db: opened.db, clock: () => now })(request);
      assert.match(response.headers.get('content-type'), /application\/json/);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      return { status: response.status, headers: response.headers, body: await response.json() };
    },
    async create(profile = hostProfile) {
      const result = await api.request('/api/rooms', { method: 'POST', body: profile });
      assert.equal(result.status, 201, JSON.stringify(result.body));
      assert.match(result.body.token, /^[A-Za-z0-9_-]{43}$/);
      return result.body;
    },
    async join(host, profile = guestProfile) {
      const result = await api.request(`/api/rooms/${host.roomCode}/join`, { method: 'POST', body: profile });
      assert.equal(result.status, 201, JSON.stringify(result.body));
      return result.body;
    },
    async view(member) {
      const result = await api.request(`/api/rooms/${member.roomCode}`, { member });
      assert.equal(result.status, 200, JSON.stringify(result.body));
      return result.body.view;
    },
    action(member, command, id = requestId()) {
      return api.request(`/api/rooms/${member.roomCode}/actions`, {
        method: 'POST', member, body: { requestId: id, command },
      });
    },
    async command(member, fields, id) {
      const current = await api.view(member);
      return api.action(member, { turnId: current.turnId, ...fields }, id);
    },
    async begin(players = 2) {
      const host = await api.create();
      const members = [host];
      for (let index = 1; index < players; index++) members.push(await api.join(host, { ...guestProfile, name: `Guest ${index}` }));
      for (const member of members) assert.equal((await api.command(member, { type: 'ready', ready: true })).status, 200);
      assert.equal((await api.command(host, { type: 'start' })).status, 200);
      return members;
    },
    async race(code, callbacks) {
      const before = opened.db.stats?.casConflicts;
      const release = opened.db.barrierRoomReads?.(code, callbacks.length);
      // A broken handler must fail instead of leaving the test runner hung.
      const timer = release ? setTimeout(release, 3000) : null;
      try {
        const results = await Promise.all(callbacks.map(callback => callback()));
        if (before !== undefined) assert.ok(opened.db.stats.casConflicts > before, 'The test must force an actual stale SQLite CAS, rather than accidentally serialize both reads.');
        return results;
      } finally { if (timer) clearTimeout(timer); release?.(); }
    },
  };
  return api;
}

function englishError(result, status) {
  assert.equal(result.status, status, JSON.stringify(result.body));
  assert.equal(typeof result.body.error, 'string');
  assert.match(result.body.error, /[A-Za-z]/);
  assert.doesNotMatch(result.body.error, /[\u3400-\u9fff]/);
}

function noSecrets(view, credentials = []) {
  const forbidden = new Set(['seed', 'token', 'tokens', 'hash', 'credentials', 'record_json', 'requests', 'requestIds', 'bidsByPlayer', 'serverState', 'cratePlayers', 'lastSeen', 'traffic']);
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      assert.ok(!forbidden.has(key), `Server field ${key} must never cross the HTTP boundary.`);
      visit(child);
    }
  };
  visit(view);
  const serialized = JSON.stringify(view);
  for (const member of credentials) assert.ok(!serialized.includes(member.token));
  for (const lot of view.lots) if (!lot.known) {
    for (const key of ['catalogId', 'name', 'base', 'genuine', 'condition', 'category', 'theme', 'repair']) assert.equal(key in lot, false);
  }
}

test('computer seats persist without credentials, expose no sealed quote and stay out of offline recovery', async t => {
  const api = await harness(t), host = await api.create(), guest = await api.join(host);
  englishError(await api.command(guest, {type: 'add-bot', style: 'bold'}), 409);
  assert.equal((await api.command(host, {type: 'add-bot', style: 'steady'})).status, 200);
  let view = await api.view(host), computer = view.players.find(player => player.isBot);
  assert.ok(computer && computer.ready && computer.connected);
  assert.equal(computer.botStyle, 'steady');
  let stored = await api.db.prepare('SELECT record_json FROM auction_rooms WHERE code = ?').bind(host.roomCode).first();
  let record = JSON.parse(stored.record_json);
  assert.deepEqual(Object.keys(record.credentials).sort(), [host.playerId, guest.playerId].sort());
  englishError(await api.request(`/api/rooms/${host.roomCode}`, {token: 'a'.repeat(43)}), 401);
  for (const member of [host, guest]) assert.equal((await api.command(member, {type: 'ready', ready: true})).status, 200);
  assert.equal((await api.command(host, {type: 'start'})).status, 200);
  view = await api.view(host);
  assert.equal(view.phase, 'auction');
  assert.equal(view.players.find(player => player.id === computer.id).submitted, true);
  assert.equal(view.self.bid, null);
  assert.ok(view.players.every(player => !('bid' in player) && !('amount' in player) && !('inspected' in player)));
  noSecrets(view, [host, guest]);
  await api.reopen();
  assert.deepEqual(await api.view(host), view);
  api.advance(16000);
  const recovered = await api.view(host);
  assert.equal(recovered.players.find(player => player.id === computer.id).connected, true);
  assert.equal(recovered.players.find(player => player.id === computer.id).offlineSince, null);
  assert.equal(recovered.players.find(player => player.id === guest.playerId).connected, false);
  stored = await api.db.prepare('SELECT record_json FROM auction_rooms WHERE code = ?').bind(host.roomCode).first();
  record = JSON.parse(stored.record_json);
  assert.deepEqual(Object.keys(record.credentials).sort(), [host.playerId, guest.playerId].sort());
});

test('concurrent computer additions respect four-seat capacity and request replays cannot re-add removed seats', async t => {
  const api = await harness(t), host = await api.create();
  await api.command(host, {type: 'add-bot', style: 'steady'});
  await api.command(host, {type: 'add-bot', style: 'patient'});
  const turnId = (await api.view(host)).turnId, id = requestId(), otherId = requestId();
  const command = {type: 'add-bot', style: 'bold', turnId};
  const results = await api.race(host.roomCode, [() => api.action(host, command, id), () => api.action(host, command, otherId)]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  let view = await api.view(host);
  assert.equal(view.players.filter(player => player.active).length, 4);
  const computer = view.players.find(player => player.isBot && player.botStyle === 'bold');
  assert.ok(computer);
  const replayId = results[0].status === 200 ? id : otherId;
  assert.equal((await api.command(host, {type: 'remove-bot', playerId: computer.id})).status, 200);
  const afterRemoval = await api.view(host);
  assert.equal((await api.action(host, command, replayId)).status, 200);
  assert.deepEqual(await api.view(host), afterRemoval);
  const sameId = requestId(), sameCommand = {type: 'add-bot', style: 'steady', turnId: (await api.view(host)).turnId};
  const same = await api.race(host.roomCode, [() => api.action(host, sameCommand, sameId), () => api.action(host, sameCommand, sameId)]);
  assert.deepEqual(same.map(result => result.status), [200, 200]);
  assert.equal((await api.view(host)).players.filter(player => player.active).length, 4);
});

test('a bot-winning final human submission races safely, sells once and restores its receipt after restart', async t => {
  const api = await harness(t), host = await api.create();
  assert.equal((await api.command(host, {type: 'add-bot', style: 'bold'})).status, 200);
  await api.command(host, {type: 'ready', ready: true});
  await api.command(host, {type: 'start'});
  const before = await api.view(host), computer = before.players.find(player => player.isBot);
  // Fix only the computer's sealed quote to make the CAS accounting fixture deterministic.
  const stored = await api.db.prepare('SELECT record_json FROM auction_rooms WHERE code = ?').bind(host.roomCode).first();
  const record = JSON.parse(stored.record_json), bidder = record.state.players.find(player => player.id === computer.id);
  const amount = Math.max(200, before.reservePrice);
  bidder.bid = {amount, pass: false};
  await api.db.prepare('UPDATE auction_rooms SET record_json = ? WHERE code = ?').bind(JSON.stringify(record), host.roomCode).run();
  const id = requestId(), command = {type: 'bid', amount: null, pass: true, turnId: before.turnId};
  const results = await api.race(host.roomCode, [() => api.action(host, command, id), () => api.action(host, command, id)]);
  assert.deepEqual(results.map(result => result.status), [200, 200]);
  const settled = await api.view(host), winner = settled.players.find(player => player.id === computer.id);
  assert.equal(settled.phase, 'result');
  assert.equal(settled.winnerId, computer.id);
  assert.equal(settled.history.length, 1);
  assert.equal(settled.ledger.length, 1);
  assert.equal(settled.self.cash, 1000);
  const plan = E.salePlan(computer.role, settled.lots, 'special', 1000 - amount, {theme: computer.theme});
  assert.equal(settled.receipt.recovery, plan.recovery);
  assert.equal(settled.receipt.cost, plan.cost);
  assert.equal(winner.cash, 1000 - amount + plan.recovery);
  assert.equal(winner.ready, true);
  noSecrets(settled, [host]);
  await api.reopen();
  assert.deepEqual(await api.view(host), settled);
  assert.equal((await api.action(host, command, id)).status, 200);
  assert.deepEqual(await api.view(host), settled);
  englishError(await api.action(host, command), 409);
  await api.command(host, {type: 'ready', ready: true});
  assert.equal((await api.command(host, {type: 'continue'})).status, 200);
  const next = await api.view(host);
  assert.equal(next.auctionNumber, 2);
  assert.equal(next.players.find(player => player.id === computer.id).cash, winner.cash);
  assert.equal(next.players.find(player => player.id === computer.id).submitted, true);
  assert.equal(next.ledger.length, 1);
});

test('new role choices and fees survive a simultaneous D1 sale replay without leaking candidate targets', async t => {
  const api = await harness(t);
  const catalogIds = ['map-print', 'replica-camera', 'studio-camera', 'star-chart', 'travel-radio', 'crew-badge'];
  const selections = {salvager: [0, 1], curator: [2, 3, 4], broker: [2]};
  for (const [role, slots] of Object.entries(selections)) {
    const host = await api.create({name: 'Role QA', role});
    const guest = await api.join(host);
    for (const member of [host, guest]) assert.equal((await api.command(member, {type: 'ready', ready: true})).status, 200);
    assert.equal((await api.command(host, {type: 'start'})).status, 200);
    // Deterministic sale fixture; hidden identities still cross only viewFor().
    const stored = await api.db.prepare('SELECT record_json FROM auction_rooms WHERE code = ?').bind(host.roomCode).first();
    const record = JSON.parse(stored.record_json);
    record.state.items = catalogIds.map((catalogId, slot) => ({...E.catalogItems(3).find(item => item.catalogId === catalogId), id: `lot-${slot}`}));
    await api.db.prepare('UPDATE auction_rooms SET record_json = ? WHERE code = ?').bind(JSON.stringify(record), host.roomCode).run();
    noSecrets(await api.view(host), [host, guest]);
    await api.command(host, {type: 'bid', amount: (await api.view(host)).reservePrice, pass: false});
    await api.command(guest, {type: 'bid', amount: null, pass: true});
    const opened = await api.view(host);
    assert.equal(opened.rulesVersion, 6);
    const remainingCash = 1000 - opened.winningBid;
    const expected = E.salePlan(role, opened.lots, 'special', remainingCash, {abilityIds: slots.map(slot => opened.lots[slot].id)});
    const saleCommand = {type: 'sell', turnId: opened.turnId, mode: 'special', repairSlots: [], pairSlots: [], abilitySlots: slots};
    const id = requestId();
    const results = await api.race(host.roomCode, [() => api.action(host, saleCommand, id), () => api.action(host, saleCommand, id)]);
    assert.deepEqual(results.map(result => result.status), [200, 200]);
    await api.reopen();
    const after = await api.view(host);
    assert.equal(after.phase, 'result');
    assert.equal(after.self.cash, remainingCash + expected.recovery);
    assert.equal(after.receipt.cost, expected.cost);
    assert.equal(after.receipt.bonus, expected.bonus);
    assert.deepEqual(after.receipt.ability, slots);
    assert.equal(after.ledger.length, 1);
    englishError(await api.action(host, saleCommand), 409);
    assert.equal((await api.view(host)).self.cash, after.self.cash);
    assert.equal((await api.view(guest)).self.cash, 1000);
  }
});

test('D1 keeps a public fixed reserve across restarts and rejects low bids without mutation', async t => {
  const api = await harness(t);
  const [host, guest] = await api.begin();
  const before = await api.view(host), reserve = before.reservePrice;
  assert.ok(Number.isSafeInteger(reserve) && reserve > 1);
  assert.equal((await api.view(guest)).reservePrice, reserve);
  noSecrets(before, [host, guest]);
  englishError(await api.command(host, {type: 'bid', amount: reserve - 1, pass: false}), 409);
  assert.deepEqual(await api.view(host), before);
  await api.reopen();
  assert.deepEqual(await api.view(host), before);
  for (let round = 1; round <= 3; round++) {
    assert.equal((await api.view(host)).reservePrice, reserve);
    for (const member of [host, guest]) assert.equal((await api.command(member, {type: 'bid', amount: null, pass: true})).status, 200);
    if (round < 3) await api.command(host, {type: 'next'});
    await api.reopen();
  }
  const unsold = await api.view(host);
  assert.equal(unsold.phase, 'result');
  assert.equal(unsold.winnerId, null);
  assert.equal(unsold.ledger[0].paid, 0);
  assert.ok(unsold.players.every(player => player.cash === 1000));
});

test('source and actual/hypothetical valuations persist in D1 and stay private until settlement', async t => {
  const api = await harness(t);
  const [host, guest] = await api.begin();
  const started = await api.view(host);
  assert.ok(Object.hasOwn(E.SOURCES, started.sourceId));
  assert.equal(Object.hasOwn(started, 'valuation'), false);
  assert.equal((await api.view(guest)).sourceId, started.sourceId);
  await api.command(host, {type: 'bid', amount: started.reservePrice, pass: false});
  await api.command(guest, {type: 'bid', amount: null, pass: true});
  const opened = await api.view(host);
  assert.equal(opened.phase, 'dispose');
  assert.equal(Object.hasOwn(opened, 'valuation'), false);
  await api.command(host, {type: 'sell', mode: 'ordinary', repairSlots: [], pairSlots: []});
  const settled = await api.view(host);
  noSecrets(settled, [host, guest]);
  const actual = settled.valuation.rows.find(row => row.actual);
  assert.equal(actual.id, host.playerId);
  assert.equal(actual.recovery, settled.receipt.recovery);
  assert.equal(actual.profit, settled.receipt.profit);
  assert.equal(actual.cashBefore, 1000);
  assert.equal(settled.valuation.rows.filter(row => row.actual).length, 1);
  assert.equal(settled.sourceId, started.sourceId);
  const balances = settled.players.map(player => player.cash);
  await api.reopen();
  assert.deepEqual((await api.view(host)).valuation, settled.valuation);
  assert.deepEqual((await api.view(guest)).players.map(player => player.cash), balances);
  for (const member of [host, guest]) await api.command(member, {type: 'ready', ready: true});
  await api.command(host, {type: 'continue'});
  const next = await api.view(host);
  assert.equal(next.auctionNumber, 2);
  assert.equal(Object.hasOwn(next, 'valuation'), false);
  assert.ok(Object.hasOwn(E.SOURCES, next.sourceId));
  noSecrets(next, [host, guest]);
});

test('native D1 persists credentials, private notes and a sealed bid across completely reopened handlers', async t => {
  const api = await harness(t);
  const [host, guest] = await api.begin();
  assert.equal((await api.command(host, { type: 'inspect', slot: 2 })).status, 200);
  assert.equal((await api.command(host, { type: 'bid', amount: 347, pass: false })).status, 200);
  const before = await api.view(host);
  assert.equal(before.self.inspectionsLeft, 1);
  assert.equal(before.lots[2].known, true);
  assert.equal(before.self.bid.amount, 347);
  const persisted = await api.db.prepare('SELECT record_json FROM auction_rooms WHERE code = ?').bind(host.roomCode).first();
  assert.ok(!persisted.record_json.includes(host.token) && !persisted.record_json.includes(guest.token), 'Only hashes of bearer credentials may be persisted.');

  await api.reopen();
  assert.deepEqual(await api.view(host), before, 'A fresh process/database connection must restore the same room.');
  const other = await api.view(guest);
  assert.equal(other.lots[2].known, false);
  assert.equal(other.self.bid, null);
  assert.equal(other.players.find(player => player.id === host.playerId).submitted, true);
  assert.ok(other.players.every(player => !('bid' in player) && !('amount' in player)));
  assert.ok(!JSON.stringify(other).includes('"amount":347'));
  noSecrets(before, [host, guest]); noSecrets(other, [host, guest]);
  const unrelated = await api.create(guestProfile);
  for (const options of [{}, { token: 'a'.repeat(43) }, { member: unrelated }]) englishError(await api.request(`/api/rooms/${host.roomCode}`, options), 401);
});

test('two simultaneous final bids survive a stale D1 CAS and reveal/debit exactly once', async t => {
  const api = await harness(t);
  const [host, guest, third, fourth] = await api.begin(4);
  for (const member of [host, guest]) assert.equal((await api.command(member, { type: 'bid', amount: null, pass: true })).status, 200);
  const turnId = (await api.view(host)).turnId;
  const results = await api.race(host.roomCode, [
    () => api.action(third, { type: 'bid', amount: 500, pass: false, turnId }),
    () => api.action(fourth, { type: 'bid', amount: null, pass: true, turnId }),
  ]);
  assert.deepEqual(results.map(result => result.status), [200, 200]);
  const view = await api.view(third);
  assert.equal(view.phase, 'dispose');
  assert.equal(view.winnerId, third.playerId);
  assert.equal(view.winningBid, 500);
  assert.equal(view.history.length, 1);
  assert.equal(view.history[0].bids.length, 4);
  assert.equal(view.self.cash, 500);
  assert.equal(view.ledger.length, 0);
  assert.equal(view.players.filter(player => player.id !== third.playerId).every(player => player.cash === 1000), true);
});

test('same-ID concurrent sell and a lost sale response credit one receipt and ledger across restart', async t => {
  const api = await harness(t);
  const [host, guest] = await api.begin();
  await api.command(host, { type: 'bid', amount: (await api.view(host)).reservePrice, pass: false });
  await api.command(guest, { type: 'bid', amount: null, pass: true });
  const opened = await api.view(host);
  const expectedCash = 1000 - opened.winningBid + opened.lots.reduce((sum, lot) => sum + lot.base, 0);
  const command = { type: 'sell', turnId: opened.turnId, mode: 'ordinary', repairSlots: [], pairSlots: [] };
  const id = requestId();
  const results = await api.race(host.roomCode, [() => api.action(host, command, id), () => api.action(host, command, id)]);
  assert.deepEqual(results.map(result => result.status), [200, 200]);
  // Ignore both mutation responses, as a device with a lost reply would do.
  await api.reopen();
  const recovered = await api.view(host);
  assert.equal(recovered.phase, 'result');
  assert.equal(recovered.self.cash, expectedCash);
  assert.equal(recovered.ledger.length, 1);
  const replay = await api.action(host, command, id);
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.body.view, recovered);
  assert.equal((await api.view(guest)).self.cash, 1000);
  englishError(await api.action(host, command), 409);
  assert.equal((await api.view(host)).self.cash, expectedCash);
  assert.equal((await api.view(host)).ledger.length, 1);
});

test('two different concurrent sell IDs still settle a crate only once', async t => {
  const api = await harness(t);
  const [host, guest] = await api.begin();
  await api.command(host, { type: 'bid', amount: 200, pass: false });
  await api.command(guest, { type: 'bid', amount: null, pass: true });
  const opened = await api.view(host);
  const expectedCash = 800 + opened.lots.reduce((sum, lot) => sum + lot.base, 0);
  const command = { type: 'sell', turnId: opened.turnId, mode: 'ordinary', repairSlots: [], pairSlots: [] };
  const results = await api.race(host.roomCode, [() => api.action(host, command), () => api.action(host, command)]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  const view = await api.view(host);
  assert.equal(view.self.cash, expectedCash);
  assert.equal(view.ledger.length, 1);
});

test('duplicate withdrawal is idempotent and its old replay cannot erase a later bid', async t => {
  const api = await harness(t);
  const [host] = await api.begin();
  await api.command(host, { type: 'bid', amount: 500, pass: false });
  const current = await api.view(host);
  const withdrawal = { type: 'withdraw', turnId: current.turnId }, id = requestId();
  const results = await api.race(host.roomCode, [() => api.action(host, withdrawal, id), () => api.action(host, withdrawal, id)]);
  assert.deepEqual(results.map(result => result.status), [200, 200]);
  assert.equal((await api.view(host)).self.bid, null);
  await api.command(host, { type: 'bid', amount: 600, pass: false });
  await api.reopen();
  const beforeReplay = await api.view(host);
  assert.equal((await api.action(host, withdrawal, id)).status, 200);
  assert.deepEqual(await api.view(host), beforeReplay);
  assert.equal(beforeReplay.self.bid.amount, 600);
  englishError(await api.action(host, { ...withdrawal, type: 'inspect', slot: 0 }, id), 409);
  assert.deepEqual(await api.view(host), beforeReplay);
});

test('a final bid racing withdrawal has a valid serial outcome without lost money or commitments', async t => {
  const api = await harness(t);
  const [host, guest] = await api.begin();
  await api.command(host, { type: 'bid', amount: 500, pass: false });
  const turnId = (await api.view(host)).turnId;
  const [withdrawn, lastBid] = await api.race(host.roomCode, [
    () => api.action(host, { type: 'withdraw', turnId }),
    () => api.action(guest, { type: 'bid', amount: null, pass: true, turnId }),
  ]);
  assert.equal(lastBid.status, 200);
  const view = await api.view(host), guestView = await api.view(guest);
  assert.equal(view.ledger.length, 0);
  if (withdrawn.status === 200) {
    assert.equal(view.phase, 'auction');
    assert.equal(view.self.bid, null);
    assert.equal(view.history.length, 0);
    assert.equal(view.self.cash, 1000);
    assert.equal(guestView.self.bid.pass, true);
  } else {
    englishError(withdrawn, 409);
    assert.equal(view.phase, 'dispose');
    assert.equal(view.history.length, 1);
    assert.equal(view.self.cash, 500);
    assert.equal(view.winnerId, host.playerId);
  }
});

test('parallel last-seat joins cannot exceed the four-player limit', async t => {
  const api = await harness(t);
  const host = await api.create();
  await api.join(host); await api.join(host, { ...guestProfile, name: 'Third seat' });
  const results = await api.race(host.roomCode, ['Guest A', 'Guest B'].map(name => () => api.request(`/api/rooms/${host.roomCode}/join`, {
    method: 'POST', body: { ...guestProfile, name },
  })));
  assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
  assert.equal((await api.view(host)).players.length, 4);
  const joined = results.find(result => result.status === 201).body;
  assert.equal((await api.view(joined)).self.id, joined.playerId);
});

test('stale commands and reused IDs cannot change a later phase; continuing preserves balances', async t => {
  const api = await harness(t);
  const [host, guest] = await api.begin();
  const oldTurn = (await api.view(host)).turnId;
  const inspected = { type: 'inspect', slot: 0, turnId: oldTurn }, id = requestId();
  await api.action(host, inspected, id);
  await api.command(host, { type: 'bid', amount: (await api.view(host)).reservePrice, pass: false });
  await api.command(guest, { type: 'bid', amount: null, pass: true });
  const opened = await api.view(host);
  englishError(await api.action(host, { type: 'withdraw', turnId: oldTurn }), 409);
  const replay = await api.action(host, inspected, id);
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.body.view, opened);
  await api.command(host, { type: 'sell', mode: 'ordinary', repairSlots: [], pairSlots: [] });
  const settled = await api.view(host);
  for (const member of [host, guest]) await api.command(member, { type: 'ready', ready: true });
  await api.command(host, { type: 'continue' });
  await api.reopen();
  const next = await api.view(host);
  assert.equal(next.auctionNumber, 2);
  assert.equal(next.self.cash, settled.self.cash);
  assert.equal(next.ledger.length, 1);
  assert.equal(next.self.inspectionsLeft, 2);
  assert.equal(next.self.bid, null);
  assert.equal(next.lots.every(lot => !lot.known), true);
  noSecrets(next, [host, guest]);
});

test('lobby departure revokes its persisted credential and transfers the host', async t => {
  const api = await harness(t);
  const host = await api.create(), guest = await api.join(host);
  const left = await api.command(host, { type: 'leave' });
  assert.equal(left.status, 200);
  assert.deepEqual(left.body, { left: true, view: null });
  await api.reopen();
  englishError(await api.request(`/api/rooms/${host.roomCode}`, { member: host }), 401);
  const remaining = await api.view(guest);
  assert.equal(remaining.hostId, guest.playerId);
  assert.equal(remaining.players.length, 1);
});

test('native API validation, same-origin checks and English errors leave game state unchanged', async t => {
  const api = await harness(t);
  const host = await api.create({ ...hostProfile, name: '😀'.repeat(13) });
  const before = await api.view(host);
  assert.equal(before.players[0].name, '😀'.repeat(13));
  for (const origin of ['https://unrelated.example', 'null', SITE + '/private', 'https://name:pass@second-value.test.chatgpt.site']) {
    englishError(await api.request(`/api/rooms/${host.roomCode}`, { member: host, origin }), 403);
  }
  englishError(await api.request('/api/health', { origin: null, headers: { 'Sec-Fetch-Site': 'cross-site' } }), 403);
  englishError(await api.request('/api/rooms', { method: 'POST', raw: '{broken' }), 400);
  englishError(await api.request('/api/rooms', { method: 'POST', body: { ...hostProfile, role: 'invented-role' } }), 400);
  englishError(await api.request('/api/rooms', { method: 'POST', body: { ...hostProfile, name: '😀'.repeat(21) } }), 400);
  englishError(await api.request('/api/rooms', { method: 'POST', body: hostProfile, headers: { 'Content-Type': 'text/plain' } }), 415);
  englishError(await api.request('/api/rooms', { method: 'POST', body: { ...hostProfile, padding: 'x'.repeat(9000) }, headers: { 'Content-Length': '1' } }), 413);
  englishError(await api.action(host, { type: 'ready', turnId: before.turnId, ready: true }, 'short'), 400);
  englishError(await api.action(host, { type: 'ready', turnId: before.turnId, ready: true, cash: 9999 }), 409);
  assert.deepEqual(await api.view(host), before);
  const unsupported = await api.request(`/api/rooms/${host.roomCode}`, { method: 'POST', member: host });
  englishError(unsupported, 405);
  assert.equal(unsupported.headers.get('allow'), 'GET');
});

test('D1 presence crosses its exact threshold, survives reopening, and reconnects without changing gameplay', async t => {
  const api = await harness(t);
  const [host, guest] = await api.begin();
  const first = await api.view(host), start = first.serverNow;
  const readRecord = async () => JSON.parse((await api.db.prepare('SELECT record_json FROM auction_rooms WHERE code = ?').bind(host.roomCode).first()).record_json);
  const before = await readRecord();
  const initialRequests = Object.fromEntries(Object.entries(before.credentials).map(([id, seat]) => [id, seat.requests]));
  assert.equal(Number.isFinite(start), true);
  assert.ok(first.players.every(player => player.connected && player.offlineSince === null));
  api.advance(14999);
  let snapshot = await api.view(host);
  assert.equal(snapshot.players.find(player => player.id === guest.playerId).connected, true);
  assert.equal(snapshot.players.find(player => player.id === guest.playerId).offlineSince, null);
  api.advance(1);
  snapshot = await api.view(host);
  const offline = snapshot.players.find(player => player.id === guest.playerId);
  assert.equal(offline.connected, false);
  assert.equal(offline.offlineSince, start + 15000);
  assert.equal(snapshot.serverNow, start + 15000);
  assert.equal(snapshot.revision, first.revision);
  assert.equal(snapshot.turnId, first.turnId);
  assert.ok(snapshot.players.every(player => player.cash === 1000 && !player.submitted));
  const offlineRevision = snapshot.presenceRevision;
  await api.reopen();
  api.advance(10000);
  snapshot = await api.view(host);
  assert.equal(snapshot.players.find(player => player.id === guest.playerId).offlineSince, start + 15000);
  assert.equal(snapshot.presenceRevision, offlineRevision, 'Elapsed time must not fabricate presence transitions.');
  noSecrets(snapshot, [host, guest]);
  const afterPresence = await readRecord();
  assert.deepEqual(afterPresence.state, before.state, 'Presence polling cannot submit bids, change balances, or advance phases.');
  assert.deepEqual(Object.fromEntries(Object.entries(afterPresence.credentials).map(([id, seat]) => [id, seat.requests])), initialRequests);
  assert.ok(afterPresence.state.players.every(player => !Object.hasOwn(player, 'offlineSince')));
  assert.equal(Object.hasOwn(afterPresence, 'serverNow'), false, 'Clock metadata is projection-only; no record migration is required.');
  const returned = await api.view(guest);
  assert.equal(returned.players.find(player => player.id === guest.playerId).connected, true);
  assert.equal(returned.players.find(player => player.id === guest.playerId).offlineSince, null);
  assert.ok(returned.presenceRevision > offlineRevision);
  assert.deepEqual((await readRecord()).state, before.state);
  assert.ok((await api.view(host)).players.every(player => player.connected && player.offlineSince === null));
  noSecrets(returned, [host, guest]);
});

test('legacy room records need no recovery fields and incomplete presence has no invented offline time', async t => {
  const api = await harness(t);
  const host = await api.create(), guest = await api.join(host);
  const stored = await api.db.prepare('SELECT record_json FROM auction_rooms WHERE code = ?').bind(host.roomCode).first();
  const legacy = JSON.parse(stored.record_json);
  assert.equal(Object.hasOwn(legacy, 'serverNow'), false);
  assert.ok(legacy.state.players.every(player => !Object.hasOwn(player, 'offlineSince')));
  // A record without a usable historical timestamp cannot truthfully give a duration.
  delete legacy.credentials[guest.playerId].lastSeen;
  await api.db.prepare('UPDATE auction_rooms SET record_json = ? WHERE code = ?').bind(JSON.stringify(legacy),host.roomCode).run();
  await api.reopen();
  const snapshot = await api.view(host), absent = snapshot.players.find(player => player.id === guest.playerId);
  assert.equal(absent.connected, false);
  assert.equal(absent.offlineSince, null);
  assert.equal(Number.isFinite(snapshot.serverNow), true);
  noSecrets(snapshot, [host, guest]);
  const returned = await api.view(guest);
  assert.equal(returned.players.find(player => player.id === guest.playerId).connected, true);
  assert.equal(returned.players.find(player => player.id === guest.playerId).offlineSince, null);
});

test('room expiry and creation/join limits survive fresh handlers and reopening SQLite', async t => {
  const api = await harness(t);
  const host = await api.create();
  await api.reopen();
  api.advance(6 * 60 * 60 * 1000 + 1);
  englishError(await api.request(`/api/rooms/${host.roomCode}`, { member: host }), 404);
  await api.create();
  assert.equal(await api.db.prepare('SELECT code FROM auction_rooms WHERE code = ?').bind(host.roomCode).first(), null);
  for (let index = 0; index < 11; index++) await api.create({ ...hostProfile, name: `Host ${index}` });
  await api.reopen();
  englishError(await api.request('/api/rooms', { method: 'POST', body: hostProfile }), 429);
  api.advance(60000);
  assert.equal((await api.request('/api/rooms', { method: 'POST', body: hostProfile })).status, 201);
});

test('join and seat throttles are database-backed and reset after one minute', async t => {
  const api = await harness(t);
  const host = await api.create();
  for (let index = 0; index < 30; index++) {
    const joined = await api.request(`/api/rooms/${host.roomCode}/join`, {
      method: 'POST', body: { ...guestProfile, name: `Join ${index}` },
    });
    assert.equal(joined.status, index < 3 ? 201 : 409);
  }
  await api.reopen();
  englishError(await api.request(`/api/rooms/${host.roomCode}/join`, { method: 'POST', body: guestProfile }), 429);
  for (let index = 0; index < 240; index++) {
    const view = await api.request(`/api/rooms/${host.roomCode}`, { member: host });
    assert.equal(view.status, 200, `Seat request ${index + 1}`);
    if (index === 119) await api.reopen();
  }
  englishError(await api.request(`/api/rooms/${host.roomCode}`, { member: host }), 429);
  api.advance(60000);
  assert.equal((await api.request(`/api/rooms/${host.roomCode}`, { member: host })).status, 200);
  englishError(await api.request(`/api/rooms/${host.roomCode}/join`, { method: 'POST', body: guestProfile }), 409);
});

test('the hundred-room cap remains atomic when two visitors create the last room concurrently', async t => {
  const api = await harness(t);
  const create = index => api.request('/api/rooms', {
    method: 'POST', body: hostProfile, headers: { 'CF-Connecting-IP': `192.0.2.${index}` },
  });
  for (let index = 1; index <= 99; index++) assert.equal((await create(index)).status, 201);
  await api.reopen();
  const last = await Promise.all([create(100), create(101)]);
  assert.deepEqual(last.map(result => result.status).sort(), [201, 503]);
  assert.equal((await api.db.prepare('SELECT COUNT(*) AS total FROM auction_rooms').first()).total, 100);
});

test('health proves the native database is reachable and unavailable bindings fail safely', async t => {
  const api = await harness(t);
  const health = await api.request('/api/health');
  assert.equal(health.status, 200);
  assert.deepEqual(health.body, { status: 'ok', version: '0.10.0', runtime: 'sites', storage: 'd1' });
  const response = await createRoomApi()(new Request(SITE + '/api/health'));
  assert.equal(response.status, 503);
  const broken = await createRoomApi({ db: { prepare() { throw new Error('internal DB secret'); } } })(new Request(SITE + '/api/health'));
  assert.equal(broken.status, 500);
  assert.doesNotMatch(await broken.text(), /internal DB secret/);
});
