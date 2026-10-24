/* Shared, decorative auction presentation. The engine always settles immediately. */
(function (root, factory) {
  const show = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = show;
  else root.SecondValueShow = show;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const SOUND_KEY = 'secondvalue:auction-sound';
  const histories = new WeakMap();
  const boundButtons = new WeakSet();
  const soundButtons = new Set();
  const activeNotes = new Set();
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const number = value => Number.isFinite(value) ? value : 0;
  const money = value => number(value).toLocaleString('en-US');
  const signed = value => (number(value) > 0 ? '+' : number(value) < 0 ? '−' : '') + money(Math.abs(number(value)));
  let sound = false, audio = null, audioUnlocked = false, liveScene = null, liveTimer = null;
  try { sound = root.localStorage?.getItem(SOUND_KEY) === 'on'; } catch { /* Optional preference. */ }

  function localize(node) {
    const locale = root.SecondValueOnlineLocale || root.SecondValueLocale;
    locale?.localize?.(node);
  }

  function sourceMarkup(sourceId, sources) {
    if (typeof sourceId !== 'string' || !sources || !Object.hasOwn(sources, sourceId)) return '';
    const source = sources[sourceId];
    const style = ['workshop','estate','theater'].includes(sourceId) ? sourceId : 'estate';
    return `<section class="crate-provenance provenance-${style}" aria-label="Source of this crate"><div class="provenance-evidence" aria-hidden="true"><span class="evidence-fastener"></span><span class="evidence-number" data-no-localize>${style === 'workshop' ? 'Nº 047' : style === 'theater' ? 'Nº 026' : 'CAT. 018'}</span><span class="evidence-lines"></span><span class="evidence-word">${escape(source.evidence || source.artifact || '')}</span><span class="evidence-mark" data-no-localize>${style === 'workshop' ? 'R' : style === 'theater' ? '✦' : 'SV'}</span></div><div class="provenance-copy"><span class="eyebrow">SOURCE OF THIS CRATE</span><h3>${escape(source.name)}</h3><p class="provenance-hint">${escape(source.hint)}</p><details class="provenance-details"><summary>Source record</summary><div><p class="provenance-story">${escape(source.story)}</p><small>A clue to the mix. Exact identities and values remain hidden.</small></div></details></div></section>`;
  }

  function portrait(role) {
    const config = root.SecondValueArt?.portraitFor?.(role);
    // Only the known first-party portrait path is accepted as a CSS URL.
    if (!config || !/^assets\/[\w-]+\.(?:png|svg|webp)$/.test(config.sheet)) return '';
    const x = config.columns > 1 ? 100 * config.column / (config.columns - 1) : 0;
    const y = config.rows > 1 ? 100 * config.row / (config.rows - 1) : 0;
    return `<span class="valuation-portrait" aria-hidden="true" style="background-image:url('${config.sheet}');background-size:${number(config.columns) * 100}% ${number(config.rows) * 100}%;background-position:${number(x)}% ${number(y)}%"></span>`;
  }

  function valuationMarkup(board) {
    if (!board || !Array.isArray(board.rows) || !board.rows.length) return '';
    const roles = root.SecondValue?.ROLES || {};
    const nameAttribute = board.localizeNames === true ? '' : ' data-user-text';
    return `<section class="table-valuation" aria-label="The value at this table"><div class="valuation-heading"><div><span class="eyebrow">THE VALUE AT THIS TABLE</span><h3>One crate. Different opportunities.</h3></div><div class="valuation-ordinary"><span>Ordinary crate value</span><strong>${money(board.ordinary)}</strong></div></div><div class="valuation-grid" style="--valuation-columns:${Math.min(4,board.rows.length)}">${board.rows.map((row, index) => {
      const affordable = row.affordable !== false, actual = row.actual === true;
      const role = Object.hasOwn(roles, row.role) ? roles[row.role].short : '';
      const profit = number(row.profit), tone = profit < 0 ? 'is-loss' : profit > 0 ? 'is-gain' : 'is-even';
      return `<article class="valuation-card ${actual ? 'is-actual' : 'is-hypothetical'} ${affordable ? tone : 'is-unaffordable'}" style="--valuation-order:${index}"><div class="valuation-player">${portrait(row.role)}<div><strong${nameAttribute}>${escape(row.name)}</strong><span>${escape(role)}</span></div>${actual ? '<span class="valuation-seal" aria-hidden="true">✓</span>' : ''}</div><p class="valuation-status">${actual ? 'Actual sale' : affordable ? 'If you had won' : 'Not enough cash'}</p><div class="valuation-profit"><strong>${affordable ? signed(profit) : '—'}</strong><span>${affordable ? 'Profit at this price' : 'This bid exceeds your cash.'}</span></div>${affordable ? `<dl class="valuation-breakdown"><div><dt>Winning price</dt><dd>${money(board.winningBid)}</dd></div><div><dt>Sale after fees</dt><dd>${money(row.recovery)}</dd></div><div><dt>Processing fees</dt><dd>${money(row.cost)}</dd></div><div><dt>Role advantage</dt><dd>${signed(row.abilityGain)}</dd></div></dl>` : `<dl class="valuation-breakdown"><div><dt>Winning price</dt><dd>${money(board.winningBid)}</dd></div><div><dt>Cash before bidding</dt><dd>${money(row.cashBefore)}</dd></div></dl>`}</article>`;
    }).join('')}</div><p class="valuation-disclaimer">Hypothetical results use this winning price and each player's cash before bidding. They are not earnings.</p></section>`;
  }

  function updateButton(button) {
    button.setAttribute('aria-pressed', String(sound));
    button.setAttribute('aria-label', 'Auction sounds');
    button.innerHTML = `<span class="sound-icon" aria-hidden="true">${sound ? '♪' : '♩'}</span><span>${sound ? 'Sound on' : 'Sound off'}</span>`;
    localize(button);
  }

  function unlockAudio() {
    if (!sound) return;
    try {
      const Context = root.AudioContext || root.webkitAudioContext;
      if (!Context) return;
      audio ||= new Context();
      audioUnlocked = true;
      const resumed = audio.resume?.();
      if (resumed?.catch) resumed.catch(() => {});
    } catch { audioUnlocked = false; }
  }

  function bindSoundToggle(button) {
    if (!button) return;
    soundButtons.add(button);
    updateButton(button);
    if (boundButtons.has(button)) return;
    boundButtons.add(button);
    button.classList.add('auction-sound-toggle');
    button.addEventListener('click', () => {
      sound = !sound;
      try { root.localStorage?.setItem(SOUND_KEY, sound ? 'on' : 'off'); } catch { /* Sound remains usable. */ }
      if (sound) unlockAudio();
      else for (const oscillator of activeNotes) { try { oscillator.stop(); } catch { /* Already ended. */ } }
      for (const item of soundButtons) {
        if (item.isConnected === false) soundButtons.delete(item);
        else updateButton(item);
      }
    });
    // A stored preference still needs a real gesture before Web Audio is used.
    button.ownerDocument?.addEventListener?.('pointerdown', unlockAudio, {capture:true, passive:true});
  }

  function note(kind, delay = 0) {
    if (!sound || !audioUnlocked || !audio) return;
    try {
      const start = audio.currentTime + delay;
      const sounds = kind === 'coin' ? [[1120,.09,.035],[1490,.1,.025]] : kind === 'wood' ? [[155,.11,.13],[75,.15,.09]] : [[780,.055,.025],[590,.06,.02]];
      sounds.forEach(([frequency,duration,volume], index) => {
        const oscillator = audio.createOscillator(), gain = audio.createGain();
        oscillator.type = kind === 'wood' ? 'triangle' : 'sine';
        oscillator.frequency.setValueAtTime(frequency, start + index * .025);
        gain.gain.setValueAtTime(.001, start + index * .025);
        gain.gain.exponentialRampToValueAtTime(volume, start + index * .025 + .008);
        gain.gain.exponentialRampToValueAtTime(.001, start + index * .025 + duration);
        oscillator.connect(gain); gain.connect(audio.destination);
        activeNotes.add(oscillator);
        oscillator.onended = () => { activeNotes.delete(oscillator); oscillator.disconnect?.(); gain.disconnect?.(); };
        oscillator.start(start + index * .025); oscillator.stop(start + index * .025 + duration + .02);
      });
    } catch { /* A blocked, suspended or unavailable audio device never affects play. */ }
  }

  function present(container, detail = {}) {
    if (!container || (typeof container !== 'object' && typeof container !== 'function')) return false;
    const key = String(detail.key ?? ''), event = detail.event;
    let history = histories.get(container);
    if (!history) {
      histories.set(container, {seen:new Set([key]), order:[key]});
      return false; // Opening an existing crate or restoring a save has no historic replay.
    }
    // Removing the class after a repeated render prevents newly mounted cards
    // from restarting a past sequence during polling or a language change.
    if (history.seen.has(key)) {
      container.classList?.remove('sv-show-round','sv-show-hammer','sv-show-settled');
      return false;
    }
    history.seen.add(key); history.order.push(key);
    if (history.order.length > 96) history.seen.delete(history.order.shift());
    if (!['round','hammer','settled'].includes(event)) return false;
    const doc = container.ownerDocument || root.document;
    if (!doc?.createElement || !doc.body) return false;
    if (liveTimer !== null) root.clearTimeout(liveTimer);
    if (liveScene) liveScene.remove();
    container.classList?.remove('sv-show-round','sv-show-hammer','sv-show-settled');
    const reduced = Boolean(root.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    if (!reduced) container.classList?.add(`sv-show-${event}`);
    const scene = doc.createElement('aside');
    scene.className = `auction-moment moment-${event}${reduced ? ' is-reduced-motion' : ''}`;
    scene.setAttribute('role','status');
    scene.setAttribute('aria-live','polite');
    scene.setAttribute('aria-atomic','true');
    const bids = Array.isArray(detail.bids) ? detail.bids.slice(0,4) : [];
    const nameAttribute = detail.localizeNames === true ? '' : ' data-user-text';
    const envelopes = bids.length ? bids.map(bid => `<span class="moment-envelope"><span class="moment-bid-name"${nameAttribute}>${escape(bid.name)}</span><strong>${number(bid.bid) > 0 ? money(bid.bid) : '<span>Passed</span>'}</strong></span>`).join('') : '<span class="moment-envelope"></span><span class="moment-envelope"></span><span class="moment-envelope"></span>';
    scene.innerHTML = event === 'settled'
      ? `<span class="moment-coins" aria-hidden="true"><i></i><i></i><i></i></span><div class="moment-copy"><span>Sale settled</span><strong><span>Your result</span> <b>${signed(detail.selfProfit)}</b></strong></div>`
      : `<div class="moment-envelopes" aria-hidden="true">${envelopes}</div><div class="moment-copy"><span>Sealed bids opened</span>${event === 'hammer' ? `<strong><span class="moment-stamp">SOLD</span> <b>${money(detail.winningBid)}</b></strong><small><span${nameAttribute}>${escape(detail.winnerName)}</span><span class="moment-unveiled">Crate unveiled</span></small><span class="moment-gavel" aria-hidden="true"></span>` : '<strong>No hammer this round</strong>'}</div>`;
    doc.body.appendChild(scene);
    localize(scene);
    liveScene = scene;
    if (event === 'settled') note('coin');
    else { note('paper'); if (event === 'hammer') note('wood',.47); }
    liveTimer = root.setTimeout(() => {
      scene.remove();
      container.classList?.remove('sv-show-round','sv-show-hammer','sv-show-settled');
      if (liveScene === scene) { liveScene = null; liveTimer = null; }
    },1600);
    return true;
  }

  root.addEventListener?.('secondvalue:languagechange', () => {
    for (const button of soundButtons) updateButton(button);
    if (liveScene) localize(liveScene);
  });
  return Object.freeze({sourceMarkup,valuationMarkup,present,bindSoundToggle,get soundEnabled(){return sound;}});
});
