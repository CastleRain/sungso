import { WEDDING } from './wedding-date.mjs?v=20260915-personal-invitation';
import { label, photo, sampleDate, scene, unfoldButton, choices, panel, fixed } from './immersive-shared.mjs?v=20260915-personal-invitation';

function stage() {
  return `<div class="it-stage" aria-hidden="true"><div class="it-sky"><i></i><span>OUR LITTLE WORLD</span></div><div class="it-memory">${photo(1)}<span>처음, 우리</span></div><div class="it-arch it-arch-back"></div><div class="it-arch it-arch-middle"></div><div class="it-arch it-arch-front"></div><div class="it-leaves it-leaves-left">✿<i>✦</i></div><div class="it-leaves it-leaves-right">✿<i>✦</i></div><div class="it-door it-door-left"><span>S</span></div><div class="it-door it-door-right"><span>S</span></div><span class="it-stage-caption">A LITTLE PAPER WORLD · ${WEDDING.yearText}</span></div>`;
}

function memories() {
  return `<div class="it-contact-sheet" aria-hidden="true"><figure class="it-contact it-contact-meet">${photo(1)}<figcaption>01 / 처음, 우리</figcaption></figure><figure class="it-contact it-contact-days">${photo(2)}<figcaption>02 / 함께, 매일</figcaption></figure><figure class="it-contact it-contact-tomorrow">${photo(0)}<figcaption>03 / 오래, 함께</figcaption></figure></div>`;
}

export function theaterCover(thumbnail = false) {
  return scene('cover', `cover it-cover${thumbnail ? ' imm-thumbnail' : ''}`, `${label('AN INVITATION IN PAPER')}<h2>종이 속<br><em>작은 결혼식</em></h2><p class="imm-intro">작은 창 너머,<br>우리의 가장 커다란 이야기가 있어요.</p>${stage()}${thumbnail ? '' : unfoldButton('종이 창 펼쳐보기')}${sampleDate}`, 2.6, 'theater-cover');
}

export function theaterBody(selection, parts) {
  const greeting = scene('greeting', 'it-letter', `${label('PLEASE, COME INSIDE')}<span class="it-cut-flower" aria-hidden="true">✿</span><h2>겹겹이 쌓인 마음이<br>하나의 풍경이 되었어요.</h2><div class="invitation-prose"><p>처음에는 작은 인사였어요.<br>함께 걷는 길과 매일의 안부가 더해져<br>어느새 돌아가고 싶은 세상이 되었습니다.</p><p>이제 그 안에 당신을 초대합니다.<br>우리의 새로운 첫 장을 함께 열어주세요.</p></div><p class="signature">성우 <span>그리고</span> 소희</p>`);
  const story = selection.sections.story ? scene('story', 'it-story', `${label('THREE SCENES, ONE STORY')}<h2>한 장씩 간직한<br>우리의 날들</h2>${memories()}${choices([['meet', '처음의 장면'], ['days', '평범한 행복'], ['tomorrow', '앞으로의 우리']], '종이 극장 이야기 선택')}${panel('meet', '<h3>작은 인사가 시작이었어요.</h3><p>마주 앉아 나눈 한마디가<br>다음 만남을 기다리게 했습니다.</p>', true)}${panel('days', '<h3>별일 없는 날이 좋아졌어요.</h3><p>나란히 걷고 함께 저녁을 먹는 일.<br>그 평범함이 가장 소중한 장면이 되었습니다.</p>')}${panel('tomorrow', '<h3>같은 풍경을 바라보려 해요.</h3><p>아직 펼치지 않은 수많은 날에도<br>서로에게 가장 다정한 사람이 되겠습니다.</p>')}<small class="sample-caption">구성을 살펴보기 위한 예시 이야기입니다.</small>`, 0, 'theater-story') : '';
  const promise = scene('promise', 'it-promise', `${label('THE NEXT SCENE')}<div class="it-promise-art" aria-hidden="true"><div class="it-paper-rings"><i></i><i></i></div><span>YES,<br><em>forever.</em></span><b>✿</b></div><h2>다음 장면은<br>당신과 함께.</h2><p>꽃이 피어나는 작은 무대에서<br>오래도록 함께하겠다고 약속합니다.</p>`);
  return parts.cover + greeting + story + promise + fixed(parts, 'it-page');
}
