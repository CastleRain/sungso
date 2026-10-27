// One book, three true moments. No automatic page turns or separate audio.
export function chapterIndex(index, length) {
  return Math.max(0, Math.min(Math.max(0, length - 1), index));
}

export function setupChapters() {
  const dialog = document.querySelector('#story-dialog');
  const pages = [...dialog.querySelectorAll('[data-chapter]')];
  const dots = [...dialog.querySelectorAll('[data-chapter-go]')];
  const stage = dialog.querySelector('#chapter-stage');
  const previous = dialog.querySelector('#chapter-prev');
  const next = dialog.querySelector('#chapter-next');
  const counter = dialog.querySelector('#chapter-count');
  let current = 0, touch;
  function show(value) {
    const target = chapterIndex(value, pages.length);
    if (target === current) return;
    const direction = target > current ? 1 : -1;
    current = target;
    pages.forEach((page, i) => {
      page.hidden = i !== current;
      page.classList.remove('chapter-enter');
    });
    const page = pages[current];
    page.style.setProperty('--chapter-direction', direction);
    // A fresh class on the newly visible page starts the transition once.
    page.classList.add('chapter-enter');
    dots.forEach((dot, i) => dot.setAttribute('aria-current', String(i === current)));
    previous.disabled = current === 0;
    next.disabled = current === pages.length - 1;
    if (document.activeElement === previous && previous.disabled || document.activeElement === next && next.disabled) {
      dots[current].focus({ preventScroll: true });
    }
    counter.textContent = `${String(current + 1).padStart(2, '0')} / ${String(pages.length).padStart(2, '0')}`;
    dialog.scrollTop = 0;
  }
  previous.addEventListener('click', () => show(current - 1));
  next.addEventListener('click', () => show(current + 1));
  dots.forEach((dot, index) => dot.addEventListener('click', () => show(index)));
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); show(current + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
  stage.addEventListener('touchstart', event => {
    touch = event.touches.length === 1 ? [event.touches[0].clientX, event.touches[0].clientY] : null;
  }, { passive: true });
  stage.addEventListener('touchend', event => {
    if (!touch) return;
    const dx = event.changedTouches[0].clientX - touch[0], dy = event.changedTouches[0].clientY - touch[1];
    touch = null;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.6) show(current + (dx < 0 ? 1 : -1));
  }, { passive: true });
  stage.addEventListener('touchcancel', () => { touch = null; }, { passive: true });
}
