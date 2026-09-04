import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dedupeSupplyNotices,
  diffNewSupplyNotices,
  filterSupplyNotices,
  kstDateKey,
  matchesAlertPreferences,
  matchesSupplyAlertPreferences,
  normalizeApplyHomeNotice,
  normalizeSupplyDate,
  selectSupplyAlerts,
  sortSupplyNotices,
  summarizeSupplyNotices,
  supplyStatusAtKst,
  unreadSupplyNotices,
} from '../js/supply-core.mjs';

const NOW = new Date('2026-09-04T01:00:00.000Z'); // 2026-09-04 10:00 KST

function applyHomeDetail(overrides = {}) {
  return {
    HOUSE_MANAGE_NO: '2026000123',
    PBLANC_NO: '2026000456',
    HOUSE_NM: '테스트 센트럴',
    HOUSE_SECD_NM: '민영주택',
    HSSPLY_ADRES: '서울특별시 강남구 역삼동 1',
    SUBSCRPT_AREA_CODE_NM: '서울',
    TOT_SUPLY_HSHLDCO: '320',
    RCRIT_PBLANC_DE: '20260828',
    SPSPLY_RCEPT_BGNDE: '20260905',
    SPSPLY_RCEPT_ENDDE: '20260905',
    SUBSCRPT_RCEPT_BGNDE: '20260906',
    SUBSCRPT_RCEPT_ENDDE: '20260907',
    PRZWNER_PRESNATN_DE: '20260915',
    CNTRCT_CNCLS_BGNDE: '20260926',
    CNTRCT_CNCLS_ENDDE: '20260928',
    PBLANC_URL: 'https://example.test/notices/456',
    ...overrides,
  };
}

function model(overrides = {}) {
  return {
    MODEL_NO: '01',
    HOUSE_TY: '084.9000A',
    SUPLY_AR: '84.9',
    SUPLY_HSHLDCO: '80',
    SPSPLY_HSHLDCO: '40',
    NWWDS_HSHLDCO: '12',
    LFE_FRST_HSHLDCO: '8',
    MNYCH_HSHLDCO: '5',
    LTTOT_TOP_AMOUNT: '59800',
    ...overrides,
  };
}

function commonNotice(overrides = {}) {
  return {
    id: 'source:1',
    source: 'test',
    sourceLabel: '공식 공급자',
    title: '서울 테스트 단지',
    program: 'private-sale',
    tenure: 'sale',
    announcementDate: '2026-09-01',
    applicationStartDate: '2026-09-05',
    applicationEndDate: '2026-09-07',
    locations: [{ regionKey: 'seoul', sidoCode: '11', sido: '서울특별시', district: '강남구', address: '서울특별시 강남구' }],
    schedules: [{ kind: 'application', label: '청약', startDate: '2026-09-05', endDate: '2026-09-07' }],
    targetGroups: [],
    totalUnits: 100,
    minAreaM2: 59,
    maxAreaM2: 84,
    maxPriceManWon: 60000,
    homes: [{ modelNo: '01', houseType: '59A', areaM2: 59, maxPriceManWon: 50000 }],
    ...overrides,
  };
}

test('공급 날짜를 여러 공공 API 표기에서 YYYY-MM-DD로 정규화하고 실제 달력을 검증한다', () => {
  assert.equal(normalizeSupplyDate('20260904'), '2026-09-04');
  assert.equal(normalizeSupplyDate('2026.9.4'), '2026-09-04');
  assert.equal(normalizeSupplyDate('2026년 9월 4일'), '2026-09-04');
  assert.equal(normalizeSupplyDate('20260230'), '');
  assert.equal(normalizeSupplyDate('알 수 없음'), '');
});

test('UTC 자정 경계를 서울 날짜 기준으로 바꾼다', () => {
  assert.equal(kstDateKey(new Date('2026-09-03T14:59:59Z')), '2026-09-03');
  assert.equal(kstDateKey(new Date('2026-09-03T15:00:00Z')), '2026-09-04');
  assert.throws(() => kstDateKey('not-a-date'), /valid date/);
});

