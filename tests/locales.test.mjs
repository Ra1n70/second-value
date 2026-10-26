import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const game = require('../game/engine.cjs');

const client = new URL('../game/client/', import.meta.url);
const readClient = name => readFile(new URL(name, client), 'utf8');

// This intentionally small DOM models the APIs used by localization, rather than
// gameplay or browser navigation. The browser smoke test covers the full UI.
class Element {
  constructor(tag, attributes = {}, text = '') {
    this.nodeType = 1;
    this.tagName = tag.toUpperCase();
    this.attributes = new Map(Object.entries(attributes));
    this.dataset = {};
    for (const [key, value] of this.attributes) if (key.startsWith('data-')) {
      this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
    }
    this.childNodes = [];
    this.parentElement = null;
    this.listeners = new Map();
    this.value = '';
    this.open = false;
    if (text) this.append(new TextNode(text));
  }
  append(...nodes) {
    for (const node of nodes) {
      node.parentElement = this;
      this.childNodes.push(node);
    }
    return nodes.at(-1);
  }
  get textContent() { return this.childNodes.map(node => node.textContent).join(''); }
  set textContent(value) { this.childNodes = []; this.append(new TextNode(String(value))); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  hasAttribute(name) { return this.attributes.has(name); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  get href() { return this.getAttribute('href'); }
  set href(value) { this.setAttribute('href', value); }
  get content() { return this.getAttribute('content'); }
  set content(value) { this.setAttribute('content', value); }
  get lang() { return this.getAttribute('lang'); }
  set lang(value) { this.setAttribute('lang', value); }
  matches(selector) {
    return selector.split(',').some(part => {
      const trimmed = part.trim();
      const tag = trimmed.match(/^[a-z]+/i)?.[0];
      if (tag && this.tagName !== tag.toUpperCase()) return false;
      if (trimmed.startsWith('#')) return this.getAttribute('id') === trimmed.slice(1);
      if (trimmed.startsWith('.')) return (this.getAttribute('class') || '').split(' ').includes(trimmed.slice(1));
      const attrs = [...trimmed.matchAll(/\[([^\]=]+)(?:=["']?([^\]"']+)["']?)?\]/g)];
      if (attrs.length) return attrs.every(([, name, value]) => this.hasAttribute(name) && (value === undefined || this.getAttribute(name) === value));
      return Boolean(tag);
    });
  }
  closest(selector) {
    for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node;
    return null;
  }
  querySelectorAll(selector) {
    const result = [];
    const walk = node => {
      for (const child of node.childNodes) if (child.nodeType === 1) {
        if (child.matches(selector)) result.push(child);
        walk(child);
      }
    };
    walk(this);
    return result;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  addEventListener(name, callback) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(callback);
  }
  dispatchEvent(event) {
    for (const callback of this.listeners.get(event.type) || []) callback(event);
    return true;
  }
}

class TextNode {
  constructor(value) { this.nodeType = 3; this.nodeValue = value; this.parentElement = null; }
  get textContent() { return this.nodeValue; }
  set textContent(value) { this.nodeValue = String(value); }
}

async function localeHarness({ search = '', stored = null, online = false, storageDenied = false } = {}) {
  const html = new Element('html', { lang: 'en', 'data-default-language': 'en' });
  const head = html.append(new Element('head'));
  head.append(new Element('meta', { name: 'description', content: 'Original description' }));
  const body = html.append(new Element('body'));
  const wordmark = body.append(new Element('a', { class: 'wordmark', href: online ? 'online.html' : 'index.html' }));
  const main = body.append(new Element('main', { id: online ? 'online-game' : 'game' }));
  const link = body.append(new Element('a', { id: online ? 'practice-link' : 'multiplayer-link', href: online ? 'index.html' : 'online.html' }));
  const document = Object.assign(new Element('document'), {
    nodeType: 9, documentElement: html, body, title: 'Original title',
    createElement: tag => new Element(tag),
    createTextNode: value => new TextNode(value),
    getElementById(id) { return html.getAttribute('id') === id ? html : html.querySelector('#' + id); },
    querySelector(selector) { return html.matches(selector) ? html : html.querySelector(selector); },
    querySelectorAll: selector => html.querySelectorAll(selector),
    createTreeWalker(container, _show, filter) {
      const nodes = [];
      const walk = node => {
        for (const child of node.childNodes) {
          if (child.nodeType === 3 && (!filter || filter.acceptNode(child) === 1)) nodes.push(child);
          if (child.nodeType === 1) walk(child);
        }
      };
      walk(container);
      let cursor = 0;
      return { nextNode: () => nodes[cursor++] || null };
    },
  });
  let current = new URL('https://game.test/' + (online ? 'online.html' : 'index.html') + search);
  const navigation = [];
  const replacements = [];
  const location = {
    get href() { return current.href; },
    set href(value) { navigation.push(value); current = new URL(value, current); },
    get search() { return current.search; },
    get pathname() { return current.pathname; },
    get hash() { return current.hash; },
    get origin() { return current.origin; },
    assign(value) { navigation.push(value); },
    replace(value) { navigation.push(value); },
    reload() { navigation.push('reload'); },
  };
  const store = new Map(stored === null ? [] : [['secondvalue:language', stored]]);
  const localStorage = {
    getItem(key) { if (storageDenied) throw Error('Storage denied'); return store.get(key) ?? null; },
    setItem(key, value) { if (storageDenied) throw Error('Storage denied'); store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
  };
  const events = new Element('window');
  const context = vm.createContext({
    document, location, localStorage, URL, URLSearchParams,
    navigator: { language: 'zh-CN', languages: ['zh-CN', 'es'] },
    NodeFilter: { SHOW_TEXT: 4, FILTER_REJECT: 2, FILTER_ACCEPT: 1 },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    history: { state: { preserved: true }, replaceState(state, title, value) {
      replacements.push({ state, title, value: String(value) });
      current = new URL(value, current);
    } },
    addEventListener: events.addEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
    console,
  });
  context.window = context;
  for (const name of ['locale-es.js', 'i18n.js', ...(online ? ['online-locale.js'] : [])]) {
    let source = await readClient(name);
    if (name === 'i18n.js' || name === 'online-locale.js') {
      const prefix = name === 'i18n.js' ? '__base' : '__online';
      source = source.replace(/const words\s*=\s*\{/, `const words = window.${prefix}Words = {`);
      source = source.replace(/const itemNames\s*=\s*\{/, `const itemNames = window.${prefix}Items = {`);
      source = source.replace(/const spanishWords\s*=\s*\{/, `const spanishWords = window.${prefix}SpanishWords = {`);
    }
    vm.runInContext(source, context, { filename: name });
  }
  return { context, base: context.SecondValueLocale, locale: online ? context.SecondValueOnlineLocale : context.SecondValueLocale,
    document, body, main, wordmark, link, store, events, navigation, replacements, location };
}

test('language selection defaults to English and gives valid URL choice priority over saved preference', async () => {
  for (const [options, expected] of [
    [{}, 'en'], [{ stored: 'es' }, 'es'], [{ search: '?lang=zh-CN', stored: 'es' }, 'zh-CN'],
    [{ search: '?lang=en', stored: 'zh-CN' }, 'en'], [{ search: '?lang=es', stored: 'en' }, 'es'],
    [{ search: '?lang=es-MX' }, 'es'], [{ search: '?lang=zh' }, 'zh-CN'],
    [{ search: '?lang=invalid', stored: 'es' }, 'es'], [{ search: '?lang=invalid', stored: 'invalid' }, 'en'],
    [{ stored: 'invalid' }, 'en'],
  ]) {
    const { base, document } = await localeHarness(options);
    assert.equal(base.language, expected, JSON.stringify(options));
    assert.equal(document.documentElement.lang, expected);
  }
});

test('switching persists language, emits a change, and replaces only the URL preference without navigating', async () => {
  const h = await localeHarness({ search: '?room=ABCD12&extra=keep#auction', online: true });
  const changes = [];
  h.events.addEventListener('secondvalue:languagechange', event => changes.push(event.detail.language));
  for (const language of ['zh-CN', 'es', 'en']) {
    h.base.setLanguage(language);
    assert.equal(h.base.language, language);
    assert.equal(h.locale.language, language);
    assert.equal(h.store.get('secondvalue:language'), language);
    assert.equal(h.document.documentElement.lang, language);
    const url = new URL(h.location.href);
    assert.equal(url.searchParams.get('room'), 'ABCD12');
    assert.equal(url.searchParams.get('extra'), 'keep');
    assert.equal(url.searchParams.get('lang'), language);
    assert.equal(url.hash, '#auction');
    for (const link of [h.link, h.wordmark]) {
      const destination = new URL(link.href, h.location.href);
      assert.equal(destination.origin, url.origin);
      assert.equal(destination.searchParams.get('lang'), language);
    }
    assert.equal(h.document.title, {
      en: 'Second Value — Multiplayer', 'zh-CN': '余价拍卖行 — 多人拍卖', es: 'Second Value — Multijugador',
    }[language]);
  }
  assert.deepEqual(changes, ['zh-CN', 'es', 'en']);
  assert.equal(h.replacements.length, 3);
  assert.deepEqual(h.navigation, []);
  h.base.setLanguage('unsupported');
  assert.equal(h.base.language, 'en');
  assert.equal(h.replacements.length, 3);
});

test('storage-disabled browsers can choose a language without resetting or navigating', async () => {
  const h = await localeHarness({ storageDenied: true, search: '?room=KEEP' });
  assert.equal(h.base.language, 'en');
  assert.doesNotThrow(() => h.base.setLanguage('es'));
  assert.equal(h.base.language, 'es');
  assert.equal(new URL(h.location.href).searchParams.get('room'), 'KEEP');
  assert.deepEqual(h.navigation, []);
});

test('the same static text and accessible attributes switch repeatedly in both documents', async () => {
  for (const online of [false, true]) {
    const h = await localeHarness({ online });
    const button = h.main.append(new Element('button', { 'aria-label': 'Choose Restorer', title: 'Restorer' }, 'Restorer'));
    const input = h.main.append(new Element('input', { placeholder: 'Restorer' }));
    for (const language of ['en', 'zh-CN', 'es', 'zh-CN', 'en', 'es', 'en']) {
      h.base.setLanguage(language);
      h.locale.localize(h.body);
      const expected = { en: 'Restorer', 'zh-CN': '修复师', es: 'Restaurador' }[language];
      assert.equal(button.textContent, expected, online + '/' + language);
      assert.equal(button.getAttribute('title'), expected);
      assert.equal(input.getAttribute('placeholder'), expected);
      assert.equal(button.getAttribute('aria-label'), h.locale.translate('Choose Restorer'));
    }
  }
});

test('language changes preserve player text, code, input value and open dialog state', async () => {
  const h = await localeHarness({ online: true });
  const user = h.main.append(new Element('span', { 'data-user-text': '' }));
  const nestedName = user.append(new Element('strong', { title: 'Restorer' }, 'Restorer'));
  const code = h.main.append(new Element('span', { 'data-no-localize': '' }, 'Auction 2'));
  const input = h.main.append(new Element('input', { 'aria-label': 'Your nickname' }));
  input.value = 'Restorer';
  const dialog = h.body.append(new Element('dialog', {}, 'Confirm bid'));
  dialog.open = true;
  for (const tag of ['script', 'style', 'noscript']) h.body.append(new Element(tag, {}, 'Restorer'));
  for (const language of ['zh-CN', 'es', 'en']) {
    h.base.setLanguage(language);
    h.locale.localize(h.body);
    assert.equal(nestedName.textContent, 'Restorer');
    assert.equal(nestedName.getAttribute('title'), 'Restorer');
    assert.equal(code.textContent, 'Auction 2');
    assert.equal(input.value, 'Restorer');
    assert.equal(dialog.open, true);
    assert.equal(dialog.textContent, h.locale.translate('Confirm bid'));
    for (const tag of ['script', 'style', 'noscript']) assert.equal(h.body.querySelector(tag).textContent, 'Restorer');
  }
  assert.deepEqual(h.navigation, []);
});

test('new server-derived source text on an existing node replaces its older translation source', async () => {
  const h = await localeHarness({ online: true });
  const label = h.main.append(new Element('span', { 'aria-label': 'Select object 1' }, 'Auction 1'));
  h.base.setLanguage('zh-CN'); h.locale.localize(h.main);
  assert.equal(label.textContent, '第 1 箱');
  label.childNodes[0].nodeValue = 'Auction 2';
  label.setAttribute('aria-label', 'Select object 2');
  h.locale.localize(h.main);
  assert.equal(label.textContent, '第 2 箱');
  h.base.setLanguage('es'); h.locale.localize(h.main);
  assert.equal(label.textContent, h.locale.translate('Auction 2'));
  h.base.setLanguage('en'); h.locale.localize(h.main);
  assert.equal(label.textContent, 'Auction 2');
  assert.equal(label.getAttribute('aria-label'), 'Select object 2');
});

test('already translated validation and copy feedback regain their English source before the next switch', async () => {
  const h = await localeHarness({ online: true, search: '?lang=zh-CN' });
  const error = h.main.append(new Element('p'));
  error.textContent = h.locale.translate('Please enter your nickname.');
  assert.match(error.textContent, /昵称/);
  const copied = h.main.append(new Element('button'));
  copied.textContent = h.locale.translate('Invite copied');
  h.base.setLanguage('es'); h.locale.localize(h.main);
  assert.equal(error.textContent, h.locale.translate('Please enter your nickname.'));
  assert.equal(copied.textContent, h.locale.translate('Invite copied'));
  h.base.setLanguage('en'); h.locale.localize(h.main);
  assert.equal(error.textContent, 'Please enter your nickname.');
  assert.equal(copied.textContent, 'Invite copied');
});

test('Spanish dictionaries cover every existing base, item and multiplayer exact translation', async () => {
  const h = await localeHarness({ online: true, search: '?lang=es' });
  const spanish = h.context.SecondValueSpanish;
  for (const [source, translated, label] of [
    [h.context.__baseWords, spanish.baseWords, 'base'],
    [h.context.__baseItems, spanish.itemNames, 'items'],
    [h.context.__onlineWords, h.context.__onlineSpanishWords, 'online'],
  ]) {
    assert.ok(source && translated, `${label} dictionary exists`);
    const missing = Object.keys(source).filter(key => !Object.hasOwn(translated, key));
    assert.deepEqual(missing, [], `${label} Spanish gaps`);
    for (const key of Object.keys(source)) {
      assert.equal(typeof translated[key], 'string', `${label}: ${key}`);
      assert.ok(translated[key].trim(), `${label}: ${key}`);
      assert.doesNotMatch(translated[key], /[\u3400-\u9fff]|undefined|NaN/, `${label}: ${key}`);
    }
  }
  for (const [key, value] of Object.entries(h.context.__onlineSpanishWords)) assert.equal(h.locale.translate(key), value, key);
});

const baseDynamic = [
  'Auction 2', 'AUCTION 2 · UNCLAIMED PROPERTY', 'Session ledger · 3 crates', '3 crates settled.',
  'Your bid limit: 1,234.', 'Enter a whole-number bid from 1 to 1,234.',
  'Enter a whole-number bid from 88 to 1,234.',
  'You need at least 88 to bid on this crate. Pass this round.',
  'Marlow bought the crate. Your cash is unchanged.', 'ROUND 2 / 3', 'ROUND 2 / 3 · BIDS REVEALED',
  'Early hammer: the highest bid must reach 1.8× the runner-up. Otherwise, another round opens.',
  'The manifest confirms 4 genuine objects. Their identities are still hidden.', 'Confirmed genuine objects: 4 / 6.',
  'Public reveal: object B — Harbor crew badge, Genuine, base 120.', 'The manifest also confirms 3 repairable objects.',
  'Leading bid: Marlow at 1,000.', 'Runner-up bid: 900.', 'Early sale required a leading bid of at least 1,620.',
  '2 / 2 inspections remain for the entire crate.', 'Open round 2 →', 'SALE PREVIEW · VIRTUAL COINS',
  'Choose Restorer', 'Enter as Collector →', 'The risk: Without a matching pair, there is no collection bonus.',
  'Choose Salvager', 'Choose Curator', 'Choose Antique Dealer', 'Choose Dealer',
  'Enter as Dealer →', 'Enter as Antique Dealer →',
  'Select ability object: Replica folding camera', '· Curator', 'Salvager · You',
  '· Antique Dealer', '· Dealer', 'Dealer · You', 'Antique Dealer · You',
  'Authenticate · 2 uses', '01 / Inspect', 'Old Harbor storage · CRATE-123', 'Select object 2',
  'Select repair: Old Harbor mantel clock', 'Select collection: Harbor crew badge',
  '1 / 2 repairs selected', '2 / 2 collection objects selected', '3 / 6 confirmed', 'B · Metal insignia',
  'The manifest confirms 4 genuine objects and 3 repairable objects. It does not identify them.',
  'PRIVATE NOTES · Appraiser', 'Target: object C', '1 / 2 uses left',
  'Confirmed: 3 genuine Old Harbor pieces in this crate. Identity and prices remain unknown.',
  'Repairable. Workshop fee: 25. Restored sale price: 150.',
  'Harbor crew badge. Genuine. Condition: intact. Category: insignia. Theme: Old Harbor. Base sale price: 120.',
  'Harbor crew badge. Genuine. Base sale price: 120.', 'SOLD TO YOU · 1,000 COINS',
  'Original railway map. Genuine. Condition: intact. Category: document. Theme: Railway. Base sale price: 160.',
  'Genuine · Old Harbor · Not repairable', 'Genuine · Old Harbor · Repair 25 → sell 150',
  '120 base', '1,230 after fees', 'You bought the crate for 1,000 and lost 120.',
  'Marlow bought the crate. You kept your 1,000 coins.', 'Marlow & Finch share the win.',
  '+120 profit', 'Marlow → You', '· Appraiser', 'Collector · You',
];

const onlineDynamic = [
  'Auction 2', 'Round 2 / 3', '3 / 4 players', '1 / 2 inspections left', '2 / 3 submitted',
  'Target: object B', 'Inspecting object C', 'Your bid limit: 1,000.', 'Select object 3',
  'Object C', 'Inspect object D', 'Round 2', 'Genuine objects: 4 / 6.', 'Repairable objects: 3.',
  'Leading bid: 1,000.', 'Runner-up: 900.', 'Required for early sale: 1,620.',
  'Repair fee 50 · sale 500 · gain +60', 'Enter a whole-number bid from 1 to 1000, or pass.',
  'Enter a whole-number bid from 88 to 1000, or pass.',
  'Enter a whole-number bid from 1,080 to 2,000, or pass.',
  'You need at least 88 to bid on this crate. Pass this round.',
  'Copy this room code: ABCD12',
];

function assertNumbersPreserved(source, output) {
  // Spanish uses a decimal comma for ratios; permit local separators while
  // requiring the complete numeric sequence (including all grouped digits).
  const numbers = (output.match(/\d+(?:[,.]\d+)*/g) || []).map(number => number.replace(/[,.]/g, ''));
  for (const number of source.match(/\d+(?:[,.]\d+)*/g) || []) {
    assert.ok(numbers.includes(number.replace(/[,.]/g, '')), `${source}: missing ${number}`);
  }
}

test('Spanish localizes representative generated game strings and preserves their numbers', async () => {
  const h = await localeHarness({ search: '?lang=es' });
  for (const source of baseDynamic) {
    const output = h.base.translate(source);
    assert.notEqual(output, source, source);
    assert.doesNotMatch(output, /[\u3400-\u9fff]|undefined|NaN/, source);
    assertNumbersPreserved(source, output);
  }
});

test('Spanish localizes multiplayer status, validation, repair preview and invite fallback strings', async () => {
  const h = await localeHarness({ search: '?lang=es', online: true });
  for (const source of onlineDynamic) {
    const output = h.locale.translate(source);
    assert.notEqual(output, source, source);
    assert.doesNotMatch(output, /[\u3400-\u9fff]|undefined|NaN/, source);
    assertNumbersPreserved(source, output);
  }
});

test('all six role descriptions and every current catalog name localize in Chinese and Spanish', async () => {
  assert.equal(Object.keys(game.ROLES).length, 6);
  const h = await localeHarness({ online: true });
  const roleFields = ['name', 'short', 'tagline', 'passive', 'skill', 'skillText', 'risk'];
  const strings = [
    ...Object.values(game.ROLES).flatMap(role => roleFields.map(field => role[field])),
    ...game.catalogItems(game.RULES_VERSION).map(item => item.name),
  ];
  for (const language of ['zh-CN', 'es']) {
    h.base.setLanguage(language);
    for (const source of strings) {
      const output = h.locale.translate(source);
      assert.notEqual(output, source, `${language}: ${source}`);
      assert.doesNotMatch(output, /undefined|NaN/, source);
      if (language === 'es') assert.doesNotMatch(output, /[\u3400-\u9fff]/, source);
      assertNumbersPreserved(source, output);
    }
  }
});

test('new role controls and processing validation switch in place without losing their source', async () => {
  const h = await localeHarness({ online: true });
  const sources = [
    'Only the matching role can select ability objects.',
    'Select at most two salvage objects.', 'Selected object cannot be salvaged.',
    'Not enough cash to pay the selected processing fees first.',
    'Select exactly three exhibition objects.',
    'Exhibition objects must be genuine, intact and from different categories.',
    'Choose exactly one object to sell to your customer.', 'Your customer buys only genuine, intact objects.',
    'Start a new room to use the expanded roles.',
    'Choose valid locked computer roles.', 'Choose valid processing objects.',
    'No objects selected. Ordinary sale applies with no ability fee.',
    'Customer order', 'Customer premium', 'Packing & delivery',
    'The risk: Pay packing and delivery first. The extra profit is at most 65; low-value sales may lose money.',
    'Select ability object: Original railway map',
  ];
  const labels = sources.map(source => h.main.append(new Element('p', {}, source)));
  const button = h.main.append(new Element('button', { 'aria-label': 'Choose Curator' }, 'Curator'));
  const user = h.main.append(new Element('span', { 'data-user-text': '' }, 'Broker'));
  for (const language of ['zh-CN', 'es', 'en', 'zh-CN', 'en']) {
    h.base.setLanguage(language);
    h.locale.localize(h.main);
    labels.forEach((label, index) => {
      const source = sources[index];
      assert.equal(label.textContent, h.locale.translate(source), `${language}: ${source}`);
      if (language !== 'en') assert.notEqual(label.textContent, source, source);
      assertNumbersPreserved(source, label.textContent);
    });
    assert.equal(button.getAttribute('aria-label'), h.locale.translate('Choose Curator'));
    assert.equal(button.textContent, { en: 'Curator', 'zh-CN': '策展人', es: 'Curador' }[language]);
    assert.equal(user.textContent, 'Broker');
  }
  assert.deepEqual(h.navigation, []);
});

test('reserve labels, rules and validation switch in place in solo and multiplayer', async () => {
  const sources = [
    'Auction-house reserve', 'Minimum bid · fixed for this crate',
    'A winning bid must meet the reserve. This amount stays fixed for all three rounds.',
    'Your cash is below the reserve. You can pass this round.',
    'No bid met the reserve. Nobody pays.',
    'New sessions: The auction house publishes a reserve before bidding, around 10% of the crate’s ordinary sale value (8–12%). Role abilities do not affect it. It stays fixed for all three rounds; even a sole bid must meet it. If the crate goes unsold, nobody pays.',
    'Choose a valid reserve price.',
    'Enter a whole-number bid from 88 to 1,000.',
    'Enter a whole-number bid from 88 to 1000, or pass.',
    'You need at least 88 to bid on this crate. Pass this round.',
  ];
  for (const online of [false, true]) {
    const h = await localeHarness({ online });
    const labels = sources.map(source => h.main.append(new Element('p', {}, source)));
    for (const language of ['zh-CN', 'es', 'en', 'zh-CN', 'en']) {
      h.base.setLanguage(language);
      h.locale.localize(h.main);
      labels.forEach((label, index) => {
        const source = sources[index];
        assert.equal(label.textContent, h.locale.translate(source), `${online}: ${language}: ${source}`);
        if (language !== 'en') assert.notEqual(label.textContent, source, source);
        assert.doesNotMatch(label.textContent, /undefined|NaN/, source);
        if (language === 'es') assert.doesNotMatch(label.textContent, /[\u3400-\u9fff]/, source);
        assertNumbersPreserved(source, label.textContent);
      });
    }
    assert.deepEqual(h.navigation, []);
  }
});

test('crate source stories, valuation copy and reveal controls switch in place in both game modes', async () => {
  assert.deepEqual(Object.keys(game.SOURCES).sort(), ['estate', 'theater', 'workshop']);
  const sources = [
    'SOURCE OF THIS CRATE', 'Source of this crate',
    ...Object.values(game.SOURCES).flatMap(source => ['name', 'evidence', 'hint', 'story'].map(field => source[field])),
    'A clue to the mix. Exact identities and values remain hidden.',
    'New sessions: Each crate has a public source. The source changes draw probabilities, not guaranteed contents. Identities and ordinary prices are fixed before bidding.',
    'After settlement, compare the buyer’s actual result with other players’ hypothetical returns at the same winning bid. Fees and available cash are included; these comparisons do not change anyone’s balance.',
    'THE VALUE AT THIS TABLE', 'The value at this table', 'Ordinary crate value', 'One crate. Different opportunities.',
    'Actual sale', 'If you had won', 'Not enough cash', 'Winning price', 'Sale after fees',
    'This bid exceeds your cash.', 'Cash before bidding',
    "Hypothetical results use this winning price and each player's cash before bidding. They are not earnings.",
    'Role advantage', 'Profit at this price', 'Ordinary sale', 'Sealed bids opened',
    'No hammer this round', 'SOLD', 'Crate unveiled', 'Sale settled', 'Your result',
    'Sound off', 'Sound on', 'Auction sounds', 'Sound paused',
    'Music off', 'Music on', 'Music paused', 'Background music', 'Click to enable audio',
    'Background music:', 'Edited for volume and looping.',
  ];
  for (const online of [false, true]) {
    const h = await localeHarness({ online });
    const labels = sources.map(source => h.main.append(new Element('p', {}, source)));
    const sound = h.main.append(new Element('button', { 'aria-label': 'Sound off', title: 'Sound off' }, 'Sound off'));
    const music = h.main.append(new Element('button', { 'aria-label': 'Background music', title: 'Click to enable audio' }, 'Music paused'));
    const musicCredit = h.main.append(new Element('a', { 'data-no-localize': '', href: 'https://opengameart.org/content/soft-mysterious-harp-loop' }, 'Soft Mysterious Harp Loop — Jordy Hake (VWolfdog) · CC BY 3.0'));
    const user = h.main.append(new Element('span', { 'data-user-text': '' }, 'Sound on'));
    const price = h.main.append(new Element('span', {}, '1,234'));
    const profit = h.main.append(new Element('span', {}, '−75'));
    for (const language of ['zh-CN', 'es', 'en', 'es', 'zh-CN', 'en']) {
      h.base.setLanguage(language);
      h.locale.localize(h.main);
      labels.forEach((label, index) => {
        const source = sources[index];
        assert.equal(label.textContent, h.locale.translate(source), `${online}: ${language}: ${source}`);
        if (language !== 'en') assert.notEqual(label.textContent, source, `${language}: ${source}`);
        if (language === 'es') assert.doesNotMatch(label.textContent, /[\u3400-\u9fff]/, source);
        assert.doesNotMatch(label.textContent, /undefined|NaN/, source);
      });
      assert.equal(sound.getAttribute('aria-label'), h.locale.translate('Sound off'));
      assert.equal(sound.getAttribute('title'), h.locale.translate('Sound off'));
      assert.equal(music.getAttribute('aria-label'), h.locale.translate('Background music'));
      assert.equal(music.getAttribute('title'), h.locale.translate('Click to enable audio'));
      assert.equal(music.textContent, h.locale.translate('Music paused'));
      assert.equal(musicCredit.textContent, 'Soft Mysterious Harp Loop — Jordy Hake (VWolfdog) · CC BY 3.0');
      assert.equal(musicCredit.getAttribute('href'), 'https://opengameart.org/content/soft-mysterious-harp-loop');
      assert.equal(user.textContent, 'Sound on');
      assert.equal(price.textContent, '1,234');
      assert.equal(profit.textContent, '−75');
    }
    assert.deepEqual(h.navigation, []);
  }
});

test('private notebook distinguishes facts and guesses while language changes preserve estimates and marks', async () => {
  const sources = [
    'Private notes', 'Your private notebook',
    'Only you can see these notes. Saved on this device for this crate.',
    'Only you can see these notes. Saved in this tab for this crate.',
    'Confirmed information', 'Your judgment', 'No confirmed identity yet.',
    'Condition', 'Intact', 'Damaged', 'Unrepairable', 'Base price', 'Catalog range',
    'Authenticity', 'Genuine', 'Reproduction',
    'Neutral', 'Interested', 'Uncertain', 'Your estimate',
    'Optional whole-number estimate', 'Use a whole number from 0 to 999,999.',
    'Your estimates', 'Filled estimates',
    'These are your estimates, not confirmed values or a recommended bid.',
    'Notes cannot be saved in this browser. Keep this tab open.',
    'Close private notes', 'Source record',
    'Public reveal', 'Private note', 'Crate opened', 'Unconfirmed',
    ...['A', 'B', 'C', 'D', 'E', 'F'].map(letter => `Object ${letter}`),
  ];
  for (const online of [false, true]) {
    const h = await localeHarness({ online });
    const notebook = h.body.append(new Element('dialog', { 'aria-label': 'Your private notebook' }));
    notebook.open = true;
    const labels = sources.map(source => notebook.append(new Element('span', {}, source)));
    const zero = notebook.append(new Element('input', { placeholder: 'Optional whole-number estimate' }));
    zero.value = '0';
    const estimate = notebook.append(new Element('input', { placeholder: 'Optional whole-number estimate' }));
    estimate.value = '1234';
    const neutral = notebook.append(new Element('button', { 'aria-pressed': 'false' }, 'Neutral'));
    const interested = notebook.append(new Element('button', { 'aria-pressed': 'true' }, 'Interested'));
    const summary = notebook.append(new Element('span', { 'data-user-text': '' }, '1,234'));
    for (const language of ['zh-CN', 'es', 'en', 'zh-CN', 'es', 'en']) {
      h.base.setLanguage(language);
      h.locale.localize(notebook);
      labels.forEach((label, index) => {
        const source = sources[index];
        assert.equal(label.textContent, h.locale.translate(source), `${online}: ${language}: ${source}`);
        if (language !== 'en') assert.notEqual(label.textContent, source, `${language}: ${source}`);
        if (language === 'es') assert.doesNotMatch(label.textContent, /[\u3400-\u9fff]/, source);
        assertNumbersPreserved(source, label.textContent);
      });
      assert.equal(notebook.getAttribute('aria-label'), h.locale.translate('Your private notebook'));
      assert.equal(estimate.getAttribute('placeholder'), h.locale.translate('Optional whole-number estimate'));
      assert.equal(zero.value, '0');
      assert.equal(estimate.value, '1234');
      assert.equal(summary.textContent, '1,234');
      assert.equal(neutral.getAttribute('aria-pressed'), 'false');
      assert.equal(interested.getAttribute('aria-pressed'), 'true');
      assert.equal(notebook.open, true);
      const facts = ['Public reveal', 'Private note', 'Unconfirmed'].map(source => h.locale.translate(source));
      assert.equal(new Set(facts).size, 3);
      assert.ok(!facts.includes(h.locale.translate('Your estimate')));
    }
    assert.deepEqual(h.navigation, []);
  }
});

test('guided crate copy switches live without changing a draft bid, selected sale or receipt amounts', async () => {
  const sources = [
    'Learn in one crate', 'One guided crate', 'Practice example · Restorer',
    'Scripted bids. Your real games and cash are untouched.', 'Close tutorial',
    'Read clues', 'Seal a bid', 'Reveal the crate', 'Choose a sale',
    'Choose an object and read the public clue.', 'Final-round practice',
    'This example starts in round 3.', 'Why the final round?',
    'Earlier rounds can sell early at 1.8× or 1.3× the runner-up bid. In the final round, the highest valid bid wins.',
    'You have priority if bids tie.', 'What you know',
    'A silhouette suggests a category, not an exact identity.',
    'This object is public. Everyone sees the same identity and value.',
    'Continue to bidding', 'Enter a sealed bid, then review it.',
    "The rival's quote is scripted for this lesson and stays hidden until reveal.",
    'Practice cash', 'Your bid', 'Review sealed bid',
    'Nothing has been submitted. You can still return and edit.',
    'Return and edit', 'Confirm and reveal', 'Back to clues',
    'Enter a whole-number practice bid from 40 to 1,000.', 'Practice rival',
    'Your bid wins.', 'Equal bids: your published priority wins.',
    'Your bid did not win. Your practice cash stays unchanged.', 'Try another bid',
    'Compare sale choices', 'Continue to sale choices', 'Compare two sale choices.',
    "You are comparing the scripted winner's crate. This does not change your cash.",
    'Ordinary sale', 'Repair the clock', 'Choose a sale, then check the full receipt.',
    'Confirm practice sale', 'Finish comparison', 'Practice receipt',
    'Hypothetical comparison', 'Your practice cash', 'Profit after bid and fees',
    'A better repair cannot make every purchase profitable.',
    'Replay this crate', 'Finish tutorial', 'Start again',
    'This is an isolated lesson. Closing it leaves your real auction exactly as it was.',
    'Source', 'Genuine objects', 'Repairable objects', 'Repair fee',
    'Sealed bid', 'Repair sale price', 'Back to reveal', 'Choose an object first.',
    'Choose a valid practice object.', 'Reveal the practice bids first.',
    'That practice action is unavailable at this step.',
    'The practice engine is unavailable.', 'The practice catalog is unavailable.',
  ];
  for (const online of [false, true]) {
    const h = await localeHarness({ online });
    const tutorial = h.body.append(new Element('dialog', { 'aria-label': 'Learn in one crate' }));
    tutorial.open = true;
    const labels = sources.map(source => tutorial.append(new Element('span', {}, source)));
    const bid = tutorial.append(new Element('input', { 'aria-label': 'Your bid' }));
    bid.value = '300';
    const sale = tutorial.append(new Element('button', { 'aria-pressed': 'true' }, 'Repair the clock'));
    const amounts = ['40', '400', '445', '45', '1,000'].map(value => tutorial.append(new Element('strong', {}, value)));
    for (const language of ['zh-CN', 'es', 'en', 'es', 'zh-CN', 'en']) {
      h.base.setLanguage(language); h.locale.localize(tutorial);
      labels.forEach((label, index) => {
        const source = sources[index];
        assert.equal(label.textContent, h.locale.translate(source), `${online}: ${language}: ${source}`);
        if (language !== 'en') assert.notEqual(label.textContent, source, `${language}: ${source}`);
        if (language === 'es') assert.doesNotMatch(label.textContent, /[\u3400-\u9fff]/, source);
        assertNumbersPreserved(source, label.textContent);
      });
      assert.equal(tutorial.getAttribute('aria-label'), h.locale.translate('Learn in one crate'));
      assert.equal(bid.getAttribute('aria-label'), h.locale.translate('Your bid'));
      assert.equal(bid.value, '300');
      assert.equal(sale.getAttribute('aria-pressed'), 'true');
      assert.equal(tutorial.open, true);
      assert.deepEqual(amounts.map(element => element.textContent), ['40', '400', '445', '45', '1,000']);
    }
    assert.deepEqual(h.navigation, []);
  }
});

test('room recovery translates blocked actions while preserving player names and offline clocks', async () => {
  const sources = [
    'Room recovery', 'Offline for', 'Without room updates for', 'Offline time unavailable',
    'The room reports these players as offline.',
    'Your connection is interrupted. Other players’ status may be out of date.',
    'This player still needs to submit a bid or pass.', 'Their sealed choice is already submitted.',
    'This player still needs to get ready.', 'This player is already ready.',
    'The host needs to start the auction.', 'The host needs to open the next round.',
    'The winner needs to settle this crate.',
    'The host needs to open the next crate or finish the session.',
    'This player has no pending action in this stage.', 'How to return to this room',
    'Return in the original browser tab, then refresh it or retry the connection.',
    'A room code alone cannot restore your previous seat in a new tab.',
    'Rooms expire after six hours with no player activity.',
    'Offline status begins after 15 seconds without a room update.',
    'Bids, sales and host actions never happen automatically while someone is offline.',
  ];
  const h = await localeHarness({ online: true });
  const labels = sources.map(source => h.main.append(new Element('p', {}, source)));
  const user = h.main.append(new Element('span', { 'data-user-text': '' }, 'Room recovery'));
  const clock = h.main.append(new Element('time', { 'data-no-localize': '' }, '01:45'));
  for (const language of ['zh-CN', 'es', 'en', 'es', 'zh-CN', 'en']) {
    h.base.setLanguage(language); h.locale.localize(h.main);
    labels.forEach((label, index) => {
      const source = sources[index];
      assert.equal(label.textContent, h.locale.translate(source), `${language}: ${source}`);
      if (language !== 'en') assert.notEqual(label.textContent, source, `${language}: ${source}`);
      if (language === 'es') assert.doesNotMatch(label.textContent, /[\u3400-\u9fff]/, source);
      assertNumbersPreserved(source, label.textContent);
    });
    assert.equal(user.textContent, 'Room recovery');
    assert.equal(clock.textContent, '01:45');
  }
  assert.deepEqual(h.navigation, []);
});
