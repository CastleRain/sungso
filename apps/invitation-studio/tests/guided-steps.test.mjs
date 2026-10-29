import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_COMPOSITION, normalizeComposition } from '../js/composition.mjs';
import { resolveGuidedSteps, guidedPosition, mountGuidedSteps } from '../catalog/guided-steps.mjs';

test('guide follows the selected scene order and includes only applicable details', () => {
  const composition = normalizeComposition({ ...DEFAULT_COMPOSITION, album: 'grid', extras: ['guest-guide', 'promises'], order: ['gallery', 'guest-guide', 'invitation', 'promises', 'wedding-day', 'location', 'our-story', 'accounts', 'guestbook'] });
  const before = JSON.stringify(composition), steps = resolveGuidedSteps(composition);
  assert.deepEqual(steps.slice(0, 8).map(step => step.key), ['palette', 'font', 'textSize', 'lineSpace', 'photoTone', 'motion', 'spacing', 'divider']);
  assert.deepEqual(steps.slice(8).map(step => step.key), ['cover', 'coverFocus', 'opening', 'album', 'albumColumns', 'albumRatio', 'guestGuide', 'intro', 'promiseStyle', 'date', 'calendarMark', 'arrival', 'story', 'gifting', 'wishes', 'ending', 'navigation']);
  assert.equal(JSON.stringify(composition), before);
  assert.equal(steps.slice(0, 8).every(step => step.tab === 'style'), true);
  assert.equal(steps.slice(8).every(step => step.tab === 'scenes'), true);
});

test('changing album presentation skips irrelevant detail steps and disabled optional scenes', () => {
  const composition = { ...DEFAULT_COMPOSITION, order: ['gallery', 'gallery', 'guest-guide', '__proto__', 'invitation'], extras: [] };
  for (const album of ['stack', 'contact']) {
    const keys = resolveGuidedSteps({ ...composition, album }).map(step => step.key);
    assert.equal(keys.includes('albumColumns'), false);
    assert.equal(keys.includes('albumRatio'), false);
    assert.equal(keys.includes('guestGuide'), false);
    assert.equal(keys.filter(key => key === 'album').length, 1);
    assert.equal(keys.some(key => typeof key !== 'string'), false);
  }
  assert.equal(resolveGuidedSteps({ ...composition, album: 'masonry' }).some(step => step.key === 'albumRatio'), true);
});

test('editor-owned adapters can extend the guide without exposing arbitrary URL destinations', () => {
  const steps = resolveGuidedSteps({ order: ['new-scene'], extras: [] }, {
    globalKeys: ['font'], sectionKeys: { 'new-scene': 'newScene' }, detailChildren: {},
    allowedKeys: ['font', 'newScene', 'editText', 'editPhotos'],
    extraSteps: [{ key: 'editText', tab: 'content' }, { key: 'editPhotos', tab: 'content' }, { key: 'bad', tab: 'content' }, { key: 'font', tab: 'content' }],
  });
  assert.deepEqual(steps, [{ key: 'font', tab: 'style' }, { key: 'newScene', tab: 'scenes' }, { key: 'editText', tab: 'content' }, { key: 'editPhotos', tab: 'content' }]);
});

test('position starts at the active tab and never treats a hidden accordion as current', () => {
  const steps = resolveGuidedSteps(DEFAULT_COMPOSITION);
  const switched = guidedPosition(steps, { tab: 'scenes', key: 'font' });
  assert.equal(switched.current, null); assert.equal(switched.next.key, 'cover'); assert.equal(switched.previous.key, 'divider');
  const last = guidedPosition(steps, { tab: 'scenes', key: 'navigation' });
  assert.equal(last.finish, true); assert.equal(last.next, null); assert.equal(last.previous.key, 'ending');
  const library = guidedPosition(steps, { tab: 'library', key: 'navigation' });
  assert.equal(library.next, null); assert.equal(library.finish, false);
});

