/* Shared, decorative auction presentation. The engine always settles immediately. */
(function (root, factory) {
  const show = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = show;
  else root.SecondValueShow = show;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const SOUND_KEY = 'secondvalue:auction-sound';
  const MUSIC_KEY = 'secondvalue:auction-music';
  const SAMPLES = Object.freeze({paper:'/assets/audio/auction-paper-v1.mp3',wood:'/assets/audio/auction-gavel-v1.mp3',coin:'/assets/audio/auction-coins-v1.mp3'});
  const MUSIC_FILE = '/assets/audio/old-harbor-v1.mp3';
  const histories = new WeakMap();
  const boundButtons = new WeakSet();
  const boundMusicButtons = new WeakSet();
  const soundButtons = new Set();
  const musicButtons = new Set();
  const activeNotes = new Set();
  const sampleLoads = new Map(), samples = new Map();
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const number = value => Number.isFinite(value) ? value : 0;
  const money = value => number(value).toLocaleString('en-US');
  const signed = value => (number(value) > 0 ? '+' : number(value) < 0 ? '−' : '') + money(Math.abs(number(value)));
  let sound = false, soundWanted = false, soundStarting = false, soundEpoch = 0, audio = null;
  let music = null, musicWanted = false, musicPlaying = false, musicStarting = false, musicUnlocked = false, musicEpoch = 0;
  let liveScene = null, liveTimer = null, gesturesBound = false;
  try { soundWanted = root.localStorage?.getItem(SOUND_KEY) === 'on'; musicWanted = root.localStorage?.getItem(MUSIC_KEY) === 'on'; } catch { /* Optional preferences. */ }

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
    const nameAttribute = row => board.localizeNames === true || row.localizeName === true ? '' : ' data-user-text';
    return `<section class="table-valuation" aria-label="The value at this table"><div class="valuation-heading"><div><span class="eyebrow">THE VALUE AT THIS TABLE</span><h3>One crate. Different opportunities.</h3></div><div class="valuation-ordinary"><span>Ordinary crate value</span><strong>${money(board.ordinary)}</strong></div></div><div class="valuation-grid" style="--valuation-columns:${Math.min(4,board.rows.length)}">${board.rows.map((row, index) => {
      const affordable = row.affordable !== false, actual = row.actual === true;
      const role = Object.hasOwn(roles, row.role) ? roles[row.role].short : '';
      const profit = number(row.profit), tone = profit < 0 ? 'is-loss' : profit > 0 ? 'is-gain' : 'is-even';
      return `<article class="valuation-card ${actual ? 'is-actual' : 'is-hypothetical'} ${affordable ? tone : 'is-unaffordable'}" style="--valuation-order:${index}"><div class="valuation-player">${portrait(row.role)}<div><strong${nameAttribute(row)}>${escape(row.name)}</strong><span>${escape(role)}</span></div>${actual ? '<span class="valuation-seal" aria-hidden="true">✓</span>' : ''}</div><p class="valuation-status">${actual ? 'Actual sale' : affordable ? 'If you had won' : 'Not enough cash'}</p><div class="valuation-profit"><strong>${affordable ? signed(profit) : '—'}</strong><span>${affordable ? 'Profit at this price' : 'This bid exceeds your cash.'}</span></div>${affordable ? `<dl class="valuation-breakdown"><div><dt>Winning price</dt><dd>${money(board.winningBid)}</dd></div><div><dt>Sale after fees</dt><dd>${money(row.recovery)}</dd></div><div><dt>Processing fees</dt><dd>${money(row.cost)}</dd></div><div><dt>Role advantage</dt><dd>${signed(row.abilityGain)}</dd></div></dl>` : `<dl class="valuation-breakdown"><div><dt>Winning price</dt><dd>${money(board.winningBid)}</dd></div><div><dt>Cash before bidding</dt><dd>${money(row.cashBefore)}</dd></div></dl>`}</article>`;
    }).join('')}</div><p class="valuation-disclaimer">Hypothetical results use this winning price and each player's cash before bidding. They are not earnings.</p></section>`;
  }

  function updateButton(button) {
    button.setAttribute('aria-pressed', String(sound));
    button.setAttribute('aria-label', 'Auction sounds');
    button.setAttribute('title', soundWanted && !sound ? 'Click to enable audio' : sound ? 'Sound on' : 'Sound off');
    button.innerHTML = `<span class="sound-icon" aria-hidden="true">${sound ? '♪' : '♩'}</span><span>${sound ? 'Sound on' : soundWanted ? 'Sound paused' : 'Sound off'}</span>`;
    localize(button);
  }

  function updateMusicButton(button) {
    button.setAttribute('aria-pressed', String(musicPlaying));
    button.setAttribute('aria-label', 'Background music');
    button.setAttribute('title', musicWanted && !musicPlaying ? 'Click to enable audio' : musicPlaying ? 'Music on' : 'Music off');
    button.innerHTML = `<span class="sound-icon" aria-hidden="true">${musicPlaying ? '♫' : '♩'}</span><span>${musicPlaying ? 'Music on' : musicWanted ? 'Music paused' : 'Music off'}</span>`;
    localize(button);
  }

  function updateAudioButtons() {
    for (const [buttons,update] of [[soundButtons,updateButton],[musicButtons,updateMusicButton]]) for (const button of buttons) {
      if (button.isConnected === false) buttons.delete(button);
      else update(button);
    }
  }

  function remember(key, enabled) {
    try { root.localStorage?.setItem(key, enabled ? 'on' : 'off'); } catch { /* Optional preferences. */ }
  }

  function stopNotes() {
    for (const source of activeNotes) { try { source.stop(); } catch { /* Already ended. */ } }
    activeNotes.clear();
  }

  function loadSamples() {
    return Promise.all(Object.entries(SAMPLES).map(([kind,url]) => {
      if (!sampleLoads.has(kind)) {
        const loading = Promise.resolve().then(() => root.fetch(url)).then(response => {
          if (!response.ok) throw new Error('Audio sample unavailable');
          return response.arrayBuffer();
        }).then(data => audio.decodeAudioData(data)).then(buffer => { samples.set(kind,buffer); return buffer; }).catch(() => {
          // Keep completed samples and shared in-flight work, but let an explicit enable retry failures.
          if (sampleLoads.get(kind) === loading) sampleLoads.delete(kind);
          return null;
        });
        sampleLoads.set(kind,loading);
      }
      return sampleLoads.get(kind);
    }));
  }

  function unlockSound(preview = false) {
    if (!soundWanted || soundStarting || (sound && (!audio?.state || audio.state === 'running'))) return;
    const epoch = ++soundEpoch;
    soundStarting = true; sound = false;
    try {
      const Context = root.AudioContext || root.webkitAudioContext;
      if (!Context || typeof root.fetch !== 'function') throw new Error('Audio unavailable');
      if (!audio) {
        audio = new Context();
        audio.addEventListener?.('statechange',() => {
          if (audio.state !== 'running' && sound) { sound = false; updateAudioButtons(); }
        });
      }
      const ready = loadSamples();
      Promise.resolve(audio.resume?.()).then(() => {
        if (epoch !== soundEpoch || !soundWanted) return;
        if (audio.state && audio.state !== 'running') throw new Error('Audio suspended');
        sound = true; soundStarting = false; updateAudioButtons();
        // Loading never queues a past auction event. Only this explicit enable click gets a preview.
        return ready.then(loaded => {
          if (epoch !== soundEpoch || !soundWanted) return;
          if (!loaded.some(Boolean)) { soundWanted = false; sound = false; remember(SOUND_KEY,false); updateAudioButtons(); return; }
          if (preview && !root.document?.hidden) note('paper');
        });
      }).catch(() => {
        if (epoch !== soundEpoch) return;
        sound = false; soundWanted = false; soundStarting = false; remember(SOUND_KEY,false); updateAudioButtons();
      });
    } catch {
      sound = false; soundWanted = false; soundStarting = false; remember(SOUND_KEY,false); updateAudioButtons();
    }
  }

  function pauseMusic() {
    ++musicEpoch; musicPlaying = false; musicStarting = false;
    try { music?.pause(); } catch { /* Optional audio device. */ }
    updateAudioButtons();
  }

  function playMusic(fromGesture = false) {
    if (!musicWanted || musicStarting || musicPlaying || root.document?.hidden) return;
    if (fromGesture) musicUnlocked = true;
    if (!musicUnlocked) return;
    const epoch = ++musicEpoch;
    musicStarting = true;
    try {
      if (!music) {
        if (typeof root.Audio !== 'function') throw new Error('Music unavailable');
        music = new root.Audio(); music.preload = 'none'; music.loop = true; music.volume = .18; music.src = MUSIC_FILE;
        music.addEventListener?.('error', () => { musicWanted = false; remember(MUSIC_KEY,false); pauseMusic(); });
      }
      Promise.resolve(music.play()).then(() => {
        if (epoch !== musicEpoch || !musicWanted || root.document?.hidden) {
          if (!musicWanted || root.document?.hidden) music.pause();
          return;
        }
        musicPlaying = true; musicStarting = false; updateAudioButtons();
      }).catch(() => {
        if (epoch !== musicEpoch) return;
        musicWanted = false; remember(MUSIC_KEY,false); pauseMusic();
      });
    } catch { musicWanted = false; remember(MUSIC_KEY,false); pauseMusic(); }
  }

  function bindGestures() {
    if (gesturesBound) return;
    gesturesBound = true;
    const gesture = event => {
      // A toggle click must choose its own state, without a capture handler racing it.
      if (event?.target?.closest?.('.auction-sound-toggle,.auction-music-toggle')) return;
      unlockSound(); playMusic(true);
    };
    root.document?.addEventListener?.('pointerdown',gesture,{capture:true,passive:true});
    root.document?.addEventListener?.('keydown',gesture,{capture:true});
    root.document?.addEventListener?.('visibilitychange',() => {
      if (root.document.hidden) { stopNotes(); pauseMusic(); }
      else if (musicWanted && musicUnlocked) playMusic();
    });
    root.addEventListener?.('pagehide',() => { stopNotes(); pauseMusic(); });
  }

  function bindSoundToggle(button) {
    if (!button) return;
    soundButtons.add(button);
    updateButton(button);
    if (boundButtons.has(button)) return;
    boundButtons.add(button);
    button.classList.add('auction-sound-toggle');
    button.addEventListener('click', () => {
      if (sound || soundStarting) { soundWanted = false; sound = false; soundStarting = false; ++soundEpoch; stopNotes(); }
      else { soundWanted = true; unlockSound(true); }
      remember(SOUND_KEY,soundWanted); updateAudioButtons();
    });
    bindGestures();
  }

  function bindMusicToggle(button) {
    if (!button) return;
    musicButtons.add(button); updateMusicButton(button);
    if (boundMusicButtons.has(button)) return;
    boundMusicButtons.add(button); button.classList.add('auction-music-toggle');
    button.addEventListener('click',() => {
      if (musicPlaying || musicStarting) { musicWanted = false; pauseMusic(); }
      else { musicWanted = true; playMusic(true); }
      remember(MUSIC_KEY,musicWanted); updateAudioButtons();
    });
    bindGestures();
  }

  function note(kind, delay = 0) {
    if (!sound || !soundWanted || !audio || root.document?.hidden || !samples.has(kind) || (audio.state && audio.state !== 'running')) return;
    try {
      const source = audio.createBufferSource(), gain = audio.createGain();
      source.buffer = samples.get(kind); gain.gain.setValueAtTime(kind === 'wood' ? .8 : kind === 'coin' ? .6 : .55,audio.currentTime);
      source.connect(gain); gain.connect(audio.destination); activeNotes.add(source);
      source.onended = () => { activeNotes.delete(source); source.disconnect?.(); gain.disconnect?.(); };
      try { source.start(audio.currentTime + delay); }
      catch { activeNotes.delete(source); source.disconnect?.(); gain.disconnect?.(); }
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
    const nameAttribute = localize => detail.localizeNames === true || localize === true ? '' : ' data-user-text';
    const envelopes = bids.length ? bids.map(bid => `<span class="moment-envelope"><span class="moment-bid-name"${nameAttribute(bid.localizeName)}>${escape(bid.name)}</span><strong>${number(bid.bid) > 0 ? money(bid.bid) : '<span>Passed</span>'}</strong></span>`).join('') : '<span class="moment-envelope"></span><span class="moment-envelope"></span><span class="moment-envelope"></span>';
    scene.innerHTML = event === 'settled'
      ? `<span class="moment-coins" aria-hidden="true"><i></i><i></i><i></i></span><div class="moment-copy"><span>Sale settled</span><strong><span>Your result</span> <b>${signed(detail.selfProfit)}</b></strong></div>`
      : `<div class="moment-envelopes" aria-hidden="true">${envelopes}</div><div class="moment-copy"><span>Sealed bids opened</span>${event === 'hammer' ? `<strong><span class="moment-stamp">SOLD</span> <b>${money(detail.winningBid)}</b></strong><small><span${nameAttribute(detail.localizeWinnerName)}>${escape(detail.winnerName)}</span><span class="moment-unveiled">Crate unveiled</span></small><span class="moment-gavel" aria-hidden="true"></span>` : '<strong>No hammer this round</strong>'}</div>`;
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
    updateAudioButtons();
    if (liveScene) localize(liveScene);
  });
  // One seat's review of a settled crate: its own top bid against what the opened crate was worth
  // to it. outcome is 'won', 'sold' (someone else bought), 'unaffordable' or 'unsold'.
  function bidReviewMarkup(review) {
    if (!review || !['won', 'sold', 'unaffordable', 'unsold'].includes(review.outcome) || !Number.isFinite(review.price) || !Number.isFinite(review.worth)) return '';
    const {top = 0, price, worth, outcome} = review;
    const line = (label, value, tone = '') => `<p><span>${label}</span> <strong class="${tone}" data-no-localize>${value}</strong></p>`;
    let verdict = '';
    if (outcome === 'won') {
      verdict = worth === price ? '<p>You paid exactly what it was worth to you.</p>' : worth > price ? line('Worth more to you than you paid:', signed(worth - price), 'positive') : line('You paid more than it was worth to you:', money(price - worth), 'negative');
      if (Number.isFinite(review.recovery) && worth > review.recovery) verdict += line('Your best sale would have added:', signed(worth - review.recovery), 'positive');
    } else if (outcome === 'unaffordable') verdict = line('Your cash was below the hammer price by:', money(price - number(review.cash)), 'negative');
    else if (outcome === 'sold') verdict = worth >= price
      ? (worth === price ? '<p>At the hammer price you would have broken even.</p>' : line('At the hammer price you would still have made:', signed(worth - price), 'positive')) + (top > 0 ? line('Your top bid was below the hammer price by:', money(price - top)) : '')
      : line('Not buying was right. At the hammer price you would have lost:', money(price - worth), 'negative');
    else if (worth > price) verdict = line('Nobody met the reserve. Buying at the reserve would have made:', signed(worth - price), 'positive');
    return `<section class="bid-review" aria-label="Your bid review"><h3>Your bid review</h3><dl><div><dt>Your top bid</dt><dd>${top > 0 ? `<span data-no-localize>${money(top)}</span>` : 'Passed every round'}</dd></div><div><dt>${outcome === 'unsold' ? 'Auction-house reserve' : 'Hammer price'}</dt><dd data-no-localize>${money(price)}</dd></div><div><dt title="Ordinary sale plus your best ability use, after fees.">Worth to you</dt><dd data-no-localize>${money(worth)}</dd></div></dl>${verdict}</section>`;
  }
  return Object.freeze({sourceMarkup,valuationMarkup,bidReviewMarkup,present,bindSoundToggle,bindMusicToggle,get soundEnabled(){return sound;},get musicEnabled(){return musicPlaying;}});
});
