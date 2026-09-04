/**
 * HomeHunt 3 UI state contract.
 *
 * This module deliberately has no DOM dependency. It can be consumed by a
 * browser module and by Node's contract tests without installing a state
 * library. State snapshots and their nested UI values are frozen so renderers
 * cannot accidentally mutate the shared selection or panel stack.
 */

export const UI_PREFERENCES_KEY = 'homehunt_ui_prefs_v1';
export const PANEL_WIDTH_DEFAULT = 404;
export const PANEL_WIDTH_MIN = 360;
export const PANEL_WIDTH_MAX = 560;

export const UI_SCREENS = Object.freeze([
  'finder',
  'records',
  'market',
  'supply',
  'guide',
  'health',
]);

export const PANEL_STATES = Object.freeze(['open', 'collapsed']);
export const SHEET_STATES = Object.freeze(['peek', 'half', 'full']);

const DEFAULT_LAYERS = Object.freeze({
  complex: true,
  supply: true,
  shortlist: true,
  visited: true,
  dest: true,
});

const DEFAULT_JOB_STATE = Object.freeze({
  phase: 'idle',
  done: 0,
  total: 0,
  cancelable: false,
});

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nonNegativeInteger(value, fallback = 0) {
  return Math.max(0, Math.trunc(finiteNumber(value, fallback)));
}

function safeString(value, fallback = '') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function safeGlobalStorage() {
  try {
    return globalThis.localStorage || null;
  } catch (_) {
    return null;
  }
}

function cloneRef(value) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return null;

  const kind = safeString(value.kind);
  const id = safeString(value.id);
  if (!kind || !id) return null;
  return Object.freeze({ kind, id });
}

function clonePanel(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const type = safeString(value.type);
  if (!type) return null;

  const panel = { type };
  const id = safeString(value.id);
  const kind = safeString(value.kind);
  const ref = cloneRef(value.ref);
  if (id) panel.id = id;
  if (kind) panel.kind = kind;
  if (ref) panel.ref = ref;
  return Object.freeze(panel);
}

function normalizePanelStack(value) {
  const stack = Array.isArray(value)
    ? value.map(clonePanel).filter(Boolean)
    : [];
  return Object.freeze(stack.length ? stack : [Object.freeze({ type: 'results' })]);
}

function normalizeJobState(value, previous = DEFAULT_JOB_STATE) {
  const input = value && typeof value === 'object' ? value : {};
  const phase = safeString(input.phase, previous.phase || 'idle');
  const total = nonNegativeInteger(input.total, previous.total);
  const uncappedDone = nonNegativeInteger(input.done, previous.done);
  const done = total > 0 ? Math.min(uncappedDone, total) : uncappedDone;
  return Object.freeze({
    phase,
    done,
    total,
    cancelable: hasOwn(input, 'cancelable')
      ? input.cancelable === true
      : previous.cancelable === true,
  });
}

function normalizeLayers(value, previous = DEFAULT_LAYERS) {
  const input = value && typeof value === 'object' ? value : {};
  const layers = {};
  for (const name of Object.keys(DEFAULT_LAYERS)) {
    layers[name] = hasOwn(input, name) ? input[name] !== false : previous[name] !== false;
  }
  return Object.freeze(layers);
}

export function clampPanelWidth(value) {
  const width = Math.round(finiteNumber(value, PANEL_WIDTH_DEFAULT));
  return Math.min(PANEL_WIDTH_MAX, Math.max(PANEL_WIDTH_MIN, width));
}

/** Read only the explicitly supported, non-sensitive UI preferences. */
export function loadUIPreferences(storage = safeGlobalStorage()) {
  let raw = null;
  try {
    raw = storage?.getItem?.(UI_PREFERENCES_KEY) ?? null;
  } catch (_) {
    return Object.freeze({ panelWidth: PANEL_WIDTH_DEFAULT });
  }

  if (!raw) return Object.freeze({ panelWidth: PANEL_WIDTH_DEFAULT });
  try {
    const parsed = JSON.parse(raw);
    return Object.freeze({ panelWidth: clampPanelWidth(parsed?.panelWidth) });
  } catch (_) {
    return Object.freeze({ panelWidth: PANEL_WIDTH_DEFAULT });
  }
}

/**
 * Store a minimal allow-listed payload. Storage errors (private mode, quota,
 * disabled cookies) never prevent the UI from continuing in memory.
 */
export function saveUIPreferences(preferences = {}, storage = safeGlobalStorage()) {
  const normalized = Object.freeze({ panelWidth: clampPanelWidth(preferences.panelWidth) });
  try {
    storage?.setItem?.(UI_PREFERENCES_KEY, JSON.stringify(normalized));
  } catch (_) {
    // In-memory UI state remains authoritative for the current session.
  }
  return normalized;
}

function normalizeState(input, previous) {
  const base = previous || DEFAULT_UI_STATE;
  const state = input && typeof input === 'object' ? input : {};
  const requestedScreen = safeString(state.screen, base.screen);
  const screen = UI_SCREENS.includes(requestedScreen) ? requestedScreen : base.screen;
  const requestedPanel = safeString(state.panel, base.panel);
  const panel = PANEL_STATES.includes(requestedPanel) ? requestedPanel : base.panel;
  const requestedSheet = safeString(state.sheet, base.sheet);
  const sheet = SHEET_STATES.includes(requestedSheet) ? requestedSheet : base.sheet;

  return Object.freeze({
    screen,
    subview: safeString(state.subview, base.subview),
    panel,
    panelWidth: clampPanelWidth(hasOwn(state, 'panelWidth') ? state.panelWidth : base.panelWidth),
    panelStack: normalizePanelStack(hasOwn(state, 'panelStack') ? state.panelStack : base.panelStack),
    selectedRef: hasOwn(state, 'selectedRef') ? cloneRef(state.selectedRef) : base.selectedRef,
    hoveredRef: hasOwn(state, 'hoveredRef') ? cloneRef(state.hoveredRef) : base.hoveredRef,
    filterDrawer: hasOwn(state, 'filterDrawer') ? state.filterDrawer === true : base.filterDrawer,
    sheet,
    jobState: normalizeJobState(state.jobState, base.jobState),
    layers: normalizeLayers(state.layers, base.layers),
  });
}

