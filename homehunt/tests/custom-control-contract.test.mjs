import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

test('browser-native date, time, datalist, and confirm controls are replaced', () => {
  const html = read('index.html');
  const app = read('js/app.js');

  assert.doesNotMatch(html, /<datalist\b/i);
  assert.doesNotMatch(html, /type=["'](?:date|time)["']/i);
  assert.match(html, /flatpickr@4\.6\.13/);
  assert.match(html, /id="districtSuggestions"[^>]*role="listbox"/);
  assert.match(html, /id="confirmModal"/);
  assert.doesNotMatch(app, /window\.confirm\s*\(/);
});

test('custom range progress stays synchronized for pointer and typed input', () => {
  const app = read('js/app.js');
  const kit = read('js/ui-kit.js');
  const css = read('css/hh-screens.css');

  assert.match(app, /setProperty\('--hh-range-progress'/);
  assert.doesNotMatch(app, /setProperty\('--range-progress'/);
  assert.match(kit, /setProperty\('--hh-range-progress'/);
  assert.match(css, /var\(--hh-range-progress\)/);
});

test('Flatpickr internals are not decorated as full app form controls', () => {
  const kit = read('js/ui-kit.js');
  assert.match(kit, /:not\(\.numInput\)/);
});

test('compact operator selects reserve room for text and the custom chevron', () => {
  const css = read('css/hh-screens.css');
  assert.match(css, /\.input-with-select\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+88px/s);
});

test('all active UI assets use the same cache-busting version', () => {
  const html = read('index.html');
  const config = read('js/config.js');

  assert.match(html, /data-ui-version="3\.0\.4"/);
  assert.match(html, /ui-kit\.js\?v=3\.0\.4/);
  assert.match(html, /app\.js\?v=3\.0\.4/);
  assert.match(config, /uiVersion:\s*'3\.0\.4'/);
});
