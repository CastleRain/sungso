import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { TEMPLATES, SIGNATURES, PEOPLE, getTemplate } from '../js/catalog.mjs';
import { defaultSelection, normalizeDocument, escapeHtml } from '../js/core.mjs';
import { cover, themeAttributes, heart } from '../js/templates.mjs';

const require = createRequire(new URL('../../sohee/sales/package.json', import.meta.url));
const { JSDOM } = require('jsdom');
const source = await readFile(new URL('../js/app.mjs', import.meta.url), 'utf8');
const between = (start, end) => source.slice(source.indexOf('function ' + start + '('), source.indexOf('function ' + end + '('));
const markup = between('favoriteButton', 'fitPosters') + between('mobilePreviewLink', 'deviceToolbar') + between('profileSummary', 'profileGate');
const local = { actor: 'sungwoo', compare: [TEMPLATES[0].id] };
const shared = { data: normalizeDocument({ favorites: { sungwoo: [TEMPLATES[0].id], sohee: [TEMPLATES[1].id] }, selectionRevision: 4, selection: defaultSelection(TEMPLATES[0].id) }) };
const renderer = new Function('deps', `const { e, local, shared, SIGNATURES, PEOPLE, getTemplate, defaultSelection, cover, themeAttributes, heart, getCoverPhoto, contentDescription, countdownMarkup } = deps;\n${markup}\nreturn { card, profileSummary };`)({
  e: escapeHtml, local, shared, SIGNATURES, PEOPLE, getTemplate, defaultSelection, cover, themeAttributes, heart,
  getCoverPhoto: () => null, contentDescription: () => '사진 미설정 · 예식장 미설정 · 그 밖의 내용은 예시', countdownMarkup: () => '<div class="wedding-countdown">기존 일정</div>',
});

test('all 29 cards keep exact preview, own favorite, comparison and mobile routes with readable details', () => {
  const before = structuredClone({ local, shared });
  const dom = new JSDOM(renderer.card(TEMPLATES[0]));
  for (const template of TEMPLATES) {
    dom.window.document.body.innerHTML = renderer.card(template);
    const card = dom.window.document.querySelector('.template-card');
    assert.equal(card.dataset.templateCard, template.id);
    assert.equal(card.querySelector('.template-thumb').getAttribute('href'), '#preview/' + template.id);
    assert.equal(card.querySelector('[data-action="favorite"]').dataset.template, template.id);
    assert.equal(card.querySelector('[data-action="compare-toggle"]').dataset.template, template.id);
    assert.equal(card.querySelector('[data-action="mobile-preview"]').getAttribute('href'), '#preview/' + template.id);
    const details = card.querySelector('.glass-template-details');
    assert.equal(details.open, false);
    assert.equal(details.querySelectorAll('p')[0].textContent, template.description);
    assert.equal(details.querySelectorAll('p')[1].textContent, template.photoHint);
    details.open = true;
    assert.equal(card.querySelector('[data-action="favorite"]').getAttribute('aria-pressed'), String(template.id === TEMPLATES[0].id));
  }
  assert.equal(TEMPLATES.length, 29);
  assert.deepEqual({ local, shared }, before);
  dom.window.close();
});

test('the catalog shortcut keeps common-content status and opens the existing saved-selection route', () => {
  const dom = new JSDOM(renderer.profileSummary()), summary = dom.window.document.querySelector('.profile-summary');
  assert.equal(summary.querySelector('.glass-selection-link').getAttribute('href'), '#selection');
  assert.ok(summary.querySelector('[data-action="profile-settings"]'));
  assert.match(summary.querySelector('.profile-summary-copy').textContent, /사진 미설정 · 예식장 미설정 · 그 밖의 내용은 예시/);
  assert.equal(summary.querySelectorAll('[data-action="save"]').length, 0);
  assert.equal(shared.data.selectionRevision, 4);
  dom.window.close();
});
