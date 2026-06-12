// 몰디브 허니문 리조트 비교 데이터
// 출처: maldives_resorts_data.xml + maldives_report.html
// 여행일정: 2027-03-08~12 (4박 5일), 2인, 모든 가격 1인 USD

export const TRIP_INFO = {
  check_in: '2027-03-08',
  check_out: '2027-03-12',
  nights: 4,
  travelers: 2,
};

export const AGENCIES = {
  realmaldives: {
    name: '리얼몰디브',
    url: 'http://realmaldives.co.kr/',
    note: '몰디브인+전직 호텔리어 운영. 취소: 계약 3일 이내 환불 가능, 51일 전까지 전액환불. 24시간 카카오톡 대응.',
    discount_per_person: 0,
  },
  honeymoonresort: {
    name: '허니문리조트',
    url: 'http://www.honeymoonresort.co.kr',
    note: '허니문 전문. 취소: 35일 이내 100% 취소료. 잔금 출발 40일 전.',
    discount_per_person: 200,
    discount_always: 150,
    discount_limited: 50,
    discount_deadline: '2026-06-19',
  },
  tourmin: {
    name: '투어민',
    url: '',
    note: '투어민 제공 견적. PDF 견적서 없음.',
    discount_per_person: 0,
  },
};

// 가격 필드 기준 (1인 USD, 4박):
//   beach_4n       : 비치빌라 단독 4박
//   water_4n       : 워터/오션빌라(풀 없음) 단독 4박
//   water_pool_4n  : 워터풀빌라 단독 4박
//   mix_4n         : 비치2박+워터2박 믹스 4박
// null = 해당 조합 없음. 할인 후 가격은 별도 _disc 필드.

