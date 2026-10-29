import qrcode from './vendor/qrcode-generator.mjs';
import { compositionParams, DEFAULT_COMPOSITION } from './composition.mjs';
import { formatWedding } from './core.mjs';
import { copyText } from './ui.mjs';

export const GUEST_PASS_CHOICES = Object.freeze(['boarding', 'concise']);
const PREVIEW_URL = 'https://sungso-wedding.vercel.app/lab/studio/preview/';
const clean = value => typeof value === 'string' ? value.trim().slice(0, 600) : '';

/** This URL contains only normalized visual choices, never accounts or guest messages. */
export function invitationQrUrl(composition) {
  const params = compositionParams(composition), baseline = compositionParams(DEFAULT_COMPOSITION);
  // Version 1's omitted choices mean its stable defaults. Keep this defaults contract
  // when evolving the schema; compact only QR links, never saved/editor URLs.
  for (const [key, value] of [...params]) if (key !== 'version' && value === baseline.get(key)) params.delete(key);
  return `${PREVIEW_URL}?${params}`;
}

/** A standard QR with four quiet modules. The encoder receives only an ASCII URL. */
export function invitationQr(composition) {
  const url = invitationQrUrl(composition), code = qrcode(0, 'M');
  if (url.length > 2048 || /[^\x20-\x7e]/.test(url)) throw new TypeError('Unsupported invitation URL');
  code.addData(url, 'Byte'); code.make();
  const modules = code.getModuleCount();
  const matrix = Array.from({ length: modules }, (_, y) => Array.from({ length: modules }, (_, x) => code.isDark(y, x)));
  return { url, modules, quiet: 4, matrix };
}

/** Integer pixels and pure black/white retain scan contrast under every chosen palette. */
export function paintInvitationQr(canvas, qr, scale = 7) {
  if (!Number.isInteger(scale) || scale < 3 || scale > 12) throw new TypeError('Invalid QR scale');
  const size = (qr.modules + qr.quiet * 2) * scale;
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size, size); ctx.fillStyle = '#000000';
  qr.matrix.forEach((row, y) => row.forEach((dark, x) => { if (dark) ctx.fillRect((x + qr.quiet) * scale, (y + qr.quiet) * scale, scale, scale); }));
  return canvas;
}

