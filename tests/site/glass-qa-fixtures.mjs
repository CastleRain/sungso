// Public, invented fixtures for glass-suite QA. No private archive or remote import.
import { createHash } from 'node:crypto';
import { fixture as salesFixture } from '../../apps/sohee/sales/tests/fixture.mjs';
import { blankState, validateState } from '../../shared/life/core.mjs';
import { emptyCost, validateCost } from '../../apps/wecost/js/fixed-costs-core.mjs';

export const GLASS_QA_ROUTES = ['', 'wecost/', 'homehunt/', 'homehunt-v2/', 'honeymoon/', 'travel/', 'dates/', 'invitation/', 'journey/', 'table/', 'footprints/', 'wedding/', 'sohee/', 'sohee/sales/'];
export function lifeFixture(date = '2026-11-03') {
  return validateState({ ...blankState(), revision: 1,
    shopping: [{ id: 'qa-milk', name: '예시 우유', quantity: '1', unit: '팩', category: 'ingredients' }, { id: 'qa-eggs', name: '예시 달걀', quantity: '6', unit: '개', category: 'ingredients', done: true }],
    recipes: [{ id: 'qa-recipe', title: '예시 토마토 파스타', ingredients: ['예시 토마토', '예시 면'], steps: '합성 레시피 · 재료를 함께 볶아요.', memo: '운영 기록과 무관한 대역' }],
    places: [{ id: 'qa-cafe', name: '예시 작은 카페', category: 'cafe', region: '예시 동네', address: '실제 주소 아님', wish: true }, { id: 'qa-park', name: '예시 산책길', category: 'date', wish: false }],
    visits: [{ id: 'qa-visit', placeId: 'qa-park', date, memo: '합성 방문 기록' }],
    albums: [{ id: 'qa-album', title: '예시 산책 앨범', url: 'https://example.invalid/qa-album', visitId: 'qa-visit' }],
    guests: [{ id: 'qa-guest-1', name: '예시 하객 A', side: 'sungwoo', relation: '예시 친구', invitation: 'sent', attendance: 'yes', count: 2 }, { id: 'qa-guest-2', name: '예시 하객 B', side: 'sohee', invitation: 'pending', attendance: 'unknown', count: 1 }],
    tasks: [{ id: 'qa-task', title: '예시 준비 항목', done: false }],
  });
}
export function enrichGlassDocuments(docs, dateOffset, now) {
  const fixed = [
    ['qa-phone', { ...emptyCost('sungwoo'), name: '예시 통신비', amount: 35000, category: 'communication', day: 15, iconId: 'smartphone' }],
    ['qa-subscription', { ...emptyCost('sohee'), name: '예시 구독', amount: 120000, category: 'subscriptions', frequency: 'yearly', month: 11, day: 10, iconId: 'tv' }],
    ['qa-utilities', { ...emptyCost('shared'), name: '예시 공과금', amount: 70000, category: 'utilities', day: null, iconId: 'droplet' }],
  ];
  fixed.forEach(([, value]) => validateCost(value));
  docs.set('wecost_settings/fixed_costs', { schemaVersion: 1, revision: 1, items: Object.fromEntries(fixed), updatedBy: 'qa-sungwoo', updatedAt: { $qaTimestamp: now } });
  docs.set('wecost_items/qa-wedding', { cat: '💒예식장', name: '예시 예식 비용', planned: 4000000, deposit: 1000000, actual: 0, balance: 3000000, payer: '공동', memo: '합성 금액', dueDate: dateOffset(20) });
  const payload = JSON.stringify({ schemaVersion: 1, data: salesFixture() });
  const version = createHash('sha256').update(payload).digest('hex');
  docs.set('sohee_sales/current', { schemaVersion: 1, version, chunkCount: 1, importedAt: new Date(now).toISOString(), synthetic: true });
  docs.set(`sohee_sales_versions/${version}/chunks/0`, { index: 0, payload });
}

export function bootstrapSource(date) {
  const state = JSON.stringify(lifeFixture(date)).replaceAll('<', '\\u003c');
  return `// QA origin only: real production boot and membership checks still run.
const actor = new URLSearchParams(location.search).get('qaActor');
if (['sungwoo','sohee','nonmember','signed-out'].includes(actor)) sessionStorage.setItem('sungso_qa_actor',actor);
else if (!sessionStorage.getItem('sungso_qa_actor')) sessionStorage.setItem('sungso_qa_actor','sungwoo');
for(const uid of ['qa-sungwoo','qa-sohee']){const key='sungso.life.v1.'+uid;if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(${state}));}
globalThis.SUNGSO_SYNTHETIC_QA = true;
`;
}
