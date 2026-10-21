import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const require = createRequire(import.meta.url);
const E = require('../game/engine.cjs');
const artContext = {module:{exports:{}}};
runInNewContext(await readFile(new URL('../game/client/art.js', import.meta.url), 'utf8'), artContext);
const Art = artContext.module.exports;
const roles = Object.keys(E.ROLES);

test('every playable role has its own standalone human portrait', () => {
  const portraits = roles.map(role => Art.portraitFor(role));
  assert.equal(roles.length, 6);
  assert.equal(new Set(portraits.map(portrait => portrait.sheet)).size, roles.length);
  for (const [index, portrait] of portraits.entries()) {
    assert.equal(portrait.sheet, `assets/portrait-${roles[index]}-v2.png`);
    assert.deepEqual([portrait.columns, portrait.rows, portrait.column, portrait.row], [1, 1, 0, 0]);
  }
});

test('the local player keeps their chosen role portrait, with a safe unknown-role fallback', () => {
  for (const role of roles) {
    assert.equal(Art.portraitFor(role, true), Art.portraitFor(role, false));
    assert.notEqual(Art.portraitFor(role, true), Art.portraitFor(null, true));
  }
  const fallback = Art.portraitFor();
  for (const role of [null, undefined, '', 'self', 'unknown', '__proto__', 'toString', {}, 1]) {
    assert.equal(Art.portraitFor(role, true), fallback);
    assert.equal(Art.portraitFor(role, false), fallback);
  }
});

test('six published portrait assets are square PNGs with distinct content', async () => {
  const buffers = await Promise.all(roles.map(role => readFile(new URL(
    `../public/${Art.portraitFor(role).sheet}`, import.meta.url,
  ))));
  assert.equal(new Set(buffers.map(buffer => createHash('sha256').update(buffer).digest('hex'))).size, roles.length);
  for (const buffer of buffers) {
    assert.equal(buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(buffer.toString('ascii', 12, 16), 'IHDR');
    assert.equal(buffer.readUInt32BE(16), buffer.readUInt32BE(20));
    assert.ok(buffer.readUInt32BE(16) >= 1024);
  }
});
