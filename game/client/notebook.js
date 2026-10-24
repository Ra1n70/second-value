/* Private, player-authored notes. This module receives only the caller's safe lot projection. */
(function (root, factory) {
  const notebook = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = notebook;
  else root.SecondValueNotebook = notebook;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const PREFIX = 'secondvalue:notebook:v1:';
  const LIMIT = 999999;
  const MARKS = ['neutral','interested','uncertain'];
  const MARK_LABELS = {neutral:'Neutral',interested:'Interested',uncertain:'Uncertain'};
  const SOURCES = ['Public reveal','Private note','Crate opened','Unconfirmed'];
  const CONDITIONS = {intact:'Intact',damaged:'Damaged',unrepairable:'Unrepairable'};
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const money = value => value.toLocaleString('en-US');
  const whole = value => Number.isSafeInteger(value) && value >= 0;
  const validSlot = slot => Number.isInteger(slot) && slot >= 0 && slot < 6;
  const boundButtons = new WeakSet();
  let current = null;

  function localize(node) { (root.SecondValueOnlineLocale || root.SecondValueLocale)?.localize?.(node); }
  function parseEstimate(value) {
    const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
    if (!/^\d{1,6}$/.test(text)) return null;
    const parsed = Number(text);
    return whole(parsed) && parsed <= LIMIT ? parsed : null;
  }
  function storageKey(key) { return typeof key === 'string' && key.trim() && key.length <= 512 ? PREFIX + encodeURIComponent(key) : null; }
  function normalizeNotes(raw) {
    const result = {version:1,items:{}};
    for (let slot = 0; slot < 6; slot++) {
      const entry = raw?.version === 1 && raw.items && typeof raw.items === 'object' && !Array.isArray(raw.items) ? raw.items[slot] : null;
      const estimate = parseEstimate(entry?.estimate);
      result.items[slot] = {mark:MARKS.includes(entry?.mark) ? entry.mark : 'neutral',estimate:estimate === null ? '' : String(estimate)};
    }
    return result;
  }
  function readNotes(storage, key) {
    const id = storageKey(key);
    if (!id || !storage?.getItem) return {notes:normalizeNotes(null),available:false};
    let raw;
    try { raw = storage.getItem(id); } catch { return {notes:normalizeNotes(null),available:false}; }
    try { return {notes:normalizeNotes(JSON.parse(raw || 'null')),available:true}; }
    catch { return {notes:normalizeNotes(null),available:true}; }
  }
  function loadNotes(storage, key) { return readNotes(storage,key).notes; }
  function normalizeLots(lots) {
    if (!Array.isArray(lots)) return [];
    const seen = new Set();
    return lots.filter(lot => lot && validSlot(lot.slot) && !seen.has(lot.slot) && seen.add(lot.slot)).map(lot => {
      const safe = {slot:lot.slot,label:typeof lot.label === 'string' ? lot.label.slice(0,160) : `Object ${String.fromCharCode(65+lot.slot)}`,known:lot.known === true,source:lot.known === true && SOURCES.includes(lot.source) ? lot.source : 'Unconfirmed'};
      if (lot.range && whole(lot.range.min) && whole(lot.range.max) && lot.range.max >= lot.range.min) safe.range = {min:lot.range.min,max:lot.range.max};
      if (safe.known) {
        if (whole(lot.base)) safe.base = lot.base;
        if (typeof lot.genuine === 'boolean') safe.genuine = lot.genuine;
        if (Object.hasOwn(CONDITIONS,lot.condition)) safe.condition = lot.condition;
      }
      return safe;
    }).sort((a,b) => a.slot-b.slot);
  }
  function estimateSummary(notes, lots) {
    const slots = Array.isArray(lots) ? normalizeLots(lots).map(lot => lot.slot) : [0,1,2,3,4,5];
    let count = 0, total = 0;
    for (const slot of slots) {
      const value = parseEstimate(notes?.items?.[slot]?.estimate);
      if (value !== null) { count++; total += value; }
    }
    return {count,total};
  }
  function factsMarkup(lot) {
    const safe = normalizeLots([lot])[0];
    if (!safe) return '';
    const lines = [];
    if (safe.known) {
      if (whole(safe.base)) lines.push(`<div><dt>Base price</dt><dd>${money(safe.base)}</dd></div>`);
      if (typeof safe.genuine === 'boolean') lines.push(`<div><dt>Authenticity</dt><dd>${safe.genuine ? 'Genuine' : 'Reproduction'}</dd></div>`);
      if (safe.condition) lines.push(`<div><dt>Condition</dt><dd>${CONDITIONS[safe.condition]}</dd></div>`);
    } else if (safe.range) lines.push(`<div><dt>Catalog range</dt><dd>${money(safe.range.min)}–${money(safe.range.max)}</dd></div>`);
    return `<span class="notebook-confirmed-heading">Confirmed information</span><span class="notebook-source ${safe.source === 'Private note' ? 'is-private' : ''}">${escape(safe.source)}</span>${safe.known ? '' : '<p class="notebook-unknown">No confirmed identity yet.</p>'}${lines.length ? `<dl>${lines.join('')}</dl>` : ''}`;
  }
  function buttonMarkup() { return '<button type="button" class="private-notes-button" data-open-notebook aria-haspopup="dialog"><span class="private-notes-icon" aria-hidden="true">▤</span><span>Private notes</span></button>'; }
  function scopeCopy(scope) { return scope === 'tab' ? 'Only you can see these notes. Saved in this tab for this crate.' : 'Only you can see these notes. Saved on this device for this crate.'; }
  function shellMarkup(scope) {
    return `<div class="notebook-heading"><div><span class="notebook-kicker">Private notes</span><h2 id="sv-notebook-title">Your private notebook</h2></div><button type="button" data-close-notebook aria-label="Close private notes">Close</button></div><p class="notebook-privacy" id="sv-notebook-description">${scopeCopy(scope)}</p><footer class="notebook-summary"><div><span>Your estimates</span><strong data-notebook-total data-no-localize>0</strong></div><div><span>Filled estimates</span><strong data-notebook-count data-no-localize>0 / 6</strong></div><p>These are your estimates, not confirmed values or a recommended bid.</p></footer><div class="notebook-cards" data-notebook-cards></div><p class="notebook-storage-error" data-notebook-storage hidden role="status">Notes cannot be saved in this browser. Keep this tab open.</p>`;
  }
  function cardMarkup(lot, note) {
    const slot = lot.slot, letter = String.fromCharCode(65+slot), objectId = `sv-note-object-${slot}`, judgmentId = `sv-note-judgment-${slot}`, estimateId = `sv-note-estimate-${slot}`, errorId = `sv-note-error-${slot}`;
    return `<div class="notebook-object-heading"><span class="notebook-letter" aria-hidden="true">${letter}</span><div><span id="${objectId}">Object ${letter}</span><h3 data-note-label>${escape(lot.label)}</h3></div></div><section class="notebook-facts" data-note-facts>${factsMarkup(lot)}</section><fieldset class="notebook-judgment" aria-labelledby="${judgmentId} ${objectId}"><legend id="${judgmentId}">Your judgment</legend><div class="notebook-marks">${MARKS.map(mark => `<button type="button" data-note-mark="${mark}" aria-pressed="${note.mark === mark}">${MARK_LABELS[mark]}</button>`).join('')}</div></fieldset><label class="notebook-estimate-label" for="${estimateId}"><span id="sv-note-estimate-label-${slot}">Your estimate</span><input id="${estimateId}" data-note-estimate inputmode="numeric" type="text" maxlength="16" autocomplete="off" placeholder="Optional whole-number estimate" aria-labelledby="sv-note-estimate-label-${slot} ${objectId}" aria-describedby="${errorId}" value="${escape(note.estimate)}"></label><p class="notebook-estimate-error" id="${errorId}" data-note-error hidden>Use a whole number from 0 to 999,999.</p>`;
  }
  function save(state) {
    try {
      if (!state.storage?.setItem) throw new Error('Storage unavailable');
      state.storage.setItem(storageKey(state.key),JSON.stringify(normalizeNotes(state.notes)));
      state.available = true;
    } catch { state.available = false; }
    const warning = state.dialog.querySelector('[data-notebook-storage]');
    if (warning) warning.hidden = state.available;
  }
  function updateSummary(state) {
    const summary = estimateSummary(state.notes,state.lots);
    state.dialog.querySelector('[data-notebook-total]').textContent = money(summary.total);
    state.dialog.querySelector('[data-notebook-count]').textContent = `${summary.count} / ${state.lots.length}`;
  }
  function updateInput(card, raw) {
    const invalid = raw.trim() !== '' && parseEstimate(raw) === null;
    card.querySelector('[data-note-estimate]').setAttribute('aria-invalid',String(invalid));
    card.querySelector('[data-note-error]').hidden = !invalid;
  }
  function reconcile(state) {
    const grid = state.dialog.querySelector('[data-notebook-cards]');
    for (const lot of state.lots) {
      let card = grid.querySelector(`[data-note-card="${lot.slot}"]`);
      if (!card) {
        card = state.dialog.ownerDocument.createElement('article');
        card.className = 'notebook-card'; card.dataset.noteCard = String(lot.slot);
        card.innerHTML = cardMarkup(lot,state.notes.items[lot.slot]);
        grid.appendChild(card);
        const input = card.querySelector('[data-note-estimate]');
        input.addEventListener('input',() => {
          state.notes.items[lot.slot].estimate = input.value;
          updateInput(card,input.value); updateSummary(state); save(state);
        });
        card.querySelectorAll('[data-note-mark]').forEach(button => button.addEventListener('click',() => {
          state.notes.items[lot.slot].mark = button.dataset.noteMark;
          card.querySelectorAll('[data-note-mark]').forEach(mark => mark.setAttribute('aria-pressed',String(mark === button)));
          save(state);
        }));
      } else {
        card.querySelector('[data-note-label]').textContent = lot.label;
        card.querySelector('[data-note-facts]').innerHTML = factsMarkup(lot);
      }
      updateInput(card,card.querySelector('[data-note-estimate]').value);
    }
    for (const card of grid.querySelectorAll('[data-note-card]')) if (!state.lots.some(lot => lot.slot === Number(card.dataset.noteCard))) card.remove();
    state.dialog.querySelector('[data-notebook-storage]').hidden = state.available;
    updateSummary(state); localize(state.dialog);
  }
  function close(state, restore = true) {
    state.restoreFocus = restore;
    if (state.dialog.open && typeof state.dialog.close === 'function') state.dialog.close();
    else { state.dialog.removeAttribute('open'); if (restore) restoreFocus(state); }
  }
  function restoreFocus(state) {
    const button = state.opener?.isConnected ? state.opener : state.container?.querySelector('[data-open-notebook]');
    button?.focus?.({preventScroll:true});
  }
  function reset() {
    if (!current) return;
    close(current,false); current.dialog.remove(); current = null;
  }
  function createState(container, options) {
    const doc = container.ownerDocument || root.document;
    if (!doc?.createElement || !doc.body) return null;
    const saved = readNotes(options.storage,options.key), dialog = doc.createElement('dialog');
    dialog.className = 'private-notebook';
    dialog.setAttribute('aria-labelledby','sv-notebook-title');
    dialog.setAttribute('aria-describedby','sv-notebook-description');
    dialog.innerHTML = shellMarkup(options.scope);
    doc.body.appendChild(dialog);
    const state = {key:options.key,storage:options.storage,scope:options.scope,container,dialog,notes:saved.notes,available:saved.available,lots:normalizeLots(options.lots),opener:null,restoreFocus:true};
    dialog.querySelector('[data-close-notebook]').addEventListener('click',() => close(state));
    dialog.addEventListener('cancel',event => { event.preventDefault(); close(state); });
    dialog.addEventListener('close',() => { if (state.restoreFocus) restoreFocus(state); });
    dialog.addEventListener('click',event => {
      if (event.target !== dialog || !dialog.getBoundingClientRect) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close(state);
    });
    reconcile(state); return state;
  }
  function bind(container, options = {}) {
    if (!container || !storageKey(options.key)) { reset(); return; }
    if (!current || current.key !== options.key || current.storage !== options.storage) {
      reset(); current = createState(container,options);
    } else { current.container = container; current.lots = normalizeLots(options.lots); reconcile(current); }
    if (!current) return;
    container.querySelectorAll('[data-open-notebook]').forEach(button => {
      if (boundButtons.has(button)) return;
      boundButtons.add(button);
      button.addEventListener('click',() => {
        const state = current;
        if (!state || state.container !== container || state.dialog.open) return;
        state.opener = button; state.restoreFocus = true;
        localize(state.dialog);
        if (typeof state.dialog.showModal === 'function') state.dialog.showModal(); else state.dialog.setAttribute('open','');
      });
    });
  }
  root.addEventListener?.('secondvalue:languagechange',() => { if (current) localize(current.dialog); });
  return Object.freeze({buttonMarkup,bind,parseEstimate,storageKey,normalizeNotes,normalizeLots,loadNotes,estimateSummary,factsMarkup});
});
