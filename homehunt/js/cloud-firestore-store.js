import { CloudSnapshotError, normalizeCloudSnapshot } from './cloud-snapshot-core.mjs?v=4.18.0';

const conflict = currentRevision => {
  const error = new CloudSnapshotError('다른 기기에서 저장한 변경이 있습니다. 클라우드 기록을 먼저 불러와주세요.', 'CLOUD_SNAPSHOT_CONFLICT', 409);
  error.currentRevision = currentRevision;
  return error;
};

function fromDocument(document) {
  if (!document.exists()) return { snapshot: null, revision: 0, updatedAt: null };
  const data = document.data();
  if (!Number.isSafeInteger(data?.revision) || data.revision < 1 || data.revision >= Number.MAX_SAFE_INTEGER
    || typeof data.updatedAt !== 'string' || !Number.isFinite(Date.parse(data.updatedAt))) {
    throw new CloudSnapshotError('클라우드 기록의 저장 버전을 확인할 수 없습니다.', 'INVALID_STORED_CLOUD_SNAPSHOT', 500);
  }
  return { snapshot: normalizeCloudSnapshot(data.snapshot), revision: data.revision, updatedAt: data.updatedAt };
}

/** Free-plan private backup adapter. Firestore rules must restrict the path to
 * the signed-in, verified, allowlisted user. Household API remains separate. */
export function createUserSnapshotStore({ db, sdk, getUid, now = () => new Date() }) {
  const uid = () => {
    const value = getUid();
    if (typeof value !== 'string' || !value || value.length > 128 || value.includes('/')) {
      throw new CloudSnapshotError('Google 로그인이 필요합니다.', 'CLOUD_AUTH_REQUIRED', 401);
    }
    return value;
  };
  const sameUser = expected => {
    if (uid() !== expected) throw new CloudSnapshotError('로그인 계정이 바뀌었습니다. 다시 실행해주세요.', 'CLOUD_SESSION_CHANGED', 409);
  };
  return {
    async load() {
      const owner = uid();
      // getDocFromServer avoids presenting an offline cache as the newest
      // cloud revision. Personal backups are explicit online operations.
      const document = await sdk.getDocFromServer(sdk.doc(db, 'homehunt_user_snapshots', owner));
      sameUser(owner);
      return fromDocument(document);
    },
    async save(snapshot, expectedRevision) {
      const owner = uid();
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER) {
        throw new CloudSnapshotError('현재 클라우드 저장 버전을 먼저 확인해주세요.', 'INVALID_CLOUD_REVISION', 400);
      }
      const safe = normalizeCloudSnapshot(snapshot);
      const ref = sdk.doc(db, 'homehunt_user_snapshots', owner);
      const updatedAt = new Date(now()).toISOString();
      const result = await sdk.runTransaction(db, async transaction => {
        sameUser(owner);
        const current = fromDocument(await transaction.get(ref));
        sameUser(owner);
        if (current.revision !== expectedRevision) throw conflict(current.revision);
        const next = { snapshot: safe, revision: current.revision + 1, updatedAt };
        transaction.set(ref, { ...next, updatedBy: owner });
        return next;
      });
      sameUser(owner);
      return result;
    },
  };
}
