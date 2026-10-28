// One audio element, including while a story, album, or quick-view dialog is open.
export function createAudioController(audio, onState = () => {}) {
  let desired = false, revision = 0, phase = 'paused', gesturePending = false, disposed = false;
  const publish = value => {
    if (disposed || phase === value) return;
    phase = value;
    onState(value);
  };
  audio.loop = true;
  audio.volume = .35;
  function stop() {
    if (disposed) return;
    desired = false;
    gesturePending = false;
    revision++;
    audio.pause();
    publish('paused');
  }
  async function start({ automatic = false } = {}) {
    if (disposed || desired) return;
    desired = true;
    gesturePending = false;
    const request = ++revision;
    publish('loading');
    try {
      await audio.play();
      if (disposed || request !== revision) {
        if (!desired || disposed) audio.pause();
        return;
      }
      publish('playing');
    } catch (error) {
      if (disposed || request !== revision) return;
      desired = false;
      gesturePending = error?.name === 'NotAllowedError';
      // The same trusted-gesture retry also handles a blocked explicit play attempt.
      publish(gesturePending ? 'blocked' : 'error');
    }
  }
  function toggle() { return desired ? stop() : start(); }
  function resumeOnGesture() {
    if (!disposed && gesturePending) return start();
  }
  function onError() {
    desired = false;
    gesturePending = false;
    revision++;
    publish('error');
  }
  function onPause() {
    if (desired && audio.paused && phase === 'playing') {
      desired = false;
      gesturePending = false;
      revision++;
      publish('paused');
    }
  }
  function onPlaying() {
    if (desired && !disposed) publish('playing');
    else audio.pause();
  }
  audio.addEventListener('error', onError);
  audio.addEventListener('pause', onPause);
  audio.addEventListener('playing', onPlaying);
  return {
    start, stop, toggle, resumeOnGesture,
    get phase() { return phase; },
    get desired() { return desired; },
    get pendingGesture() { return gesturePending; },
    destroy() {
      if (disposed) return;
      disposed = true;
      desired = false;
      gesturePending = false;
      revision++;
      phase = 'paused';
      audio.removeEventListener('error', onError);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('playing', onPlaying);
      audio.pause();
    },
  };
}

export function isPlaybackGesture(event) {
  return Boolean(event?.isTrusted &&
    ['click', 'touchend', 'keydown'].includes(event.type) &&
    !event.target?.closest?.('[data-audio-toggle]') &&
    (event.type !== 'keydown' || event.key === 'Enter' || event.key === ' '));
}

export function trackAt(tracks, seconds) {
  if (!Number.isFinite(seconds)) return null;
  let selected = null;
  for (const track of tracks || []) {
    if (Number.isFinite(track.startsAt) && track.startsAt <= seconds &&
      (!selected || selected.startsAt <= track.startsAt)) selected = track;
  }
  return selected;
}

