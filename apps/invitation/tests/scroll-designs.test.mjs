import test from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES } from '../js/catalog.mjs';
import { SCROLL_DESIGNS, getScrollDesign, supportsScrollStory, collectStoryNodes, storySceneKey } from '../js/scroll-designs.mjs';
import { storyMotion } from '../js/scroll-motion.mjs';
import { collectionMotion } from '../js/scroll-motion-collection.mjs';

const ids = SCROLL_DESIGNS.map(design => design.id);
const input = (overrides = {}) => ({ current: true, transition: 0, progress: .4, panY: -1234, width: 390, height: 640, ...overrides });
const sceneValues = frame => Object.fromEntries(Object.entries(frame).filter(([name]) => name.startsWith('--scene-')));
const unclipped = value => /^inset\((?:0(?:px|%)?\s*){1,4}\)$/.test(value);

test('every catalog template supports scroll without accepting unknown or malformed design IDs', () => {
  assert.deepEqual(ids, TEMPLATES.map(template => template.id));
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    assert.ok(TEMPLATES.some(template => template.id === id), id);
    assert.equal(getScrollDesign(id)?.id, id);
    assert.equal(supportsScrollStory(id), true);
  }
  for (const id of ['unknown', '', null, undefined, '__proto__', 'constructor', { id: 'festival' }]) {
    assert.equal(getScrollDesign(id), null);
    assert.equal(supportsScrollStory(id), false);
  }
});

test('scroll motion returns the same frame when every supported treatment is revisited in reverse', () => {
  const positions = [0, .13, .38, .5, .76, 1];
  for (const id of ids) for (const current of [true, false]) {
    const at = transition => input({ current, transition, progress: transition, panY: -3500 * transition });
    const forwards = positions.map(position => storyMotion(id, at(position)));
    const backwards = [...positions].reverse().map(position => storyMotion(id, at(position))).reverse();
    assert.deepEqual(backwards, forwards, `${id}, current=${current}`);
  }
});

test('settled scenes remain fully readable and incoming scenes finish without transforms or clipping', () => {
  for (const id of ids) for (const current of [true, false]) {
    const frame = storyMotion(id, input({ current, transition: current ? 0 : 1 }));
    assert.equal(Number(frame['--scene-opacity']), 1, `${id} opacity`);
    assert.equal(Number(frame['--scene-scale']), 1, `${id} scale`);
    assert.equal(parseFloat(frame['--scene-x']), 0, `${id} x`);
    assert.equal(parseFloat(frame['--scene-y']), current ? -1234 : 0, `${id} pan`);
    assert.equal(parseFloat(frame['--scene-rotate']), 0, `${id} rotation`);
    assert.equal(parseFloat(frame['--scene-rotate-y']), 0, `${id} page rotation`);
    assert.equal(Number(frame['--scene-brightness']), 1, `${id} brightness`);
    assert.ok(unclipped(frame['--scene-clip']), `${id}: ${frame['--scene-clip']}`);
  }
});

test('motion values stay finite across small screens, large frames and long content', () => {
  const sizes = [[320, 160], [390, 640], [1440, 1200]];
  for (const id of ids) for (const [width, height] of sizes) for (const current of [true, false]) {
    for (const transition of [0, .25, .5, .75, 1]) {
      const frame = storyMotion(id, input({ width, height, current, transition, progress: transition, panY: -25000 }));
      for (const [name, value] of Object.entries(frame)) {
        assert.equal(typeof value, 'string', `${id} ${name}`);
        assert.doesNotMatch(value, /NaN|Infinity|undefined/, `${id} ${name}`);
        for (const number of value.matchAll(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)) assert.ok(Number.isFinite(Number(number[0])), `${id} ${name}`);
      }
      assert.ok(Number(frame['--scene-opacity']) >= 0 && Number(frame['--scene-opacity']) <= 1, id);
    }
  }
});

test('the ten authored treatments produce distinct visible handovers', () => {
  const authored = ['magazine', 'film', 'greenhouse', 'scrapbook', 'constellation', 'envelope', 'promenade', 'vinyl', 'museum', 'festival'];
  const frames = authored.map(id => JSON.stringify(sceneValues(storyMotion(id, input({ transition: .23 })))));
  assert.equal(new Set(frames).size, authored.length);
});

test('collection handovers leave a clear pause between bodies and preserve long scenes without clipping', () => {
  for (const id of ['vinyl', 'museum', 'festival']) {
    for (const transition of [0, .1, .3, .49, .5, .6, .9, 1]) {
      const outgoing = collectionMotion(id, input({ transition, panY: -25000 }));
      const incoming = collectionMotion(id, input({ current: false, transition }));
      assert.ok(Number(outgoing['--scene-opacity']) === 0 || Number(incoming['--scene-opacity']) === 0, id);
      assert.ok(unclipped(outgoing['--scene-clip']), id);
      assert.ok(unclipped(incoming['--scene-clip']), id);
    }
    assert.equal(collectionMotion(id, input({ panY: -25000 }))['--scene-y'], '-25000px', id);
    for (const value of Object.values(collectionMotion(id, { current: true, transition: NaN, progress: Infinity, panY: NaN, width: -1, height: Infinity }))) {
      assert.doesNotMatch(value, /NaN|Infinity|undefined/, id);
    }
  }
  assert.equal(collectionMotion('unknown', input()), null);
  assert.equal(collectionMotion('magazine', input()), null);
});