/** Creates persistent, opt-in scenes. No API, clipboard or file action runs during previews. */
export function mountGuestPass({ doc = document, win = window, wedding = {}, composition, copyAddress = address => copyText(address, '예식장 주소를 복사했어요.') } = {}) {
  const main = doc.querySelector('main.paper'), tail = main?.querySelector('.closing-section');
  const nav = doc.querySelector('.quick-nav'), created = [], listeners = [], urls = new Set();
  let disposed = false, activeQr = null, lastQrUrl = '', saveGeneration = 0;
  function element(tag, className, copy, parent) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (copy !== undefined) node.textContent = copy;
    parent?.append(node); return node;
  }
  function listen(node, type, handler) { node.addEventListener(type, handler); listeners.push(() => node.removeEventListener(type, handler)); }
  function button(className, copy, parent) { const node = element('button', className, copy, parent); node.type = 'button'; return node; }
  function anchor(className, copy, href, parent, external = false) {
    const node = element('a', className, copy, parent); node.setAttribute('href', href);
    if (external) { node.setAttribute('target', '_blank'); node.setAttribute('rel', 'noopener'); }
    return node;
  }
  const section = main ? element('section', 'section optional-section guest-pass-section') : null;
  let passLink = null;
  if (section) {
    section.id = 'day-pass'; section.hidden = true; section.setAttribute('aria-labelledby', 'day-pass-title');
    const inner = element('div', 'section-inner', undefined, section), heading = element('header', 'section-title', undefined, inner);
    element('p', 'eyebrow', 'ALL YOU NEED, IN ONE PLACE', heading);
    const title = element('h2', '', 'Your day pass', heading); title.id = 'day-pass-title';
    element('p', '', '함께할 하루의 안내', heading);
    const card = element('article', 'guest-pass-card', undefined, inner);
    const names = [clean(wedding.groom), clean(wedding.bride)].filter(Boolean).join(' & ');
    element('p', 'guest-pass-kicker', 'YOU ARE INVITED', card); element('p', 'guest-pass-names', names, card);
    let date = {}; try { date = formatWedding(wedding.startsAt); } catch { /* No invented date. */ }
    const timing = element('div', 'guest-pass-timing', undefined, card);
    if (date.date) element('p', 'guest-pass-date', date.date, timing);
    if (date.time) element('p', 'guest-pass-time', `${date.weekday} · ${date.time}`, timing);
    const place = element('div', 'guest-pass-place', undefined, card);
    element('p', 'guest-pass-venue', clean(wedding.venue), place); element('p', 'guest-pass-room', clean(wedding.room), place);
    element('p', 'guest-pass-address', clean(wedding.address), place);
    element('p', 'guest-pass-subway', '지하철 1·3호선 연산역 7번 출구 인근', card);
    const routes = element('nav', 'guest-pass-maps', undefined, card); routes.setAttribute('aria-label', '당일 패스 지도 앱');
    const query = encodeURIComponent(clean(wedding.venueSearchName) || clean(wedding.venue));
    anchor('', '네이버지도 ↗', `https://map.naver.com/p/search/${query}`, routes, true);
    anchor('', '카카오맵 ↗', 'https://place.map.kakao.com/24484800', routes, true);
    const tmap = button('', '티맵 ↗', routes); tmap.dataset.open = 'tmap-dialog'; tmap.setAttribute('aria-haspopup', 'dialog');
    const actions = element('div', 'guest-pass-actions', undefined, inner);
    const copy = button('', '주소 복사', actions); copy.id = 'guest-pass-copy'; copy.disabled = !clean(wedding.address);
    anchor('', '자세한 오시는 길 →', '#location', actions);
    const status = element('p', 'guest-pass-status', '', inner); status.setAttribute('role', 'status');
    listen(copy, 'click', async () => {
      if (disposed || copy.disabled) return;
      try { const copied = await copyAddress(clean(wedding.address)); if (!disposed) status.textContent = copied ? '주소를 복사했어요.' : '복사 창에서 주소를 선택해 주세요.'; }
      catch { if (!disposed) status.textContent = '위 주소를 길게 눌러 복사해 주세요.'; }
    });
    main.insertBefore(section, tail || null); created.push(section);
    if (nav) { passLink = anchor('', '당일 패스', '#day-pass', nav); passLink.dataset.optionalNav = 'day-pass'; passLink.dataset.jump = ''; passLink.hidden = true; created.push(passLink); }
  }

  const keepsake = doc.getElementById('keepsake'), keepsakeInner = keepsake?.querySelector('.section-inner');
  let qrPanel = null, qrCanvas, qrOpen, qrSave, qrStatus;
  if (keepsakeInner) {
    qrPanel = element('div', 'invitation-qr-panel', undefined, keepsakeInner); qrPanel.hidden = true; created.push(qrPanel);
    element('p', 'invitation-qr-script', 'Keep our invitation', qrPanel);
    const shell = element('div', 'invitation-qr-paper', undefined, qrPanel);
    qrCanvas = element('canvas', 'invitation-qr-code', undefined, shell); qrCanvas.id = 'invitation-qr-code';
    qrCanvas.setAttribute('role', 'img'); qrCanvas.setAttribute('aria-label', '현재 선택한 청첩장 조합을 여는 QR 코드');
    element('p', 'invitation-qr-caption', '카메라로 비추면 이 청첩장이 열려요.', qrPanel);
    const actions = element('div', 'invitation-qr-actions', undefined, qrPanel);
    qrSave = button('', 'QR 이미지 저장 ↓', actions); qrSave.id = 'invitation-qr-save';
    qrOpen = anchor('', '청첩장 새로 열기 ↗', PREVIEW_URL, actions, true);
    qrStatus = element('p', 'invitation-qr-status', '', qrPanel); qrStatus.setAttribute('role', 'status');
    listen(qrSave, 'click', async () => {
      if (disposed || !activeQr || qrSave.disabled) return;
      const request = ++saveGeneration; qrSave.disabled = true;
      try {
        const exportCanvas = doc.createElement('canvas'); paintInvitationQr(exportCanvas, activeQr);
        const blob = await new Promise((resolve, reject) => exportCanvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG unavailable')), 'image/png'));
        if (disposed || request !== saveGeneration) return;
        const url = win.URL.createObjectURL(blob); urls.add(url);
        const download = anchor('', '', url, doc.body); download.setAttribute('download', 'sungwo-sohee-invitation-qr.png'); download.hidden = true; download.click(); download.remove();
        qrStatus.textContent = 'QR 이미지를 저장했어요.';
        win.setTimeout(() => { win.URL.revokeObjectURL(url); urls.delete(url); }, 1500);
      } catch { if (!disposed && request === saveGeneration) qrStatus.textContent = '이미지를 저장하지 못했어요. 다시 시도해 주세요.'; }
      finally { if (!disposed && request === saveGeneration) qrSave.disabled = false; }
    });
  }
  function setComposition(next) {
    if (disposed) return;
    const extras = Array.isArray(next?.extras) ? next.extras : [];
    if (section) { section.hidden = !extras.includes('day-pass'); section.dataset.optionalLayout = GUEST_PASS_CHOICES.includes(next?.dayPass) ? next.dayPass : 'boarding'; }
    if (passLink) passLink.hidden = section.hidden;
    if (qrPanel) {
      qrPanel.hidden = next?.keepsake !== 'qr' || !extras.includes('keepsake');
      if (!qrPanel.hidden) {
        const url = invitationQrUrl(next);
        if (url !== lastQrUrl) {
          saveGeneration += 1; qrSave.disabled = false;
          try {
            activeQr = invitationQr(next); paintInvitationQr(qrCanvas, activeQr); qrCanvas.hidden = false; lastQrUrl = url;
            qrOpen.setAttribute('href', activeQr.url); qrStatus.textContent = '';
          } catch { activeQr = null; qrCanvas.hidden = true; qrSave.disabled = true; qrStatus.textContent = 'QR 코드를 준비하지 못했어요. 청첩장 링크로 열어 주세요.'; qrOpen.setAttribute('href', url); }
        }
      }
    }
  }
  setComposition(composition);
  return {
    setComposition, setEnabled() {}, refresh() {},
    destroy() {
      if (disposed) return; disposed = true; saveGeneration += 1;
      listeners.forEach(remove => remove()); created.forEach(node => node.remove());
      urls.forEach(url => win.URL.revokeObjectURL(url)); urls.clear();
    },
  };
}