export const DEFAULT_UI_STATE = Object.freeze({
  screen: 'finder',
  subview: 'map',
  panel: 'open',
  panelWidth: PANEL_WIDTH_DEFAULT,
  panelStack: Object.freeze([Object.freeze({ type: 'results' })]),
  selectedRef: null,
  hoveredRef: null,
  filterDrawer: false,
  sheet: 'half',
  jobState: DEFAULT_JOB_STATE,
  layers: DEFAULT_LAYERS,
});

function mergePatch(current, patch) {
  const nextPatch = patch && typeof patch === 'object' ? patch : {};
  return {
    ...current,
    ...nextPatch,
    jobState: hasOwn(nextPatch, 'jobState')
      ? { ...current.jobState, ...(nextPatch.jobState || {}) }
      : current.jobState,
    layers: hasOwn(nextPatch, 'layers')
      ? { ...current.layers, ...(nextPatch.layers || {}) }
      : current.layers,
  };
}

function statesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Create an isolated UI store.
 *
 * subscribe() follows the small-store convention of immediately delivering
 * the current snapshot. Pass { immediate:false } for change-only listeners.
 */
export function createUIState(initialState = {}, options = {}) {
  const storage = hasOwn(options, 'storage') ? options.storage : safeGlobalStorage();
  const persistPreferences = options.persistPreferences !== false;
  const storedPreferences = loadUIPreferences(storage);
  const initialPanelWidth = hasOwn(initialState, 'panelWidth')
    ? initialState.panelWidth
    : storedPreferences.panelWidth;
  let current = normalizeState({ ...DEFAULT_UI_STATE, ...initialState, panelWidth: initialPanelWidth });
  const listeners = new Set();

  function get() {
    return current;
  }

  function notify(next, previous, action) {
    for (const listener of [...listeners]) listener(next, previous, action);
  }

  function set(keyOrPatch, value) {
    const patch = typeof keyOrPatch === 'string'
      ? { [keyOrPatch]: value }
      : keyOrPatch;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return current;

    const previous = current;
    const next = normalizeState(mergePatch(previous, patch), previous);
    if (statesEqual(previous, next)) return current;

    current = next;
    if (persistPreferences && previous.panelWidth !== next.panelWidth) {
      saveUIPreferences({ panelWidth: next.panelWidth }, storage);
    }
    notify(next, previous, Object.freeze({ type: 'set', patch: Object.freeze({ ...patch }) }));
    return current;
  }

  function update(keyOrUpdater, updater) {
    if (typeof keyOrUpdater === 'function') {
      const patch = keyOrUpdater(current);
      return set(patch);
    }
    if (typeof keyOrUpdater === 'string') {
      const nextValue = typeof updater === 'function' ? updater(current[keyOrUpdater]) : updater;
      return set(keyOrUpdater, nextValue);
    }
    return current;
  }

  function subscribe(listener, { immediate = true } = {}) {
    if (typeof listener !== 'function') throw new TypeError('UI state subscriber must be a function');
    listeners.add(listener);
    if (immediate) listener(current, null, Object.freeze({ type: 'subscribe' }));
    return () => listeners.delete(listener);
  }

  function pushPanel(descriptor) {
    const panel = clonePanel(descriptor);
    if (!panel) throw new TypeError('Panel descriptor requires a non-empty type');
    const top = current.panelStack[current.panelStack.length - 1];
    if (top?.type === panel.type && top?.id === panel.id && top?.kind === panel.kind) return current;
    return set({ panel: 'open', panelStack: [...current.panelStack, panel] });
  }

  function popPanel() {
    if (current.panelStack.length <= 1) return current;
    return set({ panelStack: current.panelStack.slice(0, -1) });
  }

  function replacePanel(descriptor) {
    const panel = clonePanel(descriptor);
    if (!panel) throw new TypeError('Panel descriptor requires a non-empty type');
    const stack = current.panelStack.length > 1
      ? [...current.panelStack.slice(0, -1), panel]
      : [panel];
    return set({ panelStack: stack });
  }

  function resetPanelStack(root = { type: 'results' }) {
    const panel = clonePanel(root);
    if (!panel) throw new TypeError('Panel descriptor requires a non-empty type');
    return set({ panelStack: [panel] });
  }

  function peekPanel() {
    return current.panelStack[current.panelStack.length - 1] || null;
  }

  function setLayer(name, enabled) {
    if (!hasOwn(DEFAULT_LAYERS, name)) return current;
    return set({ layers: { [name]: enabled !== false } });
  }

  function toggleLayer(name) {
    if (!hasOwn(DEFAULT_LAYERS, name)) return current;
    return setLayer(name, !current.layers[name]);
  }

  return Object.freeze({
    get,
    set,
    update,
    subscribe,
    pushPanel,
    popPanel,
    replacePanel,
    resetPanelStack,
    peekPanel,
    setPanelWidth: (width) => set({ panelWidth: width }),
    setLayer,
    toggleLayer,
    select: (ref) => set({ selectedRef: ref }),
    hover: (ref) => set({ hoveredRef: ref }),
    clearSelection: () => set({ selectedRef: null, hoveredRef: null }),
  });
}

/** Shared browser store; isolated stores remain available for tests/previews. */
export const hhUI = createUIState();
