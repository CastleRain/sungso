import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TEMPLATES, SECTIONS } from '../js/catalog.mjs';
import { defaultSelection, normalizeSelection, normalizeDocument, applyChange, SelectionConflict, exportSelection, selectionText, parseRoute, filterTemplates, normalizeLocal, readLocal, writeLocal, escapeHtml } from '../js/core.mjs';
import { invitation, cover } from '../js/templates.mjs';
import { createStore } from '../js/store.mjs';

test('each template offers valid palettes and defaults without shared mutable state', () => {
  assert.equal(TEMPLATES.length, 12);
  for (const template of TEMPLATES) {
    assert.equal(template.palettes.length, 3);
    const first = defaultSelection(template.id), second = defaultSelection(template.id);
    first.sections.gallery = false;
    assert.equal(second.sections.gallery, true);
    assert.equal(second.galleryLayout, template.galleryLayout);
    for (const palette of template.palettes) assert.equal(normalizeSelection({ ...second, paletteId: palette.id }).paletteId, palette.id);
  }
});
test('untrusted options are reduced to a versioned design-only export', () => {
  const bad = { ...defaultSelection('garden'), paletteId: '<script>', galleryLayout: '__proto__', sections: { gallery: false, rsvp: true, arbitrary: true }, note: '메'.repeat(1008), phone: 'PRIVATE', photos: ['PRIVATE'] };
  const result = exportSelection(bad);
  assert.equal(result.paletteId, 'sage'); assert.equal(result.galleryLayout, 'grid');
  assert.equal(result.note.length, 1000); assert.equal(result.sections.gallery, false); assert.equal(result.sections.rsvp, true);
  assert.equal('arbitrary' in result.sections, false); assert.equal('phone' in result, false); assert.equal('photos' in result, false);
  assert.equal(normalizeSelection({ ...bad, templateId: 'removed' }), null);
  assert.equal(normalizeSelection({ ...bad, schemaVersion: 2 }), null);
  assert.throws(() => exportSelection(null));
});
test('favorites update only the selected person and never touch the joint choice', () => {
  const raw = { schemaVersion: 1, favorites: { sungwoo: ['photo'], sohee: ['garden'] }, selection: defaultSelection('cinema'), selectionRevision: 3 };
  const patch = applyChange(raw, { type: 'favorite', actor: 'sungwoo', templateId: 'garden', enabled: true });
  assert.deepEqual(patch, { schemaVersion: 1, favorites: { sungwoo: ['photo', 'garden'] } });
  assert.equal(raw.favorites.sungwoo.length, 1);
  const remove = applyChange(raw, { type: 'favorite', actor: 'sohee', templateId: 'garden', enabled: false });
  assert.deepEqual(remove.favorites.sohee, []);
  assert.throws(() => applyChange(raw, { type: 'favorite', actor: 'unknown', templateId: 'photo' }));
});
test('joint choice checks its own revision; favorites cannot invalidate a design draft', () => {
  const raw = { selectionRevision: 4, favorites: { sungwoo: ['garden'] } };
  const change = { type: 'selection', actor: 'sohee', selection: defaultSelection('letter'), expectedRevision: 4 };
  assert.equal(applyChange(raw, change).selectionRevision, 5);
  assert.equal('favorites' in applyChange(raw, change), false);
  assert.throws(() => applyChange({ selectionRevision: 5 }, change), SelectionConflict);
  assert.throws(() => applyChange({ schemaVersion: 2 }, change), /새 버전/);
});
test('drafts and export do not mutate the saved selection', () => {
  const saved = defaultSelection('minimal'), draft = structuredClone(saved);
  draft.paletteId = 'gray'; draft.note = '사진을 크게'; draft.sections.rsvp = true;
  const exported = exportSelection(saved);
  assert.equal(exported.paletteId, 'ivory'); assert.equal(exported.note, ''); assert.equal(exported.sections.rsvp, false);
  exported.sections.gallery = false; assert.equal(saved.sections.gallery, true);
  assert.match(selectionText(saved), /단정한 청첩장/); assert.doesNotMatch(selectionText(saved), /사진을 크게/);
});
test('draft persistence tolerates corrupt data, unavailable storage and future schemas', () => {
  let value;
  const storage = { getItem: () => value, setItem: (_, next) => { value = next; } };
  const data = { actor: 'sohee', collection: 'all', filter: 'both', catalogScroll: 360, drafts: { garden: { selection: defaultSelection('garden'), baseRevision: 2 } } };
  assert.equal(writeLocal(storage, data), true); assert.deepEqual(readLocal(storage), data);
  value = '{bad'; assert.equal(readLocal(storage).actor, null);
  assert.equal(writeLocal({ setItem() { throw new Error('quota'); } }, data), false);
  assert.deepEqual(readLocal(null), normalizeLocal(null));
  const invalid = normalizeLocal({ ...data, drafts: { garden: { selection: { ...defaultSelection('garden'), schemaVersion: 2 } } } });
  assert.deepEqual(invalid.drafts, {});
});
test('route parsing is bounded and supports direct template and joint-choice links', () => {
  assert.deepEqual(parseRoute('#preview/cinema'), { view: 'preview', templateId: 'cinema' });
  assert.deepEqual(parseRoute('#selection'), { view: 'selection' });
  for (const hash of ['', '#preview/missing', '#preview/../../', '#catalog', '#preview/photo?inject']) assert.deepEqual(parseRoute(hash), { view: 'catalog' });
});
test('filters expose each persons favorites and their intersection', () => {
  const favorites = { sungwoo: ['minimal', 'garden'], sohee: ['garden', 'sketch'] };
  assert.deepEqual(filterTemplates(TEMPLATES, favorites, 'both').map(item => item.id), ['garden']);
  assert.equal(filterTemplates(TEMPLATES, favorites, 'all').length, 12);
  assert.equal(filterTemplates(TEMPLATES, favorites, 'sungwoo').length, 2);
  assert.equal(filterTemplates(TEMPLATES, favorites, 'sohee').length, 2);
});
test('each full invitation respects section toggles and keeps fixed sections', () => {
  for (const template of TEMPLATES) {
    const settings = defaultSelection(template.id);
    settings.sections = Object.fromEntries(Object.keys(SECTIONS).map(key => [key, false]));
    const bare = invitation(settings);
    for (const key of ['greeting', 'date']) assert.ok(bare.includes(`data-section="${key}"`));
    for (const key of Object.keys(SECTIONS)) assert.ok(!bare.includes(`data-section="${key}"`));
    assert.ok(bare.includes('invitation-ending'));
    settings.sections = Object.fromEntries(Object.keys(SECTIONS).map(key => [key, true]));
    const full = invitation(settings);
    for (const key of Object.keys(SECTIONS)) assert.ok(full.includes(`data-section="${key}"`));
    assert.ok(full.includes('data-action="photo"')); assert.ok(!full.includes('tel:'));
  }
});
test('notes are escaped and never treated as template markup', () => {
  assert.equal(escapeHtml('<img onerror="x"> & \'test\''), '&lt;img onerror=&quot;x&quot;&gt; &amp; &#39;test&#39;');
});
test('store observes without seeding and does not announce failed saves as success', async () => {
  let send, fail, writes = 0, state;
  const store = createStore({ subscribe(next, error) { send = next; fail = error; return () => {}; }, async transact() { writes++; throw new Error('TEST WRITE FAILURE'); } });
  store.subscribe(next => { state = next; });
  send(null, 'live'); assert.equal(writes, 0); assert.equal(state.data.selection, null);
  await assert.rejects(store.save({ type: 'selection', actor: 'sohee', expectedRevision: 0, selection: defaultSelection() }), /TEST WRITE FAILURE/);
  assert.equal(state.saving, false); assert.equal(state.data.selection, null); assert.match(state.error, /FAILURE/);
  fail(new Error('offline'));
  await assert.rejects(store.save({ type: 'favorite', actor: 'sohee', templateId: 'photo', enabled: true }), /연결/);
  assert.equal(writes, 1); store.dispose();
});
test('store rejects a second in-flight mutation and preserves observer isolation', async () => {
  let complete, callback, state;
  const store = createStore({ subscribe(next) { callback = next; return () => {}; }, transact: () => new Promise(resolve => { complete = resolve; }) });
  store.subscribe(next => { state = next; }); callback(null, 'live');
  const first = store.save({ type: 'favorite', actor: 'sohee', templateId: 'photo', enabled: true });
  await assert.rejects(store.save({ type: 'favorite', actor: 'sungwoo', templateId: 'letter', enabled: true }), /앞선 저장/);
  state.data.favorites.sohee.push('minimal');
  complete(); await first; assert.deepEqual(state.data.favorites.sohee, []); store.dispose();
});
test('home places invitation first in the before-wedding group and preserves original links', async () => {
  const html = await readFile(new URL('../../hub/index.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('>결혼 전</h2>') < html.indexOf('>살림·집 준비</h2>'));
  assert.ok(html.indexOf('href="./invitation/"') < html.indexOf('href="./honeymoon/index.html"'));
  for (const link of ['./wecost/index.html', './homehunt/index.html', './honeymoon/index.html', './travel/']) assert.ok(html.includes(`href="${link}"`));
});
test('new invitation entry checks PIN before loading modules and preserves full return URL', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf("localStorage.getItem('sungso_pin_auth')") < html.indexOf('type="module"'));
  assert.ok(html.includes('location.pathname + location.search + location.hash'));
  assert.ok(html.includes('noindex,nofollow'));
});


