import test from 'node:test';
import assert from 'node:assert/strict';
import { SENTIMENT_CHOICES, SENTIMENT_COPY_META, SENTIMENT_SECTION_IDS, sentimentChoices, mountSentimentScenes } from '../js/sentiment-scenes.mjs';

function fixture() {
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.attributes = {}; this.hidden = false; this.textContent = ''; this.className = ''; }
    append(...nodes) { for (const node of nodes) { node.remove(); node.parentNode = this; this.children.push(node); } }
    insertBefore(node, before) { node.remove(); node.parentNode = this; const index = this.children.indexOf(before); if (index < 0) this.children.push(node); else this.children.splice(index, 0, node); }
    remove() { if (this.parentNode) { const list = this.parentNode.children; list.splice(list.indexOf(this), 1); this.parentNode = null; } }
    setAttribute(key, value) { this.attributes[key] = value; }
    getAttribute(key) { return this.attributes[key] ?? null; }
    querySelectorAll(selector) {
      const matches = node => selector === 'a' ? node.tagName === 'a' : selector === '.closing-section' ? node.className.split(' ').includes('closing-section') : false;
      return this.children.flatMap(node => [...(matches(node) ? [node] : []), ...node.querySelectorAll(selector)]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  }
  const main = new Element('main'), hero = new Element('section'), existing = new Element('section'), tail = new Element('section'), nav = new Element('nav');
  main.className = 'paper'; hero.id = 'hero'; existing.id = 'guestbook'; existing.draft = '작성 중인 축하 메시지'; tail.className = 'section closing-section';
  main.append(hero, existing, tail);
  const existingLink = new Element('a'); existingLink.textContent = '축하 메시지'; existingLink.setAttribute('href', '#guestbook'); nav.append(existingLink);
  const doc = {
    createElement(tag) { assert.ok(!['script', 'iframe', 'audio', 'form'].includes(tag)); return new Element(tag); },
    querySelector(selector) { return selector === 'main.paper' ? main : selector === '.quick-nav' ? nav : null; },
    getElementById(id) { const visit = node => node.id === id ? node : node.children.map(visit).find(Boolean); return visit(main) || visit(nav) || null; },
  };
  return { doc, win: {}, main, hero, existing, tail, nav, existingLink, Element };
}
function allText(node) { return [node.textContent, ...node.children.map(allText)].join(' '); }

test('only known sentiment styles are accepted and missing composition has stable defaults', () => {
  const expected = { promiseStyle: 'lines', noteStyle: 'conversation', thanksStyle: 'letter' };
  for (const input of [null, undefined, {}, { promiseStyle: '__proto__', noteStyle: 'constructor', thanksStyle: 'url(remote)' }, { promiseStyle: ['paired'], noteStyle: 1 }]) assert.deepEqual(sentimentChoices(input), expected);
  assert.deepEqual(sentimentChoices({ promiseStyle: 'paired', noteStyle: 'pages', thanksStyle: 'signature', endpoint: 'outside' }), { promiseStyle: 'paired', noteStyle: 'pages', thanksStyle: 'signature' });
});

test('three persistent scenes and corresponding menu links start hidden and mount before the ending', () => {
  const env = fixture(), controller = mountSentimentScenes(env);
  assert.deepEqual(env.main.children.map(node => node.id || 'ending'), ['hero', 'guestbook', ...SENTIMENT_SECTION_IDS, 'ending']);
  for (const id of SENTIMENT_SECTION_IDS) {
    const section = env.doc.getElementById(id), link = env.nav.children.find(node => node.dataset.optionalNav === id);
    assert.equal(section.hidden, true); assert.equal(link.hidden, true);
    assert.equal(section.getAttribute('aria-labelledby'), `${id}-title`);
    assert.ok(env.doc.getElementById(`${id}-title`));
    assert.equal(link.getAttribute('href'), `#${id}`); assert.equal(link.dataset.jump, '');
  }
  controller.destroy();
  assert.deepEqual(env.main.children, [env.hero, env.existing, env.tail]); assert.deepEqual(env.nav.children, [env.existingLink]);
});

