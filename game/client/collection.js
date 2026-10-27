/* A browser-local record of publicly settled discoveries, never a game inventory. */
(function (root, factory) {
  const collection = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = collection;
  else root.SecondValueCollection = collection;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const STORAGE_KEY = 'secondvalue:discoveries:v1';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const money = value => Number(value).toLocaleString('en-US');
  const CONDITIONS = {intact:'Intact',damaged:'Damaged',unrepairable:'Unrepairable'};
  const CATEGORIES = {mechanical:'mechanical',ceramic:'ceramic',insignia:'insignia',imaging:'imaging',instrument:'instrument',document:'document'};

  function selectEntries(items, discoveredIdsArray, options = {}) {
    const entries = Array.isArray(items) ? items.map((item,index) => ({item,index})) : [];
    // An anonymous catalog must not be ordered or narrowed by unrevealed facts.
    if (options?.filter !== 'discovered') return entries;
    const discovered = new Set(Array.isArray(discoveredIdsArray) ? discoveredIdsArray : []);
    const category = Object.hasOwn(CATEGORIES,options?.category) ? options.category : 'all';
    const sort = ['price-asc','price-desc'].includes(options?.sort) ? options.sort : 'catalog';
    let visible = entries.filter(({item}) => item && discovered.has(item.catalogId));
    if (category !== 'all') visible = visible.filter(({item}) => item.category === category);
    if (sort !== 'catalog') {
      const direction = sort === 'price-asc' ? 1 : -1;
      const price = item => typeof item.base === 'number' && Number.isFinite(item.base) ? item.base : 0;
      visible.sort((a,b) => direction * (price(a.item) - price(b.item)) || a.index - b.index);
    }
    return visible;
  }

  function createBook(options = {}) {
    const engine = () => options.engine || root.SecondValue;
    const artwork = () => options.art || root.SecondValueArt;
    const document = options.document || root.document;
    const locale = () => options.locale || root.SecondValueOnlineLocale || root.SecondValueLocale;
    const found = new Set(), recent = new Map();
    let available = true, dialog = null, selected = null, filter = 'all', category = 'all', sort = 'catalog', opener = null;
    function catalog(version) {
      try {
        const E = engine();
        const items = E?.catalogItems(version === undefined ? E.RULES_VERSION : version);
        return Array.isArray(items) ? items : [];
      } catch { return []; }
    }
    function catalogMap() { return new Map(catalog().map(item => [item.catalogId,item])); }
    function storage() {
      try { return Object.hasOwn(options,'storage') ? options.storage : root.localStorage; }
      catch { available = false; return null; }
    }
    function parseFound(text) {
      let raw;
      try { raw = JSON.parse(text || 'null'); } catch { return null; }
      if (raw?.version !== 1 || !Array.isArray(raw.found) || raw.found.length > 2048) return null;
      const allowed = catalogMap();
      return [...new Set(raw.found.filter(id => typeof id === 'string' && allowed.has(id)))];
    }
    function read() {
      const target = storage();
      try {
        if (!target || typeof target.getItem !== 'function') { available = false; return []; }
        const text = target.getItem(STORAGE_KEY);
        available = available && typeof target.setItem === 'function';
        return parseFound(text) || [];
      } catch { available = false; return []; }
    }
    function merge() { for (const id of read()) found.add(id); }
    function write() {
      const target = storage();
      try {
        if (!target || typeof target.setItem !== 'function') { available = false; return; }
        const allowed = catalogMap();
        const ids = [...found].filter(id => allowed.has(id)).sort();
        target.setItem(STORAGE_KEY,JSON.stringify({version:1,found:ids}));
        available = true;
      } catch { available = false; }
    }
    function validSettlement(input) {
      if (!input || !['result','ended'].includes(input.phase) || input.sold !== true || input.active !== true || !Number.isInteger(input.rulesVersion) || typeof input.key !== 'string' || !input.key.trim() || input.key.length > 512 || !Array.isArray(input.lots) || input.lots.length !== 6) return null;
      const allowed = new Set(catalog(input.rulesVersion).map(item => item.catalogId));
      if (!allowed.size) return null;
      const ids = [];
      for (const lot of input.lots) {
        if (!lot || lot.known !== true || lot.source !== 'Crate opened' || typeof lot.catalogId !== 'string' || !allowed.has(lot.catalogId)) return null;
        ids.push(lot.catalogId);
      }
      return new Set(ids).size === 6 ? ids : null;
    }
    function recordSettlement(input) {
      const ids = validSettlement(input);
      if (!ids) return [];
      const signature = [...ids].sort().join('|');
      if (recent.has(input.key)) {
        const previous = recent.get(input.key);
        return previous.signature === signature ? [...previous.ids] : [];
      }
      // Merge immediately before writing; storage events also reconcile writes
      // that race between this read and the synchronous localStorage setItem.
      merge();
      const fresh = ids.filter(id => !found.has(id));
      for (const id of ids) found.add(id);
      write();
      recent.set(input.key,{signature,ids:[...fresh]});
      if (recent.size > 32) recent.delete(recent.keys().next().value);
      if (dialog?.open) renderDialog(true);
      return fresh;
    }
    function snapshot() {
      merge();
      return {found:[...found].filter(id => catalogMap().has(id)).sort(),count:found.size,total:catalog().length,storageAvailable:available};
    }
    function sprite(item, className = '') {
      const visual = artwork()?.visualFor(item,true);
      if (!visual || typeof visual.sheet !== 'string' || !Number.isInteger(visual.columns) || !Number.isInteger(visual.rows) || visual.columns < 1 || visual.rows < 1) return '';
      const x = visual.columns > 1 ? 100 * visual.column / (visual.columns - 1) : 0;
      const y = visual.rows > 1 ? 100 * visual.row / (visual.rows - 1) : 0;
      return `<span class="collection-art ${escape(className)}" aria-hidden="true" style="--collection-art-aspect:${visual.sheet === 'assets/catalog-lots-v1.png' ? 1.5 : 1};background-image:url('${escape(visual.sheet)}');background-size:${visual.columns*100}% ${visual.rows*100}%;background-position:${x}% ${y}%"></span>`;
    }
    function number(index) { return String(index + 1).padStart(3,'0'); }
    function cardMarkup(item,index) {
      const known = found.has(item.catalogId);
      return `<button type="button" class="collection-card${known ? ' is-discovered' : ' is-undiscovered'}" data-collection-index="${index}" aria-pressed="${item.catalogId === selected}"><span class="collection-card-top"><span class="collection-number" data-no-localize>${number(index)}</span><span>${known ? 'Discovered' : 'Identity undiscovered'}</span></span>${known ? `<span class="collection-card-art-frame">${sprite(item)}</span>` : '<span class="collection-unknown-art" aria-hidden="true"><span>?</span></span>'}<span class="collection-card-copy"><strong>${known ? escape(item.name) : 'Undiscovered object'}</strong>${known ? `<span class="collection-card-meta"><span>${item.rarity === 'rare' ? 'Rare find' : item.genuine ? 'Genuine' : 'Reproduction'}</span><span class="collection-price" data-no-localize>${money(item.base)}</span></span>` : ''}</span></button>`;
    }
    function storyMarkup(item, known) {
      if (known !== true || !item || typeof item.catalogId !== 'string') return '';
      // Use canonical catalog metadata, never arbitrary extra fields in a room
      // projection. A caller still has to explicitly confirm this identity.
      const canonical = catalogMap().get(item.catalogId);
      if (!canonical || canonical.rarity !== 'rare' || canonical.shape !== item.shape) return '';
      return `<section class="collection-object-story"><span class="collection-rarity">Rare find</span>${canonical.story ? `<p>${escape(canonical.story)}</p>` : ''}${canonical.provenance ? `<small>${escape(canonical.provenance)}</small>` : ''}</section>`;
    }
    function newDiscoveriesMarkup(ids) {
      if (!Array.isArray(ids)) return '';
      const allowed = catalogMap(), unique = [...new Set(ids)].filter(id => found.has(id) && allowed.has(id));
      if (!unique.length) return '';
      return `<section class="collection-new-discoveries" aria-label="New discoveries this crate"><div><span class="collection-new-heading"><strong data-no-localize>${unique.length}</strong><span>New discoveries this crate</span></span><p>${unique.map(id => `<span>${escape(allowed.get(id).name)}</span>`).join('<span aria-hidden="true" data-no-localize> · </span>')}</p></div><button type="button" data-open-collection>View discovery book</button></section>`;
    }
    function detailMarkup(item,index) {
      if (!item || !found.has(item.catalogId)) return `<div class="collection-detail-unknown"><span class="collection-unknown-mark" aria-hidden="true">?</span><h3>Undiscovered object</h3>${item ? `<span class="collection-number" data-no-localize>${number(index)}</span>` : ''}<p>This item has not been discovered. Its identity, value and story remain hidden.</p><p>Settle a purchased crate to record its publicly revealed objects. Everyone at the table can discover them.</p></div>`;
      const theme = engine()?.THEMES?.[item.theme] || 'No theme';
      const image = sprite(item,'is-detail');
      const detailImage = root.SecondValueArtZoom?.trigger?.(item,true,image) ?? image;
      return `<div class="collection-detail-heading"><span class="collection-number" data-no-localize>${number(index)}</span><span>${item.rarity === 'rare' ? 'Rare find' : 'Discovered'}</span></div><h3>${escape(item.name)}</h3>${detailImage}<div class="collection-detail-price"><span>Ordinary sale</span><strong data-no-localize>${money(item.base)}</strong></div><p class="collection-currency">Virtual coins</p><div class="collection-detail-tags"><span>${item.genuine ? 'Genuine' : 'Reproduction'}</span><span>${CONDITIONS[item.condition] || ''}</span><span>${escape(theme)}</span><span>${escape(CATEGORIES[item.category] || '')}</span></div>${item.genuine && item.condition === 'damaged' && item.repair ? `<dl class="collection-repair"><div><dt>Repair fee</dt><dd data-no-localize>${money(item.repair.cost)}</dd></div><div><dt>Restored sale price</dt><dd data-no-localize>${money(item.repair.sale)}</dd></div></dl>` : ''}${item.story ? `<div class="collection-story"><span>Object story</span><p>${escape(item.story)}</p></div>` : ''}${item.provenance ? `<div class="collection-provenance"><span>From the archive</span><p>${escape(item.provenance)}</p></div>` : ''}`;
    }
    function localize(node) { locale()?.localize?.(node); }
    function languagePicker() {
      const language = root.SecondValueLocale?.language || locale()?.language || 'en';
      return `<label class="collection-language" data-no-localize><select id="collection-language" aria-label="Language / 语言 / Idioma"><option value="en" lang="en" ${language==='en'?'selected':''}>English</option><option value="zh-CN" lang="zh-CN" ${language==='zh-CN'?'selected':''}>中文</option><option value="es" lang="es" ${language==='es'?'selected':''}>Español</option></select></label>`;
    }
    function filtersMarkup() {
      return `<div class="collection-browse-tools"><div class="collection-filters" role="group" aria-label="Discovery book"><button type="button" id="collection-all" data-collection-filter="all" aria-pressed="${filter === 'all'}">All objects</button><button type="button" id="collection-discovered" data-collection-filter="discovered" aria-pressed="${filter === 'discovered'}">Discovered only</button></div><div class="collection-selectors"><label class="collection-select"><span>Category</span><select id="collection-category"><option value="all"${category === 'all' ? ' selected' : ''}>All categories</option>${Object.keys(CATEGORIES).map(value => `<option value="${value}"${category === value ? ' selected' : ''}>${CATEGORIES[value]}</option>`).join('')}</select></label><label class="collection-select"><span>Sort by</span><select id="collection-sort"><option value="catalog"${sort === 'catalog' ? ' selected' : ''}>Catalog order</option><option value="price-asc"${sort === 'price-asc' ? ' selected' : ''}>Price: low to high</option><option value="price-desc"${sort === 'price-desc' ? ' selected' : ''}>Price: high to low</option></select></label><button type="button" id="collection-reset">Reset filters</button></div></div>`;
    }
    function renderDialog(preserve = false, refreshStorage = true) {
      if (!dialog) return;
      if (refreshStorage) merge();
      const items = catalog();
      const visible = selectEntries(items,[...found],{filter,category,sort});
      if (!visible.some(({item}) => item.catalogId === selected)) selected = visible[0]?.item.catalogId || null;
      const active = document.activeElement, focusId = dialog.contains(active) ? active.id : null;
      const focusIndex = dialog.contains(active) ? active.getAttribute('data-collection-index') : null;
      const scroll = dialog.scrollTop;
      const detailScroll = dialog.querySelector('.collection-detail')?.scrollTop || 0;
      const selectedIndex = items.findIndex(item => item.catalogId === selected);
      dialog.innerHTML = `<div class="collection-shell"><header class="collection-header"><div><span class="collection-eyebrow">DISCOVERY ARCHIVE</span><h2 id="collection-title">Discovery book</h2><p>Seen at the table, remembered here.</p></div><div class="collection-header-tools">${languagePicker()}<button type="button" id="collection-close" class="collection-close" aria-label="Close discovery book">×</button></div></header><div class="collection-summary"><div><h3>Objects with a second story.</h3><p>Discoveries do not grant coins, change prices or improve abilities.</p></div><div class="collection-progress"><span>Discovered</span><strong data-no-localize>${found.size} / ${items.length}</strong></div></div>${filtersMarkup()}${visible.length ? `<div class="collection-layout"><div class="collection-grid">${visible.map(({item,index}) => cardMarkup(item,index)).join('')}</div><aside class="collection-detail" aria-live="polite">${detailMarkup(items[selectedIndex],selectedIndex)}</aside></div>` : '<div class="collection-empty"><h3>No matching discoveries.</h3></div>'}<footer class="collection-footer"><p>${available ? 'Discoveries stay in this browser. Clearing site data removes them; they do not sync across devices.' : 'Storage is unavailable. Discoveries will last only while this page stays open.'}</p></footer></div>`;
      localize(dialog);
      if (preserve) {
        dialog.scrollTop = scroll;
        const detail = dialog.querySelector('.collection-detail');
        if (detail) detail.scrollTop = detailScroll;
        const replacement = focusId ? dialog.querySelector(`#${focusId}`) : focusIndex !== null ? dialog.querySelector(`[data-collection-index="${focusIndex}"]`) : null;
        replacement?.focus({preventScroll:true});
      }
    }
    function ensureDialog() {
      if (dialog || !document?.createElement || !document.body) return dialog;
      dialog = document.createElement('dialog');
      dialog.className = 'collection-dialog';
      dialog.setAttribute('aria-labelledby','collection-title');
      dialog.addEventListener('click',event => {
        const button = event.target.closest?.('button');
        if (button?.id === 'collection-close') dialog.close();
        else if (button?.hasAttribute('data-collection-filter') || button?.id === 'collection-reset') {
          filter = button?.getAttribute('data-collection-filter') === 'discovered' ? 'discovered' : 'all';
          if (filter === 'all') { category = 'all'; sort = 'catalog'; }
          renderDialog(true);
        }
        else if (button?.hasAttribute('data-collection-index')) {
          const index = Number(button.getAttribute('data-collection-index'));
          selected = catalog()[index]?.catalogId || selected;
          renderDialog(true);
        } else if (event.target === dialog) {
          const rect = dialog.getBoundingClientRect();
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
        }
      });
      dialog.addEventListener('change',event => {
        if(event.target.id==='collection-language') (root.SecondValueLocale || locale())?.setLanguage?.(event.target.value);
        else if (event.target.id === 'collection-category') {
          category = Object.hasOwn(CATEGORIES,event.target.value) ? event.target.value : 'all';
          if (category !== 'all') filter = 'discovered';
          renderDialog(true);
        } else if (event.target.id === 'collection-sort') {
          sort = ['price-asc','price-desc'].includes(event.target.value) ? event.target.value : 'catalog';
          if (sort !== 'catalog') filter = 'discovered';
          renderDialog(true);
        }
      });
      dialog.addEventListener('close',() => {
        const target = opener?.isConnected ? opener : document.querySelector('[data-open-collection]');
        target?.focus?.({preventScroll:true});
      });
      document.body.append(dialog);
      return dialog;
    }
    function open(trigger) {
      if (!ensureDialog()) return;
      opener = trigger || document.activeElement;
      renderDialog();
      if (!dialog.open) dialog.showModal();
      dialog.querySelector('#collection-close')?.focus({preventScroll:true});
    }
    document?.addEventListener?.('click',event => {
      const button = event.target.closest?.('[data-open-collection]');
      if (!button) return;
      event.preventDefault();
      open(button);
    });
    root.addEventListener?.('secondvalue:languagechange',() => { if (dialog?.open) renderDialog(true); });
    root.addEventListener?.('storage',event => {
      if (event.key !== null && event.key !== STORAGE_KEY) return;
      const target = storage();
      if (event.storageArea && event.storageArea !== target) return;
      if (event.newValue === null) {
        found.clear(); recent.clear(); selected = null;
        if (dialog?.open) renderDialog(true,false);
        return;
      }
      const notified = parseFound(event.newValue);
      if (!notified || event.key === null) return;
      for (const id of notified) found.add(id);
      try {
        if (!target || typeof target.getItem !== 'function') { available = false; return; }
        const text = target.getItem(STORAGE_KEY);
        // A queued pre-clear write event must not repopulate a removed archive.
        // A real later discovery writes a non-null record before its event fires.
        if (text === null) {
          found.clear(); recent.clear(); selected = null;
        } else {
          const disk = parseFound(text) || [], persisted = new Set(disk);
          for (const id of disk) found.add(id);
          // Echo only a genuine union change. Once both tabs have the same IDs,
          // receiving this write produces no further localStorage write/event.
          if ([...found].some(id => !persisted.has(id))) write();
        }
      } catch { available = false; }
      if (dialog?.open) renderDialog(true,false);
    });
    return Object.freeze({recordSettlement,newDiscoveriesMarkup,storyMarkup,snapshot,open});
  }
  return Object.freeze({...createBook(),createBook,selectEntries,STORAGE_KEY});
});
