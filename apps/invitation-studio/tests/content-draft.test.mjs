import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CONTENT_FIELDS, CONTENT_MAX_BYTES, normalizeContentDraft, parseContentDraft, exportContentDraft, resolveDraftPhotos, draftDefaults, validateRaster, prepareDraftPhoto, createContentStore } from '../js/content-draft.mjs';
import { mountContentPreview } from '../js/content-preview.mjs';
import { mountContentEditor } from '../js/content-editor.mjs';
import { studioMessage } from '../js/studio-preview.mjs';

const jpeg = 'data:image/jpeg;base64,/9j/AA==';
const local = { id: 'local_test', src: jpeg, width: 1440, height: 960 };
const base = [{ id: 'forest', src: '/forest.webp', thumb: '/forest-thumb.webp', width: 640, height: 960, alt: '두 사람' }, { id: 'walk', src: '/walk.webp', width: 640, height: 960 }];

test('content schema keeps only plain text and bounded raster media; all operating controls are excluded', () => {
  const hostile = { version: 1, mode: 'production', endpoint: '/api', auth: { token: 'secret' }, publish: true, text: { groom: '<img src=x onerror=alert(1)>'.slice(0, 20), closing: '<script>alert(1)</script>', url: 'https://untrusted.test', invitation: '첫 줄\r\n둘째 줄' }, photos: [{ ...local, alt: 'ignored', token: 'secret' }] };
  const result = normalizeContentDraft(hostile);
  assert.deepEqual(Object.keys(result), ['version', 'text', 'photos', 'albumOrder']);
  assert.equal(result.text.closing, '<script>alert(1)</script>');
  assert.equal(result.text.invitation, '첫 줄\n둘째 줄');
  assert.equal(result.text.url, undefined); assert.equal(result.photos[0].alt, undefined);
  assert.deepEqual(normalizeContentDraft({ text: { invitation: '   ', bride: '' } }).text, {});
});

test('untrusted content types, large fields, controls and malformed photo payloads fail without coercion', () => {
  for (const bad of [null, [], 'x', { version: 2 }, { text: [] }, { text: { invitation: {} } }, { text: { groom: '가'.repeat(21) } }, { text: { closing: '\u0000' } }, { photos: 'x' }, { photos: Array(21).fill(local) }, { photos: [local, local] }, { photos: [{ ...local, width: 100000 }] }, { albumOrder: ['constructor'] }, { albumOrder: ['a', 'a'] }]) assert.throws(() => normalizeContentDraft(bad));
  for (const bad of ['https://photo.test/image.jpg', 'javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/jpeg;base64,PHN2Zz4=', 'data:image/jpeg;base64,/9j/AA', 'data:image/jpeg;base64,/9j/AA==\n']) assert.throws(() => validateRaster(bad));
  assert.throws(() => parseContentDraft('x'.repeat(CONTENT_MAX_BYTES + 65537)));
  assert.throws(() => normalizeContentDraft({ photos: Array.from({ length: 12 }, (_, i) => ({ ...local, id: `local_${i}`, src: 'data:image/jpeg;base64,/9j/' + 'A'.repeat(900000) })) }));
});

test('draft export/import keeps original text, added photo and ordering; old combinations are not mistaken for content', () => {
  const draft = normalizeContentDraft({ text: { bride: '소희', story2Body: '카페에서\n함께할 미래를 떠올렸어요.' }, photos: [local], albumOrder: ['local_test', 'walk'] });
  const exported = exportContentDraft(draft);
  assert.deepEqual(parseContentDraft(JSON.stringify(exported)), draft);
  assert.deepEqual(parseContentDraft(JSON.stringify({ ...exported, composition: { palette: 'azure' } })), draft);
  assert.throws(() => parseContentDraft(JSON.stringify({ version: 1, composition: { font: 'letter' } })));
  const resolved = resolveDraftPhotos(draft, base);
  assert.deepEqual(resolved.map(photo => photo.id), ['local_test', 'walk']);
  assert.equal(resolved[0].alt, '두 사람의 사진'); assert.equal(resolved[0].thumb, jpeg);
  assert.deepEqual(resolveDraftPhotos({}, base), base);
  assert.deepEqual(resolveDraftPhotos({ albumOrder: [] }, base), []);
  assert.equal(base.length, 2, 'removing a draft photo never deletes an original');
});

