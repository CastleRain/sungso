export const LIFE_KINDS = Object.freeze(['shopping', 'recipes', 'places', 'visits', 'albums', 'guests', 'tasks']);
export const RECORD_LIMIT = 500;

export class LifeDataError extends Error {
  constructor(message) { super(message); this.name = 'LifeDataError'; }
}
const fail = message => { throw new LifeDataError(message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function text(value, label, max = 2000, required = false) {
  if (value === undefined) value = '';
  if (typeof value !== 'string') fail(`${label}을 글자로 입력해 주세요.`);
  const clean = value.trim();
  if ((required && !clean) || clean.length > max) fail(`${label}은 ${required ? '1' : '0'}~${max}자로 입력해 주세요.`);
  return clean;
}
function id(value, label = '기록 ID') {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value)) fail(`${label}를 다시 확인해 주세요.`);
  return value;
}
function flag(value, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') fail('체크 상태를 다시 확인해 주세요.');
  return value;
}
function choice(value, allowed, fallback) {
  const result = value === undefined || value === '' ? fallback : value;
  if (!allowed.includes(result)) fail('분류를 다시 확인해 주세요.');
  return result;
}
function date(value) {
  const result = text(value, '방문 날짜', 10, true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(Date.parse(`${result}T00:00:00Z`)) || new Date(`${result}T00:00:00Z`).toISOString().slice(0, 10) !== result) fail('방문 날짜를 정확하게 입력해 주세요.');
  return result;
}
export function safeExternalUrl(value) {
  const raw = text(value, '링크', 2048);
  if (!raw) return '';
  if (/[\u0000-\u0020\u007f]/u.test(raw)) fail('링크에 공백이나 제어 문자를 넣을 수 없어요.');
  let parsed;
  try { parsed = new URL(raw); } catch { fail('https로 시작하는 전체 링크를 입력해 주세요.'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname) fail('계정 정보가 없는 https 링크만 사용할 수 있어요.');
  return parsed.href;
}

const fields = {
  shopping: ['name', 'quantity', 'unit', 'category', 'memo', 'done', 'sourceRecipeId', 'sourceIngredient'],
  recipes: ['title', 'ingredients', 'steps', 'memo'],
  places: ['name', 'region', 'category', 'address', 'mapUrl', 'wish', 'archived', 'memo'],
  visits: ['placeId', 'date', 'memo'],
  albums: ['title', 'url', 'visitId', 'memo'],
  guests: ['name', 'side', 'relation', 'invitation', 'attendance', 'count', 'memo'],
  tasks: ['title', 'done', 'memo'],
};
function kindName(kind) { if (!LIFE_KINDS.includes(kind)) fail('기록 종류를 다시 확인해 주세요.'); return kind; }
function normalizeRecord(kind, raw) {
  kindName(kind);
  if (!object(raw) || Object.keys(raw).some(key => key !== 'id' && !fields[kind].includes(key))) fail('지원하지 않는 기록 형식이에요. 원본은 그대로 두었어요.');
  const result = { id: id(raw.id) };
  if (kind === 'shopping') {
    Object.assign(result, { name: text(raw.name, '품목 이름', 200, true), quantity: text(raw.quantity, '수량', 80), unit: text(raw.unit, '단위', 40), category: text(raw.category, '품목 분류', 60), memo: text(raw.memo, '메모'), done: flag(raw.done) });
    if (raw.sourceRecipeId) result.sourceRecipeId = id(raw.sourceRecipeId, '원본 레시피 ID');
    if (raw.sourceIngredient) result.sourceIngredient = text(raw.sourceIngredient, '원본 재료', 200, true);
    if (Boolean(result.sourceRecipeId) !== Boolean(result.sourceIngredient)) fail('원본 레시피와 재료 정보를 함께 유지해 주세요.');
  } else if (kind === 'recipes') {
    const ingredients = raw.ingredients === undefined ? [] : raw.ingredients;
    if (!Array.isArray(ingredients) || ingredients.length > 100) fail('재료는 100개까지 적을 수 있어요.');
    Object.assign(result, { title: text(raw.title, '레시피 이름', 120, true), ingredients: ingredients.map(value => text(value, '재료', 200, true)), steps: text(raw.steps, '만드는 방법', 8000), memo: text(raw.memo, '메모') });
  } else if (kind === 'places') {
    Object.assign(result, { name: text(raw.name, '장소 이름', 120, true), region: text(raw.region, '지역', 100), category: choice(raw.category, ['restaurant', 'cafe', 'date', 'other'], 'restaurant'), address: text(raw.address, '주소', 300), mapUrl: safeExternalUrl(raw.mapUrl), wish: flag(raw.wish, true), archived: flag(raw.archived), memo: text(raw.memo, '메모') });
  } else if (kind === 'visits') {
    Object.assign(result, { placeId: id(raw.placeId, '방문 장소 ID'), date: date(raw.date), memo: text(raw.memo, '메모') });
  } else if (kind === 'albums') {
    const url = safeExternalUrl(raw.url);
    if (!url) fail('사진첩 링크를 입력해 주세요.');
    Object.assign(result, { title: text(raw.title, '사진첩 이름', 120, true), url, memo: text(raw.memo, '메모') });
    if (raw.visitId) result.visitId = id(raw.visitId, '방문 기록 ID');
  } else if (kind === 'guests') {
    const count = raw.count === undefined ? 1 : raw.count;
    if (!Number.isInteger(count) || count < 1 || count > 20) fail('동반 인원은 본인을 포함해 1~20명으로 입력해 주세요.');
    Object.assign(result, { name: text(raw.name, '하객 이름', 120, true), side: choice(raw.side, ['sungwoo', 'sohee', 'both'], 'both'), relation: text(raw.relation, '관계', 100), invitation: choice(raw.invitation, ['pending', 'sent'], 'pending'), attendance: choice(raw.attendance, ['unknown', 'yes', 'no'], 'unknown'), count, memo: text(raw.memo, '메모') });
  } else Object.assign(result, { title: text(raw.title, '할 일', 120, true), done: flag(raw.done), memo: text(raw.memo, '메모') });
  return result;
}
function validateReferences(state) {
  const places = new Set(state.places.map(record => record.id)), visits = new Set(state.visits.map(record => record.id));
  if (state.visits.some(record => !places.has(record.placeId))) fail('방문 기록에 연결된 장소가 없어요. 원본 기록을 확인해 주세요.');
  if (state.albums.some(record => record.visitId && !visits.has(record.visitId))) fail('사진첩에 연결된 방문 기록이 없어요. 원본 기록을 확인해 주세요.');
  return state;
}
export function blankState() {
  return { schemaVersion: 1, revision: 0, shopping: [], recipes: [], places: [], visits: [], albums: [], guests: [], tasks: [] };
}
export function validateState(raw) {
  if (!object(raw) || raw.schemaVersion !== 1 || !Number.isSafeInteger(raw.revision) || raw.revision < 0 || Object.keys(raw).some(key => !['schemaVersion', 'revision', ...LIFE_KINDS].includes(key))) fail('저장된 생활 기록 형식을 확인할 수 없어요. 원본은 그대로 두었어요.');
  const result = { schemaVersion: 1, revision: raw.revision };
  for (const kind of LIFE_KINDS) {
    if (!Array.isArray(raw[kind]) || raw[kind].length > RECORD_LIMIT) fail(`각 기록은 ${RECORD_LIMIT}개까지 보관할 수 있어요. 원본은 그대로 두었어요.`);
    result[kind] = raw[kind].map(record => normalizeRecord(kind, record));
    if (new Set(result[kind].map(record => record.id)).size !== result[kind].length) fail('같은 ID의 기록이 겹쳐 있어요. 원본은 그대로 두었어요.');
  }
  return validateReferences(result);
}
export function upsertRecord(state, kind, record) {
  kindName(kind);
  const result = validateState(state);
  const index = result[kind].findIndex(item => item.id === record?.id);
  const value = normalizeRecord(kind, index < 0 ? record : { ...result[kind][index], ...record });
  if (index < 0) {
    if (result[kind].length >= RECORD_LIMIT) fail(`각 기록은 ${RECORD_LIMIT}개까지 보관할 수 있어요.`);
    result[kind].push(value);
  } else result[kind][index] = value;
  return validateReferences(result);
}
export function removeRecord(state, kind, recordId) {
  kindName(kind); id(recordId);
  const result = validateState(state);
  if (kind === 'places' && result.visits.some(record => record.placeId === recordId)) {
    const place = result.places.find(record => record.id === recordId);
    place.archived = true;
    return result;
  }
  if (kind === 'visits' && result.albums.some(record => record.visitId === recordId)) fail('사진첩이 연결된 방문 기록은 삭제할 수 없어요. 사진첩의 방문 연결을 먼저 해제해 주세요.');
  result[kind] = result[kind].filter(record => record.id !== recordId);
  return result;
}
export function toggleRecord(state, kind, recordId) {
  if (!['shopping', 'tasks', 'places'].includes(kind)) fail('이 기록은 체크 상태를 바꿀 수 없어요.');
  const result = validateState(state);
  const record = result[kind].find(item => item.id === recordId);
  if (!record) fail('기록이 없어졌어요. 최신 목록을 확인해 주세요.');
  const key = kind === 'places' ? 'wish' : 'done'; record[key] = !record[key];
  return result;
}
export function addRecipeIngredients(state, recipeId, indexes) {
  const result = validateState(state), recipe = result.recipes.find(record => record.id === recipeId);
  if (!recipe) fail('레시피가 없어졌어요. 최신 목록을 확인해 주세요.');
  if (!Array.isArray(indexes) || indexes.some(index => !Number.isInteger(index) || index < 0 || index >= recipe.ingredients.length)) fail('장보기에 넣을 재료를 다시 골라 주세요.');
  const pending = new Set(result.shopping.filter(record => !record.done && record.sourceRecipeId === recipeId).map(record => record.sourceIngredient));
  const additions = [];
  for (const index of new Set(indexes)) {
    const ingredient = recipe.ingredients[index];
    if (pending.has(ingredient)) continue;
    if (typeof globalThis.crypto?.randomUUID !== 'function') fail('안전한 기록 ID를 만들 수 없어요. 최신 브라우저에서 다시 열어 주세요.');
    additions.push(normalizeRecord('shopping', { id: globalThis.crypto.randomUUID(), name: ingredient, sourceRecipeId: recipeId, sourceIngredient: ingredient }));
    pending.add(ingredient);
  }
  if (result.shopping.length + additions.length > RECORD_LIMIT) fail(`장보기는 ${RECORD_LIMIT}개까지 보관할 수 있어요.`);
  result.shopping.push(...additions);
  return result;
}
export function foodCandidates(state) {
  return validateState(state).places.filter(record => !record.archived && ['restaurant', 'cafe'].includes(record.category));
}
export function guestSummary(state) {
  const blank = () => ({ totalRecords: 0, totalPeople: 0, confirmedPeople: 0, pendingPeople: 0, declinedPeople: 0, invitedRecords: 0 });
  const result = { ...blank(), bySide: { sungwoo: blank(), sohee: blank(), both: blank() } };
  for (const guest of validateState(state).guests) for (const summary of [result, result.bySide[guest.side]]) {
    summary.totalRecords++; summary.totalPeople += guest.count;
    summary[{ yes: 'confirmedPeople', unknown: 'pendingPeople', no: 'declinedPeople' }[guest.attendance]] += guest.count;
    if (guest.invitation === 'sent') summary.invitedRecords++;
  }
  return result;
}
