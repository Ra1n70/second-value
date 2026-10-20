import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createGameSite} from '../lib/game-site.mjs';

const dir = new URL('../game/client/', import.meta.url);
const pages = Object.fromEntries(await Promise.all((await readdir(dir)).map(async file => [
  file, await readFile(new URL(file, dir), 'utf8'),
])));
const site = createGameSite({pages, api:async () => Response.json({runtime:'sites'})});
const request = (path, method='GET') => new Request('https://game.test'+path, {method});

test('multiplayer home and solo practice are independent documents with English default', async () => {
  const home = await site(request('/?lang=zh-CN'));
  const solo = await site(request('/index.html?lang=zh-CN'));
  assert.equal(home.status, 200);
  assert.match(await home.text(), /id="online-game"/);
  assert.match(await solo.text(), /id="game"/);
  for (const file of ['online.html','index.html']) {
    assert.match(pages[file], /<html lang="en" data-default-language="en">/);
  }
  assert.match(pages['i18n.js'], /zh-CN/);
});

test('all referenced scripts and styles are local and served with proper MIME; gameplay rules remain unchanged', async () => {
  const source = JSON.parse(await readFile(new URL('../game/source.json', import.meta.url)));
  for (const html of [pages['online.html'], pages['index.html']]) {
    for (const [,file] of html.matchAll(/(?:src|href)="([^"?#]+\.(?:js|css))"/g)) {
      assert.ok(Object.hasOwn(pages,file), file);
      const response = await site(request('/'+file));
      assert.equal(response.status, 200);
      const text = await response.text();
      assert.equal(text, pages[file]);
      if (file === 'engine.js') assert.equal(createHash('sha256').update(text).digest('hex'), source.files[file]);
      assert.match(response.headers.get('Content-Type'), file.endsWith('js') ? /javascript/ : /css/);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.doesNotMatch(text, /second-value\.onrender\.com/);
    }
  }
});

test('HEAD, unsupported methods, private paths and API dispatch preserve routing boundaries', async () => {
  assert.equal(await (await site(request('/', 'HEAD'))).text(), '');
  assert.equal((await site(request('/', 'POST'))).status, 405);
  for (const path of ['/server.cjs','/game/room-engine.cjs','/.openai/hosting.json','/missing.js','/%00']) {
    assert.ok([400,404].includes((await site(request(path))).status));
  }
  assert.deepEqual(await (await site(request('/api/health'))).json(), {runtime:'sites'});
});
