# 솜사탕 블루 공통 테마

2026-09-14 사용자가 색상 비교에서 고른 2번 솜사탕 블루를 실제 앱의 공통 화면에 적용했다. 최초 로컬 구현·대역 검증과 이후 적용 결과를 날짜별로 기록한다.

## 선택한 색상과 적용 범위

| 역할 | 색상 |
|---|---|
| 전체 배경 | `#FAFDFF` |
| 카드 | `#FFFFFF` |
| 주요 버튼·선택 배경 | `#B9DEF6` |
| 주요 버튼 글자 | `#405E73` |
| 강조 링크·포커스 | `#35658A` |
| 본문 | `#343B44` |
| 연한 구역 배경 | `#EDF7FE` |

`shared/theme/brand.css`가 공통 색상의 기준이다. 대문·Dates·Invitation·WeCost·Honeymoon·Travel·HomeHunt·식탁·발자국·결혼의 10개 진입점과 공통 로그인 화면에 연결했다. 배경·카드·내비게이션·주요 버튼·본문·보조 글자를 앱별 기존 CSS에서 공통 색상으로 연결하며 버튼 배경과 글자색을 분리했다.

대문·공통 로그인·청첩장 목록·생활 앱의 sungso 표기는 사용자가 고른 손글씨 형태를 사용한다. 글자 아래의 분리된 웃는 곡선만 제거하고 g의 내려오는 획은 유지한 PNG다. 벡터나 투명 배경 파일은 아니며 밝은 화면에 CSS 밝기와 multiply 혼합을 적용한다. 자산 두 개만 `config/apps.json`의 명시적 목록에 추가해 `/sungso/shared/theme/`로 출력한다.

청첩장 예시 안의 개별 팔레트, 지도 마커, 수입·지출·대출, 리조트 등급, 위험·오류·완료 등 의미색은 유지했다. 기존 주소·CDN 버전·Firebase 시작 순서·저장 키·운영 문서 계약도 유지한다. 인증 부팅과 생활 앱 JS의 변경은 로고 요소/자산 URL에 한정된다.

화면 검증에서 Honeymoon의 인증 wrapper가 본문에 남은 화면 높이를 전달하지 않아 탭 본문 높이가 0이 되는 문제를 확인했다. 표시된 Honeymoon wrapper에만 flex column과 `min-height: 0`을 적용해 본문을 복원했다. `[hidden]` 상태에는 이 규칙이 적용되지 않는다.

## 검증

- 루트 `npm run build`, `npm test`, `npm run check`를 통과했다. 최종 check는 테스트 1,650개·공개 참조 461개·JS 문법 176개다. 수치는 동시 진행 중인 청첩장 변경이 포함된 검사 시점의 작업 트리 기준이며 새 테스트 수를 테마 작업으로 귀속하지 않는다.
- `/sungso/` 배포 구조에서 1440px·390px, 로그인과 10개 앱의 103개 화면 상태를 확인했다. 탭·메뉴·달력·편집 열기/취소·청첩장 목록/미리보기·생활 앱 입력 취소를 조작했으며 JS 오류·정적 자산 실패·가로 넘침은 0이었다.
- Honeymoon의 본문 높이는 1440px에서 753px, 390px에서 597px로 확인했다. 실제 5개 탭 전환과 본문 스크롤을 확인했고 인증 전 개인 루트의 숨김도 유지됐다.
- 공통 로고는 로그인 220px, 대문·청첩장·생활 앱 144px/모바일 116px로 로드됐다. 버튼 기본 배경/글자 대비는 4.84:1이다. Hover 배경은 더 밝은 `#C8E7FA`이며 버튼 글자 5.30:1, 링크 글자 4.81:1이다. 청첩장 보조/컬렉션 버튼과 HomeHunt 필터 preset의 hover 글자도 버튼용 색상을 사용한다.
- 마지막 hover 보완 후 1440px·390px에서 주요 버튼, 청첩장 보조/컬렉션 버튼과 HomeHunt 가격 preset을 실제 hover해 5.30:1을 확인했다. 개별 결과는 QA 폴더의 `hover/report.json`, `hover-homehunt/report.json`에 기록했다. 임시 검사에서 모바일 숨김 버튼이나 숫자 preset이 없는 지역 패널을 선택해 발생한 대기는 보이는 버튼·가격 패널로 교정했으며, 앱 동작 실패와 구분한다. 실행한 QA 브라우저와 소유 서버는 종료했다.
- QA 서버의 최종 카운터는 읽기 134회, 쓰기·트랜잭션·운영 요청·공급자 요청 0회였다. 브라우저 외부 요청·자동 쓰기 시도도 0회였다. 기존 대역 서버가 화면 사이에 통계를 초기화할 수 있으므로 읽기 카운터를 전체 세션의 누적 횟수로 표현하지 않는다.
- 실행 도구와 상세 결과는 `/private/tmp/sungso-blue-theme-qa.cjs`, `/private/tmp/sungso-blue-theme-qa/report.json`에 있다. 테스트용 자료만 담긴 대표 캡처와 결과 사본은 `/Users/sw/.codex/visualizations/2026/09/14/01a09fd2-5cb7-7073-9510-6c2ec26b6dc2/sky-theme-applied/`에 보관한다.

## 범위와 한계

