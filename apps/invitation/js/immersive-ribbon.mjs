import { label, photo, sampleDate, scene, unfoldButton, choices, panel, fixed } from './immersive-shared.mjs?v=20260914-reference-samples';

const flower = `<svg viewBox="0 0 90 130" fill="none" aria-hidden="true"><path d="M44 126C54 95 21 72 47 35M43 95C23 99 10 84 13 67C32 64 40 78 43 95ZM45 70C65 74 80 61 78 44C61 40 49 51 45 70Z" stroke="currentColor" stroke-width="1.1"/><path d="M47 37C20 32 20 10 36 11C38-6 57-3 58 12C77 7 82 26 65 35C62 49 48 50 47 37Z" fill="currentColor" fill-opacity=".12" stroke="currentColor" stroke-width="1.1"/><circle cx="50" cy="25" r="4" fill="currentColor"/></svg>`;

function band() {
  return `<svg class="ir-ribbon" viewBox="0 0 360 270" fill="none" aria-hidden="true">
    <path class="ir-ribbon-band" d="M-18 142C52 137 123 154 180 143S301 132 378 142" stroke="currentColor" stroke-width="11"/>
    <g class="ir-loop ir-loop-left"><path d="M181 142C140 110 117 99 117 122C117 147 148 151 181 142Z" fill="var(--accent)" stroke="var(--paper)" stroke-opacity=".45" stroke-width="1"/><path d="M176 143C157 173 143 211 125 228L126 207L106 214C127 188 144 163 176 143Z" fill="var(--accent)"/><path d="M178 143C149 128 129 122 124 125" stroke="var(--paper)" stroke-opacity=".38"/></g>
    <g class="ir-loop ir-loop-right"><path d="M179 142C220 110 243 99 243 122C243 147 212 151 179 142Z" fill="var(--accent)" stroke="var(--paper)" stroke-opacity=".45" stroke-width="1"/><path d="M184 143C203 173 217 211 235 228L234 207L254 214C233 188 216 163 184 143Z" fill="var(--accent)"/><path d="M182 143C211 128 231 122 236 125" stroke="var(--paper)" stroke-opacity=".38"/></g>
    <ellipse class="ir-knot" cx="180" cy="142" rx="9" ry="8" fill="var(--accent)" stroke="var(--paper)" stroke-opacity=".4"/>
  </svg>`;
}

function triptych(thumbnail = false) {
  return `<div class="imm-art ir-art" aria-hidden="true">
    <span class="ir-art-corner ir-art-corner-one">${flower}</span><span class="ir-art-corner ir-art-corner-two">${flower}</span>
    <div class="ir-card-table"><div class="ir-triptych">
      <div class="ir-card ir-center"><span class="ir-card-kicker">THE MIDDLE OF</span><div class="ir-center-photo">${photo(0, '', !thumbnail)}</div><strong>you & me</strong><span class="ir-card-foot">OUR NEXT CHAPTER</span></div>
      <div class="ir-wing ir-wing-left"><div class="ir-card ir-face"><span class="ir-card-kicker">A SMALL HELLO</span>${photo(1)}<p>우연처럼 만나<br>일상이 된 우리.</p><span class="ir-card-foot">01 / THE BEGINNING</span></div><div class="ir-card ir-back"><span>LOVE,</span><strong>folded<br>inside.</strong>${flower}<small>S & S</small></div></div>
      <div class="ir-wing ir-wing-right"><div class="ir-card ir-face"><span class="ir-card-kicker">ALL OUR TOMORROWS</span>${photo(2)}<p>다음 계절에도<br>너의 가장 가까이.</p><span class="ir-card-foot">03 / TO BE CONTINUED</span></div><div class="ir-card ir-back"><span>A PERSONAL</span><strong>invitation.</strong>${flower}<small>18 MAY 2030</small></div></div>
      <span class="ir-fold-line ir-fold-line-left"></span><span class="ir-fold-line ir-fold-line-right"></span>
    </div></div>
    ${band()}
    <span class="ir-art-note">A little love, waiting to unfold.</span>
  </div>`;
}

function memoryTimeline() {
  return `<div class="ir-memory-timeline" aria-hidden="true"><svg viewBox="0 0 340 330" fill="none"><path d="M87 45C226 15 278 99 245 151S138 159 87 236C54 284 155 304 280 281"/></svg><figure class="ir-memory-moment ir-memory-first">${photo(1)}<figcaption>01 / A SMALL HELLO</figcaption></figure><figure class="ir-memory-moment ir-memory-daily">${photo(2)}<figcaption>02 / OUR EVERYDAY</figcaption></figure><figure class="ir-memory-moment ir-memory-tomorrow">${photo(0)}<figcaption>03 / ALL OUR TOMORROWS</figcaption></figure><span class="ir-timeline-note">You, me,<br>and all the days between.</span></div>`;
}

