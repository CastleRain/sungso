import { WEDDING } from './wedding-date.mjs?v=20260915-wedding-date';
import { SIGNATURES, getTemplate } from './catalog.mjs?v=20260915-wedding-date';

export function signatureCollection() {
  return `<section class="signature-collection" aria-labelledby="signature-collection-title">
    <header><div><p class="eyebrow">THE SIGNATURE EDITIONS / 03</p><h2 id="signature-collection-title">초대장이 하나의 경험이 된다면.</h2></div><p>처음부터 마지막 장까지, 더 깊이 꾸민 세 가지 예시.<br>열어보고, 장면을 바꾸고, 하객이 되어 만나보세요.</p></header>
    <div class="signature-picks">${Object.entries(SIGNATURES).map(([id, edition], index) => `<a class="signature-pick pick-${id}" href="#preview/${id}" aria-label="${getTemplate(id).name} 시그니처 전체 미리보기"><span class="signature-pick-top"><span>${edition.label}</span><span>0${index + 1}</span></span><span class="signature-pick-art" aria-hidden="true">${id === 'envelope' ? '<i class="pick-envelope"><b>S & S</b></i>' : id === 'constellation' ? '<i class="pick-orbit"></i><b class="pick-stars">✦</b>' : `<i class="pick-ticket">SS ${WEDDING.code}<span>TOGETHER, ALWAYS</span></i>`}</span><strong>${edition.title}</strong><span class="signature-pick-description">${edition.description}</span><span class="signature-pick-bottom">${getTemplate(id).name}<span aria-hidden="true">↗</span></span></a>`).join('')}</div>
  </section>`;
}

export function signatureGuide(id) {
  const edition = SIGNATURES[id];
  if (!edition) return '';
  return `<div class="signature-guide"><p><span>SIGNATURE EDITION</span><strong>${edition.title}</strong></p><p>${edition.features}</p><small>꾸미기에서 우리 이야기·갤러리${id === 'ticket' ? '·참석 여부' : ''}를 켜면 모든 체험을 볼 수 있어요.</small></div>`;
}
