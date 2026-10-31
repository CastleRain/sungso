import { createHash } from 'node:crypto';
import { normalizeComposition } from '../../../shared/invitation/studio/composition.mjs';
import { normalizeContentDraft } from '../../../shared/invitation/studio/content-draft.mjs';

export const STUDIO_PATH = '/api/invitation/studio';
export const STUDIO_BODY_LIMIT = 4 * 1024 * 1024;
const ROOT = 'wedding_studio/sungso_20270306';
const ID = /^[a-f0-9-]{36}$/i, HASH = /^[a-f0-9]{64}$/;
export const isStudioRoute = path => new RegExp(`^${STUDIO_PATH}/(?:session|manage|published|draft/[a-f0-9-]{36}|photo/[a-f0-9]{64})$`, 'i').test(path);
export class StudioError extends Error {
  constructor(message, code = 'INVALID_STUDIO', status = 400) { super(message); this.code = code; this.status = status; }
}
const fail = message => { throw new StudioError(message); };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const initial = () => ({ schema: 1, revision: 0, drafts: [], releases: [], published: null, photoIds: [], operations: [] });
function state(raw) {
  if (raw === undefined) return initial();
  if (raw.schema !== 1 || !Number.isSafeInteger(raw.revision) || !Array.isArray(raw.drafts) || !Array.isArray(raw.releases)) throw Error('INVALID_STATE');
  return raw;
}
function string(value, max) { if (typeof value !== 'string' || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) fail('입력 내용을 확인해 주세요.'); return value.trim(); }
export function validateStudioSnapshot(value) {
  if (!value || Object.keys(value).some(k => !['composition', 'content'].includes(k))) fail('지원하지 않는 초안 형식이에요.');
  const composition = normalizeComposition(value.composition);
  // Only the existing visual schema is accepted; imported endpoint/auth/mode flags never survive.
  if (!value.composition || Object.keys(value.composition).some(k => !Object.hasOwn(composition, k))) fail('지원하지 않는 디자인 설정이에요.');
  let content;
  try { content = normalizeContentDraft(value.content); } catch (e) { fail(e.message); }
  if (content.photos.some(p => p.src.length > 700000)) fail('공동 저장은 사진 한 장당 700KB까지 가능해요. 사진을 다시 추가하거나 크기를 줄여 주세요.');
  if (Buffer.byteLength(JSON.stringify(content)) > 3 * 1024 * 1024) fail('공동 초안의 추가 사진은 합계 3MB까지 가능해요. 사진 수를 줄여 주세요.');
  return { composition, content };
}
const view = s => ({ revision: s.revision, drafts: s.drafts, releases: s.releases.map(({ snapshot, ...r }) => r), published: s.published });

