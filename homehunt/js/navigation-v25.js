(function () {
  'use strict';

  const recordViews = new Set(['map', 'visits']);

  function activeViewName() {
    const active = document.querySelector('.app-view.active:not([hidden])');
    return active?.dataset.view || '';
  }

  function compareIsOpen() {
    const modal = document.getElementById('compareModal');
    return Boolean(modal && !modal.hidden);
  }

  function setCurrent(element, current) {
    if (!element) return;
    element.classList.toggle('is-current', current);
    if (current) element.setAttribute('aria-current', 'page');
    else element.removeAttribute('aria-current');
  }

  function syncRecordShell() {
    const view = activeViewName();
    const comparing = compareIsOpen();
    const recordsNav = document.getElementById('recordsPrimaryNav');
    const inRecords = recordViews.has(view);

    if (recordsNav) {
      recordsNav.classList.toggle('active', inRecords);
      if (inRecords) recordsNav.setAttribute('aria-current', 'page');
      else recordsNav.removeAttribute('aria-current');
    }

    document.querySelectorAll('[data-record-mode]').forEach((button) => {
      const mode = button.dataset.recordMode;
      const selected = mode === 'compare'
        ? comparing
        : !comparing && ((mode === 'map' && view === 'map') || (mode === 'list' && view === 'visits'));
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
      if (mode === 'compare') button.setAttribute('aria-expanded', String(comparing));
    });

    setCurrent(document.getElementById('openGuide'), view === 'guide');
    setCurrent(document.getElementById('mapConnectionPill'), view === 'connections');
  }

  function syncConnectionIndicator() {
    const source = document.querySelector('#mapConnectionPill .connection-dot');
    const target = document.querySelector('#connectionsPrimaryNav .v25-connection-indicator');
    if (!source || !target) return;
    target.classList.remove('waiting', 'connected', 'error');
    const state = ['connected', 'error', 'waiting'].find((name) => source.classList.contains(name)) || 'waiting';
    target.classList.add(state);
  }

  function syncSupplyQuickNav() {
    const source = document.getElementById('supplyFavoriteFilter');
    const favorite = document.querySelector('[data-supply-quick="favorite"]');
    const all = document.querySelector('[data-supply-quick="all"]');
    if (!source || !favorite || !all) return;
    const favoritesOnly = source.getAttribute('aria-pressed') === 'true';
    favorite.classList.toggle('is-active', favoritesOnly);
    favorite.setAttribute('aria-pressed', String(favoritesOnly));
    all.classList.toggle('is-active', !favoritesOnly);
    all.setAttribute('aria-pressed', String(!favoritesOnly));
  }

  document.addEventListener('click', (event) => {
    const compare = event.target.closest?.('[data-records-compare]');
    if (compare) {
      event.preventDefault();
      document.getElementById('openCompare')?.click();
      window.setTimeout(syncRecordShell, 0);
      return;
    }

    const supplyQuick = event.target.closest?.('[data-supply-quick]');
    if (!supplyQuick) return;
    event.preventDefault();
    const source = document.getElementById('supplyFavoriteFilter');
    if (supplyQuick.dataset.supplyQuick === 'favorite') {
      source?.click();
    } else if (source?.getAttribute('aria-pressed') === 'true') {
      source.click();
    }
    document.querySelector('.supply-command')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    window.setTimeout(syncSupplyQuickNav, 0);
  });

  const viewObserver = new MutationObserver(syncRecordShell);
  document.querySelectorAll('.app-view, #compareModal').forEach((element) => {
    viewObserver.observe(element, { attributes: true, attributeFilter: ['class', 'hidden'] });
  });

  const connectionDot = document.querySelector('#mapConnectionPill .connection-dot');
  if (connectionDot) {
    new MutationObserver(syncConnectionIndicator).observe(connectionDot, { attributes: true, attributeFilter: ['class'] });
  }

  const favoriteFilter = document.getElementById('supplyFavoriteFilter');
  if (favoriteFilter) {
    new MutationObserver(syncSupplyQuickNav).observe(favoriteFilter, { attributes: true, attributeFilter: ['aria-pressed', 'class'] });
  }

  syncRecordShell();
  syncConnectionIndicator();
  syncSupplyQuickNav();
})();
