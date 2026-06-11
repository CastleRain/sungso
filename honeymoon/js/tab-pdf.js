// tab-pdf.js — PDF.js 뷰어

const PDF_FILES = [
  {
    category: '📁 리조트별 견적서',
    files: [
      { file: 'data/리조트별/임소희 님 - 270307 코라코라.pdf',         label: '코라코라 견적서' },
      { file: 'data/리조트별/임소희 님 - 270307 디구파루.pdf',         label: '디구파루 견적서' },
      { file: 'data/리조트별/임소희 님 - 270307 라야 바이 앳모스피어.pdf', label: '라야 바이 앳모스피어 견적서' },
      { file: 'data/리조트별/임소희 님 - 270307 벨리간두.pdf',         label: '벨리간두 견적서' },
      { file: 'data/리조트별/임소희 님 - 270307 푸라베리.pdf',         label: '푸라베리 견적서' },
      { file: 'data/리조트별/임소희 님 - 270307 푸시파루.pdf',         label: '푸시파루 견적서' },
    ],
  },
  {
    category: '📦 특가 패키지',
    files: [
      { file: 'data/패키지/27년@특가 [몰디브-코라코라] 리조트 4박 [1-12]-H 0413.pdf',                           label: '코라코라 특가 패키지' },
      { file: 'data/패키지/27년@특가 [몰디브-아나네아] 리조트 4박 EK,QR,EY [1-9]-Z 0325.pdf',                  label: '아나네아 특가 패키지' },
      { file: 'data/패키지/27년@특가 [몰디브-사이라군,SO몰디브 믹스] 리조트 4박 [1-9]-S 0522.pdf',              label: '사이라군+SO몰디브 특가 패키지' },
      { file: 'data/패키지/27년@특가 [몰디브-앳모스피어 바루] 리조트 4박 EK,QR,EY [1-9]-Z 0521.pdf',           label: '앳모스피어 바루 특가 패키지' },
    ],
  },
];

let currentPdfDoc = null;
let currentPage = 1;
let totalPages = 0;
let isRendering = false;
let pdfWorker = null;

function getPdfjsLib() {
  return window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
}

async function loadPdf(filePath) {
  const lib = getPdfjsLib();
  if (!lib) {
    showPdfError('PDF.js 라이브러리를 불러올 수 없습니다.');
    return;
  }

  // CDN 워커 설정
  lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  showPdfLoading();

  try {
    const loadingTask = lib.getDocument(filePath);
    currentPdfDoc = await loadingTask.promise;
    totalPages = currentPdfDoc.numPages;
    currentPage = 1;
    await renderPage(currentPage);
    updatePageControls();
    updateActiveFile(filePath);
  } catch (err) {
    console.error('PDF load error:', err);
    showPdfError(`PDF를 불러올 수 없습니다.<br><br><b>파일:</b> ${filePath}<br><br>💡 VS Code Live Server로 실행해야 PDF를 볼 수 있습니다.<br>(<kbd>Go Live</kbd> 버튼 클릭 후 브라우저에서 열기)`);
  }
}

async function renderPage(pageNum) {
  if (!currentPdfDoc || isRendering) return;
  isRendering = true;

  const canvas = document.getElementById('pdfCanvas');
  if (!canvas) { isRendering = false; return; }

  const ctx = canvas.getContext('2d');
  const page = await currentPdfDoc.getPage(pageNum);

  const wrap = document.getElementById('pdfViewerWrap');
  const wrapWidth = (wrap?.clientWidth || 800) - 40;

  const viewport = page.getViewport({ scale: 1 });
  const scale = Math.min(wrapWidth / viewport.width, 2.5);
  const scaledViewport = page.getViewport({ scale });

  canvas.width = scaledViewport.width;
  canvas.height = scaledViewport.height;
  canvas.style.display = 'block';

  document.getElementById('pdfLoading')?.style && (document.getElementById('pdfLoading').style.display = 'none');
  document.getElementById('pdfError')?.style && (document.getElementById('pdfError').style.display = 'none');

  await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
  isRendering = false;
}

function updatePageControls() {
  const counter = document.getElementById('pdfPageCounter');
  if (counter) counter.textContent = `${currentPage} / ${totalPages}`;

  const prevBtn = document.getElementById('pdfPrevBtn');
  const nextBtn = document.getElementById('pdfNextBtn');
  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
}

function updateActiveFile(filePath) {
  document.querySelectorAll('.pdf-list-item').forEach(item => {
    item.classList.toggle('active', item.dataset.file === filePath);
  });
}

function showPdfLoading() {
  const canvas = document.getElementById('pdfCanvas');
  const loading = document.getElementById('pdfLoading');
  const error = document.getElementById('pdfError');
  if (canvas) canvas.style.display = 'none';
  if (loading) loading.style.display = 'flex';
  if (error) error.style.display = 'none';
}

function showPdfError(msg) {
  const canvas = document.getElementById('pdfCanvas');
  const loading = document.getElementById('pdfLoading');
  const error = document.getElementById('pdfError');
  if (canvas) canvas.style.display = 'none';
  if (loading) loading.style.display = 'none';
  if (error) { error.style.display = 'flex'; error.innerHTML = `<div class="pdf-error-msg">⚠️ ${msg}</div>`; }
}

function renderSidebar() {
  const sidebar = document.getElementById('pdfList');
  if (!sidebar) return;

  const html = PDF_FILES.map(group => `
<div class="pdf-group">
  <div class="pdf-group-label">${group.category}</div>
  ${group.files.map(f => `
  <div class="pdf-list-item" data-file="${f.file}" onclick="window._pdfOpen('${f.file}')">
    <span class="pdf-item-icon">📄</span>
    <span class="pdf-item-label">${f.label}</span>
  </div>`).join('')}
</div>`).join('');

  sidebar.innerHTML = html;
}

export function initPdf() {
  renderSidebar();

  window._pdfOpen = (filePath) => loadPdf(filePath);

  // 페이지 네비게이션
  document.getElementById('pdfPrevBtn')?.addEventListener('click', async () => {
    if (currentPage > 1) { currentPage--; await renderPage(currentPage); updatePageControls(); }
  });
  document.getElementById('pdfNextBtn')?.addEventListener('click', async () => {
    if (currentPage < totalPages) { currentPage++; await renderPage(currentPage); updatePageControls(); }
  });
  document.getElementById('pdfGoBtn')?.addEventListener('click', async () => {
    const input = document.getElementById('pdfPageInput');
    const n = parseInt(input?.value);
    if (n >= 1 && n <= totalPages) { currentPage = n; await renderPage(currentPage); updatePageControls(); }
  });

  // app.js에서 open-pdf 이벤트로 열기 요청
  window.addEventListener('open-pdf', (e) => {
    const { file } = e.detail;
    loadPdf(file);
  });

  // 첫 번째 파일 자동 로드 (힌트)
  showPdfHint();
}

function showPdfHint() {
  const error = document.getElementById('pdfError');
  if (error) {
    error.style.display = 'flex';
    error.innerHTML = `<div class="pdf-error-msg" style="text-align:center;padding:24px;">
      📄 왼쪽 목록에서 PDF를 선택하세요<br><br>
      <small style="color:var(--text-light);">PDF를 보려면 VS Code <b>Live Server</b>로 실행해야 합니다.<br>
      하단 상태바의 <b>Go Live</b> 버튼을 클릭하세요.</small>
    </div>`;
  }
}
