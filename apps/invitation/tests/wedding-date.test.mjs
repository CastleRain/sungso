import test from 'node:test';
import assert from 'node:assert/strict';
import { WEDDING, weddingCalendarCells } from '../js/wedding-date.mjs';
import { TEMPLATES, SECTIONS } from '../js/catalog.mjs';
import { defaultSelection, normalizeLocal, normalizeDocument, applyChange, exportSelection, selectionText, readLocal, writeLocal } from '../js/core.mjs';
import { cover, invitation } from '../js/templates.mjs';

// Inspect the rendered content and calendar cells, not source-file spelling.
// This also covers decorative dates in captions and accessibility labels.
function parse(html) {
  const root = { tag: 'root', attrs: {}, children: [], text: '', parent: null };
  const stack = [root], voids = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'wbr']);
  for (const match of html.matchAll(/<\/?([\w-]+)([^>]*)>|([^<]+)/g)) {
    if (match[3]) { stack.at(-1).text += match[3]; continue; }
    const [raw, tag, rest] = match;
    if (raw.startsWith('</')) {
      assert.equal(stack.at(-1).tag, tag, `balanced ${tag} markup`);
      stack.pop();
      continue;
    }
    const attrs = Object.fromEntries([...rest.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(([, name, value]) => [name, value ?? '']));
    const node = { tag, attrs, children: [], text: '', parent: stack.at(-1) };
    stack.at(-1).children.push(node);
    if (!voids.has(tag) && !raw.endsWith('/>')) stack.push(node);
  }
  assert.equal(stack.length, 1, 'all rendered elements close');
  return root;
}
const descendants = root => root.children.flatMap(node => [node, ...descendants(node)]);
const content = node => node.text + node.children.map(content).join('');
const hasClass = (node, value) => (node.attrs.class || '').split(/\s+/).includes(value);
const oldDate = /2030|0518|05\s*[.·/—-]\s*18|\bMay\b|오월|열여덟/i;
const accessibleContent = root => [content(root), ...descendants(root).map(node => node.attrs['aria-label'] || '')].join(' ');
const sections = enabled => Object.fromEntries(Object.keys(SECTIONS).map(key => [key, enabled]));
const setting = (id, patch = {}) => ({ ...defaultSelection(id), ...patch });

function assertCeremony(root, context) {
  const dates = descendants(root).filter(node => node.attrs['data-section'] === 'date');
  assert.equal(dates.length, 1, `${context}: exactly one ceremony section`);
  assert.ok(content(dates[0]).includes(WEDDING.koDate), `${context}: ceremony date`);
  assert.ok(content(dates[0]).includes(WEDDING.koTime), `${context}: ceremony time`);
  assert.ok(content(dates[0]).includes(WEDDING.weekday), `${context}: ceremony weekday`);
  for (let node = dates[0]; node; node = node.parent) {
    assert.equal(Object.hasOwn(node.attrs, 'hidden'), false, `${context}: ceremony is not gated`);
    assert.notEqual(node.attrs['aria-hidden'], 'true', `${context}: ceremony remains readable`);
  }
}

test('the shared invitation date is the requested Saturday 6 March 2027 at 14:00', () => {
  assert.deepEqual([WEDDING.year, WEDDING.month, WEDDING.day, WEDDING.hour, WEDDING.minute], [2027, 3, 6, 14, 0]);
  assert.equal(WEDDING.iso, '2027-03-06');
  assert.equal(WEDDING.koFull, '2027년 3월 6일 토요일 오후 2시');
  assert.equal(WEDDING.enLong, 'Saturday, March 6, 2027');
  assert.equal(WEDDING.time24, '14:00');
  assert.equal(WEDDING.time12, '2:00 PM');
  assert.equal(WEDDING.code, '0306');
  assert.equal(WEDDING.monthYear, 'MAR 2027');
  assert.ok(Object.isFrozen(WEDDING));
});

