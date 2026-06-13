import { won, wonFull, monthsBetween, fmtComma, getInpNum, savLbl } from './utils.js';
import { updateSavings, updateSettings } from './firebase.js';

let _savChartInst = null;
let _saveTimer    = null;

export function initCashflowInputs(st) {
  const s   = st.savings   || {};
  const cfg = st.settings  || {};

  // 결혼일
  const wedEl = document.getElementById('inp-wed-date');
  if (wedEl && cfg.weddingDate) wedEl.value = cfg.weddingDate;

  // 저축 입력 초기화
  _setFmt('inp-sohee-cur', s.soheeCurrent || 0);
  _setFmt('inp-sohee-mon', s.soheeMonthly || 0);
  _setFmt('inp-sunwo-cur', s.sunwoCurrent || 0);
  _setFmt('inp-sunwo-mon', s.sunwoMonthly || 0);

  savLbl('inp-sohee-cur', 'lbl-sc');
  savLbl('inp-sohee-mon', 'lbl-sm');
  savLbl('inp-sunwo-cur', 'lbl-wc');
  savLbl('inp-sunwo-mon', 'lbl-wm');
}

export function renderCashflow(st) {
  const wedDate = document.getElementById('inp-wed-date')?.value || st.settings?.weddingDate || '';
  const months  = monthsBetween(wedDate);

  // 개월 수 레이블
  const lbl = document.getElementById('lbl-months-left');
  if (lbl) {
    lbl.textContent = !wedDate ? '' : months === 0 ? '결혼달이 됐어요 🎉' : `결혼까지 약 ${months}개월`;
  }

  // 합산 결과
  _set('res-couple-tot',    won(st.coupleSavings || 0));
  _set('res-sohee-tot',     won(st.soheeFinal    || 0));
  _set('res-sunwo-tot',     won(st.sunwoFinal    || 0));
  _set('res-sohee-final',   won(st.soheeFinal    || 0));
  _set('res-sunwo-final',   won(st.sunwoFinal    || 0));

  const s = st.savings || {};
  _set('res-monthly-total', won((s.soheeMonthly || 0) + (s.sunwoMonthly || 0)));

  // 저축 차트
  const soheeCur = s.soheeCurrent || 0;
  const soheeMon = s.soheeMonthly || 0;
  const sunwoCur = s.sunwoCurrent || 0;
  const sunwoMon = s.sunwoMonthly || 0;
  const pts = Math.min(months, 60);
  const labels = [], sD = [], wD = [], tD = [];
  const today = new Date();
  for (let m = 0; m <= pts; m++) {
    const d = new Date(today.getFullYear(), today.getMonth() + m, 1);
    labels.push(`${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`);
    const sv = soheeCur + soheeMon * m;
    const wv = sunwoCur + sunwoMon * m;
    sD.push(sv); wD.push(wv); tD.push(sv + wv);
  }

  if (_savChartInst) _savChartInst.destroy();
  const canvas = document.getElementById('savings-chart');
  if (canvas) {
    _savChartInst = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: '소희', data: sD, borderColor: '#dc2626', backgroundColor: 'rgba(220,38,38,0.05)', tension: 0.3, pointRadius: pts > 24 ? 0 : 3, borderWidth: 2 },
          { label: '성우', data: wD, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.05)', tension: 0.3, pointRadius: pts > 24 ? 0 : 3, borderWidth: 2 },
          { label: '합계', data: tD, borderColor: '#0f766e', backgroundColor: 'rgba(15,118,110,0.06)', tension: 0.3, pointRadius: pts > 24 ? 0 : 3, borderWidth: 2.5 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${won(ctx.raw)}` } },
        },
        scales: {
          y: { ticks: { callback: v => won(v), font: { size: 10 } }, beginAtZero: true },
          x: { ticks: { font: { size: 10 }, maxTicksLimit: 12 } },
        },
      },
    });
  }
}

// 입력 핸들러 — debounce 저장
export function onSavingsInput(field, el) {
  fmtComma(el);
  const lblMap = { 'sohee-cur': 'lbl-sc', 'sohee-mon': 'lbl-sm', 'sunwo-cur': 'lbl-wc', 'sunwo-mon': 'lbl-wm' };
  const lbl = lblMap[field];
  if (lbl) savLbl(`inp-${field}`, lbl);

  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    await updateSavings({
      soheeCurrent: getInpNum('inp-sohee-cur'),
      soheeMonthly: getInpNum('inp-sohee-mon'),
      sunwoCurrent: getInpNum('inp-sunwo-cur'),
      sunwoMonthly: getInpNum('inp-sunwo-mon'),
    });
  }, 500);
}

export async function onWedDateChange() {
  const val = document.getElementById('inp-wed-date')?.value;
  if (val) {
    await updateSettings({ weddingDate: val });
  }
}

function _set(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function _setFmt(id, n) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = n > 0 ? Math.round(n).toLocaleString() : '';
}
