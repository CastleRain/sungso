import test from 'node:test';
import assert from 'node:assert/strict';
import { mountScenePicker, scenePickerMessage, PICKER_SECTIONS } from '../js/scene-picker.mjs';

class Node {
  constructor(tag = 'div', id = '', className = '') { this.tagName = tag; this.nodeType = 1; this.id = id; this.className = className; this.children = []; this.attributes = new Map(); this.listeners = new Map(); this.hidden = false; this.isConnected = true; }
  append(node) { node.parentElement = this; this.children.push(node); }
  remove() { this.parentElement.children = this.parentElement.children.filter(node => node !== this); this.isConnected = false; }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  removeAttribute(key) { this.attributes.delete(key); }
  addEventListener(type, callback) { const set = this.listeners.get(type) || new Set(); set.add(callback); this.listeners.set(type, set); }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
  emit(type, event = {}) { for (const callback of this.listeners.get(type) || []) callback({ type, ...event }); }
  matches(selector) {
    return selector.split(',').some(raw => {
      const item = raw.trim();
      if (item === '[hidden]') return this.hidden;
      if (item === 'dialog[open]') return this.tagName === 'dialog' && this.open;
      if (item.startsWith('.')) return this.className.split(' ').includes(item.slice(1));
      if (item.startsWith('#')) return this.id === item.slice(1);
      if (item.startsWith('[contenteditable]')) return this.attributes.has('contenteditable') && this.getAttribute('contenteditable') !== 'false';
      const attr = item.match(/^\[([^=\]]+)(?:="([^"]+)")?\]$/);
      if (attr) return this.attributes.has(attr[1]) && (attr[2] === undefined || this.getAttribute(attr[1]) === attr[2]);
      if (item.includes('.')) { const [tag, cls] = item.split('.'); return this.tagName === tag && this.className.split(' ').includes(cls); }
      return this.tagName === item;
    });
  }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
  querySelector(selector) { for (const node of this.children) { if (node.matches(selector)) return node; const found = node.querySelector(selector); if (found) return found; } return null; }
}
function fixture({ embedded = true } = {}) {
  const doc = new Node('document'), html = new Node('html'), body = new Node('body'), main = new Node('main', '', 'paper');
  doc.documentElement = html; doc.body = body; doc.hidden = false; doc.append(html); html.append(body); body.append(main);
  doc.createElement = tag => new Node(tag); doc.getElementById = id => doc.querySelector('#' + id);
  const section = (id, tag = 'section', cls = 'section') => { const node = new Node(tag, id, cls); main.append(node); return node; };
  const hero = section('', 'section', 'hero'), invitation = section('invitation'), date = section('wedding-day'), gallery = section('gallery'), hidden = section('keepsake'); hidden.hidden = true;
  const closing = section('', 'footer', 'closing-section'), navigation = new Node('nav', '', 'experience-dock'); body.append(navigation);
  const heading = new Node('h2'); date.append(heading);
  const action = new Node('button'); date.append(action); const actionText = new Node('span'); action.append(actionText);
  const photo = new Node('button'), img = new Node('img'); gallery.append(photo); photo.append(img);
  const messages = [], win = new Node('window'); win.location = { origin: 'https://sungso-wedding.vercel.app' }; win.scrollX = 0; win.scrollY = 0;
  win.parent = embedded ? { postMessage: (data, target) => messages.push({ data, target }) } : win;
  let selection = ''; win.getSelection = () => ({ toString: () => selection });
  const mount = () => mountScenePicker({ doc, win, embedded });
  const click = (target, options = {}) => doc.emit('click', { target, isTrusted: true, detail: 1, preventDefault() {}, ...options });
  const down = (x = 10, y = 10) => doc.emit('pointerdown', { isTrusted: true, button: 0, pointerId: 2, clientX: x, clientY: y });
  const command = (data, overrides = {}) => win.emit('message', { data: { type: 'invitation-studio:picker', ...data }, origin: win.location.origin, source: win.parent, ...overrides });
  return { doc, html, main, win, hero, invitation, date, heading, gallery, photo, img, action, actionText, hidden, closing, navigation, messages, mount, click, down, command, section, selectText: value => { selection = value; } };
}

test('only exact parent and origin can control picker; malformed sections and flags are rejected', () => {
  const parent = {}, context = { embedded: true, parent, origin: 'https://example.test' };
  const event = { origin: context.origin, source: parent, data: { type: 'invitation-studio:picker', enabled: false, section: 'wedding-day' } };
  assert.deepEqual(scenePickerMessage(event, context), { enabled: false, section: 'wedding-day' });
  for (const override of [{ origin: 'https://evil.test' }, { source: {} }, { data: { ...event.data, section: '__proto__' } }, { data: { ...event.data, enabled: 'true' } }, { data: { ...event.data, section: '/manage.html' } }]) assert.equal(scenePickerMessage({ ...event, ...override }, context), null);
  assert.equal(scenePickerMessage(event, { ...context, embedded: false }), null);
  assert.deepEqual(scenePickerMessage({ ...event, data: { ...event.data, section: null } }, context), { enabled: false, section: null });
  assert.ok(PICKER_SECTIONS.some(item => item.id === 'navigation'));
});

