import test from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES } from '../js/catalog.mjs';
import { defaultSelection, escapeHtml } from '../js/core.mjs';
import { cover, invitation } from '../js/templates.mjs';
import { PHOTOS, applyPersonalContent, clearPersonalContent, getCoverPhoto, getMapImage, hasPersonalPhotos, venueDirections } from '../js/personal-content.mjs?v=20260915-venue-map';

const photo = { dataUrl:'data:image/jpeg;base64,UEhPVE8=', width:800, height:1200 };
const diagram = { dataUrl:'data:image/jpeg;base64,RElBR1JBTQ==', width:1400, height:800 };
const baseVenue = { name:'검증용 예식장', hall:'3층 테스트홀', address:'검증용 주소 123', naverUrl:'https://naver.me/test-place', kakaoUrl:'https://map.kakao.com/?itemId=test-place&mode=map', mapUrl:'', transport:'검증용 역에서 걸어서 이동\n정문으로 입장', parking:'안내된 주차장 이용' };
function snapshot(venue = {}, withMap = true) {
  return { ready:true, profile:{ coverId:'cover', galleryIds:['cover'], mapImageId:withMap ? 'diagram' : null, venue:{...baseVenue,...venue} }, photos:{cover:photo,diagram} };
}
function selection(id) {
  const value = defaultSelection(id);
  value.sections.directions = true;
  value.sections.gallery = true;
  return value;
}
function section(html, key) {
  const opening = new RegExp(`<section\\b[^>]*data-section="${key}"[^>]*>`).exec(html);
  assert.ok(opening, `missing ${key} section`);
  let depth = 0;
  for (const tag of html.slice(opening.index).matchAll(/<\/?section\b[^>]*>/g)) {
    depth += tag[0].startsWith('</') ? -1 : 1;
    if (!depth) return html.slice(opening.index, opening.index + tag.index + tag[0].length);
  }
  assert.fail(`unclosed ${key} section`);
}
const links = html => [...html.matchAll(/<a\b[^>]*class="personal-map-link"[^>]*>[\s\S]*?<\/a>/g)].map(match => match[0]);
test.afterEach(clearPersonalContent);

test('every design shows its saved schematic once with two map choices and a distinct floor line', () => {
  applyPersonalContent(snapshot());
  assert.equal(TEMPLATES.length, 29);
  for (const {id} of TEMPLATES) {
    const html = invitation(selection(id)), directions = section(html, 'directions');
    assert.equal((directions.match(/data-action="venue-map"/g) || []).length, 1, id);
    assert.match(directions, /width="1400" height="800"/, id);
    assert.match(directions, /<strong>검증용 예식장<\/strong><span>3층 테스트홀<\/span>/, id);
    assert.equal(links(directions).length, 2, id);
    assert.match(links(directions)[0], /href="https:\/\/naver.me\/test-place"[^>]*>네이버 지도/, id);
    assert.match(links(directions)[1], /itemId=test-place&amp;mode=map[^>]*>카카오맵/, id);
    assert.match(directions, /검증용 역에서 걸어서 이동\n정문으로 입장/);
    assert.match(directions, /안내된 주차장 이용/);
    assert.doesNotMatch(directions, /예시역|예시 약도|sample-map|rg-map|무료/);
    assert.doesNotMatch(cover(id), /RElBR1JBTQ/);
    assert.doesNotMatch(section(html, 'gallery'), /RElBR1JBTQ/);
    const hidden = selection(id); hidden.sections.directions = false;
    assert.doesNotMatch(invitation(hidden), /data-action="venue-map"|class="personal-map-link"/);
  }
});

test('a schematic never becomes a cover or gallery photo and missing media never creates a substitute map', () => {
  applyPersonalContent(snapshot());
  assert.equal(PHOTOS.length, 1);
  assert.equal(PHOTOS[0].src, photo.dataUrl);
  assert.equal(getCoverPhoto().src, photo.dataUrl);
  assert.deepEqual(getMapImage(), {src:diagram.dataUrl,width:1400,height:800,alt:'검증용 예식장 오시는 길 약도'});
  const returned = getMapImage(); returned.src = 'mutated';
  assert.equal(getMapImage().src, diagram.dataUrl);
  const mapOnly = snapshot(); mapOnly.profile.coverId = null; mapOnly.profile.galleryIds = [];
  applyPersonalContent(mapOnly);
  assert.equal(hasPersonalPhotos(), false);
  assert.equal(getCoverPhoto(), null);
  assert.equal(PHOTOS.length, 3);
  assert.equal(getMapImage().src, diagram.dataUrl);
  const missing = snapshot(); delete missing.photos.diagram;
  applyPersonalContent(missing);
  assert.equal(getMapImage(), null);
  for (const {id} of TEMPLATES) assert.doesNotMatch(section(invitation(selection(id)), 'directions'), /venue-map|예시역|예시 약도|<svg/);
});

