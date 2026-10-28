import { mountGalleryExperience } from './gallery-experience.mjs';
import { scrollPreviewTo } from './preview-scroll.mjs';
import { recipientTransition } from './utility-scenes.mjs';

export const clamp = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
export function entranceProgress(top, height, viewport) {
  return clamp((viewport * .94 - top) / Math.max(180, Math.min(height * .62, viewport * .67)));
}
export function recipientIndex(index, length) {
  return length ? Math.max(0, Math.min(length - 1, Math.trunc(Number(index) || 0))) : -1;
}

/** Native document scroll drives short, independent scenes. No wheel interception or frame loop. */
export function mountExperience({ doc = document, win = window, enabled = true, variant, gallery, includeGallery = true, includeUpper = true } = {}) {
  let active = Boolean(enabled), scrollEnabled = true, frame = 0, destroyed = false;
  const cleanups = [], animations = new Set();
  const query = selector => doc.querySelector(selector);
  const all = selector => [...doc.querySelectorAll(selector)];
  const listen = (node, type, handler, options) => { node?.addEventListener(type, handler, options); cleanups.push(() => node?.removeEventListener(type, handler, options)); };
  const animate = (element, frames, options) => {
    if (!active || doc.hidden || query('dialog[open]') || !element?.animate) return;
    const animation = element.animate(frames, options); animations.add(animation);
    animation.finished?.catch(() => {}).finally(() => animations.delete(animation));
  };
  const cancelAnimations = () => { animations.forEach(animation => animation.cancel()); animations.clear(); };
  doc.body.classList.add(`theme-${variant}`, 'experience-ready');
  const album = includeGallery ? mountGalleryExperience({ doc, win, enabled, gallery }) : { setEnabled() {}, refresh() {}, destroy() {} };
  const cover = query('.hero'), date = query('.date-scene'), arrival = query('.arrival-card'), journey = query('.journey');
  const dock = query('.experience-dock');

  function render() {
    frame = 0;
    if (destroyed || doc.hidden || query('dialog[open]')) return;
    const height = win.innerHeight, hero = cover?.getBoundingClientRect();
    const dateRect = date?.getBoundingClientRect(), arrivalRect = arrival?.getBoundingClientRect(), journeyRect = journey?.getBoundingClientRect();
    const current = all('main > section[id]').filter(section => !section.hidden && section.getBoundingClientRect().top <= height * .42).at(-1)?.id;
    dock?.classList.toggle('is-cover', Boolean(hero && hero.bottom > height * .35));
    const selected = current === 'gallery' ? 'gallery' : current === 'location' ? 'location' : current === 'wedding-day' ? 'wedding-day' : '';
    all('[data-dock]').forEach(link => link.setAttribute('aria-current', String(link.dataset.dock === selected)));
    query('#quick-menu-toggle')?.setAttribute('aria-current', String(Boolean(current && !selected)));
    const total = Math.max(1, doc.documentElement.scrollHeight - height);
    dock?.style.setProperty('--reading', String(clamp(win.scrollY / total)));
    if (!active || !scrollEnabled) return;
    if (includeUpper) {
      cover?.style.setProperty('--cover', String(clamp(-hero.top / Math.max(1, hero.height))));
      date?.style.setProperty('--scene', String(clamp((height * .86 - dateRect.top) / Math.max(1, height * .95))));
    }
    arrival?.style.setProperty('--arrival', String(clamp((height * .85 - arrivalRect.top) / Math.max(1, height * .75))));
    journey?.style.setProperty('--journey', String(entranceProgress(journeyRect.top, journeyRect.height, height)));
  }
  function schedule() {
    if (!destroyed && !frame && !doc.hidden && !query('dialog[open]')) frame = win.requestAnimationFrame(render);
  }
  listen(win, 'scroll', schedule, { passive: true }); listen(win, 'resize', schedule, { passive: true });
  listen(doc, 'lab:layout-changed', schedule); listen(doc, 'lab:dialog-change', () => {
    if (query('dialog[open]')) { if (frame) win.cancelAnimationFrame(frame); frame = 0; cancelAnimations(); }
    else schedule();
  });
  listen(doc, 'visibilitychange', () => { if (doc.hidden) { if (frame) win.cancelAnimationFrame(frame); frame = 0; cancelAnimations(); } else schedule(); });

  // Transport selection has one readable panel and keyboard parity with touch.
  const travelButtons = all('[data-arrival-tab]');
  function chooseTravel(value, focus = false) {
    travelButtons.forEach(button => {
      const selected = button.dataset.arrivalTab === value;
      button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
      const panel = doc.getElementById(button.getAttribute('aria-controls')); if (panel) panel.hidden = !selected;
      if (selected && focus) button.focus({ preventScroll: true });
    });
    schedule();
  }
  travelButtons.forEach(button => {
    listen(button, 'click', () => chooseTravel(button.dataset.arrivalTab));
    listen(button, 'keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); chooseTravel(event.key === 'Home' ? 'subway' : event.key === 'End' ? 'car' : button.dataset.arrivalTab === 'subway' ? 'car' : 'subway', true);
    });
  });

  // A small, single account slip: choose a family, then the recipient. Values never leave the existing demo adapter.
  const accountPanel = query('#account-panel'), sideTabs = query('.account-tabs');
  let picker, wrapper, selectedRecipient = 0, accountObserver;
  function chooseRecipient(index, focus = false, runAnimation = true) {
    const rows = [...accountPanel.querySelectorAll('.account-row')]; selectedRecipient = recipientIndex(index, rows.length);
    rows.forEach((row, rowIndex) => { row.hidden = rowIndex !== selectedRecipient; });
    [...picker.children].forEach((button, buttonIndex) => {
      const selected = buttonIndex === selectedRecipient; button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
      if (selected && focus) button.focus({ preventScroll: true });
    });
    if (runAnimation) animate(rows[selectedRecipient], recipientTransition(doc.body.dataset.gifting, variant), { duration: 370, easing: 'cubic-bezier(.2,.75,.2,1)' });
    schedule();
  }
  function setupRecipients(initial = false) {
    if (!accountPanel || !picker) return;
    picker.replaceChildren();
    const rows = [...accountPanel.querySelectorAll('.account-row')];
    const side = query('[data-account-side][aria-selected="true"]')?.dataset.accountSide || 'groom';
    sideTabs?.style.setProperty('--side-shift', side === 'bride' ? '100%' : '0%');
    rows.forEach((row, index) => {
      const button = doc.createElement('button'); button.type = 'button'; button.setAttribute('role', 'tab');
      button.id = `recipient-${side}-${index}`; row.id = `recipient-panel-${side}-${index}`;
      button.setAttribute('aria-controls', row.id); row.setAttribute('role', 'tabpanel'); row.setAttribute('aria-labelledby', button.id);
      button.textContent = row.querySelector('.account-owner small')?.textContent || `계좌 ${index + 1}`;
      button.addEventListener('click', () => chooseRecipient(index));
      button.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + rows.length) % rows.length;
        chooseRecipient(next, true);
      });
      picker.append(button);
    });
    chooseRecipient(0, false, !initial);
  }
  if (accountPanel) {
    wrapper = doc.createElement('div'); wrapper.className = 'account-panel-frame';
    picker = doc.createElement('div'); picker.className = 'recipient-picker'; picker.setAttribute('role', 'tablist'); picker.setAttribute('aria-label', '마음 받으실 분');
    accountPanel.before(picker, wrapper); wrapper.append(accountPanel); setupRecipients(true);
    accountObserver = new win.MutationObserver(records => { if (records.some(record => record.target === accountPanel)) setupRecipients(); });
    accountObserver.observe(accountPanel, { childList: true });
  }

  const writeButton = query('#guestbook-write'), composer = query('#guestbook-composer');
  writeButton?.classList.add('letter-entry'); composer?.classList.add('guestbook-composer-style');
  const letterHeading = writeButton?.querySelector('small'); if (letterHeading) letterHeading.textContent = 'A little note for us';
  listen(writeButton, 'click', () => writeButton.classList.add('is-opening'));
  listen(composer, 'close', () => writeButton.classList.remove('is-opening'));
  listen(doc, 'experience:message-saved', () => {
    const first = query('#guestbook-list li');
    animate(first, [{ opacity: .4, transform: 'translateY(-22px) rotate(-2deg)' }, { opacity: 1, transform: 'none' }], { duration: 600, easing: 'cubic-bezier(.2,.7,.2,1)' });
    // The new message is visible at the place from which the guest entered the composer.
    scrollPreviewTo(first, { win, behavior: active ? 'smooth' : 'instant', block: 'center' });
  });
  function setEnabled(value) {
    active = Boolean(value); doc.body.classList.toggle('experience-active', active && scrollEnabled);
    if (!active || !scrollEnabled) {
      animations.forEach(animation => animation.cancel()); animations.clear();
      for (const [element, property, final] of [[cover,'--cover',0],[date,'--scene',1],[arrival,'--arrival',1],[journey,'--journey',1]]) element?.style.setProperty(property, String(final));
    }
    album.setEnabled(active); schedule();
  }
  setEnabled(enabled);
  return {
    setEnabled,
    setScrollEnabled(value) { scrollEnabled = Boolean(value); setEnabled(active); },
    refresh() { album.refresh(); schedule(); },
    demoInteraction(key) {
      if (key === 'arrival') {
        const before = travelButtons.find(button => button.getAttribute('aria-selected') === 'true')?.dataset.arrivalTab;
        const after = travelButtons.find(button => button.dataset.arrivalTab !== before)?.dataset.arrivalTab;
        if (!before || !after) return () => {};
        chooseTravel(after);
        return () => { if (travelButtons.find(button => button.getAttribute('aria-selected') === 'true')?.dataset.arrivalTab === after) chooseTravel(before); };
      }
      if (key === 'gifting' && picker?.children.length > 1) {
        const before = selectedRecipient, side = query('[data-account-side][aria-selected="true"]')?.dataset.accountSide;
        const after = (before + 1) % picker.children.length;
        chooseRecipient(after);
        return () => {
          if (selectedRecipient === after && query('[data-account-side][aria-selected="true"]')?.dataset.accountSide === side) chooseRecipient(before, false, false);
        };
      }
      if (key === 'wishes' && writeButton) {
        const alreadyOpen = writeButton.classList.contains('is-opening');
        writeButton.classList.add('is-opening');
        return () => { if (!alreadyOpen && !composer?.open) writeButton.classList.remove('is-opening'); };
      }
      return () => {};
    },
    destroy() {
      destroyed = true; if (frame) win.cancelAnimationFrame(frame); frame = 0;
      accountObserver?.disconnect(); cleanups.forEach(cleanup => cleanup()); animations.forEach(animation => animation.cancel()); animations.clear(); album.destroy();
      doc.body.classList.remove('experience-active', 'experience-ready');
      accountPanel?.querySelectorAll('.account-row').forEach(row => { row.hidden = false; });
      picker?.remove(); if (wrapper && accountPanel) { wrapper.before(accountPanel); wrapper.remove(); }
    },
  };
}
