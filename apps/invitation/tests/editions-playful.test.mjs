import test from 'node:test';
import assert from 'node:assert/strict';
import { playfulCover, playfulBody, createPlayfulEditions } from '../js/editions-playful.mjs';

const ids = ['greenhouse', 'scrapbook', 'festival', 'promenade'];
const optional = ['story', 'gallery', 'directions', 'accounts', 'rsvp', 'guestbook'];
function fixtureParts(id, sections = {}, layout = 'grid') {
  const parts = Object.fromEntries(['greeting', 'date', 'ending', ...optional].map(key => [key, key === 'ending' ? '<footer>ending</footer>' : `<section data-section="${key}">${key}</section>`]));
  parts.cover = playfulCover(id);
  parts.gallery = `<section data-section="gallery"><div class="photo-gallery gallery-${layout}"><button type="button" data-action="photo" data-index="0">photo</button></div></section>`;
  for (const key of optional) if (sections[key] === false) parts[key] = '';
  return parts;
}

test('four full editions always expose the example ceremony independently of their interactions', () => {
  const bodies = ids.map(templateId => playfulBody({ templateId, sections: {} }, fixtureParts(templateId)));
  assert.equal(new Set(bodies).size, 4);
  for (const [index, html] of bodies.entries()) {
    assert.match(html, /2030년 5월 18일/);
    assert.match(html, /오후 2시/);
    assert.match(html, /우리의 웨딩홀/);
    assert.match(html, /data-section="greeting"/);
    assert.match(html, /data-section="date"/);
    assert.match(html, /invitation-ending/);
    for (const key of optional) assert.equal((html.match(new RegExp(`data-section="${key}"`, 'g')) || []).length, 1, `${ids[index]} ${key}`);
    // Opening the invitation never requires completing a decorative interaction.
    assert.match(html, /<section[^>]*data-section="date"[^>]*>/);
    assert.doesNotMatch(html, /<section[^>]*(?:hidden[^>]*data-section="date"|data-section="date"[^>]*hidden)[^>]*>/);
    assert.doesNotMatch(html, /<form|<input|<textarea|data-action="(?:save|submit)"/);
  }
  assert.equal(playfulBody({ templateId: 'minimal' }, {}), '');
  assert.equal(playfulCover('not-a-design'), '');
});

test('explicit section choices remove each optional module and retain actual gallery layout and modal controls', () => {
  for (const templateId of ids) {
    for (const disabled of optional) {
      const html = playfulBody({ templateId, sections: { [disabled]: false } }, fixtureParts(templateId));
      assert.ok(!html.includes(`data-section="${disabled}"`), `${templateId} explicitly disables ${disabled}`);
      const omitted = fixtureParts(templateId); omitted[disabled] = '';
      assert.ok(!playfulBody({ templateId, sections: {} }, omitted).includes(`data-section="${disabled}"`));
    }
    for (const galleryLayout of ['grid', 'slide', 'filmstrip']) {
      const html = playfulBody({ templateId, galleryLayout, sections: {} }, fixtureParts(templateId, {}, galleryLayout));
      assert.match(html, new RegExp(`photo-gallery gallery-${galleryLayout}`));
      assert.match(html, /data-action="photo" data-index="0"/);
    }
    const off = Object.fromEntries(optional.map(key => [key, false]));
    const html = playfulBody({ templateId, sections: off }, fixtureParts(templateId, off));
    assert.match(html, /data-section="date"/);
    assert.match(html, /data-section="greeting"/);
    assert.doesNotMatch(html, /data-section="(?:story|gallery|directions|accounts|rsvp|guestbook)"/);
  }
});

test('thumbnails retain composition without interactive controls or selection content', () => {
  for (const templateId of ids) {
    const thumbnail = playfulCover(templateId, true);
    assert.match(thumbnail, /pe-thumbnail/);
    assert.match(thumbnail, /2030/);
    assert.match(thumbnail, /loading="lazy"/);
    assert.doesNotMatch(thumbnail, /<button|data-playful-action|fetchpriority/);
    const html = playfulBody({ templateId, sections: {}, note: '<script>private note</script>', guestName: 'PRIVATE GUEST' }, fixtureParts(templateId));
    assert.doesNotMatch(html, /private note|PRIVATE GUEST|<script/);
  }
});

class Element {
  constructor(tag = 'div', dataset = {}, children = []) {
    Object.assign(this, { tagName: tag.toUpperCase(), dataset, children, parentElement: null, attributes: {}, listeners: new Map(), hidden: false, textContent: '' });
    for (const child of children) child.parentElement = this;
  }
  matches(selector) {
    const [, tag, attr] = selector.match(/^(\w+)?\[data-([\w-]+)\]$/) || [];
    const key = attr?.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return !!key && (!tag || this.tagName === tag.toUpperCase()) && Object.hasOwn(this.dataset, key);
  }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(type, callback) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(callback); }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
  click(target) { for (const callback of this.listeners.get('click') || []) callback({ target }); }
}

