// user-prefs.js — 취향 설정 + 적합도 계산

const PREFS_KEY = 'honeymoon_prefs_v1';

const DIMS = [
  { key: 'lagoon',     label: '라군뷰',    icon: '🌊' },
  { key: 'underwater', label: '수중환경',   icon: '🐠' },
  { key: 'privacy',    label: '프라이버시', icon: '🔒' },
  { key: 'dining',     label: '다이닝',    icon: '🍽️' },
];

let prefs = { lagoon: 1, underwater: 1, privacy: 1, dining: 1 };

export function loadPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    DIMS.forEach(d => {
      if (saved[d.key] != null) prefs[d.key] = Number(saved[d.key]);
    });
  } catch (_) {}
  return { ...prefs };
}

function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (_) {}
}

export function getPrefs() { return { ...prefs }; }

export function calcFitScore(resort) {
  const totalWeight = prefs.lagoon + prefs.underwater + prefs.privacy + prefs.dining;
  if (totalWeight === 0) return 50;
  const weighted =
    resort.ratings.lagoon     * prefs.lagoon +
    resort.ratings.underwater * prefs.underwater +
    resort.ratings.privacy    * prefs.privacy +
    resort.ratings.dining     * prefs.dining;
  return Math.round(weighted / (5 * totalWeight) * 100);
}

export function initPrefsPanel(onChange) {
  loadPrefs();

  const toggleBtn = document.getElementById('prefsToggleBtn');
  const panel     = document.getElementById('prefsPanel');
  if (!toggleBtn || !panel) return;

  toggleBtn.addEventListener('click', () => {
    const open = panel.classList.toggle('open');
    toggleBtn.classList.toggle('active', open);
  });

  DIMS.forEach(dim => {
    [0, 1, 2].forEach(w => {
      const btn = document.getElementById(`pref_${dim.key}_${w}`);
      if (!btn) return;
      if (prefs[dim.key] === w) btn.classList.add('active');
      btn.addEventListener('click', () => {
        prefs[dim.key] = w;
        savePrefs();
        [0, 1, 2].forEach(i => {
          document.getElementById(`pref_${dim.key}_${i}`)?.classList.toggle('active', i === w);
        });
        if (onChange) onChange();
      });
    });
  });
}
