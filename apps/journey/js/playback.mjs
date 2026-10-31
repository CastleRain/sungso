const MODES = Object.freeze({ fast: [30, 60, 120], slow: [180, 300, 600] });
const clamp = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const intersects = (a = [], b = []) => a.some(value => b.includes(value));
const dateAt = time => Number.isFinite(time) ? new Date(time + 32400000).toISOString().slice(0, 10) : null;
// A sparse photo day must remain visible beside months of dense GPS. Reserve a
// minority of the screen-time budget for every recorded day, not every point.
const MOTION_DAY_SHARE = .3;
const movingScene = scene => scene?.moving === true || (scene?.segments || []).some(segment => {
  const first = segment.points?.[0], last = segment.points?.at(-1);
  return first && last && last.time > first.time && segment.points.some(point => point.lat !== first.lat || point.lng !== first.lng);
});

/** Sole clock for a whole period; the map consumes frames and never advances time itself. */
export function createJourneyPlayback({ onChange = () => {}, now = () => performance.now(), requestFrame = callback => globalThis.requestAnimationFrame(callback), cancelFrame = id => globalThis.cancelAnimationFrame(id) } = {}) {
  let scenes = [], progress = 0, playing = false, mode = 'fast', destroyed = false, frame = null, anchorTime = 0, anchorProgress = 0;
  let timeline = [], sceneStarts = [], totalWeight = 0;
  const durations = { fast: 60, slow: 300 };
  const available = () => scenes.length > 1 || scenes.length === 1 && movingScene(scenes[0]);
  const cancel = () => { if (frame !== null) cancelFrame(frame); frame = null; };
  function sync(time = now()) {
    if (!playing) return;
    progress = clamp(anchorProgress + Math.max(0, time - anchorTime) / (durations[mode] * 1000));
    if (progress >= 1) { playing = false; cancel(); }
  }
  function buildTimeline() {
    timeline = []; sceneStarts = []; totalWeight = 0;
    const plans = scenes.map(scene => {
      const start = scene.startTime ?? scene.time, end = scene.endTime ?? start;
      const spans = scene.motion && scene.motionSpans?.length ? scene.motionSpans : [{ start, end, weight: 1, kind: 'scene' }];
      return spans.map(span => ({ ...span, weight: Number.isFinite(span.weight) && span.weight > 0 ? span.weight : 1 }));
    });
    const weights = plans.map(spans => spans.reduce((sum, span) => sum + span.weight, 0));
    const sourceTotal = weights.reduce((sum, weight) => sum + weight, 0);
    const dayFloor = scenes.length > 0 && scenes.every(scene => scene.motion) ? MOTION_DAY_SHARE : 0;
    for (const [index, scene] of scenes.entries()) {
      sceneStarts.push(totalWeight);
      const scale = dayFloor ? (dayFloor * sourceTotal / scenes.length + (1 - dayFloor) * weights[index]) / weights[index] : 1;
      for (const span of plans[index]) {
        const weight = span.weight * scale;
        timeline.push({ ...span, index, offset: totalWeight, limit: totalWeight + weight, weight }); totalWeight += weight;
      }
    }
    sceneStarts = sceneStarts.map(value => value / totalWeight);
  }
  function entryAt(value) {
    if (!timeline.length) return null;
    const target = value * totalWeight;
    let low = 0, high = timeline.length;
    while (low < high) { const middle = (low + high) >>> 1; if (timeline[middle].limit <= target + totalWeight * 1e-12) low = middle + 1; else high = middle; }
    return timeline[Math.min(timeline.length - 1, low)];
  }
  function progressAt(index, sourceProgress) {
    const entries = timeline.filter(entry => entry.index === index), scene = scenes[index];
    if (!entries.length) return 0;
    const start = scene.startTime ?? scene.time, end = scene.endTime ?? start;
    if (!Number.isFinite(start) || end === start) return (entries[0].offset + entries.reduce((sum, entry) => sum + entry.weight, 0) * sourceProgress) / totalWeight;
    const target = start + (end - start) * sourceProgress;
    const entry = entries.find(value => target < value.end) || entries.at(-1);
    const part = entry.end > entry.start ? clamp((target - entry.start) / (entry.end - entry.start)) : sourceProgress;
    return (entry.offset + entry.weight * part) / totalWeight;
  }
  function getState() {
    if (destroyed) return { scenes: [], sceneStarts: [], index: -1, scene: null, sceneProgress: 0, progress: 0, elapsed: 0, duration: durations[mode], mode, playing: false, available: false, date: null, time: null };
    sync();
    const entry = entryAt(progress), index = entry?.index ?? -1, scene = scenes[index] || null;
    const delta = entry ? progress * totalWeight - entry.offset : 0;
    const part = entry ? progress === 1 ? 1 : Math.abs(delta) <= totalWeight * 1e-12 ? 0 : clamp(delta / entry.weight) : 0;
    const time = Number.isFinite(entry?.start) ? Math.round(entry.start + (Number.isFinite(entry.end) ? entry.end - entry.start : 0) * part) : null;
    const start = scene?.startTime ?? scene?.time, end = scene?.endTime ?? start;
    const sceneProgress = !scene ? 0 : progress === 1 ? 1 : Number.isFinite(start) && end > start ? clamp((time - start) / (end - start)) : part;
    return { scenes, sceneStarts, index, scene, sceneProgress, progress, elapsed: progress * durations[mode], duration: durations[mode], mode, playing, available: available(), date: scene?.motion ? dateAt(time) || scene.date : scene?.date || null, time, motionKind: entry?.kind || null };
  }
  const emit = () => { const state = getState(); if (!destroyed) onChange(state); return state; };
  const reanchor = () => { anchorTime = now(); anchorProgress = progress; };
  function tick() { frame = null; if (destroyed || !playing) return; sync(); emit(); if (playing) frame = requestFrame(tick); }
  function schedule() { if (playing && frame === null) frame = requestFrame(tick); }
  function pause() { sync(); playing = false; cancel(); return emit(); }
  function load(values, { anchor } = {}) {
    if (destroyed) return getState();
    playing = false; cancel(); scenes = [...(values || [])]; progress = 0; buildTimeline();
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
      if (index !== -1) {
        let sourceProgress = retained ? clamp(anchor.sceneProgress ?? 0) : 0;
        const start = scenes[index].startTime ?? scenes[index].time, end = scenes[index].endTime ?? start;
        if (retained && scenes[index].motion && Number.isFinite(anchor.time) && end > start) sourceProgress = clamp((anchor.time - start) / (end - start));
        progress = clamp(progressAt(index, sourceProgress));
      }
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
  function seekScene(id) { if (destroyed) return getState(); const index = scenes.findIndex(scene => scene.id === id); if (index === -1) return getState(); playing = false; cancel(); return seek(sceneStarts[index]); }
  function setMode(value) { if (destroyed || !Object.hasOwn(MODES, value)) return getState(); sync(); mode = value; reanchor(); return emit(); }
  function setDuration(value) { if (destroyed || !MODES[mode].includes(Number(value))) return getState(); sync(); durations[mode] = Number(value); reanchor(); return emit(); }
  function restart() { if (destroyed) return getState(); playing = false; cancel(); return seek(0); }
  function step(direction) { const state = getState(); if (state.index < 0) return state; return seekScene(scenes[Math.max(0, Math.min(scenes.length - 1, state.index + (direction < 0 ? -1 : 1)))].id); }
  function destroy() { playing = false; cancel(); scenes = []; timeline = []; sceneStarts = []; totalWeight = 0; progress = 0; destroyed = true; }
  return { load, play, pause, seek, seekScene, setMode, setDuration, restart, step, getState, destroy };
}
