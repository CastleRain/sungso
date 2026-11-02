import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../sohee/sales/package.json', import.meta.url));
const { JSDOM } = require('jsdom');

test('current-trip updates retain disclosure state and keep resort, picks and read-only archive links independent', () => {
  const dom = new JSDOM('<body><div id="planWrap"></div></body>');
  const w = dom.window, writes = [], details = [];
  let publish;
  const days = [{ date: '2035-06-10', title: '테스트 이동', description: '인공 일정' }];
  const source = readFileSync(new URL('../js/tab-plan.js', import.meta.url), 'utf8').replace(/^import\s[\s\S]*?;\r?\n/gm, '').replace(/^export /gm, '');
  const context = { document: w.document, window: w,
    RESORTS: [{ id: 'fixture', name_ko: '테스트 리조트', name_en: 'Fixture Resort', atoll: '테스트 지역', transfer_type: 'speedboat', transfer_minutes: 20 }],
    PLACES: { resort: { name: '테스트 리조트' } }, TRIP_DAYS: days, TRAVEL_LOCATIONS: { '2035-06-10': { tone: 'maldives', country: '테스트 국가' } },
    getFeaturedImage: () => 'https://fixture.invalid/resort.jpg', getBestPrice: () => 1000,
    subscribeTrip: fn => { publish = fn; return () => {}; },
    subscribePicks: fn => { fn({ sohee: ['fixture'], sungwoo: [], finalCandidates: [] }); return () => {}; },
    subscribeItinerary: fn => { fn([{ date: '2034-01-01', title: '이전 기록', items: ['문자 일정', { time: '09:00', text: '객체 일정' }] }]); return () => {}; },
    removePick: (...args) => writes.push(args), setFinalCandidates: (...args) => writes.push(args), setConfirmedResort: (...args) => writes.push(args),
  };
  vm.runInNewContext(source, context);
  context.initPlan({ openDetailFn: id => details.push(id) });
  const q = selector => w.document.querySelector(selector);
  const archive = q('#planLegacyArchive'); archive.open = true;
  q('.plan-current-overview').open = true;
  publish({ data: { days: [{ ...days[0], title: '최신 테스트 일정' }] } });
  assert.equal(q('.plan-current-overview').open, true);
  assert.match(q('.plan-current-overview').textContent, /최신 테스트 일정/);
  assert.equal(q('#planLegacyArchive'), archive);
  assert.equal(archive.open, true);
  assert.match(archive.textContent, /읽기 전용.*문자 일정.*객체 일정/s);
  assert.equal(q('.plan-current-link').getAttribute('href'), '../travel/');
  assert.equal(q('.hm-glass-resort-image').getAttribute('src'), 'https://fixture.invalid/resort.jpg');
  q('#openAnaneaPlan').click();
  assert.deepEqual(details, ['fixture']);
  assert.equal(writes.length, 0);
});