// Only tree navigation is needed here; no rendering or browser emulation.
function node(className = '', children = [], section) {
  const value = {
    className, children, dataset: section ? { section } : {},
    classList: { contains: name => className.split(/\s+/).includes(name) },
    matches(selector) { return selector.startsWith('.') ? this.classList.contains(selector.slice(1)) : selector === '[data-section]' && Boolean(this.dataset.section); },
    querySelector(selector) {
      for (const child of this.children) {
        if (child.matches(selector)) return child;
        const found = child.querySelector(selector);
        if (found) return found;
      }
      return null;
    },
  };
  children.forEach(child => { child.parentElement = value; });
  return value;
}

test('collecting nested scenes preserves wrappers, node identity and interactive state while skipping ornaments', () => {
  const cover = node('cover'), story = node('story', [], 'story');
  const directions = node('insert', [node('', [], 'directions')]);
  const accounts = node('insert', [node('', [], 'accounts')]);
  const rsvp = node('', [], 'rsvp'), guestbook = node('', [], 'guestbook'), ending = node('invitation-ending');
  const enclosures = node('env-enclosures', [directions, accounts]);
  const edition = node('pe-edition', [cover, story, enclosures]);
  const wishes = node('cs-warm-wishes', [rsvp, guestbook]);
  const root = node('invitation', [node('env-postal-header'), edition, wishes, ending, node('cs-edition')]);
  const state = { season: 'autumn', reply: 'on' }, click = () => 'same listener';
  edition.state = state; story.onclick = click; accounts.open = true;
  const originalRoot = [...root.children], originalEdition = [...edition.children];
  assert.deepEqual(collectStoryNodes(root), [cover, story, directions, accounts, rsvp, guestbook, ending]);
  assert.deepEqual(root.children, originalRoot);
  assert.deepEqual(edition.children, originalEdition);
  assert.equal(directions.parentElement, enclosures);
  assert.equal(cover.parentElement, edition);
  assert.equal(edition.state, state);
  assert.equal(story.onclick, click);
  assert.equal(accounts.open, true);
  assert.deepEqual(collectStoryNodes(null), []);
});

test('semantic scene keys find nested covers, optional sections, endings and film development', () => {
  const cases = [
    [node('env-cover-sheet', [node('cover')]), 'cover'],
    [node('cs-opening', [node('cover')]), 'cover'],
    [node('cs-scenes'), 'moments'],
    [node('ed-film-darkroom'), 'darkroom'],
    [node('ed-museum-exhibition'), 'exhibition'],
    [node('ticket-editorial-hero'), 'journey'],
    [node('pe-section', [], 'story'), 'story'],
    [node('env-insert', [node('', [], 'accounts')]), 'accounts'],
    [node('last-paper', [node('invitation-ending')]), 'ending'],
    [node('cs-finale'), 'ending'],
    [node('pe-garden-ending'), 'ending'],
    [node('unclassified'), 'scene-4'],
  ];
  for (const [element, expected] of cases) assert.equal(storySceneKey(element, 4), expected);
});

test('ticket chapters are independent scenes while transport and RSVP state keep their wrapper', () => {
  const hero = node('ticket-editorial-hero');
  const cover = node('ticket-boarding-page', [node('cover')]);
  const invitation = node('ticket-letter-page', [node('invite-section', [], 'greeting')]);
  const itinerary = node('ticket-itinerary-page', [node('invite-section', [], 'date')]);
  const directions = node('invite-section ticket-arrivals', [], 'directions');
  const reply = node('invite-section ticket-rsvp', [], 'rsvp');
  const ending = node('ticket-final-page', [node('invitation-ending')]);
  const document = node('ticket-document', [node('ticket-masthead'), hero, cover, invitation, itinerary, directions, reply, ending]);
  document.dataset.transport = 'bus'; document.dataset.confirmed = 'true';
  const originalChildren = [...document.children];
  const scenes = collectStoryNodes(node('invitation', [document]));
  assert.deepEqual(scenes, [hero, cover, invitation, itinerary, directions, reply, ending]);
  assert.deepEqual(scenes.map(storySceneKey), ['journey', 'cover', 'greeting', 'date', 'directions', 'rsvp', 'ending']);
  assert.deepEqual(document.children, originalChildren);
  assert.deepEqual(document.dataset, { transport: 'bus', confirmed: 'true' });
  assert.equal(reply.parentElement, document);
});
