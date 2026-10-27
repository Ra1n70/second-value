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
  // What a public estimate needs to know about one catalog identity.
  function identityOf(item) {
    return {base:item.base, genuine:item.genuine === true, repairable:Boolean(item.genuine && item.condition === 'damaged' && item.repair), intact:item.condition === 'intact', category:item.category, theme:item.theme ?? null};
  }
  // Each lot is the list of identities it could still be (one once known). Announced counts fix how many
  // lots are genuine and repairable; the published reserve is round(value × p / 100) for p from 8 to 12.
  function valueRange(lots, reservePrice, counts = {}) {
    let states = new Map([['0,0', {low:0, high:0}]]);
    for (const options of lots) {
      const next = new Map();
      for (const [key, sum] of states) {
        const [genuine, repairable] = key.split(',').map(Number);
        for (const option of options) {
          const nextKey = `${genuine + (option.genuine ? 1 : 0)},${repairable + (option.repairable ? 1 : 0)}`, seen = next.get(nextKey);
          next.set(nextKey, {low:Math.min(seen?.low ?? Infinity, sum.low + option.base), high:Math.max(seen?.high ?? -Infinity, sum.high + option.base)});
        }
      }
      states = next;
    }
    let low = Infinity, high = -Infinity;
    for (const [key, sum] of states) {
      const [genuine, repairable] = key.split(',').map(Number);
      if ((Number.isInteger(counts.genuine) && genuine !== counts.genuine) || (Number.isInteger(counts.repairable) && repairable !== counts.repairable)) continue;
      low = Math.min(low, sum.low); high = Math.max(high, sum.high);
    }
    if (!Number.isFinite(low)) return null;
    if (Number.isSafeInteger(reservePrice) && reservePrice > 1) {
      low = Math.max(low, Math.ceil((2 * reservePrice - 1) * 25 / 6));
      high = Math.min(high, Math.ceil((2 * reservePrice + 1) * 25 / 4) - 1);
    }
    return low <= high ? {low, high} : null;
  }
  function valueMarkup(lots, reservePrice, counts = {}) {
    const range = lots.length ? valueRange(lots, reservePrice, counts) : null;
    if (!range) return '';
    return `<details class="auction-reserve reserve-compact crate-estimate"><summary><span>Crate value</span><strong data-no-localize>${money(range.low)}–${money(range.high)}</strong></summary><div class="reserve-explanation"><strong>Ordinary sale value, before abilities</strong><p><span>${reservePrice > 1 ? 'Estimated from the reserve (8–12% of this value), each object’s catalog range and the announced counts.' : 'Estimated from each object’s catalog range and the announced counts.'}</span> <span>Your ability can add more after you win.</span></p></div></details>`;
  }
  const BLOCKED = {
    curator:'Not possible in this crate: an exhibition needs three genuine, intact objects from different categories.',
    collector:'Not possible in this crate: it cannot hold two genuine objects in your theme from different categories.',
    restorer:'Not possible in this crate: nothing in it can be repaired.',
    salvager:'Not possible in this crate: every object is genuine.',
    broker:'Not possible in this crate: there is no genuine, intact object for your customer.'
  };
  // Says, from what is known, when a role's after-sale ability cannot apply to this crate at all.
  // It only reports certainty; a crate that might still allow the ability returns ''.
  function abilityBlocker(role, theme, lots, counts = {}) {
    if (!Object.hasOwn(BLOCKED, role)) return '';
    const genuine = Number.isInteger(counts.genuine) ? counts.genuine : null, repairable = Number.isInteger(counts.repairable) ? counts.repairable : null;
    // Every genuine damaged identity in the catalog is repairable, so genuine intact = genuine − repairable.
    const intact = genuine !== null && repairable !== null ? genuine - repairable : genuine;
    const any = test => lots.some(options => options.some(test));
    const categories = test => new Set(lots.filter(options => options.some(test)).map(options => options.find(test).category)).size;
    const blocked = role === 'curator' ? categories(option => option.genuine && option.intact) < 3 || (intact !== null && intact < 3)
      : role === 'collector' ? categories(option => option.genuine && option.theme === theme) < 2 || (genuine !== null && genuine < 2)
      : role === 'restorer' ? !any(option => option.repairable) || genuine === 0 || repairable === 0
      : role === 'salvager' ? !any(option => !option.genuine) || genuine === lots.length
      : !any(option => option.genuine && option.intact) || intact === 0;
    return blocked ? BLOCKED[role] : '';
  }
  return Object.freeze({markup,normalizePublicLot,identityOf,valueRange,valueMarkup,abilityBlocker});
});
