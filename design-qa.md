## 2026-11-01 다섯 탭 서체 통일 — 운영 배포 확인

- 결혼비용과 같은 로컬 Pretendard Variable을 모든 WeCost 탭·메뉴·편집창·달력으로 공통 적용했다. 제목 PC/모바일 22px/650, 주요 구역 15px/600을 사용한다. 아래 이전 검토의 시스템 글꼴·제목24px 기록보다 이번 결과가 최신이다.
- 전체 check 2,277개 및 Firestore Emulator 2개 통과. 1440/390px에서 대상 세 페이지를 확인하고 우리 자금 편집 취소·집 시뮬 내부 세 탭·상환 창을 확인했다. 모바일 가로 넘침 없음.
- 커밋 `c2593b2`, Pages `41315634325` 검사·배포 성공. 공개 196개 파일 일치, 내부 4개 경로 404. 운영 5개 탭의 computed font가 같은 Pretendard이고 제목은22px, 오류/경고0건. 운영 DB는 조회만 했다.
- 증거: Git 제외 `.local/fixed-cost-qa/release/`의 PC/모바일 캡처·production-ui-check.json·deploy-public-results.json. 모든 OS의 픽셀 렌더링이나 사용자 스크린리더 검증을 의미하지 않는다.

## 2026-11-01 고정비 공통 UI 보완 — 검증 완료

- 시각 기준: 이번 실행에서 직접 캡처한 대시보드/우리 자금/집 시뮬/결혼비용. 기존 글꼴 스택을 유지하고 제목24px·섹션14~15px, 같은 카드/버튼/아이콘 컨테이너를 적용했다.
- 수정: 사람별 아이콘/색 통일, 기본 월 입력 제거, 반복 일/월 버튼 달력, Flatpickr 날짜 선택의 반폭 레이아웃 해소, 0원 비중 막대 표시 수정.
- 브라우저: 실제 서버 연결, 조회만. 1100/1440px·390/320px 가로 넘침 없음, 캘린더 및 고정 하단 버튼 확인. 144개 이미지 깨짐 0, 검색 확인. 운영 저장 안 함. 키보드 Escape/방향키/저장값은 DOM 회귀 확인.
- 검사: 전체 check 2,277개 통과. 마지막 아이콘 검색어 보완 후 관련14개/빌드 통과.
- 한계: 사용자 스크린리더/모든 OS 글꼴 검증 아님. 이번 많은 항목 브라우저 캡처는 로컬 연결 실패 및 data: 오류 페이지 정책으로 중단; 검색·합계·긴 목록은 DOM 대역 검사. 실제 데이터/배포 미변경.
- 증거: `.local/fixed-cost-qa/refinement/index.html` (비공개 비교 캡처 포함, Git 제외).

# WeCost — 고정비 1안 구현 검토

Date: 2026-11-01

final result: passed

## 비교 기준과 근거

- 선택 기준: `.local/fixed-cost-design-20261101/01-owner-columns.png`와 긴 목록 보완 `01-owner-long-list-drawer.png`. 기존 글꼴과 1안의 세 담당자·합산·다가오는 출금 구조를 유지한다.
- 구현: `/sungso/wecost/?tab=fixed`. 운영 데이터는 실제 Google 회원으로 조회했고 비어 있는 고정비 문서의 서버 응답이 ‘실시간 연결됨’으로 표시됨을 확인했다. 운영 항목 생성/수정은 하지 않았다.
- 긴 목록 검증은 운영 앱의 동일 UI 모듈과 로컬 메모리 저장 대역을 사용하는 독립 합성 화면으로 수행했다. 성우 12/소희 9/공동 6개, 합계와 담당자 합계는 선택 시안과 같은 합성 금액이며 실제 사용자 데이터가 아니다.
- 증거는 `.local/fixed-cost-qa/`의 `desktop-main-final.jpg`, `desktop-drawer-final.jpg`, `mobile-list.jpg`, `mobile-icons.jpg`, `live-empty.jpg`, `live-icon-picker.jpg`. 전체/세부 비교 `comparison-final.jpg`·`comparison-detail.jpg`에서 원본과 구현을 함께 열어 검토했다.
- 데스크톱 비교 viewport 1487×1058, 모바일 390×844/320×740. 전체 목록 패널이 열린 상태를 비교했다. 앱의 기존 220px 메뉴와 홈 바, 실제 오버레이(뒤쪽 공동 카드가 가려짐)는 기존 앱 구조를 지키는 의도한 차이다. 자동화 클릭의 배경 스크롤 위치는 비교에서 제외하고 패널과 기본 화면 증거를 함께 사용했다.

