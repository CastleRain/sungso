import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { weddingLettering } from '../js/wedding-lettering.mjs';
import { TEMPLATES } from '../js/catalog.mjs';
import { defaultSelection } from '../js/core.mjs';
import { cover, invitation } from '../js/templates.mjs';

test('cover lettering is decorative local vector artwork with one trigger and no interactive or external payload', () => {
  for (const variant of ['rose', 'photo', 'paper']) {
    const markup = weddingLettering({ variant });
    assert.match(markup, new RegExp(`class="wl-overlay wl-${variant}" aria-hidden="true"`));
    assert.equal((markup.match(/<svg /g) || []).length, 1);
    assert.equal((markup.match(/data-reference-intro-trigger/g) || []).length, 1);
    assert.match(markup, /focusable="false"/);
    assert.doesNotMatch(markup, /<(?:text|image|foreignObject|a|button|input|script)\b|\b(?:src|href|id|tabindex)=/i);
    assert.doesNotMatch(markup, /data-action|data-reference-key/);
  }
  assert.equal(weddingLettering({ variant: '"><script>bad</script>' }), weddingLettering({ variant: 'paper' }));
});

test('pen strokes follow the word and finish before the single overlay disappearance', () => {
  const markup = weddingLettering();
  const strokes = [...markup.matchAll(/data-lettering-stroke="([^"]+)"[^>]*--wl-start:([\d.]+)s;--wl-duration:([\d.]+)s/g)];
  assert.deepEqual(strokes.map(match => match[1]), ['w', 'e', 'd-first', 'd-second', 'i', 'i-dot', 'n', 'g', 'flourish']);
  let previous = -1;
  for (const [, , startValue, durationValue] of strokes) {
    const start = Number(startValue), duration = Number(durationValue);
    assert.ok(start > previous && duration > 0);
    assert.ok(start + duration < 3.6, 'the complete word remains visible before the 4.3 second exit');
    previous = start;
  }
  assert.equal((markup.match(/pathLength="100"/g) || []).length, strokes.length);
});

test('motion waits for the intro trigger, ends once, and immediately yields the cover for seen or reduced motion states', () => {
  const css = readFileSync(new URL('../css/wedding-lettering.css', import.meta.url), 'utf8');
  assert.match(css, /\[data-reference-intro\]\.ref-intro-play:not\(\.ref-intro-seen\) \.wl-overlay/);
  assert.match(css, /animation: wl-finish 4\.3s ease both/);
  assert.match(css, /100% \{ opacity: 0; \}/);
  assert.doesNotMatch(css, /infinite|animation-iteration-count\s*:\s*[2-9]|clip-path|@import|url\(/);
  assert.match(css, /pointer-events: none/);
  assert.match(css, /\[data-reference-motion="off"\] \.wl-overlay/);
  assert.match(css, /\[data-reference-motion="reduced"\] \.wl-overlay/);
  assert.match(css, /\.ref-intro-seen \.wl-overlay/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /opacity: 0 !important; animation: none !important/);
});

test('four intended designs include exactly one matching lettering overlay in the full cover and none in thumbnails', () => {
  const variants = { 'guest-jeju': 'rose', 'guest-porto': 'photo', 'guest-seoul': 'paper', 'salon-polaroid': 'paper' };
  for (const [id, variant] of Object.entries(variants)) {
    const fullCover = cover(id);
    assert.equal(fullCover.split(weddingLettering({ variant })).length - 1, 1, `${id}: one matching overlay`);
    assert.equal((fullCover.match(/class="wl-word"/g) || []).length, 1);
    assert.equal((fullCover.match(/data-reference-intro-trigger/g) || []).length, 1);
    assert.equal((fullCover.match(/data-reference-intro(?:\s|>)/g) || []).length, 1);
    assert.equal((fullCover.match(new RegExp(`data-reference-key="${id}-cover"`, 'g')) || []).length, 1, 'existing cover memory remains the owner');
    assert.doesNotMatch(cover(id, true), /wl-overlay|wl-word|data-lettering-stroke/);
    const initial = defaultSelection(id);
    for (const palette of TEMPLATES.find(template => template.id === id).palettes) {
      for (const sections of [initial.sections, Object.fromEntries(Object.keys(initial.sections).map(key => [key, false]))]) {
        const body = invitation({ ...initial, paletteId: palette.id, sections });
        assert.equal((body.match(/class="wl-overlay /g) || []).length, 1, `${id}: changes retain a single cover introduction`);
        assert.equal((body.match(/class="wl-word"/g) || []).length, 1);
        assert.equal((body.match(/data-reference-intro-trigger/g) || []).length, 1);
      }
    }
  }
});

test('existing salon introductions and every other design remain free of a second Wedding overlay', () => {
  const newLettering = new Set(['guest-jeju', 'guest-porto', 'guest-seoul', 'salon-polaroid']);
  for (const template of TEMPLATES.filter(template => !newLettering.has(template.id))) {
    assert.doesNotMatch(cover(template.id), /wl-overlay|wl-word|data-lettering-stroke/, template.id);
    assert.doesNotMatch(invitation(defaultSelection(template.id)), /wl-overlay|wl-word|data-lettering-stroke/, template.id);
  }
  for (const [id, marker] of [['salon-lettering', 'rs-writing'], ['salon-editorial', 'rs-opening']]) {
    const full = invitation(defaultSelection(id));
    assert.match(full, new RegExp(marker));
    assert.equal((full.match(/data-reference-intro-trigger/g) || []).length, 1, `${id}: its original introduction has one trigger`);
    assert.equal((full.match(/data-reference-intro(?:\s|>)/g) || []).length, 1);
  }
});
