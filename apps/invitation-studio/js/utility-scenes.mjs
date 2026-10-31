/** Alternate presentations of the same useful information. No data or live node is replaced. */
export const UTILITY_CHOICES = Object.freeze({
  arrival: Object.freeze(['unfold', 'itinerary', 'postcard']),
  gifting: Object.freeze(['card', 'ledger', 'letter']),
  wishes: Object.freeze(['envelope', 'postcard', 'notebook', 'polaroid']),
  navigation: Object.freeze(['dock', 'ribbon', 'compact']),
});

export function utilityChoices(input) {
  return Object.fromEntries(Object.entries(UTILITY_CHOICES).map(([key, values]) => [key,
    typeof input?.[key] === 'string' && values.includes(input[key]) ? input[key] : values[0],
  ]));
}

/** A recipient still changes only after the existing picker has selected the same account. */
export function recipientTransition(presentation, variant = 'f') {
  if (presentation === 'ledger') return [{ opacity: .5, transform: 'translateY(9px)' }, { opacity: 1, transform: 'none' }];
  if (presentation === 'letter') return [{ opacity: .5, transform: 'perspective(900px) rotateX(-7deg) translateY(16px)' }, { opacity: 1, transform: 'none' }];
  return variant === 'f'
    ? [{ opacity: .45, transform: 'perspective(700px) rotateY(-9deg) translateX(12px)' }, { opacity: 1, transform: 'none' }]
    : [{ opacity: .5, transform: 'translateY(12px) rotate(-1deg)' }, { opacity: 1, transform: 'none' }];
}

export function mountUtilityScenes({ doc = document, win = window, enabled = true, composition } = {}) {
  const body = doc.body, keys = Object.keys(UTILITY_CHOICES);
  const original = Object.fromEntries(keys.map(key => [key, body.dataset[key]]));
  const originalEffects = body.classList.contains('utility-effects');
  const originalScroll = body.classList.contains('utility-scroll');
  const media = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  let requested = Boolean(enabled), scrollEnabled = true, destroyed = false;

  function syncMotion() {
    if (destroyed) return;
    const active = requested && !media?.matches && !doc.hidden && !doc.querySelector('dialog[open]');
    body.classList.toggle('utility-effects', active);
    body.classList.toggle('utility-scroll', active && scrollEnabled);
  }
  function setComposition(input) {
    if (destroyed) return;
    const next = utilityChoices(input);
    for (const key of keys) body.dataset[key] = next[key];
  }
  doc.addEventListener('visibilitychange', syncMotion);
  doc.addEventListener('lab:dialog-change', syncMotion);
  media?.addEventListener?.('change', syncMotion);
  setComposition(composition); syncMotion();
  return {
    setComposition,
    setEnabled(value) { requested = Boolean(value); syncMotion(); },
    setScrollEnabled(value) { scrollEnabled = Boolean(value); syncMotion(); },
    refresh: syncMotion,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      doc.removeEventListener('visibilitychange', syncMotion);
      doc.removeEventListener('lab:dialog-change', syncMotion);
      media?.removeEventListener?.('change', syncMotion);
      for (const key of keys) {
        if (original[key] === undefined) delete body.dataset[key]; else body.dataset[key] = original[key];
      }
      body.classList.toggle('utility-effects', originalEffects);
      body.classList.toggle('utility-scroll', originalScroll);
    },
  };
}
