import test from 'node:test';
import assert from 'node:assert/strict';
import { livePhotoManagerURL, mountLivePhotoManager } from '../js/live-photo-manager.mjs';

const origin = 'https://sungso-wedding.vercel.app';
test('real photo manager accepts only the existing same-origin management routes', () => {
  for (const path of ['/manage.html', '/v6/manage.html', `${origin}/manage.html`]) assert.equal(livePhotoManagerURL(path, origin), new URL(path, origin).href);
  assert.equal(livePhotoManagerURL('/manage.html', 'http://127.0.0.1:8031'), 'http://127.0.0.1:8031/manage.html');
  for (const path of ['', null, '/accounts.html', '/homehunt/', '/lab/studio/manage.html', '/manage.html?publish=true', '/manage.html#upload', '//evil.test/manage.html', 'https://evil.test/manage.html', 'https://user@sungso-wedding.vercel.app/manage.html', '/v6/../manage.html', '/%2e%2e/manage.html', '/%6danage.html', '/v6%2fmanage.html', '/manage.html\\', 'javascript:alert(1)', '/manage.html\n']) assert.equal(livePhotoManagerURL(path, origin), null, String(path));
});

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.listeners = new Map(); this.attributes = new Map(); this.hidden = false; }
  append(node) { this.children.push(node); node.parent = this; }
  setAttribute(key, value) { this.attributes.set(key, value); }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  emit(type, event = {}) { for (const fn of this.listeners.get(type) || []) fn(event); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); }
}
function fixture(managerURL) {
  const root = new Element('root'), created = [], doc = { createElement(tag) { const node = new Element(tag); created.push(node); return node; } };
  const win = { location: { origin } };
  for (const key of ['fetch', 'localStorage', 'sessionStorage', 'parent', 'postMessage']) Object.defineProperty(win, key, { get() { throw new Error(`Forbidden ${key}`); } });
  const manager = mountLivePhotoManager({ root, managerURL, doc, win });
  const get = tag => created.filter(node => node.tag === tag);
  return { root, created, manager, get, toggle: get('button')[0], status: created.find(node => node.className === 'live-photo-status') };
}

test('opening the content panel alone never loads authenticated photos', () => {
  const h = fixture('/manage.html');
  assert.equal(h.get('iframe').length, 0);
  assert.match(h.status.textContent, /불러오지 않아요/);
  h.toggle.emit('click', { isTrusted: false });
  assert.equal(h.get('iframe').length, 0);
  h.manager.dispose(); assert.equal(h.root.children.length, 0);
});

test('one real click opens the existing manager and fold/reopen preserves its document', () => {
  const h = fixture('/v6/manage.html');
  h.toggle.emit('click', { isTrusted: true });
  const frame = h.get('iframe')[0];
  assert.equal(frame.src, `${origin}/v6/manage.html`);
  assert.equal(frame.title, '두 사람만 사용하는 실제 청첩장 사진 관리');
  assert.equal(h.toggle.attributes.get('aria-expanded'), 'true');
  frame.emit('load'); assert.match(h.status.textContent, /실제 반영 여부/);
  h.toggle.emit('click', { isTrusted: true });
  assert.equal(frame.parent.hidden, true); assert.equal(h.get('iframe').length, 1);
  assert.match(h.status.textContent, /작성 중인 사진 편집/);
  h.toggle.emit('click', { isTrusted: true });
  assert.equal(frame.parent.hidden, false); assert.equal(h.get('iframe').length, 1);
  assert.equal(frame.src, `${origin}/v6/manage.html`);
  h.manager.dispose(); h.toggle.emit('click', { isTrusted: true });
  assert.equal(h.root.children.length, 0); assert.equal(h.get('iframe').length, 1);
});

test('invalid manager routes stay disabled and the fallback never receives an unsafe URL', () => {
  const h = fixture('https://evil.test/manage.html');
  assert.equal(h.toggle.disabled, true);
  assert.equal(h.get('a')[0].hidden, true);
  assert.equal(h.get('a')[0].attributes.has('href'), false);
  h.toggle.emit('click', { isTrusted: true }); assert.equal(h.get('iframe').length, 0);
});

test('fallback uses a separate same-origin tab without credential messages', () => {
  const h = fixture('/manage.html'), link = h.get('a')[0];
  assert.equal(link.attributes.get('href'), `${origin}/manage.html`);
  assert.equal(link.attributes.get('target'), '_blank'); assert.equal(link.attributes.get('rel'), 'noopener');
  assert.ok(h.created.some(node => node.textContent?.includes('기존 하객용 청첩장의 사진첩도 함께 바뀝니다')));
});
