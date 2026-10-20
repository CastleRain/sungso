import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../js/intro-boot.js', import.meta.url), 'utf8');

function cover({ disabled = false, reduced = false, hash = '#top', restored = false, broken = false } = {}) {
  const classes = new Set();
  const classList = {
    add: (...items) => items.forEach(item => classes.add(item)),
    remove: (...items) => items.forEach(item => classes.delete(item)),
    contains: item => classes.has(item)
  };
  const animations = [], timers = new Map(), frames = new Map();
  let sequence = 0, finished = 0, focusReturned = false;
  const skip = new EventTarget();
  const trace = {
    animate(keys, timing) {
      if (broken) throw Error('Animation unavailable');
      const animation = { keys, timing, canceled: false, cancel() { this.canceled = true; } };
      animations.push(animation);
      return animation;
    }
  };
  const document = Object.assign(new EventTarget(), {
    documentElement: { classList }, readyState: 'loading', hidden: false, activeElement: null,
    querySelector: selector => selector === '#intro-skip' ? skip : { focus() { focusReturned = true; } },
    querySelectorAll: () => [trace]
  });
  const media = Object.assign(new EventTarget(), { matches: reduced });
  const window = new EventTarget();
  document.addEventListener('sungso:intro-finished', () => finished++);
  vm.runInNewContext(source, {
    document, window, Event, AbortController,
    localStorage: { getItem: () => disabled ? 'off' : null },
    performance: { getEntriesByType: () => [{ type: restored ? 'back_forward' : 'navigate' }] },
    matchMedia: () => media, location: { hash },
    addEventListener: window.addEventListener.bind(window),
    setTimeout: (fn, delay) => { const id = ++sequence; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame: fn => { const id = ++sequence; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    getComputedStyle: () => ({
      getPropertyValue: property => ({ '--ink-end': '2100ms', '--ink-delay': '40ms', '--ink-duration': '190ms' })[property]
    })
  });
  function parsed() {
    document.readyState = 'interactive';
    document.dispatchEvent(new Event('readystatechange'));
    const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn());
  }
  function expire() {
    const pending = [...timers.values()]; timers.clear(); pending.forEach(({ fn }) => fn());
  }
  return { document, window, media, classes, animations, timers, parsed, expire, skip,
    get finished() { return finished; }, get focusReturned() { return focusReturned; } };
}

test('앱 모듈이나 DOMContentLoaded를 기다리지 않고 DOM 파싱 직후 손글씨를 시작하고 잠금을 해제한다', () => {
  const page = cover();
  assert.ok(page.classes.has('intro-locked'));
  page.parsed();
  assert.ok(page.classes.has('intro-running'));
  assert.equal(page.animations.length, 2);
  assert.equal(page.animations[0].keys[0].strokeDashoffset, 1);
  assert.equal(page.animations[0].keys[1].strokeDashoffset, 0);
  assert.ok([...page.timers.values()][0].delay < 4500);
  page.expire();
  assert.ok(page.classes.has('intro-complete'));
  assert.ok(!page.classes.has('intro-locked'));
  assert.ok(page.animations.every(animation => animation.canceled));
  assert.equal(page.finished, 1);
});

test('문서 로딩이 실패해도 잠금은 만료되고 뒤늦은 파싱으로 다시 잠기지 않는다', () => {
  const page = cover();
  assert.equal([...page.timers.values()][0].delay, 4500);
  page.expire();
  page.parsed();
  assert.ok(!page.classes.has('intro-locked'));
  assert.equal(page.animations.length, 0);
});

test('효과 끄기·기기 모션 감소·섹션 직접 링크·뒤로 가기는 정적 표지를 유지한다', () => {
  for (const option of [{ disabled: true }, { reduced: true }, { hash: '#accounts' }, { restored: true }]) {
    const page = cover(option);
    page.parsed();
    assert.equal(page.classes.size, 0);
    assert.equal(page.animations.length, 0);
    assert.equal(page.timers.size, 0);
  }
});

test('바로 보기는 앱 모듈 없이도 작동하고 사라지는 버튼의 포커스를 돌려준다', () => {
  const page = cover();
  page.parsed();
  page.document.activeElement = { id: 'intro-skip' };
  page.skip.dispatchEvent(new Event('click'));
  assert.ok(!page.classes.has('intro-locked'));
  assert.ok(page.focusReturned);
  assert.equal(page.timers.size, 0);
});

test('탭 숨김과 기기 모션 감소 전환은 손글씨와 잠금을 즉시 정리한다', () => {
  for (const mode of ['hidden', 'reduced']) {
    const page = cover(); page.parsed();
    if (mode === 'hidden') {
      page.document.hidden = true;
      page.document.dispatchEvent(new Event('visibilitychange'));
    } else {
      page.media.matches = true;
      page.media.dispatchEvent(new Event('change'));
    }
    assert.ok(!page.classes.has('intro-locked'));
    assert.ok(page.animations.every(animation => animation.canceled));
  }
});

test('획 재생 실패 시 글자를 숨기거나 스크롤을 막아 두지 않는다', () => {
  const page = cover({ broken: true });
  page.parsed();
  assert.ok(page.classes.has('intro-complete'));
  assert.ok(!page.classes.has('intro-pending'));
  assert.ok(!page.classes.has('intro-locked'));
});
