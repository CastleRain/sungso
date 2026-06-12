// tab-map.js — 미니맵 플로팅 패널 (SVG 핀 + 확장/접기)

let onDetailOpen = null;

export function initMap(detailOpenFn) {
  if (detailOpenFn) onDetailOpen = detailOpenFn;

  window._mapDetailClick = (id) => {
    if (onDetailOpen) onDetailOpen(id);
  };

  // SVG 핀 클릭 → 카드 탭 상세 열기
  document.querySelectorAll('.map-pin').forEach(pin => {
    pin.addEventListener('click', () => {
      const resortId = pin.dataset.resort;
      if (!resortId) return;
      document.querySelectorAll('.map-pin').forEach(p => p.classList.remove('active'));
      pin.classList.add('active');
      if (onDetailOpen) onDetailOpen(resortId);
    });
  });

  // 확대/축소 버튼
  const float = document.getElementById('minimapFloat');
  const expandBtn = document.getElementById('minimapExpandBtn');
  const collapseBtn = document.getElementById('minimapCollapseBtn');

  expandBtn?.addEventListener('click', () => {
    const isExpanded = float.classList.toggle('expanded');
    expandBtn.textContent = isExpanded ? '⤡' : '⤢';
  });

  collapseBtn?.addEventListener('click', () => {
    const isCollapsed = float.classList.toggle('collapsed');
    collapseBtn.textContent = isCollapsed ? '+' : '−';
  });
}
