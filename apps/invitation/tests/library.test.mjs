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
  for (const template of TEMPLATES.filter(t => t.collection === 'immersive')) {
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
