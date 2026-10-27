import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createRoomApi} from '../lib/room-api.mjs';
import {createSqliteD1} from './helpers/sqlite-d1.mjs';

// Normalize before extracting real functions so the same tests work on CRLF
// Windows checkouts and LF CI checkouts.
const source = (await readFile(new URL('../game/client/online.js', import.meta.url), 'utf8')).replace(/\r\n?/g, '\n');
function extract(name, async = false) {
  const fn = source.match(new RegExp(`  ${async ? 'async ' : ''}function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n  \\}`))?.[0];
  assert.ok(fn, `actual ${name} function must be available`);
  return fn;
}

function harness(name, roomCode = '') {
  const inputs = {'#online-name':{value:name}, '#online-room-code':{value:roomCode}};
  const requests = [], state = {name:'', roomCode:'', role:'restorer', theme:'harbor', busy:false, error:'', credentials:null};
  const context = {
    state, URL,
    main:{querySelector:selector => inputs[selector]},
    Tutorial:{buttonMarkup:() => ''},
    escape:value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[character])),
    render() {}, setConnection() {}, persist() {}, poll() {},
    acceptView(view) { state.view = view; },
    location:{href:'https://second-value.test/online.html?lang=zh-CN'},
    history:{replaceState() {}},
    async request(path, options) {
      assert.equal(state.busy, true, 'entry must be locked while its request is pending');
      requests.push({path, method:options.method, body:JSON.parse(options.body)});
      return {roomCode:'ABC234', playerId:'fixture-player', token:'fixture-only', view:{phase:'lobby'}};
    },
  };
  const functions = runInNewContext(`${extract('enter', true)}\n${extract('entry')}\n({enter, entry});`, context);
  return {...functions, state, requests};
}

const boundaryNames = [
  ['ASCII', count => 'a'.repeat(count)],
  ['CJK', count => '汉'.repeat(count)],
  ['emoji', count => '😀'.repeat(count)],
  ['mixed', count => 'A😀'.repeat(10) + '中'.repeat(count - 20)],
];

test('the real nickname input preserves 20-character names and lets validation reject complete 21-character input', () => {
  const markup = harness('').entry();
  const input = markup.match(/<input\b[^>]*\bid="online-name"[^>]*>/)?.[0];
  assert.ok(input, 'entry renders the nickname input');
  const limit = input.match(/\bmaxlength="(\d+)"/);
  const maxLength = limit ? Number(limit[1]) : Infinity;
  assert.ok(maxLength === Infinity || (Number.isSafeInteger(maxLength) && maxLength > 0));
  for (const [label, makeName] of boundaryNames) {
    const name = makeName(20);
    assert.equal([...name].length, 20);
    assert.ok(maxLength >= name.length, `${label}: input must allow all ${name.length} UTF-16 units before validation`);
  }
  assert.ok(maxLength >= '😀'.repeat(21).length, '21 emoji must reach validation intact instead of silently becoming an accepted 20-emoji nickname');
});

test('real async entry accepts 20 code points and rejects 21 for ASCII, CJK, emoji and mixed names', async () => {
  for (const [label, makeName] of boundaryNames) {
    const valid = harness(makeName(20));
    await valid.enter(false);
    assert.equal(valid.requests.length, 1, `${label}: 20 accepted`);
    assert.equal(valid.requests[0].body.name, makeName(20));
    assert.equal(valid.state.error, '');
    assert.equal(valid.state.busy, false);

    const invalid = harness(makeName(21));
    await invalid.enter(false);
    assert.equal(invalid.state.name, makeName(21), `${label}: validation must not truncate an overlong nickname`);
    assert.equal(invalid.requests.length, 0, `${label}: 21 must not reach the API`);
    assert.equal(invalid.state.error, 'Enter a name from 1 to 20 characters.');
    assert.equal(invalid.state.busy, false);
  }
});

test('the 20-character limit is applied after trimming and NFKC normalization', async () => {
  const cases = [
    {input:'  ' + 'Ａ'.repeat(20) + '  ', normalized:'A'.repeat(20), accepted:true},
    {input:'Ａ'.repeat(21), normalized:'A'.repeat(21), accepted:false},
    {input:'e\u0301'.repeat(20), normalized:'é'.repeat(20), accepted:true},
    {input:'e\u0301'.repeat(21), normalized:'é'.repeat(21), accepted:false},
    {input:'ﬃ'.repeat(6) + 'ab', normalized:'ffi'.repeat(6) + 'ab', accepted:true},
    {input:'ﬃ'.repeat(7), normalized:'ffi'.repeat(7), accepted:false},
  ];
  for (const {input, normalized, accepted} of cases) {
    const h = harness(input);
    await h.enter(false);
    assert.equal(h.state.name, normalized);
    assert.equal(h.requests.length, Number(accepted));
    if (accepted) assert.equal(h.requests[0].body.name, normalized);
    else assert.equal(h.state.error, 'Enter a name from 1 to 20 characters.');
  }
});

test('creating and joining both preserve a complete 20-emoji nickname in the request', async () => {
  const name = '😀'.repeat(20);
  for (const join of [false, true]) {
    const h = harness(name, join ? ' abc234 ' : '');
    await h.enter(join);
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].path, join ? '/api/rooms/ABC234/join' : '/api/rooms');
    assert.equal(h.requests[0].method, 'POST');
    assert.equal(h.requests[0].body.name, name);
    assert.equal(h.requests[0].body.name.length, 40);
    assert.equal([...h.requests[0].body.name].length, 20);
    assert.equal(h.state.name, name);
  }
});

test('the real API accepts complete 20-emoji create/join names and rejects normalized 21-character names', async t => {
  const db = createSqliteD1(':memory:');
  t.after(() => db.close());
  const migration = await readFile(new URL('../drizzle/0000_natural_firebrand.sql', import.meta.url), 'utf8');
  for (const sql of migration.split(/-->\s*statement-breakpoint/).filter(sql => sql.trim())) await db.prepare(sql).run();
  const api = createRoomApi({db});
  async function post(path, name) {
    return api(new Request('https://second-value.test' + path, {
      method:'POST',
      headers:{Origin:'https://second-value.test', 'Content-Type':'application/json'},
      body:JSON.stringify({name, role:'restorer', theme:'harbor'}),
    }));
  }
  const name = '😀'.repeat(20), created = await post('/api/rooms', name);
  assert.equal(created.status, 201);
  const host = await created.json();
  assert.equal(host.view.players[0].name, name);
  const joined = await post(`/api/rooms/${host.roomCode}/join`, name);
  assert.equal(joined.status, 201);
  const guest = await joined.json();
  assert.equal(guest.view.players.find(player => player.id === guest.playerId).name, name);
  for (const invalid of ['😀'.repeat(21), 'ﬃ'.repeat(7)]) {
    const response = await post('/api/rooms', invalid);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'Enter a name from 1 to 20 characters.');
  }
});
