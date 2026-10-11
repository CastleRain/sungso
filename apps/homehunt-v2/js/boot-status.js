(function () {
  // Loaded by the shared member gate; never initialize before membership.
  function failed(event) {
    if (event.target && event.target.tagName === 'SCRIPT' && event.target.type === 'module') {
      var status = document.getElementById('bootStatus');
      if (status) status.textContent = '화면 파일 연결을 확인하지 못했어요. 연결을 확인한 뒤 새로고침해주세요.';
    }
  }
  window.addEventListener('error', failed, true);
  var delay = window.setTimeout(function () {
    var status = document.getElementById('bootStatus');
    if (status && !status.hidden) status.textContent = '공개 자료 확인이 지연되고 있어요. 메뉴와 이 기기의 기록은 계속 사용할 수 있어요.';
  }, 30000);
  window.addEventListener('sungso:private-clear', function () {
    window.clearTimeout(delay);
    window.removeEventListener('error', failed, true);
  }, { once: true });
})();
