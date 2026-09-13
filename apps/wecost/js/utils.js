// ===== 금액 포맷팅 =====

export function won(n) {
  n = Number(n) || 0;
  if (n === 0) return '₩0';
  const neg = n < 0;
  const abs = Math.abs(n);
  let s;
  if (abs >= 100000000) s = `₩${(abs / 100000000).toFixed(1)}억`;
  else if (abs >= 10000) s = `₩${Math.round(abs / 10000).toLocaleString()}만`;
  else s = `₩${abs.toLocaleString()}`;
  return neg ? `-${s}` : s;
}

export function wonFull(n) {
  return `₩${Math.round(Number(n) || 0).toLocaleString()}`;
}

export function wonDetailed(n) {
  n = Math.round(Number(n) || 0);
  if (n === 0) return '₩0';
  const neg = n < 0;
  const abs = Math.abs(n);
  let s;
  if (abs >= 100000000) {
    const uk  = Math.floor(abs / 100000000);
    const man = Math.round((abs % 100000000) / 10000);
    s = man === 0 ? `₩${uk}억` : `₩${uk}억 ${man.toLocaleString()}만`;
  } else if (abs >= 10000) {
    s = `₩${Math.round(abs / 10000).toLocaleString()}만`;
  } else {
    s = `₩${abs.toLocaleString()}`;
  }
  return neg ? `-${s}` : s;
}

export function parseNum(s) {
  if (!s) return 0;
  return Number(String(s).replace(/[₩,\s]/g, '')) || 0;
}

// ===== 날짜 =====

export function parseSettingDate(s) {
  if (!s) return '';
  const p = String(s).trim().split('-');
  if (p.length === 3) return `${p[0]}-${p[1].padStart(2, '0')}-${p[2].padStart(2, '0')}`;
  return s;
}

export function dday(ds) {
  if (!ds) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(ds); d.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

export function monthsBetween(dateStr) {
  if (!dateStr) return 0;
  const t = new Date(); t.setDate(1); t.setHours(0, 0, 0, 0);
  const d = new Date(dateStr); d.setDate(1); d.setHours(0, 0, 0, 0);
  return Math.max(0, (d.getFullYear() - t.getFullYear()) * 12 + (d.getMonth() - t.getMonth()));
}

export function formatDate(ds) {
  if (!ds) return '';
  const d = new Date(ds);
  if (isNaN(d)) return ds;
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일(${days[d.getDay()]})`;
}

// ===== 입력 유틸 =====

export function fmtComma(el) {
  const raw = el.value.replace(/[^0-9]/g, '');
  el.value = raw ? Number(raw).toLocaleString() : '';
}

export function getInpNum(id) {
  const el = document.getElementById(id);
  if (!el) return 0;
  return Number(el.value.replace(/[^0-9]/g, '')) || 0;
}

export function savLbl(inputId, labelId) {
  const n = getInpNum(inputId);
  const el = document.getElementById(labelId);
  if (!el) return;
  if (n >= 100000000) el.textContent = `${(n / 100000000).toFixed(1)}억원`;
  else if (n >= 10000) el.textContent = `${Math.round(n / 10000).toLocaleString()}만원`;
  else el.textContent = n > 0 ? `${n.toLocaleString()}원` : '';
}

export function pct(a, b) {
  return b > 0 ? Math.min(100, Math.round(a / b * 100)) : 0;
}

// ===== 카테고리 색상 =====

export const CAT_COLOR = {
  '🏰웨딩홀':    '#FF6B6B',
  '👗스드메':    '#FF8E53',
  '🤵🏻예복':    '#FFC048',
  '💍예물예단':  '#FFE066',
  '📷본식스냅영상': '#6BCB77',
  '💄관리비용':  '#4FC3F7',
  '👥청첩장모임': '#7E57C2',
  '🎞️스냅촬영': '#EC407A',
  '🎁선물답례':  '#26A69A',
  '✈️신혼여행':  '#42A5F5',
  '🚘차(교통비)': '#8D6E63',
  '🏠집':       '#78909C',
  '🛠️인테리어': '#66BB6A',
  '🧴생활용품': '#FFCA28',
  '🔌가전':     '#EF5350',
  '🛏️가구':    '#AB47BC',
  '✨기타':     '#BDBDBD',
};
