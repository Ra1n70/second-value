// Disposable built-Worker smoke. Generated credentials stay in process memory.
import assert from 'node:assert/strict';
import E from '../game/engine.cjs';

const origin = new URL(process.argv[2] || 'http://127.0.0.1:5177').origin;
const summaries = [];
let stage = 'health';
async function request(path, {member, body, expected = 200} = {}) {
  let response;
  try {
    response = await fetch(origin + path, {
      method: body ? 'POST' : 'GET', redirect: 'manual', cache: 'no-store',
      signal: AbortSignal.timeout(25000),
      headers: {Origin: origin, Accept: 'application/json',
        ...(body ? {'Content-Type': 'application/json'} : {}),
        ...(member ? {Authorization: `Bearer ${member.token}`} : {})},
      ...(body ? {body: JSON.stringify(body)} : {})
    });
  } catch { throw new Error('Network request failed; no mutation retry attempted.'); }
  assert.equal(response.status, expected, `Unexpected HTTP ${response.status}; no mutation retry attempted.`);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  return response.json();
}
async function view(member) {
  const result = await request(`/api/rooms/${member.roomCode}`, {member});
  assert.equal(result.view.selfId, member.playerId);
  return result.view;
}
async function command(member, type, fields = {}) {
  stage = type;
  const current = await view(member);
  return (await request(`/api/rooms/${member.roomCode}/actions`, {member,
    body: {requestId: crypto.randomUUID(), command: {type, turnId: current.turnId, ...fields}}})).view;
}
function privateBoundary(snapshot) {
  assert.ok(snapshot.players.every(player => !('bid' in player) && !('inspected' in player)));
  for (const lot of snapshot.lots) if (!lot.known) {
    assert.ok(!('base' in lot) && !('catalogId' in lot) && !('genuine' in lot));
  }
  const forbidden = new Set(['seed', 'token', 'credentials', 'hash', 'requests', 'lastSeen', 'cratePlayers']);
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) { assert.ok(!forbidden.has(key)); visit(child); }
  }
  visit(snapshot);
}

try {
  const health = await request('/api/health');
  assert.equal(health.runtime, 'sites'); assert.equal(health.storage, 'd1');
  for (const computerCount of [1, 2, 3]) {
    stage = `create-${computerCount + 1}-seat-room`;
    const host = await request('/api/rooms', {body: {name: 'Computer Smoke QA', role: 'appraiser'}, expected: 201});
    for (const style of ['steady', 'bold', 'patient'].slice(0, computerCount)) await command(host, 'add-bot', {style});
    let current = await view(host);
    assert.equal(current.rulesVersion, E.RULES_VERSION, 'Built Worker rules must match the current game source');
    const opening = E.startingCashFor(current.rulesVersion);
    assert.ok(current.players.every(player => player.cash === opening), 'Human and computer opening funds must match the room rules');
    assert.equal(current.self.cash, opening);
    assert.equal(current.players.filter(player => player.isBot).length, computerCount);
    const originalIds = current.players.filter(player => player.isBot).map(player => player.id);
    await command(host, 'ready', {ready: true});
    current = await command(host, 'start');
    for (let crate = 1; crate <= 2; crate++) {
      assert.equal(current.auctionNumber, crate);
      assert.equal(current.phase, 'auction');
      privateBoundary(current);
      assert.ok(current.players.filter(player => player.isBot).every(player => player.submitted && player.connected));
      assert.equal(current.self.bid, null);
      for (let round = 1; round <= 3; round++) {
        current = await command(host, 'bid', {amount: null, pass: true});
        assert.equal(current.history.length, round);
        if (current.phase === 'result') break;
        assert.equal(current.phase, 'round-summary');
        current = await command(host, 'next');
      }
      assert.equal(current.phase, 'result');
      assert.equal(current.ledger.length, crate);
      assert.equal(current.self.cash, opening);
      assert.ok(current.players.every(player => Number.isSafeInteger(player.cash) && player.cash >= 0));
      if (current.winnerId) {
        assert.ok(originalIds.includes(current.winnerId));
        const previous = crate === 1 ? opening : current.ledger[crate - 2].players.find(player => player.id === current.winnerId).cash;
        assert.equal(current.players.find(player => player.id === current.winnerId).cash, previous + current.receipt.profit);
      }
      const settledBalances = current.players.map(player => [player.id, player.cash]);
      const readAgain = await view(host);
      assert.equal(readAgain.ledger.length, crate, 'Repeated reads must not settle a computer sale twice');
      assert.deepEqual(readAgain.players.map(player => [player.id, player.cash]), settledBalances);
      privateBoundary(current);
      if (crate === 1) {
        await command(host, 'ready', {ready: true}); current = await command(host, 'continue');
        assert.deepEqual(current.players.map(player => [player.id, player.cash]), settledBalances, 'The next crate must preserve each seat balance');
      }
    }
    current = await command(host, 'finish');
    assert.equal(current.phase, 'ended');
    summaries.push(`${computerCount + 1} seats: rules ${current.rulesVersion}, opening ${opening}, 2 crates, private bids, single-credit automatic sales, continued balances and host finish passed`);
  }
  console.log(JSON.stringify({ok: true, runtime: 'sites', storage: 'd1', checks: summaries}, null, 2));
} catch (error) {
  // Assertions are bounded descriptions above; never dump a room or credential.
  console.error(`${stage}: ${error.message}`);
  process.exitCode = 1;
}
