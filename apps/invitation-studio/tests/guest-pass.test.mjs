import test from 'node:test';
import assert from 'node:assert/strict';
import jsQR from './vendor/jsQR.cjs';
import { GUEST_PASS_CHOICES, invitationQrUrl, invitationQr, paintInvitationQr, mountGuestPass } from '../js/guest-pass.mjs';
import { CHOICES, DEFAULT_COMPOSITION, OPTIONAL_SECTIONS, compositionParams, readComposition, normalizeComposition } from '../js/composition.mjs';

const wedding = { groom: '성우', bride: '소희', startsAt: '2027-03-06T15:30:00+09:00', venue: '부산 목화웨딩홀', venueSearchName: '목화웨딩컨벤션', room: '15층 벨리스홀', address: '부산광역시 연제구 중앙대로 1125 시티타워' };
class Element {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.dataset = {}; this.attributes = {}; this.listeners = new Map(); this.hidden = false; this.textContent = ''; this.className = ''; }
  append(...nodes) { for (const node of nodes) { node.remove(); node.parentNode = this; this.children.push(node); } }
  insertBefore(node, before) { node.remove(); node.parentNode = this; const index = this.children.indexOf(before); if (index < 0) this.children.push(node); else this.children.splice(index, 0, node); }
  remove() { if (this.parentNode) { const list = this.parentNode.children; list.splice(list.indexOf(this), 1); this.parentNode = null; } }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  addEventListener(type, handler) { const list = this.listeners.get(type) || []; list.push(handler); this.listeners.set(type, list); }
  removeEventListener(type, handler) { this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== handler)); }
  fire(type) { return Promise.all((this.listeners.get(type) || []).map(handler => handler({ target: this }))); }
  click() { this.clicks = (this.clicks || 0) + 1; return this.fire('click'); }
  querySelectorAll(selector) {
    const matches = node => selector.startsWith('.') ? node.className.split(' ').includes(selector.slice(1)) : node.tagName === selector;
    return this.children.flatMap(node => [...(matches(node) ? [node] : []), ...node.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
function rasterCanvas() {
  const canvas = new Element('canvas');
  const ctx = { fillStyle: '', fillRect(x, y, w, h) {
    if (!canvas.pixels || canvas.pixels.length !== canvas.width * canvas.height * 4) canvas.pixels = new Uint8ClampedArray(canvas.width * canvas.height * 4);
    const value = this.fillStyle === '#ffffff' ? 255 : 0;
    for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++) {
      const offset = (row * canvas.width + col) * 4; canvas.pixels.set([value, value, value, 255], offset);
    }
  } };
  canvas.getContext = () => ctx;
  canvas.toBlob = callback => callback(new Blob(['PNG test fixture'], { type: 'image/png' }));
  return canvas;
}
function fixture(composition = {}) {
  const body = new Element('body'), main = new Element('main'), nav = new Element('nav'), tail = new Element('section'), keepsake = new Element('section'), inner = new Element();
  main.className = 'paper'; tail.className = 'closing-section'; keepsake.id = 'keepsake'; inner.className = 'section-inner'; keepsake.append(inner); main.append(keepsake, tail); body.append(main, nav);
  const draft = new Element('input'); draft.value = '작성 중인 축하 메시지'; body.append(draft);
  const audio = new Element('audio'); audio.currentTime = 73.5; body.append(audio);
  const nodes = [], copied = [], downloaded = [], revoked = [];
  const visit = (node, id) => node.id === id ? node : node.children.map(child => visit(child, id)).find(Boolean);
  const doc = {
    body, createElement(tag) { assert.ok(!['iframe', 'script', 'audio', 'form'].includes(tag)); const node = tag === 'canvas' ? rasterCanvas() : new Element(tag); nodes.push(node); return node; },
    querySelector(selector) { return selector === 'main.paper' ? main : selector === '.quick-nav' ? nav : null; }, getElementById(id) { return visit(body, id) || null; },
  };
  const win = { URL: { createObjectURL(blob) { downloaded.push(blob); return `blob:test-${downloaded.length}`; }, revokeObjectURL(url) { revoked.push(url); } }, setTimeout(fn) { fn(); }, fetch() { assert.fail('QR must be generated without network'); }, localStorage: { setItem() { assert.fail('must not write storage'); } } };
  const controller = mountGuestPass({ doc, win, wedding, composition, copyAddress: async value => { copied.push(value); return true; } });
  return { body, main, nav, tail, inner, doc, win, nodes, copied, downloaded, revoked, controller, draft, audio };
}
function allText(node) { return [node.textContent, ...node.children.map(allText)].join(' '); }

test('day pass is opt-in, uses confirmed facts, and preserves its live nodes and surrounding state', () => {
  const f = fixture(), section = f.doc.getElementById('day-pass');
  assert.equal(section.hidden, true); assert.equal(f.main.children.at(-2), section); assert.equal(f.nav.children[0].hidden, true);
  const contents = [...section.children];
  for (const dayPass of GUEST_PASS_CHOICES) {
    f.controller.setComposition({ extras: ['day-pass'], dayPass });
    assert.equal(section.hidden, false); assert.equal(section.dataset.optionalLayout, dayPass); assert.deepEqual(section.children, contents);
    assert.equal(f.nav.children[0].hidden, false);
  }
  const text = allText(section);
  for (const value of ['성우 & 소희', '2027. 03. 06', '오후 3시 30분', wedding.venue, wedding.room, wedding.address, '연산역 7번 출구']) assert.ok(text.includes(value), value);
  assert.ok(!/주차|식사|무료|준비 중/.test(text));
  const hrefs = section.querySelectorAll('a').map(node => node.getAttribute('href'));
  assert.ok(hrefs.includes('https://place.map.kakao.com/24484800')); assert.ok(hrefs.includes('#location'));
  assert.ok(hrefs.some(url => url === `https://map.naver.com/p/search/${encodeURIComponent(wedding.venueSearchName)}`));
  assert.ok(section.querySelectorAll('button').some(node => node.dataset.open === 'tmap-dialog'));
  f.controller.setComposition({ extras: ['unknown'], dayPass: 'url(evil)' }); assert.equal(section.hidden, true); assert.equal(section.dataset.optionalLayout, 'boarding');
  f.controller.refresh(); f.controller.setEnabled(false);
  assert.equal(f.audio.currentTime, 73.5); assert.equal(f.draft.value, '작성 중인 축하 메시지'); assert.deepEqual(f.copied, []); assert.deepEqual(f.downloaded, []);
  f.controller.destroy(); assert.equal(f.doc.getElementById('day-pass'), null); assert.equal(f.nav.children.length, 0);
});

test('QR decodes to the exact canonical current composition with quiet zone and no untrusted query fields', () => {
  const maximal = { ...Object.fromEntries(Object.entries(CHOICES).map(([key, choices]) => [key, choices.at(-1).id])), extras: OPTIONAL_SECTIONS.map(item => item.id), motionSpeed: 1.5, motionStrength: .5 };
  maximal.order = [...normalizeComposition(maximal).order].reverse();
  const cases = [DEFAULT_COMPOSITION, { ...DEFAULT_COMPOSITION, palette: 'rose', keepsake: 'qr', guestGuide: 'slider', dayPass: 'concise', extras: OPTIONAL_SECTIONS.map(item => item.id), motionSpeed: .5, motionStrength: 1.5, endpoint: 'https://evil.invalid', account: 'private' }, maximal];
  for (const composition of cases) {
    const qr = invitationQr(composition), canvas = paintInvitationQr(rasterCanvas(), qr, 4);
    const decoded = jsQR(canvas.pixels, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' });
    assert.ok(decoded, 'standard decoder must read the locally generated QR'); assert.equal(decoded.data, invitationQrUrl(composition));
    const url = new URL(decoded.data); assert.equal(url.origin, 'https://sungso-wedding.vercel.app'); assert.equal(url.pathname, '/lab/studio/preview/');
    assert.deepEqual(readComposition(url.search), normalizeComposition(composition)); assert.equal(url.searchParams.has('account'), false); assert.equal(url.searchParams.has('endpoint'), false);
    for (let x = 0; x < canvas.width; x++) assert.deepEqual([...canvas.pixels.slice(x * 4, x * 4 + 4)], [255, 255, 255, 255]);
  }
  assert.throws(() => paintInvitationQr(rasterCanvas(), invitationQr({}), .5), /scale/);
});

test('compact QR omits only version-1 defaults, retaining every differing visual value and order', () => {
  assert.equal(invitationQrUrl(DEFAULT_COMPOSITION), 'https://sungso-wedding.vercel.app/lab/studio/preview/?version=1');
  const composition = normalizeComposition({ palette: 'rose', keepsake: 'qr', motionSpeed: .5, motionStrength: 1.5, extras: ['day-pass', 'keepsake'], order: ['keepsake', 'day-pass', ...DEFAULT_COMPOSITION.order].reverse() });
  const qrParams = new URL(invitationQrUrl(composition)).searchParams, all = compositionParams(composition), baseline = compositionParams(DEFAULT_COMPOSITION);
  assert.equal(qrParams.get('version'), '1');
  for (const [key, value] of all) {
    if (key === 'version' || value !== baseline.get(key)) assert.equal(qrParams.get(key), value, `must keep ${key}`);
    else assert.equal(qrParams.has(key), false, `default ${key} should be omitted`);
  }
  assert.deepEqual(readComposition(qrParams), composition);
  assert.ok(all.toString().length > qrParams.toString().length * 2, 'most default fields should not make the QR dense');
  assert.equal(all.get('font'), DEFAULT_COMPOSITION.font, 'full URL serialization is unchanged');
});

test('QR choices update one canvas without file, clipboard or playback side effects', () => {
  const f = fixture({ extras: ['keepsake'], keepsake: 'qr' }), canvas = f.doc.getElementById('invitation-qr-code');
  const panel = canvas.parentNode.parentNode; assert.equal(panel.hidden, false);
  const before = panel.querySelector('a').getAttribute('href');
  f.controller.setComposition({ extras: ['day-pass', 'keepsake'], keepsake: 'qr', palette: 'rose' });
  assert.equal(f.doc.getElementById('invitation-qr-code'), canvas); assert.notEqual(panel.querySelector('a').getAttribute('href'), before);
  const decoded = jsQR(canvas.pixels, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' });
  assert.equal(decoded.data, panel.querySelector('a').getAttribute('href'));
  f.controller.setComposition({ extras: ['keepsake'], keepsake: 'ticket' }); assert.equal(panel.hidden, true);
  assert.deepEqual(f.copied, []); assert.deepEqual(f.downloaded, []); assert.equal(f.audio.currentTime, 73.5); assert.equal(f.draft.value, '작성 중인 축하 메시지');
  f.controller.destroy(); assert.equal(f.inner.children.length, 0); f.controller.destroy(); f.controller.setComposition({ extras: ['day-pass'] });
});

test('only explicit actions copy a confirmed address or create and revoke a local PNG URL', async () => {
  const f = fixture({ extras: ['day-pass', 'keepsake'], keepsake: 'qr' });
  await f.doc.getElementById('guest-pass-copy').fire('click'); assert.deepEqual(f.copied, [wedding.address]);
  await f.doc.getElementById('invitation-qr-save').fire('click'); assert.equal(f.downloaded.length, 1); assert.equal(f.downloaded[0].type, 'image/png');
  assert.deepEqual(f.revoked, ['blob:test-1']);
  const anchor = f.nodes.find(node => node.getAttribute('download'));
  assert.equal(anchor.getAttribute('download'), 'sungwo-sohee-invitation-qr.png'); assert.equal(anchor.clicks, 1); assert.equal(anchor.parentNode, null);
  f.controller.destroy(); assert.ok(f.nodes.every(node => [...node.listeners.values()].every(list => !list.length)));
});

test('teardown cancels a pending PNG export and never recreates hidden scenes', async () => {
  const f = fixture({ extras: ['keepsake'], keepsake: 'qr' }); let done;
  const create = f.doc.createElement; f.doc.createElement = tag => { const node = create(tag); if (tag === 'canvas') node.toBlob = callback => { done = callback; }; return node; };
  const pending = f.doc.getElementById('invitation-qr-save').fire('click');
  assert.equal(typeof done, 'function'); f.controller.destroy(); done(new Blob(['x'])); await pending;
  assert.deepEqual(f.downloaded, []); assert.equal(f.inner.children.length, 0);
});
