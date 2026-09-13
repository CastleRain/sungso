// Wake a sleeping free server with a public, side-effect-free probe before
// sending any authenticated request. Never retry a price/commute mutation.
export function createCloudApiReadiness({ url, fetchImpl = globalThis.fetch, now = Date.now,
  timeoutMs = 90000, idleMs = 600000, onState = () => {} } = {}) {
  let pending = null; let controller; let lastActive = -Infinity; let epoch = 0;
  const publish = value => { try { onState(value); } catch { /* UI is optional. */ } };
  function start() {
    if (pending) return pending;
    if (now() - lastActive < idleMs) return Promise.resolve();
    const current = epoch;
    controller = new AbortController();
    const ownController = controller;
    const signal = ownController.signal;
    const timer = setTimeout(() => ownController.abort(), timeoutMs);
    publish('waking');
    pending = (async () => {
      const response = await fetchImpl(url, { method: 'GET', signal, credentials: 'omit',
        redirect: 'error', cache: 'no-store' });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.ok !== true) throw new Error('SERVER_NOT_READY');
      if (current !== epoch) throw new DOMException('Cancelled', 'AbortError');
      lastActive = now(); publish('ready');
    })().catch(error => {
      if (current === epoch) { lastActive = -Infinity; publish('unavailable'); }
      throw error;
    }).finally(() => {
      clearTimeout(timer);
      if (current === epoch) { pending = null; controller = null; }
    });
    return pending;
  }
  return {
    async ensure(signal) {
      if (signal?.aborted) throw signal.reason || new DOMException('Cancelled', 'AbortError');
      const work = start();
      if (!signal) return work;
      let abort;
      const cancelled = new Promise((_, reject) => {
        abort = () => reject(signal.reason || new DOMException('Cancelled', 'AbortError'));
        signal.addEventListener('abort', abort, { once: true });
      });
      try { await Promise.race([work, cancelled]); }
      finally { signal.removeEventListener('abort', abort); }
    },
    touch() { lastActive = now(); },
    invalidate() { lastActive = -Infinity; },
    reset() { epoch += 1; controller?.abort(); controller = null; pending = null; lastActive = -Infinity; publish('idle'); },
  };
}
