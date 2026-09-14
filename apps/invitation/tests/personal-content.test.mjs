import test from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, PHOTOS as catalogPhotos } from '../js/catalog.mjs';
import { defaultSelection, escapeHtml } from '../js/core.mjs';
import { cover, invitation } from '../js/templates.mjs';
import { salonCover } from '../js/reference-salon.mjs';
import { guestCover } from '../js/reference-toourguest.mjs';
import { initialEditorialState, transitionEditorialState } from '../js/editions-editorial.mjs';
import { PHOTOS, applyPersonalContent, clearPersonalContent, getPhoto, getCoverPhoto, hasPersonalPhotos, hasVenue } from '../js/personal-content.mjs?v=20260915-personal-invitation';
import { remainingTime, WEDDING_INSTANT } from '../js/countdown.mjs?v=20260915-personal-invitation';

const asset = (name, index = 0) => ({ dataUrl: `data:image/jpeg;base64,${name}`, width: 800 + index, height: 1200 + index });
function snapshot(count = 3, venue = {}) {
  const galleryIds = Array.from({ length: count }, (_, index) => `gallery-${index}`);
  return { ready: true, profile: { coverId: 'cover', galleryIds, venue }, photos: { cover: asset('COVER', 50), ...Object.fromEntries(galleryIds.map((id, index) => [id, asset(`GALLERY${index}`, index)])) } };
}
function selection(id, galleryLayout = 'grid') {
  const value = defaultSelection(id);
  value.sections = Object.fromEntries(Object.keys(value.sections).map(key => [key, true]));
  value.galleryLayout = galleryLayout;
  return value;
}
function section(html, key) {
  const opening = new RegExp(`<section\\b[^>]*data-section="${key}"[^>]*>`).exec(html);
  assert.ok(opening, `missing ${key} section`);
  const start = opening.index;
  let depth = 0;
  for (const tag of html.slice(start).matchAll(/<\/?section\b[^>]*>/g)) {
    depth += tag[0].startsWith('</') ? -1 : 1;
    if (!depth) return html.slice(start, start + tag.index + tag[0].length);
  }
  assert.fail(`unclosed ${key} section`);
}
const images = html => [...html.matchAll(/<img\b[^>]*>/g)].map(match => match[0]);
test.afterEach(clearPersonalContent);

test('catalog photos stay live and a one-photo profile supports every fixed story index', () => {
  applyPersonalContent(snapshot(1));
  assert.equal(PHOTOS.length, 1);
  assert.equal(catalogPhotos, PHOTOS);
  assert.equal(getPhoto(0), getPhoto(2));
  assert.equal(getPhoto(-1), getPhoto(0));
  assert.equal(getPhoto(20).width, 800);
  assert.match(getCoverPhoto().src, /COVER$/);
  assert.equal(hasPersonalPhotos(), true);
  applyPersonalContent(snapshot(4));
  assert.equal(catalogPhotos.length, 4);
  assert.match(getPhoto(3).src, /GALLERY3$/);
});

test('representative photos replace photographic covers while illustrations and typography remain', () => {
  applyPersonalContent(snapshot(4));
  for (const { id } of TEMPLATES) {
    for (const thumbnail of [false, true]) {
      const rendered = cover(id, thumbnail);
      const photographicImages = images(rendered).filter(tag => !tag.includes('couple-illustration.webp'));
      if (photographicImages.length) {
        assert.match(photographicImages[0], /src="data:image\/jpeg;base64,COVER"/, id);
        assert.match(photographicImages[0], /alt="대표사진"/, id);
        assert.match(photographicImages[0], /width="850" height="1250"/, id);
      } else assert.ok(['sketch', 'ticket', 'guest-jeju'].includes(id), id);
    }
  }
  assert.match(cover('sketch'), /couple-illustration.webp/);
  assert.match(images(invitation(selection('ticket')))[0], /base64,COVER/);
  for (const id of ['salon-lettering', 'salon-polaroid', 'salon-editorial']) assert.match(images(salonCover(id))[0], /base64,COVER/);
  for (const id of ['guest-seoul', 'guest-porto']) assert.match(images(guestCover(id))[0], /base64,COVER/);
  assert.equal(salonCover('unknown'), '');
  assert.equal(guestCover('unknown'), null);
});