test('all layout combinations retain the same sections, reading content and surrounding draft', () => {
  const env = fixture(), controller = mountSentimentScenes(env);
  const originals = SENTIMENT_SECTION_IDS.map(id => env.doc.getElementById(id));
  const contents = originals.map(node => node.children[0]);
  const originalMenu = [...env.nav.children];
  for (const promiseStyle of SENTIMENT_CHOICES.promiseStyle) for (const noteStyle of SENTIMENT_CHOICES.noteStyle) for (const thanksStyle of SENTIMENT_CHOICES.thanksStyle) {
    controller.setComposition({ extras: [...SENTIMENT_SECTION_IDS, 'unknown'], promiseStyle, noteStyle, thanksStyle });
    originals.forEach((node, index) => { assert.equal(env.doc.getElementById(node.id), node); assert.equal(node.children[0], contents[index]); assert.equal(node.hidden, false); });
    assert.deepEqual(originals.map(node => node.dataset.optionalLayout), [promiseStyle, noteStyle, thanksStyle]);
    assert.deepEqual(env.nav.children, originalMenu); assert.ok(originalMenu.every(node => !node.hidden));
    assert.equal(env.existing.draft, '작성 중인 축하 메시지');
  }
  controller.setComposition({ extras: ['couple-notes'] });
  assert.deepEqual(originals.map(node => node.hidden), [true, false, true]);
  assert.deepEqual(originalMenu.slice(1).map(node => node.hidden), [true, false, true]);
  controller.setComposition({ extras: 'promises' }); assert.ok(originals.every(node => node.hidden));
  controller.destroy(); controller.destroy(); controller.setComposition({ extras: SENTIMENT_SECTION_IDS });
  assert.deepEqual(env.main.children, [env.hero, env.existing, env.tail]);
});

test('pre-existing owned-by-another-controller nodes and states survive teardown', () => {
  const env = fixture(), section = new env.Element('section'), link = new env.Element('a');
  section.id = 'promises'; section.hidden = false; section.dataset.optionalLayout = 'custom'; section.textContent = '기존 약속';
  link.dataset.optionalNav = 'promises'; link.hidden = false;
  env.main.insertBefore(section, env.tail); env.nav.append(link);
  const controller = mountSentimentScenes({ ...env, composition: {} });
  assert.equal(section.hidden, true); assert.equal(link.hidden, true);
  controller.destroy();
  assert.equal(env.doc.getElementById('promises'), section); assert.equal(section.dataset.optionalLayout, 'custom');
  assert.equal(section.hidden, false); assert.equal(link.hidden, false); assert.equal(section.textContent, '기존 약속');
  assert.equal(env.doc.getElementById('couple-notes'), null);
});

test('proposed copy is identified for the editor and names remain text, never executable markup', () => {
  assert.equal(SENTIMENT_COPY_META.promises.source, 'suggested'); assert.equal(SENTIMENT_COPY_META['thank-you'].source, 'suggested');
  assert.equal(SENTIMENT_COPY_META['couple-notes'].source, 'paraphrase');
  const env = fixture(), groom = '<img src=x onerror=alert(1)>', controller = mountSentimentScenes({ ...env, wedding: { groom, bride: '소희' } });
  const thanks = allText(env.doc.getElementById('thank-you'));
  assert.ok(thanks.includes(groom)); assert.ok(thanks.includes('소희'));
  const notes = allText(env.doc.getElementById('couple-notes'));
  assert.ok(notes.includes('카페를 꾸려 가는 모습을 보며'));
  assert.ok(notes.includes('함께라면 무엇이든 해 볼 수 있겠다는 믿음'));
  assert.ok(!notes.includes('처음 만난')); assert.ok(!notes.includes('소희의 답변'));
  controller.destroy();
});
