const COPY = Object.freeze({
  loading: {
    tone: 'loading', eyebrow: 'CHECKING SAVED DATA', icon: '↻',
    title: '공식 단지를 확인했어요',
    message: '이 브라우저의 저장본과 단지 실거래 연결 상태를 차례로 확인하고 있습니다.',
  },
  'not-deployed': {
    tone: 'warning', eyebrow: 'PRICE SERVER WAITING', icon: '⌁',
    title: '단지는 찾았고, 가격 서버만 연결하면 돼요',
    message: '서울·경기 공식 단지 정보는 정상입니다. 단지별 국토부 실거래를 가져오는 서버가 아직 배포되지 않아 가격 이력은 표시하지 않았습니다.',
  },
  'key-required': {
    tone: 'warning', eyebrow: 'LOCAL KEY REQUIRED', icon: '⌁',
    title: '단지는 찾았고, 로컬 키만 연결하면 돼요',
    message: '로컬 실거래 서버는 켜져 있습니다. 국토부 일반 인증키를 메모리에 연결한 뒤 다시 확인해주세요.',
  },
  'outdated-client': {
    tone: 'warning', eyebrow: 'SERVER RESTART REQUIRED', icon: '↻',
    title: '화면과 실거래 서버의 기간 기준이 달라요',
    message: '기존 로컬 서버를 종료하고 다시 시작하면 1·3·5년 범위와 기준 월을 정확히 맞춰 조회합니다.',
  },
  partial: {
    tone: 'warning', eyebrow: 'PARTIAL HISTORY', icon: '!',
    title: '실거래 일부 월을 받지 못했어요',
    message: '불완전한 응답은 완전한 저장본을 덮어쓰지 않습니다. 잠시 뒤 다시 조회하면 누락된 월만 보완합니다.',
  },
  offline: {
    tone: 'warning', eyebrow: 'OFFLINE', icon: '↯',
    title: '인터넷 연결을 확인해주세요',
    message: '공식 단지 정보는 유지했습니다. 연결이 돌아오면 다시 확인할 수 있어요.',
  },
  timeout: {
    tone: 'warning', eyebrow: 'REQUEST TIMEOUT', icon: '◷',
    title: '실거래 확인이 예상보다 오래 걸려요',
    message: '공식 단지 정보와 기존 저장본은 그대로 두었습니다. 잠시 뒤 다시 확인해주세요.',
  },
  'rate-limited': {
    tone: 'warning', eyebrow: 'PLEASE TRY LATER', icon: '◷',
    title: '오늘 조회가 잠시 제한됐어요',
    message: '공식 단지 정보와 기존 저장본은 그대로 두었습니다. 잠시 뒤 다시 확인해주세요.',
  },
  unavailable: {
    tone: 'error', eyebrow: 'PRICE SERVER UNAVAILABLE', icon: '!',
    title: '실거래 서버와 연결하지 못했어요',
    message: '공식 단지 정보는 정상입니다. 가격 서버 상태를 확인한 뒤 다시 시도해주세요.',
  },
  empty: {
    tone: 'neutral', eyebrow: 'NO REPORTED DEALS', icon: '—',
    title: '신고된 실거래를 찾지 못했어요',
    message: '선택한 단지의 매매·전세 응답이 비어 있습니다. 비슷한 단지를 보거나 다른 거래 유형을 확인해보세요.',
  },
});

export function classifyComplexFailure({ apiEnabled = true, status = 0, errorName = '', online = true } = {}) {
  if (!apiEnabled || status === 404 || status === 503) return 'not-deployed';
  if (!online) return 'offline';
  if (errorName === 'AbortError' || status === 408 || status === 504) return 'timeout';
  if (status === 429) return 'rate-limited';
  return 'unavailable';
}

export function describeComplexAvailability(code = 'unavailable') {
  return COPY[code] || COPY.unavailable;
}