test('all editable fields have explicit limits and family/story defaults use configured known facts', () => {
  assert.equal(new Set(CONTENT_FIELDS.map(field => field.id)).size, CONTENT_FIELDS.length);
  assert.ok(CONTENT_FIELDS.every(field => field.limit > 0 && field.limit <= 1200));
  const result = draftDefaults({ family: { groom: { name: '성우', parents: ['부친', '모친'] }, bride: { name: '소희', parents: ['아버지', '어머니'] } }, chapters: [{ title: '첫 만남', lines: ['소개로', '커피숍에서'] }] });
  assert.equal(result.groomFather, '부친'); assert.equal(result.brideMother, '어머니'); assert.equal(result.story1Body, '소개로\n커피숍에서');
});

test('raw files with disguised types or oversized dimensions never reach persisted raster conversion', async () => {
  await assert.rejects(prepareDraftPhoto({ type: 'image/svg+xml', size: 100 }));
  await assert.rejects(prepareDraftPhoto({ type: 'image/jpeg', size: 41 * 1024 * 1024 }));
  const invalid = new Blob(['<svg>malicious</svg>'], { type: 'image/jpeg' });
  await assert.rejects(prepareDraftPhoto(invalid), /형식/);
  let closed = false;
  const file = new Blob([new Uint8Array([255,216,255,...Array(20).fill(0)])], { type: 'image/jpeg' });
  await assert.rejects(prepareDraftPhoto(file, { win: { createImageBitmap: async () => ({ width: 100000, height: 100000, close() { closed = true; } }) } }), /화소/);
  assert.equal(closed, true);
  await assert.rejects(createContentStore(null).read(), /보관/);
});

