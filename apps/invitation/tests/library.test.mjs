import test from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES } from '../js/catalog.mjs';
import { defaultSelection, normalizeLocal, filterTemplates, applyChange, exportSelection, parseRoute } from '../js/core.mjs';

const empty = { sungwoo: [], sohee: [] };
test('search combines words, collection and shared favorites without inventing results', () => {
  assert.deepEqual(filterTemplates(TEMPLATES, empty, 'all', 'immersive', '음반').map(t => t.id), ['vinyl']);
  assert.deepEqual(filterTemplates(TEMPLATES, empty, 'all', 'immersive', '음반 B-SIDE').map(t => t.id), ['vinyl']);
  assert.deepEqual(filterTemplates(TEMPLATES, empty, 'all', 'classic', '음반'), []);
  assert.deepEqual(filterTemplates(TEMPLATES, { sungwoo: ['vinyl', 'museum'], sohee: ['museum'] }, 'both', 'immersive', '전시').map(t => t.id), ['museum']);
  assert.deepEqual(filterTemplates(TEMPLATES, empty, 'all', 'all', '존재하지않음'), []);
});
test('library preferences preserve old drafts and safely bound only simultaneous comparison', () => {
  const draft = { selection: { ...defaultSelection('envelope'), sections: { ...defaultSelection('envelope').sections, story: false } }, baseRevision: 5 };
  const local = normalizeLocal({ drafts: { envelope: draft }, collection: 'immersive', search: '음반', density: 'comfortable', compare: ['vinyl', 'vinyl', 'unknown', 'museum', 'film', 'festival', 'magazine'] });
  assert.deepEqual(local.drafts.envelope, draft);
  assert.deepEqual(local.compare, ['vinyl', 'museum', 'film', 'festival']);
  assert.equal(local.search, '음반'); assert.equal(local.collection, 'immersive'); assert.equal(local.density, 'comfortable');
  assert.equal(normalizeLocal(null).density, 'compact'); assert.deepEqual(normalizeLocal({ compare: {} }).compare, []);
});
test('every new edition supports direct links and the existing saved selection export', () => {
  const editions = TEMPLATES.filter(t => t.collection === 'immersive');
  assert.equal(editions.length, 11);
  for (const template of editions) {
    const selection = defaultSelection(template.id);
    assert.equal(selection.sections.story, true);
    assert.equal(selection.sections.rsvp, true);
    assert.deepEqual(parseRoute(`#preview/${template.id}`), { view: 'preview', templateId: template.id });
    const patch = applyChange(null, { type: 'selection', actor: 'sungwoo', selection, expectedRevision: 0 });
    assert.equal(patch.selectionRevision, 1);
    assert.deepEqual(exportSelection(patch.selection), selection);
    assert.deepEqual(Object.keys(selection).sort(), ['schemaVersion', 'templateId', 'paletteId', 'galleryLayout', 'sections', 'note'].sort());
  }
});

test('unfolding editions retain drafts and personal favorites while cosmetic state stays out of shared choices', () => {
  const raw = { schemaVersion: 1, favorites: { sungwoo: ['film'], sohee: ['garden'] }, selection: defaultSelection('vinyl'), selectionRevision: 7 };
  for (const templateId of ['paper-theater', 'memory-house', 'ribbon']) {
    const selection = { ...defaultSelection(templateId), unfolded: 'on', choice: 'tomorrow', progress: .75, room: 'garden' };
    const next = applyChange(raw, { type: 'selection', actor: 'sohee', expectedRevision: 7, selection });
    assert.equal(next.selectionRevision, 8);
    assert.equal(next.selection.templateId, templateId);
    assert.deepEqual(Object.keys(next.selection).sort(), ['schemaVersion', 'templateId', 'paletteId', 'galleryLayout', 'sections', 'note'].sort());
    const favorite = applyChange(raw, { type: 'favorite', actor: 'sungwoo', templateId, enabled: true });
    assert.deepEqual(favorite.favorites, { sungwoo: ['film', templateId] });
    const local = normalizeLocal({ drafts: { [templateId]: { selection, baseRevision: 7 } } });
    assert.deepEqual(local.drafts[templateId], { selection: next.selection, baseRevision: 7 });
  }
  assert.deepEqual(raw.favorites, { sungwoo: ['film'], sohee: ['garden'] });
  assert.equal(raw.selection.templateId, 'vinyl');
  assert.equal(raw.selectionRevision, 7);
});
