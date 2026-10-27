# 성우 · 소희 Invitation VER6

VER5.6의 사진, 한글 리디바탕/Hahmlet, 영문 Antic Didone/Pinyon, 손글씨 오프닝, 전체 MP3를 유지한 별도 버전이다.

- VER5.6: https://sungso-wedding.vercel.app/
- VER6: https://sungso-wedding.vercel.app/v6/
- 소스: apps/invitation-v6, 로컬 사이트: /sungso/invitation-v6/
- 사진 관리: /v6/manage.html, 계좌 관리: /v6/accounts.html

## 구성

전체 사진 표지 → 짧은 초대와 가족 소개 → 날짜·달력·남은 시간 → 위치·교통 → 세 장의 이야기 → 단일 사진첩 → 공개 계좌 → 방명록 → 공유.

소개/타임라인/이야기에 반복되던 사연은 한 이야기 창으로 통합했다. 사진첩의 작은 사진을 선택하거나 좌우로 이동하고, 큰 사진은 누르면 확대된다. 본문 방명록은 최근 두 개만 표시하고 전체 목록을 별도로 연다. 스크롤하면 나타나는 빠른 메뉴는 실제로 공개된 영역만 연결한다.

이야기는 사용자가 제공한 소개·커피숍 첫 만남·카페 운영을 보고 결혼을 결심한 사실로만 구성한다. 사연은 js/config.mjs의 storyChapters에서 수정한다. 변경 후 node apps/invitation-v6/scripts/build.mjs, 루트 npm run check를 실행한다.

## 데이터와 보존

사진과 방명록은 기존 v3 API, 계좌는 기존 v5 API를 공유한다. 새 버전이 별도 DB를 만들지 않으므로 두 버전의 사진·계좌·방명록 내용은 같이 갱신된다. 공개 사진 수와 계좌 입력값은 관리 화면에서 결정되며 코드에 번호를 넣지 않는다.

관리 화면은 기존 Google 활성 회원 두 사람만 사용한다. 공통 인증·서버 권한·CORS·Firebase 승인 도메인은 변경하지 않았다. RSVP는 하객 화면과 Vercel 산출물에서 제외된다. 기존 Pages의 응답 기록/관리 소스는 보존한다.

Vercel 루트 VER5.6과 기존 Pages는 그대로 둔다. 전용 빌드는 root와 v6 두 청첩장 및 필요한 공통 파일만 제공한다. 다른 sungso 앱은 포함하지 않는다. 일반 Pages 빌드에 앱이 등록되었지만 이 브랜치의 push만으로 master/Pages를 바꾸지는 않는다.

## 음악·모션·접근성

한 audio 요소로 제공 MP3 전체 22분26초를 반복한다. 브라우저 자동재생 제한 시 첫 실제 조작으로 시작하며 직접 끈 상태는 존중한다. 영상과 추가 재생 패널은 없다.

기존 약 2초 손글씨 오프닝과 스크롤 잠금 해제 안전장치를 유지한다. 이야기 페이지는 넘길 때 짧게 전환하고, 사진/제목/문장은 스크롤에 맞춰 부드럽게 드러난다. 빠른 메뉴와 이야기 창은 Escape·초점 복귀, 효과 끄기와 기기 모션 감소를 지원한다.

## 로컬 확인

node apps/invitation-v6/scripts/preview.mjs --port 8024

로컬 API 8025의 기존 .local 자료를 사용하며 운영 DB와 분리한다. 운영 DB에는 검증용 글·사진·계좌를 저장하지 않는다.

자산의 사용권과 출처는 assets/SOURCES.txt 및 각 fonts/*-OFL.txt에 있다. 참고 사이트의 커플 사진, 사연, 로고, 상용 글꼴은 새로 가져오지 않았다.