class Element {
  constructor(tag, doc) { this.tagName = tag; this.ownerDocument = doc; this.children = []; this.attributes = new Map(); this.listeners = new Map(); this.disabled = false; this.hidden = false; }
  append(...elements) { this.children.push(...elements); for (const child of elements) child.parent = this; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  removeEventListener(type, callback) { if (this.listeners.get(type) === callback) this.listeners.delete(type); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  click() { if (!this.disabled) this.listeners.get('click')?.(); }
}
function fixture(initial = {}) {
  const doc = { createElement: tag => new Element(tag, doc) }, container = new Element('div', doc);
  const draft = { name: '소희의 조합', note: '이 메모는 그대로', rating: 5, text: '우리의 초대글' };
  const originalDraft = JSON.stringify(draft), calls = [];
  let state = { composition: normalizeComposition(DEFAULT_COMPOSITION), tab: 'style', key: 'palette', ...initial };
  const guide = mountGuidedSteps({ container, readState: () => state, labels: { font: '글씨체', palette: '색감', navigation: '빠른 메뉴' },
    onOpen(step) { calls.push(step); state = { ...state, ...step }; },
    onFinish() { calls.push('finish'); state = { ...state, tab: 'library' }; },
  });
  const group = container.children[0], [previous, next] = group.children[1].children;
  return { guide, group, previous, next, calls, draft, originalDraft, container, state: () => state, setState(value) { state = { ...state, ...value }; } };
}

test('only explicit Next advances, and refresh preserves drafts and persistent native controls', () => {
  const f = fixture();
  assert.equal(f.previous.disabled, true); assert.equal(f.next.tagName, 'button'); assert.equal(f.next.type, 'button');
  f.setState({ composition: normalizeComposition({ ...f.state().composition, palette: 'rose' }) }); f.guide.refresh();
  assert.deepEqual(f.calls, [], 'choosing an option never skips to the next item');
  assert.equal(f.group.children[1].children[1], f.next, 'refresh keeps focused navigation controls connected');
  f.next.click();
  assert.deepEqual(f.calls, [{ key: 'font', tab: 'style' }]);
  assert.equal(f.previous.attributes.get('aria-label'), '이전 항목: 색감');
  f.previous.click(); assert.equal(f.state().key, 'palette');
  assert.equal(JSON.stringify(f.draft), f.originalDraft);
});

test('Next uses the latest presentation and order rather than a stale index', () => {
  const f = fixture({ tab: 'scenes', key: 'album' });
  f.setState({ composition: normalizeComposition({ ...DEFAULT_COMPOSITION, album: 'grid' }) }); f.guide.refresh();
  f.next.click(); assert.equal(f.state().key, 'albumColumns');
  f.setState({ key: 'album', composition: normalizeComposition({ ...DEFAULT_COMPOSITION, album: 'stack' }) }); f.guide.refresh();
  f.next.click(); assert.equal(f.state().key, 'gifting');
  f.setState({ key: 'album', composition: normalizeComposition({ ...DEFAULT_COMPOSITION, order: ['gallery', 'invitation', 'wedding-day', 'location', 'our-story', 'accounts', 'guestbook'] }) }); f.guide.refresh();
  f.next.click(); assert.equal(f.state().key, 'intro');
});

test('last step opens the existing save form once without itself saving, then hides on library', () => {
  const f = fixture({ tab: 'scenes', key: 'navigation' });
  assert.equal(f.next.textContent, '조합 보관하기 ＋');
  assert.match(f.next.attributes.get('aria-label'), /이름과 메모/);
  f.next.click(); assert.deepEqual(f.calls, ['finish']); assert.equal(f.group.hidden, true);
  f.next.click(); assert.deepEqual(f.calls, ['finish']);
  assert.equal(JSON.stringify(f.draft), f.originalDraft);
});

test('disposal removes controls and listeners without affecting host forms', () => {
  const f = fixture(); f.guide.destroy(); f.guide.destroy(); f.next.click(); f.guide.refresh();
  assert.equal(f.container.children.length, 0); assert.deepEqual(f.calls, []);
  assert.equal(JSON.stringify(f.draft), f.originalDraft);
});
