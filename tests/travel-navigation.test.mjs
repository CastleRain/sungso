import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = (await readFile(new URL('../apps/travel/navigation.mjs', import.meta.url), 'utf8')).replace(/\bexport /g, '');
function navigation(hash = '#flights') {
  const windowEvents = new Map(), frames = new Map(), scrolled = [], navScroll = [], historyWrites = [];
  const root = { hidden: true }; let frame = 0, widthReads = 0;
  const view = name => ({ dataset: { travelView: name }, hidden: false, setAttribute() {} });
  const views = [view('itinerary'), view('transport')];
  const targets = { itinerary: { closest: () => views[0], scrollIntoView: () => scrolled.push('itinerary') },
    flights: { closest: () => views[1], scrollIntoView: () => scrolled.push('flights') } };
  const links = views.map((entry, index) => ({ dataset: { travelViewLink: entry.dataset.travelView }, classList: { toggle() {} },
    setAttribute() {}, removeAttribute() {}, get offsetLeft() { widthReads++; return index * 400; }, offsetWidth: 100 }));
  const nav = { scrollLeft: 0, clientWidth: 100, scrollTo(options) { navScroll.push(options); } };
  const globals = {
    document: { title: '', body: { dataset: {} }, querySelectorAll: selector => selector === '[data-travel-view]' ? views : links,
      querySelector: selector => selector === '[data-private-root][hidden]' ? (root.hidden ? root : null) : nav,
      getElementById: id => targets[id], addEventListener() {}, dispatchEvent() {} },
    window: { addEventListener: (name, callback) => windowEvents.set(name, callback) },
    location: { hash, href: `https://example.test/sungso/travel/${hash}`, origin: 'https://example.test', pathname: '/sungso/travel/', search: '' },
    history: { pushState: (...args) => historyWrites.push(args), replaceState: (...args) => historyWrites.push(args) },
    requestAnimationFrame: callback => { const id = ++frame; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id), matchMedia: () => ({ matches: true }), URL, CustomEvent: class {},
  };
  vm.runInNewContext(source, globals);
  return { views, scrolled, navScroll, historyWrites, widthReads: () => widthReads,
    ready() { root.hidden = false; windowEvents.get('sungso:ready')(); },
    clear() { root.hidden = true; windowEvents.get('sungso:private-clear')(); },
    flush() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); } };
}

test('initial Travel deep link selects the screen immediately but waits for auth reveal before layout and scroll', () => {
  const page = navigation();
  assert.equal(page.views[0].hidden, true); assert.equal(page.views[1].hidden, false);
  page.flush(); assert.deepEqual(page.scrolled, []); assert.equal(page.widthReads(), 0);
  page.ready(); page.flush();
  assert.deepEqual(page.scrolled, ['flights']); assert.equal(page.navScroll.length, 1);
  assert.equal(page.historyWrites.length, 0, 'auth reveal preserves the supplied direct link');
});

test('plain Travel entry keeps its opening summary visible without an automatic jump after login', () => {
  const page = navigation(''); page.ready(); page.flush();
  assert.equal(page.views[0].hidden, false); assert.deepEqual(page.scrolled, []);
  assert.equal(page.historyWrites.length, 0);
});

test('logout cancels a queued deep-link scroll before detached private content is used', () => {
  const page = navigation(); page.ready(); page.clear(); page.flush();
  assert.deepEqual(page.scrolled, []);
});
