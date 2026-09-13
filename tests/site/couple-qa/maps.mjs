// UI-only map substitute: no geocoding, tiles, routing or provider requests.
class LatLng { constructor(lat, lng) { this._lat = Number(lat); this._lng = Number(lng); } lat() { return this._lat; } lng() { return this._lng; } x() { return this._lng; } y() { return this._lat; } }
class Point { constructor(x, y) { this.x = x; this.y = y; } }
class LatLngBounds { constructor() { this.points = []; } extend(point) { this.points.push(point); return this; } getCenter() { return this.points[0] || new LatLng(37.5, 127); } hasLatLng() { return true; } }
class QAMap {
  constructor(container, options) {
    this.container = typeof container === 'string' ? document.getElementById(container) : container;
    this.center = options.center; this.zoom = options.zoom;
    this.layer = document.createElement('div'); this.layer.className = 'qa-map-layer';
    this.layer.style.cssText = 'position:absolute;inset:0;background-color:#edf4ed;background-image:linear-gradient(#cddace55 1px,transparent 1px),linear-gradient(90deg,#cddace55 1px,transparent 1px);background-size:40px 40px;overflow:hidden';
    const label = document.createElement('span'); label.textContent = 'QA 대역 지도 · 실제 위치/경로 조회 없음'; label.style.cssText = 'position:absolute;left:14px;top:14px;padding:8px;border-radius:6px;background:#fffffff0;color:#566;font:11px system-ui'; this.layer.append(label); this.container.append(this.layer);
  }
  getCenter() { return this.center; } getZoom() { return this.zoom; } setZoom(value) { this.zoom = value; }
  panTo(value) { this.center = value; } morph(value, zoom) { this.center = value; this.zoom = zoom || this.zoom; }
  fitBounds(bounds) { this.center = bounds.getCenter(); } getBounds() { const bounds = new LatLngBounds(); bounds.extend(this.center); return bounds; }
  setOptions() {} refresh() {} setSize() {} destroy() { this.layer.remove(); }
}
class Marker {
  constructor(options) { this.position = options.position; this.node = document.createElement('div'); this.node.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)'; this.setIcon(options.icon); this.setTitle(options.title); this.setMap(options.map); }
  setMap(map) { this.map = map; if (map) map.layer.append(this.node); else this.node.remove(); }
  setIcon(icon) { this.node.innerHTML = typeof icon === 'string' ? '' : icon?.content || ''; }
  setTitle(title) { this.node.title = title || ''; } setPosition(position) { this.position = position; } getPosition() { return this.position; } setZIndex(index) { this.node.style.zIndex = String(index); }
}
class InfoWindow { constructor() { this.node = document.createElement('div'); this.node.style.cssText = 'position:absolute;left:20%;top:35%;padding:8px;background:white;border:1px solid #ccd;border-radius:8px;max-width:70%'; } setContent(html) { this.node.innerHTML = html; } open(map) { map.layer.append(this.node); } close() { this.node.remove(); } }
const Event = { addListener(target, event, callback) { if (target.node) { target.node.addEventListener(event, callback); return { remove: () => target.node.removeEventListener(event, callback) }; } return { remove() {} }; }, removeListener(listener) { listener?.remove?.(); }, clearInstanceListeners() {}, trigger() {} };
globalThis.naver = { maps: { Map: QAMap, LatLng, LatLngBounds, Point, Marker, InfoWindow, Event, Position: { RIGHT_CENTER: 0, BOTTOM_LEFT: 1 }, Service: { Status: { OK: 'OK' }, OrderType: { ROAD_ADDR: 'roadaddr', ADDR: 'addr', LEGAL_CODE: 'legalcode' }, geocode(_options, callback) { callback('QA_DISABLED', { v2: { addresses: [] } }); }, reverseGeocode(_options, callback) { callback('QA_DISABLED', { v2: { results: [] } }); } } } };