test('March calendar starts on Monday and places the sixth in the Saturday column', () => {
  const cells = weddingCalendarCells();
  assert.equal(cells.length, 32);
  assert.deepEqual(cells.slice(0, 8), [null, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(cells.filter(day => day !== null), Array.from({ length: 31 }, (_, i) => i + 1));
  assert.equal(cells.indexOf(6) % 7, 6);
  assert.equal(cells.at(-1), 31);
  cells[1] = 99;
  assert.equal(weddingCalendarCells()[1], 1, 'a rendered calendar cannot alter another calendar');
});

test('every registered full preview and cover drops the former wedding date and month decorations', () => {
  for (const template of TEMPLATES) {
    const full = parse(invitation(setting(template.id, { sections: sections(true) })));
    assertCeremony(full, template.id);
    assert.doesNotMatch(accessibleContent(full), oldDate, `${template.id}: full invitation`);
    for (const thumbnail of [false, true]) {
      const root = parse(cover(template.id, thumbnail));
      assert.doesNotMatch(accessibleContent(root), oldDate, `${template.id}: ${thumbnail ? 'catalog' : 'full'} cover`);
    }
  }
});

test('palette, gallery and section choices cannot restore a previous date or hide the ceremony', () => {
  for (const template of TEMPLATES) {
    for (const [index, palette] of template.palettes.entries()) {
      const choice = setting(template.id, { paletteId: palette.id, galleryLayout: ['grid', 'slide', 'filmstrip'][index % 3], sections: sections(index !== 1) });
      const root = parse(invitation(choice));
      assertCeremony(root, `${template.id}/${palette.id}`);
      assert.doesNotMatch(accessibleContent(root), oldDate);
    }
  }
});

test('both calendar renderers expose 31 days and highlight only Saturday the sixth', () => {
  const renderers = new Set();
  let renderedCalendars = 0;
  for (const template of TEMPLATES) {
    const root = parse(invitation(defaultSelection(template.id)));
    const calendars = descendants(root).filter(node => hasClass(node, 'wedding-calendar') || hasClass(node, 'rg-calendar'));
    for (const calendar of calendars) {
      renderedCalendars++;
      const guest = hasClass(calendar, 'rg-calendar');
      renderers.add(guest ? 'guest' : 'shared');
      const week = descendants(calendar).find(node => hasClass(node, guest ? 'rg-calendar-week' : 'calendar-week'));
      const days = descendants(calendar).find(node => hasClass(node, guest ? 'rg-calendar-days' : 'calendar-days'));
      assert.deepEqual(week.children.map(content), ['일', '월', '화', '수', '목', '금', '토']);
      const values = days.children.map(node => content(node).trim()).map(value => value ? Number(value) : null);
      assert.deepEqual(values, [null, ...Array.from({ length: 31 }, (_, i) => i + 1)], `${template.id}: month cells`);
      const highlighted = days.children.filter(node => hasClass(node, guest ? 'rg-wedding-day' : 'wedding-day'));
      assert.equal(highlighted.length, 1, `${template.id}: one wedding day`);
      assert.equal(content(highlighted[0]), '6');
      assert.equal(days.children.indexOf(highlighted[0]) % 7, 6);
      assert.match(highlighted[0].attrs['aria-label'], /6일/);
      assert.match(calendar.attrs['aria-label'], /2027년 3월/);
      assert.doesNotMatch(calendar.attrs['aria-label'] + highlighted[0].attrs['aria-label'], /예시/);
    }
  }
  assert.deepEqual([...renderers].sort(), ['guest', 'shared']);
  assert.ok(renderedCalendars > 2, 'all designs using either calendar are checked');
});

test('changing the displayed ceremony leaves existing draft notes and saved design exports untouched', () => {
  const note = '이전 비교 메모: 2030. 05. 18, ISSUE 0518, 오월의 기억은 그대로 두기';
  const choice = setting('magazine', { note, sections: sections(false) });
  const saved = { schemaVersion: 1, favorites: { sungwoo: ['magazine'], sohee: ['garden'] }, selection: choice, selectionRevision: 8 };
  const draft = { selection: choice, baseRevision: 8 };
  const raw = { collection: 'immersive', drafts: { magazine: draft } };
  const local = normalizeLocal(raw);
  assert.deepEqual(local.drafts.magazine, draft);
  const memory = new Map();
  const storage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  assert.equal(writeLocal(storage, local), true);
  assert.deepEqual(readLocal(storage).drafts.magazine, draft);
  assert.deepEqual(normalizeDocument(saved).selection, choice);
  assert.deepEqual(exportSelection(choice), choice);
  assert.ok(selectionText(choice).includes(note));
  const changed = applyChange(saved, { type: 'selection', actor: 'sungwoo', selection: choice, expectedRevision: 8 });
  assert.deepEqual(changed.selection, choice);
  assert.equal(changed.selectionRevision, 9);
  assert.deepEqual(Object.keys(changed.selection).sort(), ['schemaVersion', 'templateId', 'paletteId', 'galleryLayout', 'sections', 'note'].sort());
  assert.equal(saved.selectionRevision, 8);
});
