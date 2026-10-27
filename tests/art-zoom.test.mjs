import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const require = createRequire(import.meta.url);
const E = require('../game/engine.cjs');
const source = await readFile(new URL('../game/client/art-zoom.js', import.meta.url), 'utf8');
const artContext = {module:{exports:{}}};
runInNewContext(await readFile(new URL('../game/client/art.js', import.meta.url), 'utf8'), artContext);
const Art = artContext.module.exports;
const canonical = Object.freeze({catalogId:'tea-cup', shape:'cup', name:'Rose tea cup'});
const standalone = Object.freeze({sheet:'assets/catalog-original-v2/tea-cup.webp', columns:1, rows:1, column:0, row:0});

// This small DOM models focus, event bubbling and dialog default actions. It
// deliberately has no game state, network, storage or HTML execution facility.
class Element {
  constructor(tagName, document) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = document;
    this.parentElement = null;
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.open = false;
    this.showCount = 0;
    this.closeCount = 0;
    this.focusCount = 0;
    this._html = '';
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  get id() { return this.getAttribute('id') || ''; }
  set id(value) { this.setAttribute('id', value); }
  get isConnected() {
    return this === this.ownerDocument.body || !!this.parentElement?.isConnected;
  }
  append(child) {
    child.remove();
    child.parentElement = this;
    this.children.push(child);
  }
  remove() {
    if (this.parentElement) {
      const siblings = this.parentElement.children;
      siblings.splice(siblings.indexOf(this), 1);
      this.parentElement = null;
    }
  }
  contains(element) {
    for (let candidate = element; candidate; candidate = candidate.parentElement) {
      if (candidate === this) return true;
    }
    return false;
  }
  matches(selector) {
    if (selector === 'dialog') return this.tagName === 'DIALOG';
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (/^\[[\w-]+\]$/.test(selector)) return this.attributes.has(selector.slice(1, -1));
    return false;
  }
  closest(selector) {
    for (let candidate = this; candidate; candidate = candidate.parentElement) {
      if (candidate.matches(selector)) return candidate;
    }
    return null;
  }
  querySelectorAll(selector) {
    return this.children.flatMap(child => [
      ...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector),
    ]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  addEventListener(type, callback) {
    const callbacks = this.listeners.get(type) || [];
    callbacks.push(callback);
    this.listeners.set(type, callbacks);
  }
  dispatch(type, fields = {}) {
    const event = {
      target:this, defaultPrevented:false,
      preventDefault() { this.defaultPrevented = true; },
      ...fields,
    };
    for (let current = this; current; current = current.parentElement) {
      for (const callback of current.listeners.get(type) || []) callback(event);
    }
    if (this.isConnected) this.ownerDocument.dispatch(type, event);
    return event;
  }
  focus() {
    assert.ok(this.isConnected, 'focus must return to a connected element');
    this.focusCount++;
    this.ownerDocument.activeElement = this;
  }
  showModal() {
    assert.equal(this.tagName, 'DIALOG');
    assert.equal(this.open, false);
    this.open = true;
    this.showCount++;
  }
  close() {
    if (!this.open) return;
    this.open = false;
    this.closeCount++;
    this.dispatch('close');
  }
  escape() {
    const event = this.dispatch('cancel');
    if (!event.defaultPrevented) this.close();
  }
  getBoundingClientRect() { return {left:100, right:900, top:100, bottom:900}; }
  set innerHTML(value) {
    if (this.contains(this.ownerDocument.activeElement)) this.ownerDocument.activeElement = this.ownerDocument.body;
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this._html = String(value);
    // Only focusable controls are needed for these behavioral tests.
    for (const match of this._html.matchAll(/<(button|select)\b([^>]*)>/g)) {
      const control = new Element(match[1], this.ownerDocument);
      for (const attr of match[2].matchAll(/([\w-]+)="([^"]*)"/g)) control.setAttribute(attr[1], attr[2]);
      this.append(control);
    }
  }
  get innerHTML() { return this._html; }
}

class Document {
  constructor() {
    this.listeners = new Map();
    this.created = [];
    this.body = new Element('body', this);
    this.activeElement = this.body;
  }
  createElement(tag) {
    const element = new Element(tag, this);
    this.created.push(element);
    return element;
  }
  addEventListener(type, callback) {
    const callbacks = this.listeners.get(type) || [];
    callbacks.push(callback);
    this.listeners.set(type, callbacks);
  }
  dispatch(type, event) {
    for (const callback of this.listeners.get(type) || []) callback(event);
  }
  querySelectorAll(selector) { return this.body.querySelectorAll(selector); }
  querySelector(selector) { return this.body.querySelector(selector); }
}

function harness({items = [canonical], visual = standalone, engine, art, useDefault = false} = {}) {
  const document = new Document(), events = new Map(), artCalls = [], localeCalls = [];
  const locale = {
    language:'en',
    localize(node) { localeCalls.push(node); },
    setLanguage(language) {
      this.language = language;
      emit('secondvalue:languagechange');
    },
  };
  function emit(type) { for (const callback of events.get(type) || []) callback({type}); }
  const context = {
    module:{exports:{}},
    addEventListener(type, callback) {
      const callbacks = events.get(type) || [];
      callbacks.push(callback);
      events.set(type, callbacks);
    },
  };
  const forbidden = [];
  for (const key of ['localStorage', 'sessionStorage', 'indexedDB', 'fetch', 'XMLHttpRequest']) {
    Object.defineProperty(context, key, {get() { forbidden.push(key); throw new Error(`Unexpected ${key} access`); }});
  }
  const resolvedEngine = engine || {catalogItems:() => items};
  const resolvedArt = art || {visualFor(item, known) { artCalls.push({item, known}); return visual; }};
  if (useDefault) Object.assign(context, {document, SecondValue:resolvedEngine, SecondValueArt:resolvedArt, SecondValueLocale:locale});
  runInNewContext(source, context);
  const exported = context.module.exports;
  const viewer = useDefault ? exported : exported.createViewer({engine:resolvedEngine, art:resolvedArt, document, locale});
  const dialog = () => document.created.find(element => element.tagName === 'DIALOG' && element.className === 'art-zoom-dialog');
  const button = (id = canonical.catalogId, parent = document.body, known = 'true') => {
    const result = document.createElement('button');
    result.setAttribute('type', 'button');
    result.setAttribute('data-art-zoom', id);
    result.setAttribute('data-art-zoom-known', known);
    parent.append(result);
    return result;
  };
  return {viewer, document, locale, localeCalls, artCalls, forbidden, emit, dialog, button};
}

function properties(markup) {
  const style = markup.match(/ style="([^"]+)"/);
  assert.ok(style, 'known artwork needs a presentation style');
  return Object.fromEntries(style[1].split(';').filter(Boolean).map(property => {
    const index = property.indexOf(':');
    return [property.slice(0, index), property.slice(index + 1)];
  }));
}