test('청약홈 상세와 주택형을 안정 ID의 공통 공고로 합친다', () => {
  const notice = normalizeApplyHomeNotice(applyHomeDetail(), [
    model(),
    model({ MODEL_NO: '02', HOUSE_TY: '059.9000B', SUPLY_AR: '59.9', NWWDS_HSHLDCO: '8', LTTOT_TOP_AMOUNT: '42000' }),
  ], { fetchedAt: '2026-09-04T01:00:00Z' });
  assert.equal(notice.id, 'applyhome:2026000123:2026000456');
  assert.equal(notice.source, 'applyhome');
  assert.equal(notice.program, 'private-sale');
  assert.equal(notice.locations[0].regionKey, 'seoul');
  assert.equal(notice.locations[0].district, '강남구');
  assert.equal(notice.totalUnits, 320);
  assert.equal(notice.homes.length, 2);
  assert.equal(notice.minAreaM2, 59.9);
  assert.equal(notice.maxAreaM2, 84.9);
  assert.equal(notice.maxPriceManWon, 59800);
  assert.equal(notice.specialSupply.newlywedUnits, 20);
  assert.equal(notice.newlywedSupplyAvailable, true);
  assert.ok(notice.targetGroups.includes('신혼부부'));
  assert.equal(notice.eligibilityRequiresCheck, true, '공급 물량이 있어도 개인 자격은 별도 확인해야 한다');
});

test('joined object와 별도 특별공급 행을 모델 번호로 결합한다', () => {
  const notice = normalizeApplyHomeNotice({
    detail: applyHomeDetail({ HSSPLY_ADRES: '경기도 성남시 분당구 정자동 1' }),
    models: [model({ NWWDS_HSHLDCO: undefined })],
    specialSupply: [{ MODEL_NO: '01', NWWDS_HSHLDCO: '16', LFE_FRST_HSHLDCO: '7' }],
  }, { fetchedAt: '2026-09-04T00:00:00Z' });
  assert.equal(notice.locations[0].regionKey, 'gyeonggi');
  assert.equal(notice.locations[0].district, '성남시 분당구');
  assert.equal(notice.specialSupply.newlywedUnits, 16);
  assert.equal(notice.homes[0].specialSupply.newlywedUnits, 16);
});

test('특별공급 날짜만으로 신혼부부 물량이나 자격을 만들지 않는다', () => {
  const notice = normalizeApplyHomeNotice(applyHomeDetail(), [model({
    NWWDS_HSHLDCO: undefined,
    LFE_FRST_HSHLDCO: undefined,
    MNYCH_HSHLDCO: undefined,
  })]);
  assert.equal(notice.newlywedSupplyAvailable, null);
  assert.equal(notice.specialSupply.newlywedUnits, null);
  assert.equal(notice.targetGroups.includes('신혼부부'), false);
  assert.equal(notice.eligibilityRequiresCheck, true);
  const special = notice.schedules.find((schedule) => schedule.label === '특별공급');
  assert.equal(special.requiresCheck, true);
});

test('명시된 신혼부부 0세대는 미확인이 아니라 공급 없음으로 보존한다', () => {
  const notice = normalizeApplyHomeNotice(applyHomeDetail(), [model({ NWWDS_HSHLDCO: '0' })]);
  assert.equal(notice.newlywedSupplyAvailable, false);
  assert.equal(notice.specialSupply.newlywedUnits, 0);
  assert.equal(notice.targetGroups.includes('신혼부부'), false);
});