## 표면별 판단

- 글꼴: 기존 시스템 폰트 `--ss-font-sans`를 상속. 페이지 제목 24/750, 패널 제목 20/700, 본문 13, 보조 11~12. 생성 시안의 큰 글자 대신 다른 탭과 같은 크기로 맞춘 사용자 요구를 따른다. 금액은 정렬된 숫자이며 이름 전체는 수정 창과 접근 가능한 버튼 이름으로 확인할 수 있다.
- 배치: 월 환산 합산/담당자 비중, 세 병렬 목록, 항목 5개 제한, 별도 전체 목록과 고정 검색/하단 작업을 유지한다. 전체 목록은 본문만 스크롤하며 마지막 항목도 편집 가능하다. 모바일은 세 담당자를 세로로 배치하고 서랍은 전체 폭으로 표시한다. 확인 너비에서 가로 넘침 없으며 390px에서 하단 작업 영역이 화면 안에 있다.
- 색상: 일반 배경·글자·테두리·선택·포커스·그림자는 공통 토큰을 사용한다. 담당자 의미색은 연분홍/크림/세이지로 제한한다. 기존 주요 버튼의 읽기용 글자 색을 유지한다.
- 자산: 라이선스/출처를 동봉한 Lucide 0.468.0 정적 SVG 144개. 선택 시안의 돼지 아이콘은 카탈로그의 동전으로 대응한다. 카테고리 기본 아이콘·수동 선택·한글 검색이 실제 자산으로 표시되며 명칭과 함께 제공된다.
- 내용: 월 환산 고정비와 연간 실제 결제액을 구분한다. 중지/기간·날짜 미정·연간 비용을 합계와 일정에 동일하게 적용한다. 전체 합계는 검색 및 미리보기 5개에 제한되지 않는다. 기존 순저축에서 이중 차감하지 않으며 날짜 경과로 납부 기록을 만들지 않는다.

## 보완 및 검증

- 동작 검사에서 출금일 미정 옵션이 빈 문자열인데 0으로 읽히는 문제를 찾아 null로 보존했다. 회귀 검사와 실제 빈 폼 취소로 재확인했다.
- 토큰 정돈 후 비교에서 패널 배경 선언 구분 누락으로 배경이 투명해지는 P1을 발견했다. 선언을 수정하고 새 캡처/세부 비교에서 불투명 흰 배경과 입력 테두리를 재확인했다. 최종 미해결 P0/P1/P2 없음.
- 새 핵심/UI 12개: 월/연 계산·전체 합산·0원/미등록·말일/윤년·기간·미정 날짜·144개 아이콘·긴 목록·수동 아이콘 유지·초안 보존·충돌·멱등 재시도·로그아웃 정리.
- 실제 Firestore Emulator `demo-homehunt` 2개: 두 회원 저장/재조회·동시 독립 필드 병합·같은 필드 충돌·서버 snapshot·원자적 작성자 이력·익명/비회원 조회 및 쓰기 차단. `tests/emulator/wecost-fixed-costs.test.mjs`, 로그 `emulator-final.log`.
- 전체 `npm run check`: 2,275개 통과, 로컬 참조 961개·JS 283개 검사. 스타일 최종 수정 후 빌드 및 관련 12개 재통과. 실계정 브라우저 오류/경고 0건. 이전 모듈 목록 고정 검사 1건은 새 고정비 4개 로컬 모듈을 명시 허용한 뒤 전체 재통과했다.
- 운영 DB 쓰기 검증은 하지 않았다. 실기기 가상 키보드·스크린리더 전체 검증은 후속이며 브라우저 모바일 viewport/키보드 및 DOM 접근성 검증과 구분한다.

## 다음

고정비 실제 항목을 입력하며 확인하고, 사용자 요청 시 기존 미배포 변경과 함께 GitHub 반영한다. 운영 DB 예시 데이터 삽입·Git push·배포는 이 작업에 포함하지 않았다.

---

# WeCost — 우리 자금 3안 구현 검토

Date: 2026-11-01

final result: passed

## 비교 기준

