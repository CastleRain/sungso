import { CHOICE_KEYS, CHOICES, normalizeComposition } from './composition.mjs';

export const LIBRARY_LIMIT = 40;
export const LIBRARY_BYTES = 1024 * 1024;
export const cleanName = value => typeof value === 'string' ? value.trim().slice(0, 32) : '';
export const cleanNote = value => typeof value === 'string' ? value.trim().slice(0, 240) : '';
export const cleanRating = value => Number.isInteger(value) && value >= 0 && value <= 5 ? value : 0;
const cleanTime = value => Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
export function normalizeSaved(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.id !== 'string' || !item.id || item.id.length > 80 || !item.composition || typeof item.composition !== 'object' || Array.isArray(item.composition)) throw new Error('record');
  return { id: item.id, name: cleanName(item.name) || '이름 없는 조합', rating: cleanRating(item.rating), note: cleanNote(item.note), createdAt: cleanTime(item.createdAt), updatedAt: cleanTime(item.updatedAt), composition: normalizeComposition(item.composition) };
}
/** Reading never writes, trims the library, or discards valid older selections. */
export function parseLibrary(raw) {
  if (raw === null || raw === '') return [];
  if (typeof raw !== 'string' || raw.length > LIBRARY_BYTES) throw new Error('size');
  const data = JSON.parse(raw);
  if (!Array.isArray(data) || data.length > 1000) throw new Error('shape');
  const items = data.map(normalizeSaved);
  if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('duplicates');
  return items;
}
export function selectSaved(items, { search = '', favorites = false, sort = 'recent' } = {}) {
  const term = String(search).trim().toLocaleLowerCase('ko');
  return items.map((item, index) => ({ item, index })).filter(({ item }) => (!favorites || item.rating >= 4) && (!term || `${item.name} ${item.note}`.toLocaleLowerCase('ko').includes(term))).sort((a, b) => {
    if (sort === 'rating' && a.item.rating !== b.item.rating) return b.item.rating - a.item.rating;
    return b.item.updatedAt - a.item.updatedAt || a.index - b.index;
  }).map(({ item }) => item);
}
export function updateSaved(items, id, patch, now = Date.now()) {
  return items.map(item => item.id === id ? normalizeSaved({ ...item, ...patch, id: item.id, createdAt: item.createdAt, updatedAt: now, composition: item.composition }) : item);
}
export function exportSelection(composition, metadata = {}) {
  return { version: 1, name: cleanName(metadata.name) || '우리의 청첩장', rating: cleanRating(metadata.rating), note: cleanNote(metadata.note), composition: normalizeComposition(composition) };
}
export function parseImport(text) {
  if (typeof text !== 'string' || text.length > LIBRARY_BYTES) throw new Error('size');
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object' || Array.isArray(data) || String(data.version) !== '1') throw new Error('version');
  if (data.kind === 'sungso-studio-library') {
    const items = parseLibrary(JSON.stringify(data.items));
    if (!items.length || items.length > LIBRARY_LIMIT) throw new Error('count');
    return { kind: 'library', items };
  }
  if (!data.composition || typeof data.composition !== 'object' || Array.isArray(data.composition) || !CHOICE_KEYS.some(key => CHOICES[key].some(choice => choice.id === data.composition[key]))) throw new Error('composition');
  return { kind: 'selection', ...exportSelection(data.composition, data) };
}
