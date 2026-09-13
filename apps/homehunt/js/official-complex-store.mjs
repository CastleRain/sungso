const DB_NAME = 'homehunt_public_facilities_v1';
const STORE = 'responses';
const MAX_ENTRIES = 3000;
const MAX_BYTES = 20000;

/** This namespace is a public API identity, never an account, query or token. */
export function officialComplexCacheNamespace(url) {
  try {
    const endpoint = new URL(url);
    if (!['https:', 'http:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) return null;
    return `${endpoint.origin}${endpoint.pathname}:kapt-identity-v1`;
  } catch { return null; }
}

/** Small, optional IndexedDB store for allowlisted K-apt responses. Records are
 * bounded across API environments and older entries are evicted first. Opening
 * or writing a blocked browser database must never hold up the search screen.
 */
export function createOfficialComplexStore({ url, indexedDB = globalThis.indexedDB,
  timeoutMs = 1500, maxEntries = MAX_ENTRIES } = {}) {
  const namespace = officialComplexCacheNamespace(url);
  if (!namespace || typeof indexedDB?.open !== 'function') return null;
  const limit = Number.isSafeInteger(maxEntries) && maxEntries > 0 ? Math.min(maxEntries, MAX_ENTRIES) : MAX_ENTRIES;
  let opening;
  function open() {
    if (opening) return opening;
    opening = new Promise(resolve => {
      let settled = false;
      const finish = db => { if (settled) { db?.close(); return; } settled = true; clearTimeout(timer); resolve(db); };
      const timer = setTimeout(() => finish(null), timeoutMs);
      try {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE)) {
            const store = db.createObjectStore(STORE, { keyPath: 'key' });
            store.createIndex('savedAt', 'savedAt');
          }
        };
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => { db.close(); opening = undefined; };
          finish(db);
        };
        request.onerror = request.onblocked = () => finish(null);
      } catch { finish(null); }
    });
    return opening;
  }
  async function transact(mode, run, fallback) {
    const db = await open();
    if (!db) return fallback;
    return new Promise(resolve => {
      let tx, result = fallback, settled = false;
      const finish = value => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); };
      const timer = setTimeout(() => { try { tx?.abort(); } catch { /* Already complete. */ } finish(fallback); }, timeoutMs);
      try {
        tx = db.transaction(STORE, mode);
        tx.oncomplete = () => finish(result);
        tx.onerror = tx.onabort = () => finish(fallback);
        run(tx.objectStore(STORE), value => { result = value; });
      } catch { finish(fallback); }
    });
  }
  return Object.freeze({
    async load() {
      return transact('readonly', (store, done) => {
        const request = store.getAll();
        request.onsuccess = () => done(request.result.filter(row => row?.namespace === namespace)
          .slice(-limit).map(row => row.entry));
      }, []);
    },
    async put(entry) {
      if (!entry || !/^[A-Za-z0-9_-]{1,64}$/.test(entry.catalogId || '')
        || !Number.isFinite(entry.savedAt) || JSON.stringify(entry).length > MAX_BYTES) return false;
      return transact('readwrite', (store, done) => {
        store.put({ key: `${namespace}\n${entry.catalogId}`, namespace, savedAt: entry.savedAt, entry });
        const count = store.count();
        count.onsuccess = () => {
          let extra = count.result - limit;
          if (extra <= 0) { done(true); return; }
          const oldest = store.index('savedAt').openCursor();
          oldest.onsuccess = () => {
            const cursor = oldest.result;
            if (!cursor || extra <= 0) { done(true); return; }
            cursor.delete(); extra -= 1; cursor.continue();
          };
        };
      }, false);
    },
  });
}
