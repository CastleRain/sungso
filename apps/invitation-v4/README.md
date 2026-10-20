# 성우 · 소희 — Invitation VER4

화이트·블루와 사진 위 손글씨를 유지하고, 12개 디자인 비교를 바탕으로 반복 정보를 줄인 독립 버전.

- 공개 주소: https://castlerain.github.io/sungso/invitation-v4/
- 보존한 VER3.5: https://castlerain.github.io/sungso/invitation-v3/ (기준 b5e6f1a)
- 비교표: docs/invitation-v4-comparison.html. 4개 서비스·12개 디자인 중 10개 본문 구성, 바른손 2개는 표지/초대 정보만 확인.
- 실행: 앱에서 `npm run build`, 저장소 루트에서 `npm run check`. `node apps/invitation-v4/scripts/preview.mjs --port 8024`는 두 버전을 함께 제공하고 기존 로컬 JSON 방명록/앨범(8025)을 사용한다.

## 구성

전체 화면 사진·필기체 → 문을 여는 우리 이야기 → 예식 안내(날짜·남은 시간/달력·일정 저장·지도·교통) → 사진첩 → 입력된 계좌·방명록 → 공유.

표지 아래 일시·장소 재안내, 별도 축하 반응, 하단 날짜 반복을 없앴다. 사진은 하나의 앨범이며 6장 초과는 더 보기로 접는다. 설명 입력/시각 캡션은 없다. 기존 사진첩 관리·공개 방명록 API를 VER3와 공유한다. 관리 주소는 `/invitation-v4/manage.html`이며 기존 두 Google 회원 인증이 필요하다.

## 실제 정보 입력

`js/config.mjs`만 수정한 뒤 앱 build와 전체 check를 실행한다.

- `accountGroups`: 신랑·신부 각각 `bank / number / holder`를 실제 값으로 입력. 부모님은 선택이며 완성된 계좌만 공개된다. `payUrl`에 실제 `https://qr.kakaopay.com/…` 송금 링크를 넣으면 카카오페이 연결이 나타난다. 번호만 숫자로 복사하며 은행 앱에 붙여넣도록 안내한다. 다른 앱 입력칸을 자동 조작하거나 송금하지 않는다.
- `guestDetails.contacts`: `{ role, name, phone }`을 입력하면 전화/문자 펼침이 나타난다.
- `guestDetails.guide`: `{ title, text }`에 확정된 주차·식사·버스 안내를 입력한다.
- `guestDetails.attendanceUrl`: 두 사람이 소유한 실제 HTTPS 응답폼 주소. 미입력 시 숨긴다. 이 버전 자체에 참석 응답 저장소를 만들지 않았다.
- 날짜는 2027-03-06 15:30 한국 시각, 장소는 부산 목화웨딩홀 15층 벨리스홀. 미확정 정보와 계좌번호는 만들지 않는다.

## 음악·동작

사용자 MP3 전체 22분 26초(첫 곡 Ever After, Us)를 하나의 audio 요소에서 반복한다. 입장 시 재생을 시도하고 NotAllowedError면 첫 터치/Enter/Space에서 시작한다. 직접 끄면 다른 조작으로 재개하지 않는다. 브라우저 정책상 무조건 자동 재생을 보장할 수 없다. YouTube 영상/API·음량 슬라이더는 없다.

실제 글자 획을 쓰는 오프닝, 스크롤 위치에 따른 사진 이동/확대·문 열림 예고·사진첩 교차 이동을 제공한다. 스크롤 가로채기 없이 rAF로 처리하며 효과 끄기와 기기의 모션 감소를 따른다. 별도 이야기 화면은 같은 문서라 음악과 방명록 초안을 보존한다.

검증 결과는 design-qa.md, 이전 버전 기준은 docs/invitation-versions.json에 기록한다. 원본 사진·폰트/아이콘 출처와 라이선스는 assets에 보존한다.