export const RESORTS = [
  // ─────────────────────────────────────────────────────────────────
  {
    id: 'cora_cora',
    num: 1,
    name_ko: '코라코라',
    name_en: 'Cora Cora Maldives',
    atoll: '라아 아톨',
    atoll_en: 'Raa Atoll',
    transfer_type: 'seaplane',
    transfer_minutes: 45,
    distance_km: 177,
    direction: '북서(NW)',
    opened: '2021',
    villas: 100,
    homepage: 'https://www.coracoraresorts.com/',
    mood: '활기찬_캐주얼',
    has_hammock: true,
    hammock_note: '욕실 히든 해먹 (라군 워터빌라)',
    honeymoon_tier: '중간',
    tags: ['라군중심', '다이닝최고', '소주포함', '선셋크루즈', '해먹'],

    ratings: { lagoon: 5, underwater: 4, privacy: 3, dining: 5 },

    description: '활기차고 밝은 에너제틱한 분위기. 100헥타르 넓은 에메랄드 라군이 최대 강점. 5개 레스토랑 모두 다인어라운드 무제한. 음식 퀄리티 높음. 욕실 히든 해먹이 커플 포토스팟으로 유명.',

    pros: [
      '100헥타르 넓은 에메랄드 라군, 바다색 최상급',
      '5개 레스토랑 다인어라운드 무제한 (이탈리안·일식·아시안·인터내셔널)',
      '프리미엄 주류 + 소주 무제한 포함',
      '욕실 히든 해먹 — 특별한 커플 포토스팟',
      '라군 넓고 수중환경도 좋음',
      '45분 스파 트리트먼트 1회 AI 포함',
      '선셋 크루즈 1회 포함',
    ],
    cons: [
      '활기찬 분위기 — 조용한 휴양 원하면 부적합',
      '말레에서 177km (수상비행기 45분)',
      '일부 스페셜 메뉴(데판야키 등) 별도 추가금',
      '100개 빌라로 완전한 프라이빗은 아님',
    ],

    agencies: {
      realmaldives: {
        meal_plan: 'PAI',
        meal_plan_name: '프리미엄 올인클루시브',
        beach_4n: null,
        water_4n: 2768,   // 라군빌라
        water_pool_4n: 3114, // 라군풀빌라
        mix_4n: 2825,     // 비치빌라2박+라군빌라2박
        room_notes: '라군빌라(워터), 라군풀빌라(워터풀), 비치+라군 믹스',
        promotions: [],
        honeymoon_benefits: [
          '로맨틱 침대 데코레이션 1회',
          '허니문 디너 1회 (Acquapazza 또는 Ginger Moon)',
          '기념 케이크 1회',
          '아로마틱 버블배스 + 로맨틱 턴다운 서비스 1회',
        ],
        honeymoon_comment: '허니문 디너 포함이 강점. 스파 1회는 AI 기본 포함.',
        cancellation: '계약 3일 이내 환불 / 51일 전 전액환불 / 50일 전~당일 100% 배상',
      },
      honeymoonresort: {
        meal_plan: 'AI',
        meal_plan_name: '올인클루시브',
        beach_4n: null,
        water_4n: 2868,
        water_4n_disc: 2668,
        water_pool_4n: 3214,
        water_pool_4n_disc: 3014,
        mix_4n: 2925,
        mix_4n_disc: 2725,
        discount_per_person: 200,
        discount_note: '6/19 이전 예약 시 1인 $200 할인',
        promotions: ['1인 $150 상시 + 6/19까지 추가 $50 = 최대 $200 할인'],
        honeymoon_benefits: [
          '로맨틱 침대 데코레이션 1회',
          '허니문 디너 1회 (Acquapazza 또는 Ginger Moon)',
          '기념 케이크 1회',
          '아로마틱 버블배스 + 로맨틱 턴다운 서비스 1회',
        ],
        honeymoon_comment: '리얼몰디브와 특전 동일. 가격 차이와 취소 규정이 선택 기준.',
        cancellation: '35일 이내 취소 100% 취소료',
      },
    },

    pdfs: [
      { file: 'data/패키지/27년@특가 [몰디브-코라코라] 리조트 4박 [1-12]-H 0413.pdf', label: '코라코라 특가 패키지' },
      { file: 'data/리조트별/임소희 님 - 270307 코라코라.pdf', label: '코라코라 견적서' },
    ],

    coords: { lat: 5.50, lon: 72.90 },
    svg_pin: { cx: 75, cy: 78, color: '#7F77DD', label: '코' },

    youtube_ids: ['i20UlJteOTQ', 'VTfkgPkT85A', 'LMYzHSpAkEM'],
    image_urls: [
      'https://www.neoscapesmaldives.com/wp-content/uploads/Cora-Cora-Maldives.jpg',
      'https://www.neoscapesmaldives.com/wp-content/uploads/Lagoon-Pool-Villa-Facade-Cora-Cora-Maldives-5.jpg',
      'https://www.neoscapesmaldives.com/wp-content/uploads/Beach-Villa-Cora-Cora-Maldives-2.jpg',
      'https://www.neoscapesmaldives.com/wp-content/uploads/Areal-Cora-Cora-Maldives-3.jpg',
    ],
    featured_image: '',
  },

  // ─────────────────────────────────────────────────────────────────
  {
    id: 'ananea',
    num: 2,
    name_ko: '아나네아',
    name_en: 'Ananea Madivaru Maldives',
    atoll: '노스 아리 아톨',
    atoll_en: 'North Ari Atoll',
    transfer_type: 'seaplane',
    transfer_minutes: 20,
    distance_km: 66,
    direction: '서(W)',
    opened: '2025',
    villas: 110,
    homepage: null,
    mood: '럭셔리_최신',
    has_hammock: true,
    hammock_note: '워터풀빌라 라군뷰에 해먹 있음',
    honeymoon_tier: '중간',
    tags: ['최신시설', '한식당', '20분수상비행기', '해먹', '9개레스토랑'],

    ratings: { lagoon: 5, underwater: 4, privacy: 4, dining: 5 },

    description: '2025년 3월 오픈한 몰디브 최신 럭셔리 리조트. 두 섬 연결 구조로 중앙 라군 최상급. 몰디브 유일 한식당(Seoul House) 포함 9개 레스토랑. 허니문리조트 담당자 추천 1위.',

    pros: [
      '수상비행기 20분 — 가장 짧은 이동시간',
      '2025년 3월 오픈 — 모든 시설 최신',
      '몰디브 유일 한식당(Seoul House) 포함 9개 레스토랑',
      '두 섬 연결 독특한 구조 + 중앙 라군 최상급',
      '워터풀빌라 라군뷰에 해먹 있음',
      'HB+ 예약 시 AI 무료 업그레이드 조건 (11/30 전 예약)',
      '허니문리조트 담당자 추천 1위',
    ],
    cons: [
      '2025년 오픈으로 온라인 후기 절대적 부족',
      '성수기 객실 빠른 마감',
      '허니문리조트 단독 취급 (리얼몰디브 없음)',
      '기본 플랜이 HB(조석식) — AI 업그레이드 별도 확인',
    ],

    agencies: {
      honeymoonresort: {
        meal_plan: 'HB',
        meal_plan_name: '조석식 (HB) — HB+ 업그레이드 시 AI 무료',
        // 아나네아는 모든 빌라가 풀빌라. beach_4n = 비치풀빌라
        beach_4n: 2829,       // 비치풀빌라 (HB)
        beach_4n_disc: 2629,
        water_4n: null,       // 일반 워터빌라 없음 (전부 풀빌라)
        water_pool_4n: 2982,  // 워터풀빌라 (HB)
        water_pool_4n_disc: 2782,
        mix_4n: 2906,         // 비치풀2박+워터풀2박 (HB)
        mix_4n_disc: 2706,
        // HB+ → AI 업그레이드 시 (11/30 전 예약)
        water_pool_4n_hbplus: 3322,
        water_pool_4n_hbplus_disc: 3122,  // HB+ 가격으로 AI 이용
        discount_per_person: 200,
        discount_note: '6/19 이전 예약 시 1인 $200 할인 + HB+ → AI 무료 업그레이드 (11/30 전)',
        promotions: ['HB+ → 다인어라운드 AI 무료 업그레이드 (11/30까지 예약 조건)'],
        honeymoon_benefits: [
          '침대 장식 1회',
          '과일 바구니',
          '해변에서 스파클링 와인 1병 + 캔들 디너 1회',
        ],
        honeymoon_comment: '캔들 디너 포함이 강점. 마사지·스파 미포함.',
        cancellation: '35일 이내 취소 100% 취소료 / 잔금 출발 60일 전 (성수기 70일)',
      },
    },

    pdfs: [
      { file: 'data/패키지/27년@특가 [몰디브-아나네아] 리조트 4박 EK,QR,EY [1-9]-Z 0325.pdf', label: '아나네아 특가 패키지' },
    ],

    coords: { lat: 4.00, lon: 72.80 },
    svg_pin: { cx: 90, cy: 256, color: '#185FA5', label: '아나' },

    youtube_ids: ['n8xHrToY8-w', 'WOseNXs1vqk', 'CKJIzL4WWR0'],
    image_urls: [
      'https://image-tc.galaxy.tf/wijpeg-cfejik4vw9kz5988ntdaix7x2/ananea-madivaru-112.jpg?width=1200',
      'https://image-tc.galaxy.tf/wijpeg-bggoggtrh11o5oext7nerzykz/ananea-madivaru-026.jpg?width=1200',
      'https://image-tc.galaxy.tf/wijpeg-8td7xw3ndgxyfdf47rpj3uin8/ananea-madivaru-079.jpg?width=1200',
      'https://image-tc.galaxy.tf/wijpeg-6fsesl9xb5hiuyx7c7obeydjp/ananea-madivaru-324.jpg?width=1200',
    ],
    featured_image: '',
  },

  // ─────────────────────────────────────────────────────────────────
  {
    id: 'veligandu',
    num: 3,
    name_ko: '벨리간두',
    name_en: 'Veligandu Maldives Resort Island',
    atoll: '노스 아리 아톨',
    atoll_en: 'North Ari Atoll',
    transfer_type: 'seaplane',
    transfer_minutes: 20,
    distance_km: 66,
    direction: '서(W)',
    opened: '2024',
    villas: 100,
    homepage: null,
    mood: '스노클링_액티브',
    has_hammock: false,
    hammock_note: '⚠️ 오션풀빌라에 해먹 없음. 해먹 원하면 일반 오션빌라 선택 필요.',
    honeymoon_tier: '단순',
    tags: ['고래상어투어', '스노클링명소', '20분수상비행기', '2024리노베이션', '만타레이'],

    ratings: { lagoon: 4, underwater: 5, privacy: 4, dining: 3 },

    description: '1984년 창립, 2024년 11월 전면 리노베이션 후 재오픈. 고래상어 투어 연중 가능. 스노클링 명소. 2025년 리얼몰디브 최다 선택 리조트.',

    pros: [
      '수상비행기 20분 — 말레 최근접',
      '2024년 11월 전면 리노베이션 — 신축 수준',
      '고래상어 투어 연중 가능 (라스두 아톨 인근)',
      '만타레이·너스샤크 투어 가능',
      '수중환경과 라군 균형 최고',
      '2025년 리얼몰디브 최다 선택 리조트',
    ],
    cons: [
      '⚠️ 오션풀빌라에 해먹 없음 (해먹은 일반 오션빌라에만)',
      '허니문 특전 단순 (샴페인·과일·베드데코만)',
      '레스토랑 1개 + 바 2개로 식사 다양성 부족',
      'HB+Bev 기본 플랜은 올인클루시브 아님 (중식 별도)',
    ],

    agencies: {
      realmaldives: {
        meal_plan: 'AI',
        meal_plan_name: '올인클루시브 (AI) — 특가: HB+Bev도 선택 가능',
        // AI 특가 (7/31까지 예약)
        beach_4n: 2360,       // 비치빌라 AI
        water_4n: 2472,       // 오션자쿠지빌라 AI
        water_pool_4n: 2850,  // 오션풀빌라 AI
        mix_4n: 2605,         // 비치빌라2박+오션풀빌라2박 AI
        // HB+Bev 특가 (더 저렴한 옵션)
        beach_4n_hb: 2108,
        water_pool_4n_hb: 2598,
        mix_4n_hb: 2353,
        discount_per_person: 0,
        discount_note: '특가: 26년 7/31까지 예약 조건',
        promotions: ['2026년 7월 31일까지 예약 특가 적용'],
        honeymoon_benefits: [
          '샴페인 반병',
          '과일 바구니 1회',
          '스페셜 베드 데코레이션 1회',
        ],
        honeymoon_comment: '9개 리조트 중 가장 단순한 특전. 스노클링·고래상어·이동편의가 강점.',
        cancellation: '계약 3일 이내 환불 / 51일 전 전액환불',
      },
    },

    pdfs: [
      { file: 'data/리조트별/임소희 님 - 270307 벨리간두.pdf', label: '벨리간두 견적서' },
    ],

    coords: { lat: 4.00, lon: 72.80 },
    svg_pin: { cx: 68, cy: 248, color: '#D85A30', label: '벨' },

    youtube_ids: ['PM298A8Ymtk', 'w-Wue2E0WwQ', '1WSY9DavJkg'],
    image_urls: [
      'https://veligandu.com/wp-content/uploads/2026/02/ISLAND-AERIAL-1024x576.jpg',
      'https://veligandu.com/wp-content/uploads/2024/11/Veligandu_Beach_Swing_819x1024.webp',
      'https://veligandu.com/wp-content/uploads/slider/cache/13151d5b2990e4c3cedaa768a799aeb6/SOPV2-0001.jpg',
    ],
    featured_image: '',
  },

  // ─────────────────────────────────────────────────────────────────
  {
    id: 'dhigufaru',
    num: 4,
    name_ko: '디구파루',
    name_en: 'Dhigufaru Island Resort',
    atoll: '바아 아톨',
    atoll_en: 'Baa Atoll',
    transfer_type: 'seaplane',
    transfer_minutes: 40,
    distance_km: 120,
    direction: '북서(NW)',
    opened: '2016',
    villas: 83,
    homepage: null,
    mood: '조용한_프라이빗',
    has_hammock: false,
    hammock_note: null,
    honeymoon_tier: '중간',
    tags: ['UNESCO생물권', '만타레이', '거북이', '최상급라군', '조용함', '가성비'],

    ratings: { lagoon: 5, underwater: 5, privacy: 5, dining: 3 },

    description: '몰디브 최상급 라군과 백사장. 유네스코 생물권 보존구역 인접. 거북이·가오리·만타레이. 조용하고 프라이빗. 6/30까지 예약 시 1단계 무료 업그레이드.',

    pros: [
      '몰디브 최상급 라군 — 바다색 최고 수준',
      '유네스코 보존구역 — 거북이·가오리·만타레이',
      '방 앞 스노클링 가능, 리프 근접, 유속 잔잔',
      '조용하고 프라이빗 — 신혼부부 최적',
      '2026-06-30까지 예약 시 1단계 무료 업그레이드 ⭐',
      'AID 플랜 — 석식 알라카르테 세트 선택 가능',
      '선셋 피싱·가이드 스노클링 포함',
    ],
    cons: [
      '섬이 작아 동선 단조로울 수 있음',
      '레스토랑 3개로 식사 다양성 부족',
      '허니문 청첩장 기준 6개월 이내 (타 리조트는 12개월)',
    ],

    agencies: {
      realmaldives: {
        meal_plan: 'AI',
        meal_plan_name: '올인클루시브 (AI) / AID(알라카르테 석식 포함)',
        beach_4n: 1747,       // 선라이즈비치빌라 AI
        water_4n: 2155,       // 선라이즈워터빌라 AI
        water_pool_4n: 2345,  // 선라이즈풀워터빌라 AI
        mix_4n: 2046,         // 비치선라이즈+워터풀선라이즈 AI
        // AID (알라카르테 석식 포함, 더 고급)
        water_4n_aid: 2405,
        water_pool_4n_aid: 2595,
        mix_4n_aid: 2296,
        discount_per_person: 0,
        discount_note: '6/30까지 예약 시 1단계 무료 업그레이드',
        promotions: ['2026-06-30까지 예약 시 객실 1단계 무료 업그레이드'],
        honeymoon_benefits: [
          '와인 1병',
          '침대 데코레이션 1회',
          '풀빌라 투숙 시 플로팅 조식 1회 (사전예약 필수)',
        ],
        honeymoon_comment: '풀빌라 선택 시 플로팅 조식 포함. 청첩장 6개월 기준 주의.',
        cancellation: '계약 3일 이내 환불 / 51일 전 전액환불',
      },
    },

    pdfs: [
      { file: 'data/리조트별/임소희 님 - 270307 디구파루.pdf', label: '디구파루 견적서' },
    ],

    coords: { lat: 5.10, lon: 72.90 },
    svg_pin: { cx: 103, cy: 152, color: '#D85A30', label: '디' },

    youtube_ids: ['G6HVSEXZBCo', '6sgjxRBvPIA', 'z3u3UuDniHg'],
    image_urls: [
      'https://dhigufaru.com/app/wp-content/uploads/2025/12/Dhigufaru-Island-Resort-1536x620.jpg',
      'https://dhigufaru.com/app/wp-content/uploads/2025/12/Veli-Beach-Sunset-1920x620.jpg',
      'https://dhigufaru.com/app/wp-content/uploads/2025/12/Pool-Beach-Villa-1920x620.jpg',
      'https://dhigufaru.com/app/wp-content/uploads/2026/01/Pool-Water-Villa--1920x620.jpg',
    ],
    featured_image: '',
  },

  // ─────────────────────────────────────────────────────────────────
  {
    id: 'furaveri',
    num: 5,
    name_ko: '푸라베리',
    name_en: 'Furaveri Maldives',
    atoll: '라아 아톨',
    atoll_en: 'Raa Atoll',
    transfer_type: 'seaplane',
    transfer_minutes: 45,
    distance_km: 150,
    direction: '북서(NW)',
    opened: '2016',
    villas: 168,
    homepage: null,
    mood: '로맨틱_프라이빗',
    has_hammock: true,
    hammock_note: '오션빌라 인피니티 위드 해먹 타입 있음',
    honeymoon_tier: '최상',
    tags: ['커플마사지포함', '해먹워터빌라', '조용함', '로맨틱', '6개레스토랑'],

    ratings: { lagoon: 4, underwater: 5, privacy: 5, dining: 4 },

    description: '"실제로 가보면 사진보다 훨씬 좋다"는 숨은 명소. 해먹 있는 오션빌라 인피니티 타입 있음. 허니문 특전에 60분 커플 마사지 포함 — 리얼몰디브 리조트 중 유일.',

    pros: [
      '오션빌라 인피니티 위드 해먹 — 해먹 있는 워터빌라 확보',
      '허니문 특전에 60분 커플 마사지 포함 (리얼몰디브 중 유일) ⭐',
      '유속 잔잔 — 초보자 스노클링 최적',
      '로맨틱한 빌라 (카잔 지붕·살라·큰 데크·해먹)',
      '6개 레스토랑 다이닝 다양성',
      '조용하고 프라이빗 (한국인 방문 적어 더 특별)',
      '비치풀빌라→자쿠지 무료 업그레이드 (7/31까지)',
    ],
    cons: [
      '한국어 후기 거의 없어 정보 수집 어려움',
      '식사가 크레딧 방식 — 초과 시 추가금 발생',
      '수상비행기 45분 — 라아 아톨 원거리',
    ],

    agencies: {
      realmaldives: {
        meal_plan: 'AI',
        meal_plan_name: '시 올인클루시브 (AI) — 크레딧 방식',
        beach_4n: 2133,       // 비치빌라
        water_4n: 2692,       // 오션빌라 인피니티 위드 해먹 ← 핵심!
        water_pool_4n: 2887,  // 오션풀빌라 선라이즈
        mix_4n: 2413,         // 비치빌라+오션빌라인피니티해먹
        discount_per_person: 0,
        discount_note: '7/31까지 특가 + 비치풀빌라→자쿠지 무료 업그레이드',
        promotions: ['2026년 7월 31일까지 특가', '비치풀빌라 → 위드자쿠지 무료 업그레이드 (객실 가능 시)'],
        honeymoon_benefits: [
          '와인 1병 + 과일 플레이터',
          '허니문 침대 장식',
          '기념 케이크',
          '스페셜 턴다운 서비스',
          '60분 커플 마사지 1회 (체크인 후 사전예약 필수)',
        ],
        honeymoon_comment: '리얼몰디브 6개 리조트 중 허니문 특전 가장 풍성. 60분 커플 마사지 포함 유일.',
        cancellation: '계약 3일 이내 환불 / 51일 전 전액환불',
      },
    },

    pdfs: [
      { file: 'data/리조트별/임소희 님 - 270307 푸라베리.pdf', label: '푸라베리 견적서' },
    ],

    coords: { lat: 5.50, lon: 73.00 },
    svg_pin: { cx: 102, cy: 80, color: '#D85A30', label: '푸라' },

    youtube_ids: ['LS_jGCiTZKc', 'ZCEvzb4YHaw', 'BYaTWFyLbTw'],
    image_urls: [
      'https://furaveri.com/wp-content/uploads/2022/04/GardenVilla_Sleep.jpg',
      'https://furaveri.com/wp-content/uploads/2025/05/BeachPoolVilla1_pool-scaled.jpg',
      'https://furaveri.com/wp-content/uploads/2022/04/Ocean-Villa-5-scaled.jpg',
      'https://furaveri.com/wp-content/uploads/2022/03/AerialView3-1024x575-1.jpg',
    ],
    featured_image: '',
  },

  // ─────────────────────────────────────────────────────────────────
  {
    id: 'fushifaru',
    num: 6,
    name_ko: '푸시파루',
    name_en: 'Fushifaru Maldives',
    atoll: '라비야니 아톨',
    atoll_en: 'Lhaviyani Atoll',
    transfer_type: 'seaplane',
    transfer_minutes: 35,
    distance_km: 130,
    direction: '북북동(NNE)',
    opened: '2017',
    villas: 63,
    homepage: null,
    mood: '부티크_럭셔리',
    has_hammock: false,
    hammock_note: null,
    honeymoon_tier: '단순',
    tags: ['부티크63개', '버틀러서비스', '만타레이', '샌드뱅크', 'TripAdvisor4.8'],

    ratings: { lagoon: 4, underwater: 5, privacy: 5, dining: 3 },

    description: '63개 소형 부티크 럭셔리 리조트. 버틀러 서비스. 푸시파루 틸라(만타레이 클리닝 스테이션) 바로 옆. 긴 샌드뱅크 포토스팟. TripAdvisor 4.8/5.',

    pros: [
      '63개 소형 부티크 — 최고의 프라이빗',
      '수상비행기 35분 (정북 직선, 라아/바아보다 빠름)',
      '만타레이 시즌(9~3월) — 3월은 막바지 가능',
      '긴 샌드뱅크 포토스팟 — 인생사진',
      '버틀러 서비스 (WhatsApp 즉각 응대)',
      'TripAdvisor 4.8/5 고평점',
      '2023년 전 객실 리노베이션 완료',
    ],
    cons: [
      '허니문 특전 가장 단순 (와인+턴다운만)',
      '3월은 만타 시즌 막바지 — 보장 불가',
      '레스토랑 3개로 식사 다양성 부족',
    ],

    agencies: {
      realmaldives: {
        meal_plan: 'AI',
        meal_plan_name: '올인클루시브 (AI)',
        beach_4n: 2494,       // 비치빌라 선셋
        water_4n: 2764,       // 자쿠지워터빌라
        water_pool_4n: 2992,  // 풀워터빌라
        mix_4n: 2581,         // 비치선셋2박+자쿠지워터2박
        discount_per_person: 0,
        promotions: [],
        honeymoon_benefits: [
          '와인 1병 + 스낵',
          '스페셜 턴다운 서비스 1회',
        ],
        honeymoon_comment: '9개 리조트 중 특전 가장 단순. 리조트 자체 퀄리티로 승부.',
        cancellation: '계약 3일 이내 환불 / 51일 전 전액환불',
      },
    },

    pdfs: [
      { file: 'data/리조트별/임소희 님 - 270307 푸시파루.pdf', label: '푸시파루 견적서' },
    ],

    coords: { lat: 5.30, lon: 73.60 },
    svg_pin: { cx: 202, cy: 122, color: '#D85A30', label: '푸시' },

    youtube_ids: ['OTAb8F8sStw', 'udf6i_5ku0w', 'uyusMa5j64Y'],
    image_urls: [
      'https://www.fushifaru.com/wp-content/uploads/2025/03/villas-1.webp',
      'https://www.fushifaru.com/wp-content/uploads/2025/03/villas-2.webp',
      'https://www.fushifaru.com/wp-content/uploads/2026/03/Heroshot-04-scaled.jpg',
      'https://www.fushifaru.com/wp-content/uploads/2026/06/MF-5039-scaled.jpg',
    ],
    featured_image: '',
  },

  // ─────────────────────────────────────────────────────────────────
  {
    id: 'raaya',
    num: 7,
    name_ko: '라야 바이 앳모스피어',
    name_en: 'Raaya by Atmosphere',
    atoll: '라아 아톨',
    atoll_en: 'Raa Atoll',
    transfer_type: 'seaplane',
    transfer_minutes: 45,
    distance_km: 145,
    direction: '북서(NW)',
    opened: '2023',
    villas: 187,
    homepage: null,
    mood: '다이닝_스파_성인',
    has_hammock: true,
    hammock_note: '워터빌라(풀 아닌 것)에 해먹 있음',
    honeymoon_tier: '중간',
    tags: ['스파2회포함', '6개레스토랑', '성인전용', '해먹', '선셋크루즈'],

    ratings: { lagoon: 4, underwater: 3, privacy: 4, dining: 5 },

    description: '2023년 오픈. 예술적 인테리어. 6개 레스토랑+3바, 프리미엄 주류 무료. AI에 스파 45분 2회 포함(4박). 성인 위주. 워터빌라에 해먹 있음.',

    pros: [
      '6개 레스토랑+3바 — 식도락 최고',
      '프리미엄 주류 모두 무제한',
      'AI에 스파 2회(45분) 포함 (4박 기준) ⭐',
      '워터빌라 해먹 있음',
      '성인 위주 분위기',
      '선셋 크루즈 포함',
      '워터빌라+워터풀빌라 믹스 시 해먹+풀 모두 경험 가능',
    ],
    cons: [
      '금요일 갈라디너 시 RAAYA Life 외 모든 레스토랑 닫힘',
      '수중환경이 라아 아톨 내에서 약한 편',
      '대부분 객실 아동 불가 (비치풀빌라만 1명)',
    ],

    agencies: {
      realmaldives: {
        meal_plan: 'AI',
        meal_plan_name: '올인클루시브 (AI)',
        // 3/8~12일은 1월5일~3월19일 시즌
        beach_4n: 2329,       // 비치빌라
        water_4n: 2383,       // 워터빌라 (해먹 있음!)
        water_pool_4n: 2545,  // 워터빌라 위드풀
        mix_4n: 2356,         // 비치빌라2박+워터빌라2박
        discount_per_person: 0,
        discount_note: '10/10까지 예약 특가',
        promotions: ['2026년 10월 10일까지 예약 특가'],
        honeymoon_benefits: [
          '로맨틱 침대 장식',
          '허니문 케이크',
          '허니문 기프트',
          '플로팅 조식 1회 (풀빌라 투숙 시만)',
          '로맨틱 비치 디너 1회 (6박 이상만 — 4박은 해당 없음)',
        ],
        honeymoon_comment: 'AI에 스파 2회 포함이 강점. 비치 디너는 6박 이상만. 청첩장 6개월 기준 주의.',
        cancellation: '계약 3일 이내 환불 / 51일 전 전액환불',
      },
    },

    pdfs: [
      { file: 'data/패키지/27년@특가 [몰디브-앳모스피어 바루] 리조트 4박 EK,QR,EY [1-9]-Z 0521.pdf', label: '앳모스피어 특가 패키지' },
      { file: 'data/리조트별/임소희 님 - 270307 라야 바이 앳모스피어.pdf', label: '라야 견적서' },
    ],

    coords: { lat: 5.30, lon: 72.90 },
    svg_pin: { cx: 74, cy: 106, color: '#D85A30', label: '라야' },

    youtube_ids: ['v6y3Soz3fnc', 'BQzSpDUr9A8'],
    image_urls: [
      'https://www.neoscapesmaldives.com/wp-content/uploads/Raaya-by-Atmosphere.jpg',
      'https://www.neoscapesmaldives.com/wp-content/uploads/Amari-Raaya-Maldives-Beach-Pool-Villa-Pool-View-9.jpg',
      'https://www.neoscapesmaldives.com/wp-content/uploads/Arm-Aerial-Ocean-Villas-9.jpg',
      'https://www.neoscapesmaldives.com/wp-content/uploads/Amari-Raaya-Maldives-Exterior-Ocean-Villas-View-From-Beach-Sunset-3.jpg',
    ],
    featured_image: '',
  },

  // ─────────────────────────────────────────────────────────────────
  {
    id: 'varu',
    num: 8,
    name_ko: '앳모스피어 바루',
    name_en: 'Varu by Atmosphere',
    atoll: '노스 말레 아톨',
    atoll_en: 'North Malé Atoll',
    transfer_type: 'speedboat',
    transfer_minutes: 40,
    distance_km: 10,
    direction: '북(N)',
    opened: '2019',
    villas: 108,
    homepage: 'https://www.varu-atmosphere.com',
    mood: '가성비_올인클루시브',
    has_hammock: false,
    hammock_note: null,
    honeymoon_tier: '최상',
    tags: ['스피드보트', '비치디너포함', '스파포함', '40종와인', '스타게이징'],

    ratings: { lagoon: 4, underwater: 4, privacy: 4, dining: 4 },

    description: '노스 말레 아톨. 스피드보트 40분. 바루 프리미엄 AI. 스파 45분 1회 포함(4박). 선셋 크루즈 or 스타게이징 선택. 허니문 특전에 로맨틱 비치 디너 포함.',

    pros: [
      '스피드보트 이동 — 날씨 무관, 비용 포함',
      '스파 45분 1회 AI 포함 (4박)',
      '선셋 크루즈 or 스타게이징 크루즈 선택',
      '허니문 특전에 로맨틱 비치 디너 포함 ⭐',
      '40종 이상 와인, 프리미엄 주류 포함',
      '전통 보두베루 환영 + 로즈 샴페인',
      '허니문리조트 $200 할인 적용',
    ],
    cons: [
      '수상비행기 경험 없음 (몰디브 핵심 경험 미싱)',
      '말레 아톨 수중환경이 원거리 아톨보다 약함',
      '금요일 갈라디너 시 타 레스토랑 운영 중단',
    ],

    agencies: {
      honeymoonresort: {
        meal_plan: 'VARU_PLAN',
        meal_plan_name: '바루 프리미엄 올인클루시브',
        // 3/8~12일은 1월5일~3월19일 시즌
        beach_4n: 2180,
        beach_4n_disc: 1980,
        water_4n: 2324,
        water_4n_disc: 2124,
        water_pool_4n: 2774,
        water_pool_4n_disc: 2574,
        mix_4n: 2252,
        mix_4n_disc: 2052,
        discount_per_person: 200,
        discount_note: '6/19 이전 예약 시 1인 $200 할인',
        promotions: ['10/10까지 예약 특가', '1인 $200 할인 (6/19까지)'],
        honeymoon_benefits: [
          '로맨틱 버블배스 + 침대 장식 (도착일 or 둘째날)',
          '로맨틱 비치 디너 1회',
          '허니문 케이크',
          '허니문 메멘토',
        ],
        honeymoon_comment: '비치 디너 4박부터 포함 강점. 스파 1회는 AI 기본 포함.',
        cancellation: '35일 이내 취소 100% 취소료',
      },
    },

    pdfs: [],

    coords: { lat: 4.30, lon: 73.40 },
    svg_pin: { cx: 178, cy: 214, color: '#185FA5', label: '바루' },

    youtube_ids: ['aa6ltrVtRyM', 'yc5aF_urq4o', 'd03h9-BViIw'],
    image_urls: [
      'https://www.neoscapesmaldives.com/wp-content/uploads/VARU-BY-ATMOSPHERE-AERIALS-AND-GENERIC-ISLAND-AERIAL-07-1.jpg',
      'https://www.neoscapesmaldives.com/wp-content/uploads/BEACH-VILLAS-1.jpg',
      'https://www.neoscapesmaldives.com/wp-content/uploads/WATER-VILLAS-1.jpg',
      'https://www.neoscapesmaldives.com/wp-content/uploads/VARU-BY-ATMOSPHERE-VILLAS-BEACH-VILLA-WITH-POOL-DECK-VIEW-02-1.jpg',
    ],
    featured_image: '',
  },

  // ─────────────────────────────────────────────────────────────────
  {
    id: 'saii_so',
    num: 9,
    name_ko: '사이라군 + SO몰디브',
    name_en: 'SAii Lagoon + SO/ Maldives',
    atoll: '사우스 말레 아톨',
    atoll_en: 'South Malé Atoll',
    transfer_type: 'speedboat',
    transfer_minutes: 15,
    distance_km: 10,
    direction: '남(S)',
    opened: '2019 / 2024',
    villas: null,
    homepage: null,
    mood: '편의성_다양성',
    has_hammock: false,
    hammock_note: null,
    honeymoon_tier: '최상',
    tags: ['커플마사지포함', '플로팅조식', '15분스피드보트', '두리조트경험', '14개레스토랑'],

    ratings: { lagoon: 3, underwater: 3, privacy: 3, dining: 5 },

    description: '말레에서 스피드보트 15분. 크로스로드 복합단지. 사이라군 2박+SO몰디브 2박 믹스. SO 구간에 60분 커플 마사지 + 플로팅 조식 포함. 총 14개+ 레스토랑.',

    pros: [
      '스피드보트 15분 — 최근접',
      '크로스로드 전체 14개+ 레스토랑',
      'SO 투숙 시 60분 커플 마사지 + 플로팅 조식 ⭐',
      '두 리조트 경험 (사이라군 + SO)',
      '마리나 쇼핑·다이닝 이용',
      '허니문리조트 $200 할인 적용',
    ],
    cons: [
      '전통 몰디브 분위기 약함',
      '사이라군: 수영장 없는 비치룸만 가능',
      '2박마다 이동 — 짐 싸는 번거로움',
      '라군뷰·수중환경 원거리 아톨보다 약함',
    ],

    agencies: {
      honeymoonresort: {
        meal_plan: 'AI',
        meal_plan_name: '올인클루시브 (믹스 상품만 제공)',
        // 믹스 전용 상품 — beach/water 단독 없음
        beach_4n: null,
        water_4n: null,
        water_pool_4n: null,
        mix_4n: 2480,         // 비치룸2박+오버워터풀빌라2박 (성수기)
        mix_4n_disc: 2280,
        discount_per_person: 200,
        discount_note: '6/19 이전 예약 시 1인 $200 할인',
        promotions: ['8/31까지 예약 조건', '1인 $200 할인 (6/19까지)'],
        honeymoon_benefits: [
          '[사이라군] 허니문 셋업 1회',
          '[사이라군] 와인 1병',
          '[SO몰디브] 플로팅 조식 1회',
          '[SO몰디브] 60분 커플 발리니스 마사지 1회',
        ],
        honeymoon_comment: 'SO 구간에 마사지+플로팅조식 포함. 청첩장 6개월 기준 주의.',
        cancellation: '35일 이내 취소 100% 취소료',
      },
    },

    pdfs: [
      { file: 'data/패키지/27년@특가 [몰디브-사이라군,SO몰디브 믹스] 리조트 4박 [1-9]-S 0522.pdf', label: '사이라군+SO 특가 패키지' },
    ],

    coords: { lat: 4.10, lon: 73.50 },
    svg_pin: { cx: 200, cy: 258, color: '#185FA5', label: '사이' },

    youtube_ids: ['JOp-7_B21LU', '78NHW9RYiaA', 'nU5EUMwXJH4'],
    image_urls: [
      'https://www.saiihotels.com/wp-content/uploads/2026/02/MLEGSQQ_Resort_Aerial_05-scaled.jpg',
      'https://www.saiihotels.com/wp-content/uploads/2026/02/MLEGSQQ_Resort_Aerial_01-scaled.jpg',
      'https://www.saiihotels.com/wp-content/uploads/2026/01/MLEGSQQ_BeachVillaKing_Bedroom_1-scaled.jpg',
      'https://www.saiihotels.com/wp-content/uploads/2026/02/MLEGSQQ_OverwaterVilla_SunsetView_1-scaled.jpg',
    ],
    featured_image: '',
  },

  // ─────────────────────────────────────────────────────────────────
  {
    id: 'emerald',
    num: 10,
    name_ko: '에메랄드 파스멘두',
    name_en: 'Emerald Faarufushi Resort & Spa',
    atoll: '라아 아톨',
    atoll_en: 'Raa Atoll',
    transfer_type: 'seaplane',
    transfer_minutes: 50,
    distance_km: 160,
    direction: '북서(NW)',
    opened: '2019',
    villas: 80,
    homepage: 'https://www.emerald-faarufushi.com',
    mood: '럭셔리_올인클루시브',
    has_hammock: false,
    hammock_note: null,
    honeymoon_tier: '최상',
    tags: ['LHW회원', '수상비행기', '이탈리아럭셔리', '프리미엄와인40종', '하우스리프', 'AI'],

    ratings: { lagoon: 5, underwater: 5, privacy: 4, dining: 5 },

    description: '라아 아톨 수상비행기 50분. LHW(Leading Hotels of the World) 회원 이탈리아 럭셔리 브랜드 Emerald Collection 운영. 디럭스 프리미엄 AI — 프리미엄 와인/샴페인/위스키 40여 종 포함, 알라카르테 메인코스 무제한, 소믈리에 5명 상주. 하우스리프 우수.',

    pros: [
      'LHW 멤버 — 9개 중 다이닝·주류 퀄리티 최상위',
      '알라카르테 무제한 + 소믈리에 5명 상주',
      '하우스리프 우수, 객실 앞 직접 스노클링',
      '트립어드바이저 최상위 평점',
      '허니문: 스파 60분 + 비치 로맨틱 디너 포함',
    ],
    cons: [
      '가격 최고가 — 12개 리조트 중 최상위',
      '수상비행기 50분 이동, 날씨 영향 있음',
      '투어민 단독 제공 (타 여행사 비교 불가)',
    ],

    agencies: {
      tourmin: {
        meal_plan: 'DAI',
        meal_plan_name: '디럭스 프리미엄 올인클루시브',
        water_4n: 3198,
        water_pool_4n: 3293,
        mix_4n: 3517,
        honeymoon_benefits: [
          '스파 60분 1회',
          '샴페인 1병 (도착일)',
          '비치 로맨틱 디너 1회',
          '체크인 시 가능 시 객실 업그레이드',
          '4박 이상: 돌핀투어 or 전통낚시 1회 (택1)',
        ],
        honeymoon_comment: '스파+로맨틱 디너 포함. 다이닝 퀄리티 12개 리조트 중 최상.',
        cancellation: '투어민 확인 필요',
        price_note: '요금 적용기간 2027-01-11 ~ 2027-04-11 (3월 포함)',
      },
    },

    pdfs: [],

    coords: { lat: 5.85, lon: 72.98 },
    svg_pin: { cx: 108, cy: 96, color: '#9b59b6', label: '에메' },

    youtube_ids: ['b9xhHmjxJnM', 'oE40_1VxGVE', 'MrEvVTrZbNw'],
    image_urls: [
      'https://cdn.prod.website-files.com/614dd23228b0182a7ae09c18/61649add64745861533c6b8b_xs_faarufushi-bg-video.jpg',
      'https://cdn.prod.website-files.com/614dd23228b0182a7ae09c18/663e4297d15472ac142715fc_xs_faarufushi_eclipse4.jpg',
      'https://cdn.prod.website-files.com/614dd23228b0182a7ae09c18/663e45a1b90054db08849c51_xs_faarufushi_medit5.jpg',
    ],
    featured_image: '',
  },

  // ─────────────────────────────────────────────────────────────────
  {
    id: 'oblu_sangeli',
    num: 11,
    name_ko: '오블루 상겔리',
    name_en: 'OBLU SELECT Sangeli',
    atoll: '노스 말레 아톨',
    atoll_en: 'North Malé Atoll',
    transfer_type: 'speedboat',
    transfer_minutes: 50,
    distance_km: 18,
    direction: '북(N)',
    opened: '2017',
    villas: 120,
    homepage: 'https://www.coloursofoblu.com/oblu-select-sangeli',
    mood: '가성비_럭셔리',
    has_hammock: false,
    hammock_note: null,
    honeymoon_tier: '최상',
    tags: ['스피드보트', '성인전용', '프라이빗', '가성비럭셔리', 'AI', '스파포함'],

    ratings: { lagoon: 4, underwater: 4, privacy: 5, dining: 4 },

    description: '노스 말레 아톨 스피드보트 50분. 모던/세련된 디자인, 객실 간 간격 넓어 프라이빗. 성인 전용 섬(One Banyan Island) + 성인전용 바 보유. 라군 넓고 하우스리프 접근성 좋음. 12개 중 가격 최저 포지션.',

    pros: [
      '12개 중 가격 최저 — 워터빌라 $2,182~',
      '스피드보트 50분 — 수상비행기 대비 저렴·확실',
      '성인 전용 섬 + 성인전용 바 운영',
      '스파 45분 + Specialty Dining 2회 기본 포함',
      '다양한 레스토랑 구성 (Just Wok, Just Grill 등)',
    ],
    cons: [
      '프리미엄 주류 구성은 에메랄드 대비 약함',
      '수상비행기 경험 없음',
      '투어민 단독 제공 (타 여행사 비교 불가)',
    ],

    agencies: {
      tourmin: {
        meal_plan: 'SERENITY',
        meal_plan_name: '세러너티 AI 플랜',
        beach_4n: 2182,
        water_4n: 2236,
        water_pool_4n: 2632,
        mix_4n: 2406,
        honeymoon_benefits: [
          '로맨틱 침대장식 1회',
          '로맨틱 캔들릿 디너 1회',
          '허니문 케이크 1회',
          '로맨틱 턴다운 (아로마틱 버블배스) 1회',
          '허니문 기프트 1회',
        ],
        honeymoon_comment: '5종 특전 포함으로 허니문 특전 구성 충실. 스파·스페셜티 다이닝은 AI 기본 포함.',
        cancellation: '35일 이내 취소 100% 취소료',
        price_note: '요금 적용기간 2027-01-05 ~ 2027-04-09 (3월 포함)',
      },
    },

    pdfs: [],

    coords: { lat: 4.40, lon: 73.55 },
    svg_pin: { cx: 200, cy: 218, color: '#185FA5', label: '오블루' },

    youtube_ids: ['qYAe3-ytPvo', 'j5qyQ8_83xY', 'HqQTo1POia8'],
    image_urls: [],
    featured_image: '',
  },

  // ─────────────────────────────────────────────────────────────────
  {
    id: 'outrigger',
    num: 12,
    name_ko: '아웃리거 마푸시바루',
    name_en: 'Outrigger Maldives Maafushivaru Resort',
    atoll: '사우스 아리 아톨',
    atoll_en: 'South Ari Atoll',
    transfer_type: 'seaplane',
    transfer_minutes: 25,
    distance_km: 90,
    direction: '서(W)',
    opened: '2020',
    villas: 81,
    homepage: 'https://www.outrigger.com/hotels-resorts/maldives/outrigger-maldives-maafushivaru-resort',
    mood: '모던_파인다이닝',
    has_hammock: false,
    hammock_note: null,
    honeymoon_tier: '중간',
    tags: ['수상비행기25분', '고래상어투어', '파인다이닝', '화이트모던', '신혼인기'],

    ratings: { lagoon: 4, underwater: 5, privacy: 4, dining: 4 },

    description: '사우스 아리 아톨 수상비행기 25분 (12개 중 최단 이동). 2020년 리빌딩 화이트톤 모던 디자인, 신부들에게 인기. 고래상어 투어 연중 가능. Art-I-San 파인다이닝 레스토랑 운영.',

    pros: [
      '수상비행기 25분 — 12개 중 이동 가장 짧음',
      '고래상어 투어 연중 가능 (사우스 아리 아톨)',
      '2020년 신축 화이트톤 모던 디자인',
      '파인다이닝 Art-I-San 등 고급 레스토랑',
      '다양한 할인 혜택 (스파·다이닝·워터스포츠)',
    ],
    cons: [
      '⚠️ 2027년 3월 요금표 미확정 — 투어민 재확인 필요',
      '허니문 특전이 3개로 에메랄드·오블루보다 적음',
      '투어민 단독 제공 (타 여행사 비교 불가)',
    ],

    agencies: {
      tourmin: {
        meal_plan: 'AI',
        meal_plan_name: 'Dine Around 올인클루시브',
        beach_4n: 3260,
        water_4n: 3060,
        water_pool_4n: 3240,
        mix_4n: 3250,
        honeymoon_benefits: [
          '도착 시 스파클링 와인 1병',
          '과일바구니 + 허니문 케이크',
          '로맨틱 침대장식 + 욕조셋업 1회',
        ],
        honeymoon_comment: '기본 3종 특전. 허니문리조트 기준보다 단출하나 Destination Dining 25% 할인 등 부가혜택 다수.',
        cancellation: '투어민 확인 필요',
        price_note: '⚠️ 2026년 1-2월 기준 참고가격. 2027년 3월 요금 미확정 — 반드시 재확인.',
      },
    },

    pdfs: [],

    coords: { lat: 3.75, lon: 72.82 },
    svg_pin: { cx: 76, cy: 285, color: '#D85A30', label: '아웃' },

    youtube_ids: ['Br9owPz9eRQ', 'ormGNZQVXs8', 'nddJH3VHEnc'],
    image_urls: [],
    featured_image: '',
  },
];