test('standalone guest view is not decorated and has no editor listeners', () => {
  const f = fixture({ embedded: false }), picker = f.mount();
  assert.equal(f.html.attributes.size, 0); assert.equal(f.date.querySelector('button').getAttribute('data-scene-picker-button'), null);
  assert.equal(f.doc.listeners.size, 0); picker.refresh(); picker.destroy();
});

test('trusted noninteractive click selects date while links, photos, form controls and synthetic clicks keep their guest actions', () => {
  const f = fixture(), picker = f.mount();
  f.click(f.heading); assert.deepEqual(f.messages, [{ data: { type: 'invitation-studio:select', section: 'wedding-day' }, target: f.win.location.origin }]);
  assert.equal(f.date.getAttribute('data-studio-picked'), 'true');
  f.click(f.actionText); f.click(f.img); f.click(f.heading, { isTrusted: false }); f.click(f.heading, { defaultPrevented: true });
  for (const tag of ['a', 'input', 'label', 'textarea', 'select', 'summary']) { const node = new Node(tag); f.date.append(node); f.click(node); }
  const editable = new Node('div'); editable.setAttribute('contenteditable', 'true'); f.date.append(editable); f.click(editable);
  assert.equal(f.messages.length, 1);
  const badge = f.gallery.querySelector('[data-scene-picker-button]'); f.click(badge, { detail: 0 });
  assert.equal(f.messages.at(-1).data.section, 'gallery'); assert.equal(f.date.getAttribute('data-studio-picked'), null);
  picker.destroy();
});

test('scroll, drag, pointer cancellation and selected text cannot open an editor accidentally', () => {
  const f = fixture(), picker = f.mount();
  f.down(); f.doc.emit('pointermove', { pointerId: 2, clientX: 10, clientY: 25 }); f.click(f.heading);
  f.down(); f.win.scrollY = 40; f.click(f.heading);
  f.down(); f.win.emit('scroll'); f.click(f.heading);
  f.down(); f.doc.emit('pointercancel'); f.click(f.heading);
  f.selectText('2027년'); f.click(f.heading); assert.equal(f.messages.length, 0);
  f.selectText(''); f.down(); f.doc.emit('pointermove', { pointerId: 2, clientX: 10, clientY: 30 });
  f.click(f.date.querySelector('[data-scene-picker-button]'), { detail: 0 }); assert.equal(f.messages.length, 1, 'a keyboard badge activation is independent of an earlier drag');
  picker.destroy();
});

test('disabled picker and modal/hidden scenes stay inert; refreshed optional scenes and cleanup preserve originals', () => {
  const f = fixture(); f.date.setAttribute('data-studio-scene', 'original'); const picker = f.mount();
  assert.equal(f.hidden.querySelector('[data-scene-picker-button]').hidden, true); f.click(f.hidden); assert.equal(f.messages.length, 0);
  f.command({ enabled: false }); f.click(f.heading); assert.equal(f.messages.length, 0); assert.equal(f.date.querySelector('[data-scene-picker-button]').hidden, true);
  f.command({ enabled: true, section: 'wedding-day' }, { source: {} }); assert.equal(f.html.getAttribute('data-studio-picker'), 'off');
  f.command({ enabled: true, section: 'wedding-day' }); assert.equal(f.date.getAttribute('data-studio-picked'), 'true');
  const dialog = new Node('dialog'); dialog.open = true; f.doc.body.append(dialog); f.click(f.heading); assert.equal(f.messages.length, 0); dialog.open = false;
  f.hidden.hidden = false; const extra = f.section('promises'); f.doc.emit('lab:layout-changed');
  assert.equal(f.hidden.querySelector('[data-scene-picker-button]').hidden, false); f.click(extra); assert.equal(f.messages.at(-1).data.section, 'promises');
  f.command({ enabled: true, section: null }); assert.equal(extra.getAttribute('data-studio-picked'), null);
  picker.destroy(); picker.destroy(); assert.equal(f.date.getAttribute('data-studio-scene'), 'original'); assert.equal(f.date.querySelector('[data-scene-picker-button]'), null); assert.equal(f.html.getAttribute('data-studio-picker'), null);
  assert.ok([...f.doc.listeners.values(), ...f.win.listeners.values()].every(set => set.size === 0));
});
