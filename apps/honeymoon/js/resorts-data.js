import { loadPrivateReference } from '../../../shared/travel/private-reference.mjs';
import { registerPrivateCleanup } from '../../../shared/firebase/site-auth.mjs';
const reference = await loadPrivateReference('honeymoon_reference');
export const TRIP_INFO = reference.TRIP_INFO || {};
export const AGENCIES = reference.AGENCIES || {};
export const RESORTS = Array.isArray(reference.RESORTS) ? reference.RESORTS : [];
registerPrivateCleanup(() => { RESORTS.length = 0; for (const object of [TRIP_INFO, AGENCIES]) for (const key of Object.keys(object)) delete object[key]; });
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
