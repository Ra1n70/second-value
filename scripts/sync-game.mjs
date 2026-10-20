// Run explicitly from this checkout when importing an approved game revision.
// Published builds use only the files committed inside this Site repository.
import {copyFile, mkdir, readFile, writeFile, cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.resolve(root, '../auction-game/demo');
const files = ['online.html', 'index.html', 'engine.js', 'i18n.js', 'art.js', 'app.js',
  'online-locale.js', 'room-transport.js', 'online.js', 'fonts.css', 'styles.css',
  'workbench.css', 'tabletop.css', 'typography.css', 'online.css'];
await mkdir(path.join(root, 'game/client'), {recursive:true});
const hashes = {};
for (const file of files) {
  const bytes = await readFile(path.join(source, 'dist', file));
  hashes[file] = createHash('sha256').update(bytes).digest('hex');
  const content = file.endsWith('.html') ? bytes.toString('utf8').replace(
    '<html lang="zh-CN" data-default-language="zh-CN">',
    '<html lang="en" data-default-language="en">') : bytes;
  await writeFile(path.join(root, 'game/client', file), content);
}
await copyFile(path.join(source, 'dist/engine.js'), path.join(root, 'game/engine.cjs'));
const rooms = await readFile(path.join(source, 'lib/room-engine.cjs'), 'utf8');
await writeFile(path.join(root, 'game/room-engine.cjs'), rooms.replace(
  "require('../dist/engine.js')", "require('./engine.cjs')"));
await mkdir(path.join(root, 'public'), {recursive:true});
await cp(path.join(source, 'dist/assets'), path.join(root, 'public/assets'), {recursive:true});
await writeFile(path.join(root, 'game/source.json'), JSON.stringify({
  source:'Ra1n70/second-value', version:'0.10.0', files:hashes,
  roomEngineSha256:createHash('sha256').update(rooms).digest('hex'),
  adaptations:['Default HTML language is English; Chinese remains available through ?lang=zh-CN.',
    'The room engine requires the co-located engine.cjs.']
}, null, 2) + '\n');
console.log('Imported game rules, pages and assets into the Site checkout.');
