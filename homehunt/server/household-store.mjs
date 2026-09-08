import { CloudSnapshotError, normalizeCloudSnapshot } from '../js/cloud-snapshot-core.mjs';

function identity(context) {
  // Context is created by the server authentication gate, never by JSON body
  // or query parameters. Membership must already be checked by that gate.
  if (!context || typeof context.uid !== 'string' || !context.uid.trim() || context.uid.length > 128) {
    throw new CloudSnapshotError('로그인이 필요합니다.', 'CLOUD_AUTH_REQUIRED', 401);
  }
  if (typeof context.householdId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(context.householdId)
    || ['__proto__', 'constructor', 'prototype'].includes(context.householdId)) {
    throw new CloudSnapshotError('허용된 가족 공간을 확인할 수 없습니다.', 'CLOUD_HOUSEHOLD_FORBIDDEN', 403);
  }
  return { uid: context.uid, householdId: context.householdId };
}

function revision(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER) {
    throw new CloudSnapshotError('현재 저장 버전을 먼저 확인해주세요.', 'INVALID_CLOUD_REVISION', 400);
  }
  return value;
}

function storedSnapshot(document) {
  if (!document.exists) return { snapshot: null, revision: 0, updatedAt: null };
  const data = document.data();
  if (!data || !Number.isSafeInteger(data.revision) || data.revision < 1
    || data.revision >= Number.MAX_SAFE_INTEGER || typeof data.updatedAt !== 'string'
    || !Number.isFinite(Date.parse(data.updatedAt))) {
    throw new CloudSnapshotError('저장 기록의 버전을 확인할 수 없습니다.', 'INVALID_STORED_CLOUD_SNAPSHOT', 500);
  }
  return { snapshot: normalizeCloudSnapshot(data.snapshot), revision: data.revision, updatedAt: data.updatedAt };
}

/** Firebase Admin Firestore adapter. No client Firestore writes are needed. */
export function createHouseholdStore({ db, now = () => new Date() } = {}) {
  if (!db || typeof db.doc !== 'function' || typeof db.runTransaction !== 'function') {
    throw new TypeError('A Firestore Admin database is required.');
  }
  const reference = householdId => db.doc(`homehunt_households/${householdId}/snapshots/main`);
  return {
    async load(context) {
      const { householdId } = identity(context);
      return storedSnapshot(await reference(householdId).get());
    },
    async save(snapshot, expectedRevision, context) {
      const { householdId, uid } = identity(context);
      const expected = revision(expectedRevision);
      const safe = normalizeCloudSnapshot(snapshot);
      const date = new Date(now());
      if (!Number.isFinite(date.getTime())) throw new TypeError('Invalid server clock.');
      const updatedAt = date.toISOString();
      const ref = reference(householdId);
      return db.runTransaction(async transaction => {
        const current = storedSnapshot(await transaction.get(ref));
        if (current.revision !== expected) {
          const error = new CloudSnapshotError('다른 기기에서 저장한 변경이 있습니다. 클라우드 기록을 먼저 불러와주세요.', 'CLOUD_SNAPSHOT_CONFLICT', 409);
          error.currentRevision = current.revision;
          throw error;
        }
        const next = { snapshot: safe, revision: current.revision + 1, updatedAt };
        transaction.set(ref, { ...next, updatedBy: uid });
        return next;
      });
    },
  };
}
