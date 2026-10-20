import { music } from './config.mjs?v=4.0.0';

// A real audio element owns playback; changing views never recreates it.
export function createAudioController(audio, onState = () => {}) {
  let desired = false, revision = 0, phase = 'paused', gesturePending = false;
  const publish = value => { phase = value; onState(value); };
  audio.loop = true;
  audio.volume = .35;
  function stop() {
    desired = false; gesturePending = false; revision++;
    audio.pause(); publish('paused');
  }
  async function start({ automatic = false } = {}) {
    if (desired) return;
    desired = true;
    gesturePending = false;
    const request = ++revision;
    publish('loading');
    try {
      await audio.play();
      if (request !== revision) { if (!desired) audio.pause(); return; }
      publish('playing');
    } catch (error) {
      if (request !== revision) return;
      desired = false;
      gesturePending = automatic && error.name === 'NotAllowedError';
      publish(gesturePending ? 'blocked' : 'error');
    }
  }
  async function toggle() {
    if (desired) { stop(); return; }
    return start();
  }
  function resumeOnGesture() {
    if (gesturePending) return start();
  }
  audio.addEventListener('error', () => { desired = false; gesturePending = false; revision++; publish('error'); });
  audio.addEventListener('pause', () => { if (desired && audio.paused && phase === 'playing') { desired = false; revision++; publish('paused'); } });
  audio.addEventListener('playing', () => { if (desired) publish('playing'); });
  return { toggle, stop, start, resumeOnGesture };
}

if (typeof document !== 'undefined' && music.src) {
  const audio = document.querySelector('#background-audio');
  const dock = document.querySelector('#sound-dock');
  const controls = [...document.querySelectorAll('[data-audio-toggle]')];
  const status = document.querySelector('#sound-status');
  const player = createAudioController(audio, state => {
    dock.dataset.state = state;
    const playing = state === 'playing';
    const label = { paused: '음악 켜기', blocked: '음악 켜기', loading: '취소', playing: '음악 끄기', error: '다시 재생' }[state];
    controls.forEach(control => {
      control.setAttribute('aria-pressed', String(playing));
      control.setAttribute('aria-label', state==='loading'?'배경음악 불러오기 취소':`배경음악 ${label.replace(/^음악 /, '')}`);
      control.querySelector('[data-audio-label]').textContent = label;
    });
    status.textContent = state === 'error' ? '음악을 불러오지 못했어요. 다시 재생해 주세요.' : state === 'blocked' ? '화면을 터치하면 음악이 시작됩니다.' : '';
  });
  controls.forEach(control => control.addEventListener('click', () => { void player.toggle(); }));
  // Browsers that allow sound start immediately; others need a trusted gesture.
  // Explicit pause clears the pending retry, so scrolling or opening a photo cannot undo it.
  function firstInteraction(event) {
    if (event.target.closest?.('[data-audio-toggle]')) return;
    if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
    void player.resumeOnGesture();
  }
  document.addEventListener('pointerup', firstInteraction, { passive: true });
  document.addEventListener('keydown', firstInteraction);
  void player.start({ automatic: true });
  const hero = document.querySelector('.hero');
  if ('IntersectionObserver' in window) new IntersectionObserver(([entry]) => {
    dock.dataset.onCover = String(entry.isIntersecting);
  }, {rootMargin:'-66px 0px 0px',threshold:0}).observe(hero);
  else addEventListener('scroll',()=>{dock.dataset.onCover=String(hero.getBoundingClientRect().bottom>66);},{passive:true});
  audio.addEventListener('timeupdate', () => {
    const track = music.tracks?.filter(item => item.startsAt <= audio.currentTime).at(-1);
    dock.querySelector('button').title = `${track?.title || music.title} · ${music.artist}`;
  });
}
