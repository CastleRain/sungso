import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { appearanceChoices, mountAppearance } from '../js/appearance.mjs';

const keys = ['textSize', 'lineSpace', 'photoTone', 'coverFocus'];
const original = Object.fromEntries(keys.map(key => [key, 'original']));
const reading = value => Object.fromEntries(keys.map(key => [key, appearanceChoices(value)[key]]));

function fixture({ dataset = {}, fontLoad = () => Promise.resolve([]) } = {}) {
  const properties = new Map(), priorities = new Map(), timers = new Map();
  let timer = 0, layouts = 0, loads = 0;
  const audio = { currentTime: 82.5, paused: true };
  const input = { value: '작성 중인 축하 메시지', selectionStart: 8, selectionEnd: 8 };
  const image = { src: '/photo.webp', naturalWidth: 1440 };
  const body = {
    dataset: { ...dataset }, audio, input, image,
    style: {
      setProperty(key, value, priority = '') { properties.set(key, value); priorities.set(key, priority); },
      getPropertyValue: key => properties.get(key) || '',
      getPropertyPriority: key => priorities.get(key) || '',
      removeProperty(key) { properties.delete(key); priorities.delete(key); },
    },
    replaceChildren() { throw new Error('Appearance must not remount media or forms'); },
  };
  return {
    doc: { body, fonts: { load(...args) { loads++; return fontLoad(...args); } } },
    win: { setTimeout(fn) { const id = ++timer; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); } },
    timers, audio, input, image, onLayout: () => layouts++,
    get layouts() { return layouts; }, get loads() { return loads; },
  };
}

test('old combinations retain original reading and photographs; hostile values cannot become style values', () => {
  for (const value of [undefined, null, {}, { textSize: '__proto__', lineSpace: 'constructor', photoTone: 'url(remote)', coverFocus: ['upper'] }]) {
    assert.deepEqual(reading(value), original);
  }
  for (const textSize of ['original', 'comfortable', 'large']) {
    for (const lineSpace of ['original', 'relaxed']) {
      for (const photoTone of ['original', 'soft', 'mono']) {
        for (const coverFocus of ['original', 'upper', 'lower']) {
          const choice = { textSize, lineSpace, photoTone, coverFocus };
          assert.deepEqual(reading(choice), choice);
        }
      }
    }
  }
});

test('all added datasets restore exactly, including preexisting values; media and unfinished input stay intact', async () => {
  const env = fixture({ dataset: { textSize: 'previous-size', photoTone: 'previous-tone', unrelated: 'keep' } });
  const before = { ...env.doc.body.dataset };
  env.doc.body.style.setProperty('--ink', 'previous-ink', 'important');
  const controller = mountAppearance({ ...env, composition: {} });
  await controller.whenReady;
  const body = env.doc.body;
  await controller.setComposition({ textSize: 'large', lineSpace: 'relaxed', photoTone: 'mono', coverFocus: 'lower' });
  assert.equal(env.doc.body, body);
  for (const key of keys) assert.equal(body.dataset[key], { textSize: 'large', lineSpace: 'relaxed', photoTone: 'mono', coverFocus: 'lower' }[key]);
  assert.equal(body.audio, env.audio); assert.deepEqual(env.audio, { currentTime: 82.5, paused: true });
  assert.equal(body.input, env.input); assert.equal(env.input.value, '작성 중인 축하 메시지'); assert.equal(env.input.selectionStart, 8);
  assert.equal(body.image, env.image); assert.equal(env.image.src, '/photo.webp');
  controller.destroy(); controller.destroy();
  assert.deepEqual(body.dataset, before);
  assert.equal(body.style.getPropertyValue('--ink'), 'previous-ink');
  assert.equal(body.style.getPropertyPriority('--ink'), 'important');
  assert.equal(await controller.setComposition({ textSize: 'comfortable' }), false);
  assert.deepEqual(body.dataset, before);
});

