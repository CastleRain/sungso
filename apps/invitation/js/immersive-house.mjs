import { label, photo, sampleDate, scene, unfoldButton, choices, panel, fixed } from './immersive-shared.mjs?v=20260914-reference-samples';

const foliage = `<svg viewBox="0 0 48 80" fill="none" aria-hidden="true"><path d="M24 68V20M24 45 9 33M24 34 37 23" stroke="currentColor" stroke-width="2"/><g fill="currentColor"><ellipse cx="11" cy="31" rx="8" ry="14" transform="rotate(-37 11 31)"/><ellipse cx="35" cy="22" rx="8" ry="14" transform="rotate(35 35 22)"/><ellipse cx="25" cy="12" rx="7" ry="12"/><ellipse cx="35" cy="46" rx="8" ry="13" transform="rotate(40 35 46)"/></g><path d="m14 61 3 17h15l3-17Z" fill="var(--accent)"/></svg>`;

function miniature(thumbnail = false, rooms = false) {
  return `<div class="imm-art ih-art${thumbnail ? ' ih-miniature' : ''}${rooms ? ' ih-open-house' : ''}" aria-hidden="true">
    <span class="ih-art-orbit"></span><span class="ih-art-note">A PLACE CALLED US</span>
    <div class="ih-house">
      <div class="ih-foundation"></div>
      <div class="ih-floor"><span class="ih-rug"></span><span class="ih-floor-inlay"></span></div>
      <div class="ih-wall ih-back-wall"><div class="ih-window"><i></i><i></i><i></i><i></i></div><div class="ih-wall-picture">${photo(2, '', !thumbnail)}<span>our everyday</span></div><span class="ih-wall-shelf"><i></i><i></i><i></i></span></div>
      <div class="ih-wall ih-side-wall"><span class="ih-round-window"></span><span class="ih-wall-heart">♡</span><div class="ih-side-picture">${photo(1)}</div></div>
      <div class="ih-living-furniture"><div class="ih-sofa"><span class="ih-sofa-back"></span><i></i><i></i><b></b></div><div class="ih-coffee-table"><i></i><b></b></div><div class="ih-floor-lamp"><i></i><b></b></div></div>
      <div class="ih-photo-furniture"><div class="ih-picture-stand ih-stand-one">${photo(0)}<span>YOU</span></div><div class="ih-picture-stand ih-stand-two">${photo(1)}<span>AND ME</span></div><div class="ih-picture-stand ih-stand-three">${photo(2)}<span>ALWAYS</span></div></div>
      <div class="ih-garden-furniture"><span class="ih-grass"></span><div class="ih-garden-table"><i></i><i></i></div><span class="ih-flowerbed">✿ <i>✿</i> ✿</span></div>
      <div class="ih-plant ih-plant-one">${foliage}</div><div class="ih-plant ih-plant-two">${foliage}</div>
      ${rooms ? '' : '<div class="ih-front"><div class="ih-front-door ih-front-left"><span class="ih-front-window"></span><span class="ih-house-number">S & S</span><i></i></div><div class="ih-front-door ih-front-right"><span class="ih-front-window"></span><span class="ih-letter-slot"></span><i></i></div></div>'}
      <span class="ih-threshold">WELCOME HOME</span>
    </div><span class="ih-art-caption">A LITTLE HOUSE, A WHOLE LOT OF LOVE.</span>
  </div>`;
}

function weddingGarden() {
  return `<div class="imm-art ih-garden-art" aria-hidden="true"><div class="ih-garden-diorama">
    <div class="ih-garden-sky"><span></span><i></i></div><div class="ih-garden-ground"></div>
    <div class="ih-ceremony-arch"><div class="ih-ceremony-photo">${photo(0)}</div><span class="ih-arch-flowers">✿ <i>✿</i> ✿</span></div>
    <div class="ih-garden-tree ih-garden-tree-left">${foliage}</div><div class="ih-garden-tree ih-garden-tree-right">${foliage}</div>
    <div class="ih-garden-path"><i></i><i></i><i></i></div><div class="ih-garden-benches"><i></i><i></i><i></i><i></i></div>
    <span class="ih-garden-plaque">OUR NEXT CHAPTER</span>
  </div></div>`;
}

