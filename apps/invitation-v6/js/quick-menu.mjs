export function setupQuickMenu({ motion = () => true } = {}) {
  const button = document.querySelector('#quick-menu-toggle');
  const dialog = document.querySelector('#quick-menu');
  const root = document.documentElement;
  let navigating = false, frame = 0;
  function syncVisibility() {
    frame = 0;
    button.classList.toggle('is-visible', scrollY > innerHeight * .55);
  }
  addEventListener('scroll', () => {
    if (!frame) frame = requestAnimationFrame(syncVisibility);
  }, { passive: true });
  addEventListener('resize', syncVisibility);
  syncVisibility();
  function syncSections() {
    dialog.querySelectorAll('[data-menu-section]').forEach(link => {
      const section = document.getElementById(link.dataset.menuSection);
      link.hidden = !section || section.hidden;
    });
    [...dialog.querySelectorAll('nav a')].filter(link => !link.hidden).forEach((link, index) => {
      link.querySelector('span').textContent = String(index + 1).padStart(2, '0');
    });
  }
  button.addEventListener('click', () => {
    syncSections(); navigating = false;
    root.classList.add('quick-menu-open');
    dialog.showModal();
  });
  dialog.addEventListener('close', () => {
    root.classList.remove('quick-menu-open');
    if (!navigating) button.focus({ preventScroll: true });
  });
  dialog.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', event => {
    const target = document.querySelector(link.hash);
    if (!target || target.hidden) return;
    event.preventDefault(); navigating = true; dialog.close();
    // Keep a meaningful URL and browser Back behavior without a preliminary jump.
    history.pushState(null, '', link.hash);
    target.scrollIntoView({ behavior: motion() ? 'smooth' : 'instant', block: 'start' });
    const focus = target.querySelector('h2') || target;
    focus.setAttribute('tabindex', '-1'); focus.focus({ preventScroll: true });
  }));
  const sections = [...dialog.querySelectorAll('[data-menu-section]')].map(link => document.getElementById(link.dataset.menuSection)).filter(Boolean);
  const observer = new MutationObserver(syncSections);
  sections.forEach(section => observer.observe(section, { attributes: true, attributeFilter: ['hidden'] }));
  syncSections();
}