function assertCell(markup, visual) {
  assert.equal((markup.match(/class="art-zoom-image"/g) || []).length, 1);
  const css = properties(markup);
  assert.equal(css['background-image'], `url('${visual.sheet}')`);
  const [width, height] = css['background-size'].split(' ').map(parseFloat);
  assert.equal(100 / width, 1 / visual.columns, 'horizontal viewport shows exactly one atlas cell');
  assert.equal(100 / height, 1 / visual.rows, 'vertical viewport shows exactly one atlas cell');
  const [x, y] = css['background-position'].split(' ').map(parseFloat);
  assert.ok(Math.abs(x - (visual.columns === 1 ? 0 : visual.column * 100 / (visual.columns - 1))) < 1e-9);
  assert.ok(Math.abs(y - (visual.rows === 1 ? 0 : visual.row * 100 / (visual.rows - 1))) < 1e-9);
}

test('unknown and truthy non-boolean identities preserve content without consulting catalog or art', () => {
  const fail = new Proxy({}, {get() { assert.fail('unconfirmed items must not read public catalog or art'); }});
  const {viewer, document} = harness({engine:fail, art:fail});
  const content = Object.freeze({original:'covered artwork'});
  for (const known of [false, undefined, null, 0, 1, 'true', 'false', {}, [], new Boolean(true)]) {
    assert.equal(viewer.trigger(canonical, known, content), content);
    assert.equal(viewer.imageMarkup(canonical, known), '');
    assert.equal(viewer.open(canonical, known), false);
  }
  assert.equal(document.created.length, 0);
});

