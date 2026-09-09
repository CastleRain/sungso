const IS_LOCAL_RUNTIME = typeof window !== 'undefined'
  && ['localhost', '127.0.0.1'].includes(window.location.hostname);
const LOCAL_MARKET_API = 'http://127.0.0.1:8787/api';
// Public endpoint only. Provider keys stay on the authenticated Render server;
// localhost continues to use its own API and private Firebase backups stay separate.
const CLOUD_API_BASE_URL = 'https://sungso-homehunt-api.onrender.com/api';
const ACTIVE_MARKET_API = IS_LOCAL_RUNTIME ? LOCAL_MARKET_API : CLOUD_API_BASE_URL;

export const APP_CONFIG = Object.freeze({
  isLocalRuntime: IS_LOCAL_RUNTIME,
  cloudApiBaseUrl: CLOUD_API_BASE_URL,
  cloudStorageEnabled: true,
  firebaseConfig: Object.freeze({
    apiKey: 'AIzaSyBz-P5ycMAjYZBV7hkcZDrmq28EAw7Hsp8',
    authDomain: 'sungso-358cb.firebaseapp.com',
    projectId: 'sungso-358cb',
    storageBucket: 'sungso-358cb.firebasestorage.app',
    messagingSenderId: '143797950443',
    appId: '1:143797950443:web:95b0f616246d84aae3bae',
  }),
  naverMapClientId: 'jjk1t3dw7m',
  marketSummaryUrl: './data/market-summary.json',
  apartmentHistoryStaticUrl: './data/apartment-history.json',
  apartmentCatalogUrl: './data/apartment-catalog-seoul-gyeonggi.json',
  apartmentCatalogMetaUrl: './data/apartment-catalog-seoul-gyeonggi-meta.json',
  lawDistrictsUrl: './data/law-districts.json',
  supplyStaticUrl: './data/home-supply.json',
  supplyFeedUrl: IS_LOCAL_RUNTIME ? `${LOCAL_MARKET_API}/supply` : './data/home-supply.json',
  apartmentHistoryUrl: ACTIVE_MARKET_API
    ? `${ACTIVE_MARKET_API}/apartment-history`
    : 'https://us-central1-sungso-358cb.cloudfunctions.net/apartmentHistory',
  localMarketHealthUrl: ACTIVE_MARKET_API ? `${ACTIVE_MARKET_API}/health` : '',
  localMarketConfigUrl: IS_LOCAL_RUNTIME ? `${LOCAL_MARKET_API}/config` : '',
  recommendationUrl: ACTIVE_MARKET_API ? `${ACTIVE_MARKET_API}/recommendations` : '',
  commuteUrl: ACTIVE_MARKET_API ? `${ACTIVE_MARKET_API}/commute` : '',
  commuteBatchUrl: ACTIVE_MARKET_API ? `${ACTIVE_MARKET_API}/commute/batch` : '',
  commuteQuotaUrl: ACTIVE_MARKET_API ? `${ACTIVE_MARKET_API}/commute/quota` : '',
  placeSearchUrl: ACTIVE_MARKET_API ? `${ACTIVE_MARKET_API}/place-search` : '',
  officialComplexUrl: ACTIVE_MARKET_API ? `${ACTIVE_MARKET_API}/kapt/complex` : '',
  localMarketEnabled: Boolean(ACTIVE_MARKET_API),
  apartmentHistoryMonths: 60,
  // Live history uses the active server; an empty cloud URL disables online
  // requests while preserving the public collected files and personal backups.
  apartmentHistoryEnabled: Boolean(ACTIVE_MARKET_API),
  // UI and localhost API evolve independently. Keep appVersion as a backwards
  // compatible alias for code that still reads the API contract version.
  uiVersion: '4.18.0',
  localApiContractVersion: '2.11.0',
  appVersion: '2.11.0',
});

export const REGIONS = Object.freeze([
  { code: '11680', sido: '서울특별시', district: '강남구', name: '서울 강남구', center: [37.5172, 127.0473] },
  { code: '11710', sido: '서울특별시', district: '송파구', name: '서울 송파구', center: [37.5145, 127.1059] },
  { code: '11200', sido: '서울특별시', district: '성동구', name: '서울 성동구', center: [37.5633, 127.0369] },
  { code: '11440', sido: '서울특별시', district: '마포구', name: '서울 마포구', center: [37.5663, 126.9019] },
  { code: '11170', sido: '서울특별시', district: '용산구', name: '서울 용산구', center: [37.5326, 126.9900] },
  { code: '11560', sido: '서울특별시', district: '영등포구', name: '서울 영등포구', center: [37.5264, 126.8963] },
  { code: '41135', sido: '경기도', district: '성남시 분당구', name: '경기 성남시 분당구', center: [37.3825, 127.1190] },
  { code: '41290', sido: '경기도', district: '과천시', name: '경기 과천시', center: [37.4292, 126.9876] },
  { code: '41465', sido: '경기도', district: '용인시 수지구', name: '경기 용인시 수지구', center: [37.3221, 127.0976] },
]);

export function regionForAddress(address = '') {
  return REGIONS.find((region) => address.includes(region.district)) || null;
}
