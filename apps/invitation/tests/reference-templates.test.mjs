import test from 'node:test';
import assert from 'node:assert/strict';
import { WEDDING } from '../js/wedding-date.mjs';
import { TEMPLATES, PHOTOS, SECTIONS } from '../js/catalog.mjs';
import { REFERENCE_EDITIONS } from '../js/reference-catalog.mjs';
import { defaultSelection, normalizeLocal, normalizeDocument, normalizeSelection, parseRoute, filterTemplates, applyChange, exportSelection } from '../js/core.mjs';
import { cover, invitation } from '../js/templates.mjs';

const ids = ['salon-lettering', 'salon-polaroid', 'salon-editorial', 'guest-seoul', 'guest-porto', 'guest-jeju'];
const optional = Object.keys(SECTIONS);
const attributes = text => Object.fromEntries([...text.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(([, name, value]) => [name, value ?? '']));

// A markup tree lets these checks distinguish a visible section from hidden decorative art.
// Scroll geometry, reveal timing and visual resemblance remain browser checks.
function parse(html) {
  const root = { tag: 'root', attrs: {}, children: [], text: '', parent: null };
  const stack = [root], voids = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'wbr']);
  for (const match of html.matchAll(/<\/?([\w-]+)([^>]*)>|([^<]+)/g)) {
    if (match[3]) { stack.at(-1).text += match[3]; continue; }
    const [raw, tag, attrs] = match;
    if (raw.startsWith('</')) {
      assert.equal(stack.at(-1).tag, tag, `balanced ${tag} markup`);
      stack.pop();
    } else {
      const node = { tag, attrs: attributes(attrs), children: [], text: '', parent: stack.at(-1) };
      stack.at(-1).children.push(node);
      if (!voids.has(tag) && !raw.endsWith('/>')) stack.push(node);
    }
  }
  assert.equal(stack.length, 1, 'all rendered elements close');
  return root;
}
const all = root => root.children.flatMap(child => [child, ...all(child)]);
const has = (node, attribute) => Object.hasOwn(node.attrs, attribute);
const withAttr = (root, attribute, value) => all(root).filter(node => has(node, attribute) && (value === undefined || node.attrs[attribute] === value));
const withClass = (root, name) => all(root).filter(node => (node.attrs.class || '').split(/\s+/).includes(name));
const content = node => node.text + node.children.map(content).join('');
const ancestors = node => node.parent ? [node.parent, ...ancestors(node.parent)] : [];
const revealedKeys = root => withAttr(root, 'data-reference-key').map(node => node.attrs['data-reference-key']);
const settings = (id, patch = {}) => {
  const base = defaultSelection(id);
  return { ...base, ...patch, sections: { ...base.sections, ...patch.sections } };
};
const render = (id, patch) => parse(invitation(settings(id, patch)));

test('the reference collection contains three distinct source samples from each service and preserves direct links', () => {
  assert.deepEqual(REFERENCE_EDITIONS.map(template => template.id), ids);
  assert.equal(new Set(REFERENCE_EDITIONS.map(template => template.sourceUrl)).size, 6);
  assert.equal(REFERENCE_EDITIONS.filter(template => template.sourceBrand === '살롱드레터').length, 3);
  assert.equal(REFERENCE_EDITIONS.filter(template => template.sourceBrand === '투아워게스트').length, 3);
  for (const template of REFERENCE_EDITIONS) {
    assert.equal(TEMPLATES.filter(value => value.id === template.id).length, 1);
    assert.equal(template.collection, 'reference');
    assert.equal(template.readingMode, 'flow');
    const source = new URL(template.sourceUrl);
    assert.equal(source.protocol, 'https:');
    assert.ok(['salondeletter.com', 'my.toourguest.com'].includes(source.hostname));
    const selection = settings(template.id);
    assert.deepEqual(normalizeSelection(selection), selection);
    assert.deepEqual(parseRoute(`#preview/${template.id}`), { view: 'preview', templateId: template.id });
    assert.equal(selection.sections.story, true);
  }
  assert.deepEqual(filterTemplates(TEMPLATES, {}, 'all', 'reference').map(template => template.id), ids);
});

