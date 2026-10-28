import test from 'node:test';
import assert from 'node:assert/strict';
import { APPEARANCE_PALETTES, appearanceChoices, mountAppearance } from '../js/appearance.mjs';

function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + .05) / (values[1] + .05);
}
function fixture(load = () => Promise.resolve([])) {
  const values = new Map(), timers = new Map(); let timerId = 0, layouts = 0;
  const body = { dataset: {}, style: { setProperty: (key, value) => values.set(key, value), getPropertyValue: key => values.get(key) || '', getPropertyPriority: () => '', removeProperty: key => values.delete(key) } };
  const doc = { body, fonts: { load } };
  const win = { setTimeout: fn => { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id) };
  return { doc, win, values, timers, onLayout: () => layouts++, get layouts() { return layouts; } };
}

test('palette body, accent and muted text remains readable on all invitation papers', () => {
  for (const [name, palette] of Object.entries(APPEARANCE_PALETTES)) {
    for (const foreground of ['ink', 'accent', 'muted']) {
      for (const background of ['paper', 'soft', 'surface']) {
        assert.ok(contrast(palette[foreground], palette[background]) >= 4.5, `${name} ${foreground}/${background}: ${contrast(palette[foreground], palette[background]).toFixed(2)}`);
      }
    }
    // Tint is the decorative envelope flap; its overlaid lettering uses accent, not muted.
    assert.ok(contrast(palette.accent, palette.tint) >= 4.5, `${name} flap lettering`);
    assert.ok(contrast(palette.paper, palette.night) >= 7, `${name} inverse story`);
  }
});

test('legacy and hostile appearance choices fall back to the original mood', () => {
  for (const value of [null, undefined, {}, { palette: '__proto__', font: 'constructor' }, { palette: 'https://outside.test', font: 'url(remote)' }]) assert.deepEqual(appearanceChoices(value), { palette: 'mist', font: 'letter' });
  assert.deepEqual(appearanceChoices({ palette: 'rose', font: 'modern', endpoint: 'outside' }), { palette: 'rose', font: 'modern' });
});

test('appearance changes do not replace content; old style data is restored on disposal', async () => {
  const env = fixture(); env.doc.body.dataset.palette = 'previous'; env.values.set('--ink', 'old-ink');
  const controller = mountAppearance({ ...env, composition: { palette: 'mist', font: 'letter' } });
  await controller.whenReady;
  assert.equal(env.values.get('--paper'), '#fcfdfd');
  const body = env.doc.body;
  await controller.setComposition({ palette: 'rose', font: 'editorial' });
  assert.equal(env.doc.body, body); assert.equal(body.dataset.font, 'editorial');
  assert.equal(env.values.get('--accent'), APPEARANCE_PALETTES.rose.accent);
  controller.destroy(); assert.equal(body.dataset.palette, 'previous'); assert.equal(body.dataset.font, undefined);
  assert.equal(env.values.get('--ink'), 'old-ink'); assert.equal(env.values.has('--accent'), false);
});

test('stale font completion cannot refresh a newer choice and current font failures settle safely', async () => {
  const resolvers = [], env = fixture(() => new Promise(resolve => resolvers.push(resolve)));
  const controller = mountAppearance({ ...env, composition: { font: 'editorial' } });
  const original = controller.whenReady;
  controller.setComposition({ font: 'modern' }); const modern = controller.whenReady;
  resolvers[0]([]); resolvers[1]([]); await original; assert.equal(env.layouts, 0);
  resolvers[2]([]); resolvers[3]([]); await modern; assert.equal(env.layouts, 1);
  controller.destroy();
  const failed = fixture(() => Promise.reject(new Error('offline')));
  const failedController = mountAppearance({ ...failed, composition: { font: 'modern' } });
  assert.equal(await failedController.whenReady, false); assert.equal(failed.doc.body.dataset.font, 'modern');
  failedController.destroy();
});

test('a slow font cannot block scene preview indefinitely and disposal releases outstanding waits', async () => {
  const env = fixture(() => new Promise(() => {}));
  const controller = mountAppearance({ ...env, composition: { font: 'modern' } });
  const pending = controller.whenReady;
  [...env.timers.values()][0](); assert.equal(await pending, false); assert.equal(env.timers.size, 0);
  controller.setComposition({ font: 'editorial' }); const second = controller.whenReady;
  controller.destroy(); assert.equal(await second, false); assert.equal(env.timers.size, 0);
});