export function createStudioStore({ db, now = Date.now }) {
  const ref = db.doc(ROOT);
  const getState = async () => { const doc = await ref.get(); return state(doc.exists ? doc.data() : undefined); };
  async function hydrate(snapshot) {
    const photos = await Promise.all(snapshot.content.photos.map(async p => {
      const file = await db.doc(`${ROOT}/photos/${p.file}`).get();
      if (!file.exists) throw Error('MISSING_PHOTO');
      const { file: ignored, ...meta } = p; return { ...meta, src: file.data().src };
    }));
    return { ...snapshot, content: { ...snapshot.content, photos } };
  }
  return {
    async read() { return view(await getState()); },
    async draft(id) {
      if (!ID.test(id)) fail('초안 주소를 확인해 주세요.');
      const s = await getState(), meta = s.drafts.find(d => d.id === id);
      if (!meta) throw new StudioError('초안을 찾을 수 없어요.', 'NOT_FOUND', 404);
      const doc = await db.doc(`${ROOT}/drafts/${id}`).get();
      const stored = doc.data();
      return { ...stored, snapshot: await hydrate(stored.snapshot) };
    },
    async published() {
      const s = await getState(), release = s.releases.find(r => r.id === s.published);
      if (!release || release.legacy) return { revision: s.revision, release: null };
      // Only the active release is public. Draft names, history and editor metadata remain private.
      const snapshot = release.snapshot;
      return { revision: s.revision, release: { id: release.id, snapshot: {
        composition: snapshot.composition,
        content: { ...snapshot.content, photos: snapshot.content.photos.filter(p => snapshot.content.albumOrder === null || snapshot.content.albumOrder.includes(p.id)).map(({ file, ...p }) => ({ ...p, src: `${STUDIO_PATH}/photo/${file}` })) },
      } } };
    },
    async photo(id) {
      if (!HASH.test(id)) throw new StudioError('사진을 찾을 수 없어요.', 'NOT_FOUND', 404);
      const s = await getState(), current = s.releases.find(r => r.id === s.published);
      if (!current?.snapshot?.content.photos.some(p => p.file === id && (current.snapshot.content.albumOrder === null || current.snapshot.content.albumOrder.includes(p.id)))) throw new StudioError('사진을 찾을 수 없어요.', 'NOT_FOUND', 404);
      const snap = await db.doc(`${ROOT}/photos/${id}`).get();
      if (!snap.exists) throw Error('MISSING_PHOTO');
      return snap.data().src;
    },
    async change(body, member) {
      if (!body || Object.keys(body).some(k => !['action','operationId','expectedRevision','id','expectedDraftRevision','name','note','rating','snapshot'].includes(k)) || !ID.test(body.operationId || '') || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) fail('저장 요청을 확인해 주세요.');
      if (!['save','publish','restore'].includes(body.action)) fail('지원하지 않는 작업이에요.');
      if (!ID.test(body.id || '') && !(body.action === 'restore' && body.id === 'legacy')) fail('초안 주소를 확인해 주세요.');
      const snapshot = body.action === 'save' ? validateStudioSnapshot(body.snapshot) : null;
      const name = body.action === 'save' ? string(body.name, 32) : null;
      if (body.action === 'save' && (!name || !Number.isInteger(body.rating) || body.rating < 0 || body.rating > 5)) fail('초안 이름과 별점을 확인해 주세요.');
      const note = body.action === 'save' ? string(body.note, 240) : null;
      const fingerprint = hash(body);
      return db.runTransaction(async tx => {
        const doc = await tx.get(ref), old = state(doc.exists ? doc.data() : undefined);
        const retry = old.operations.find(op => op.id === body.operationId);
        if (retry) { if (retry.hash !== fingerprint) fail('같은 요청 번호에 다른 내용이 들어왔어요.'); return view(old); }
        if (old.revision !== body.expectedRevision) throw new StudioError('다른 창에서 공동 초안이 바뀌었어요. 입력은 그대로 두었으니 목록을 새로고침한 뒤 확인해 주세요.', 'CONFLICT', 409);
        const next = structuredClone(old), time = now();
        if (body.action === 'save') {
          const previous = old.drafts.find(d => d.id === body.id);
          if ((previous?.revision || 0) !== body.expectedDraftRevision) throw new StudioError('이 초안의 새 버전을 먼저 불러와 주세요. 현재 작업은 새 초안으로 저장할 수 있어요.', 'CONFLICT', 409);
          if (!previous && old.drafts.length >= 40) fail('공동 초안은 40개까지 보관할 수 있어요. 기존 초안을 선택해 수정해 주세요.');
          const stored = structuredClone(snapshot);
          stored.content.photos = snapshot.content.photos.map(({ src, ...p }) => ({ ...p, file: hash(src) }));
          const additions = stored.content.photos.filter(p => !next.photoIds.includes(p.file));
          if (next.photoIds.length + new Set(additions.map(p => p.file)).size > 200) fail('공동 사진 보관 한도에 도달했어요. 기존 사진첩 관리의 사진을 이용해 주세요.');
          snapshot.content.photos.forEach((p, i) => {
            const file = stored.content.photos[i].file;
            if (!next.photoIds.includes(file)) { tx.set(db.doc(`${ROOT}/photos/${file}`), { src: p.src }); next.photoIds.push(file); }
          });
          const meta = { id: body.id, name, note, rating: body.rating, revision: (previous?.revision || 0) + 1, updatedAt: time, editor: member.role };
          next.drafts = [meta, ...old.drafts.filter(d => d.id !== body.id)];
          tx.set(db.doc(`${ROOT}/drafts/${body.id}`), { ...meta, snapshot: stored });
        } else {
          let snapshot, label, legacy = false;
          if (body.action === 'publish') {
            const meta = old.drafts.find(d => d.id === body.id);
            if (!meta || meta.revision !== body.expectedDraftRevision) throw new StudioError('확인한 초안이 변경되었어요. 다시 불러와 확인해 주세요.', 'CONFLICT', 409);
            const draft = await tx.get(db.doc(`${ROOT}/drafts/${body.id}`));
            snapshot = draft.data().snapshot; label = meta.name;
          } else if (body.id === 'legacy') { legacy = true; label = '기존 VER5.6'; }
          else {
            const release = old.releases.find(r => r.id === body.id);
            if (!release) throw new StudioError('복원할 공개본을 찾지 못했어요.', 'NOT_FOUND', 404);
            snapshot = release.snapshot; label = release.name; legacy = Boolean(release.legacy);
          }
          // A release owns a snapshot, never a mutable draft reference.
          const release = { id: body.operationId, name: label, createdAt: time, editor: member.role, ...(legacy ? { legacy: true } : { snapshot }) };
          next.releases = [release, ...old.releases].slice(0, 20); next.published = release.id;
        }
        next.revision++; next.operations = [{ id: body.operationId, hash: fingerprint }, ...old.operations].slice(0, 80);
        tx.set(ref, next); return view(next);
      });
    },
  };
}