test('공식 분류 필드만 신혼희망타운을 분류하고 제목 문구는 자격 근거로 쓰지 않는다', () => {
  const titleOnly = normalizeApplyHomeNotice(applyHomeDetail({
    HOUSE_NM: '신혼희망타운처럼 좋은 집',
    HOUSE_DTL_SECD_NM: '',
  }), [model({ NWWDS_HSHLDCO: undefined })]);
  assert.notEqual(titleOnly.program, 'newlywed-town');
  assert.equal(titleOnly.newlywedSupplyAvailable, null);

  const official = normalizeApplyHomeNotice(applyHomeDetail({
    HOUSE_DTL_SECD_NM: '신혼희망타운(공공분양)',
  }), [model({ NWWDS_HSHLDCO: undefined })]);
  assert.equal(official.program, 'newlywed-town');
  assert.equal(official.newlywedSupplyAvailable, true);
  assert.equal(official.eligibilityRequiresCheck, true);
});

test('가격이 0이거나 비어 있으면 0원 단지로 만들지 않는다', () => {
  const notice = normalizeApplyHomeNotice(applyHomeDetail(), [model({ LTTOT_TOP_AMOUNT: '0' })]);
  assert.equal(notice.maxPriceManWon, null);
  assert.equal(notice.homes[0].maxPriceManWon, null);
});

test('접수 상태는 발표·계약일이 아니라 서울 기준 신청 창으로 계산한다', () => {
  const upcoming = commonNotice();
  const open = commonNotice({
    schedules: [{ kind: 'application', label: '특별공급', startDate: '2026-09-04', endDate: '2026-09-04' }],
  });
  const closed = commonNotice({
    schedules: [
      { kind: 'application', label: '청약', startDate: '2026-09-01', endDate: '2026-09-02' },
      { kind: 'contract', label: '계약', startDate: '2026-09-10', endDate: '2026-09-12' },
    ],
  });
  assert.equal(supplyStatusAtKst(upcoming, NOW), 'upcoming');
  assert.equal(supplyStatusAtKst(open, NOW), 'open');
  assert.equal(supplyStatusAtKst(closed, NOW), 'closed');
  assert.equal(supplyStatusAtKst(commonNotice({ schedules: [], applicationStartDate: '', applicationEndDate: '' }), NOW), 'unknown');
  assert.equal(supplyStatusAtKst(commonNotice({ status: 'closed', schedules: [], applicationStartDate: '', applicationEndDate: '' }), NOW), 'closed');
});

test('중복 페이지의 동일 stable ID를 합치되 다른 공급자 공고는 임의로 합치지 않는다', () => {
  const sparse = commonNotice({ sourceUrl: '', homes: [], schedules: [] });
  const rich = commonNotice({ sourceUrl: 'https://example.test/1', targetGroups: ['신혼부부'] });
  const otherSource = commonNotice({ id: 'lh:1', source: 'lh' });
  const result = dedupeSupplyNotices([sparse, rich, otherSource, { title: 'invalid' }]);
  assert.equal(result.length, 2);
  assert.equal(result.find((item) => item.id === 'source:1').sourceUrl, 'https://example.test/1');
  assert.deepEqual(result.find((item) => item.id === 'source:1').targetGroups, ['신혼부부']);
});

test('서울·경기, 접수상태, 신혼 대상, 가격, 면적을 함께 필터링한다', () => {
  const seoulNewlywed = commonNotice({ newlywedSupplyAvailable: true, targetGroups: ['신혼부부'] });
  const gyeonggi = commonNotice({
    id: 'source:2',
    locations: [{ regionKey: 'gyeonggi', sidoCode: '41', sido: '경기도', district: '수원시', address: '경기도 수원시' }],
    maxPriceManWon: null,
  });
  const result = filterSupplyNotices([seoulNewlywed, gyeonggi], {
    regions: ['서울'],
    statuses: ['upcoming'],
    newlywedOnly: true,
    maxPriceManWon: 65000,
    minAreaM2: 55,
  }, NOW);
  assert.deepEqual(result.map((item) => item.id), ['source:1']);
});