- 선택 이미지: `.local/cashflow-design-20261101/03-summary-first-refined-type.png` (1487×1058). 사용자는 3안의 읽기 우선 배치를 선택하고 기존 공통 서체 유지 후 구현을 요청했다.
- 구현: `http://127.0.0.1:8768/sungso/wecost/?tab=cashflow`, 인증된 현재 데이터의 기본 조회 상태. 월별 저축 기록 표와 이번 달 납입 버튼은 없다. 다른 세 화면의 구조·계산은 유지했다.
- 비교 캡처: `.local/cashflow-design-20261101/implementation-desktop-v1.jpg` (1472×1112). CSS viewport 1487×1058, DPR 1; 브라우저 전체 캡처는 스크롤바를 제외한다. 생성 시안에는 없는 기존 홈/저장 상태 바와 하단 여백 때문에 전체 높이는 다르다. 이 차이를 억지로 늘이거나 자르지 않았다.
- 전체 비교: 같은 폴더 `comparison-desktop.jpg`. 원본과 실제 캡처를 비율 유지한 동일 폭으로 한 이미지에 배치했다. 세부 비교: `comparison-typography.jpg`에 두 사람의 저축 영역을 같은 폭으로 나란히 배치했다.
- 최종 기본 화면: `cashflow-implemented.jpg`. 편집: `implementation-editor.jpg`, `implementation-mobile-editor.jpg`. 모바일: `implementation-mobile-v1.jpg`. CSS 1440px·1100px·390px·320px에서 넘침과 관련 편집을 확인했다. 고정 하단 메뉴가 전체 캡처 중간에 찍히는 것은 캡처 특성이며 실제 화면 하단에 위치한다.

## 필수 표면 평가

- 서체: 공통 `--ss-font-sans`를 상속한다. PC DOM의 제목 24px/750, 구역 15px/700, 사람 이름 14px/650, 본문 13px를 확인했다. 요약 금액은 기존 계획 카드의 반응형 크기를 사용한다. 생성 이미지의 큰 제목·인명보다 작게 구현한 것은 사용자의 서체 일치 요청을 따른 의도한 차이다.
- 배치: 가로 합산 요약 → 두 사람 병렬 저축 → 별도 부모님 지원을 유지했다. 모바일은 합산 요약을 짧은 세 행으로, 두 사람을 세로로 배치한다. 작은 회색 계획 박스는 선과 간격으로 정돈했으며 계산 기준을 접어 둔다. 지원금 수정 버튼은 기존 카드 헤더 패턴으로 통일했다.
- 색상: 앱의 공통 텍스트·경계·버튼 토큰, 기존 계획 페이지의 크림/하늘/연분홍 아이콘 배경을 사용한다. 새로운 웹폰트·브랜드 팔레트는 없다.
- 자산: 기존 라이선스가 포함된 Bootstrap 아이콘 SVG 파일을 재사용한다. 원본의 장식용 새싹/사람 아이콘은 앱에 있는 저금통/지갑 아이콘을 사용해 기존 화면과 일치시켰다. 새 래스터·그림 대용 코드 도형은 만들지 않았다.
- 문구/데이터: 기존 저장 금액을 그대로 읽는다. 추가 저축은 월 합계가 아니라 `forecast.future`이며 합산식과 같은 기준이다. 지원금은 현재 저축과 분리한다. 결혼일이 없으면 미래/최종 예상액은 미확인이다. 월별 예외와 이미 기록된 납입은 삭제하지 않고 계산 기준에서 설명한다.

## 상호작용 및 검사

- 실제 브라우저: 저축/지원금/결혼일 수정 펼침, 초안 입력 후 대시보드 왕복, 취소와 포커스 복귀, 달력 열기→취소→재진입 시 닫힘, 집 시뮬 연결을 확인했다. 운영 저장 버튼은 누르지 않았고 테스트 금액을 DB에 쓰지 않았다.
- 테스트 대역: 7개 신규 검사로 기존 월별 기록 보존, 필드 단위 원본 비교, 두 사람 한 번 저장, 실패 후 동일 작업 재시도, 레거시 지원금 기본 포함, 결혼일 미설정/저장, 저장 중 취소 방지를 확인했다.
- `npm run check`: 2,259개 통과, 948개 로컬 참조와 279개 JS 문법 검사 통과. 첫 샌드박스 실행의 로컬 서버/임시 파일 접근 실패는 동일 검사를 허용된 환경에서 재실행해 해결했다. 마지막 달력 닫힘·캐시 버전 보완 뒤 빌드와 UI/회원 진입 검사 11개를 추가 통과했다.
- 1440px/390px/320px에서 본문 가로 넘침 없음. 기본 브라우저 크기로 복구하고 미리보기를 남겼다. 확인 구간의 브라우저 오류·경고 0건.

## 비교 이력과 결과

