const IS_LOCAL_RUNTIME = typeof window !== 'undefined'
  && ['localhost', '127.0.0.1'].includes(window.location.hostname);
const LOCAL_MARKET_API = 'http://127.0.0.1:8787/api';

export const APP_CONFIG = Object.freeze({
  naverMapClientId: 'jjk1t3dw7m',
  marketSummaryUrl: './data/market-summary.json',
  apartmentHistoryStaticUrl: './data/apartment-history.json',
  apartmentCatalogUrl: './data/apartment-catalog-seoul-gyeonggi.json',
  apartmentCatalogMetaUrl: './data/apartment-catalog-seoul-gyeonggi-meta.json',
  lawDistrictsUrl: './data/law-districts.json',
  supplyStaticUrl: './data/home-supply.json',
  supplyFeedUrl: IS_LOCAL_RUNTIME ? `${LOCAL_MARKET_API}/supply` : './data/home-supply.json',
  apartmentHistoryUrl: IS_LOCAL_RUNTIME
    ? `${LOCAL_MARKET_API}/apartment-history`
    : 'https://us-central1-sungso-358cb.cloudfunctions.net/apartmentHistory',
  localMarketHealthUrl: IS_LOCAL_RUNTIME ? `${LOCAL_MARKET_API}/health` : '',
  localMarketConfigUrl: IS_LOCAL_RUNTIME ? `${LOCAL_MARKET_API}/config` : '',
  recommendationUrl: IS_LOCAL_RUNTIME ? `${LOCAL_MARKET_API}/recommendations` : '',
  commuteUrl: IS_LOCAL_RUNTIME ? `${LOCAL_MARKET_API}/commute` : '',
  commuteBatchUrl: IS_LOCAL_RUNTIME ? `${LOCAL_MARKET_API}/commute/batch` : '',
  commuteQuotaUrl: IS_LOCAL_RUNTIME ? `${LOCAL_MARKET_API}/commute/quota` : '',
  placeSearchUrl: IS_LOCAL_RUNTIME ? `${LOCAL_MARKET_API}/place-search` : '',
  localMarketEnabled: IS_LOCAL_RUNTIME,
  apartmentHistoryMonths: 60,
  // The endpoint URL is kept for deployment, but requests stay off until the
  // Firebase Function and its secret are actually deployed. This prevents a
  // missing CORS response from being misreported as a user's network failure.
  apartmentHistoryEnabled: IS_LOCAL_RUNTIME,
  // UI and localhost API evolve independently. Keep appVersion as a backwards
  // compatible alias for code that still reads the API contract version.
  uiVersion: '3.0.1',
  localApiContractVersion: '2.5.0',
  appVersion: '2.5.0',
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
