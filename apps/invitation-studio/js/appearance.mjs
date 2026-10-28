/** Appearance changes are visual only; never read/write invitation data or media. */
export const APPEARANCE_PALETTES = Object.freeze(Object.fromEntries(Object.entries({
  mist: { label: '안개 블루', paper: '#fcfdfd', ink: '#243b50', accent: '#436c92', muted: '#5a7285', line: '#d9e4ec', soft: '#edf4f8', outer: '#e6edf2', surface: '#ffffff', tint: '#e6eff7', night: '#20394a' },
  azure: { label: '맑은 블루', paper: '#fbfdff', ink: '#243b50', accent: '#285fa0', muted: '#566f86', line: '#d6e3f1', soft: '#edf4fb', outer: '#e6edf5', surface: '#ffffff', tint: '#e3eefb', night: '#16374f' },
  rose: { label: '로즈 화이트', paper: '#fffdfd', ink: '#493a41', accent: '#8c5166', muted: '#79616c', line: '#eadce2', soft: '#faf0f3', outer: '#f2eaee', surface: '#ffffff', tint: '#f4e4eb', night: '#44313b' },
  midnight: { label: '밤빛 네이비', paper: '#fcfdff', ink: '#24334c', accent: '#324c78', muted: '#596b84', line: '#d8e0eb', soft: '#edf1f7', outer: '#e5eaf2', surface: '#ffffff', tint: '#e1e8f3', night: '#1c2d46' },
}).map(([key, value]) => [key, Object.freeze(value)])));

export const APPEARANCE_FONTS = Object.freeze({
  letter: Object.freeze({ label: '단정한 편지', body: 'RIDIBatang', title: 'Hahmlet', bodyWeight: 400, titleWeight: 500 }),
  editorial: Object.freeze({ label: '또렷한 세리프', body: 'Hahmlet', title: 'Hahmlet', bodyWeight: 500, titleWeight: 500 }),
  modern: Object.freeze({ label: '가벼운 모던', body: 'StudioModern', title: 'StudioModern', bodyWeight: 400, titleWeight: 500 }),
});

export function appearanceChoices(value) {
  return {
    palette: typeof value?.palette === 'string' && Object.hasOwn(APPEARANCE_PALETTES, value.palette) ? value.palette : 'mist',
    font: typeof value?.font === 'string' && Object.hasOwn(APPEARANCE_FONTS, value.font) ? value.font : 'letter',
  };
}

export function mountAppearance({ doc = document, win = window, composition, onLayout = () => {} } = {}) {
  const body = doc.body, originalData = { palette: body.dataset.palette, font: body.dataset.font };
  const tokens = Object.keys(APPEARANCE_PALETTES.mist).filter(key => key !== 'label');
  const originalTokens = tokens.map(key => [key, body.style.getPropertyValue(`--${key}`), body.style.getPropertyPriority(`--${key}`)]);
  const waits = new Set();
  let current, disposed = false, generation = 0, ready = Promise.resolve(true);
  function loadFont(font) {
    const ownGeneration = ++generation;
    if (!doc.fonts?.load) { onLayout(); return Promise.resolve(false); }
    const selected = APPEARANCE_FONTS[font];
    const loaded = Promise.all([
      doc.fonts.load(`${selected.bodyWeight} 16px ${selected.body}`, '성우 소희 함께해 주세요'),
      doc.fonts.load(`${selected.titleWeight} 24px ${selected.title}`, '성우 소희'),
    ]).then(() => true, () => false);
    loaded.then(() => { if (!disposed && ownGeneration === generation) onLayout(); });
    // A slow font may settle later, but must never stall a section preview.
    return new Promise(resolve => {
      const wait = { timer: null, finish: null };
      let finished = false;
      wait.finish = value => {
        if (finished) return;
        finished = true; win.clearTimeout(wait.timer); waits.delete(wait); resolve(value);
      };
      wait.timer = win.setTimeout(() => wait.finish(false), 1500);
      waits.add(wait); loaded.then(wait.finish);
    });
  }
  function setComposition(value) {
    if (disposed) return Promise.resolve(false);
    const next = appearanceChoices(value), previousFont = current?.font;
    current = next;
    body.dataset.palette = next.palette; body.dataset.font = next.font;
    for (const key of tokens) body.style.setProperty(`--${key}`, APPEARANCE_PALETTES[next.palette][key]);
    if (previousFont !== next.font) ready = loadFont(next.font);
    return ready;
  }
  setComposition(composition);
  return {
    setComposition,
    get whenReady() { return ready; },
    setEnabled() {},
    refresh() { if (!disposed) onLayout(); },
    destroy() {
      if (disposed) return;
      disposed = true; generation++;
      for (const wait of [...waits]) wait.finish(false);
      for (const key of ['palette', 'font']) {
        if (originalData[key] === undefined) delete body.dataset[key]; else body.dataset[key] = originalData[key];
      }
      for (const [key, value, priority] of originalTokens) {
        if (value) body.style.setProperty(`--${key}`, value, priority); else body.style.removeProperty(`--${key}`);
      }
    },
  };
}