function interactiveFixture(id, action, values, toggle = false) {
  const buttons = (toggle ? ['toggle'] : values).map(value => new Element('button', { playfulAction: action, playfulValue: value, playfulIdleLabel: '열기', playfulActiveLabel: '다시 접기' }, [new Element('span', { playfulButtonLabel: '' })]));
  const panels = values.map(value => new Element('div', { playfulPanel: action, playfulPanelValue: value }));
  const root = new Element('div', { playfulEdition: id }, [...buttons, ...panels]);
  return { container: new Element('main', {}, [root]), root, buttons, panels };
}

test('season, memory, program and route buttons switch panels and their accessible pressed state', () => {
  for (const [id, action, values] of [['greenhouse', 'season', ['spring', 'summer', 'autumn']], ['scrapbook', 'memory', ['first', 'ordinary', 'next']], ['festival', 'stage', ['welcome', 'vows', 'celebrate']], ['promenade', 'stop', ['start', 'bench', 'tomorrow']]]) {
    const controller = createPlayfulEditions(), view = interactiveFixture(id, action, values);
    controller.mount(view.container);
    assert.deepEqual(view.panels.map(panel => panel.hidden), [false, true, true]);
    view.container.click(view.buttons[2].children[0]);
    assert.equal(view.root.dataset[action], values[2]);
    assert.deepEqual(view.panels.map(panel => panel.hidden), [true, true, false]);
    assert.deepEqual(view.buttons.map(button => button.attributes['aria-pressed']), ['false', 'false', 'true']);
    const next = interactiveFixture(id, action, values);
    controller.mount(next.container);
    assert.equal(next.root.dataset[action], values[2]);
    assert.equal(view.container.listeners.get('click').size, 0);
    controller.dispose();
  }
});

test('flower, sticker, souvenir and sample replies can be replayed and restored after option rerender', () => {
  for (const [id, action] of [['greenhouse', 'bloom'], ['scrapbook', 'sticker'], ['festival', 'pass'], ['promenade', 'reply'], ['greenhouse', 'reply'], ['scrapbook', 'reply']]) {
    const controller = createPlayfulEditions(), view = interactiveFixture(id, action, ['off', 'on'], true);
    controller.mount(view.root);
    view.root.click(view.buttons[0]);
    assert.equal(view.root.dataset[action], 'on');
    assert.equal(view.buttons[0].attributes['aria-pressed'], 'true');
    assert.equal(view.buttons[0].children[0].textContent, '다시 접기');
    controller.mount(new Element());
    const next = interactiveFixture(id, action, ['off', 'on'], true); controller.mount(next.root);
    assert.equal(next.root.dataset[action], 'on');
    next.root.click(next.buttons[0]);
    assert.equal(next.root.dataset[action], 'off');
    assert.deepEqual(next.panels.map(panel => panel.hidden), [false, true]);
    assert.equal(next.buttons[0].children[0].textContent, '열기');
    controller.dispose(); controller.dispose();
    assert.equal(next.root.listeners.get('click').size, 0);
  }
});

test('stale listeners, disabled controls, invalid values and controls outside the mounted edition are inert', () => {
  const controller = createPlayfulEditions(), view = interactiveFixture('greenhouse', 'season', ['spring', 'summer', 'autumn']);
  controller.mount(view.container);
  const stale = [...view.container.listeners.get('click')][0];
  view.buttons[1].disabled = true; view.container.click(view.buttons[1]);
  for (const value of ['', '__proto__', 'winter', ' autumn', 'toggle']) { view.buttons[2].dataset.playfulValue = value; view.container.click(view.buttons[2]); }
  const foreign = interactiveFixture('greenhouse', 'season', ['spring', 'summer', 'autumn']);
  view.container.click(foreign.buttons[1]);
  assert.equal(view.root.dataset.season, 'spring');
  view.buttons[1].disabled = false; view.container.click(view.buttons[1]);
  assert.equal(view.root.dataset.season, 'summer');
  controller.dispose(); stale({ target: view.buttons[0] });
  controller.mount(foreign.root);
  assert.equal(foreign.root.dataset.season, 'summer');
  stale({ target: foreign.buttons[0] });
  assert.equal(foreign.root.dataset.season, 'summer');
  controller.dispose();
  const fresh = createPlayfulEditions(); fresh.mount(foreign.root);
  assert.equal(foreign.root.dataset.season, 'spring');
  fresh.dispose();
});