test('가격 필터에서 미공개 가격은 기본 제외하고 사용자가 선택한 경우만 남긴다', () => {
  const unknown = commonNotice({ maxPriceManWon: null });
  assert.equal(matchesSupplyAlertPreferences(unknown, { maxPriceManWon: 60000 }, NOW), false);
  assert.equal(matchesSupplyAlertPreferences(unknown, { maxPriceManWon: 60000, includeUnknownPrice: true }, NOW), true);
});

test('면적 필터는 공고 전체 최소·최대가 아니라 실제 주택형 중 하나가 맞아야 한다', () => {
  const notice = commonNotice({
    minAreaM2: 39,
    maxAreaM2: 84,
    homes: [{ areaM2: 39 }, { areaM2: 84 }],
  });
  assert.equal(matchesSupplyAlertPreferences(notice, { minAreaM2: 60, maxAreaM2: 70 }, NOW), false);
  assert.equal(matchesSupplyAlertPreferences(notice, { minAreaM2: 80, maxAreaM2: 90 }, NOW), true);
});

test('최소 공급세대 조건은 미공개 수치를 합격으로 꾸미지 않는다', () => {
  const enough = commonNotice({ totalUnits: 300 });
  const small = commonNotice({ id: 'small', totalUnits: 40 });
  const unknown = commonNotice({ id: 'unknown-units', totalUnits: null });
  assert.deepEqual(filterSupplyNotices([enough, small, unknown], { minSupplyUnits: 100 }, NOW).map(({ id }) => id), ['source:1']);
  assert.equal(matchesSupplyAlertPreferences(unknown, { minSupplyUnits: 100, includeUnknownUnits: true }, NOW), true);
});

test('기본 알림 조건은 마감 공고를 제외하고 지역·프로그램·검색어를 조합한다', () => {
  const notice = commonNotice({ program: 'public-sale', source: 'applyhome' });
  assert.equal(matchesSupplyAlertPreferences(notice, {
    regions: ['11'], programs: ['public-sale'], sources: ['applyhome'], query: '서울 테스트',
  }, NOW), true);
  assert.equal(matchesSupplyAlertPreferences(notice, { regions: ['경기'] }, NOW), false);
  const closed = { ...notice, schedules: [{ kind: 'application', startDate: '2026-09-01', endDate: '2026-09-02' }] };
  assert.equal(matchesSupplyAlertPreferences(closed, {}, NOW), false);
  assert.equal(matchesSupplyAlertPreferences(closed, { excludeClosed: false }, NOW), true);
  assert.equal(matchesAlertPreferences(closed, { statuses: ['closed'] }, NOW), true, '명시적으로 마감 필터를 고르면 기본 제외보다 우선한다');
});

test('임박순은 접수중, 예정, 날짜미상, 마감 순이고 최신순·세대수·가격순도 제공한다', () => {
  const open = commonNotice({ id: 'open', schedules: [{ kind: 'application', startDate: '2026-09-03', endDate: '2026-09-06' }], announcementDate: '2026-08-20', totalUnits: 100, maxPriceManWon: 60000 });
  const upcoming = commonNotice({ id: 'upcoming', announcementDate: '2026-09-02', totalUnits: 300, maxPriceManWon: 50000 });
  const unknown = commonNotice({ id: 'unknown', schedules: [], applicationStartDate: '', applicationEndDate: '', announcementDate: '2026-09-03', totalUnits: 200, maxPriceManWon: null });
  const closed = commonNotice({ id: 'closed', schedules: [{ kind: 'application', startDate: '2026-09-01', endDate: '2026-09-02' }], announcementDate: '2026-08-01', totalUnits: 400, maxPriceManWon: 40000 });
  assert.deepEqual(sortSupplyNotices([closed, unknown, upcoming, open], 'soon', NOW).map((item) => item.id), ['open', 'upcoming', 'unknown', 'closed']);
  assert.equal(sortSupplyNotices([open, upcoming, unknown], 'newest', NOW)[0].id, 'unknown');
  assert.equal(sortSupplyNotices([open, upcoming, unknown], 'units', NOW)[0].id, 'upcoming');
  assert.equal(sortSupplyNotices([open, upcoming, unknown], 'price', NOW)[0].id, 'upcoming');
});

