import { formatPrice, renderValue } from '../ui-format.js';
import { escapeEvidence as esc, evidenceField, positiveNumber } from '../../providers/evidence.mjs';
import { officialComplexEvidence, officialTradeEvidence } from '../../providers/official/complex.mjs';
import { portalComplexEvidence } from '../../providers/portal/index.mjs';
import { officialApplicationLink, supplyApplicationChecklist, supplyPriceEvidence } from '../../providers/official/supply.mjs';

function dateLabel(date) {
  if (!date) return '기준일 미확인';
  const value = new Date(date);
  return Number.isFinite(value.getTime()) ? value.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }) : '기준일 미확인';
}

function fieldFormat(field) {
  if (field.format === 'price') return formatPrice;
  if (field.format === 'year') return (value) => `${value}${field.unit}`;
  if (field.format === 'number') return (value) => `${Number(value).toLocaleString('ko-KR')}${field.unit}`;
  return (value) => String(value);
}

export function renderEvidenceFields(fields) {
  return `<dl class="hh-evidence-fields">${fields.map((field) => {
    const source = field.sourceUrl
      ? `<a href="${esc(field.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(field.sourceLabel)} ↗</a>`
      : esc(field.sourceLabel);
    const stale = field.freshness === 'stale' ? ' · 이전 저장 자료' : '';
    return `<div class="hh-evidence-field" data-evidence-id="${esc(field.id)}"><dt>${esc(field.label)}</dt><dd>${renderValue(field, { format: fieldFormat(field) })}<small>${source} · ${esc(dateLabel(field.observedAt))}${stale}${field.fetchedAt ? ` · 조회 ${esc(dateLabel(field.fetchedAt))}` : ''}</small>${field.note ? `<p>${esc(field.note)}</p>` : ''}</dd></div>`;
  }).join('')}</dl>`;
}

export function renderCandidateEvidence(candidate = {}, options = {}) {
  const portals = portalComplexEvidence(candidate);
  if (options.personalRecord) {
    const visit = options.personalRecord;
    const source = { tier: 'personal', sourceKind: 'personal-visit', sourceLabel: '내 브라우저 방문 기록', observedAt: visit.visitDate, fetchedAt: null, decisionStatus: 'personal-reference', reason: '개인 기록 없음' };
    return `<div class="hh-candidate-evidence"><section class="hh-evidence-section"><h3>방문 당시 직접 확인한 내용</h3>${renderEvidenceFields([
      evidenceField('visitAsking', `현장 확인 ${visit.dealType || '가격'}`, positiveNumber(visit.askingPrice), { ...source, format: 'price', note: '개인 확인 가격이며 국토교통부 실제 계약가격과 별도로 비교하세요.' }),
      evidenceField('visitWalk', '현장에서 확인한 도보', positiveNumber(visit.walkMinutes), { ...source, unit: '분', format: 'number' }),
      evidenceField('visitPros', '장점', visit.pros, source),
      evidenceField('visitCons', '단점', visit.cons, source),
      evidenceField('visitMemo', '메모', visit.memo, source),
    ])}</section><p class="hh-evidence-note">방문 당시·현재 실거래는 같은 단지와 전용면적으로 별도 조회해 비교하세요.</p></div>`;
  }
  return `<div class="hh-candidate-evidence"><section class="hh-evidence-section"><h3>실거래 근거</h3>${renderEvidenceFields(officialTradeEvidence(candidate, options))}</section><section class="hh-evidence-section"><h3>단지·생활 정보</h3>${renderEvidenceFields(officialComplexEvidence(candidate, options))}</section><details class="hh-evidence-section hh-portal-details"><summary>매물·호가 직접 확인 <span>공식 사이트</span></summary><p class="hh-evidence-note">현재 매물·호가는 실거래와 별도로 확인하세요. 단지명과 주소가 일치하는지 확인해주세요.</p><div class="hh-portal-links">${portals.map((portal) => `<article><div><strong>${esc(portal.label)}</strong><span>자동 보강 미연결</span></div><p>${esc(portal.reason)}</p><a href="${esc(portal.href)}" target="_blank" rel="noopener noreferrer">${esc(portal.linkLabel)} ↗</a></article>`).join('')}</div><p class="hh-evidence-note">정책 확인 ${portals[0].checkedAt} · 자동 조회 0회 · 상세 정보는 저장하지 않아요.</p></details></div>`;
}

const checkedByNotice = new Map();

/** Lazy enhancement owns only its passed container; request races cannot overwrite another detail. */
export function mountSupplyDecisionSupport(root, notice, options = {}) {
  if (!root) return;
  const application = officialApplicationLink(notice);
  const checklist = supplyApplicationChecklist(notice);
  const id = String(notice.id || '');
  const checked = checkedByNotice.get(id) || new Set();
  root.classList.add('hh-supply-decision');
  root.innerHTML = `<section class="hh-evidence-section"><h3>분양가와 주변 가격 맥락</h3>${renderEvidenceFields(supplyPriceEvidence(notice, options))}</section><section class="hh-evidence-section"><h3>신청 준비 체크리스트</h3><p class="hh-evidence-note">모집공고를 읽으며 확인하세요. 체크 상태는 이 페이지를 닫을 때까지 유지됩니다.</p><div class="hh-application-checks">${checklist.map((item) => `<button type="button" class="hh-check-row" data-preparation="${item.id}" aria-pressed="${checked.has(item.id)}"><span class="hh-check-mark" aria-hidden="true">${checked.has(item.id) ? '✓' : ''}</span><span><strong>${esc(item.label)}</strong><small>${esc(item.detail)}</small></span></button>`).join('')}</div>${application ? `<a class="hh-apply-official" href="${esc(application.href)}" target="_blank" rel="noopener noreferrer">청약 신청하기 · ${esc(application.label)} ↗</a><p class="hh-evidence-note">${application.direct ? '공식 신청 페이지로 이동합니다.' : '공식 청약 사이트에서 공고명·접수유형을 다시 선택하세요.'} 본인 인증과 신청서 제출은 직접 진행해주세요.</p>` : '<p class="hh-evidence-note">공식 신청 기관을 확인하지 못했어요. 모집공고 원문을 확인하세요.</p>'}</section>`;
  root.querySelectorAll('[data-preparation]').forEach((button) => button.addEventListener('click', () => {
    const key = button.dataset.preparation;
    if (checked.has(key)) checked.delete(key); else checked.add(key);
    checkedByNotice.set(id, checked);
    button.setAttribute('aria-pressed', String(checked.has(key)));
    button.querySelector('.hh-check-mark').textContent = checked.has(key) ? '✓' : '';
  }));
}
