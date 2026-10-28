// Deterministic Firestore contract double. Transactions stage writes and commit
// atomically, so separate adapter instances exercise the same shared ledger.
export function createMemoryFirestore() {
  const documents = new Map();
  const calls = { reads: 0, writes: 0, transactions: 0 };
  let tail = Promise.resolve();
  const snapshot = key => ({ id: key.split('/').at(-1), exists: documents.has(key), data: () => structuredClone(documents.get(key)) });
  const query = (name, state = {}) => ({
    orderBy(field) { if (field !== '__name__') throw Error('Memory query supports document IDs only'); return query(name, { ...state, ordered: true }); },
    startAt(value) { return query(name, { ...state, start: value, exclusive: false }); },
    startAfter(value) { return query(name, { ...state, start: value, exclusive: true }); },
    endAt(value) { return query(name, { ...state, end: value }); },
    limit(value) { if (!Number.isInteger(value) || value <= 0) throw Error('Invalid query limit'); return query(name, { ...state, limit: value }); },
    async get() {
      if (!state.ordered) throw Error('Memory range query requires document ID ordering');
      const prefix = name + '/';
      const entries = [...documents.keys()].filter(key => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
        .sort().filter(key => { const id = key.slice(prefix.length); return (state.start === undefined || (state.exclusive ? id > state.start : id >= state.start)) && (state.end === undefined || id <= state.end); })
        .slice(0, state.limit ?? Infinity);
      calls.reads += Math.max(1, entries.length);
      return { docs: entries.map(snapshot), size: entries.length, empty: entries.length === 0 };
    },
  });
  const collection = name => ({ ...query(name), doc(id) {
    const key = `${name}/${id}`;
    return {
      key, path: key,
      async get() { calls.reads++; return snapshot(key); },
      async set(value) { calls.writes++; documents.set(key, structuredClone(value)); },
      collection: child => collection(`${key}/${child}`),
    };
  } });
  return {
    documents, calls, collection,
    runTransaction(action) {
      calls.transactions++;
      const run = tail.then(async () => {
        const writes = new Map();
        const result = await action({
          async get(ref) { calls.reads++; return snapshot(ref.key); },
          set(ref, value) { writes.set(ref.key, structuredClone(value)); },
        });
        for (const [key, value] of writes) { calls.writes++; documents.set(key, value); }
        return result;
      });
      tail = run.catch(() => {});
      return run;
    },
  };
}
