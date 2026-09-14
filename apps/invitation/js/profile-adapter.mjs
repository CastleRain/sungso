import { PROFILE_PATH, MAX_TRANSACTION_PHOTO_CHARS, ProfileConflict, normalizeProfile, validatePhoto, validateProfileChange, profilePhotoIds, emptyProfileSnapshot, completeProfileSnapshot } from './profile-core.mjs?v=20260915-venue-map';

/** No photo or profile document is created by subscription or retry. */
export function profileAdapter(sdk, db, { member = () => null, online = () => true, events = null, timeout = 15000 } = {}) {
  const ref = sdk.doc(db, ...PROFILE_PATH.split('/'));
  const photoRef = id => sdk.doc(db, ...PROFILE_PATH.split('/'), 'photos', id);
  let next, failure, unsubscribe, timer, active = true, generation = 0, loadGeneration = 0;
  let published = emptyProfileSnapshot(), media = {};
  const clear = () => { unsubscribe?.(); unsubscribe = null; clearTimeout(timer); loadGeneration++; };
  const identify = () => {
    const caller = member(), epoch = generation;
    return () => active && caller && epoch === generation && member()?.uid === caller.uid && member()?.role === caller.role;
  };
  const pending = connection => next?.({ ...published, ready: false }, connection);
  const begin = () => {
    if (!active) return;
    clear(); generation++;
    published = emptyProfileSnapshot(); media = {};
    const current = identify();
    pending('loading');
    if (!current()) { failure?.(new Error('승인된 계정으로 로그인해주세요.')); return; }
    timer = setTimeout(() => { if (current()) failure?.(new Error('공통 사진을 불러오는 데 시간이 걸리고 있어요. 다시 연결해주세요.')); }, timeout);
    unsubscribe = sdk.onSnapshot(ref, { includeMetadataChanges: true }, async snapshot => {
      if (!current()) return;
      const load = ++loadGeneration;
      const stillCurrent = () => current() && load === loadGeneration;
      if (!online() || snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) { pending(online() ? 'loading' : 'offline'); return; }
      try {
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (!stillCurrent()) return;
          loadGeneration++;
          failure?.(Object.assign(new Error('공통 사진을 불러오는 데 시간이 걸리고 있어요. 다시 연결해주세요.'), { code: 'profile-media-timeout' }));
        }, timeout);
        const profile = normalizeProfile(snapshot.exists() ? snapshot.data() : null);
        const ids = profilePhotoIds(profile);
        pending('loading');
        const loaded = {};
        await Promise.all(ids.map(async id => {
          if (media[id]) { loaded[id] = media[id]; return; }
          const photo = await (sdk.getDocFromServer || sdk.getDoc)(photoRef(id));
          if (!stillCurrent()) return;
          if (!photo.exists() || photo.metadata?.fromCache || photo.metadata?.hasPendingWrites) throw Object.assign(new Error('선택된 사진을 찾지 못했어요. 다시 연결하거나 사진을 다시 선택해주세요.'), { code: 'profile-media-missing' });
          loaded[id] = validatePhoto(photo.data());
        }));
        if (!stillCurrent()) return;
        published = completeProfileSnapshot(profile, loaded); media = published.photos;
        clearTimeout(timer);
        next?.(published, 'live');
      } catch (error) { if (stillCurrent()) { clearTimeout(timer); failure?.(error); } }
    }, error => { if (current()) { clearTimeout(timer); failure?.(error); } });
  };
  const offline = () => { if (active) { loadGeneration++; failure?.(Object.assign(new Error('인터넷 연결이 끊겼어요. 작성한 내용은 유지되며 연결 후 저장할 수 있어요.'), { code: 'profile-offline' })); } };
  const dispose = () => { active = false; generation++; clear(); next = null; failure = null; media = {}; published = emptyProfileSnapshot(); events?.removeEventListener('online', begin); events?.removeEventListener('offline', offline); };
  return {
    subscribe(callback, error) { next = callback; failure = error; begin(); events?.addEventListener('online', begin); events?.addEventListener('offline', offline); return dispose; },
    retry: begin,
    dispose,
    async transact(change) {
      const current = identify(), caller = member(), normalized = validateProfileChange(change);
      const assertCurrent = () => { if (!current()) throw new Error('로그인 계정이 바뀌었어요.'); };
      assertCurrent();
      if (!online()) throw Object.assign(new Error('인터넷에 연결한 뒤 다시 저장해주세요.'), { code: 'profile-offline' });
      let revision;
      try { await sdk.runTransaction(db, async tx => {
        assertCurrent();
        const existing = await tx.get(ref);
        assertCurrent();
        const previous = normalizeProfile(existing.exists() ? existing.data() : null);
        if (previous.revision !== normalized.expectedRevision) throw new ProfileConflict();
        const previousIds = profilePhotoIds(previous), ids = profilePhotoIds(normalized.profile);
        const removed = previousIds.filter(id => !ids.includes(id));
        const documents = {};
        await Promise.all([...new Set([...ids, ...removed])].map(async id => {
          const snapshot = await tx.get(photoRef(id));
          assertCurrent();
          documents[id] = snapshot.exists() ? snapshot.data() : null;
        }));
        assertCurrent();
        for (const id of ids) {
          if (normalized.newPhotos[id]) {
            if (documents[id]) throw new Error('이미 저장된 사진 번호예요. 사진을 다시 선택해주세요.');
          } else {
            if (!documents[id]) throw Object.assign(new Error('선택된 사진이 없어 저장하지 못했어요. 사진을 다시 선택해주세요.'), { code: 'profile-media-missing' });
            validatePhoto(documents[id]);
          }
        }
        const payloadSize = Object.values(normalized.newPhotos).reduce((total, photo) => total + photo.dataUrl.length, 0)
          + removed.reduce((total, id) => total + (documents[id]?.dataUrl?.length || 0), 0);
        if (payloadSize > MAX_TRANSACTION_PHOTO_CHARS) throw new Error('한 번에 교체할 사진 용량이 커요. 더 작게 압축하거나 일부씩 저장해주세요.');
        assertCurrent();
        const metadata = { updatedAt: sdk.serverTimestamp(), updatedBy: caller.uid };
        for (const [id, photo] of Object.entries(normalized.newPhotos)) tx.set(photoRef(id), { ...photo, ...metadata });
        for (const id of removed) tx.delete(photoRef(id));
        revision = previous.revision + 1;
        tx.set(ref, { ...normalized.profile, revision, ...metadata });
      }); } catch (error) {
        assertCurrent();
        // A competing parent update can make getAfter rules reject the old
        // commit before the SDK reports its optimistic revision conflict.
        // Read the parent once to classify it; never retry with a newer base.
        if (['permission-denied', 'aborted', 'profile-media-missing'].includes(error.code)) {
          let latestRevision;
          try {
            const latest = await (sdk.getDocFromServer || sdk.getDoc)(ref);
            assertCurrent();
            if (!latest.metadata?.fromCache && !latest.metadata?.hasPendingWrites) latestRevision = normalizeProfile(latest.exists() ? latest.data() : null).revision;
          } catch { assertCurrent(); throw error; }
          if (latestRevision !== undefined && latestRevision !== normalized.expectedRevision) throw new ProfileConflict();
        }
        throw error;
      }
      assertCurrent();
      return { revision };
    },
  };
}
