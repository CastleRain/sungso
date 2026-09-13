import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderSignatureEnvelope, createEnvelopeSignature } from '../js/signature-envelope.mjs';
import { paperCover } from '../js/special-paper.mjs';

test('envelope signature preserves the opening experience and every supplied content part', () => {
  const parts = Object.fromEntries(['greeting', 'date', 'gallery', 'directions', 'accounts', 'rsvp', 'guestbook', 'ending'].map(key => [key, `<section data-test="${key}">example ${key}</section>`]));
  parts.cover = paperCover('envelope');
  parts.story = '<section data-section="story">generic story</section>';
  const html = renderSignatureEnvelope({ templateId: 'envelope' }, parts);
  assert.ok(html.includes(parts.cover));
  for (const [key, part] of Object.entries(parts)) if (key !== 'story') assert.equal(html.split(part).length - 1, 1, key);
  assert.match(html, /data-experience="envelope"/);
  assert.equal((html.match(/data-envelope-letter=/g) || []).length, 3);
  assert.equal((html.match(/data-section="story"/g) || []).length, 1);
  assert.match(html, /data-envelope-letter="beginning" open/);
  assert.match(html, /디자인을 살펴보기 위한 예시 이야기/);
  assert.doesNotMatch(html, /<article\b|<form\b|<input\b|<iframe\b|generic story/);
});

test('optional sections stay absent and selection values are never interpolated as markup', () => {
  const html = renderSignatureEnvelope({ galleryLayout: '<script>bad()</script>', paletteId: '<img onerror=bad()>' }, { cover: '', greeting: 'greeting', date: 'date', ending: 'ending' });
  assert.doesNotMatch(html, /data-envelope-letter=|data-section="story"|env-photographs|env-insert-label|<script|onerror/);
  assert.match(html, /env-enclosures-empty/);
  assert.match(html, /가상의 사진·날짜·장소/);
  assert.match(html, /가상 커플의 웨딩 예시 사진/);
});

class Root {
  constructor() {
    this.letters = ['beginning', 'ordinary', 'promise'].map((id, index) => ({ tagName: 'DETAILS', dataset: { envelopeLetter: id }, open: index === 0 }));
    this.listeners = new Set();
  }
  querySelectorAll(selector) { assert.equal(selector, 'details[data-envelope-letter]'); return this.letters; }
  contains(node) { return this.letters.includes(node); }
  addEventListener(type, listener, capture) { assert.equal(type, 'toggle'); assert.equal(capture, true); this.listeners.add(listener); }
  removeEventListener(type, listener, capture) { assert.equal(type, 'toggle'); assert.equal(capture, true); this.listeners.delete(listener); }
  toggle(index, open) { const target = this.letters[index]; target.open = open; for (const listener of this.listeners) listener({ target }); }
}

test('folds survive option rerenders in memory and detached roots cannot update their state', () => {
  const controller = createEnvelopeSignature(), first = new Root();
  controller.mount(first);
  first.toggle(0, false);
  first.toggle(1, true);
  first.toggle(2, true);
  const delayedToggle = [...first.listeners][0];
  const next = new Root();
  controller.mount(next);
  assert.equal(first.listeners.size, 0);
  assert.deepEqual(next.letters.map(letter => letter.open), [false, true, true]);
  first.letters[0].open = true;
  delayedToggle({ target: first.letters[0] });
  const third = new Root();
  controller.mount(third);
  assert.deepEqual(third.letters.map(letter => letter.open), [false, true, true]);
  controller.dispose();
  assert.equal(third.listeners.size, 0);
  controller.mount(null);
  const separateController = createEnvelopeSignature(), fresh = new Root();
  separateController.mount(fresh);
  assert.deepEqual(fresh.letters.map(letter => letter.open), [true, false, false]);
  separateController.dispose();
});

test('immediate palette rerender captures native open changes before delayed toggle dispatch', () => {
  const controller = createEnvelopeSignature(), root = new Root();
  controller.mount(root);
  const oldLetters = root.letters, delayedToggle = [...root.listeners][0];
  // Browser default action changes open now, while its toggle task is still queued.
  oldLetters[0].open = false;
  oldLetters[1].open = true;
  // app.mjs replaces preview-canvas.innerHTML before mounting into the same root.
  root.letters = new Root().letters;
  controller.mount(root);
  assert.deepEqual(root.letters.map(letter => letter.open), [false, true, false]);
  assert.equal(root.listeners.size, 1);
  oldLetters[0].open = true;
  oldLetters[1].open = false;
  delayedToggle({ target: oldLetters[0] });
  delayedToggle({ target: oldLetters[1] });
  const next = new Root();
  controller.mount(next);
  assert.deepEqual(next.letters.map(letter => letter.open), [false, true, false]);
  controller.dispose();
});

test('explicit disposal captures pending native changes and repeated disposal cannot reset them', () => {
  const controller = createEnvelopeSignature(), root = new Root();
  controller.mount(root);
  const delayedToggle = [...root.listeners][0];
  root.letters[0].open = false;
  root.letters[2].open = true;
  controller.dispose();
  controller.dispose();
  assert.equal(root.listeners.size, 0);
  root.letters[0].open = true;
  root.letters[2].open = false;
  delayedToggle({ target: root.letters[0] });
  const next = new Root();
  controller.mount(next);
  assert.deepEqual(next.letters.map(letter => letter.open), [false, false, true]);
  // Disabling the optional story must keep its choices when it is enabled again.
  const empty = new Root(); empty.letters = [];
  controller.mount(empty);
  const enabled = new Root();
  controller.mount(enabled);
  assert.deepEqual(enabled.letters.map(letter => letter.open), [false, false, true]);
  controller.dispose();
});

test('signature stays scoped and uses no persistence, extra requests or vertical scroll container', async () => {
  const css = await readFile(new URL('../css/signature-envelope.css', import.meta.url), 'utf8');
  const module = await readFile(new URL('../js/signature-envelope.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(module, /localStorage|sessionStorage|indexedDB|fetch\(|firebase|https?:\/\//);
  assert.doesNotMatch(css, /overflow-y\s*:\s*(?:auto|scroll)|100vh|@import|url\(/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /summary:focus-visible/);
  // Split at rule boundaries: selectors (including those after media wrappers)
  // must start with the signature root, never styling another template.
  const selectors = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{/g)].map(match => match[1].trim()).filter(selector => !selector.startsWith('@'));
  for (const selector of selectors) for (const part of selector.split(',')) assert.ok(part.trim().startsWith('.signature-envelope'), part);
});
