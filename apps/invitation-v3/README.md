# 성우 · 소희 — Invitation VER3.4

사용자가 선택한 Porto의 사진 위 필기체·작은 이름/날짜·여백, 화이트와 블루를 유지한 공개 청첩장. URL: https://castlerain.github.io/sungso/invitation-v3/

앱 폴더에서 npm run build / npm test / npm run dev -- --port 8024. 내용 원본은 js/config.mjs, 생성 HTML은 src/index.template.html과 scripts/build.mjs에서 갱신한다. 루트 config/apps.json 등록으로 Pages에 배포한다.

- 한 사진첩에 모은 사용자 사진(초기 여섯 장, 관리 화면에서 최대 20장), 확대·키보드/스와이프·썸네일 선택·웹 사진 저장. 원본 인물/사진색은 변경하지 않는다.
- 영문 Pinyon Script 손글씨, 한글 고운바탕, 숫자/영문 안내 Cormorant Garamond를 자체 호스팅한다. 공식 원본을 WOFF2로 압축했으며 라이선스는 assets/fonts에 둔다. Porto의 Dulcinea와 같은 폰트라고 설명하지 않는다. 숫자는 바뀌는 자리만 롤링하며 효과 끄기·모션 감소·정지/복귀를 따른다. 날짜/축하/공유/방명록 액션은 손글씨와 한글 설명으로 표시하고 채운 도형 버튼을 사용하지 않는다.
- 사용자 제공 MP3 전체 22분 26초를 `assets/audio/wedding-day.mp3`로 제공한다. 첫 곡 Ever After, Us를 포함한 Wedding Day 10곡이 순서대로 반복된다. 원본을 보존한 96kbps·16,153,791바이트 MP3이며 외부 영상/API는 로드하지 않는다. 재생 버튼을 한 번 누르면 같은 audio 요소가 이야기·사진첩 화면에서도 유지된다. 음악을 임의로 바꾸거나 YouTube를 숨겨 재생하지 않는다.
- `#our-story`는 초대장과 별도로 읽는 이야기 화면이다. `content.ourStory`에 사용자가 알려준 사실만 저장한다. 직접 링크·브라우저 앞뒤 이동·Escape·초점/스크롤 복귀를 지원하며 다시 로드하지 않아 방명록 초안도 보존한다. 메인은 사진첩 하나와 접힌 방문 안내로 짧게 유지한다.
- 네이버 지도·카카오맵·TMAP을 공식 사이트 아이콘으로 표시한다. 카카오 실제 장소24484800과 약도는 지연 로드. TMAP은 설치 앱 검색/주소 복사 안내를 제공하며 실제 휴대전화 앱 전환은 별도 검증 대상이다.
- 방명록: 이름/메시지 공개 동의 후 서버에 저장. 다른 하객도 목록을 읽고, 작성 기기의 토큰으로 자기 글을 삭제한다. 하객 가입/사진 업로드 없음. 구현과 한도는 services/invitation/README.md. 미리보기는 별도 JSON 저장소로 표시하며 운영 DB에 검증 메시지를 쓰지 않는다.
- 양가 본인/부모 계좌 슬롯은 은행·예금주·번호를 받은 항목만 공개한다. 현재 모두 빈 상태여서 전체 섹션/메뉴를 숨긴다. 문답/약속과 부모 이름도 만들지 않는다.
- JavaScript가 없어도 예식 정보·초대글·달력·사진·외부 지도 링크는 보인다. 방명록과 숫자 모션은 JavaScript가 필요하다.

검증: design-qa.md. 공식 폰트: https://github.com/google/fonts/tree/main/ofl/pinyonscript · https://github.com/google/fonts/tree/main/ofl/gowunbatang · https://github.com/google/fonts/tree/main/ofl/cormorantgaramond


## 두 사람의 사진첩 관리

주소: https://castlerain.github.io/sungso/invitation-v3/manage.html . 기존 승인된 두 Google 계정으로 로그인한다. 하객 페이지에는 관리 링크/입력창을 표시하지 않는다.

사진 추가 → 앞으로/뒤로 또는 PC 끌기로 순서 변경 → 사진첩에서 빼기 → ‘청첩장에 반영’ 순서로 사용한다. 설명 입력과 눈에 보이는 사진 설명은 제공하지 않는다. 접근성용 대체 텍스트만 내부에 유지한다. 뺀 저장 사진은 ‘사진 보관함에서 다시 넣기’에서 복원할 수 있다. 공개 최대 20장·보관함 최대 60장. JPEG/PNG/WebP 원본 25MB 이내를 브라우저에서 긴 변 1600px JPEG로 줄이고 위치 메타데이터를 제거한다. 원본 파일은 변경하지 않는다.

사진은 기존 Render Free 서버와 전용 Firestore Admin 문서에 저장한다. 새 Storage/비밀키/요금제/클라이언트 보안 규칙 변경이 없다. 업로드만으로는 공개되지 않으며 반영에 성공한 순서만 하객에게 보인다. 동시에 편집하면 오래된 화면의 저장을 거부하고 초안을 보존한다. 제거는 공개 목록에서 빼는 동작이며 영구 삭제 기능은 없다.

로컬 `npm run dev`는 루트 빌드의 dist를 제공한다. `manage-preview.html`은 로컬 전용 편집 검사 화면으로 `.local/invitation-preview-store.json`에 저장하며 실제 운영 사진첩과 분리된다. 이 화면·미리보기 토큰·저장소·서버 코드는 Pages에 복사하지 않는다. 운영 관리 주소는 항상 실제 회원 인증을 요구한다.

음악 조작부는 표지 아래와 이야기 화면 안의 문서 흐름에 놓인다. ‘남은 시간 / 예식 달력’으로 날짜를 전환하며, ‘우리의 이야기를 보실래요?’의 양문을 누르면 별도 이야기로 이동한다. 효과 끄기/모션 감소는 바로 열고 Escape로 열기를 취소한다. 음악 요소는 이동하지 않아 재생이 이어진다.
