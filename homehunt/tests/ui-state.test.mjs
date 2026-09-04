import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PANEL_WIDTH_DEFAULT,
  UI_PREFERENCES_KEY,
  clampPanelWidth,
  createUIState,
  loadUIPreferences,
  saveUIPreferences,
} from '../js/ui-state.js';

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    value: (key) => values.get(key),
  };
}

test('UI 상태는 화면·선택·레이어 계약을 완전한 불변 스냅샷으로 제공한다', () => {
  const store = createUIState({}, { storage: null });
  const initial = store.get();

  assert.deepEqual(Object.keys(initial), [
    'screen', 'subview', 'panel', 'panelWidth', 'panelStack', 'selectedRef',
    'hoveredRef', 'filterDrawer', 'sheet', 'jobState', 'layers',
  ]);
  assert.equal(initial.screen, 'finder');
  assert.equal(initial.panelStack[0].type, 'results');
  assert.ok(Object.isFrozen(initial));
  assert.ok(Object.isFrozen(initial.layers));
  assert.equal(initial.layers.supply, true, 'the initial UI state matches the visible supply map layer');

  store.set({ selectedRef: { kind: 'complex', id: 101 }, layers: { supply: true } });
  const selected = store.get();
  assert.deepEqual(selected.selectedRef, { kind: 'complex', id: '101' });
  assert.equal(selected.layers.supply, true);
  assert.equal(selected.layers.complex, true, 'partial layer updates preserve other layers');
  assert.equal(initial.selectedRef, null, 'the previous snapshot is not mutated');
});

test('set/update/subscribe는 초기 상태와 의미 있는 변경만 전달한다', () => {
  const store = createUIState({}, { storage: null });
  const notifications = [];
  const unsubscribe = store.subscribe((next, previous, action) => {
    notifications.push({ screen: next.screen, previous: previous?.screen, action: action.type });
  });

  store.set('screen', 'records');
  store.update((state) => ({ subview: state.screen === 'records' ? 'list' : 'map' }));
  store.set({ subview: 'list' });
  unsubscribe();
  store.set({ screen: 'market' });

  assert.deepEqual(notifications, [
    { screen: 'finder', previous: undefined, action: 'subscribe' },
    { screen: 'records', previous: 'finder', action: 'set' },
    { screen: 'records', previous: 'records', action: 'set' },
  ]);
});

test('상세 패널은 결과 루트를 보존하는 스택으로 push/pop/replace/reset한다', () => {
  const store = createUIState({}, { storage: null });
  store.pushPanel({ type: 'complexDetail', id: 'apt-1' });
  assert.deepEqual(store.peekPanel(), { type: 'complexDetail', id: 'apt-1' });
  assert.equal(store.get().panelStack.length, 2);

  store.replacePanel({ type: 'commuteDetail', id: 'apt-1' });
  assert.deepEqual(store.peekPanel(), { type: 'commuteDetail', id: 'apt-1' });
  store.popPanel();
  assert.deepEqual(store.peekPanel(), { type: 'results' });
  store.popPanel();
  assert.equal(store.get().panelStack.length, 1, 'the root panel cannot be popped');

  store.pushPanel({ type: 'supplyDetail', id: 'notice-1' });
  store.resetPanelStack();
  assert.deepEqual(store.get().panelStack, [{ type: 'results' }]);
});

test('패널 폭은 안전하게 clamp하고 allow-list 형식으로만 저장한다', () => {
  const storage = memoryStorage({
    [UI_PREFERENCES_KEY]: JSON.stringify({ panelWidth: 9999, secret: 'must-not-survive' }),
  });
  assert.equal(clampPanelWidth(120), 360);
  assert.equal(clampPanelWidth(900), 560);
  assert.deepEqual(loadUIPreferences(storage), { panelWidth: 560 });

  const store = createUIState({}, { storage });
  assert.equal(store.get().panelWidth, 560);
  store.setPanelWidth(421.6);
  assert.deepEqual(JSON.parse(storage.value(UI_PREFERENCES_KEY)), { panelWidth: 422 });

  assert.deepEqual(saveUIPreferences({ panelWidth: 'not-a-number', token: 'no' }, storage), {
    panelWidth: PANEL_WIDTH_DEFAULT,
  });
  assert.deepEqual(JSON.parse(storage.value(UI_PREFERENCES_KEY)), { panelWidth: PANEL_WIDTH_DEFAULT });
});

test('localStorage 접근이 차단되거나 JSON이 깨져도 UI 상태는 계속 동작한다', () => {
  const blocked = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
  };
  assert.deepEqual(loadUIPreferences(blocked), { panelWidth: PANEL_WIDTH_DEFAULT });
  assert.doesNotThrow(() => saveUIPreferences({ panelWidth: 440 }, blocked));

  const broken = memoryStorage({ [UI_PREFERENCES_KEY]: '{broken' });
  const store = createUIState({}, { storage: broken });
  assert.equal(store.get().panelWidth, PANEL_WIDTH_DEFAULT);
  assert.doesNotThrow(() => store.setPanelWidth(450));
  assert.equal(store.get().panelWidth, 450);
});
