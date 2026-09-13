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

  // 부모님 지원금 입력 초기화 (현금흐름 탭으로 이동)
  _setFmt('inp-sohee-sup', cfg.parentSupportSohee || 0);
  _setFmt('inp-sunwo-sup', cfg.parentSupportSunwo || 0);
  savLbl('inp-sohee-sup', 'cash-sohee-sup');
  savLbl('inp-sunwo-sup', 'cash-sunwo-sup');
}

export function renderCashflow(st) {
  const cfg     = st.settings  || {};
  const wedDate = document.getElementById('inp-wed-date')?.value || cfg.weddingDate || '';
  const months  = monthsBetween(wedDate);

  // 부모님 지원금 동기화 (포커스 중이 아닐 때만)
  _syncIfNotFocused('inp-sohee-sup', cfg.parentSupportSohee);
  _syncIfNotFocused('inp-sunwo-sup', cfg.parentSupportSunwo);
  savLbl('inp-sohee-sup', 'cash-sohee-sup');
  savLbl('inp-sunwo-sup', 'cash-sunwo-sup');

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
          { label: '소희', data: sD, borderColor: '#ec4899', backgroundColor: 'rgba(236,72,153,0.06)', tension: 0.4, pointRadius: pts > 24 ? 0 : 3, borderWidth: 2.5, fill: true },
          { label: '성우', data: wD, borderColor: '#6c63ff', backgroundColor: 'rgba(108,99,255,0.06)', tension: 0.4, pointRadius: pts > 24 ? 0 : 3, borderWidth: 2.5, fill: true },
          { label: '합계', data: tD, borderColor: '#2ecc71', backgroundColor: 'rgba(46,204,113,0.08)', tension: 0.4, pointRadius: pts > 24 ? 0 : 4, borderWidth: 3, fill: true },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 900, easing: 'easeOutQuart' },
        plugins: {
          tooltip: {
            backgroundColor: '#fff',
            titleColor: '#111827',
            bodyColor: '#8b90a0',
            borderColor: '#ececf4',
            borderWidth: 1,
            cornerRadius: 12,
            padding: 10,
            callbacks: { label: ctx => ` ${ctx.dataset.label}: ${won(ctx.raw)}` },
          },
          legend: {
            labels: {
              usePointStyle: true,
              pointStyle: 'circle',
              boxWidth: 8,
              padding: 16,
              font: { size: 12 },
            },
          },
        },
        scales: {
          y: {
            ticks: { callback: v => won(v), font: { size: 10 } },
            beginAtZero: true,
            grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false },
          },
          x: {
            ticks: { font: { size: 10 }, maxTicksLimit: 12 },
            grid: { display: false },
          },
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

function _syncIfNotFocused(id, n) {
  const el = document.getElementById(id);
  if (!el || document.activeElement === el) return;
  el.value = (n || 0) > 0 ? Math.round(n).toLocaleString() : '';
}