test('unknown catalog IDs and mismatched outlines cannot gain a trigger, image or modal', () => {
  const {viewer, artCalls, document} = harness();
  const invalid = [null, undefined, {}, {catalogId:1, shape:'cup'}, {catalogId:'missing', shape:'cup'},
    {...canonical, shape:'clock'}, {...canonical, shape:undefined}, {catalogId:'__proto__', shape:'cup'},
    {catalogId:'constructor', shape:'cup'}, {catalogId:'../tea-cup', shape:'cup'}];
  for (const item of invalid) {
    assert.equal(viewer.trigger(item, true, 'covered'), 'covered');
    assert.equal(viewer.imageMarkup(item, true), '');
    assert.equal(viewer.open(item, true), false);
  }
  assert.equal(artCalls.length, 0);
  assert.equal(document.created.length, 0);
});

test('only canonical catalog metadata is sent to art and interpolated metadata is escaped', () => {
  const item = Object.freeze({catalogId:'cup" onclick="bad()', shape:'cup', name:'Rose <img src=x onerror=bad()> & "tea"'});
  const {viewer, artCalls, dialog} = harness({items:[item]});
  const projected = {...item, name:'PRIVATE <script>bad()</script>', base:999999, sheet:'https://bad.invalid/leak.png'};
  const trigger = viewer.trigger(projected, true, '<span class="original">art</span>');
  assert.match(trigger, /type="button"/);
  assert.match(trigger, /data-art-zoom="cup&quot; onclick=&quot;bad\(\)"/);
  assert.match(trigger, /Rose &lt;img src=x onerror=bad\(\)&gt; &amp; &quot;tea&quot;/);
  assert.ok(trigger.includes('<span class="original">art</span>'));
  assert.ok(!trigger.includes('<img') && !trigger.includes('<script') && !trigger.includes('PRIVATE'));
  assert.equal(artCalls[0].item, item);
  assert.equal(artCalls[0].known, true);
  assert.equal(viewer.open(projected, true), true);
  assert.match(dialog().innerHTML, /Rose &lt;img/);
  assert.ok(!dialog().innerHTML.includes('<img') && !dialog().innerHTML.includes('PRIVATE'));
});

test('resource schemes, traversal, queries, CSS injection and out-of-range cells are rejected', () => {
  const badPaths = [
    'https://example.invalid/art.png', '//example.invalid/art.png', '/assets/cup.png', 'data:image/png;base64,x',
    'javascript:bad()', 'assets/../cup.png', 'assets/folder/../../cup.png', 'assets/%2e%2e/cup.png',
    'assets\\cup.png', 'assets//cup.png', 'assets/cup.png?x=1', 'assets/cup.png#cell',
    "assets/cup.png');color:red;/*", 'assets/cup.gif', 'assets/cup.png\n', '',
  ];
  const badCells = [null,
    ...badPaths.map(sheet => ({...standalone, sheet})),
    ...['columns', 'rows', 'column', 'row'].flatMap(key => [1.5, NaN, Infinity, '1', null, undefined].map(value => ({...standalone, [key]:value}))),
    ...[{columns:0}, {rows:0}, {columns:-1}, {rows:-1}, {column:-1}, {row:-1}, {column:1}, {row:1}].map(value => ({...standalone, ...value})),
  ];
  for (const visual of badCells) {
    const {viewer, document} = harness({visual});
    assert.equal(viewer.trigger(canonical, true, 'original'), 'original', JSON.stringify(visual));
    assert.equal(viewer.imageMarkup(canonical, true), '');
    assert.equal(viewer.open(canonical, true), false);
    assert.equal(document.created.length, 0);
  }
});

test('all eight rare objects show their single correct cell, including atlas corner cells', () => {
  const rare = E.catalogItems().filter(item => item.rarity === 'rare');
  assert.equal(rare.length, 8);
  const {viewer} = harness({engine:E, art:Art});
  for (const [index, item] of rare.entries()) {
    const visual = Art.visualFor(item, true);
    assert.equal(visual.sheet, 'assets/rare-lots-v1.png');
    assert.deepEqual([visual.columns, visual.rows, visual.column, visual.row], [4, 2, index % 4, Math.floor(index / 4)]);
    const markup = viewer.imageMarkup(item, true);
    assertCell(markup, visual);
    assert.equal(properties(markup)['--zoom-aspect'], '1');
  }
});