test('legacy map URLs remain usable and recognized providers do not duplicate their new buttons', () => {
  applyPersonalContent(snapshot({mapUrl:'https://map.naver.com/p/entry/place/legacy'}));
  assert.equal(links(venueDirections()).length, 2);
  assert.doesNotMatch(venueDirections(), /place\/legacy/);
  applyPersonalContent(snapshot({mapUrl:'https://place.map.kakao.com/legacy'}));
  assert.equal(links(venueDirections()).length, 2);
  assert.doesNotMatch(venueDirections(), /com\/legacy/);
  for (const [mapUrl, label] of [['https://naver.me/legacy','네이버 지도'],['https://kko.to/legacy','카카오맵'],['https://example.com/legacy?x=1&y=2','지도에서 위치 보기']]) {
    const legacy = snapshot({mapUrl}); delete legacy.profile.venue.naverUrl; delete legacy.profile.venue.kakaoUrl; delete legacy.profile.mapImageId;
    applyPersonalContent(legacy);
    const result = links(venueDirections());
    assert.equal(result.length, 1);
    assert.ok(result[0].includes(escapeHtml(mapUrl)));
    assert.ok(result[0].includes(label));
    assert.equal(getMapImage(), null);
  }
  applyPersonalContent(snapshot({naverUrl:'https://example.com', kakaoUrl:'https://example.com/', mapUrl:'https://example.com:443/'}));
  assert.equal(links(venueDirections()).length, 1);
});

test('all venue and map labels are escaped while unsafe navigation schemes and credentials are excluded', () => {
  const venue = {name:'테스트 <홀> & "정원"',hall:'3층 <script>층</script>',address:'<img src=x onerror="x">',transport:'기차 & 버스\n<script>x</script>',parking:'지하 "주차장"',naverUrl:'https://naver.me/test?a=1&b=2',kakaoUrl:'https://map.kakao.com/?q=%22test%22'};
  applyPersonalContent(snapshot(venue));
  const html = venueDirections();
  for (const value of Object.values(venue)) assert.ok(html.includes(escapeHtml(value)), value);
  assert.doesNotMatch(html, /<script>|<img src=x|onerror="x"/);
  assert.match(html, /alt="테스트 &lt;홀&gt; &amp; &quot;정원&quot; 오시는 길 약도"/);
  assert.match(html, /aria-label="테스트 &lt;홀&gt; &amp; &quot;정원&quot; 약도 크게 보기"/);
  for (const unsafe of ['javascript:alert(1)','http://example.com','data:text/html,test','https://user:password@example.com','https://example.com\\@evil.test','https://example.com/\nredirect']) {
    applyPersonalContent(snapshot({naverUrl:unsafe,kakaoUrl:unsafe,mapUrl:unsafe}));
    assert.equal(links(venueDirections()).length, 0, unsafe);
  }
  applyPersonalContent(snapshot({naverUrl:'',kakaoUrl:'',mapUrl:'https://map.naver.com.evil.test/map'}));
  assert.match(links(venueDirections())[0], /지도에서 위치 보기/);
  assert.doesNotMatch(links(venueDirections())[0], />네이버 지도/);
});

test('profile changes, logout cleanup and unready snapshots clear private schematics and map links', () => {
  for (const reset of [() => clearPersonalContent(), () => applyPersonalContent({ready:false}), () => applyPersonalContent({ready:true,profile:{coverId:null,galleryIds:[],venue:{}},photos:{}})]) {
    applyPersonalContent(snapshot());
    assert.ok(getMapImage());
    reset();
    assert.equal(getMapImage(), null);
    assert.equal(venueDirections(), '');
    assert.equal(getCoverPhoto(), null);
    for (const {id} of TEMPLATES) assert.doesNotMatch(invitation(selection(id)), /RElBR1JBTQ|test-place|검증용 예식장/);
  }
  applyPersonalContent(snapshot());
  applyPersonalContent(snapshot({name:'다음 검증 장소',naverUrl:'',kakaoUrl:''}, false));
  assert.equal(getMapImage(), null);
  assert.doesNotMatch(venueDirections(), /test-place|RElBR1JBTQ|약도 크게 보기/);
  assert.match(venueDirections(), /다음 검증 장소/);
});