/** The artwork is decorative; all reading and controls remain outside its 3D transforms. */
export function houseCover(thumbnail = false) {
  const content = `${label('THE HOUSE OF OUR DAYS')}<h2 class="imm-title ih-cover-title">우리라는 집에<br><em>초대합니다.</em></h2>${miniature(thumbnail)}<p class="imm-copy ih-cover-copy">문 하나를 열면,<br>함께 살아갈 이야기가 시작됩니다.</p>${sampleDate}${thumbnail ? '' : unfoldButton('우리 집 문 열어보기')}`;
  return scene('cover', `cover imm-stage ih-cover${thumbnail ? ' ih-thumbnail' : ''}`, content, thumbnail ? 0 : 2.4, thumbnail ? '' : 'house-cover');
}

export function houseBody(selection, parts) {
  const story = Boolean(parts.story) && selection.sections?.story !== false;
  const rooms = [['living', '거실'], ['photo', '사진방'], ['garden', '정원']];
  return `${parts.cover || houseCover()}
    ${scene('greeting', 'ih-letter', `${label('MAKE YOURSELF AT HOME')}<div class="ih-key" aria-hidden="true"><span>♡</span><i></i></div><h2 class="imm-title">좋아하는 사람이<br>돌아올 곳이 된다는 것.</h2><div class="imm-copy"><p>함께 밥을 먹고, 오늘을 묻고,<br>가끔은 아무 말 없이 쉬어도 되는 곳.</p><p>크고 근사한 집보다<br>서로의 마음을 먼저 살피는<br>다정한 하루를 짓고 싶습니다.</p><p>우리라는 집의 첫 문을 여는 날,<br>오래 기억할 손님으로 와주세요.</p></div><p class="ih-signature">성우 그리고 소희 드림</p><span class="ih-letter-stamp" aria-hidden="true">WITH<br>LOVE</span>`)}
    ${story ? scene('story', 'imm-stage ih-rooms', `${label('THREE ROOMS, ONE HEART')}<h2 class="imm-title">보통의 날을 담은<br><em>작은 방 세 개.</em></h2>${miniature(false, true)}${choices(rooms, '우리 집 이야기 방 선택')}<div class="ih-room-stories" aria-live="polite">${panel('living', '<span class="ih-room-number">ROOM 01 · LIVING</span><h3>하루의 끝에 만나는 우리</h3><p>각자의 하루를 가지고 돌아와<br>같은 소파에서 이야기를 나누는 저녁.<br>평범해서 더 좋아하는 미래예요.</p>', true)}${panel('photo', '<span class="ih-room-number">ROOM 02 · MEMORIES</span><h3>사진보다 더 오래 남는 것</h3><p>멋진 여행도, 우연한 산책도.<br>벽에 걸린 한 장의 사진 뒤에는<br>함께 웃었던 시간이 살고 있어요.</p>')}${panel('garden', '<span class="ih-room-number">ROOM 03 · GARDEN</span><h3>천천히 자라는 마음</h3><p>작은 화분을 돌보듯 서로를 아끼고,<br>새로운 계절이 찾아올 때마다<br>나란히 자라가는 우리가 되려고요.</p>')}</div><p class="ih-sample-note">함께 살아갈 날들을 그려본 이야기 예시입니다.</p>`, 0, 'house-rooms') : ''}
    ${scene('garden-promise', 'imm-stage ih-garden-invitation', `${label('THE GARDEN IS OPEN')}<h2 class="imm-title">이 작은 정원에서,<br><em>우리의 시작을.</em></h2>${weddingGarden()}<p class="imm-copy">소중한 얼굴들로 가득할 오월의 오후.<br>당신의 자리를 따뜻하게 준비할게요.</p><p class="ih-garden-postscript">THERE IS A PLACE FOR YOU HERE.</p>`)}
    ${fixed(parts, 'ih-fixed')}`;
}