test('only text geometry invalidates scene measurements; tone/focal updates never reload a font', async () => {
  const env = fixture(), controller = mountAppearance({ ...env, composition: {} });
  await controller.whenReady;
  const first = env.layouts;
  await controller.setComposition({ textSize: 'comfortable' });
  assert.equal(env.layouts, first + 1);
  await controller.setComposition({ textSize: 'comfortable', lineSpace: 'relaxed' });
  assert.equal(env.layouts, first + 2);
  await controller.setComposition({ textSize: 'comfortable', lineSpace: 'relaxed', photoTone: 'soft', coverFocus: 'upper' });
  assert.equal(env.layouts, first + 2);
  await controller.setComposition({ textSize: 'comfortable', lineSpace: 'relaxed', photoTone: 'mono', coverFocus: 'lower' });
  assert.equal(env.layouts, first + 2);
  assert.equal(env.loads, 2);
  await controller.setComposition({});
  assert.equal(env.layouts, first + 3, 'returning to the old geometry is also measured');
  await controller.setComposition({});
  assert.equal(env.layouts, first + 3, 'identical selections are inert');
  assert.deepEqual(reading(env.doc.body.dataset), original);
  controller.destroy();
});

test('guest readability toggle preserves the saved text size and restores it when turned off', async () => {
  const app = await readFile(new URL('../js/app.mjs', import.meta.url), 'utf8');
  const from = app.indexOf('function setTextSize(large) {');
  const to = app.indexOf('\nsetTextSize(readPreference(', from);
  assert.ok(from >= 0 && to > from, 'execute the shipped guest toggle');
  const env = fixture(), classes = new Set(), preferences = [], controls = new Map();
  const controller = mountAppearance({ ...env, composition: { textSize: 'comfortable' } });
  await controller.whenReady;
  env.doc.documentElement = { classList: { toggle(name, value) { value ? classes.add(name) : classes.delete(name); } } };
  env.doc.dispatchEvent = () => {};
  const context = vm.createContext({
    document: env.doc, themeController: controller, Event: class {},
    requestAnimationFrame: callback => callback(),
    savePreference: (key, value) => preferences.push([key, value]),
    $: selector => {
      if (!controls.has(selector)) controls.set(selector, { setAttribute(name, value) { this[name] = value; }, textContent: '' });
      return controls.get(selector);
    },
  });
  vm.runInContext(app.slice(from, to), context);
  for (const size of ['original', 'comfortable', 'large']) {
    await controller.setComposition({ textSize: size });
    const before = { ...env.doc.body.dataset };
    vm.runInContext('setTextSize(true)', context);
    assert.equal(classes.has('large-text'), true);
    assert.deepEqual(env.doc.body.dataset, before);
    assert.equal(controls.get('#text-size-toggle')['aria-pressed'], 'true');
    vm.runInContext('setTextSize(false)', context);
    assert.equal(classes.has('large-text'), false);
    assert.deepEqual(env.doc.body.dataset, before);
    assert.equal(controls.get('#text-size-toggle')['aria-pressed'], 'false');
  }
  vm.runInContext('setTextSize(true)', context);
  await controller.setComposition({ textSize: 'comfortable' });
  assert.equal(classes.has('large-text'), true, 'a new combination must not clear explicit guest readability');
  vm.runInContext('setTextSize(false)', context);
  assert.equal(env.doc.body.dataset.textSize, 'comfortable');
  assert.deepEqual(preferences.at(-1), ['sungso_invitation_studio_text_size', 'normal']);
  assert.deepEqual(env.audio, { currentTime: 82.5, paused: true });
  assert.equal(env.input.value, '작성 중인 축하 메시지');
  controller.destroy();
});

test('late font completion measures the latest reading settings and disposed work cannot refresh a scene', async () => {
  const resolves = [];
  const env = fixture({ fontLoad: () => new Promise(resolve => resolves.push(resolve)) });
  const controller = mountAppearance({ ...env, composition: { font: 'modern' } });
  const initialReady = controller.whenReady;
  controller.setComposition({ font: 'modern', textSize: 'large', lineSpace: 'relaxed' });
  assert.equal(env.layouts, 1);
  assert.equal(controller.whenReady, initialReady);
  resolves[0]([]); resolves[1]([]); await initialReady;
  assert.equal(env.layouts, 2);
  assert.equal(env.doc.body.dataset.textSize, 'large');
  controller.setComposition({ font: 'editorial', textSize: 'large', lineSpace: 'relaxed' });
  const pending = controller.whenReady;
  controller.destroy();
  assert.equal(await pending, false);
  resolves[2]([]); resolves[3]([]); await Promise.resolve(); await Promise.resolve();
  assert.equal(env.layouts, 2);
  assert.equal(env.timers.size, 0);
});