test('classic and special collections combine with people filters and persist without losing old drafts', () => {
  assert.deepEqual(TEMPLATES.filter(item => item.collection === 'classic').map(item => item.id), ['minimal', 'photo', 'garden', 'letter', 'sketch', 'cinema']);
  assert.equal(TEMPLATES.filter(item => item.collection === 'special').length, 6);
  const favorites = { sungwoo: ['minimal', 'camera', 'curtain'], sohee: ['camera', 'garden'] };
  assert.deepEqual(filterTemplates(TEMPLATES, favorites, 'both', 'special').map(item => item.id), ['camera']);
  assert.equal(filterTemplates(TEMPLATES, favorites, 'all', 'classic').length, 6);
  assert.equal(filterTemplates(TEMPLATES, favorites, 'all', 'special').length, 6);
  const old = { actor: 'sohee', drafts: { minimal: { selection: defaultSelection('minimal'), baseRevision: 4 } } };
  assert.equal(normalizeLocal(old).collection, 'all');
  assert.deepEqual(normalizeLocal({ ...old, collection: 'special' }).drafts, old.drafts);
  assert.equal(normalizeLocal({ collection: 'invalid' }).collection, 'all');
});

test('special designs use the same design-only save and export contract', () => {
  for (const template of TEMPLATES.filter(item => item.collection === 'special')) {
    const selection = { ...defaultSelection(template.id), opened: true, stars: [0, 1, 2], shot: 2 };
    const patch = applyChange(null, { type: 'selection', actor: 'sohee', expectedRevision: 0, selection });
    assert.equal(patch.selection.templateId, template.id);
    assert.deepEqual(Object.keys(exportSelection(patch.selection)), ['schemaVersion', 'templateId', 'paletteId', 'galleryLayout', 'sections', 'note']);
    assert.deepEqual(parseRoute('#preview/' + template.id), { view: 'preview', templateId: template.id });
  }
});


test('special thumbnails are plain links content while full covers expose accessible controls', () => {
  for (const template of TEMPLATES.filter(item => item.collection === 'special')) {
    const thumbnail = cover(template.id, true), full = cover(template.id);
    assert.ok(thumbnail.includes('experience-thumbnail'));
    assert.ok(!/<button|data-experience-action|data-experience="/.test(thumbnail));
    assert.ok(full.includes(`data-experience="${template.id}"`));
    assert.ok(full.includes('data-experience-action='));
    assert.ok(full.includes('aria-pressed="false"'));
    assert.ok(full.includes('data-experience-status'));
    const page = invitation(defaultSelection(template.id));
    assert.ok(page.indexOf('data-section="greeting"') > page.indexOf('data-experience='));
    assert.ok(page.includes('2027년 3월 6일'));
  }
});
