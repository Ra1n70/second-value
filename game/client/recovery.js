/* Recovery guidance consumes only the safe room projection; it never issues actions. */
(function (root, factory) {
  const recovery = factory();
  if (typeof module === 'object' && module.exports) module.exports = recovery;
  else root.SecondValueRecovery = recovery;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';
  function stableSignature(view) {
    if (!view) return JSON.stringify(view);
    const {serverNow, ...stable} = view;
    // This capability changes when the server clock reaches a fixed deadline.
    // Updating its existing controls does not require replacing game inputs.
    if (stable.can && Object.hasOwn(stable.can,'endStalled')) {
      const {endStalled, ...can} = stable.can;
      stable.can = can;
    }
    return JSON.stringify(stable);
  }
  function stalled(view) {
    const self = view?.players?.find(player => player.id === view.selfId);
    const availableAt = Number.isFinite(view?.recovery?.availableAt) ? view.recovery.availableAt : null;
    const blockers = Array.isArray(view?.recovery?.blockingPlayerIds) ? view.recovery.blockingPlayerIds.filter(id => typeof id === 'string') : [];
    const visible = Boolean(view && view.phase !== 'ended' && self && self.active !== false && !self.isBot && availableAt !== null && blockers.length);
    return {visible,availableAt,ready:visible && view.can?.endStalled === true};
  }
  function elapsed(since, now) {
    return Number.isFinite(since) && Number.isFinite(now) ? Math.max(0, Math.floor((now - since) / 1000)) : null;
  }
  function clock(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '—';
    const total = Math.floor(seconds), hours = Math.floor(total / 3600), minutes = Math.floor(total / 60) % 60;
    return `${hours ? hours + ':' + String(minutes).padStart(2, '0') : minutes}:${String(total % 60).padStart(2, '0')}`;
  }
  function reason(view, player) {
    if (!view || !player || player.active === false) return 'This player has no pending action in this stage.';
    if (view.phase === 'auction') return player.submitted
      ? 'Their sealed choice is already submitted.' : 'This player still needs to submit a bid or pass.';
    if (view.phase === 'dispose' && view.winnerId === player.id) return 'The winner needs to settle this crate.';
    if (view.phase === 'round-summary' && view.hostId === player.id) return 'The host needs to open the next round.';
    if (['lobby', 'result'].includes(view.phase)) {
      if (!player.ready) return 'This player still needs to get ready.';
      if (player.id === view.hostId && view.players?.filter(candidate => candidate.active !== false).every(candidate => candidate.ready)) return view.phase === 'lobby'
        ? 'The host needs to start the auction.' : 'The host needs to open the next crate or finish the session.';
      return 'This player is already ready.';
    }
    return 'This player has no pending action in this stage.';
  }
  return {stableSignature, stalled, elapsed, clock, reason};
});
