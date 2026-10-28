import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const css = file => readFile(new URL(`../game/client/${file}`, import.meta.url), 'utf8');
const [tabletop, online, zoom] = await Promise.all(['tabletop.css', 'online.css', 'art-zoom.css'].map(css));
// The body of the first @media block that opens with the given query and contains the needle.
const media = (source, query, needle = '') => {
  for (let start = source.indexOf(query); start >= 0; start = source.indexOf(query, start + 1)) {
    let depth = 0, end = -1;
    for (let index = source.indexOf('{', start); index < source.length && end < 0; index++) {
      if (source[index] === '{') depth++;
      else if (source[index] === '}' && --depth === 0) end = index;
    }
    assert.ok(end > 0, `${query} is not closed`);
    if (source.slice(start, end).includes(needle)) return source.slice(start, end);
  }
  assert.fail(`${query} with ${needle || 'any rule'} must exist`);
};

test('pinned phone bid bars keep their buttons above the gesture bar', () => {
  const solo = media(tabletop, '@media (max-width:740px) {', '.action-dock.dock-inspect').match(/\.action-dock\.dock-inspect \{[^}]*\}/)?.[0];
  const room = media(online, '@media (max-width:740px) {', '.online-dock.dock-idle {position:sticky').match(/\.online-dock\.dock-idle \{position:sticky[^}]*\}/)?.[0];
  for (const [page, rule] of [['solo', solo], ['room', room]]) {
    assert.match(rule, /position:sticky;bottom:0/, `${page} bar stays pinned`);
    assert.match(rule, /padding:10px 12px calc\(10px \+ env\(safe-area-inset-bottom,0px\)\)/, `${page} bar reserves the bottom inset`);
  }
});

test('on narrow screens the round rules panel opens from the tools’ left edge', () => {
  const narrow = media(tabletop, '@media(max-width:850px){', '.round-rules');
  assert.match(narrow, /\.workbench-head \.workbench-tools\{position:relative\}/);
  assert.match(narrow, /\.workbench-tools \.round-rules\{position:static;max-width:none\}/, 'the label is no longer squeezed to 80px');
  assert.match(narrow, /\.workbench-tools \.round-rules-content\{left:0;right:auto\}/);
});

test('sale thumbnails show an enlarge icon instead of a wrapped label', () => {
  const rule = zoom.match(/\.truth-art \.art-zoom-hint\{[^}]*\}/g);
  assert.equal(rule.length, 1, 'one rule decides the thumbnail hint');
  assert.match(rule[0], /width:22px;height:22px/);
  assert.match(rule[0], /color:transparent/);
  assert.match(rule[0], /url\("data:image\/svg\+xml,/);
});