export function setupAudio({ doc = document, win = window, music, comparison = false, onState = () => {} } = {}) {
  const audio = doc.querySelector('#background-audio');
  const dock = doc.querySelector('#sound-dock');
  const controls = [...doc.querySelectorAll('[data-audio-toggle]')];
  const status = doc.querySelector('#sound-status');
  const notice = doc.querySelector('#music-notice');
  const hero = doc.querySelector('.hero');
  if (!audio || !music?.src) {
    if (dock) dock.hidden = true;
    return { setAllowed() {}, stop() {}, toggle() {}, destroy() {} };
  }
  let allowed = !comparison, manualStopped = false, disposed = false;
  let noticeShown = false, noticeTimer, hideTimer;
  let coverObserver;
  const cleanup = [];
  const schedule = win.setTimeout?.bind(win) || setTimeout;
  const unschedule = win.clearTimeout?.bind(win) || clearTimeout;
  function listen(target, type, handler, options) {
    target?.addEventListener(type, handler, options);
    cleanup.push(() => target?.removeEventListener(type, handler, options));
  }
  function hideNotice() {
    unschedule(noticeTimer);
    unschedule(hideTimer);
    if (notice) { notice.hidden = true; notice.classList.remove('is-visible'); }
  }
  function musicReady() {
    if (disposed || !allowed || noticeShown || !notice || audio.error || audio.readyState < 2) return;
    noticeShown = true;
    notice.textContent = '배경음악이 준비되었습니다.';
    notice.hidden = false;
    notice.classList.add('is-visible');
    noticeTimer = schedule(() => {
      notice.classList.remove('is-visible');
      hideTimer = schedule(() => { notice.hidden = true; }, 400);
    }, 2400);
  }
  function renderState(phase) {
    if (disposed) return;
    if (dock) { dock.dataset.state = phase; dock.dataset.allowed = String(allowed); }
    const playing = phase === 'playing';
    const label = { paused: '음악 켜기', blocked: '음악 켜기', loading: '불러오기 취소', playing: '음악 끄기', error: '다시 재생' }[phase] || '음악 켜기';
    for (const control of controls) {
      control.setAttribute('aria-pressed', String(playing));
      control.setAttribute('aria-label', phase === 'loading' ? '배경음악 불러오기 취소' : `배경음악 ${label.replace(/^음악 /, '')}`);
      const innerLabel = control.querySelector('[data-audio-label]');
      if (innerLabel) innerLabel.textContent = label;
    }
    if (status) status.textContent = !allowed ? '비교 화면에서 음악을 들을 시안을 선택해 주세요.' :
      phase === 'error' ? '음악을 불러오지 못했어요. 다시 재생해 주세요.' :
      phase === 'blocked' ? '화면을 터치하면 음악이 시작됩니다.' : '';
    onState(phase);
  }
  const player = createAudioController(audio, renderState);
  function stop() {
    if (disposed) return;
    manualStopped = true;
    player.stop();
  }
  function toggle() {
    if (disposed) return;
    if (!allowed) {
      if (status) status.textContent = '비교 화면에서 이 시안을 음악 재생 대상으로 선택해 주세요.';
      return;
    }
    if (player.desired) { stop(); return; }
    manualStopped = false;
    return player.start();
  }
  function play() {
    if (disposed || !allowed) return;
    manualStopped = false;
    return player.start();
  }
  function setAllowed(value) {
    if (disposed) return;
    const next = Boolean(value);
    if (next === allowed) return;
    allowed = next;
    if (dock) dock.dataset.allowed = String(allowed);
    if (!allowed) {
      player.stop();
      hideNotice();
      renderState(player.phase);
    } else {
      musicReady();
      renderState(player.phase);
      if (!manualStopped) void player.start({ automatic: true });
    }
  }
  function firstInteraction(event) {
    if (allowed && !manualStopped && !disposed && isPlaybackGesture(event)) void player.resumeOnGesture();
  }
  function updateCover() {
    if (!hero || !dock || disposed) return;
    const rect = hero.getBoundingClientRect();
    dock.dataset.onCover = String(rect.top < 66 && rect.bottom > 66);
  }
  function updateTrack() {
    const track = trackAt(music.tracks, audio.currentTime);
    const title = [track?.title || music.title || 'Wedding Day', music.artist].filter(Boolean).join(' · ');
    for (const control of controls) control.title = title;
  }
  audio.preload = 'metadata';
  if (!audio.getAttribute?.('src')) audio.src = music.src;
  controls.forEach(control => listen(control, 'click', () => { void toggle(); }));
  listen(doc, 'click', firstInteraction, { passive: true });
  listen(doc, 'touchend', firstInteraction, { passive: true });
  listen(doc, 'keydown', firstInteraction);
  listen(audio, 'loadeddata', musicReady);
  listen(audio, 'canplay', musicReady);
  listen(audio, 'error', hideNotice);
  listen(audio, 'timeupdate', updateTrack);
  listen(win, 'resize', updateCover, { passive: true });
  if (win.IntersectionObserver && hero) {
    coverObserver = new win.IntersectionObserver(updateCover, { rootMargin: '-66px 0px 0px', threshold: 0 });
    coverObserver.observe(hero);
  } else listen(win, 'scroll', updateCover, { passive: true });
  renderState('paused');
  updateCover();
  updateTrack();
  musicReady();
  if (allowed) void player.start({ automatic: true });
  return {
    setAllowed, stop, toggle, play,
    destroy() {
      if (disposed) return;
      disposed = true;
      cleanup.forEach(remove => remove());
      coverObserver?.disconnect();
      hideNotice();
      player.destroy();
    },
  };
}