test('all 29 designs render the complete 1, 4 or 20-photo gallery in every layout and exactly one live timer', () => {
  assert.equal(TEMPLATES.length, 29);
  for (const count of [1, 4, 20]) {
    applyPersonalContent(snapshot(count));
    for (const { id } of TEMPLATES) for (const layout of ['grid', 'slide', 'filmstrip']) {
      const html = invitation(selection(id, layout));
      const gallery = section(html, 'gallery');
      const buttons = [...gallery.matchAll(/<button\b[^>]*data-action="photo"[^>]*>/g)];
      assert.equal(buttons.length, count, `${id}/${layout}/${count}`);
      for (let index = 0; index < count; index++) {
        assert.match(buttons[index][0], new RegExp(`data-index="${index}"`), id);
        assert.ok(gallery.includes(`base64,GALLERY${index}"`), `${id} photo ${index}`);
      }
      assert.doesNotMatch(gallery, /예시 사진|couple-(?:garden|walk|close)\.webp|base64,COVER/);
      assert.equal((html.match(/data-wedding-countdown\b/g) || []).length, 1, id);
      assert.match(section(html, 'date'), /data-wedding-countdown/);
      if (gallery.includes('data-reference-gallery-count')) assert.ok(gallery.includes(`>1 / ${count}</output>`), id);
    }
  }
});

test('personal venue names and transport are escaped and replace sample maps across all designs', () => {
  const venue = { name: '우리 <홀> & "정원"', hall: '2층 <가든>', address: '<b>서울의 주소</b>', mapUrl: 'https://example.com/map?x=1&y=2', transport: '<script>기차 안내</script>', parking: '<img src=x onerror="x"> 주차 안내' };
  applyPersonalContent(snapshot(1, venue));
  for (const { id } of TEMPLATES) {
    const options = selection(id);
    const html = invitation(options);
    assert.ok(html.includes(escapeHtml(venue.name)), id);
    const directions = section(html, 'directions');
    for (const key of ['hall', 'address', 'mapUrl', 'transport', 'parking']) assert.ok(directions.includes(escapeHtml(venue[key])), `${id}/${key}`);
    assert.doesNotMatch(html, /우리의 웨딩홀|가든홀|예시역|예시 주차장|예시 약도|<script>|<img src=x/);
    assert.match(directions, /target="_blank" rel="noopener noreferrer"/);
    options.sections.directions = false;
    assert.doesNotMatch(invitation(options), /personal-map-link|data-section="directions"/);
  }
  applyPersonalContent(snapshot(1, { name: '바뀐 예식장', hall: '새 홀' }));
  for (const { id } of TEMPLATES) {
    const html = invitation(selection(id));
    assert.match(html, /바뀐 예식장/);
    assert.ok(!html.includes(escapeHtml(venue.name)), id);
  }
});

test('clearing or receiving an unready profile restores the original sample content in every design', () => {
  clearPersonalContent();
  const baseline = new Map(TEMPLATES.map(({ id }) => [id, invitation(selection(id))]));
  applyPersonalContent(snapshot(20, { name: '설정한 예식장' }));
  clearPersonalContent();
  assert.equal(hasPersonalPhotos(), false);
  assert.equal(hasVenue(), false);
  assert.equal(getCoverPhoto(), null);
  assert.equal(catalogPhotos.length, 3);
  for (const [id, html] of baseline) assert.equal(invitation(selection(id)), html, id);
  applyPersonalContent(snapshot(1));
  applyPersonalContent({ ready: false });
  for (const [id, html] of baseline) assert.equal(invitation(selection(id)), html, id);
});

test('cover-only and gallery-only profiles use their available media without losing sample fallback', () => {
  const coverOnly = snapshot(0);
  applyPersonalContent(coverOnly);
  assert.equal(PHOTOS.length, 1);
  assert.match(getPhoto(2).src, /COVER$/);
  const galleryOnly = snapshot(4);
  galleryOnly.profile.coverId = null;
  applyPersonalContent(galleryOnly);
  assert.match(getCoverPhoto().src, /GALLERY0$/);
  const empty = snapshot(0);
  empty.profile.coverId = null;
  applyPersonalContent(empty);
  assert.equal(PHOTOS.length, 3);
  assert.equal(hasPersonalPhotos(), false);
});

test('countdown resolves days, hours, minutes and seconds against the Korean ceremony instant', () => {
  assert.deepEqual(remainingTime(WEDDING_INSTANT - (86400 + 7200 + 180 + 4) * 1000), { days: 1, hours: 2, minutes: 3, seconds: 4, arrived: false });
  assert.deepEqual(remainingTime(WEDDING_INSTANT + 5000), { days: 0, hours: 0, minutes: 0, seconds: 0, arrived: true });
  assert.equal(remainingTime(WEDDING_INSTANT - 1).seconds, 1);
});

test('film development can select the last uploaded image while rejecting out-of-range frames', () => {
  for (const count of [1, 4, 20]) {
    const state = initialEditorialState('film');
    const selected = transitionEditorialState('film', state, 'frame', String(count - 1), count);
    assert.equal(selected.frame, count - 1);
    assert.equal(transitionEditorialState('film', selected, 'frame', String(count), count), selected);
    for (const value of ['-1', '1.5', '01', 'Infinity', '']) assert.equal(transitionEditorialState('film', selected, 'frame', value, count), selected);
  }
  assert.equal(transitionEditorialState('museum', { room: 0 }, 'room', '19', 20).room, 0);
});