- 첫 전체/확대 비교에서 미해결 P0/P1/P2 시각 차이 없음. 공통 서체·메뉴 폭·홈 바·기존 아이콘·수정 버튼 위치의 의도한 차이를 위에 구분했다. 초기 잘린 캡처는 전체 페이지 재캡처로 교체했으며 결함 수정으로 세지 않았다.
- 동작 점검 중 달력 취소 후 펼침 상태가 남을 수 있는 부분을 닫힘 처리로 보완하고 실제 작은 화면에서 재진입해 확인했다.
- 구현 체크: 읽기 우선, 세 편집 영역, 기본값/계산 일치, 기존 기록 보존, 모바일, 오류·취소·저장 대역 확인 완료. Git push/운영 배포는 이번 범위에 포함하지 않았다.
- 후속: 사용자 화면 검토 후 필요 시 간격을 미세 조정하고 GitHub 배포를 별도로 진행한다. 스크린리더 전체/실기기 키보드 검증까지 완료한 것은 아니다.

---

## 이전 계획 화면 검토 기록

Date: 2026-11-01

final result: passed

## 비교 기준과 범위

- 구현: `http://127.0.0.1:8768/sungso/wecost/`의 대시보드, 현금흐름, 집 시뮬레이션 3개 내부 탭. 로그인한 기존 데이터는 읽기만 했다.
- 선택 시안 위치: `.local/wedding-qa/other-pages-20261101/`. `dashboard-soft.png`, `cashflow-soft.png`, `house-tabs/goal-company-base.png`, `house-tabs/amounts-company-base.png`, `house-tabs/loans.png`.
- 각 시안과 실제 캡처를 같은 이미지 입력에 함께 열어 전체 배치·숫자 위계·폼·비교 카드를 대조했다. 단순 경로 확인이나 빌드 결과를 시각 검증으로 대체하지 않았다.
- 원본 시안은 1487×1058 px. 첫 구현 캡처는 CSS viewport 1440×1024, DPR 1, 콘텐츠 폭 1425 px였다. 최종은 1487×1058, DPR 1, 스크롤바 제외 콘텐츠 폭 1472 px로 맞췄다. CSS 크기와 픽셀 밀도는 1:1이며, 전체 페이지 높이는 실제 저장 버튼·긴 항목명·설명으로 늘어난다. 캡처 크기를 압축해서 높이를 맞추거나 픽셀 오차 점수를 주장하지 않는다.
- 최종 캡처: `.local/planning-qa/dashboard-final.png` 1472×1225, `cashflow-final.png` 1472×1373, `house-goal-final.png` 1472×1326, `house-amounts-final.png` 1472×1269, `house-loans-final.png` 1472×1097.
- 모바일 실제 데이터는 CSS 390×844 / 320×844, DPR 1에서 확인했다. `dashboard-mobile.png`, `cashflow-mobile.png`, `house-goal-320.png`, `house-amounts-320.png`, `calendar-mobile.png`, `loan-editor-320.png`에 기록했다. 고정 하단 메뉴는 전체 페이지 캡처 중간에 보일 수 있으므로 스크롤 중 가림과 혼동하지 않는다. 이미지·개인 금액은 Git 제외 경로에만 보관한다.

## 확인된 구현과 의도한 차이

- 서체: 기존 앱의 한글 서체를 유지하고 본문/입력은 작고 일정하게, 주요 금액은 굵기와 크기로 구분했다. 생성 시안의 큰 글자를 그대로 확대하지 않았다.
- 구성: 대시보드의 3개 요약, 계산식과 납부의 두 열, 결혼자금 띠와 목표 비교를 유지한다. 현금흐름은 그래프 없이 개인 계획과 월 기록을 나란히 둔다. 집 시뮬은 목표·금액별 8개 비교·대출 관리가 별개 화면으로 이동한다.
- 색: 따뜻한 화이트와 중립 숫자, 작은 파스텔 아이콘, 초록 상환 막대, 로즈 부족액을 사용한다. 기존 결혼비용의 국소 테마와 일치시켰다.
- 이미지: Bootstrap Icons 1.11.3의 원본 SVG를 로컬 자산으로 사용하고 라이선스를 포함했다. 작은 표준 UI 아이콘에는 직접 그린 SVG나 생성 인물 아바타를 넣지 않았다. 공통 앱 메뉴는 기존 것을 유지한다.
- 내용: 회사대출이 누락된 초기 대시보드 시안의 월 부담은 확정 계산식으로 수정했다. 회사대출은 기존 등록 원본에서 한 번만 포함한다. 실제 데이터가 없는 저축일·실제 납입·부대비용은 미설정/미확인이다.
- 저장: 실제 재무 앱이므로 명시 저장, 실패/충돌 안내가 추가되어 이미지 시안보다 폼이 길다. 대출 추가 폼은 버튼을 누르면 같은 디자인의 편집 창으로 열어 목록의 빈 폼을 줄였다. 비교 카드 선택은 저장하지 않고 목표 초안에만 적용한다.