export function ribbonCover(thumbnail = false) {
  const contents = `${label('A LOVE, GENTLY UNFOLDED')}<h2 class="imm-title ir-title">Tied<br><em>to you.</em></h2><p class="imm-copy ir-cover-copy">리본 안에 담아둔, 우리의 이야기.</p>${triptych(thumbnail)}${thumbnail ? '' : unfoldButton('리본을 풀어 펼쳐보기')}${sampleDate}`;
  if (thumbnail) return `<div class="cover ir-cover ir-thumbnail">${contents}</div>`;
  return scene('cover', 'cover imm-stage ir-cover', contents, 2.4, 'ribbon-cover');
}

function ribbonStory() {
  return scene('story', 'imm-stage ir-story', `${label('A THREAD THROUGH OUR DAYS')}<h2 class="imm-title">너와 나 사이를<br><em>이어준 순간들.</em></h2>${memoryTimeline()}${choices([['first', '작은 시작'], ['daily', '우리의 보통날'], ['tomorrow', '다음 계절']], '리본으로 이어진 우리 이야기 선택')}<div class="ir-story-copy" aria-live="polite">${panel('first', '<span class="ir-note-number">01 / A SMALL HELLO</span><h3>처음에는, 작은 인사였어요.</h3><p>좋아하는 계절을 묻고, 하루의 안부를 나누던 사이.<br>조금씩 길어진 대화가 우리를 같은 쪽으로 데려왔어요.</p>', true)}${panel('daily', '<span class="ir-note-number">02 / AN ORDINARY SUNDAY</span><h3>함께라서, 좋은 보통날.</h3><p>장을 보고 저녁을 고르고 조금 더 돌아서 걷는 길.<br>큰 사건 없는 하루에도 같이 웃을 일이 생겼습니다.</p>')}${panel('tomorrow', '<span class="ir-note-number">03 / ALL OUR TOMORROWS</span><h3>다음 장에는, 우리라는 이름을.</h3><p>언제나 쉬운 날만 있지는 않겠지요.<br>그래도 먼저 손을 내밀며, 같은 방향으로 이어지려 해요.</p>')}</div>`, 0, 'ribbon-story');
}

function promise() {
  return scene('promise', 'imm-stage ir-promise', `${label('A PROMISE WE KEEP')}<h2 class="imm-title">느슨해져도,<br><em>놓지 않을 마음.</em></h2><div class="imm-art ir-promise-art" aria-hidden="true"><svg class="ir-heart-thread" viewBox="0 0 360 290" fill="none"><path pathLength="1" d="M-10 256C72 241 101 214 76 178C45 132 88 85 130 108C168 131 153 168 180 201C209 168 192 130 230 107C272 84 318 134 283 183C256 223 294 253 372 245"/></svg><div class="ir-promise-card"><span>DEAR, MY ALWAYS</span><strong>오늘도 내일도,<br>너의 편.</strong><p>성우 & 소희</p><span class="ir-promise-heart">♡</span></div></div><p class="imm-copy">서로의 속도를 살피고,<br>서운한 마음도 다정하게 말하며,<br>함께한 날들을 오래 소중히 여기겠습니다.</p>${unfoldButton('우리의 약속 이어보기')}`, 1.8, 'ribbon-promise');
}

export function ribbonBody(selection, parts) {
  if (selection?.templateId !== 'ribbon') return '';
  return `${parts.cover || ribbonCover()}${scene('greeting', 'ir-greeting', `${label('TO OUR DEAR PEOPLE')}<span class="ir-greeting-mark" aria-hidden="true">${flower}</span><h2 class="imm-title">소중한 마음을<br>곱게 접어 보냅니다.</h2><div class="imm-copy"><p>한 사람의 하루에 다른 한 사람이 들어와<br>작은 인사들이 긴 이야기가 되었습니다.</p><p>다정한 마음을 한 줄씩 이어<br>이제 우리라는 이름으로 살아가려 합니다.</p><p>접어두었던 가장 기쁜 소식을 전하는 날,<br>당신의 웃음도 함께 담고 싶어요.</p></div><p class="ir-signature">성우 <i>&</i> 소희 드림</p>`)}${parts.story && selection.sections?.story !== false ? ribbonStory() : ''}${promise()}${fixed(parts, 'ir-detail')}`;
}
