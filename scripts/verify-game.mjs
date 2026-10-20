// Disposable API smoke. All generated seat credentials remain in process memory.
const base = process.argv[2] || 'http://127.0.0.1:5173';
const stages = [];
let lastStage = 'initialization';
function check(value, message) { if (!value) throw new Error(message); }

async function send(stage, path, {method = 'GET', body, member, expected = 200, raw = false} = {}) {
  lastStage = stage;
  let response;
  try {
    response = await fetch(base + path, {
      method, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(25000),
      headers: {
        Origin: base, Accept: raw ? '*/*' : 'application/json',
        ...(body === undefined ? {} : {'Content-Type': 'application/json'}),
        ...(member ? {Authorization: `Bearer ${member.token}`} : {})
      },
      ...(body === undefined ? {} : {body: JSON.stringify(body)})
    });
  } catch { throw new Error(`${stage}: network request failed; no mutation retry attempted`); }
  check(response.status === expected, `${stage}: unexpected HTTP ${response.status}; no mutation retry attempted`);
  check(response.headers.get('Cache-Control') === 'no-store', `${stage}: expected no-store`);
  check(response.headers.get('X-Content-Type-Options') === 'nosniff', `${stage}: expected nosniff`);
  try { return raw ? await response.text() : await response.json(); }
  catch { throw new Error(`${stage}: response could not be read`); }
}

async function view(member, stage) {
  const payload = await send(stage, `/api/rooms/${member.roomCode}`, {member});
  check(payload.view && payload.view.selfId === member.playerId, `${stage}: seat identity mismatch`);
  return payload.view;
}
async function command(member, type, fields = {}) {
  const current = await view(member, `read-before-${type}`);
  return send(type, `/api/rooms/${member.roomCode}/actions`, {
    method: 'POST', member,
    body: {requestId: crypto.randomUUID(), command: {type, turnId: current.turnId, ...fields}}
  });
}

try {
  const health = await send('native health', '/api/health');
  check(health.runtime === 'sites' && health.storage === 'd1', 'Native Sites D1 runtime missing');
  stages.push('Native Sites API with D1 storage');
  const home = await send('English homepage', '/', {raw: true});
  check(home.includes('<html lang="en" data-default-language="en">'), 'Homepage English default missing');
  check(home.includes('id="online-game"'), 'Multiplayer homepage missing');
  stages.push('English multiplayer homepage');
  const onlineScript = await send('invitation source', '/online.js', {raw: true});
  check(onlineScript.includes("new URL('online.html',location.href)"), 'Invite must derive current host');
  check(onlineScript.includes("url.searchParams.set('room',state.view.code)"), 'Invite room parameter missing');
  check(onlineScript.includes("url.searchParams.set('lang',L.language)"), 'Invite language parameter missing');
  const invite = new URL('online.html', base + '/?lang=zh-CN');
  invite.searchParams.set('room', 'ABC123');
  invite.searchParams.set('lang', 'zh-CN');
  check(invite.origin === base && invite.pathname === '/online.html', 'Invite host/path mismatch');
  stages.push('Published invite source retains Sites host, room and language');

  const host = await send('create', '/api/rooms', {
    method: 'POST', expected: 201,
    body: {name: 'Sites API Appraiser', role: 'appraiser', theme: 'harbor'}
  });
  check(typeof host.token === 'string' && typeof host.playerId === 'string', 'Host credential missing');
  stages.push('Create exactly one disposable room');
  const guest = await send('join', `/api/rooms/${host.roomCode}/join`, {
    method: 'POST', expected: 201,
    body: {name: 'Sites API Restorer', role: 'restorer', theme: 'railway'}
  });
  check(guest.roomCode === host.roomCode && guest.token !== host.token, 'Guest seat mismatch');
  stages.push('Join second independent seat');
  await command(host, 'ready', {ready: true});
  await command(guest, 'ready', {ready: true});
  const started = (await command(host, 'start')).view;
  check(started.phase === 'auction' && started.lots.length === 6, 'Auction did not start with six objects');
  stages.push('Ready both and start');
  await command(host, 'inspect', {slot: 0});
  const hostPrivate = await view(host, 'host-private-view');
  const guestPrivate = await view(guest, 'guest-private-view');
  check(hostPrivate.lots[0].known === true && guestPrivate.lots[0].known === false, 'Inspection privacy failed');
  stages.push('Private inspection visible only to appraiser');
  await command(host, 'bid', {amount: 200, pass: false});
  check((await view(host, 'verify-own-bid')).self.bid.amount === 200, 'Submitted bid missing');
  const guestPending = await view(guest, 'verify-bid-privacy');
  const hostPublic = guestPending.players.find(player => player.id === host.playerId);
  check(hostPublic.submitted === true && !Object.hasOwn(hostPublic, 'bid'), 'Other seat exposed private bid');
  await command(host, 'withdraw');
  check((await view(host, 'verify-withdraw')).self.bid === null, 'Withdrawal failed');
  stages.push('Bid 200, verify privacy, withdraw');
  await command(host, 'bid', {amount: 1, pass: false});
  await command(guest, 'bid', {amount: null, pass: true});
  const opened = await view(host, 'verify-reveal');
  check(opened.phase === 'dispose' && opened.winnerId === host.playerId && opened.winningBid === 1, 'First-round hammer mismatch');
  check(opened.self.cash === 999 && opened.lots.every(lot => lot.known), 'Reveal/cash invariant failed');
  stages.push('Resubmit 1, guest passes, reveal crate; winner cash 999');
  const proceeds = opened.lots.reduce((sum, lot) => sum + lot.base, 0);
  const settled = (await command(host, 'sell', {mode: 'ordinary', repairSlots: [], pairSlots: []})).view;
  const expectedCash = 999 + proceeds;
  check(settled.phase === 'result' && settled.self.cash === expectedCash && settled.ledger.length === 1, 'Initial settlement invariant failed');
  check(settled.receipt.recovery === proceeds && settled.receipt.paid === 1, 'Settlement receipt mismatch');
  for (let index = 0; index < 2; index++) {
    const hostAgain = await view(host, `host-settlement-read-${index + 1}`);
    const guestAgain = await view(guest, `guest-settlement-read-${index + 1}`);
    check(hostAgain.self.cash === expectedCash && hostAgain.ledger.length === 1, 'Repeated GET changed winner cash or ledger');
    check(guestAgain.self.cash === 1000 && guestAgain.ledger.length === 1, 'Repeated GET changed guest cash or ledger');
  }
  stages.push('Ordinary sale and repeated GETs preserve exactly one credit and one ledger entry');
  await command(host, 'finish');
  check((await view(guest, 'guest-verifies-finish')).phase === 'ended', 'Finish did not reach both seats');
  stages.push('Host finishes; guest observes ended');
  console.log(JSON.stringify({
    result: 'PASS', evidence: 'Native Sites HTTP API with D1; not browser or physical-device evidence',
    roomsCreated: 1, mutationRetries: 0, stages,
    cash: {initialPerPlayer: 1000, winningBid: 1, winnerBeforeSale: 999, ordinarySaleProceeds: proceeds, winnerAfterSale: expectedCash, guestAfterSale: 1000, ledgerEntries: 1},
    limitation: 'Real cold-start behavior and clipboard/browser interaction not verified'
  }, null, 2));
} catch (error) {
  console.log(JSON.stringify({result: 'FAIL', stage: lastStage, detail: error.message, completedStages: stages}, null, 2));
  process.exitCode = 1;
}
