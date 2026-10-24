import Rooms from '../game/room-engine.cjs';
import E from '../game/engine.cjs';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_TTL = 6 * 60 * 60 * 1000;
const MAX_ROOMS = 100;
const BODY_LIMIT = 8192;
const ONLINE_WINDOW = 15000;
const MAX_ATTEMPTS = 12;
const encoder = new TextEncoder();

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function json(status, data) {
  return new Response(JSON.stringify(data), {status, headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin'
  }});
}
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function onlyKeys(value, keys) { return plain(value) && Object.keys(value).every(key => keys.includes(key)); }
function profile(body) {
  if (!onlyKeys(body, ['name', 'role', 'theme'])) throw new HttpError(400, 'Choose a valid player profile.');
  const name = typeof body.name === 'string' ? body.name.trim().normalize('NFKC') : '';
  if (!name || [...name].length > 20 || /[\p{Cc}\p{Cf}]/u.test(name)) throw new HttpError(400, 'Enter a name from 1 to 20 characters.');
  if (typeof body.role !== 'string' || !Object.hasOwn(E.ROLES, body.role)) throw new HttpError(400, 'Choose a valid role.');
  const theme = body.role === 'collector' ? (body.theme ?? 'harbor') : null;
  if (body.role === 'collector' && (typeof theme !== 'string' || !Object.hasOwn(E.THEMES, theme))) throw new HttpError(400, 'Choose a valid collection theme.');
  return {name, role: body.role, theme};
}
function sameOrigin(request, url) {
  const origin = request.headers.get('Origin');
  if (origin !== null) {
    try {
      const parsed = new URL(origin);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== url.origin || parsed.username ||
          parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error();
    } catch { throw new HttpError(403, 'This request must come from the game page.'); }
  }
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site') throw new HttpError(403, 'This request must come from the game page.');
}
async function readBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) throw new HttpError(415, 'Send a JSON request.');
  const length = request.headers.get('Content-Length');
  if (length && /^\d+$/.test(length) && Number(length) > BODY_LIMIT) throw new HttpError(413, 'The request is too large.');
  if (!request.body) throw new HttpError(400, 'Send a valid JSON object.');
  const reader = request.body.getReader();
  let size = 0, timer;
  const chunks = [];
  const read = async () => {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > BODY_LIMIT) {
        void reader.cancel().catch(() => {});
        throw new HttpError(413, 'The request is too large.');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try {
      const result = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
      if (!plain(result)) throw new Error();
      return result;
    } catch { throw new HttpError(400, 'Send a valid JSON object.'); }
  };
  try {
    return await Promise.race([read(), new Promise((_, reject) => {
      timer = setTimeout(() => {
        void reader.cancel().catch(() => {});
        reject(new HttpError(408, 'The request could not be read.'));
      }, 5000);
    })]);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'The request could not be read.');
  } finally { clearTimeout(timer); reader.releaseLock(); }
}
async function hash(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
}
function equalHash(left, right) {
  if (typeof right !== 'string' || right.length !== left.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}
function randomCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
}
async function credential(now) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return {token, seat: {hash: await hash(token), lastSeen: now, requests: [], traffic: {start: now, count: 0}}};
}
function authenticate(record, candidateHash, now) {
  if (!candidateHash) throw new HttpError(401, 'Your seat could not be restored. Join the room again.');
  for (const [id, seat] of Object.entries(record.credentials)) {
    if (!equalHash(candidateHash, seat.hash)) continue;
    if (now - seat.traffic.start >= 60000) seat.traffic = {start: now, count: 0};
    seat.traffic.count++;
    if (seat.traffic.count > 240) throw new HttpError(429, 'Too many requests. Please wait a moment.');
    seat.lastSeen = now;
    record.lastUsed = now;
    return {id, seat};
  }
  throw new HttpError(401, 'Your seat could not be restored. Join the room again.');
}
function view(record, id, now) {
  // This projection is the sole boundary between private engine state and clients.
  const snapshot = Rooms.viewFor(record.state, id);
  for (const player of snapshot.players) {
    const seat = record.credentials[player.id];
    player.connected = player.active !== false && !!seat && now - seat.lastSeen < ONLINE_WINDOW;
    // Publish only the time the public offline threshold was crossed, never the
    // credential record or the player's private request/activity history.
    player.offlineSince = player.active !== false && !player.connected && Number.isFinite(seat?.lastSeen)
      ? seat.lastSeen + ONLINE_WINDOW : null;
  }
  const signature = snapshot.players.map(player => `${player.id}:${Number(player.connected)}`).join(',');
  if (signature !== record.presence) { record.presence = signature; record.presenceRevision++; }
  snapshot.presenceRevision = record.presenceRevision;
  snapshot.serverNow = now;
  return snapshot;
}
function validateAction(body) {
  if (!onlyKeys(body, ['requestId', 'command']) || typeof body.requestId !== 'string' ||
      !/^[A-Za-z0-9_-]{8,128}$/.test(body.requestId) || !plain(body.command) || typeof body.command.type !== 'string') {
    throw new HttpError(400, 'Choose a valid room action.');
  }
}

