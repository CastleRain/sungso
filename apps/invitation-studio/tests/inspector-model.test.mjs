import test from 'node:test';
import assert from 'node:assert/strict';
import { OPTIONAL_SECTIONS, DEFAULT_COMPOSITION, normalizeComposition } from '../js/composition.mjs';
import { sceneEditorTarget, choiceSection, inspectorJumpGroups } from '../catalog/inspector-model.mjs';

test('visible scenes open their own editor and only supported wording fields', () => {
  assert.deepEqual(sceneEditorTarget('wedding-day'), { section: 'wedding-day', key: 'date', label: '예식 날짜' });
  assert.equal(sceneEditorTarget('top').contentKey, 'family');
  assert.equal(sceneEditorTarget('invitation').contentKey, 'invitation');
  assert.equal(sceneEditorTarget('our-story').contentKey, 'story1');
  assert.equal(sceneEditorTarget('gallery').contentKey, 'photos');
  assert.equal(sceneEditorTarget('closing').contentKey, 'closing');
  for (const section of ['location', 'accounts', 'guestbook', 'navigation']) assert.equal(Object.hasOwn(sceneEditorTarget(section), 'contentKey'), false);
});

test('unknown, inherited-object names, URLs and non-string scene targets never resolve', () => {
  for (const input of ['__proto__', 'constructor', 'toString', 'manage', 'https://example.com', '#wedding-day', null, undefined, {}, ['gallery']]) assert.equal(sceneEditorTarget(input, { extras: [input] }), null);
  const target = sceneEditorTarget('wedding-day'); target.key = 'gifting';
  assert.equal(sceneEditorTarget('wedding-day').key, 'date');
});

test('optional destinations match the shared catalog and require active extras', () => {
  for (const section of OPTIONAL_SECTIONS) {
    assert.equal(sceneEditorTarget(section.id), null);
    assert.equal(sceneEditorTarget(section.id, { extras: section.id }), null);
    assert.deepEqual(sceneEditorTarget(section.id, { extras: [section.id] }), { section: section.id, key: section.key, label: section.label });
    assert.equal(choiceSection(section.key), section.id);
  }
});

test('jump groups follow reordered active scenes, include applicable details and preserve input', () => {
  const composition = normalizeComposition({ ...DEFAULT_COMPOSITION, album: 'masonry', extras: ['guest-guide', 'promises'], order: ['gallery', 'promises', 'wedding-day', 'guest-guide', 'invitation', 'location', 'our-story', 'accounts', 'guestbook'] });
  const before = JSON.stringify(composition), groups = inspectorJumpGroups(composition);
  assert.deepEqual(groups.map(group => group.label), ['전체 분위기', '장면·순서', '문구·사진']);
  assert.deepEqual(groups[1].items.map(item => item.key), ['cover', 'coverFocus', 'opening', 'album', 'albumColumns', 'albumRatio', 'promiseStyle', 'date', 'calendarMark', 'guestGuide', 'intro', 'arrival', 'story', 'gifting', 'wishes', 'ending', 'navigation']);
  assert.equal(JSON.stringify(composition), before);
  assert.equal(groups[2].items.find(item => item.key === 'photos').section, 'gallery');
});

test('jump groups skip unavailable album controls and reject duplicate, unknown or disabled scenes', () => {
  const groups = inspectorJumpGroups({ album: 'stack', extras: ['keepsake'], order: ['gallery', 'gallery', '__proto__', 'guest-guide'] });
  const keys = groups[1].items.map(item => item.key);
  assert.equal(keys.filter(key => key === 'album').length, 1);
  for (const key of ['albumColumns', 'albumRatio', 'guestGuide', '__proto__']) assert.equal(keys.includes(key), false);
  assert.equal(keys.includes('keepsake'), true);
  assert.equal(keys.includes('date'), true);
  assert.equal(keys.at(-1), 'navigation');
});

test('choice identity maps global, detail and dock targets without accepting arbitrary keys', () => {
  for (const [key, section] of [['font', 'invitation'], ['textSize', 'invitation'], ['photoTone', 'gallery'], ['coverFocus', 'top'], ['calendarMark', 'wedding-day'], ['navigation', 'navigation']]) assert.equal(choiceSection(key), section);
  for (const key of ['__proto__', 'constructor', 'https://example.com', null, {}]) assert.equal(choiceSection(key), null);
});