class Node extends EventTarget {
  constructor(tag = 'div', cls = '', text = '') { super(); this.tagName = tag; this.className = cls; this._text = tag === '#text' ? text : ''; this.childNodes = []; this.style = {}; this.dataset = {}; this.hidden = false; this.attributes = new Map(); this.classList = { add: name => { this.className += ` ${name}`; } }; if (tag !== '#text' && text) this.append(new Node('#text', '', text)); }
  get children() { return this.childNodes.filter(node => node.tagName !== '#text'); }
  get textContent() { return this._text + this.childNodes.map(node => node.textContent).join(''); }
  set textContent(value) { this.childNodes = []; this._text = this.tagName === '#text' ? String(value) : ''; if (this.tagName !== '#text' && value) this.append(new Node('#text', '', String(value))); }
  append(...nodes) { nodes.forEach(node => { node.parentElement = this; this.childNodes.push(node); }); }
  replaceChildren(...nodes) { this._text = ''; this.childNodes = []; this.append(...nodes); }
  insertBefore(node, before) { node.parentElement = this; const i = this.childNodes.indexOf(before); this.childNodes.splice(i < 0 ? this.childNodes.length : i, 0, node); }
  remove() { if (this.parentElement) { const nodes = this.parentElement.childNodes; nodes.splice(nodes.indexOf(this), 1); } }
  cloneNode(deep) { const copy = new Node(this.tagName, this.className, this._text); copy.hidden = this.hidden; copy.style = { ...this.style }; if (deep) copy.append(...this.childNodes.map(node => node.cloneNode(true))); return copy; }
  matches(selector) { if (selector.includes(' ')) { const [ancestor, child] = selector.split(' '); return this.matches(child) && Boolean(this.parentElement?.closest(ancestor)); } if (selector === 'p:not(.story-note)') return this.tagName === 'p' && !this.className.includes('story-note'); if (selector.startsWith('.')) return this.className.split(' ').includes(selector.slice(1)); if (selector.startsWith('#')) return this.id === selector.slice(1); return this.tagName === selector; }
  querySelectorAll(selector) { if (selector.includes(',') || selector.includes(' > ') || selector.startsWith('[')) return []; return this.children.flatMap(node => [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  getBoundingClientRect() { return { top: 100 }; }
  focus() { this.focused = true; }
  click() { this.dispatchEvent(new Event('click', { cancelable: true })); }
}
function fixture() {
  const doc = new Node('document'); doc.createElement = tag => new Node(tag); doc.createTextNode = text => new Node('#text', '', text); doc.body = new Node('body'); doc.append(doc.body);
  const body = doc.body, invite = new Node('p', 'invitation-copy'), closing = new Node('p', 'closing-copy', '원래 인사'), names = new Node('p', 'hero-names', '성우 & 소희'), hero = new Node('section', 'hero'); hero.setAttribute('aria-label', '원래 표지'); hero.append(names);
  invite.append(new Node('#text', '', '원래 초대'), new Node('br'), new Node('#text', '', '둘째 줄'));
  const audio = new Node('audio'), form = new Node('textarea'); audio.currentTime = 123; audio.paused = true; form.value = '작성 중인 편지'; body.append(invite, closing, hero, audio, form);
  const family = [];
  for (const name of ['성우', '소희']) { const person = new Node('div', 'family-person'), parents = new Node('p', '', '아빠 · 엄마'), role = new Node('span', '', name === '성우' ? '의 아들' : '의 딸'), nameNode = new Node('strong', '', name); parents.append(role); person.append(parents, nameNode); body.append(person); family.push({ parents, name: nameNode }); }
  const storyTitle = new Node('h2', '', '원래 이야기 제목'); storyTitle.id = 'story-title'; body.append(storyTitle);
  const navigation = new Node('nav', 'story-chapters'), chapterButtons = Array.from({ length: 3 }, (_, i) => { const button = new Node('button'); button.setAttribute('aria-label', `원래 ${i + 1}장`); navigation.append(button); return button; }); body.append(navigation);
  const chapters = [];
  for (let i = 0; i < 3; i++) { const page = new Node('article', 'story-page'), copy = new Node('div', 'story-page-copy'); copy.append(new Node('h3', '', `제목 ${i}`), new Node('p', '', `본문 ${i}`), new Node('p', 'story-note', `메모 ${i}`)); page.append(copy); body.append(page); chapters.push(copy); }
  const galleries = [], gallery = { render(photos) { galleries.push(photos); } }, win = { Event };
  return { doc, win, gallery, config: { photos: base, wedding: { groom: '성우', bride: '소희' } }, invite, closing, names, hero, family, storyTitle, chapterButtons, chapters, audio, form, galleries };
}

test('preview inserts literal text, restores original line breaks, preserves audio/forms and only rerenders changed photos', () => {
  const f = fixture(), controller = mountContentPreview(f);
  controller.setDraft({ text: { invitation: '<script>alert(1)</script>\n우리 결혼해요', groom: '새 이름', groomFather: '아버지 성함', brideMother: '어머니 성함', story1Title: '새 제목', story1Quote: '새 한마디', story2Body: '두 번째 이야기\n다음 줄', story3Note: '다음 페이지도 함께', closing: '만나서 반가워요.' } });
  assert.equal(f.invite.textContent, '<script>alert(1)</script>\n우리 결혼해요'); assert.equal(f.invite.querySelector('script'), null);
  assert.equal(f.names.textContent, '새 이름 & 소희'); assert.equal(f.chapters[0].querySelector('h3').textContent, '새 제목');
  assert.equal(f.hero.getAttribute('aria-label'), '새 이름 · 소희의 결혼식 초대'); assert.equal(f.storyTitle.textContent, '새 이름 · 소희의 세 가지 이야기');
  assert.equal(f.family[0].name.textContent, '새 이름'); assert.equal(f.family[0].parents.textContent, '아버지 성함 · 엄마의 아들'); assert.equal(f.family[1].parents.textContent, '아빠 · 어머니 성함의 딸');
  assert.equal(f.chapters[1].querySelector('p:not(.story-note)').textContent, '두 번째 이야기\n다음 줄'); assert.equal(f.chapters[2].querySelector('.story-note').textContent, '다음 페이지도 함께'); assert.equal(f.closing.textContent, '만나서 반가워요.');
  assert.equal(f.chapterButtons[0].getAttribute('aria-label'), '1장 새 제목');
  assert.equal(f.chapters[0].querySelector('blockquote').hidden, false); assert.equal(f.galleries.length, 1);
  controller.setDraft({ text: { invitation: '다른 문구' } }); assert.equal(f.galleries.length, 1);
  assert.equal(f.family[0].parents.textContent, '아빠 · 엄마의 아들'); assert.equal(f.hero.getAttribute('aria-label'), '원래 표지'); assert.equal(f.storyTitle.textContent, '원래 이야기 제목'); assert.equal(f.chapterButtons[0].getAttribute('aria-label'), '원래 1장'); assert.equal(f.closing.textContent, '원래 인사');
  controller.setDraft({ photos: [local], albumOrder: ['local_test'] }); assert.equal(f.galleries.length, 2);
  assert.equal(f.galleries.at(-1)[0].id, 'local_test'); assert.equal(f.invite.querySelector('br')?.tagName, 'br');
  assert.equal(f.audio.currentTime, 123); assert.equal(f.audio.paused, true); assert.equal(f.form.value, '작성 중인 편지');
  controller.destroy(); assert.equal(f.chapters[0].querySelector('blockquote'), null); assert.deepEqual(f.galleries.at(-1), base);
});

test('content messages require the actual same-origin parent and embedded mode; payload remains draft-only', () => {
  const parent = {}, origin = 'https://sungso-wedding.vercel.app', env = { parent, origin, embedded: true };
  const event = { source: parent, origin, data: { type: 'invitation-studio:content', draft: { text: { invitation: '우리의 초대' }, mode: 'production', publish: true } } };
  assert.deepEqual(studioMessage(event, env), { type: 'content', draft: normalizeContentDraft({ text: { invitation: '우리의 초대' } }) });
  assert.equal(studioMessage({ ...event, source: {} }, env), null); assert.equal(studioMessage({ ...event, origin: 'https://other.vercel.app' }, env), null); assert.equal(studioMessage(event, { ...env, embedded: false }), null);
  assert.equal(studioMessage({ ...event, data: { type: 'invitation-studio:content', draft: { photos: [{ ...local, src: 'javascript:alert(1)' }] } } }, env), null);
});

test('edits made during IndexedDB loading merge with untouched saved text and saved media', async () => {
  const doc = new Node('document'); doc.createElement = tag => new Node(tag); doc.body = new Node('body'); doc.append(doc.body); const root = new Node(); doc.body.append(root);
  let resolveRead; const writes = [], store = { read: () => new Promise(resolve => { resolveRead = resolve; }), write: async (draft, revision) => { writes.push({ draft, revision }); return revision + 1; }, close() {} };
  const timers = new Map(); let timer = 0;
  const win = { location: { href: 'https://sungso-wedding.vercel.app/lab/studio/' }, setTimeout: callback => { timers.set(++timer, callback); return timer; }, clearTimeout: id => timers.delete(id) };
  const changes = [], controller = mountContentEditor({ root, doc, win, config: { photos: base }, store, onChange: draft => changes.push(draft) });
  const invitation = root.querySelector('#content-invitation'); invitation.value = '지금 작성한 초대글'; invitation.dispatchEvent(new Event('input'));
  resolveRead({ revision: 8, draft: normalizeContentDraft({ text: { groomFather: '저장된 아버지', invitation: '이전 초대글' }, photos: [local], albumOrder: ['local_test'] }) });
  await controller.ready;
  assert.equal(controller.getDraft().text.invitation, '지금 작성한 초대글'); assert.equal(controller.getDraft().text.groomFather, '저장된 아버지'); assert.equal(controller.getDraft().photos[0].id, 'local_test');
  await controller.flush(); assert.equal(writes[0].revision, 8); assert.equal(writes[0].draft.text.invitation, '지금 작성한 초대글');
  assert.equal(controller.openSection('story2'), true); assert.equal(controller.getActiveSection(), 'story2'); assert.equal(controller.openSection('admin'), false);
  controller.destroy();
});

function editorFixture(store, callbacks = {}) {
  const doc = new Node('document'); doc.createElement = tag => new Node(tag); doc.body = new Node('body'); doc.append(doc.body); const root = new Node(); doc.body.append(root);
  const timers = new Map(); let timer = 0;
  const win = { location: { href: 'https://sungso-wedding.vercel.app/lab/studio/' }, setTimeout: callback => { timers.set(++timer, callback); return timer; }, clearTimeout: id => timers.delete(id) };
  const controller = mountContentEditor({ root, doc, win, config: { photos: base }, store, ...callbacks });
  return { root, controller, edit(value) { const input = root.querySelector('#content-invitation'); input.value = value; input.dispatchEvent(new Event('input')); } };
}

test('typing while a save is pending serializes the newest snapshot; conflict leaves the local draft available', async () => {
  const writes = [], pending = [];
  const store = { read: async () => ({ revision: 3, draft: normalizeContentDraft() }), write: (draft, revision) => { writes.push({ draft, revision }); return new Promise((resolve, reject) => pending.push({ resolve, reject })); }, close() {} };
  const f = editorFixture(store); await f.controller.ready;
  f.edit('첫 변경'); const firstSave = f.controller.flush(); f.edit('가장 마지막 변경'); void f.controller.flush();
  assert.equal(writes.length, 1); pending[0].resolve(4); await firstSave;
  assert.equal(writes.length, 2); assert.equal(writes[1].revision, 4); assert.equal(writes[1].draft.text.invitation, '가장 마지막 변경');
  const conflict = new Error('다른 창에서 바뀌었어요'); conflict.code = 'conflict'; pending[1].reject(conflict); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.controller.getDraft().text.invitation, '가장 마지막 변경'); assert.equal(f.root.querySelector('#content-draft-status').dataset.state, 'error');
  f.edit('실패 뒤 추가한 내용'); await f.controller.flush(); assert.equal(writes.length, 2, 'failed/conflicting storage is not overwritten'); assert.equal(f.controller.getDraft().text.invitation, '실패 뒤 추가한 내용');
  f.controller.destroy();
});

test('only an explicit content-file input restores its validated design; invalid files preserve existing content', async () => {
  const compositions = [], store = { read: async () => ({ revision: 0, draft: normalizeContentDraft() }), write: async (_, revision) => revision + 1, close() {} };
  const f = editorFixture(store, { onComposition: value => compositions.push(value) }); await f.controller.ready;
  assert.equal(compositions.length, 0, 'reading local content does not apply a design or URL flag');
  const fileInput = f.root.querySelectorAll('input').find(input => input.accept === '.json,application/json');
  const payload = JSON.stringify({ ...exportContentDraft({ text: { invitation: '파일로 가져온 문구' } }), composition: { palette: 'azure', mode: 'production', endpoint: 'evil' } });
  fileInput.files = [{ size: payload.length, text: async () => payload }]; fileInput.dispatchEvent(new Event('change')); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.controller.getDraft().text.invitation, '파일로 가져온 문구'); assert.equal(compositions.length, 1); assert.equal(compositions[0].palette, 'azure'); assert.equal(compositions[0].mode, undefined); assert.equal(compositions[0].endpoint, undefined);
  fileInput.files = [{ size: 4, text: async () => 'oops' }]; fileInput.dispatchEvent(new Event('change')); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.controller.getDraft().text.invitation, '파일로 가져온 문구'); assert.equal(compositions.length, 1);
  f.controller.destroy();
});