/**
 * A Fetch API adapter for the existing authoritative room engine. D1, rather
 * than an isolate's memory, owns the room, credentials, replay cache and presence.
 * Each request starts on the primary and commits a complete record with a CAS.
 * A racing action reloads the winner's state before applying its own command.
 * @param {{db: object, clock?: () => number}} options
 */
export function createRoomApi({db, clock = Date.now} = {}) {
  return async function handleRoomRequest(request) {
    try {
      const url = new URL(request.url);
      sameOrigin(request, url);
      const health = url.pathname === '/api/health';
      const create = url.pathname === '/api/rooms';
      const route = /^\/api\/rooms\/([A-Z0-9]{6})(?:\/(join|actions))?$/.exec(url.pathname);
      if (!health && !create && !route) throw new HttpError(404, 'Room not found or expired.');
      const method = health || route && !route[2] ? 'GET' : 'POST';
      if (request.method !== method) {
        const response = json(405, {error: 'This request method is not supported.'});
        response.headers.set('Allow', method);
        return response;
      }
      if (!db || typeof db.prepare !== 'function') throw new HttpError(503, 'The room could not process this request.');
      // Sessions prevent a newly resumed browser from being served an old replica.
      const database = typeof db.withSession === 'function' ? db.withSession('first-primary') : db;
      if (health) {
        await database.prepare('SELECT code FROM auction_rooms LIMIT 1').first();
        return json(200, {status: 'ok', version: '0.10.0', runtime: 'sites', storage: 'd1'});
      }

      async function rateLimit(kind, maximum) {
        // Cloudflare sets this header; never trust a client-supplied forwarded chain.
        const remote = request.headers.get('CF-Connecting-IP') || 'local';
        const key = `${kind}:${await hash(remote)}`, now = clock(), cutoff = now - 60000;
        await database.prepare('DELETE FROM auction_rate_limits WHERE window_start < ?').bind(cutoff).run();
        const bucket = await database.prepare(`INSERT INTO auction_rate_limits (bucket_key, window_start, count)
          VALUES (?, ?, 1) ON CONFLICT(bucket_key) DO UPDATE SET
          count = CASE WHEN auction_rate_limits.window_start <= ? THEN 1 ELSE auction_rate_limits.count + 1 END,
          window_start = CASE WHEN auction_rate_limits.window_start <= ? THEN excluded.window_start ELSE auction_rate_limits.window_start END
          RETURNING count`).bind(key, now, cutoff, cutoff).first();
        if (!bucket || bucket.count > maximum) throw new HttpError(429, 'Too many requests. Please wait a moment.');
      }
      if (create) {
        await rateLimit('create', 12);
        const player = profile(await readBody(request));
        const now = clock(), cutoff = now - ROOM_TTL;
        await database.prepare('DELETE FROM auction_rooms WHERE last_used < ?').bind(cutoff).run();
        const id = crypto.randomUUID(), {token, seat} = await credential(now);
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          const code = randomCode(), seed = crypto.getRandomValues(new Uint32Array(1))[0];
          const record = {state: Rooms.createRoom({code, seed, host: {id, ...player}}), credentials: {[id]: seat},
            lastUsed: now, presence: '', presenceRevision: 0};
          const snapshot = view(record, id, now);
          // The capacity predicate and insert are one serialized SQLite write.
          const inserted = await database.prepare(`INSERT INTO auction_rooms (code, storage_version, last_used, record_json)
            SELECT ?, 1, ?, ? WHERE (SELECT COUNT(*) FROM auction_rooms WHERE last_used >= ?) < ?
            ON CONFLICT(code) DO NOTHING RETURNING code`).bind(code, now, JSON.stringify(record), cutoff, MAX_ROOMS).first();
          if (inserted) return json(201, {roomCode: code, playerId: id, token, view: snapshot});
          const count = await database.prepare('SELECT COUNT(*) AS total FROM auction_rooms WHERE last_used >= ?').bind(cutoff).first();
          if (count.total >= MAX_ROOMS) throw new HttpError(503, 'The auction house is full. Try again later.');
        }
        throw new HttpError(503, 'The room could not process this request.');
      }

      const code = route[1], join = route[2] === 'join', action = route[2] === 'actions';
      let joiningPlayer, joiningId, joiningCredential, body, fingerprint;
      if (join) {
        await rateLimit('join', 30);
        joiningPlayer = profile(await readBody(request));
        joiningId = crypto.randomUUID();
        joiningCredential = await credential(clock());
      }
      const bearer = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('Authorization') || '');
      const candidateHash = !join && bearer ? await hash(bearer[1]) : null;
      // Read an action body once, after checking the seat on the first attempt.
      let actionRead = false, bodyError = null;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const now = clock();
        const stored = await database.prepare('SELECT storage_version, last_used, record_json FROM auction_rooms WHERE code = ?').bind(code).first();
        if (!stored || now - stored.last_used > ROOM_TTL) throw new HttpError(404, 'Room not found or expired.');
        const record = JSON.parse(stored.record_json);
        let result, operationError;
        if (join) {
          try {
            Rooms.joinRoom(record.state, {id: joiningId, ...joiningPlayer});
            record.credentials[joiningId] = joiningCredential.seat;
            record.lastUsed = now;
            result = {roomCode: code, playerId: joiningId, token: joiningCredential.token, view: view(record, joiningId, now)};
          } catch (error) { throw new HttpError(409, error.message); }
        } else {
          const {id, seat} = authenticate(record, candidateHash, now);
          try {
            if (action) {
              if (!actionRead) {
                actionRead = true;
                try { body = await readBody(request); validateAction(body); fingerprint = await hash(JSON.stringify(body.command)); }
                catch (error) { bodyError = error; }
              }
              if (bodyError) throw bodyError;
              const previous = seat.requests.find(entry => entry[0] === body.requestId);
              if (previous) {
                if (previous[1] !== fingerprint) throw new HttpError(409, 'A request ID cannot be reused for a different action.');
              } else {
                try { Rooms.applyAction(record.state, id, body.command); }
                catch (error) { throw new HttpError(409, error.message); }
                seat.requests.push([body.requestId, fingerprint]);
                if (seat.requests.length > 200) seat.requests.splice(0, seat.requests.length - 200);
                if (body.command.type === 'leave') {
                  delete record.credentials[id];
                  result = {left: true, view: null};
                }
              }
            }
            if (!result) result = {view: view(record, id, now)};
          } catch (error) { operationError = error; }
        }
        const updated = await database.prepare(`UPDATE auction_rooms SET storage_version = storage_version + 1,
          last_used = ?, record_json = ? WHERE code = ? AND storage_version = ?`)
          .bind(record.lastUsed, JSON.stringify(record), code, stored.storage_version).run();
        if (updated.meta.changes === 1) {
          if (operationError) throw operationError;
          return json(join ? 201 : 200, result);
        }
      }
      throw new HttpError(503, 'The room could not process this request.');
    } catch (error) {
      return json(error instanceof HttpError ? error.status : 500,
        {error: error instanceof HttpError ? error.message : 'The room could not process this request.'});
    }
  };
}
