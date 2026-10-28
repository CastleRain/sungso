import test from 'node:test';
import assert from 'node:assert/strict';
import { UTILITY_CHOICES, utilityChoices, recipientTransition, mountUtilityScenes } from '../js/utility-scenes.mjs';

function fixture() {
  const listeners = new Map(), mediaListeners = new Map(), classes = new Set();
  const media = { matches: false, addEventListener: (type, fn) => mediaListeners.set(type, fn), removeEventListener: type => mediaListeners.delete(type) };
  const body = {
    dataset: { palette: 'rose' }, children: [{ id: 'map', state: { src: 'unchanged' } }, { id: 'account', state: { recipient: 'mother' } }, { id: 'message', state: { draft: 'kept' } }],
    classList: { contains: value => classes.has(value), toggle: (value, on) => on ? classes.add(value) : classes.delete(value) },
  };
  let dialog = false;
  const doc = { body, hidden: false, querySelector(selector) { assert.equal(selector, 'dialog[open]'); return dialog ? {} : null; },
    addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: type => listeners.delete(type),
  };
  const win = { matchMedia: query => { assert.equal(query, '(prefers-reduced-motion: reduce)'); return media; } };
  return { doc, win, body, classes, media, listeners, mediaListeners, setDialog(value) { dialog = value; listeners.get('lab:dialog-change')?.(); } };
}

test('only the known visual choices can reach the four presentation attributes', () => {
  const original = { arrival: 'unfold', gifting: 'card', wishes: 'envelope', navigation: 'dock' };
  for (const input of [null, undefined, {}, { arrival: 'https://outside', gifting: '__proto__', wishes: 'constructor', navigation: ['compact'] }]) assert.deepEqual(utilityChoices(input), original);
  assert.deepEqual(utilityChoices({ arrival: 'postcard', gifting: 'ledger', wishes: 'notebook', navigation: 'compact', dataMode: 'production', account: 'secret' }), { arrival: 'postcard', gifting: 'ledger', wishes: 'notebook', navigation: 'compact' });
});

test('every utility combination preserves the live map, selected recipient and message draft', () => {
  const f = fixture(), originalNodes = [...f.body.children], originalStates = originalNodes.map(node => node.state);
  const controller = mountUtilityScenes({ ...f });
  for (const arrival of UTILITY_CHOICES.arrival) for (const gifting of UTILITY_CHOICES.gifting) for (const wishes of UTILITY_CHOICES.wishes) for (const navigation of UTILITY_CHOICES.navigation) {
    controller.setComposition({ arrival, gifting, wishes, navigation });
    assert.deepEqual({ ...f.body.dataset }, { palette: 'rose', arrival, gifting, wishes, navigation });
    f.body.children.forEach((node, index) => { assert.equal(node, originalNodes[index]); assert.equal(node.state, originalStates[index]); });
  }
  controller.destroy(); assert.deepEqual(f.body.dataset, { palette: 'rose' });
});

test('scroll-only still leaves click effects available while hidden, reduced and disabled states settle both', () => {
  const f = fixture(), controller = mountUtilityScenes(f);
  assert.ok(f.classes.has('utility-effects')); assert.ok(f.classes.has('utility-scroll'));
  controller.setScrollEnabled(false); assert.ok(f.classes.has('utility-effects')); assert.ok(!f.classes.has('utility-scroll'));
  f.doc.hidden = true; f.listeners.get('visibilitychange')(); assert.equal(f.classes.size, 0);
  f.doc.hidden = false; f.listeners.get('visibilitychange')(); assert.ok(f.classes.has('utility-effects'));
  f.setDialog(true); assert.equal(f.classes.size, 0); f.setDialog(false); assert.ok(f.classes.has('utility-effects'));
  f.media.matches = true; f.mediaListeners.get('change')(); assert.equal(f.classes.size, 0);
  f.media.matches = false; f.mediaListeners.get('change')(); assert.ok(f.classes.has('utility-effects'));
  controller.setEnabled(false); assert.equal(f.classes.size, 0);
  controller.setScrollEnabled(true); assert.equal(f.classes.size, 0);
  controller.setEnabled(true); assert.ok(f.classes.has('utility-scroll')); controller.destroy();
});

test('teardown restores prior attributes and effect flags and ignores later changes', () => {
  const f = fixture(); f.body.dataset.arrival = 'previous'; f.classes.add('utility-scroll');
  const controller = mountUtilityScenes({ ...f, composition: { arrival: 'itinerary' } });
  controller.destroy(); controller.destroy();
  controller.setComposition({ arrival: 'postcard' }); controller.setEnabled(true); controller.refresh();
  assert.deepEqual(f.body.dataset, { palette: 'rose', arrival: 'previous' });
  assert.deepEqual([...f.classes], ['utility-scroll']); assert.equal(f.listeners.size, 0); assert.equal(f.mediaListeners.size, 0);
});

test('recipient motion preserves the former card and gives other layouts independent bounded frames', () => {
  const card = recipientTransition('card'), ledger = recipientTransition('ledger'), letter = recipientTransition('letter');
  assert.deepEqual(recipientTransition('unknown'), card); assert.notDeepEqual(card, ledger); assert.notDeepEqual(letter, ledger);
  for (const frames of [card, ledger, letter]) { assert.equal(frames.length, 2); assert.ok(frames[0].opacity >= .4); assert.deepEqual(frames[1], { opacity: 1, transform: 'none' }); }
  ledger[0].opacity = 0; assert.equal(recipientTransition('ledger')[0].opacity, .5);
});
