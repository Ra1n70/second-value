(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SecondValueRoomTransport = api;
})(typeof window === 'undefined' ? globalThis : window, () => {
  'use strict';
  function networkError(message = 'Could not reach the auction room. Please try again.') {
    const error = new Error(message);
    error.network = true;
    return error;
  }
  async function requestJSON(url, options = {}, {fetchImpl = globalThis.fetch, timeoutMs = 8000} = {}) {
    const controller = new AbortController();
    let timeout;
    const deadline = new Promise((resolve, reject) => {
      timeout = setTimeout(() => {
        reject(networkError('The room request timed out. Please try again.'));
        controller.abort();
      }, timeoutMs);
    });
    try {
      return await Promise.race([deadline, (async () => {
        let response;
        try {
          response = await fetchImpl(url, {...options, cache:'no-store', signal:controller.signal,
            headers:{'Content-Type':'application/json', ...(options.headers || {})}});
        } catch { throw networkError(); }
        let payload;
        try { payload = await response.json(); } catch { throw networkError(); }
        if (!response.ok) {
          const error = new Error(payload?.error || 'Could not reach the auction room. Please try again.');
          error.status = response.status;
          throw error;
        }
        return payload;
      })()]);
    } finally { clearTimeout(timeout); }
  }
  return {requestJSON};
});
