import test from 'node:test';
import assert from 'node:assert/strict';
import { mountFineAppearance, fineAppearanceChoices, fineSectionValues } from '../js/fine-appearance.mjs';

class Element extends EventTarget {
  constructor(tag = 'div', { id = '', className = '', text = '' } = {}) {
    super(); this.tagName = tag; this.nodeType = tag === '#text' ? 3 : 1; this.id = id; this.className = className; this.textContent = text; this.childNodes = []; this.attributes = new Map(); this.css = {};
    const properties = new Map(), priorities = new Map();
    this.style = { setProperty: (key, value, priority = '') => { properties.set(key, String(value)); priorities.set(key, priority); }, getPropertyValue: key => properties.get(key) || '', getPropertyPriority: key => priorities.get(key) || '', removeProperty: key => { properties.delete(key); priorities.delete(key); }, properties };
    this.classList = { contains: name => this.className.split(' ').includes(name), add: name => { this.className += ` ${name}`; }, remove: name => { this.className = this.className.split(' ').filter(value => value !== name).join(' '); } };
    if (text && tag !== '#text') this.append(new Element('#text', { text }));
  }
  append(...nodes) { nodes.forEach(node => { node.parentElement = this; this.childNodes.push(node); }); }
  get children() { return this.childNodes.filter(node => node.nodeType === 1); }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  removeAttribute(key) { this.attributes.delete(key); }
  matches(selector) {
    if (selector.includes(',')) return selector.split(',').some(part => this.matches(part));
    if (selector === '[aria-hidden="true"]') return this.getAttribute('aria-hidden') === 'true';
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    if (selector.includes('.')) { const [tag, cls] = selector.split('.'); return this.tagName === tag && this.classList.contains(cls); }
    return this.tagName === selector;
  }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
  querySelectorAll(selector) { return this.children.flatMap(node => [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
function fixture() {
  const doc = new Element('document'), html = new Element('html'), body = new Element('body'), main = new Element('main', { className: 'paper' });
  doc.documentElement = html; doc.body = body; doc.hidden = false; doc.append(html); html.append(body); body.append(main); doc.fonts = new EventTarget(); doc.getElementById = id => doc.querySelector('#' + id);
  const section = (id, className = 'section') => { const node = new Element('section', { id, className }); main.append(node); return node; };
  const hero = section('', 'hero'), invitation = section('invitation'), gallery = section('gallery'), closing = section('closing', 'section closing-section');
  const paragraph = new Element('p', { text: '함께할 우리의 날' }), strong = new Element('strong', { text: '더 굵게' }); paragraph.append(strong); invitation.append(paragraph);
  const heading = new Element('h2', { text: 'Our moments' }); gallery.append(heading);
  const names = new Element('p', { className: 'hero-names', text: '성우 소희' }), ink = new Element('div', { className: 'hero-letter' }), handwriting = new Element('h1', { text: 'We are getting married' }); ink.append(handwriting); hero.append(names, ink);
  const closingCopy = new Element('p', { text: '반갑게 만나요' }); closing.append(closingCopy);
  const form = new Element('form'), input = new Element('textarea', { text: '작성 중인 편지' }), label = new Element('label', { text: '이름' }); input.value = '작성 중인 편지'; form.append(label, input); invitation.append(form);
  const glyph = new Element('button', { text: '↗' }); invitation.append(glyph);
  const audio = new Element('audio'); audio.currentTime = 123; audio.paused = true; body.append(audio);
  const dialog = new Element('dialog', { id: 'story-dialog' }), storyText = new Element('p', { text: '커피숍에서 만났어요.' }); dialog.open = true; dialog.append(storyText); body.append(dialog);
  const win = new EventTarget(), frames = new Map(); let serial = 0, observer, renders = 0;
  const state = { font: 16, padding: 72 };
  win.Event = Event; win.requestAnimationFrame = callback => { frames.set(++serial, callback); return serial; }; win.cancelAnimationFrame = id => frames.delete(id);
  function computed(node) {
    renders++;
    const inlineFont = parseFloat(node.style.getPropertyValue('font-size'));
    const cssFont = typeof node.css.fontSize === 'function' ? node.css.fontSize() : node.css.fontSize;
    const font = Number.isFinite(inlineFont) ? inlineFont : cssFont || (node.parentElement ? parseFloat(computed(node.parentElement).fontSize) : 16);
    const inlineLine = parseFloat(node.style.getPropertyValue('line-height'));
    const line = Number.isFinite(inlineLine) ? inlineLine : typeof node.css.lineHeight === 'number' ? node.css.lineHeight : font * 2;
    const padding = node.className.includes('section') ? state.padding : 0;
    return { fontSize: `${font}px`, lineHeight: `${line}px`, paddingTop: node.style.getPropertyValue('padding-top') || `${padding}px`, paddingBottom: node.style.getPropertyValue('padding-bottom') || `${padding + (node === closing ? 40 : 0)}px` };
  }
  win.getComputedStyle = computed;
  paragraph.css.fontSize = () => state.font; heading.css.fontSize = 50; names.css.fontSize = 30; storyText.css.fontSize = 18;
  win.MutationObserver = class { constructor(callback) { observer = callback; } observe() {} disconnect() { observer = null; } };
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); };
  return { doc, win, state, frames, flush, main, hero, invitation, gallery, closing, paragraph, strong, heading, names, handwriting, form, input, label, glyph, audio, dialog, storyText, get reads() { return renders; }, mutate: records => observer?.(records) };
}

test('fine appearance normalizes numeric values and explicit local defaults override global tuning', () => {
  const choices = fineAppearanceChoices({ textScale: 1.2, lineScale: 1.4, sectionSpace: .7, sectionTuning: 'invitation:1:1:1;gallery:1.1:1.2:1.3' });
  assert.deepEqual(fineSectionValues(choices, 'invitation'), { textScale: 1, lineScale: 1, sectionSpace: 1 });
  assert.deepEqual(fineSectionValues(choices, 'gallery'), { textScale: 1.1, lineScale: 1.2, sectionSpace: 1.3 });
  assert.deepEqual(fineSectionValues(choices, 'location'), { textScale: 1.2, lineScale: 1.4, sectionSpace: .7 });
  assert.equal(fineSectionValues(fineAppearanceChoices({ textScale: .9 }), 'invitation', { largeText: true }).textScale, 1);
  assert.deepEqual(fineAppearanceChoices({ textScale: '<style>', lineScale: {}, sectionSpace: Infinity, sectionTuning: '__proto__:1:1:1' }), { textScale: 1, lineScale: 1, sectionSpace: 1, sections: {} });
});

test('default settings add no inline metrics, while global changes measure nested text once and preserve state', () => {
  const f = fixture(), controller = mountFineAppearance(f); f.flush();
  assert.equal(f.paragraph.style.properties.size, 0); assert.equal(f.invitation.style.properties.size, 0); assert.equal(f.hero.getAttribute('data-fine-type'), null);
  controller.setComposition({ textScale: 1.2, lineScale: 1.1, sectionSpace: .8 }); f.flush();
  assert.equal(f.paragraph.style.getPropertyValue('font-size'), '19.2px'); assert.equal(f.strong.style.getPropertyValue('font-size'), '19.2px', 'nested inherited type must not be scaled a second time');
  assert.equal(f.paragraph.style.getPropertyValue('line-height'), '42.24px'); assert.equal(f.invitation.style.getPropertyValue('padding-top'), '57.6px'); assert.equal(f.closing.style.getPropertyValue('padding-bottom'), '89.6px');
  assert.equal(f.heading.style.getPropertyValue('font-size'), '60px'); assert.equal(f.names.style.getPropertyValue('font-size'), '36px');
  for (const protectedNode of [f.handwriting, f.form, f.input, f.label, f.glyph, f.audio]) assert.equal(protectedNode.style.properties.size, 0);
  assert.equal(f.audio.currentTime, 123); assert.equal(f.audio.paused, true); assert.equal(f.input.value, '작성 중인 편지'); assert.equal(f.dialog.open, true);
  controller.destroy(); assert.equal(f.paragraph.style.properties.size, 0); assert.equal(f.invitation.getAttribute('data-fine-type'), null);
});

test('per-scene values override all globals, including an explicit 100%; linked story dialog follows story values', () => {
  const f = fixture(), controller = mountFineAppearance({ ...f, composition: { textScale: 1.2, lineScale: 1.4, sectionSpace: 1.4, sectionTuning: 'invitation:1:1:1;gallery:0.9:1.1:0.7;our-story:1.1:1.2:1' } }); f.flush();
  assert.equal(f.paragraph.style.properties.size, 0); assert.equal(f.invitation.style.properties.size, 0);
  assert.equal(f.heading.style.getPropertyValue('font-size'), '45px'); assert.equal(f.gallery.style.getPropertyValue('padding-top'), '50.4px');
  assert.equal(f.storyText.style.getPropertyValue('font-size'), '19.8px'); assert.equal(f.storyText.style.getPropertyValue('line-height'), '47.52px');
  controller.setComposition({ textScale: 1.2 }); f.flush(); assert.equal(f.paragraph.style.getPropertyValue('font-size'), '19.2px'); assert.equal(f.gallery.style.getPropertyValue('padding-top'), '');
  controller.destroy();
});

test('changing presets and responsive CSS recalculates from restored baseline without cumulative scaling', () => {
  const f = fixture(); f.paragraph.style.setProperty('line-height', '40px', 'important');
  const controller = mountFineAppearance({ ...f, composition: { textScale: 1.1, lineScale: 1.2, sectionSpace: 1.3 } }); f.flush();
  assert.equal(f.paragraph.style.getPropertyValue('font-size'), '17.6px'); assert.equal(f.paragraph.style.getPropertyValue('line-height'), '52.8px');
  for (let i = 0; i < 10; i++) { controller.refresh(); f.flush(); }
  assert.equal(f.paragraph.style.getPropertyValue('font-size'), '17.6px'); assert.equal(f.paragraph.style.getPropertyValue('line-height'), '52.8px'); assert.equal(f.frames.size, 0, 'layout notification cannot make a refresh loop');
  f.state.font = 19; f.state.padding = 48; f.win.dispatchEvent(new Event('resize')); f.flush();
  assert.equal(f.paragraph.style.getPropertyValue('font-size'), '20.9px'); assert.equal(f.invitation.style.getPropertyValue('padding-top'), '62.4px');
  controller.setComposition({ textScale: .9 }); f.doc.documentElement.classList.add('large-text'); f.flush();
  assert.equal(f.paragraph.style.getPropertyValue('font-size'), '', 'guest larger-text preference cannot shrink');
  controller.destroy(); assert.equal(f.paragraph.style.getPropertyValue('line-height'), '40px'); assert.equal(f.paragraph.style.getPropertyPriority('line-height'), 'important');
});

test('rapid selections collapse to latest frame, hidden tabs pause, and new content gets current metrics', () => {
  const f = fixture(), controller = mountFineAppearance(f);
  controller.setComposition({ textScale: 1.2 }); controller.setComposition({ textScale: .9 }); controller.setComposition({ textScale: 1.1 }); assert.equal(f.frames.size, 1); f.flush();
  assert.equal(f.paragraph.style.getPropertyValue('font-size'), '17.6px');
  const added = new Element('p', { text: '새 계좌 안내' }); added.css.fontSize = 15; f.invitation.append(added); f.mutate([{ type: 'childList', addedNodes: [added], removedNodes: [], target: f.invitation }]); f.flush(); assert.equal(added.style.getPropertyValue('font-size'), '16.5px');
  f.doc.hidden = true; controller.setComposition({ textScale: 1.2 }); assert.equal(f.frames.size, 0); f.doc.hidden = false; f.doc.dispatchEvent(new Event('visibilitychange')); f.flush(); assert.equal(added.style.getPropertyValue('font-size'), '18px');
  controller.setEnabled(false); assert.equal(added.style.getPropertyValue('font-size'), '18px', 'effects-off does not remove reading choices');
  controller.destroy(); assert.equal(f.frames.size, 0); controller.refresh(); assert.equal(f.frames.size, 0); assert.equal(added.style.properties.size, 0);
});
