import test from 'node:test';
import assert from 'node:assert/strict';
import { SIGNATURES, TEMPLATES, SECTIONS } from '../js/catalog.mjs';
import { defaultSelection, normalizeLocal, normalizeSelection, exportSelection, applyChange } from '../js/core.mjs';
import { invitation, cover } from '../js/templates.mjs';

test('signature editions enrich the existing three IDs while retaining all twelve saved designs', () => {
  assert.deepEqual(Object.keys(SIGNATURES), ['envelope', 'constellation', 'ticket']);
  assert.equal(TEMPLATES.length, 20);
  for (const id of Object.keys(SIGNATURES)) {
    const selection = defaultSelection(id);
    assert.equal(selection.sections.story, true);
    assert.equal(selection.sections.gallery, true);
    const full = invitation(selection);
    assert.ok(full.includes(`signature-${id}`));
    assert.ok(full.includes(`data-experience="${id}"`));
    assert.ok(full.includes('invitation-ending'));
    assert.ok(!cover(id, true).includes('data-experience-action'));
  }
  assert.equal(defaultSelection('ticket').sections.rsvp, true);
  assert.equal(defaultSelection('minimal').sections.story, false);
});

test('existing explicit section choices, notes and revisions survive new showcase defaults', () => {
  for (const id of Object.keys(SIGNATURES)) {
    const previous = { ...defaultSelection(id), note: '기존 초안은 그대로', paletteId: TEMPLATES.find(item => item.id === id).palettes[1].id, sections: Object.fromEntries(Object.keys(SECTIONS).map(key => [key, false])) };
    assert.deepEqual(normalizeSelection(previous), previous);
    const local = normalizeLocal({ drafts: { [id]: { selection: previous, baseRevision: 7 } } });
    assert.deepEqual(local.drafts[id], { selection: previous, baseRevision: 7 });
    const rendered = invitation(previous);
    for (const key of Object.keys(SECTIONS)) assert.ok(!rendered.includes(`data-section="${key}"`), `${id}/${key} stays disabled`);
  }
});

test('showcase interaction fields cannot enter the saved or exported design contract', () => {
  for (const id of Object.keys(SIGNATURES)) {
    const input = { ...defaultSelection(id), route: 'shuttle', guestCount: 3, attending: true, confirmed: true, scene: 2, folds: [1, 2] };
    const saved = applyChange({ selectionRevision: 3 }, { type: 'selection', actor: 'sungwoo', expectedRevision: 3, selection: input });
    assert.deepEqual(exportSelection(saved.selection), defaultSelection(id));
    assert.equal(saved.selectionRevision, 4);
  }
});
