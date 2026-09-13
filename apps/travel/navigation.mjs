// Only one travel screen is visible. Hashes remain shareable and work with Back/Forward.
const views = [...document.querySelectorAll('[data-travel-view]')];
const links = [...document.querySelectorAll('[data-travel-view-link]')];
const titles = {
  itinerary: '전체 일정', hotels: '숙소', transport: '항공·크루즈',
  stay: '리조트·이동', activities: '관광·식사', history: '변경 기록'
};
const defaults = {
  itinerary: '#itinerary', hotels: '#hotels', transport: '#flights',
  stay: '#resort', activities: '#activities', history: '#history'
};
let activeView = 'itinerary';
let pendingScroll = 0;

function findTarget(hash) {
  if (!hash || hash === '#') return null;
  try { return document.getElementById(decodeURIComponent(hash.slice(1))); }
  catch { return null; }
}

function viewForHash(hash) {
  return findTarget(hash)?.closest('[data-travel-view]')?.dataset.travelView || 'itinerary';
}

function scrollToTarget(target) {
  if (!target) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ block: 'start', behavior: reduced ? 'instant' : 'smooth' });
}

export function openTravelView(name, options = {}) {
  const chosen = views.find((view) => view.dataset.travelView === name) || views[0];
  activeView = chosen.dataset.travelView;
  // Synchronous visibility is required before app.mjs scrolls a day or map into view.
  views.forEach((view) => {
    const visible = view === chosen;
    view.hidden = !visible;
    view.setAttribute('aria-hidden', String(!visible));
  });
  links.forEach((link) => {
    const active = link.dataset.travelViewLink === activeView;
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.title = `${titles[activeView]} · 여행 일정 · sungso`;
  document.body.dataset.travelScreen = activeView;

  const hash = options.hash || defaults[activeView];
  if (options.history !== 'none' && location.hash !== hash) {
    const url = new URL(location.href);
    url.hash = hash;
    history[options.history === 'replace' ? 'replaceState' : 'pushState']({ travelView: activeView }, '', url);
  }
  cancelAnimationFrame(pendingScroll);
  if (options.scroll !== false) {
    const target = options.screenTop ? chosen : findTarget(hash) || chosen;
    pendingScroll = requestAnimationFrame(() => scrollToTarget(target));
  }
  const activeLink = links.find((link) => link.dataset.travelViewLink === activeView);
  const nav = document.querySelector('.section-nav');
  if (activeLink && nav) {
    const left = activeLink.offsetLeft;
    const right = left + activeLink.offsetWidth;
    if (left < nav.scrollLeft || right > nav.scrollLeft + nav.clientWidth) {
      nav.scrollTo({ left: Math.max(0, left - 10), behavior: 'instant' });
    }
  }
  document.dispatchEvent(new CustomEvent('travel:view-changed', { detail: { view: activeView } }));
}

document.addEventListener('click', (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest('a[href]');
  if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
  let url;
  try { url = new URL(link.href, location.href); } catch { return; }
  if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search) return;
  const target = findTarget(url.hash);
  const view = target?.closest('[data-travel-view]');
  if (!view) return;
  event.preventDefault();
  openTravelView(view.dataset.travelView, {
    hash: url.hash,
    screenTop: Boolean(link.closest('.section-nav')),
    history: 'push'
  });
});

function restoreHash() {
  openTravelView(viewForHash(location.hash), {
    hash: location.hash || '#itinerary',
    history: 'none',
    scroll: Boolean(location.hash)
  });
}

window.addEventListener('hashchange', restoreHash);
window.addEventListener('popstate', restoreHash);
document.addEventListener('travel:open-itinerary', (event) => {
  openTravelView('itinerary', { hash: '#itinerary', scroll: event.detail?.scroll !== false });
});

// Keep the opening trip summary visible for a plain URL; deep links open their screen.
restoreHash();