export function createStudioApi({ store, authenticate }) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    const path = new URL(req.url, 'http://studio.invalid').pathname;
    if (!isStudioRoute(path)) return res.status(404).json({ ok: false });
    if (req.method === 'OPTIONS') return res.status(204).end();
    try {
      if (path === STUDIO_PATH + '/published' && req.method === 'GET') return res.status(200).json({ ok: true, ...await store.published() });
      if (path.startsWith(STUDIO_PATH + '/photo/') && req.method === 'GET') {
        const src = await store.photo(path.split('/').pop()), [header, bytes] = src.split(',');
        res.setHeader('Content-Type', header.slice(5, header.indexOf(';'))); return res.status(200).end(Buffer.from(bytes, 'base64'));
      }
      const member = await authenticate(req);
      if (req.method === 'GET') {
        if (path.endsWith('/session')) return res.status(200).json({ ok: true, role: member.role });
        if (path.endsWith('/manage')) return res.status(200).json({ ok: true, ...await store.read() });
        if (path.includes('/draft/')) return res.status(200).json({ ok: true, draft: await store.draft(path.split('/').pop()) });
      }
      if (path !== STUDIO_PATH + '/manage' || req.method !== 'POST') return res.status(405).json({ ok: false });
      if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw new StudioError('요청 형식을 확인해 주세요.', 'CONTENT_TYPE', 415);
      const raw = req.rawBody ?? req.body;
      if (Buffer.byteLength(Buffer.isBuffer(raw) ? raw : typeof raw === 'string' ? raw : JSON.stringify(raw || {})) > STUDIO_BODY_LIMIT) throw new StudioError('요청 크기를 줄여 주세요.', 'TOO_LARGE', 413);
      let body; try { body = typeof raw === 'string' || Buffer.isBuffer(raw) ? JSON.parse(String(raw)) : raw; } catch { fail('요청 형식을 확인해 주세요.'); }
      return res.status(200).json({ ok: true, ...await store.change(body, member) });
    } catch (e) {
      const known = e instanceof StudioError || ['AUTH_REQUIRED','AUTH_INVALID','MEMBERSHIP_REQUIRED','MEMBERSHIP_UNAVAILABLE'].includes(e.code);
      return res.status(known ? e.status : 503).json({ ok: false, code: known ? e.code : 'STUDIO_UNAVAILABLE', error: known ? e.message : '공동 보관함에 연결하지 못했어요. 현재 작업은 그대로예요.' });
    }
  };
}
