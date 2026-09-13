const element = (tag, className, text) => {
  const node = document.createElement(tag); node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** A single map host survives detail re-renders; only the current notice can update it. */
export function createSupplyLocationPanel({ resolveLocation, createMap, isActive = () => true, onOpenLarge } = {}) {
  const root = element('section', 'supply-location-panel');
  root.setAttribute('aria-label', '선택한 분양 공고 위치');
  const heading = element('h3', '', '공급 위치');
  const status = element('p', 'supply-location-status'); status.setAttribute('role', 'status');
  const canvas = element('div', 'supply-location-map');
  canvas.setAttribute('role', 'region'); canvas.setAttribute('aria-label', '선택한 분양 공고 지도');
  const note = element('p', 'supply-location-note');
  const actions = element('div', 'supply-location-actions');
  const nearby = element('button', '', '집 찾기에서 주변 보기'); nearby.type = 'button';
  const external = element('a', '', '네이버지도에서 검색'); external.target = '_blank'; external.rel = 'noopener noreferrer';
  const retry = element('button', '', '위치 다시 확인'); retry.type = 'button';
  actions.append(nearby, external, retry); root.append(heading, status, canvas, note, actions);
  let selected = null, location = null, token = 0, map = null, mapPromise = null, busy = false;
  const current = mine => mine === token && root.isConnected && isActive();
  function clear() {
    token += 1; selected = null; location = null; busy = false;
    canvas.hidden = true; nearby.hidden = true; retry.hidden = true;
    map?.clearSearchLocation();
  }
  async function show(notice, { retry: retryLookup = false } = {}) {
    const mine = ++token; selected = notice; location = null; busy = false;
    map?.clearSearchLocation(); canvas.hidden = true; nearby.hidden = true; retry.hidden = true;
    note.textContent = ''; status.textContent = '공고 주소로 위치를 확인하고 있어요.';
    root.dataset.state = 'loading';
    if (!notice || !isActive() || !root.isConnected) return;
    busy = true;
    external.hidden = true;
    try {
      const result = await resolveLocation(notice, { retry: retryLookup });
      if (!current(mine)) return;
      location = result;
      external.hidden = !result.query;
      if (result.query) external.href = `https://map.naver.com/p/search/${encodeURIComponent(result.query)}`;
      status.textContent = result.label || '공급 위치 확인 필요';
      note.textContent = result.reason || (result.approximate
        ? '공고 주소 주변을 표시합니다. 정확한 사업지 경계·출입구는 공식 모집공고에서 확인해주세요.'
        : '공고에 제공된 좌표입니다. 사업지 경계·출입구는 공식 모집공고를 확인해주세요.');
      if (!result.point) { root.dataset.state = 'unavailable'; retry.hidden = false; return; }
      if (!mapPromise) {
        mapPromise = Promise.resolve().then(() => createMap(canvas)).then(value => (map = value))
          .catch(error => { mapPromise = null; throw error; });
      }
      await mapPromise;
      if (!current(mine)) return;
      canvas.hidden = false;
      map.resize();
      map.showSearchLocation(result.point.lat, result.point.lng,
        `${result.label === '공급지역 참고 위치' ? '지역 참고 · ' : ''}${notice.title || '분양 공고'}`, result.approximate ? 14 : 16);
      root.dataset.state = 'located';
      nearby.hidden = typeof onOpenLarge !== 'function';
    } catch {
      if (!current(mine)) return;
      root.dataset.state = 'unavailable'; canvas.hidden = true; retry.hidden = false;
      status.textContent = '지도를 불러오지 못했어요';
      note.textContent = '연결 상태를 확인하거나 네이버지도에서 공고 주소를 검색해주세요.';
    } finally { if (mine === token) busy = false; }
  }
  nearby.addEventListener('click', () => {
    if (selected && location?.point && !busy) onOpenLarge?.(selected, nearby, location);
  });
  retry.addEventListener('click', () => { if (selected && !busy) void show(selected, { retry: true }); });
  clear();
  return { element: root, show, clear };
}
