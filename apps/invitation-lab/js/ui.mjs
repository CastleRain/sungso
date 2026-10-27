export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
export function storageOrNull() { try { return window.localStorage; } catch { return null; } }
export function readPreference(key, fallback) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }
export function savePreference(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } }
let toastTimer;
export function toast(message) {
  const element = $('#toast'); element.textContent = message; element.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => element.classList.remove('visible'), 3200);
}

const openers = new WeakMap(), routes = new WeakMap(), suppressed = new WeakSet();
let restoring = false;
export function openDialog(dialogOrId, trigger, route) {
  const dialog = typeof dialogOrId === 'string' ? document.getElementById(dialogOrId) : dialogOrId;
  if (!dialog || dialog.open) return;
  window.sungsoIntro?.finish();
  openers.set(dialog, trigger || document.activeElement);
  if (route) {
    const previous = location.pathname + location.search + location.hash;
    const alreadyAtRoute = location.hash === route;
    routes.set(dialog, { previous: alreadyAtRoute ? location.pathname + location.search + '#top' : previous, pushed: !alreadyAtRoute });
    if (!alreadyAtRoute) history.pushState({ labDialog: dialog.id }, '', route);
  }
  dialog.showModal();
  document.documentElement.classList.add('has-dialog');
  document.dispatchEvent(new Event('lab:dialog-change'));
}
export function updateDialogRoute(dialog, route) {
  if (dialog.open && routes.has(dialog)) history.replaceState({ labDialog: dialog.id }, '', route);
}
export function closeDialogs() {
  restoring = true;
  $$('dialog[open]').reverse().forEach(dialog => { suppressed.add(dialog); dialog.close(); });
  restoring = false;
  document.documentElement.classList.remove('has-dialog');
}
export function setupDialogs(onRoute) {
  document.addEventListener('click', event => {
    const opener = event.target.closest('[data-open]');
    if (opener && opener.dataset.open !== 'story-dialog') openDialog(opener.dataset.open, opener);
    const closer = event.target.closest('[data-close]');
    if (closer) closer.closest('dialog')?.close();
  });
  $$('dialog').forEach(dialog => {
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    });
    dialog.addEventListener('close', () => {
      document.documentElement.classList.toggle('has-dialog', Boolean($('dialog[open]')));
      document.dispatchEvent(new Event('lab:dialog-change'));
      const saved = routes.get(dialog); routes.delete(dialog);
      const silent = suppressed.has(dialog); suppressed.delete(dialog);
      if (!restoring && !silent && saved && history.state?.labDialog === dialog.id) history.back();
      else if (!restoring && !silent && saved && !saved.pushed) history.replaceState(null, '', saved.previous);
      const opener = openers.get(dialog);
      if (!restoring && !silent && opener?.isConnected) opener.focus({ preventScroll: true });
    });
  });
  addEventListener('popstate', () => {
    restoring = true;
    $$('dialog[open]').forEach(dialog => { if (dialog.id !== history.state?.labDialog) { suppressed.add(dialog); dialog.close(); } });
    restoring = false;
    onRoute?.();
  });
}
export async function copyText(text, message) {
  let success = false;
  try { await navigator.clipboard.writeText(text); success = true; }
  catch {
    const input = document.createElement('textarea'), previous = document.activeElement;
    input.value = text; input.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.append(input);
    try { input.select(); success = Boolean(document.execCommand('copy')); } catch { /* Manual fallback below. */ }
    input.remove(); previous?.focus({ preventScroll: true });
  }
  if (success) toast(message);
  else { $('#copy-value').value = text; openDialog('copy-dialog'); $('#copy-value').focus(); $('#copy-value').select(); }
  return success;
}

export function addSwipe(element, onMove) {
  let point;
  element.addEventListener('touchstart', event => { point = event.touches.length === 1 ? [event.touches[0].clientX, event.touches[0].clientY] : null; }, { passive: true });
  element.addEventListener('touchend', event => {
    if (!point || !event.changedTouches.length) return;
    const dx = event.changedTouches[0].clientX - point[0], dy = event.changedTouches[0].clientY - point[1]; point = null;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.6) onMove(dx < 0 ? 1 : -1);
  }, { passive: true });
  element.addEventListener('touchcancel', () => { point = null; }, { passive: true });
}
