import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudioController } from '../js/background-audio.mjs';

class TestAudio extends EventTarget {
  paused = true;
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
}

test('재생 실패 뒤 다시 시도할 수 있고 직접 멈춘 상태를 보존한다', async () => {
  const audio = new TestAudio(), states = [];
  let first = true;
  audio.play = () => { if (first) { first = false; return Promise.reject(Error('unavailable')); } audio.paused = false; return Promise.resolve(); };
  const player = createAudioController(audio, state => states.push(state));
  await player.toggle(); assert.equal(states.at(-1), 'error');
  await player.toggle(); assert.equal(states.at(-1), 'playing');
  await player.toggle(); assert.equal(audio.paused, true); assert.equal(states.at(-1), 'paused');
});

test('느린 재생 요청 중 취소하면 늦은 응답이 음악을 다시 켜지 않는다', async () => {
  const audio = new TestAudio(), states = [];
  let finish;
  audio.play = () => new Promise(resolve => { finish = () => { audio.paused = false; resolve(); }; });
  const player = createAudioController(audio, state => states.push(state));
  const pending = player.toggle();
  await player.toggle(); finish(); await pending;
  assert.equal(audio.paused, true); assert.equal(states.at(-1), 'paused');
});

test('취소 뒤 새 재생 요청은 이전 재생 완료나 지연된 pause 이벤트에 취소되지 않는다', async () => {
  const audio = new TestAudio(), states = [], finishes = [];
  audio.pause = () => { audio.paused = true; };
  audio.play = () => new Promise(resolve => finishes.push(() => { audio.paused = false; resolve(); }));
  const player = createAudioController(audio, state => states.push(state));
  const old = player.toggle(); await player.toggle(); const current = player.toggle();
  audio.dispatchEvent(new Event('pause'));
  finishes[0](); await old; finishes[1](); await current;
  assert.equal(audio.paused, false); assert.equal(states.at(-1), 'playing');
});
