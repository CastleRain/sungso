const MODES = Object.freeze({ fast: [30, 60, 120], slow: [180, 300, 600] });
const clamp = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const intersects = (a = [], b = []) => a.some(value => b.includes(value));
const movingScene = scene => scene?.moving === true || (scene?.segments || []).some(segment => {
  const first = segment.points?.[0], last = segment.points?.at(-1);
  return first && last && last.time > first.time && segment.points.some(point => point.lat !== first.lat || point.lng !== first.lng);
});

/** Sole clock for a whole period; the map consumes frames and never advances time itself. */
export function createJourneyPlayback({ onChange = () => {}, now = () => performance.now(), requestFrame = callback => globalThis.requestAnimationFrame(callback), cancelFrame = id => globalThis.cancelAnimationFrame(id) } = {}) {
  let scenes = [], progress = 0, playing = false, mode = 'fast', destroyed = false, frame = null, anchorTime = 0, anchorProgress = 0;
  const durations = { fast: 60, slow: 300 };
  const available = () => scenes.length > 1 || scenes.length === 1 && movingScene(scenes[0]);
  const cancel = () => { if (frame !== null) cancelFrame(frame); frame = null; };
  function sync(time = now()) {
    if (!playing) return;
    progress = clamp(anchorProgress + Math.max(0, time - anchorTime) / (durations[mode] * 1000));
    if (progress >= 1) { playing = false; cancel(); }
  }
  function getState() {
    if (destroyed) return { scenes: [], index: -1, scene: null, sceneProgress: 0, progress: 0, elapsed: 0, duration: durations[mode], mode, playing: false, available: false, date: null, time: null };
    sync();
    const raw = progress * scenes.length, scaled = Math.abs(raw - Math.round(raw)) < 1e-9 ? Math.round(raw) : raw;
    const index = scenes.length ? Math.min(scenes.length - 1, Math.floor(scaled)) : -1;
    const scene = scenes[index] || null, sceneProgress = scene ? progress === 1 ? 1 : clamp(scaled - index) : 0;
    const start = scene?.startTime ?? scene?.time, end = scene?.endTime ?? start;
    return { scenes, index, scene, sceneProgress, progress, elapsed: progress * durations[mode], duration: durations[mode], mode, playing, available: available(), date: scene?.date || null, time: Number.isFinite(start) ? Math.round(start + (Number.isFinite(end) ? end - start : 0) * sceneProgress) : null };
  }
  const emit = () => { const state = getState(); if (!destroyed) onChange(state); return state; };
  const reanchor = () => { anchorTime = now(); anchorProgress = progress; };
  function tick() { frame = null; if (destroyed || !playing) return; sync(); emit(); if (playing) frame = requestFrame(tick); }
  function schedule() { if (playing && frame === null) frame = requestFrame(tick); }
  function pause() { sync(); playing = false; cancel(); return emit(); }
  function load(values, { anchor } = {}) {
    if (destroyed) return getState();
    playing = false; cancel(); scenes = [...(values || [])]; progress = 0;
    const old = anchor?.scene || anchor;
    if (old && scenes.length) {
      let index = scenes.findIndex(scene => scene.id === old.id);
      // Adding or filtering an overlapping person can merge or split a scene.
      // Its original record/track identity still anchors it within the same day.
      if (index === -1) index = scenes.findIndex(scene => scene.date === old.date && (intersects(scene.recordIds, old.recordIds) || intersects(scene.trackIds, old.trackIds)));
      const retained = index !== -1;
      if (index === -1 && old.date) {
        const target = Date.parse(old.date + 'T00:00:00Z');
        index = scenes.reduce((best, scene, i) => Math.abs(Date.parse(scene.date + 'T00:00:00Z') - target) < Math.abs(Date.parse(scenes[best].date + 'T00:00:00Z') - target) ? i : best, 0);
      }
      if (index !== -1) progress = clamp((index + (retained ? clamp(anchor.sceneProgress ?? 0) : 0)) / scenes.length);
    }
    reanchor(); return emit();
  }
  function play() {
    if (destroyed || !available()) return false;
    if (playing) return true;
    if (progress >= 1) progress = 0;
    playing = true; reanchor(); emit(); schedule(); return true;
  }
  function seek(value) { if (destroyed) return getState(); sync(); progress = clamp(Number(value)); if (progress >= 1) { playing = false; cancel(); } reanchor(); const state = emit(); schedule(); return state; }
  function seekScene(id) { if (destroyed) return getState(); const index = scenes.findIndex(scene => scene.id === id); if (index === -1) return getState(); playing = false; cancel(); return seek(index / scenes.length); }
  function setMode(value) { if (destroyed || !Object.hasOwn(MODES, value)) return getState(); sync(); mode = value; reanchor(); return emit(); }
  function setDuration(value) { if (destroyed || !MODES[mode].includes(Number(value))) return getState(); sync(); durations[mode] = Number(value); reanchor(); return emit(); }
  function restart() { if (destroyed) return getState(); playing = false; cancel(); return seek(0); }
  function step(direction) { const state = getState(); if (state.index < 0) return state; return seekScene(scenes[Math.max(0, Math.min(scenes.length - 1, state.index + (direction < 0 ? -1 : 1)))].id); }
  function destroy() { playing = false; cancel(); scenes = []; progress = 0; destroyed = true; }
  return { load, play, pause, seek, seekScene, setMode, setDuration, restart, step, getState, destroy };
}