test('the complete real catalog renders its exact public visual without exposing neighboring assets', () => {
  const items = E.catalogItems(), {viewer} = harness({engine:E, art:Art});
  assert.equal(items.length, 32);
  for (const item of items) {
    assertCell(viewer.imageMarkup(item, true), Art.visualFor(item, true));
    assert.match(viewer.trigger(item, true, '<span>item</span>'), /data-art-zoom-known="true"/);
  }
});

test('legacy 18-cell art and all 24 standalone replacement/expansion paths remain supported', () => {
  const originalIds = ['harbor-clock','station-clock','prop-clock','replica-cup','tea-cup','sailor-cup',
    'crew-badge','replica-badge','expo-badge','dock-camera','toy-camera','studio-camera',
    'harbor-radio','travel-radio','prop-radio','harbor-map','map-print','star-chart'];
  const expansionIds = ['cabinet-clock','cracked-cup','navy-badge','replica-camera','console-radio','railway-map'];
  for (const [index, id] of originalIds.entries()) {
    const item = E.catalogItems().find(candidate => candidate.catalogId === id);
    const visual = {sheet:'assets/catalog-lots-v1.png', columns:6, rows:3, column:Math.floor(index / 3), row:index % 3};
    const {viewer} = harness({items:[item], visual});
    assertCell(viewer.imageMarkup(item, true), visual);
    assert.equal(properties(viewer.imageMarkup(item, true))['--zoom-aspect'], '1.5');
  }
  for (const [index, id] of [...originalIds, ...expansionIds].entries()) {
    const item = E.catalogItems().find(candidate => candidate.catalogId === id);
    const visual = {...standalone, sheet:`assets/${index < 18 ? 'catalog-original-v2' : 'catalog-expansion-v2'}/${id}.${index % 2 ? 'png' : 'webp'}`};
    const {viewer} = harness({items:[item], visual});
    assertCell(viewer.imageMarkup(item, true), visual);
    assert.equal(properties(viewer.imageMarkup(item, true))['--zoom-aspect'], '1');
  }
});

test('opening artwork over the collection leaves the book open and returns focus to its opener', () => {
  const h = harness(), book = h.document.createElement('dialog');
  h.document.body.append(book);
  book.showModal();
  const opener = h.button(canonical.catalogId, book);
  opener.focus();
  assert.equal(h.viewer.open(canonical, true, opener), true);
  const zoom = h.dialog(), close = zoom.querySelector('#art-zoom-close');
  assert.equal(h.document.activeElement, close);
  assert.equal(book.open, true);
  assert.equal(zoom.showCount, 1);
  close.dispatch('click');
  assert.equal(zoom.open, false);
  assert.equal(book.open, true);
  assert.equal(book.closeCount, 0);
  assert.equal(h.document.activeElement, opener);
});

test('focus restoration finds the replacement opener inside the still-open book after polling rebuilds it', () => {
  const h = harness(), book = h.document.createElement('dialog');
  h.document.body.append(book);
  book.showModal();
  const old = h.button(canonical.catalogId, book);
  h.viewer.open(canonical, true, old);
  old.remove();
  const outside = h.button(), closedBook = h.document.createElement('dialog');
  h.document.body.append(closedBook);
  const hidden = h.button(canonical.catalogId, closedBook), replacement = h.button(canonical.catalogId, book);
  h.dialog().escape();
  assert.equal(h.document.activeElement, replacement);
  assert.equal(outside.focusCount, 0);
  assert.equal(hidden.focusCount, 0);
  assert.equal(book.open, true);
  assert.equal(old.isConnected, false);
});

test('focus restoration uses a page fallback after polling, and tolerates no surviving trigger', () => {
  const h = harness(), old = h.button();
  h.viewer.open(canonical, true, old);
  old.remove();
  const replacement = h.button();
  h.dialog().close();
  assert.equal(h.document.activeElement, replacement);
  h.viewer.open(canonical, true, replacement);
  replacement.remove();
  assert.doesNotThrow(() => h.dialog().close());
});