test('six distinct covers appear once per full invitation and their catalog versions stay passive', () => {
  const covers = new Set(), compositions = new Set();
  for (const id of ids) {
    const fullCover = cover(id), thumbnail = parse(cover(id, true));
    covers.add(fullCover);
    assert.equal(withClass(thumbnail, 'cover').length, 1);
    assert.equal(all(thumbnail).filter(node => ['button', 'input', 'form', 'iframe', 'audio', 'video'].includes(node.tag)).length, 0);
    const full = render(id);
    assert.equal(withClass(full, 'cover').length, 1, `${id}: cover opening is not repeated in the body`);
    assert.equal(withAttr(full, 'data-reference-intro').length, 1, `${id}: there is one introductory moment`);
    assert.equal(withClass(full, 'invitation-ending').length, 1);
    compositions.add(invitation(settings(id)));
  }
  assert.equal(covers.size, ids.length);
  assert.equal(compositions.size, ids.length);
});

test('every reference invitation retains one readable ceremony section and unique reveal identities throughout its body', () => {
  for (const id of ids) {
    const root = render(id);
    for (const key of ['greeting', 'date', ...optional]) {
      assert.equal(withAttr(root, 'data-section', key).length, 1, `${id}: ${key} occurs once`);
    }
    const date = withAttr(root, 'data-section', 'date')[0];
    assert.ok(content(date).includes(WEDDING.koLong));
    assert.match(content(date), /오후 2시/);
    for (const key of ['greeting', 'date']) {
      const node = withAttr(root, 'data-section', key)[0];
      assert.ok(![node, ...ancestors(node)].some(parent => has(parent, 'hidden') || parent.attrs['aria-hidden'] === 'true'));
    }
    assert.match(content(root), /우리의 웨딩홀 · 가든홀/);
    const keys = revealedKeys(root);
    assert.equal(new Set(keys).size, keys.length, `${id}: separate moments cannot share a one-time reveal key`);
    assert.ok(keys.every(key => key.includes(id)), `${id}: reveal history cannot leak into another sample`);
    assert.ok(withAttr(root, 'data-reference-reveal').every(node => has(node, 'data-reference-key')));
  }
});

test('each optional reference section can be hidden independently without removing the ceremony or ending', () => {
  for (const id of ids) {
    for (const hidden of optional) {
      const root = render(id, { sections: { [hidden]: false } });
      assert.equal(withAttr(root, 'data-section', hidden).length, 0, `${id}: ${hidden} is absent`);
      for (const visible of optional.filter(key => key !== hidden)) {
        assert.equal(withAttr(root, 'data-section', visible).length, 1, `${id}: ${visible} remains`);
      }
      assert.equal(withAttr(root, 'data-section', 'greeting').length, 1);
      assert.equal(withAttr(root, 'data-section', 'date').length, 1);
      assert.equal(withClass(root, 'invitation-ending').length, 1);
    }
    const bare = render(id, { sections: Object.fromEntries(optional.map(key => [key, false])) });
    assert.equal(withAttr(bare, 'data-action', 'photo').length, 0);
    assert.equal(withAttr(bare, 'data-section', 'date').length, 1);
  }
});

test('all gallery choices keep three accessible photo actions and provide paging controls only for a paged layout', () => {
  for (const id of ids) {
    for (const galleryLayout of ['grid', 'slide', 'filmstrip']) {
      const root = render(id, { galleryLayout });
      const gallery = withAttr(root, 'data-section', 'gallery')[0];
      const buttons = withAttr(gallery, 'data-action', 'photo');
      assert.deepEqual(buttons.map(node => Number(node.attrs['data-index'])), PHOTOS.map((_, index) => index));
      for (const button of buttons) {
        assert.equal(button.tag, 'button');
        assert.equal(button.attrs.type, 'button');
        assert.ok(button.attrs['aria-label']);
        assert.ok(!ancestors(button).some(node => node.attrs['aria-hidden'] === 'true'));
      }
      const paging = withAttr(gallery, 'data-reference-gallery-step');
      assert.deepEqual(paging.map(node => node.attrs['data-reference-gallery-step']), galleryLayout === 'grid' ? [] : ['-1', '1']);
      assert.equal(withAttr(gallery, 'data-reference-gallery-root').length, galleryLayout === 'grid' ? 0 : 1);
    }
  }
});