## 발견 사항과 수정 이력

1. [P2, 수정] 첫 데스크톱 구현에서 환율·결혼일의 독립 행과 긴 납부 목록으로 주요 내용이 아래로 밀렸다. 넓은 화면에서 헤더 옆 배치로 통합하고 납부는 가까운 3개로 줄였다. 현금흐름 요약·개인 입력 높이를 조정했다. 최종 desktop 캡처에서 가로 공간과 두 열 배치를 재확인했다.
2. [P2, 수정] 320px의 집 자금 띠에서 오른쪽 버튼이 금액 폭을 눌러 원 단위가 두 줄로 끊겼다. 모바일에서 아이콘/금액과 버튼을 두 행으로 배치했다. 수정한 `house-goal-320.png`와 DOM에서 금액 한 줄(높이 31px), 가로 넘침 없음을 확인했다.
3. [P2, 수정] 달력이 데이터 구독 전에 생성되어 선택 표시가 기존 결혼일과 다를 수 있었다. 깨끗한 입력 갱신 시 달력에도 날짜를 동기화했다. `calendar-mobile.png`에서 저장된 월·선택 날짜와 팝업 폭을 확인했다.
4. [P3, 수정] 변경 이력의 boolean과 일부 필드가 내부 이름으로 보였다. 한글 이름·원/%/년/일·포함/제외로 표시하고 대역 이력에서 확인했다.

남은 P0/P1/P2 사항은 없다. 실기기 터치·OS별 글꼴 렌더링은 브라우저 뷰포트 검증과 별개다. 작은 표준 아이콘을 더 풍부한 전용 일러스트로 바꾸는 작업은 선택적인 후속 디자인 범위다.

## 기능·접근성 검증

- 대시보드 필터·기존 납부 창 연결, 목표 미리 계산과 명시 저장, 네 탭 및 집 시뮬 세 내부 탭 연결 확인.
- 390/320px 가로 넘침 없음. 실제 달력·대출 수정 창·상환 흐름 창·기존 납부 창 열기/취소, 기본 데이터 보존 확인.
- 탭의 선택/키보드 이동, 입력 라벨·포커스·오류/저장 상태, reduced-motion CSS 지원 유지. 인증된 실제 데이터 브라우저 error/warn 0.
- 메모리 대역에서 저장 실패 후 초안 유지/재시도, 두 사람 연속 수정, 기존 모은 돈에 포함된 납입의 중복 합산 방지, 0% 금리 대출 추가, 잘못된 거치 저장 차단, 저장 후 합계·변경 이력 확인. 비교 선택으로 DB를 쓰지 않는 것을 확인했다.
- 전체 `npm run check`: 2,235 tests passed, 927 local references, 274 JS syntax checks. 최종 문구 수정 후 관련 16개 검사 재통과, 최종 CSS 빌드 645개 파일. 초기 실행의 샌드박스 권한 문제 및 무작위 테스트 서버 bad-port 실패는 마지막 전체 실행에서 해소됐다.
- 운영 데이터의 테스트 쓰기·자동 시딩·Git push·공개 배포는 하지 않았다. 로컬 미리보기만 갱신했다.

## 다음 검토

사용자가 실제 정보 밀도와 입력 흐름을 확인한 후, 배포 요청 시 현재 변경 묶음을 공개 사이트에 반영한다.

## 2026-11-01 추가 — 예산 범위·예상 수입·시장 금리

