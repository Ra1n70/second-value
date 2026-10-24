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
  const PLANS = ['', 'bid', 'watch'];
  const PLAN_LABELS = {'':'No plan recorded',bid:'Plan to bid',watch:'Watch this round'};
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
  function normalizeReason(value) { return typeof value === 'string' ? [...value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'')].slice(0,160).join('') : ''; }
  function normalizeRoundNotes(raw) {
    const result = {};
    for (let round = 1; round <= 3; round++) {
      const entry = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw[round] : null;
      const ceiling = parseEstimate(entry?.ceiling);
      result[round] = {ceiling:ceiling === null ? '' : String(ceiling),stance:PLANS.includes(entry?.stance) ? entry.stance : '',reason:normalizeReason(entry?.reason)};
    }
    return result;
  }
  function normalizeDecision(raw) {
    if (!raw || !Number.isInteger(raw.round) || raw.round < 1 || raw.round > 3) return null;
    let settlement = null;
    if (raw.settlement?.sold === false) settlement = {sold:false};
    else if (raw.settlement?.sold === true && whole(raw.settlement.winningBid) && whole(raw.settlement.recovery)) settlement = {sold:true,winningBid:raw.settlement.winningBid,recovery:raw.settlement.recovery,youWon:raw.settlement.youWon === true};
    return {round:raw.round,editable:raw.editable === true && !settlement,settlement};
  }
  function normalizeNotes(raw) {
    const result = {version:1,items:{},rounds:normalizeRoundNotes(raw?.version === 1 ? raw.rounds : null)};
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
    return `<div class="notebook-heading"><div><span class="notebook-kicker">Private notes</span><h2 id="sv-notebook-title">Your private notebook</h2></div><button type="button" data-close-notebook aria-label="Close private notes">Close</button></div><p class="notebook-privacy" id="sv-notebook-description">${scopeCopy(scope)}</p><section class="notebook-decisions" data-notebook-decisions hidden aria-labelledby="sv-round-decisions-title"><div class="notebook-decision-heading"><h3 id="sv-round-decisions-title">Round decisions</h3><p>Optional: record your thinking before bids reveal. This does not submit a bid.</p></div><nav class="notebook-round-tabs" data-decision-tabs aria-label="Round decisions"></nav><div data-decision-form></div><div data-decision-comparison></div></section><footer class="notebook-summary"><div><span>Your estimates</span><strong data-notebook-total data-no-localize>0</strong></div><div><span>Filled estimates</span><strong data-notebook-count data-no-localize>0 / 6</strong></div><p>These are your estimates, not confirmed values or a recommended bid.</p></footer><div class="notebook-cards" data-notebook-cards></div><p class="notebook-storage-error" data-notebook-storage hidden role="status">Notes cannot be saved in this browser. Keep this tab open.</p>`;
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
  function decisionFormMarkup(round, note) {
    return `<div class="notebook-round-form"><label for="sv-round-ceiling"><span>Your maximum price</span><small>For the whole crate</small><input id="sv-round-ceiling" data-decision-ceiling inputmode="numeric" type="text" maxlength="16" autocomplete="off" placeholder="Optional whole-number ceiling" aria-describedby="sv-round-ceiling-error" value="${escape(note.ceiling)}"></label><label for="sv-round-plan"><span>My plan</span><select id="sv-round-plan" data-decision-plan>${PLANS.map(plan=>`<option value="${plan}" ${plan === note.stance ? 'selected' : ''}>${PLAN_LABELS[plan]}</option>`).join('')}</select></label><label class="notebook-round-reason" for="sv-round-reason"><span>Reason</span><small id="sv-round-reason-help">Optional reason (up to 160 characters)</small><textarea id="sv-round-reason" data-decision-reason data-no-localize data-user-text rows="2" aria-describedby="sv-round-reason-help">${escape(note.reason)}</textarea></label></div><p class="notebook-estimate-error" id="sv-round-ceiling-error" data-decision-error hidden>Use a whole number from 0 to 999,999.</p><p class="notebook-round-status" data-decision-status role="status"></p>`;
  }
  function comparisonMarkup(notes, rawDecision) {
    const decision = normalizeDecision(rawDecision);
    if (!decision?.settlement) return '<p class="notebook-comparison-wait">Comparison appears after settlement.</p>';
    if (!decision.settlement.sold) return '<section class="notebook-round-comparison"><h3>Review your decisions</h3><p>No sale. There is no winning price to compare.</p></section>';
    const settlement = decision.settlement, rows = [];
    for (let round = 1; round <= decision.round; round++) {
      const note = notes?.rounds?.[round];
      if (!note || (parseEstimate(note.ceiling) === null && !note.stance && !note.reason)) continue;
      const ceiling = parseEstimate(note.ceiling), difference = ceiling === null ? null : ceiling - settlement.winningBid;
      rows.push(`<tr><th scope="row">Round ${round}</th><td>${ceiling === null ? '<span>Not recorded</span>' : `<span data-no-localize>${money(ceiling)}</span>`}</td><td>${difference === null ? '—' : `<span data-no-localize>${difference > 0 ? '+' : difference < 0 ? '−' : ''}${money(Math.abs(difference))}</span>`}</td></tr>`);
    }
    return `<section class="notebook-round-comparison"><h3>Review your decisions</h3><dl class="notebook-buyer-result"><div><dt>Winning bid</dt><dd data-no-localize>${money(settlement.winningBid)}</dd></div><div><dt>Buyer's actual recovery</dt><dd data-no-localize>${money(settlement.recovery)}</dd></div></dl><p>This is the buyer's recovery after fees, using their role and sale choice.</p>${rows.length ? `<div class="notebook-comparison-scroll"><table><thead><tr><th scope="col"></th><th scope="col">Your maximum price</th><th scope="col">Your ceiling minus winning bid</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>` : ''}<p>Price comparison only. Timing and tie priority also affect who wins.</p></section>`;
  }
  function canEditDecision(state, round) { return Boolean(state.decision?.editable && !state.decision.settlement && state.decision.round === round && state.selectedRound === round); }
  function updateDecisionForm(state) {
    const form = state.dialog.querySelector('[data-decision-form]');
    if (!form || !state.decision) return;
    const input = form.querySelector('[data-decision-ceiling]'), plan = form.querySelector('[data-decision-plan]'), reason = form.querySelector('[data-decision-reason]');
    if (!input || !plan || !reason) return;
    const editable = canEditDecision(state,state.selectedRound), invalid = input.value.trim() !== '' && parseEstimate(input.value) === null;
    input.readOnly = !editable; reason.readOnly = !editable; plan.disabled = !editable;
    input.setAttribute('aria-invalid',String(invalid));
    form.querySelector('[data-decision-error]').hidden = !invalid;
    form.querySelector('[data-decision-status]').textContent = editable ? 'Editable until this round reveals.' : 'This record is read-only right now.';
  }
  function reconcileDecisions(state) {
    const section = state.dialog.querySelector('[data-notebook-decisions]');
    if (!section) return;
    section.hidden = !state.decision;
    if (!state.decision) return;
    const tabs = section.querySelector('[data-decision-tabs]'), form = section.querySelector('[data-decision-form]');
    if (Number(tabs.dataset.rounds) !== state.decision.round) {
      tabs.dataset.rounds = String(state.decision.round);
      tabs.innerHTML = Array.from({length:state.decision.round},(_,index)=>`<button type="button" data-decision-round="${index+1}" aria-pressed="${state.selectedRound === index+1}">Round ${index+1}</button>`).join('');
      tabs.querySelectorAll('[data-decision-round]').forEach(button=>button.addEventListener('click',()=> {
        const round = Number(button.dataset.decisionRound);
        if (round < 1 || round > state.decision.round) return;
        state.selectedRound = round; reconcileDecisions(state); localize(section);
      }));
    }
    tabs.querySelectorAll('[data-decision-round]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.decisionRound) === state.selectedRound)));
    if (Number(form.dataset.round) !== state.selectedRound) {
      const round = state.selectedRound;
      form.dataset.round = String(round); form.innerHTML = decisionFormMarkup(round,state.notes.rounds[round]);
      const input = form.querySelector('[data-decision-ceiling]'), plan = form.querySelector('[data-decision-plan]'), reason = form.querySelector('[data-decision-reason]');
      input.addEventListener('input',()=> {
        if (!canEditDecision(state,round)) { input.value = state.notes.rounds[round].ceiling; return; }
        state.notes.rounds[round].ceiling = input.value; updateDecisionForm(state); save(state);
      });
      plan.addEventListener('change',()=> {
        if (!canEditDecision(state,round)) { plan.value = state.notes.rounds[round].stance; return; }
        state.notes.rounds[round].stance = PLANS.includes(plan.value) ? plan.value : ''; save(state);
      });
      reason.addEventListener('input',()=> {
        if (!canEditDecision(state,round)) { reason.value = state.notes.rounds[round].reason; return; }
        const value = normalizeReason(reason.value);
        if (reason.value !== value) reason.value = value;
        state.notes.rounds[round].reason = value; save(state);
      });
    }
    updateDecisionForm(state);
    section.querySelector('[data-decision-comparison]').innerHTML = comparisonMarkup(state.notes,state.decision);
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
    reconcileDecisions(state); updateSummary(state); localize(state.dialog);
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
    const decision = normalizeDecision(options.decision);
    const state = {key:options.key,storage:options.storage,scope:options.scope,container,dialog,notes:saved.notes,available:saved.available,lots:normalizeLots(options.lots),decision,selectedRound:decision?.round || 1,opener:null,restoreFocus:true};
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
    } else {
      current.container = container; current.lots = normalizeLots(options.lots);
      const decision = normalizeDecision(options.decision);
      if (current.decision?.round !== decision?.round) current.selectedRound = decision?.round || 1;
      current.decision = decision; reconcile(current);
    }
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
  return Object.freeze({buttonMarkup,bind,parseEstimate,storageKey,normalizeNotes,normalizeRoundNotes,normalizeReason,normalizeDecision,normalizeLots,loadNotes,estimateSummary,factsMarkup,comparisonMarkup});
});
