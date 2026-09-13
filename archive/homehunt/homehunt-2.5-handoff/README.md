# HomeHunt 2.5 UI·기능 인수인계 패키지

이 폴더는 UI 3.0의 출발점이 된 HomeHunt 2.5 구현을 보존한 역사적 인수인계 스냅샷이다. 화면 모양만 설명하지 않고, 당시 어떤 데이터가 어디서 오며 어떤 조건으로 후보·평균가격·통근·예측·분양 알림이 만들어졌는지 함께 기록한다. 현재 운영 버전과 연결 상태는 저장소 상위의 `README.md`와 앱의 `연결 상태` 화면을 기준으로 본다.

- 기준 버전: 프런트엔드·로컬 API `2.5.0`
- 문서·캡처 기준일: 2026-09-04
- 범위: 서울·경기 아파트 탐색, 방문 기록, 국토부 실거래, 분양·청약, 다중 목적지 통근
- 캡처 크기: 데스크톱 브라우저 `1146 × 912`
- 개인 데이터: 방문 기록·관심 후보·청약 프로필은 브라우저 로컬 저장소를 사용한다.
- 비밀값: `.env`의 실제 키는 이 문서와 캡처 어디에도 포함하지 않는다.

## 문서 구성

| 문서 | 무엇을 설명하는가 |
|---|---|
| [01-ui-and-screen-guide.md](./01-ui-and-screen-guide.md) | 디자인 원칙, 정보구조, 6개 화면, 지도·패널·모달, 데스크톱·모바일 동작과 처음 사용하는 순서 |
| [02-data-and-logic.md](./02-data-and-logic.md) | 데이터 출처, 브라우저·파일 캐시, 후보 판정, 통근, 평균가격, 예측 안전장치, 분양 수집·알림, 보안 경계 |
| [03-enhancement-brief.md](./03-enhancement-brief.md) | 현재 한계, 다음 고도화 우선순위·수용 기준, 다음 AI 작업에 그대로 사용할 실행 프롬프트 |
| [capture-metadata.json](./capture-metadata.json) | 캡처 당시 URL·화면 상태·주의사항을 기계가 읽을 수 있는 형태로 정리 |
| [screenshots/](./screenshots/) | 실제 로컬 앱을 순회해 저장한 화면 캡처 14장 |

## 한 문장으로 이해하기

HomeHunt는 “조건에 맞는 집을 지도에서 찾고 → 실제 계약가격을 확인하고 → 직접 방문한 집만 별도로 기록하고 → 분양·청약 공고와 알림까지 이어가는” 둘만의 서울·경기 아파트 의사결정 도구다.

집 찾기 후보와 방문 기록은 같은 것이 아니다.

- `집 찾기`: 서울·경기 공식 단지 중 조건과 실거래를 확인한 탐색 후보 전체
- `관심 후보`: 집 찾기 결과에서 나중에 다시 보려고 저장한 후보
- `내 기록`: 두 사람이 실제로 방문한 집만 저장하는 개인 기록
- `실거래`: 단지·거래유형·전용면적을 정확히 골라 보는 국토부 계약가격
- `분양·청약`: 청약홈·LH·SH 공식 공고와 신혼 관련 근거, 맞춤 필터, 알림

## 캡처 목록

캡처에는 현재 로컬 저장 상태가 그대로 보인다. 문서 작성을 위해 가짜 집이나 가짜 분양 공고를 추가하지 않았다.

