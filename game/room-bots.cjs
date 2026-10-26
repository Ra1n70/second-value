'use strict';

// Computer decisions receive the same projection as a human seat. This module
// never receives a room, seed, unexposed identities, or anyone else's sealed bid.
const E = require('./engine.cjs');
const STYLES = Object.freeze({steady: 'Steady', bold: 'Bold', patient: 'Patient'});
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function publicRandom(view, purpose) {
  const text = `${view.code}:${view.self.id}:${view.auctionNumber}:${view.round}:${purpose}`;
  let seed = 2166136261;
  for (let index = 0; index < text.length; index++) seed = Math.imul(seed ^ text.charCodeAt(index), 16777619);
  return E.rng(seed >>> 0);
}
function sourceWeight(source, item) {
  // Public source probabilities are part of the catalog, not crate truth.
  if (source === 'workshop') return (item.category === 'mechanical' ? 1.6 : 1) * (item.genuine && item.condition === 'damaged' ? 4 : 1);
  if (source === 'estate') return item.genuine ? item.condition === 'intact' ? item.theme ? 3.8 : 2.5 : item.theme ? 1.5 : 1 : .55;
  if (source === 'theater') return item.genuine ? 1 : 4;
  return 1;
}
function repairable(item) { return Boolean(item.genuine && item.condition === 'damaged' && item.repair); }
function estimate(view) {
  const catalog = E.catalogItems(view.rulesVersion), count = view.lots.length;
  const candidates = view.lots.map((lot, index) => lot.known
    ? [{...lot, id: `estimate-${index}`}]
    : catalog.filter(item => item.shape === lot.shape).map(item => ({...item, id: `estimate-${index}`})));
  const genuine = Number.isInteger(view.public?.genuineCount) ? view.public.genuineCount : null;
  const repairs = Number.isInteger(view.public?.repairableCount) ? view.public.repairableCount : null;
  const weighted = view.rulesVersion >= 5 && own(E.SOURCES, view.sourceId);
  const totalWeight = catalog.reduce((sum, item) => sum + sourceWeight(weighted ? view.sourceId : null, item), 0);
  // At most 4^6 appearance assignments fit this catalog. Their source and public
  // reserve likelihoods can be enumerated cheaply; role processing stays capped
  // at 96 calls through stratified weighted samples ordered by ordinary value.
  // Larger hypothesis sets remain approximate valuations, not an oracle.
  const hypotheses = [];
  let weightSum = 0, recoverySum = 0, squareSum = 0;
  const used = new Set(), crate = [];
  function visit(index, probability, usedWeight, genuineSoFar, repairsSoFar) {
    const remaining = count - index;
    if (genuine !== null && (genuineSoFar > genuine || genuineSoFar + remaining < genuine)) return;
    if (repairs !== null && (repairsSoFar > repairs || repairsSoFar + remaining < repairs)) return;
    if (index === count) {
      const ordinary = crate.reduce((sum, item) => sum + item.base, 0);
      if (view.rulesVersion >= 4 && view.reservePrice > 0) {
        // The reserve uses one independent, uniformly drawn integer rate from
        // 8% through 12%. This conditions on its published amount, never its seed.
        let matchingRates = 0;
        for (let percent = 8; percent <= 12; percent++) {
          if (Math.max(1, Math.round(ordinary * percent / 100)) === view.reservePrice) matchingRates++;
        }
        if (!matchingRates) return;
        probability *= matchingRates / 5;
      }
      hypotheses.push({crate: [...crate], probability, ordinary});
      return;
    }
    for (const item of candidates[index]) {
      if (used.has(item.catalogId)) continue;
      const weight = sourceWeight(weighted ? view.sourceId : null, item);
      used.add(item.catalogId); crate.push(item);
      visit(index + 1, weighted ? probability * weight / (totalWeight - usedWeight) : probability, usedWeight + weight, genuineSoFar + Number(item.genuine), repairsSoFar + Number(repairable(item)));
      crate.pop(); used.delete(item.catalogId);
    }
  }
  visit(0, 1, 0, 0, 0);
  let samples = hypotheses;
  if (hypotheses.length > 96) {
    hypotheses.sort((a, b) => a.ordinary - b.ordinary);
    const total = hypotheses.reduce((sum, sample) => sum + sample.probability, 0);
    const offset = publicRandom(view, 'estimate')();
    samples = [];
    let index = 0, cumulative = hypotheses[0].probability;
    for (let point = 0; point < 96; point++) {
      const target = (point + offset) * total / 96;
      while (index < hypotheses.length - 1 && cumulative < target) cumulative += hypotheses[++index].probability;
      // Systematic points already represent probability mass; equal weights
      // avoid applying the source/reserve likelihood a second time.
      samples.push({crate: hypotheses[index].crate, probability: 1});
    }
  }
  for (const sample of samples) {
    // Possible legal processing uses only catalog hypotheses. Actual funds are
    // checked afresh by the authoritative sale planner after the crate opens.
    const recovery = E.salePlan(view.self.role, sample.crate, 'special', view.self.cash, {theme: view.self.theme}).recovery;
    weightSum += sample.probability; recoverySum += sample.probability * recovery; squareSum += sample.probability * recovery * recovery;
  }
  if (!weightSum) {
    // Defensive fallback for an incomplete legacy projection. No hidden-state
    // lookup is available here, so uncertainty stays with the computer too.
    const mean = view.lots.reduce((sum, lot) => sum + (lot.known ? lot.base : (lot.range.min + lot.range.max) / 2), 0);
    return {mean, deviation: mean * .18};
  }
  const mean = recoverySum / weightSum;
  return {mean, deviation: Math.sqrt(Math.max(0, squareSum / weightSum - mean * mean))};
}
function chooseInspection(view) {
  if (view.phase !== 'auction' || view.self.role !== 'appraiser' || view.self.bid || view.self.inspectionsLeft <= 0) return null;
  // One inspection now, the second after the public count appears. The target
  // depends only on visible uncertainty; no peek is used to choose what to peek.
  const used = view.self.inspected?.length || 0;
  if (used >= (view.round >= 2 ? 2 : 1)) return null;
  const choices = view.lots.filter(lot => !lot.known).sort((a, b) => (b.range.max - b.range.min) - (a.range.max - a.range.min) || a.slot - b.slot);
  return choices[0]?.slot ?? null;
}
function chooseBid(view) {
  const minimum = Math.max(1, view.reservePrice || 0), cash = view.self.cash;
  if (view.phase !== 'auction' || cash < minimum) return {amount: null, pass: true};
  const style = own(STYLES, view.self.botStyle) ? view.self.botStyle : 'steady';
  const {mean, deviation} = estimate(view), random = publicRandom(view, 'bid');
  const margin = style === 'bold' ? .09 : style === 'patient' ? .02 : .06;
  const caution = style === 'bold' ? .18 : style === 'patient' ? .75 : .38;
  const valueCeiling = Math.floor(mean * (1 - margin) - deviation * caution);
  const ceiling = Math.min(cash, valueCeiling);
  if (ceiling < minimum) return {amount: null, pass: true};
  const roundFactor = (style === 'bold' ? [0, .78, 1, 1] : style === 'patient' ? [0, .55, .70, 1] : [0, .64, .78, .97])[view.round] || 1;
  const variation = .95 + random() * .10;
  let quote = Math.max(minimum, Math.min(ceiling, Math.round(valueCeiling * roundFactor * variation / 5) * 5));
  const previous = view.history?.at(-1);
  const rival = previous?.bids?.filter(bid => bid.id !== view.self.id).reduce((highest, bid) => Math.max(highest, bid.bid || 0), 0) || 0;
  // Only revealed previous-round quotes can influence a response. A patient
  // buyer may wait in early rounds, but a prior quote is not a minimum in the
  // final round: rivals can lower their bids or pass.
  if (style === 'patient' && view.round < 3 && rival > ceiling) return {amount: null, pass: true};
  if (style === 'bold' && rival > 0) quote = Math.min(ceiling, Math.max(quote, rival + 5));
  if (quote < minimum) return {amount: null, pass: true};
  return {amount: Math.min(cash, quote), pass: false};
}

module.exports = {STYLES, chooseBid, chooseInspection};