test('style boundaries keep new defaults inert and image filters separate from motion, maps and lettering', async () => {
  const css = await readFile(new URL('../css/appearance.css', import.meta.url), 'utf8');
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(match => ({ selector: match[1].trim(), declarations: match[2] }));
  const newerRules = rules.filter(rule => /data-(text-size|line-space|photo-tone|cover-focus)/.test(rule.selector));
  assert.ok(newerRules.length > 10);
  for (const rule of newerRules) {
    assert.doesNotMatch(rule.selector, /\[data-(?:text-size|line-space|photo-tone|cover-focus)=original\](?!\))/,
      'original options must not override the base layout or original filters');
    assert.doesNotMatch(rule.selector, /hero-handwriting|ink-trace|ink-seal|experience-dock|sound-dock/,
      'appearance controls do not resize handwriting or fixed controls');
  }
  const imageRules = rules.filter(rule => /filter:var\(--invitation-photo-filter\)/.test(rule.declarations));
  assert.equal(imageRules.length, 2);
  for (const rule of imageRules) {
    assert.doesNotMatch(rule.selector, /global-scroll-target|\.reveal|map-frame|map-apps|svg|card-preview|qr-/);
    assert.doesNotMatch(rule.declarations, /transform:|opacity:|clip-path:|animation:/);
  }
  assert.match(imageRules[0].selector, /#photo-full/);
  assert.match(imageRules[0].selector, /\.hero-photo>img/);
  assert.match(imageRules[0].selector, /img\[data-invitation-photo\]/);
  assert.match(imageRules[1].declarations, /brightness\(1\.04\)/, 'hover composes with, rather than replaces, mono/soft');
  assert.match(css, /body\[data-cover-focus=upper\] \.hero-photo>img\{object-position:50% 25%\}/);
  assert.match(css, /body\[data-cover-focus=lower\] \.hero-photo>img\{object-position:50% 70%\}/);
});

test('reading styles retain narrow-layout escape routes and authored line breaks', async () => {
  const css = await readFile(new URL('../css/appearance.css', import.meta.url), 'utf8');
  const readingCss = css.slice(css.indexOf('/* Reading controls'));
  assert.match(readingCss, /@media\(max-width:480px\)[\s\S]*\.date-ticket\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(readingCss, /\.date-detail\{width:100%;max-width:330px/);
  assert.match(readingCss, /\.quick-nav>a\{flex:1 1 calc\(50% - 8px\);min-width:0/);
  assert.match(readingCss, /\.recipient-picker[\s\S]*flex-wrap:wrap/);
  assert.match(readingCss, /\.account-number\{min-width:0;overflow-wrap:anywhere\}/);
  assert.match(readingCss, /html\.large-text body\[data-text-size\]/, 'explicit guest readability remains stronger than a saved mood');
  assert.match(readingCss, /body\[data-font\]\[data-text-size\]:not\(\[data-text-size=original\]\) \.invitation-copy\{font-size:max\(18px,calc\(var\(--reading-body-size\) \+ 1px\)\);overflow-wrap:anywhere\}/,
    'comfortable must not shrink the existing 18px letter invitation; large adds a step');
  assert.doesNotMatch(readingCss, /:is\([^{}]*\.invitation-copy[^{}]*\)\{\s*font-size:var\(--reading-body-size\)/,
    'a grouped paragraph selector must not override the invitation size through :is specificity');
  const relaxedRules = [...readingCss.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]*data-line-space=relaxed[^{}]*)\{([^{}]*)\}/g)];
  assert.ok(relaxedRules.length >= 2);
  for (const rule of relaxedRules) {
    assert.doesNotMatch(rule[2], /(?:^|;)\s*(?:white-space|display|height):/);
    assert.doesNotMatch(rule[1], /textarea|input/, 'ruled composer line geometry stays separate');
  }
  // These are stylesheet boundary checks. Real 320px browser measurements are
  // performed by the integration reviewer, not inferred from these assertions.
});