| 파일 | 화면 상태 | 확인할 부분 |
|---|---|---|
| [01-house-finder-map.png](./screenshots/01-house-finder-map.png) | 집 찾기 기본 지도 | 지도 우선 구성, 한 줄 조건 칩, 5개 레이어, 지도 범례 |
| [02-house-finder-filter.png](./screenshots/02-house-finder-filter.png) | 조건 드로어 열림 | 최대 4개 목적지, 가격·평수·연식·세대수·통근 조건 |
| [03-house-finder-results.png](./screenshots/03-house-finder-results.png) | 결과 패널 열림 | 관심 후보 카드, 실거래·지도·통근·관심 액션 |
| [04-my-records-list.png](./screenshots/04-my-records-list.png) | 내 기록 목록 | 실제 방문 기록만 표시하는 빈 상태와 지도·목록·비교 전환 |
| [05-my-records-map.png](./screenshots/05-my-records-map.png) | 내 기록 지도 | 검색·조건·결과를 접을 수 있는 방문 지도 |
| [06-complex-market.png](./screenshots/06-complex-market.png) | 단지 실거래 | 관악산벽산타운5의 실제 조회 결과와 정확 전용면적 선택 |
| [07-market-forecast.png](./screenshots/07-market-forecast.png) | 예측·근거 | 성능 기준을 못 넘으면 숫자 예측을 보류하는 화면 |
| [08-supply.png](./screenshots/08-supply.png) | 분양·청약 | 빠른 메뉴·공식 공급원 상태·고밀도 필터와 현재 0건 상태 |
| [09-supply-match-modal.png](./screenshots/09-supply-match-modal.png) | 내 분양 조건 | 동네·가격·평형·공급세대·미공개 값 포함 여부 |
| [10-guide.png](./screenshots/10-guide.png) | 사용 안내 | 처음 시작 순서와 현재 6개 메뉴 설명 |
| [11-subscription-readiness.png](./screenshots/11-subscription-readiness.png) | 청약 준비도 | 두 사람의 자가입력 범위와 당첨확률을 만들지 않는 원칙 |
| [12-connections.png](./screenshots/12-connections.png) | 연결 상태 | 지도·실거래·분양·통근·로컬 저장의 실제 연결 범위 |
| [13-visit-record-modal.png](./screenshots/13-visit-record-modal.png) | 방문 기록 작성 | 가격·면적·층·평가·장단점·메모 입력 구조 |
| [14-destination-modal.png](./screenshots/14-destination-modal.png) | 출근 목적지 추가 | 회사·학교·자주 가는 건물 검색과 지도 직접 선택 |

## 캡처 당시 실제 상태

| 항목 | 상태 |
|---|---|
| 로컬 API | `2.5.0`, 정상 |
| 서울·경기 공식 단지 | 17,851개 |
| 국토부 실거래 | 키 인식·조회 가능 |
| 네이버 지도 | Dynamic Map·주소 검색 정상 |
| 회사·건물명 검색 | 기존 NAVER Developers 지역 검색 인식; 2027-06-30 전 API HUB 이관 필요 |
| 자동차 경로 | NAVER Directions 인식 |
| 대중교통 경로 | TMAP 인식, Kakao는 미연결 |
| 집 찾기 로컬 상태 | 관심 후보 1건이 있어 결과·가격 핀 예시로 사용 |
| 내 기록 로컬 상태 | 방문 기록 0건 |
| 분양 피드 | 현재 공식 공고 0건. 청약홈·LH 활용승인/응답을 다시 확인해야 함 |

`0건`은 UI 샘플이 부족하다는 뜻이 아니라, 현재 공식 데이터 응답이 비어 있다는 뜻이다. 앱은 이를 임의 공고나 임의 가격으로 채우지 않는다.

## 실행 방법

저장소 루트에서 정적 서버와 로컬 실거래 서버를 각각 실행한다.

```powershell
python -m http.server 8000 --bind 127.0.0.1
powershell -ExecutionPolicy Bypass -File .\homehunt\scripts\start-local-market.ps1
```

그다음 `http://127.0.0.1:8000/homehunt/`를 연다. 아래 API 2.5.0·테스트 222개 표기는 캡처 당시 기록이며, 현재 최소 API 계약과 테스트 수는 상위 `README.md`와 `AGENTS.md`를 따른다.

검증 명령:

```powershell
node --test homehunt/tests/*.test.mjs
node --check homehunt/js/app.js
node --check homehunt/js/naver-map.js
node --check homehunt/js/navigation-v25.js
```

현재 기준 자동 테스트는 `222/222`를 통과한다.

## 다음 작업자가 먼저 읽을 순서

1. 이 README에서 제품 역할과 캡처 상태를 확인한다.
2. `01-ui-and-screen-guide.md`에서 화면 구조와 사용자 흐름을 파악한다.
3. `02-data-and-logic.md`에서 “확정값/추정값/미확인값” 경계를 이해한다.
4. `03-enhancement-brief.md`의 P0부터 작업하고 각 수용 기준을 자동 테스트로 남긴다.
5. `.env`는 읽거나 출력하지 말고, 연결 여부만 `/api/health`의 boolean 상태로 확인한다.