// ─────────────────────────────────────────────────────────────────────
// 헬퍼 함수들

/** 대표 이미지: featured_image 우선, 없으면 image_urls[0] */
export function getFeaturedImage(resort) {
  try {
    const stored = localStorage.getItem('featured_img_' + resort.id);
    if (stored) return stored;
  } catch (_) {}
  return resort.featured_image || resort.image_urls?.[0] || null;
}

/** 특정 정렬 기준에 따라 RESORTS를 정렬하고 best price를 반환 */
export function getBestPrice(resort, priceKey = 'water_pool_4n') {
  const agencies = resort.agencies;
  const prices = [];
  for (const ag of Object.values(agencies)) {
    const disc = ag[priceKey + '_disc'];
    const base = ag[priceKey];
    if (disc != null) prices.push(disc);
    else if (base != null) prices.push(base);
  }
  return prices.length ? Math.min(...prices) : null;
}

/** 리조트를 특정 가격 기준으로 정렬 (null 은 마지막) */
export function sortByPrice(resorts, priceKey) {
  return [...resorts].sort((a, b) => {
    const pa = getBestPrice(a, priceKey);
    const pb = getBestPrice(b, priceKey);
    if (pa == null && pb == null) return 0;
    if (pa == null) return 1;
    if (pb == null) return -1;
    return pa - pb;
  });
}

/** 리조트 ID로 단일 리조트 조회 */
export function getResortById(id) {
  return RESORTS.find(r => r.id === id) ?? null;
}
