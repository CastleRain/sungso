// Deterministic Firestore contract double. Transactions stage writes and commit
// atomically, so separate adapter instances exercise the same shared ledger.
export function createMemoryFirestore() {
  const documents = new Map();
  const calls = { reads: 0, writes: 0, transactions: 0 };
  let tail = Promise.resolve();
  const snapshot = key => ({ exists: documents.has(key), data: () => structuredClone(documents.get(key)) });
  const collection = name => ({ doc(id) {
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
