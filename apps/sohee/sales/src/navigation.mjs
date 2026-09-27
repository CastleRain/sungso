export const SALES_BASE = '/sungso/sohee/sales/';
const routes = new Set(['overview','menus','prep','changes','data']);
export function salesRoute(pathname) {
  if (!pathname.startsWith(SALES_BASE)) return null;
  const route = pathname.slice(SALES_BASE.length).replace(/\/$/, '') || 'changes';
  return routes.has(route) ? route : null;
}
export function internalSalesLink(event, origin) {
  const link = event.target.closest?.('a[href]');
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.hasAttribute('download') || (link.target && link.target !== '_self')) return null;
  const url = new URL(link.href, origin);
  return url.origin === origin && !url.hash && salesRoute(url.pathname) ? url : null;
}
