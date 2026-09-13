(function () {
  'use strict';

  const buttonGroups = [
    {
      selector: '.record-btn, .center-record-btn, .map-search button[type="submit"], #complexSearchSubmit, .result-empty button, .compare-empty button',
      classes: ['btn', 'btn-primary'],
    },
    {
      selector: '.outline-btn, .map-tool-btn, .connection-button-row button, .connection-button-row label, .archive-table .table-actions button, .property-card-foot button, .property-card-foot a, .recommendation-card-actions button, .recommendation-card-actions a, .compare-cell-actions button, #showAllTransactions, #resetArchiveFilters',
      classes: ['btn', 'btn-outline-secondary'],
    },
    {
      selector: '.choice-chip, .complex-quick-searches button, .recent-complexes button, .related-complexes button, .compare-tray-chips button',
      classes: ['btn', 'btn-pill'],
    },
    {
      selector: '.danger-text-btn',
      classes: ['btn', 'btn-ghost-danger'],
    },
    {
      selector: '.modal-close, .mobile-filter-close',
      classes: ['btn', 'btn-icon', 'btn-ghost-secondary'],
    },
  ];

  const cardSelectors = [
    '.property-card', '.data-card', '.connection-card', '.complex-search-card',
    '.recommendation-composer', '.recommendation-pipeline', '.recommendation-status',
    '.recommendation-results-section', '.recommendation-card', '.market-kpi-row article',
    '.visit-modal', '.compare-modal', '.guide-modal', '.map-status-card',
  ].join(', ');

  const badgeSelectors = [
    '.service-state', '.verification-badge', '.forecast-badge', '.complex-source-badge',
    '.property-status', '.property-specs span', '.property-tags span',
    '.recommendation-chips span', '.recommendation-facts span', '.demo-notice > span',
  ].join(', ');

  const iconRules = [
    ['.property-card-foot button:nth-of-type(1)', 'edit'],
    ['.property-card-foot button:nth-of-type(2)', 'chart-line'],
    ['.property-card-foot button:nth-of-type(3)', 'columns-3'],
    ['.property-card-foot a', 'external-link'],
    ['.archive-table .table-actions button:nth-of-type(1)', 'map-pin'],
    ['.archive-table .table-actions button:nth-of-type(2)', 'edit'],
    ['.archive-table .table-actions button:nth-of-type(3)', 'chart-line'],
    ['.archive-table .table-actions button:nth-of-type(4)', 'columns-3'],
    ['.recommendation-card-actions button:nth-of-type(1)', 'map-pin'],
    ['.recommendation-card-actions button:nth-of-type(2)', 'chart-line'],
    ['.recommendation-card-actions button:nth-of-type(3)', 'heart'],
    ['.recommendation-card-actions a', 'external-link'],
    ['.compare-cell-actions button:nth-of-type(1)', 'map-pin'],
    ['.compare-cell-actions button:nth-of-type(2)', 'chart-line'],
    ['.compare-cell-actions button:nth-of-type(3)', 'edit'],
    ['#showAllTransactions', 'list-details'],
    ['#complexOpenConnections', 'plug-connected'],
    ['#openLocalKeySetup', 'key'],
    ['#openApiGuide', 'server'],
    ['#backupVisits', 'download'],
    ['#resetArchiveFilters', 'filter-off'],
    ['#compareGoMap', 'map-2'],
    ['.compare-tray-chips button', 'x'],
  ];

  function elements(root, selector) {
    const matches = root instanceof Element && root.matches(selector) ? [root] : [];
    return matches.concat(root.querySelectorAll ? [...root.querySelectorAll(selector)] : []);
  }

  function addClasses(root, selector, classes) {
    elements(root, selector).forEach((element) => {
      const missing = classes.filter((className) => !element.classList.contains(className));
      if (missing.length) element.classList.add(...missing);
    });
  }

  function ensureIcon(element, name) {
    if (element.querySelector(':scope > .ti')) return;
    const icon = document.createElement('i');
    icon.className = `ti ti-${name}`;
    icon.setAttribute('aria-hidden', 'true');
    element.prepend(icon);
  }

  function updateRangeVisual(input) {
    const minimum = Number(input.min || 0);
    const maximum = Number(input.max || 100);
    const value = Number(input.value || minimum);
    const progress = maximum > minimum
      ? Math.max(0, Math.min(100, ((value - minimum) / (maximum - minimum)) * 100))
      : 0;
    input.style.setProperty('--hh-range-progress', `${progress}%`);
  }

  function enhanceRange(input) {
    if (!(input instanceof HTMLInputElement) || input.type !== 'range') return;
    if (!input.classList.contains('hh-range')) input.classList.add('hh-range');
    updateRangeVisual(input);
    if (input.dataset.hhRangeReady === 'true') return;
    input.dataset.hhRangeReady = 'true';
    input.addEventListener('input', () => updateRangeVisual(input));
    input.addEventListener('change', () => updateRangeVisual(input));
  }

  function enhancePicker(input) {
    if (!(input instanceof HTMLInputElement) || input.dataset.hhPickerReady === 'true') return;
    if (typeof window.flatpickr !== 'function') return;
    const timeOnly = input.hasAttribute('data-hh-time-picker');
    const dateOnly = input.hasAttribute('data-hh-date-picker');
    if (!timeOnly && !dateOnly) return;
    input.dataset.hhPickerReady = 'true';
    input.setAttribute('aria-haspopup', 'dialog');
    input.setAttribute('aria-expanded', 'false');
    window.flatpickr(input, {
      locale: window.flatpickr.l10ns?.ko || 'ko',
      allowInput: true,
      disableMobile: true,
      clickOpens: true,
      dateFormat: timeOnly ? 'H:i' : 'Y-m-d',
      enableTime: timeOnly,
      noCalendar: timeOnly,
      time_24hr: true,
      minuteIncrement: timeOnly ? 5 : 1,
      monthSelectorType: 'static',
      onOpen: () => input.setAttribute('aria-expanded', 'true'),
      onClose: () => input.setAttribute('aria-expanded', 'false'),
    });
  }

  function enhanceTextarea(textarea) {
    if (!(textarea instanceof HTMLTextAreaElement) || textarea.dataset.hhAutosizeReady === 'true') return;
    textarea.dataset.hhAutosizeReady = 'true';
    const resize = () => {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(240, Math.max(72, textarea.scrollHeight))}px`;
    };
    textarea.addEventListener('input', resize);
    resize();
  }

  function enhance(root) {
    buttonGroups.forEach(({ selector, classes }) => addClasses(root, selector, classes));
    addClasses(root, '.portal-nav-item', ['nav-link']);
    // Flatpickr owns the layout of its generated numeric inputs. Decorating
    // those internals as app form controls makes the month/time rows expand.
    addClasses(root, 'input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not(.numInput)', ['form-control']);
    addClasses(root, 'textarea', ['form-control']);
    addClasses(root, 'select', ['form-select']);
    addClasses(root, 'input[type="checkbox"], input[type="radio"]', ['form-check-input']);
    addClasses(root, cardSelectors, ['card']);
    addClasses(root, badgeSelectors, ['badge']);
    addClasses(root, '.archive-table, .compare-table', ['table', 'table-vcenter']);
    elements(root, 'input[type="range"]').forEach(enhanceRange);
    elements(root, '[data-hh-date-picker], [data-hh-time-picker]').forEach(enhancePicker);
    elements(root, 'textarea').forEach(enhanceTextarea);
    elements(root, '.choice-chip').forEach((button) => button.setAttribute('aria-pressed', String(button.classList.contains('active'))));
    iconRules.forEach(([selector, name]) => elements(root, selector).forEach((element) => ensureIcon(element, name)));
  }

  enhance(document);
  document.body.classList.add('ui-ready');

  document.addEventListener('wheel', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'number') return;
    if (document.activeElement !== input || !event.cancelable) return;
    event.preventDefault();
  }, { passive: false });

  const observer = new MutationObserver((records) => {
    records.forEach((record) => {
      if (record.target instanceof Element) enhance(record.target);
      record.addedNodes.forEach((node) => {
        if (node instanceof Element) enhance(node);
      });
    });
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
})();