test('palette changes and optional edits keep stable identities for already seen reference content', () => {
  for (const template of REFERENCE_EDITIONS) {
    const initialKeys = new Set(revealedKeys(render(template.id)));
    for (const palette of template.palettes) {
      const changed = render(template.id, { paletteId: palette.id });
      assert.deepEqual(new Set(revealedKeys(changed)), initialKeys);
      assert.ok(withAttr(changed, 'style').some(node => node.attrs.style.includes(palette.accent)), `${template.id}: selected accent is applied`);
    }
    const hiddenKeys = revealedKeys(render(template.id, { sections: { story: false, gallery: false } }));
    assert.ok(hiddenKeys.every(key => initialKeys.has(key)), `${template.id}: editing sections does not rename remaining reveal keys`);
    assert.deepEqual(new Set(revealedKeys(render(template.id))), initialKeys);
  }
});

test('reference previews use local example photos and do not turn notes or sample forms into submitted data', () => {
  const allowedPhotos = new Set(PHOTOS.map(photo => photo.src));
  for (const id of ids) {
    const root = render(id, { note: '<script>PRIVATE_NOTE_SENTINEL</script>' });
    assert.doesNotMatch(content(root), /PRIVATE_NOTE_SENTINEL/);
    assert.equal(all(root).filter(node => ['form', 'input', 'textarea', 'iframe', 'script'].includes(node.tag)).length, 0);
    for (const node of all(root).filter(node => node.tag === 'img')) {
      assert.ok(allowedPhotos.has(node.attrs.src));
      assert.ok(node.attrs.alt);
      assert.ok(Number(node.attrs.width) > 0 && Number(node.attrs.height) > 0);
    }
    assert.ok(!withAttr(root, 'href').some(node => /^(tel:|sms:|mailto:)/.test(node.attrs.href)));
  }
});

test('reference drafts, favorites and exports preserve the existing design-only revision contract', () => {
  const previous = { schemaVersion: 1, favorites: { sungwoo: ['ribbon'], sohee: ['garden'] }, selection: settings('paper-theater'), selectionRevision: 7 };
  for (const id of ids) {
    const selection = { ...settings(id, { sections: { story: false }, note: '기존 메모' }), revealed: ['cover'], galleryIndex: 2, sourceUrl: 'https://example.test/private' };
    const changed = applyChange(previous, { type: 'selection', actor: 'sungwoo', selection, expectedRevision: 7 });
    assert.equal(changed.selectionRevision, 8);
    assert.equal(changed.selection.templateId, id);
    assert.deepEqual(Object.keys(exportSelection(changed.selection)).sort(), ['schemaVersion', 'templateId', 'paletteId', 'galleryLayout', 'sections', 'note'].sort());
    assert.equal(changed.selection.sections.story, false);
    const favorite = applyChange(previous, { type: 'favorite', actor: 'sungwoo', templateId: id, enabled: true });
    assert.deepEqual(favorite.favorites, { sungwoo: ['ribbon', id] });
    assert.equal('selectionRevision' in favorite, false);
    const local = normalizeLocal({ collection: 'reference', compare: [id, 'ribbon'], drafts: { [id]: { selection, baseRevision: 7 } } });
    assert.equal(local.collection, 'reference');
    assert.deepEqual(local.compare, [id, 'ribbon']);
    assert.deepEqual(local.drafts[id], { selection: changed.selection, baseRevision: 7 });
    const normalized = normalizeDocument({ ...previous, selection: changed.selection, favorites: { sungwoo: [id], sohee: ['garden'] } });
    assert.deepEqual(normalized.favorites, { sungwoo: [id], sohee: ['garden'] });
  }
  assert.deepEqual(previous.favorites, { sungwoo: ['ribbon'], sohee: ['garden'] });
  assert.equal(previous.selectionRevision, 7);
});
