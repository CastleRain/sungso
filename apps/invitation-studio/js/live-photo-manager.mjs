const MANAGER_PATHS = Object.freeze(['/manage.html', '/v6/manage.html']);

/** Only the existing, authenticated invitation managers may be embedded. */
export function livePhotoManagerURL(value, origin) {
  if (typeof value !== 'string' || !value || /[\\\u0000-\u0020\u007f]/.test(value) || /%(?:2e|2f|5c)/i.test(value) || /(?:^|\/)\.\.(?:\/|$)/.test(value)) return null;
  try {
    const base = new URL(origin), url = new URL(value, base.origin);
    if (!['http:', 'https:'].includes(base.protocol) || url.origin !== base.origin || url.username || url.password || url.search || url.hash || !MANAGER_PATHS.includes(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}

/**
 * Lazily hosts the existing management document. This module never requests a
 * token, reads the child DOM, sends messages, or calls a production API. The
 * original manager alone owns membership checks and explicit publication.
 */
export function mountLivePhotoManager({ root, managerURL = '/manage.html', doc = document, win = window } = {}) {
  if (!root) throw new TypeError('A photo management container is required');
  const url = livePhotoManagerURL(managerURL, win.location.origin);
  const listeners = [];
  let disposed = false, frame = null, expanded = false;
  function element(tag, className, text, parent) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    parent?.append(node); return node;
  }
  function listen(node, type, handler) { node.addEventListener(type, handler); listeners.push(() => node.removeEventListener(type, handler)); }
  const section = element('section', 'live-photo-manager', undefined, root);
  section.setAttribute('aria-label', '실제 청첩장 사진 관리');
  element('p', 'live-photo-eyebrow', 'OUR SHARED ALBUM', section);
  element('h3', '', '하객에게 보여줄 사진도, 여기서.', section);
  element('p', 'live-photo-copy', '승인된 두 사람의 Google 계정으로 사진을 추가하고 순서를 바꿀 수 있어요.', section);
  const scope = element('p', 'live-photo-scope', '관리 화면의 ‘청첩장에 반영’을 누르면 기존 하객용 청첩장의 사진첩도 함께 바뀝니다. 스튜디오 조합 저장과는 별개예요.', section);
  const actions = element('div', 'live-photo-actions', undefined, section);
  const toggle = element('button', 'live-photo-open', '실제 사진 관리 열기 ↗', actions);
  toggle.type = 'button'; toggle.setAttribute('aria-expanded', 'false');
  const fallback = element('a', 'live-photo-new-tab', '새 탭에서 관리 ↗', actions);
  fallback.setAttribute('target', '_blank'); fallback.setAttribute('rel', 'noopener');
  const status = element('p', 'live-photo-status', url ? '열기 전에는 로그인이나 실제 사진첩을 불러오지 않아요.' : '이 주소에서는 사진 관리 화면을 연결할 수 없어요.', section);
  status.setAttribute('role', 'status');
  const holder = element('div', 'live-photo-frame', undefined, section); holder.hidden = true;
  const hint = element('p', 'live-photo-help', '로그인 창이 열리지 않으면 ‘새 탭에서 관리’를 이용해 주세요. 아래 관리 화면 안에서 따로 스크롤할 수 있어요.', section); hint.hidden = true;
  if (url) fallback.setAttribute('href', url);
  else { toggle.disabled = true; fallback.hidden = true; scope.hidden = true; }

  function renderExpanded() {
    holder.hidden = !expanded; hint.hidden = !expanded;
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.textContent = expanded ? '사진 관리 접기 ⌃' : frame ? '사진 관리 이어서 보기 ↗' : '실제 사진 관리 열기 ↗';
  }
  listen(toggle, 'click', event => {
    // Demonstrations and imported compositions cannot initiate authenticated work.
    if (disposed || !url || event.isTrusted !== true) return;
    expanded = !expanded;
    if (expanded && !frame) {
      frame = element('iframe', '', undefined, holder);
      frame.title = '두 사람만 사용하는 실제 청첩장 사진 관리';
      frame.setAttribute('referrerpolicy', 'same-origin');
      // Trusted, fixed same-origin document; no sandbox that would break the
      // existing Google popup login and no credential bridge to the studio.
      listen(frame, 'load', () => { if (!disposed) status.textContent = '관리 화면을 열었어요. 실제 반영 여부는 아래 관리 화면에서 확인해 주세요.'; });
      listen(frame, 'error', () => { if (!disposed) status.textContent = '관리 화면을 불러오지 못했어요. 새 탭에서 다시 열어 주세요.'; });
      status.textContent = '기존 사진 관리 화면을 열고 있어요.';
      frame.src = url;
    }
    renderExpanded();
    if (!expanded) status.textContent = '관리 화면을 접었어요. 다시 열면 작성 중인 사진 편집이 그대로 이어집니다.';
  });
  return {
    dispose() {
      if (disposed) return; disposed = true;
      listeners.splice(0).forEach(remove => remove());
      // Ordinary panel changes should hide the host, not dispose it, so that
      // original-manager drafts and in-flight upload state remain intact.
      section.remove(); frame = null;
    },
  };
}
