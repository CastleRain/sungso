import test from 'node:test';
import assert from 'node:assert/strict';
import { studioMessage, STUDIO_SECTIONS } from '../js/studio-preview.mjs';
import { DEFAULT_COMPOSITION, compositionParams, SECTION_IDS } from '../js/composition.mjs';
import { validateCardUrls } from '../js/invitation-card.mjs';
import { createDemoAdapter } from '../js/demo-data.mjs';

const parent = {}, sibling = {}, origin = 'https://sungso-wedding.vercel.app';
const context = { origin, parent, embedded: true };
const event = data => ({ data, origin, source: parent });
test('only the actual same-origin studio parent can apply a composition', () => {
  const message = event({ type: 'invitation-studio:apply', composition: { ...DEFAULT_COMPOSITION, date: 'orbit', mode: 'production', endpoint: 'https://evil.test' } });
  const accepted = studioMessage(message, context);
  assert.equal(accepted.composition.date, 'orbit');
  assert.equal(Object.hasOwn(accepted.composition, 'mode'), false);
  assert.equal(Object.hasOwn(accepted.composition, 'endpoint'), false);
  assert.equal(studioMessage({ ...message, source: sibling }, context), null);
  assert.equal(studioMessage({ ...message, origin: 'https://evil.test' }, context), null);
  assert.equal(studioMessage(message, { ...context, embedded: false }), null);
});
test('only invitation sections can be targeted and messages cannot perform arbitrary actions', () => {
  for (const section of STUDIO_SECTIONS) assert.deepEqual(studioMessage(event({ type: 'invitation-studio:jump', section }), context), { type: 'jump', section });
  for (const section of ['homehunt', 'body', '__proto__', '<script>', '#gallery']) assert.equal(studioMessage(event({ type: 'invitation-studio:jump', section }), context), null);
  for (const data of [null, 'apply', { type: 'delete-account' }]) assert.equal(studioMessage(event(data), context), null);
});

test('opening replay is allowed only at the top and only with an explicit boolean', () => {
  assert.deepEqual(studioMessage(event({ type: 'invitation-studio:jump', section: 'top', replayOpening: true }), context), { type: 'jump', section: 'top', replayOpening: true });
  for (const section of STUDIO_SECTIONS.filter(value => value !== 'top')) {
    assert.deepEqual(studioMessage(event({ type: 'invitation-studio:jump', section, replayOpening: true }), context), { type: 'jump', section });
  }
  assert.deepEqual(studioMessage(event({ type: 'invitation-studio:jump', section: 'top', replayOpening: 'true' }), context), { type: 'jump', section: 'top' });
});

test('review feedback accepts only a known composition key at its associated section', () => {
  for (const [key, section] of Object.entries(SECTION_IDS)) {
    assert.deepEqual(studioMessage(event({ type: 'invitation-studio:jump', section, reviewKey: key }), context), { type: 'jump', section, reviewKey: key });
  }
  for (const reviewKey of ['__proto__', 'constructor', 'endpoint', '<script>', {}, ['font'], null]) {
    assert.deepEqual(studioMessage(event({ type: 'invitation-studio:jump', section: 'invitation', reviewKey }), context), { type: 'jump', section: 'invitation' });
  }
  assert.deepEqual(studioMessage(event({ type: 'invitation-studio:jump', section: 'gallery', reviewKey: 'font' }), context), { type: 'jump', section: 'gallery' });
});
test('exported invitation card accepts only its own allowlisted composition URL', () => {
  const options = { photoUrl: `${origin}/v6/assets/photos/date-1440.webp`, baseURI: `${origin}/lab/studio/preview/`, variant: 'f', canonicalUrl: `${origin}/lab/studio/preview/?${compositionParams(DEFAULT_COMPOSITION)}` };
  assert.equal(validateCardUrls(options).canonicalUrl, options.canonicalUrl);
  for (const canonicalUrl of [`${origin}/homehunt/`, `${options.canonicalUrl}&mode=production`, 'https://evil.test/lab/studio/preview/', `${origin}/lab/studio/preview/#other`]) assert.throws(() => validateCardUrls({ ...options, canonicalUrl }));
  assert.throws(() => validateCardUrls({ ...options, photoUrl: 'https://evil.test/photo.jpg' }));
});
test('studio messages remain local and cannot reuse another experiment guestbook', async () => {
  const entries = new Map(), storage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
  const adapter = createDemoAdapter({ variant: 'f', photos: [], storage });
  entries.set('sungso_invitation_experience_6_1_f_guestbook', 'old');
  const message = await adapter.write({ name: '미리보기', message: '축하합니다', consent: true });
  const reloaded = createDemoAdapter({ variant: 'f', photos: [], storage });
  assert.equal((await reloaded.messages())[0].id, message.id);
  assert.equal(entries.get('sungso_invitation_experience_6_1_f_guestbook'), 'old');
  assert.equal(entries.size, 2);
  await reloaded.remove(message.id);
  assert.deepEqual(await reloaded.messages(), []);
});
