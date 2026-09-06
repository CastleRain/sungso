import { createEvidenceViewModel } from '../js/ui-format.js';

export function evidenceField(id, label, value, options = {}) {
  const available = value !== null && value !== undefined && value !== '';
  const tier = available ? options.tier || 'verified' : 'unknown';
  return Object.freeze({
    id, label,
    ...createEvidenceViewModel(value, { ...options, tier }),
    sourceLabel: String(options.sourceLabel || '자료 없음'),
    sourceUrl: safeHttpsLink(options.sourceUrl),
    fetchedAt: validDate(options.fetchedAt),
    observedAt: validDate(options.observedAt),
    unit: String(options.unit || ''),
    format: String(options.format || 'text'),
    note: String(options.note || ''),
  });
}

export function validDate(value) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return null;
  return String(value);
}

export function safeHttpsLink(value, allowedHosts = null) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return '';
    if (allowedHosts && !allowedHosts.includes(url.hostname.toLowerCase())) return '';
    return url.href;
  } catch { return ''; }
}

export function positiveNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function escapeEvidence(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}
