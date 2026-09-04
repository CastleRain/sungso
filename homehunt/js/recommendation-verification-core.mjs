function finiteNumber(value) {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundedCoordinate(value) {
  const number = finiteNumber(value);
  return number === null ? null : Math.round(number * 1_000_000) / 1_000_000;
}

function normalizedProvider(value) {
  const provider = String(value || '').trim().toLowerCase();
  if (provider.includes('tmap')) return 'tmap';
  if (provider.includes('kakao')) return 'kakao';
  if (provider.includes('naver') || provider === 'car') return 'naver';
  return provider || 'unknown';
}

/**
 * Captures every destination field that can change a commute decision or rank.
 * Labels and addresses are deliberately excluded: coordinates are the routing
 * identity, while a harmless rename should not expire a verified result.
 */
export function destinationFingerprint(destinations = []) {
  const source = Array.isArray(destinations) ? destinations : [destinations];
  const canonical = source.map((destination = {}, index) => {
    const modes = Array.isArray(destination.modes)
      ? destination.modes
      : String(destination.mode || 'transit').split(/[+,/|\s]+/).filter(Boolean);
    return {
      id: String(destination.id || `destination-${index + 1}`),
      lat: roundedCoordinate(destination.lat ?? destination.latitude),
      lng: roundedCoordinate(destination.lng ?? destination.lon ?? destination.longitude),
      required: destination.required !== false,
      modes: [...new Set(modes.map((mode) => String(mode).trim().toLowerCase()).filter(Boolean))].sort(),
      maxMinutes: finiteNumber(destination.maxMinutes),
      departureTime: String(destination.departureTime || ''),
      weight: finiteNumber(destination.weight ?? destination.daysPerWeek),
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
  return canonical.length ? `destinations-v1:${JSON.stringify(canonical)}` : '';
}

/**
 * Converts provider/stage/fingerprint provenance into the only decision the UI
 * may expose as final. A Kakao screening pass remains pending in hybrid mode;
 * a Kakao final lookup is valid when Kakao is the selected sole provider.
 */
export function candidateVerificationStatus(candidate = {}, options = {}) {
  const currentFingerprint = String(options.destinationFingerprint || '');
  const requireTmapFinal = options.requireTmapFinal === true;
  const verification = candidate.commuteVerification && typeof candidate.commuteVerification === 'object'
    ? candidate.commuteVerification
    : null;
  const finalBalance = candidate.commuteBalance && typeof candidate.commuteBalance === 'object'
    ? candidate.commuteBalance
    : null;
  const screening = candidate.commuteScreening && typeof candidate.commuteScreening === 'object'
    ? candidate.commuteScreening
    : null;
  const provider = normalizedProvider(verification?.provider || candidate.commuteProvider);
  const savedFingerprint = String(verification?.destinationFingerprint || '');
  const screeningDecision = screening?.balance?.decision || null;

  if (verification?.stage !== 'final' || !finalBalance) {
    return {
      decision: 'pending',
      final: false,
      stale: false,
      stage: screening ? 'screening' : 'pending',
      provider: screening ? normalizedProvider(screening.provider) : provider,
      reason: screening ? 'screening-only' : 'not-verified',
      screeningDecision,
    };
  }
  if (verification.stale === true || !currentFingerprint || !savedFingerprint || savedFingerprint !== currentFingerprint) {
    return {
      decision: 'pending',
      final: false,
      stale: true,
      stage: 'stale',
      provider,
      reason: verification.staleReason || 'destination-fingerprint-changed',
      screeningDecision,
    };
  }
  if (requireTmapFinal && provider !== 'tmap') {
    return {
      decision: 'pending',
      final: false,
      stale: false,
      stage: 'screening',
      provider,
      reason: 'tmap-final-required',
      screeningDecision: finalBalance.decision || screeningDecision,
    };
  }
  const decision = ['matched', 'excluded'].includes(finalBalance.decision)
    ? finalBalance.decision
    : 'pending';
  return {
    decision,
    final: finalBalance.requiredFullyVerified === true,
    stale: false,
    stage: 'final',
    provider,
    reason: decision === 'pending' ? 'incomplete-route-matrix' : null,
    screeningDecision,
  };
}

/** Marks persisted shortlist verdicts stale without deleting their old context. */
export function reconcileShortlistFingerprints(items = [], currentFingerprint = '') {
  let changed = false;
  const next = (Array.isArray(items) ? items : []).map((candidate) => {
    const verification = candidate?.commuteVerification;
    if (!candidate?.commuteBalance) return candidate;
    if (!verification || verification.stage !== 'final') {
      changed = true;
      return {
        ...candidate,
        commuteVerification: {
          stage: 'final',
          provider: candidate.commuteProvider || 'unknown',
          destinationFingerprint: '',
          stale: true,
          staleReason: 'missing-destination-fingerprint',
        },
      };
    }
    const stale = !currentFingerprint
      || !verification.destinationFingerprint
      || verification.destinationFingerprint !== currentFingerprint;
    const staleReason = stale ? 'destination-fingerprint-changed' : '';
    if (Boolean(verification.stale) === stale
      && String(verification.staleReason || '') === staleReason) return candidate;
    changed = true;
    return {
      ...candidate,
      commuteVerification: {
        ...verification,
        stale,
        ...(staleReason ? { staleReason } : { staleReason: '' }),
      },
    };
  });
  return { items: next, changed };
}

function monthIndex(value) {
  const match = String(value || '').match(/^(\d{4})-(0[1-9]|1[0-2])/);
  return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : null;
}

/**
 * Expands a selectable 1/3/5-year history window just enough to include the
 * visit month, capped at the provider's five-year contract.
 */
export function historyWindowForVisit(visitDate, options = {}) {
  const steps = (Array.isArray(options.steps) ? options.steps : [12, 36, 60])
    .map((value) => Math.trunc(Number(value)))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);
  const maxMonths = Math.max(1, Math.trunc(Number(options.maxMonths) || steps.at(-1) || 60));
  const currentMonths = Math.max(1, Math.min(maxMonths, Math.trunc(Number(options.currentMonths) || steps[0] || 12)));
  const visitIndex = monthIndex(visitDate);
  const endIndex = monthIndex(options.endMonth);
  if (visitIndex === null || endIndex === null || visitIndex > endIndex) {
    return { months: currentMonths, requiredMonths: null, includesVisit: false, capped: false, reason: visitIndex === null ? 'invalid-visit-date' : 'future-visit-date' };
  }
  const requiredMonths = endIndex - visitIndex + 1;
  const requested = Math.max(currentMonths, requiredMonths);
  const stepped = steps.find((months) => months >= requested) || maxMonths;
  const months = Math.min(maxMonths, stepped);
  return {
    months,
    requiredMonths,
    includesVisit: requiredMonths <= months,
    capped: requiredMonths > maxMonths,
    reason: requiredMonths > maxMonths ? 'older-than-history-limit' : null,
  };
}
