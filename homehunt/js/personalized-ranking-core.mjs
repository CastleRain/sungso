import { evaluateCommuteBalance, normalizeDestinations } from './commute-balance-core.mjs';
import { rankLocationCandidates } from './location-ranking-core.mjs';
import { recommendationBudget } from './personalized-context-core.mjs';

export const PERSONALIZED_SCORE_WEIGHTS = Object.freeze({ commute: 55, station: 10, households: 5, age: 10, parking: 10, budget: 10 });

function finite(value) {
  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = value => Number.isFinite(value) ? Math.round(value * 100) / 100 : null;

function rescaleDimension(dimension, weight) {
  if (!dimension || dimension.status === 'unknown' || !(dimension.maxScore > 0)) return { value: null, score: 0, maxScore: weight, status: 'unknown', label: dimension?.label || '미확인' };
  return { ...dimension, score: round(dimension.score / dimension.maxScore * weight), maxScore: weight };
}

function parkingDimension(candidate, options) {
  const evidence = candidate.parkingEvidence;
  const ratio = finite(evidence?.spacesPerHousehold);
  const provided = ['provided', 'calculated'].includes(evidence?.status)
    && ['field', 'official'].includes(evidence?.sourceType) && ratio !== null && ratio >= 0;
  const desiredRatio = Math.max(.1, finite(options.minParkingRatio) ?? 1);
  return {
    value: provided ? ratio : null,
    score: provided ? round(10 * clamp(ratio / desiredRatio, 0, 1)) : 0,
    maxScore: 10,
    status: provided ? evidence.status : 'unknown',
    desiredRatio,
    label: provided ? `세대당 주차 ${ratio.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}대 · 희망 ${desiredRatio.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}대` : '세대당 주차 근거 미확인',
    sourceType: provided ? evidence.sourceType : null,
    source: provided ? { name: evidence.sourceName || (evidence.sourceType === 'field' ? '현장 확인' : '공식 자료'), url: evidence.sourceUrl || '', observedAt: evidence.observedAt || null } : null,
  };
}

function budgetDimension(candidate, options) {
  const budget = recommendationBudget(options.targetPriceManWon ?? options.targetPrice, options.maxOverBudgetPct === undefined ? 0 : options.maxOverBudgetPct);
  const target = budget?.targetPriceManWon ?? null;
  const price = candidate.priceVerified === false || !(finite(candidate.bestArea?.count) > 0)
    ? null : finite(candidate.bestArea?.averagePriceManWon);
  const known = target > 0 && price > 0;
  const maxOverBudgetPct = budget?.maxOverBudgetPct ?? null;
  const ratio = known ? price / target : null;
  const overBudgetPct = known ? Math.max(0, (ratio - 1) * 100) : null;
  const withinLimit = known ? price <= budget.maxPriceManWon : null;
  const utility = !known ? 0 : ratio <= 1 ? 1 : maxOverBudgetPct ? clamp(1 - overBudgetPct / maxOverBudgetPct, 0, 1) : 0;
  return {
    value: known ? price : null, score: round(utility * 10), maxScore: 10,
    status: known ? 'calculated' : 'unknown', targetPriceManWon: target > 0 ? target : null,
    maxOverBudgetPct, overBudgetPct: round(overBudgetPct), withinLimit,
    ceilingPriceManWon: budget?.maxPriceManWon ?? null,
    label: known ? overBudgetPct > 0 ? `목표가격보다 ${overBudgetPct.toFixed(1)}% 높음` : '목표가격 이내' : '목표가격·같은 면적 평균 실거래 미확인',
    source: '국토부 같은 면적 평균 실거래 / 입력한 목표가격',
  };
}

function suppliedRoutes(candidate, options, singleCandidate) {
  if (candidate.commuteVerification?.stale === true) return {};
  if (typeof options.routesByDestination === 'function') return options.routesByDestination(candidate) || {};
  return candidate.routesByDestination || candidate.commuteByDestination
    || (singleCandidate ? options.routesByDestination : null) || {};
}

/**
 * Pure ranking. Root supplies company destinations, or its official Gangnam
 * fallback; no destination, coordinates, route, or parking fact is invented.
 * Routes normally live at candidate.routesByDestination. A single-candidate
 * caller may pass that matrix in options, or a callback can provide each matrix.
 *
 * score is a confirmed total only for matched candidates. referenceScore is
 * the independently known facility/budget subtotal (0..45), including for
 * pending candidates. Unknown parking does not block an otherwise known route;
 * explicit no-parking excludes only when requireParking is true.
 */
export function rankPersonalizedCandidates(candidates = [], options = {}) {
  const source = Array.isArray(candidates) ? candidates : [];
  const preferences = { ...options, preferSubway: options.preferSubway !== false };
  const destinations = normalizeDestinations(options.destinations || [], preferences);
  const located = rankLocationCandidates(source, { ...options, profile: 'balanced', maxPriceManWon: options.targetPriceManWon ?? options.targetPrice });
  const costZeroScoreMinutes = Math.max(1, finite(options.costZeroScoreMinutes) ?? 120);
  const result = located.map(candidate => {
    const routesByDestination = suppliedRoutes(candidate, options, source.length === 1);
    const commuteBalance = evaluateCommuteBalance({ ...candidate, routesByDestination }, destinations, preferences);
    const location = candidate.locationRecommendation;
    const weightedCost = commuteBalance.weightedMeanCostMinutes;
    const commuteKnown = commuteBalance.decision === 'matched' && commuteBalance.costCoverageComplete && !commuteBalance.invalidWeights;
    const dimensions = {
      commute: {
        value: commuteKnown ? weightedCost : null,
        score: commuteKnown ? round(55 * clamp(1 - weightedCost / costZeroScoreMinutes, 0, 1)) : 0,
        maxScore: 55, status: commuteKnown ? 'calculated' : 'unknown',
        label: commuteKnown ? `비중 가중 경로 부담 ${weightedCost.toFixed(1)}분 환산` : '방문할 목적지 경로·부담 확인 전',
        source: '실제 제공자 경로 + 입력한 목적지 비중·선호',
      },
      station: rescaleDimension(location.dimensions.station, 10),
      households: rescaleDimension(location.dimensions.households, 5),
      age: rescaleDimension(location.dimensions.age, 10),
      parking: parkingDimension(candidate, options),
      budget: budgetDimension(candidate, options),
    };
    const gateReasons = [];
    if (commuteBalance.decision === 'excluded') {
      if (commuteBalance.evaluations.some(item => item.required && item.decision === 'excluded')) gateReasons.push('required-destination-over-limit-or-no-route');
      if (commuteBalance.evaluations.some(item => item.routeRequired && !item.required && item.decision === 'excluded')) gateReasons.push('destination-no-route');
    }
    if (dimensions.budget.withinLimit === false) gateReasons.push('price-over-ceiling');
    if (options.requireParking === true && dimensions.parking.value === 0) gateReasons.push('no-parking');
    const excluded = gateReasons.length > 0;
    if (!destinations.length) gateReasons.push('destination-required');
    if (commuteBalance.invalidWeights) gateReasons.push('positive-destination-weight-required');
    if (!commuteKnown) gateReasons.push('route-evidence-incomplete');
    if (dimensions.budget.withinLimit === null) gateReasons.push('price-evidence-incomplete');
    const decision = excluded ? 'excluded' : gateReasons.length ? 'pending' : 'matched';
    const referenceScore = round(Object.entries(dimensions).filter(([key]) => key !== 'commute').reduce((sum, [, dimension]) => sum + dimension.score, 0));
    const unknowns = Object.values(dimensions).filter(dimension => dimension.status === 'unknown').map(dimension => dimension.label);
    for (const evaluation of commuteBalance.evaluations) {
      if (!evaluation.routeRequired) continue;
      for (const unknown of evaluation.unknowns) unknowns.push(`${evaluation.destination.label}: ${unknown} 미확인`);
      if (evaluation.unresolvedModes.length && evaluation.decision === 'pending') unknowns.push(`${evaluation.destination.label}: 대체 교통수단 확인 전`);
    }
    return { ...candidate, personalizedRecommendation: {
      version: 1, decision, confirmed: decision === 'matched',
      score: decision === 'matched' ? round(referenceScore + dimensions.commute.score) : null,
      referenceScore, referenceMaxScore: 45, maxScore: 100,
      coveragePct: Object.values(dimensions).filter(dimension => dimension.status !== 'unknown').reduce((sum, dimension) => sum + dimension.maxScore, 0),
      weightedCostMinutes: weightedCost,
      weightedMeanMinutes: commuteBalance.weightedMeanMinutes,
      worstRatio: commuteBalance.worstRatio,
      gateReasons, unknowns: [...new Set(unknowns)], dimensions, commuteBalance,
      destinations: destinations.map(({ id, label, weightPercent, normalizedWeightPercent, weightSource, required, maxMinutes }) => ({ id, label, weightPercent, normalizedWeightPercent, weightSource, required, maxMinutes })),
      scoreMeaning: '통근55·역10·세대5·연식10·주차10·예산10의 입력 선호점수. 미확인 항목은 미확인으로 남기고 점수를 재분배하지 않습니다.',
      costFormula: '실제시간 + 도보×0.5 + 환승×8 + 지하철 선호 시 버스 부담; 실제 소요시간과 다른 선호 환산값',
    } };
  });
  const order = { matched: 0, pending: 1, excluded: 2 };
  return result.sort((left, right) => {
    const a = left.personalizedRecommendation, b = right.personalizedRecommendation;
    return order[a.decision] - order[b.decision]
      || (b.score ?? b.referenceScore) - (a.score ?? a.referenceScore)
      || (a.weightedCostMinutes ?? Infinity) - (b.weightedCostMinutes ?? Infinity)
      || (a.weightedMeanMinutes ?? Infinity) - (b.weightedMeanMinutes ?? Infinity)
      || (a.worstRatio ?? Infinity) - (b.worstRatio ?? Infinity)
      || left.locationRecommendation.identity.localeCompare(right.locationRecommendation.identity);
  });
}
