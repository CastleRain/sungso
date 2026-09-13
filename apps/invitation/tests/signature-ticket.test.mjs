import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderSignatureTicket, createTicketSignature } from '../js/signature-ticket.mjs';
import { paperCover } from '../js/special-paper.mjs';
import { PHOTOS } from '../js/catalog.mjs';

const sectionKeys = ['story', 'gallery', 'directions', 'accounts', 'rsvp', 'guestbook'];
const selection = () => ({ templateId: 'ticket', sections: Object.fromEntries(sectionKeys.map(key => [key, true])) });
const parts = () => Object.fromEntries(['cover', 'greeting', ...sectionKeys, 'date', 'ending'].map(key => [key, `<section data-original="${key}">${key}</section>`]));

test('full ticket keeps the existing stamp cover and shared gallery controls without nesting an article', () => {
  const content = parts();
  content.cover = paperCover('ticket');
  content.gallery = '<section data-section="gallery"><button data-action="photo" data-index="2">photo</button></section>';
  const html = renderSignatureTicket(selection(), content);
  assert.ok(html.includes(content.cover));
  assert.ok(html.includes(content.gallery));
  for (const key of ['greeting', 'story', 'date', 'accounts', 'guestbook', 'ending']) assert.ok(html.includes(content[key]));
  assert.match(html, /data-experience="ticket"/);
  assert.match(html, /data-experience-action="stamp"/);
  assert.doesNotMatch(html, /<article\b/);
  assert.ok(html.includes(PHOTOS[0].src));
  assert.ok(html.includes(PHOTOS[1].src));
  assert.match(html, /2030/);
});

test('disabled optional sections have no leftover RSVP or route controls', () => {
  const content = parts();
  const options = selection();
  for (const key of sectionKeys) options.sections[key] = false;
  const html = renderSignatureTicket(options, content);
  assert.doesNotMatch(html, /data-ticket-action|data-ticket-map|data-section="rsvp"/);
  for (const key of sectionKeys) assert.ok(!html.includes(content[key]));
  for (const key of ['cover', 'greeting', 'date', 'ending']) assert.ok(html.includes(content[key]));
  assert.match(html, /THE WEDDING ITINERARY/);
  const empty = parts(); empty.rsvp = ''; empty.directions = '';
  assert.doesNotMatch(renderSignatureTicket(selection(), empty), /data-ticket-action|data-ticket-map/);
});

test('RSVP explicitly uses a fixed fictional guest and cannot accept contact information', () => {
  const html = renderSignatureTicket(selection(), parts());
  assert.match(html, /게스트 하루/);
  assert.match(html, /실제 참석 응답을 수집하거나 저장하지 않아요/);
  assert.match(html, /전송·저장되지 않았어요/);
  assert.doesNotMatch(html, /<(?:input|textarea|form)\b|contenteditable|\baction="https?:/);
  assert.equal((html.match(/data-ticket-action="transport"/g) || []).length, 3);
  assert.match(html, /role="group" aria-label="예시 교통수단 선택"/);
});

class Element {
  constructor(tag = 'div', dataset = {}, children = []) {
    Object.assign(this, { tagName: tag.toUpperCase(), dataset, children, parentElement: null, attributes: {}, listeners: new Map(), textContent: '', hidden: false, isConnected: true, disabled: false });
    children.forEach(child => { child.parentElement = this; });
  }
  matches(selector) {
    const [, tag, attr] = selector.match(/^(\w+)?\[data-([\w-]+)\]$/) || [];
    const key = attr?.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return Boolean(key && (!tag || tag.toUpperCase() === this.tagName) && Object.hasOwn(this.dataset, key));
  }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(listener); }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  click(target) { for (const listener of this.listeners.get('click') || []) listener({ target }); }
}

function fixture({ rsvp = true } = {}) {
  const controls = {};
  for (const [action, values] of Object.entries({ transport: ['rail', 'shuttle', 'car'], ...(rsvp ? { attendance: ['attend', 'absent'], company: ['solo', 'plus-one'], confirm: [''], reset: [''] } : {}) })) {
    for (const value of values) controls[`${action}:${value}`] = new Element('button', { ticketAction: action, ticketValue: value }, [new Element('span')]);
  }
  const nodes = Object.fromEntries(['ticketMap', 'ticketRoutePath', 'ticketMapStart', 'ticketRouteMode', 'ticketRouteTime', 'ticketRouteTitle', 'ticketRouteDetail', ...(rsvp ? ['ticketChoiceHelp', 'ticketResult', 'ticketConfirmationMessage', 'ticketRsvpStatus'] : [])].map(key => [key, new Element('div', { [key]: '' })]));
  const root = new Element('div', { ticketSignature: '' }, [...Object.values(controls), ...Object.values(nodes)]);
  const container = new Element('main', {}, [root]);
  return { container, root, controls, nodes, press: name => container.click(controls[name]) };
}

