/** Numeric, visual-only settings. Neither selectors nor CSS strings cross this boundary. */
export const FINE_SECTION_IDS = Object.freeze([
  'couple-profile','wedding-quiz','busan-guide','playlist','time-machine','top', 'invitation', 'wedding-day', 'location', 'our-story', 'gallery', 'accounts', 'guestbook',
  'day-pass', 'guest-guide', 'day-checklist', 'keepsake', 'promises', 'couple-notes', 'thank-you', 'closing',
]);
export const FINE_SECTION_LIMIT = FINE_SECTION_IDS.length;
export const SECTION_TUNING_MAX_LENGTH = 2048;
export const FINE_TUNING_FIELDS = Object.freeze(['textScale', 'lineScale', 'sectionSpace']);
export const FINE_TUNING_DEFAULTS = Object.freeze({ textScale: 1, lineScale: 1, sectionSpace: 1 });
export const FINE_TUNING_RANGES = Object.freeze({
  textScale: Object.freeze({ min: .9, max: 1.2, step: .05 }),
  lineScale: Object.freeze({ min: .9, max: 1.4, step: .05 }),
  sectionSpace: Object.freeze({ min: .7, max: 1.4, step: .05 }),
});
const sectionIds = new Set(FINE_SECTION_IDS);
const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

function numberValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 32 || !decimal.test(trimmed)) return null;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : null;
}

/** Round to a documented step, clamp to a finite range; invalid values use 1. */
export function normalizeFineTuning(value, { min = .9, max = 1.4, step = .05 } = {}) {
  if (![min, max, step].every(Number.isFinite) || min > max || step <= 0) throw new RangeError('Invalid fine tuning range');
  const number = numberValue(value) ?? 1, bounded = Math.min(max, Math.max(min, number));
  const snapped = Number((Math.round((bounded + Number.EPSILON) / step) * step).toFixed(6));
  return Math.min(max, Math.max(min, snapped));
}

function parseRows(input) {
  const result = {};
  if (typeof input !== 'string' || input.length > SECTION_TUNING_MAX_LENGTH) return result;
  for (const row of input.split(';')) {
    const cells = row.split(':');
    if (cells.length !== 4 || !sectionIds.has(cells[0]) || cells.slice(1).some(cell => numberValue(cell) === null)) continue;
    result[cells[0]] = Object.fromEntries(FINE_TUNING_FIELDS.map((field, index) => [field, normalizeFineTuning(cells[index + 1], FINE_TUNING_RANGES[field])]));
  }
  return result;
}

function serializeRows(rows) {
  return FINE_SECTION_IDS.filter(id => Object.hasOwn(rows, id))
    .map(id => `${id}:${FINE_TUNING_FIELDS.map(field => rows[id][field]).join(':')}`).join(';');
}

/** Canonical v1-friendly string. An explicit 1:1:1 is a real local override. */
export function normalizeSectionTuning(input) { return serializeRows(parseRows(input)); }

/** Absent section means inherit global settings; present section means override. */
export function readSectionTuning(input) { return parseRows(normalizeSectionTuning(input)); }

/** Empty patch enables a section at 100%; null removes its local override. */
export function setSectionTuning(input, id, patch) {
  const rows = parseRows(input);
  if (!sectionIds.has(id)) return serializeRows(rows);
  if (patch === null) { delete rows[id]; return serializeRows(rows); }
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return serializeRows(rows);
  const next = { ...(rows[id] || FINE_TUNING_DEFAULTS) };
  for (const field of FINE_TUNING_FIELDS) {
    if (Object.hasOwn(patch, field)) next[field] = normalizeFineTuning(patch[field], FINE_TUNING_RANGES[field]);
  }
  rows[id] = next;
  return serializeRows(rows);
}