test('화면 요약은 상태·지역·신혼 물량과 7일 내 시작·마감을 중복 공고 없이 센다', () => {
  const open = commonNotice({
    id: 'open', newlywedSupplyAvailable: true, program: 'newlywed-town',
    schedules: [{ kind: 'application', startDate: '2026-09-03', endDate: '2026-09-06' }],
  });
  const upcoming = commonNotice({
    id: 'upcoming', program: 'public-sale',
    locations: [{ regionKey: 'gyeonggi', sidoCode: '41', address: '경기도 수원시' }],
    schedules: [{ kind: 'application', startDate: '2026-09-10', endDate: '2026-09-11' }],
  });
  const closed = commonNotice({
    id: 'closed', schedules: [{ kind: 'application', startDate: '2026-08-01', endDate: '2026-08-02' }],
  });
  const summary = summarizeSupplyNotices([open, open, upcoming, closed], NOW);
  assert.deepEqual(summary, {
    total: 3,
    open: 1,
    upcoming: 1,
    closed: 1,
    unknown: 0,
    newlywed: 1,
    newlywedTown: 1,
    publicSale: 1,
    openingWithin7Days: 1,
    closingWithin7Days: 1,
    regions: { seoul: 2, gyeonggi: 1, other: 0 },
  });
});

test('첫 수집은 baseline으로 두고 이후 stable ID 차이만 새 공고로 계산한다', () => {
  const first = commonNotice({ id: 'first' });
  const second = commonNotice({ id: 'second' });
  assert.deepEqual(diffNewSupplyNotices([first], null), []);
  assert.deepEqual(diffNewSupplyNotices([first], null, { initialRunIsBaseline: false, now: NOW }).map((item) => item.id), ['first']);
  assert.deepEqual(diffNewSupplyNotices([first, second], [first], { now: NOW }).map((item) => item.id), ['second']);
});

test('읽음 자료는 객체·Set·공고 배열 모두 받아 중복 배지를 막는다', () => {
  const first = commonNotice({ id: 'first' });
  const second = commonNotice({ id: 'second' });
  assert.deepEqual(unreadSupplyNotices([first, second], { first: { seenAt: '2026-09-01' } }, { now: NOW }).map((item) => item.id), ['second']);
  assert.deepEqual(unreadSupplyNotices([first, second], new Set(['second']), { now: NOW }).map((item) => item.id), ['first']);
  assert.deepEqual(unreadSupplyNotices([first, second], [first], { now: NOW }).map((item) => item.id), ['second']);
});

test('알림 후보는 새 공고·미알림·관심 조건을 모두 만족할 때만 반환한다', () => {
  const previous = commonNotice({ id: 'previous' });
  const matching = commonNotice({ id: 'matching', newlywedSupplyAvailable: true, targetGroups: ['신혼부부'] });
  const alreadySeen = commonNotice({ id: 'seen', newlywedSupplyAvailable: true, targetGroups: ['신혼부부'] });
  const gyeonggi = commonNotice({
    id: 'gyeonggi', newlywedSupplyAvailable: true, targetGroups: ['신혼부부'],
    locations: [{ regionKey: 'gyeonggi', sidoCode: '41', address: '경기도 수원시' }],
  });
  const alerts = selectSupplyAlerts({
    current: [previous, matching, alreadySeen, gyeonggi],
    previous: [previous],
    seen: { seen: true },
    preferences: { regions: ['서울'], newlywedOnly: true },
    now: NOW,
  });
  assert.deepEqual(alerts.map((item) => item.id), ['matching']);
});