test('language changes keep the same current artwork and modal, and restore the focused language control', () => {
  const h = harness(), opener = h.button();
  h.viewer.open(canonical, true, opener);
  const zoom = h.dialog(), initialArt = zoom.innerHTML.match(/<div class="art-zoom-image"[^>]*><\/div>/)[0];
  const select = zoom.querySelector('#art-zoom-language');
  select.focus();
  select.value = 'es';
  select.dispatch('change');
  assert.equal(h.locale.language, 'es');
  assert.equal(zoom.open, true);
  assert.equal(zoom.showCount, 1);
  assert.equal(h.document.activeElement.id, 'art-zoom-language');
  assert.notEqual(h.document.activeElement, select, 'focus follows the newly rendered language control');
  assert.match(zoom.innerHTML, /value="es" selected/);
  assert.ok(zoom.innerHTML.includes(initialArt));
  assert.equal(h.artCalls.length, 1, 'a language change must not re-resolve an item or change its identity');
  assert.equal(h.localeCalls.length, 2);
  assert.ok(h.localeCalls.every(node => node === zoom));
  zoom.close();
  assert.equal(h.document.activeElement, opener);
});

test('inside clicks keep the dialog open; backdrop, nested close target and Escape close only artwork', () => {
  const h = harness(), opener = h.button();
  h.viewer.open(canonical, true, opener);
  const zoom = h.dialog();
  zoom.dispatch('click', {clientX:500, clientY:500});
  assert.equal(zoom.open, true);
  zoom.dispatch('click', {clientX:20, clientY:500});
  assert.equal(zoom.open, false);
  h.viewer.open(canonical, true, opener);
  const icon = h.document.createElement('span');
  zoom.querySelector('#art-zoom-close').append(icon);
  icon.dispatch('click');
  assert.equal(zoom.open, false);
  h.viewer.open(canonical, true, opener);
  zoom.escape();
  assert.equal(zoom.open, false);
  assert.equal(zoom.closeCount, 3);
});

test('a trigger click bubbles from its artwork, prevents a form action and reuses the modal', () => {
  const h = harness(), form = h.document.createElement('form');
  h.document.body.append(form);
  const opener = h.button(canonical.catalogId, form), artwork = h.document.createElement('span');
  opener.append(artwork);
  const trigger = h.viewer.trigger(canonical, true, '<span>art</span>');
  assert.match(trigger, /^<button type="button"/);
  assert.equal(opener.getAttribute('type'), 'button');
  let submitted = 0;
  form.addEventListener('submit', () => submitted++);
  const event = artwork.dispatch('click');
  if (!event.defaultPrevented && opener.getAttribute('type') !== 'button') form.dispatch('submit');
  assert.equal(event.defaultPrevented, true);
  assert.equal(submitted, 0);
  assert.equal(h.dialog().open, true);
  artwork.dispatch('click');
  assert.equal(h.dialog().showCount, 1);
  assert.equal(h.document.created.filter(element => element.tagName === 'DIALOG').length, 1);
  h.dialog().close();
  assert.equal(h.document.activeElement, opener);
});

test('delegated clicks require the exact confirmed marker and a catalog identity', () => {
  const h = harness();
  for (const marker of [null, 'false', '1', 'TRUE', 'true ']) {
    const opener = h.button(canonical.catalogId, h.document.body, marker);
    assert.equal(opener.dispatch('click').defaultPrevented, false);
  }
  assert.equal(h.button('missing').dispatch('click').defaultPrevented, false);
  assert.equal(h.dialog(), undefined);
  assert.equal(h.artCalls.length, 0);
});

test('the default UMD viewer resolves the browser document and stays read-only across open, language and close', () => {
  const state = Object.freeze({cash:1000, bid:70, selection:Object.freeze(['tea-cup'])});
  const before = JSON.stringify(state), engine = new Proxy({catalogItems:() => [canonical]}, {
    get(target, key) {
      assert.equal(key, 'catalogItems', 'viewer must not access economy, actions or room APIs');
      return target[key];
    },
  });
  const h = harness({engine, useDefault:true}), opener = h.button();
  opener.focus();
  assert.equal(h.viewer.open(canonical, true), true);
  h.locale.setLanguage('zh-CN');
  h.dialog().escape();
  assert.equal(h.document.activeElement, opener);
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(h.forbidden, []);
});
