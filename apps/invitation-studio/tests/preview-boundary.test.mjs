import test from 'node:test';
import assert from 'node:assert/strict';
import { studioMessage, STUDIO_SECTIONS } from '../js/studio-preview.mjs';
import { DEFAULT_COMPOSITION, compositionParams } from '../js/composition.mjs';
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