test('typing during a delayed conflict reload keeps the current draft and never saves the stale merge', async () => {
  let reads = 0, resolveReload, rejectWrites = true;
  const writes = [], store = {
    read: () => ++reads === 1 ? Promise.resolve({ revision: 3, draft: normalizeContentDraft() }) : new Promise(resolve => { resolveReload = resolve; }),
    write: async (draft, revision) => {
      writes.push({ draft, revision });
      if (rejectWrites) { const error = new Error('다른 창에서 바뀌었어요'); error.code = 'conflict'; throw error; }
      return revision + 1;
    }, close() {},
  };
  const f = editorFixture(store); await f.controller.ready;
  f.edit('충돌한 현재 초안'); await f.controller.flush();
  const retry = f.root.querySelector('.content-reload'); assert.equal(retry.hidden, false);
  retry.click(); retry.click();
  f.edit('최신 내용을 기다리면서 새로 적은 문구');
  resolveReload({ revision: 8, draft: normalizeContentDraft({ text: { invitation: '다른 창에 저장된 문구' }, photos: [local] }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.controller.getDraft().text.invitation, '최신 내용을 기다리면서 새로 적은 문구');
  assert.equal(f.root.querySelector('#content-invitation').value, '최신 내용을 기다리면서 새로 적은 문구');
  assert.equal(f.controller.getDraft().photos.length, 0, 'no portion of the abandoned reload replaces the current draft');
  assert.equal(retry.hidden, false); assert.match(f.root.querySelector('#content-draft-status').textContent, /불러오기를 멈췄어요/);
  assert.equal(await f.controller.flush(), false); assert.equal(writes.length, 1, 'the stale result cannot re-enable writes');
  retry.click(); retry.click();
  resolveReload({ revision: 8, draft: normalizeContentDraft({ text: { invitation: '다른 창에 저장된 문구' }, photos: [local] }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.controller.getDraft().text.invitation, '다른 창에 저장된 문구'); assert.equal(retry.hidden, true);
  rejectWrites = false; f.edit('새로 불러온 뒤 수정'); await f.controller.flush();
  assert.equal(writes.at(-1).revision, 8); assert.equal(writes.at(-1).draft.text.invitation, '새로 불러온 뒤 수정');
  f.controller.destroy();
});

test('editor has no production write, dynamic HTML, or remote photo request adapter', async () => {
  for (const filename of ['content-draft.mjs', 'content-editor.mjs', 'content-preview.mjs']) {
    const source = await readFile(new URL(`../js/${filename}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\bfetch\s*\(|innerHTML\s*=|insertAdjacentHTML\s*\(|\/api\/|getIdToken\s*\(/);
  }
});
