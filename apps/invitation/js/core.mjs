import { TEMPLATES, COLLECTIONS, PEOPLE, GALLERIES, SECTIONS, DEFAULT_SECTIONS, SIGNATURES, getTemplate } from './catalog.mjs?v=20260915-venue-map';

export const DOCUMENT_PATH = 'couplePicks/invitation_templates';
export const STORAGE_KEY = 'sungso_invitation_v1';
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export function defaultSelection(templateId = 'minimal') {
  const template = getTemplate(templateId) || TEMPLATES[0];
  return { schemaVersion: 1, templateId: template.id, paletteId: template.palettes[0].id, galleryLayout: template.galleryLayout, sections: { ...DEFAULT_SECTIONS, ...SIGNATURES[template.id]?.sections, ...template.defaultSections }, note: '' };
}
export function normalizeSelection(value) {
  if (!value || value.schemaVersion !== 1 || !getTemplate(value.templateId)) return null;
  const result = defaultSelection(value.templateId);
  if (getTemplate(value.templateId).palettes.some(item => item.id === value.paletteId)) result.paletteId = value.paletteId;
  if (Object.hasOwn(GALLERIES, value.galleryLayout)) result.galleryLayout = value.galleryLayout;
  for (const key of Object.keys(SECTIONS)) if (typeof value.sections?.[key] === 'boolean') result.sections[key] = value.sections[key];
  result.note = typeof value.note === 'string' ? value.note.slice(0, 1000) : '';
  return result;
}
export function normalizeDocument(raw) {
  const favorites = {};
  for (const person of Object.keys(PEOPLE)) favorites[person] = [...new Set(Array.isArray(raw?.favorites?.[person]) ? raw.favorites[person].filter(id => getTemplate(id)) : [])];
  return { schemaVersion: 1, favorites, selection: normalizeSelection(raw?.selection), selectionRevision: Number.isSafeInteger(raw?.selectionRevision) && raw.selectionRevision >= 0 ? raw.selectionRevision : 0, updatedBy: Object.hasOwn(PEOPLE, raw?.updatedBy) ? raw.updatedBy : null, updatedAt: raw?.updatedAt?.toDate?.().toISOString() || (typeof raw?.updatedAt === 'string' ? raw.updatedAt : null) };
}
export class SelectionConflict extends Error {
  constructor() { super('다른 기기에서 우리의 선택이 바뀌었어요. 최신 선택을 확인한 뒤 다시 저장해주세요.'); this.code = 'selection-conflict'; }
}
// The adapter executes this against the latest transaction snapshot, never a local draft.
export function applyChange(raw, change) {
  if (raw?.schemaVersion != null && raw.schemaVersion !== 1) throw new Error('새 버전의 선택서예요. 페이지를 새로고침해주세요.');
  if (!Object.hasOwn(PEOPLE, change.actor)) throw new Error('먼저 성우·소희 중 누가 고르는지 알려주세요.');
  const current = normalizeDocument(raw);
  if (change.type === 'favorite') {
    if (!getTemplate(change.templateId)) throw new Error('알 수 없는 템플릿이에요.');
    const chosen = new Set(current.favorites[change.actor]);
    if (change.enabled) chosen.add(change.templateId); else chosen.delete(change.templateId);
    return { schemaVersion: 1, favorites: { [change.actor]: [...chosen] } };
  }
  if (change.type === 'selection') {
    const next = normalizeSelection(change.selection);
    if (!next) throw new Error('선택할 템플릿을 확인해주세요.');
    if (change.expectedRevision !== current.selectionRevision) throw new SelectionConflict();
    return { schemaVersion: 1, selection: next, selectionRevision: current.selectionRevision + 1, updatedBy: change.actor };
  }
  throw new Error('지원하지 않는 변경이에요.');
}
export function exportSelection(saved) {
  const result = normalizeSelection(saved);
  if (!result) throw new Error('우리의 선택을 먼저 저장해주세요.');
  return result;
}
export function selectionText(saved) {
  const value = exportSelection(saved), template = getTemplate(value.templateId);
  return ['성우와 소희의 청첩장 디자인 선택서', `템플릿: ${template.name}`, `색감: ${template.palettes.find(item => item.id === value.paletteId).name}`, `갤러리: ${GALLERIES[value.galleryLayout]}`, `포함 항목: ${Object.entries(SECTIONS).filter(([key]) => value.sections[key]).map(([, name]) => name).join(', ') || '기본 항목만'}`, '기본 항목: 표지·초대글·예식 정보·마무리', `디자인 메모: ${value.note || '없음'}`].join('\n');
}
export function parseRoute(hash) {
  if (hash === '#selection') return { view: 'selection' };
  const match = /^#preview\/([a-z]+(?:-[a-z]+)*)$/.exec(hash);
  if (match && getTemplate(match[1])) return { view: 'preview', templateId: match[1] };
  return { view: 'catalog' };
}
export function filterTemplates(templates, favorites, filter, collection = 'all', search = '') {
  const terms = String(search).trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return templates.filter(template => collection === 'all' || template.collection === collection).filter(({ id }) => filter === 'sungwoo' ? favorites.sungwoo.includes(id) : filter === 'sohee' ? favorites.sohee.includes(id) : filter === 'both' ? favorites.sungwoo.includes(id) && favorites.sohee.includes(id) : true).filter(template => {
    const text = [template.name, template.english, template.mood, template.description, template.experienceHint, ...(template.tags || [])].join(' ').toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  });
}
export function normalizeLocal(raw) {
  const drafts = {};
  for (const template of TEMPLATES) {
    const entry = raw?.drafts?.[template.id], selection = normalizeSelection(entry?.selection);
    if (selection?.templateId === template.id) drafts[template.id] = { selection, baseRevision: Number.isSafeInteger(entry.baseRevision) && entry.baseRevision >= 0 ? entry.baseRevision : null };
  }
  return { collection: raw?.collection === 'all' || Object.hasOwn(COLLECTIONS, raw?.collection || '') ? raw.collection : 'all', search: typeof raw?.search === 'string' ? raw.search.slice(0, 100) : '', density: raw?.density === 'comfortable' ? 'comfortable' : 'compact', compare: [...new Set(Array.isArray(raw?.compare) ? raw.compare.filter(id => getTemplate(id)) : [])].slice(0, 4), actor: Object.hasOwn(PEOPLE, raw?.actor) ? raw.actor : null, filter: ['all', 'sungwoo', 'sohee', 'both'].includes(raw?.filter) ? raw.filter : 'all', catalogScroll: Number.isFinite(raw?.catalogScroll) ? Math.max(0, raw.catalogScroll) : 0, drafts };
}
export function readLocal(storage) { try { return normalizeLocal(JSON.parse(storage.getItem(STORAGE_KEY))); } catch { return normalizeLocal(null); } }
export function writeLocal(storage, value) { try { storage.setItem(STORAGE_KEY, JSON.stringify(normalizeLocal(value))); return true; } catch { return false; } }