- 기존 대시보드에서 계산식과 등록 대출을 재확인하고 예산 범위 설정을 같은 둥근 톤으로 추가했다. 실제 데이터에서는 설정 창을 열어 확인한 후 저장 없이 닫았다.
- 실제 캡처: `.local/planning-qa/dashboard-budget-actual.png`, `budget-scope-actual.png`. 합성 자료에서는 제외 비용의 목록 유지·소계 제외, 연결 예상 수입의 함께 제외, 수입 적용 후 집 예상 현금 변화, 저장 실패 후 초안 유지·재시도·재조회까지 확인했다.
- 추가 대출 비교의 공표 평균/직접 입력 전환과 0% 저장·재조회, 기존 등록 대출 금리 유지 확인. 공표 기준월과 한국은행 출처를 표시하고 공개 ECOS 최신 수치와 대조했다.
- 390×844 설정 창에서 문서 너비 375px, 대화상자 343px, 폼 286px로 가로 넘침 없음. 관측 actual/QA 오류·경고 0. 임시 viewport는 복원했다.
- check: 2,245/2,245 통과; 948 local references; 279 JS syntax checks. 운영 DB 검증 쓰기·push·배포 없음. 예상 수입의 입금 예정일은 안내만 제공하며 일정별 선결제 자금 부족 자동 계산은 아직 없다.


## 2026-11-01 운영 배포 검증

- 릴리스 `3aac509`, Pages 실행 [41276836603](https://github.com/CastleRain/sungso/actions/runs/41276836603)의 검사·배포 성공.
- 최종 통합 check 2,248개·서비스 번들 통과. 진입 스크립트와 18개 사용 모듈 import map의 동일 캐시 버전 및 인증 뒤 로드 순서도 검사했다.
- 공개 파일 43개가 로컬 검증 산출물과 일치했으며 비공개 경로 4개는 404였다. 상세 결과는 Git 제외 `.local/planning-qa/deploy-public-results.json`에 보관했다.
- 실제 로그인 화면의 대시보드·현금흐름·결혼비용·집 시뮬과 집 시뮬 세 내부 탭, 공표 금리 표시, 기존 회사대출, 예산 범위·예상 수입 창을 확인했다. 운영 DB에는 검증용 저장을 하지 않았고 관측 console error/warn은 0이었다.
- 최종 공개 대시보드 캡처 `.local/planning-qa/production-dashboard.png`를 확인했다. 이전의 ‘로컬만 검증’ 기록 이후 실제 배포까지 완료했으며 개인 금액 캡처는 커밋에 넣지 않았다.

## 2026-11-01 Wedding funding-gap correction and fixed-cost concepts

- Implemented: expected savings + included support - the wedding page funding gap + signed adjustments. Historical paid costs are not deducted again. Wallet/expected income offset the gap once; surplus is not automatically house cash. Existing enabled company loan remains separate and counted once.
- Unknown funds/FX stays unknown in house cash/budget and budget-edit preview. Core and actual budget dialog DOM tests cover positive/zero gap, deficit, exclusions, preview-only edits, and missing valuation.
- Validation: npm run check passed 2,261 tests, 949 local references and 279 JS syntax files. Two newly added budget-preview DOM tests then passed; no subsequent production code changes. git diff --check passed.
- Browser limitation: old authenticated wedding view was readable. On reload, IAB displayed a blank private root with no applied CSS and no auth gate; same assets returned HTTP 200 from the local server. Latest authenticated screen/amount comparison was not verified. No production write or deployment occurred.
- Fixed-cost tab: three independent generated 1440x1024-target concepts, saved in ignored .local/fixed-cost-design-20261101 with prompts/plan.json. Same warm rounded system font direction, synthetic nine items. Monthly equivalent 482,000 KRW; November scheduled 592,000 KRW includes annual 120,000 KRW. Generated typography/proportions are not measured CSS. No fixed-cost feature implemented yet.
## 2026-11-01 Fixed-cost icon library

- Prepared 144 unique Lucide 0.468.0 SVGs (16 groups, 9 per group), 71,164 SVG source bytes, Korean labels/keywords, stable IDs, recommended18 and wallet fallback in apps/wecost/assets/fixed-cost-icons. Original bytes match SHA-256 manifest; source/license included.
- Self-contained local icon-picker prototype offers group/search/recent/selection/preview. It uses no DB or external scripts. Runtime test through JSDOM passed Korean synonym search, all/group counts, selection/recent, fallback and no-results recovery with zero runtime errors. HTML script syntax parsed successfully.
- npm run build passed; every selected SVG is in the build. No full suite rerun needed for static preparation. Existing application entry points and DB behavior unchanged.
- Actual browser inspection was blocked by the browser's file: URL security policy. No alternate-browser, server, or indirect workaround attempted. Browser layout, keyboard focus styling and mobile behavior remain unverified. Native SVG contact sheet was rendered to PNG and visually checked (144 shapes and labels fit).
- Preview, generator, source tarballs and rendering dependency stay under ignored .local/fixed-cost-design-20261101/icon-library. Not deployed; picker not yet attached to fixed-cost forms.
