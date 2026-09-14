import { SCROLL_DESIGNS, getScrollDesign } from './scroll-designs.mjs?v=20260914-scroll-editions';

export function scrollPreviewLink(template) {
  if (!getScrollDesign(template.id)) return '';
  return `<a class="scroll-preview-link" href="#preview/${template.id}" data-action="scroll-preview" data-template="${template.id}"><span aria-hidden="true">↕</span> 스크롤로 펼쳐보기 <span aria-hidden="true">↗</span></a>`;
}

export function scrollShowcase() {
  return `<section class="scroll-showcase" aria-labelledby="scroll-showcase-title"><header><div><p class="eyebrow">SCROLL INTO OUR STORY</p><h2 id="scroll-showcase-title">스크롤로 펼치는 초대<span>${SCROLL_DESIGNS.length}</span></h2><p>내리면 새로운 장면, 올리면 지나온 순간.<br>손끝을 따라 펼쳐지는 일곱 가지 초대예요.</p></div><span class="scroll-showcase-hint">옆으로 둘러보세요 →</span></header><div class="scroll-showcase-rail">${SCROLL_DESIGNS.map((design, index) => `<a class="scroll-design-card" data-scroll-mood="${design.mood}" href="#preview/${design.id}" data-action="scroll-preview" data-template="${design.id}"><div class="scroll-design-art" aria-hidden="true"><span>${String(index + 1).padStart(2, '0')}</span><b>${design.symbol}</b><i>WITH LOVE · S & S</i></div><h3>${design.title}</h3><p>${design.subtitle}</p><span class="scroll-design-open">모바일로 펼쳐보기 ↗</span></a>`).join('')}</div></section>`;
}