- 브라우저 검증은 `tests/site/couple-qa-server.mjs`의 합성 자료를 사용한다. 실제 회원 자료를 주입하지 않으며 운영 Google 로그인·DB 저장·공급자·통근 API를 검증하지 않는다.
- Travel의 인증 후 기준 본문은 8개 화면의 합성 구성이다. 실제 비공개 본문의 모든 상세 배치에 대한 검증으로 해석하지 않는다.
- Honeymoon은 가짜 리조트 자료를 사용하며 실제 PDF 10개, 지도·이미지 공급자와 실견적 내용은 이번 테마 QA에서 확인하지 않는다.
- 기존 청첩장 몰입형 디자인의 동시 작업은 보존했다. 해당 새 동작의 구현·배포 검증은 별도 청첩장 기록을 따른다.
- 9월 14일 최초 검증은 로컬 구현까지였고 당시 Git 커밋·푸시·공개 배포는 수행하지 않았다. 이후 결과는 아래 9월 15일 기록을 따른다.

## 로고 생성 근거

ImageGen 편집으로 사용자가 첨부한 손글씨 로고를 수정했다. 참조 이미지는 `exec-a0bda05c-e6a2-449e-918f-283d24b9337e.png`, 생성 결과는 `/Users/sw/.codex/generated_images/01a09fd2-5cb7-7073-9510-6c2ec26b6dc2/exec-d433c941-f47b-4076-bdc4-84f5d0f8ef01.png`이며 저장소의 `shared/theme/sungso-wordmark-sky.png`로 복사했다. 실제 파일은 2091×752 RGB PNG다. 공통 UI 색상은 CSS의 정확한 값으로 관리하며 생성 이미지의 개별 픽셀까지 정확히 같은 HEX임을 보장하지 않는다.

사용한 프롬프트:

> Edit this exact handwritten sungso logo for its production website header. Preserve the original six handwritten letter shapes and all connections exactly, especially the looped g descender. Remove ONLY the detached curved smile/underline under the word. Recolor the entire wordmark to flat solid pastel sky blue #B9DEF6. Background must be perfectly flat solid pure white #FFFFFF; NOT checkerboard, not gray, not paper texture. No shadows, no texture, no color variation.
> Crop the canvas tightly to a HORIZONTAL logo asset: approximately 3.5:1 width to height, just 3 percent white padding around the complete word. Entire word including g descender must fit. No separate symbols, no underline, no smile, no extra lettering. Exact "sungso" handwriting from reference. Clean anti-aliased flat edges.

## 2026-09-15 — 공통 기준 확대와 실제 적용

사용자가 실제 사이트 적용과 전체 앱의 배경·버튼·글자 통일을 요청했다. `--ss-font-sans`·`--ss-font-mono`를 추가해 기본 UI와 입력·버튼·차트의 글꼴을 공유하고, 일반 안내/추천 카드의 남아 있던 녹색·아이보리 그라데이션도 공통 색상에서 파생하도록 정리했다. 역할과 신규 화면 규칙은 [공통 화면 기준](../shared/theme/README.md)에 기록했다. 청첩장 예시의 서체 변수·개별 디자인과 지도/재무/상태 의미색은 별도로 유지한다.

`b875275`의 청첩장 29종을 기반으로 `/private/tmp/sungso-theme-release-20260915`에서 테마만 분리했다. 진행 중인 날짜·필기 JS/테스트와 HTML query 변경을 포함하지 않았다. 운영 이벤트나 개인 기준 자료를 수정하는 코드는 변경하지 않았다.

- 필수 build/test/check: 테스트 1,659개, 공개 참조 470개, JS 문법 177개 통과. 생성 웹 자산 284개.
- 최신 분리 릴리스의 1440px·390px, 10개 앱 103개 화면 상태를 확인했다. 공통 8개 색상과 본문 글꼴, 청첩장 29종, 주요 버튼 대비 4.84:1이 정상이다. Dates·WeCost의 일부 기본 버튼 글꼴을 상속하도록 보완한 후 두 앱/인증 18개 상태를 추가 확인해 남은 글꼴 불일치를 해소했다. 가로 넘침·JS 오류·정적 파일 실패·운영/공급자 요청·대역 쓰기는 0이다. 브라우저와 소유 대역 서버를 종료했다.
- 상세 결과: `/private/tmp/sungso-blue-theme-qa-20260915/report.json`, `font-target/report.json`. 테스트 일정 캡처는 사용자 검토 화면으로 표시하지 않았다.
- 일정 조회/표시·인증·Firestore 규칙·여행 저장 등 계약 파일 8개가 기준 커밋과 바이트 단위로 같음을 확인했다. 변경 공개 자산은 72개다.

- `3858ead2a9083223695f1065d92c2e6cd8f7a2fd`를 master에 푸시했다. [Pages 34860952127](https://github.com/CastleRain/sungso/actions/runs/34860952127)에서 전체 검사·서비스 번들 검증과 배포가 성공했고 배포 단계 완료 시각은 `2026-09-14T15:16:09Z`다.
- `2026-09-14T15:16:57.133Z` 변경된 공개 파일 72/72개가 HTTP 200이며 검증한 배포본과 SHA-256이 바이트 단위로 일치했다. 사이트 정적 GET만 사용했으며 운영 데이터 API를 호출하지 않았다.
- 공개 10개 앱을 새 익명 브라우저의 1440px·390px에서 열어 로그인 gate·공통 색상·기본 글꼴·220px 로고·개인 영역 숨김을 확인했다. 로그인 버튼 클릭·DB/API 요청·차단 시도·JS 오류·정적 실패는 0이다. 첫 대문의 초기 측정은 동적 auth.css 로딩 전이어서 로딩 완료 뒤 해당 화면만 재확인해 통과했다. 실제 회원 내용·운영 저장을 검증한 것은 아니다.
- 공개 결과는 `/private/tmp/sungso-theme-public-result.json`, `/private/tmp/sungso-theme-public-gate-qa-20260915/report.json`과 `hub-loaded/report.json`이다. 주요 근거 사본은 이전 시각화 폴더의 `sky-theme-applied/release-20260915/`에 보관한다.
