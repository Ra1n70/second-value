/* Pure sale-plan presentation. Plans and the paid price come from the caller. */
(function (root, factory) {
  const comparison = factory();
  if (typeof module === 'object' && module.exports) module.exports = comparison;
  else root.SecondValueSaleComparison = comparison;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const whole = value => Number.isSafeInteger(value) && value >= 0;
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const money = value => value.toLocaleString('en-US');
  const signed = value => (value > 0 ? '+' : value < 0 ? '−' : '') + money(Math.abs(value));
  function normalizePlan(raw) {
    if (!raw || !['sale','bonus','cost','recovery'].every(key=>whole(raw[key]))) return null;
    const gross = raw.sale + raw.bonus;
    if (!Number.isSafeInteger(gross) || gross - raw.cost !== raw.recovery) return null;
    return {sale:raw.sale,bonus:raw.bonus,cost:raw.cost,recovery:raw.recovery,gross};
  }
  function numberRow(label, value, extra = '') {
    return `<div${extra ? ` class="${extra}"` : ''}><dt>${label}</dt><dd data-no-localize>${value}</dd></div>`;
  }
  function card(mode, plan, paid, selected, error) {
    const title = mode === 'ordinary' ? 'Ordinary sale' : 'Ability processing';
    const profit = plan && paid !== null ? plan.recovery - paid : null;
    const tone = profit === null || profit === 0 ? 'is-neutral' : profit < 0 ? 'is-loss' : 'is-gain';
    const body = plan ? `<dl class="sale-comparison-values">${numberRow('Sale proceeds before fees',money(plan.gross))}${numberRow('Processing fees',plan.cost ? '−'+money(plan.cost) : '0')}${numberRow('Net recovery',money(plan.recovery),'sale-comparison-recovery')}${numberRow('Final profit / loss',profit === null ? '—' : signed(profit),'sale-comparison-profit '+tone)}</dl>` : `<div class="sale-comparison-pending"><p>${mode === 'ordinary' ? 'Sale preview unavailable.' : 'Choose the ability targets to compare.'}</p>${error ? `<p class="sale-comparison-error">${escape(error)}</p>` : ''}</div>`;
    return `<article class="sale-comparison-card ${tone}${selected ? ' is-selected' : ''}${plan ? '' : ' is-pending'}" data-sale-comparison-mode="${mode}"><header><h4>${title}</h4>${selected ? '<span class="sale-comparison-selected">Selected plan</span>' : ''}</header>${body}</article>`;
  }
  function markup(input = {}) {
    const ordinary = normalizePlan(input?.ordinary), hasAbility = input?.hasAbility === true;
    const paid = whole(input?.paid) ? input.paid : null;
    const error = typeof input?.error === 'string' ? [...input.error.trim()].slice(0,500).join('') : '';
    // A failed selection must never be presented as a successful ordinary fallback.
    const special = hasAbility && !error ? normalizePlan(input?.special) : null;
    const delta = ordinary && special ? special.recovery - ordinary.recovery : null;
    const difference = hasAbility && delta !== null ? `<div class="sale-comparison-difference ${delta > 0 ? 'is-gain' : delta < 0 ? 'is-loss' : 'is-neutral'}"><span>Net gain vs ordinary sale</span><strong data-no-localize>${signed(delta)}</strong></div>` : '';
    return `<section class="sale-comparison${hasAbility ? ' has-ability' : ' has-single'}" aria-label="Sale comparison"><header class="sale-comparison-heading"><h3>Sale comparison</h3><div class="sale-comparison-paid"><span>Winning bid</span><strong data-no-localize>${paid === null ? '—' : money(paid)}</strong></div></header><div class="sale-comparison-grid">${card('ordinary',ordinary,paid,input?.selectedMode === 'ordinary','')}${hasAbility ? card('special',special,paid,input?.selectedMode === 'special',error) : ''}</div>${difference}${!hasAbility ? '<p class="sale-comparison-role-note">Your role uses ordinary sale prices.</p>' : ''}<p class="sale-comparison-explanation"><span>Sale proceeds include ability bonuses.</span> <span>Final profit / loss = net recovery − winning bid.</span></p></section>`;
  }
  return Object.freeze({markup,normalizePlan});
});
