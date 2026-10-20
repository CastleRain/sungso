import { music } from './config.mjs?v=3.3.0';

// A real audio element owns playback; changing views never recreates it.
export function createAudioController(audio, onState = () => {}) {
  let desired = false, revision = 0, phase = 'paused';
  const publish = value => { phase = value; onState(value); };
  audio.loop = true;
  audio.volume = .35;
  function stop() {
    desired = false; revision++;
    audio.pause(); publish('paused');
  }
  async function toggle() {
    if (desired) { stop(); return; }
    desired = true;
    const request = ++revision;
    publish('loading');
    try {
      await audio.play();
      if (request !== revision) { if (!desired) audio.pause(); return; }
      publish('playing');
    } catch {
      if (request !== revision) return;
      desired = false;
      publish('error');
    }
  }
  audio.addEventListener('error', () => { desired = false; revision++; publish('error'); });
  audio.addEventListener('pause', () => { if (desired && audio.paused && phase === 'playing') { desired = false; revision++; publish('paused'); } });
  audio.addEventListener('playing', () => { if (desired) publish('playing'); });
  return { toggle, stop, setVolume(value) { audio.volume = Math.max(0, Math.min(1, Number(value) || 0)); return audio.volume; } };
}

if (typeof document !== 'undefined' && music.src) {
  const audio = document.querySelector('#background-audio');
  const dock = document.querySelector('#sound-dock');
  const controls = [...document.querySelectorAll('[data-audio-toggle]')];
  const status = document.querySelector('#sound-status');
  const settings = document.querySelector('#sound-settings');
  const volumeButton = document.querySelector('#sound-volume-button');
  const player = createAudioController(audio, state => {
    dock.dataset.state = state;
    const playing = state === 'playing';
    const label = { paused: '음악 켜기', loading: '불러오는 중 · 눌러서 취소', playing: '음악 끄기', error: '다시 재생' }[state];
    controls.forEach(control => {
      control.setAttribute('aria-pressed', String(playing));
      control.setAttribute('aria-label', `배경음악 ${label.replace(/^음악 /, '')}`);
      control.querySelector('[data-audio-label]').textContent = label;
    });
    status.textContent = state === 'error' ? '음악을 불러오지 못했어요. 다시 재생해 주세요.' : '';
    if (state === 'error') { settings.hidden = false; volumeButton.setAttribute('aria-expanded', 'true'); }
  });
  controls.forEach(control => control.addEventListener('click', () => { void player.toggle(); }));
  volumeButton.addEventListener('click', () => {
    settings.hidden = !settings.hidden;
    volumeButton.setAttribute('aria-expanded', String(!settings.hidden));
  });
  function closeSettings() { settings.hidden = true; volumeButton.setAttribute('aria-expanded', 'false'); }
  document.addEventListener('click', event => { if (!dock.contains(event.target)) closeSettings(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !settings.hidden) { closeSettings(); volumeButton.focus({ preventScroll: true }); }
  });
  const volume = document.querySelector('#sound-volume');
  volume.addEventListener('input', () => {
    player.setVolume(Number(volume.value) / 100);
    document.querySelector('#sound-volume-value').textContent = `${volume.value}%`;
  });
  audio.addEventListener('timeupdate', () => {
    const track = music.tracks?.filter(item => item.startsAt <= audio.currentTime).at(-1);
    document.querySelector('#sound-track').textContent = `${track?.title || music.title} · ${music.artist}`;
  });
}