test('all three native transport buttons change the route, duration and accessible description', () => {
  const controller = createTicketSignature(), view = fixture();
  controller.mount(view.container);
  const railPath = view.nodes.ticketRoutePath.getAttribute('d');
  assert.equal(view.controls['transport:rail'].getAttribute('aria-pressed'), 'true');
  assert.equal(view.nodes.ticketRouteTime.textContent, '도보 약 5분');
  view.container.click(view.controls['transport:shuttle'].children[0]);
  const shuttlePath = view.nodes.ticketRoutePath.getAttribute('d');
  assert.notEqual(shuttlePath, railPath);
  assert.equal(view.nodes.ticketRouteTime.textContent, '탑승 약 10분');
  assert.match(view.nodes.ticketMap.getAttribute('aria-label'), /셔틀/);
  view.press('transport:car');
  assert.notEqual(view.nodes.ticketRoutePath.getAttribute('d'), shuttlePath);
  assert.equal(view.nodes.ticketRouteTime.textContent, '주차 후 약 3분');
  assert.equal(view.nodes.ticketMapStart.textContent, '주차장 입구');
  assert.equal(view.controls['transport:shuttle'].getAttribute('aria-pressed'), 'false');
  assert.match(view.nodes.ticketRouteDetail.textContent, /실제 혜택은 아닙니다/);
  view.press('transport:rail');
  assert.equal(view.nodes.ticketRoutePath.getAttribute('d'), railPath);
  controller.dispose();
});

test('preview reply reflects attendance and companions and invalidates an earlier ticket on changes', () => {
  const controller = createTicketSignature(), view = fixture();
  controller.mount(view.container);
  assert.equal(view.nodes.ticketResult.hidden, true);
  view.press('company:plus-one');
  assert.match(view.nodes.ticketChoiceHelp.textContent, /2명/);
  view.press('confirm:');
  assert.equal(view.nodes.ticketResult.hidden, false);
  assert.match(view.nodes.ticketConfirmationMessage.textContent, /동행 한 분/);
  assert.match(view.nodes.ticketRsvpStatus.textContent, /실제 응답은 전송하거나 저장하지 않았어요/);
  view.press('attendance:absent');
  assert.equal(view.nodes.ticketResult.hidden, true);
  assert.equal(view.nodes.ticketConfirmationMessage.textContent, '');
  assert.equal(view.controls['company:plus-one'].disabled, true);
  view.press('company:plus-one');
  view.press('confirm:');
  assert.match(view.nodes.ticketConfirmationMessage.textContent, /따뜻한 마음/);
  assert.doesNotMatch(view.nodes.ticketConfirmationMessage.textContent, /동행/);
  view.press('attendance:attend');
  assert.equal(view.controls['company:solo'].getAttribute('aria-pressed'), 'true');
  assert.equal(view.controls['company:plus-one'].disabled, false);
  view.press('confirm:');
  view.press('reset:');
  assert.equal(view.nodes.ticketResult.hidden, true);
  assert.equal(view.nodes.ticketRsvpStatus.textContent, '');
  controller.dispose();
});

test('remount preserves cosmetic choices and detaches earlier controls; dispose is idempotent', () => {
  const controller = createTicketSignature(), first = fixture();
  controller.mount(first.container);
  first.press('transport:car'); first.press('company:plus-one'); first.press('confirm:');
  const staleListener = [...first.container.listeners.get('click')][0];
  const replacement = fixture();
  controller.mount(replacement.container);
  assert.equal(first.container.listeners.get('click').size, 0);
  assert.equal(replacement.controls['transport:car'].getAttribute('aria-pressed'), 'true');
  assert.equal(replacement.nodes.ticketResult.hidden, false);
  staleListener({ target: first.controls['attendance:absent'] });
  assert.equal(replacement.controls['attendance:attend'].getAttribute('aria-pressed'), 'true');
  controller.dispose(); controller.dispose();
  assert.equal(replacement.container.listeners.get('click').size, 0);
  staleListener({ target: replacement.controls['transport:rail'] });
  assert.equal(replacement.controls['transport:car'].getAttribute('aria-pressed'), 'true');
  const fresh = createTicketSignature(); fresh.mount(replacement.container);
  assert.equal(replacement.nodes.ticketResult.hidden, true);
  assert.equal(replacement.controls['transport:rail'].getAttribute('aria-pressed'), 'true');
  fresh.dispose();
});

test('unknown, external, detached and disabled actions do not change the preview', () => {
  const controller = createTicketSignature(), view = fixture();
  controller.mount(view.root);
  const handler = [...view.root.listeners.get('click')][0];
  const external = new Element('button', { ticketAction: 'transport', ticketValue: 'car' });
  handler({ target: external });
  view.controls['transport:shuttle'].dataset.ticketValue = '__proto__';
  handler({ target: view.controls['transport:shuttle'] });
  view.controls['transport:car'].disabled = true;
  handler({ target: view.controls['transport:car'] });
  view.controls['transport:car'].disabled = false;
  view.root.isConnected = false;
  handler({ target: view.controls['transport:car'] });
  assert.equal(view.nodes.ticketRouteTime.textContent, '도보 약 5분');
  controller.dispose();
  const noReply = fixture({ rsvp: false });
  controller.mount(noReply.container); noReply.press('transport:car');
  assert.equal(noReply.nodes.ticketRouteTime.textContent, '주차 후 약 3분');
  controller.dispose();
});

test('ticket CSS keeps controls at least 44px and reduced motion immediate without a nested vertical scroller', async () => {
  const css = await readFile(new URL('../css/signature-ticket.css', import.meta.url), 'utf8');
  assert.match(css, /min-height:44px;min-width:44px/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css, /animation:none!important;transition:none!important/);
  assert.doesNotMatch(css, /overflow-y\s*:\s*(?:scroll|auto)|height\s*:\s*100(?:d|s|l)?vh/);
});
