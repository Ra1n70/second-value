/* Public clues only. The caller supplies the current public round projection. */
(function (root, factory) {
  const clues = factory();
  if (typeof module === 'object' && module.exports) module.exports = clues;
  else root.SecondValueRoundClues = clues;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const count = value => Number.isInteger(value) && value >= 0 && value <= 6;
  const money = value => value.toLocaleString('en-US');
  function normalizePublicLot(lot) {
    if (!lot || lot.known !== true || lot.source !== 'Public reveal' || !Number.isInteger(lot.slot) || lot.slot < 0 || lot.slot > 5 || typeof lot.label !== 'string' || !lot.label.trim() || !Number.isSafeInteger(lot.base) || lot.base < 0) return null;
    return {slot:lot.slot,label:[...lot.label.trim()].slice(0,160).join(''),base:lot.base};
  }
  function countMarkup(label, value) {
    return `<span class="round-clue-count"><span>${label}</span><strong data-no-localize>${value} / 6</strong></span>`;
  }
  function publicMarkup(lot) {
    return `<button type="button" class="round-clues-object" data-round-clue-slot="${lot.slot}"><span class="round-clue-letter" data-no-localize aria-hidden="true">${String.fromCharCode(65+lot.slot)}</span><span class="round-clues-object-copy"><span class="round-clues-object-source">Public reveal</span><strong>${escape(lot.label)}</strong></span><span class="round-clues-object-price"><span>Base price</span><strong data-no-localize>${money(lot.base)}</strong></span><span class="round-clues-view">View object</span></button>`;
  }
  function markup(input = {}) {
    // Explicit gates prevent future or privately known facts from appearing early.
    if (input?.round !== 2 && input?.round !== 3) return '';
    const finalRound = input.round === 3;
    const newCount = finalRound ? input.repairableCount : input.genuineCount;
    const publicLot = finalRound ? normalizePublicLot(input.publicLot) : null;
    const fresh = count(newCount) ? countMarkup(finalRound ? 'Repairable objects' : 'Genuine objects',newCount) : '';
    const retained = finalRound && count(input.genuineCount) ? `<div class="round-clues-retained"><span class="round-clues-retained-title">Already known</span>${countMarkup('Genuine objects',input.genuineCount)}</div>` : '';
    if (!fresh && !publicLot && !retained) return '';
    const current = fresh || publicLot ? `<div class="round-clues-current"><div class="round-clues-newfacts"><span class="round-clues-heading">New this round</span>${fresh}</div>${publicLot ? publicMarkup(publicLot) : ''}</div>` : '';
    return `<section class="round-clues${finalRound ? ' is-final' : ''}" aria-label="${current ? 'New this round' : 'Already known'}">${current}${retained}</section>`;
  }
  return Object.freeze({markup,normalizePublicLot});
});
