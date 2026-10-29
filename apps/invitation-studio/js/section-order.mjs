import { DEFAULT_ORDER, ORDER_SECTIONS, normalizeOrder } from './composition.mjs';

// Move the live sections, not copies: photos, recipients and form state stay attached.
// Keep the map section stationary even on browsers without state-preserving moveBefore.
export function arrangeAroundAnchor(parent, nodes, anchor, tail) {
  if (!parent || !anchor || !tail || anchor.parentNode !== parent || tail.parentNode !== parent) return;
  const pivot = nodes.indexOf(anchor);
  if (pivot < 0) return;
  function place(group, before) {
    for (const node of [...group].reverse()) {
      if (node.nextElementSibling !== before) {
        if (typeof parent.moveBefore === 'function') parent.moveBefore(node, before);
        else parent.insertBefore(node, before);
      }
      before = node;
    }
  }
  place(nodes.slice(pivot + 1), tail);
  place(nodes.slice(0, pivot), anchor);
}

export function mountSectionOrder({ doc = document, composition } = {}) {
  const main = doc.querySelector('main.paper');
  const tail = main?.querySelector('.closing-section');
  const nodes = new Map(ORDER_SECTIONS.map(({ id }) => [id, doc.getElementById(id)]));
  const firstLink = doc.querySelector('.hero-scroll');
  const originalLink = firstLink && [firstLink.getAttribute('href'), firstLink.getAttribute('aria-label')];
  const original = [...(main?.children || [])].filter(node => nodes.get(node.id) === node).map(node => node.id);
  let current = [], disposed = false;
  function alignLinks(selector, attribute, order, endSelector) {
    const parent = doc.querySelector(selector); if (!parent) return;
    const links = [...parent.querySelectorAll('a')];
    const byId = new Map(links.map(link => [attribute ? link.dataset[attribute] : link.getAttribute('href')?.slice(1), link]));
    let before = endSelector ? parent.querySelector(endSelector) : null;
    for (const id of [...order].reverse()) {
      const link = byId.get(id); if (!link) continue;
      if (link.nextElementSibling !== before) parent.insertBefore(link, before);
      before = link;
    }
  }
  function apply(value, extras = []) {
    if (disposed || !main) return;
    const order = normalizeOrder(value, extras);
    if (order.length === current.length && order.every((id, index) => id === current[index])) return;
    const active = doc.activeElement;
    const orderedNodes = order.map(id => nodes.get(id)).filter(node => node?.parentNode === main);
    arrangeAroundAnchor(main, orderedNodes, nodes.get('location'), tail);
    alignLinks('.quick-nav', null, order);
    alignLinks('.experience-dock', 'dock', order, '#quick-menu-toggle');
    firstLink?.setAttribute('href', `#${order[0]}`);
    firstLink?.setAttribute('aria-label', `${ORDER_SECTIONS.find(item => item.id === order[0])?.label || '다음 장면'}로 내려가기`);
    if (active?.isConnected && doc.activeElement !== active) active.focus?.({ preventScroll: true });
    current = order;
  }
  apply(composition?.order, composition?.extras);
  return {
    setComposition(next) { apply(next?.order, next?.extras); },
    setEnabled() {}, refresh() {},
    destroy() { if (disposed) return; apply(original, original.filter(id => !DEFAULT_ORDER.includes(id))); disposed = true; if (originalLink) { firstLink.setAttribute('href', originalLink[0]); firstLink.setAttribute('aria-label', originalLink[1]); } },
  };
}
