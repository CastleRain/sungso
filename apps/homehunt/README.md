# HomeHunt

직접 본 아파트 기록과 공식 자료를 함께 비교하는 부동산 탐색 앱이다. 화면은 `/sungso/homehunt/`, 검색 API는 기존 Render 서비스, 로그인·개인 백업·서버 공공 캐시는 Firebase를 사용한다.

| 영역 | 역할 |
|---|---|
| `index.html`, `js/`, `css/` | 집 찾기·확인한 후보·내 기록·실거래·분양·대시보드·안내/연결 |
| `providers/` | 화면의 공식 근거·외부 포털 연결 어댑터 |
| `data/` | 공개 단지·실거래·분양·법정동·역·금리 자료 |
| `tests/` | 화면·순수 계산·서비스 계약 회귀 검사 |
| `../../shared/homehunt/` | 화면·서버가 함께 사용하는 거래·통근·추천·스냅샷 순수 로직 |
| `../../services/homehunt/` | API·수집·배포·원천자료·로컬 상태 |

## 실행과 데이터

저장소 루트에서 `npm ci` 후 `npm run dev`를 실행한다. 로컬 화면은 기존 `127.0.0.1:8787` API를 사용하며, 검색 서버를 쓸 때는 [서비스 안내](../../services/homehunt/README.md)를 따른다. 공개 화면은 검증된 기존 Render 주소를 사용한다.

방문·후보·조건은 브라우저 저장소에, 명시적으로 선택한 개인 백업은 본인 UID로 보호된 `homehunt_user_snapshots`에 저장한다. 공공 실거래의 금액 단위는 만원, 면적은 ㎡이며 서로 다른 면적·사실/추정·현재/이전 자료를 혼합하지 않는다. 회사 위치·개인 메모·통근 공급자 원문을 공개 JSON에 넣지 않는다.

가격·통근 API를 호출하지 않고도 순수 로직·대역·Emulator·기존 공개 자료로 검증할 수 있다. 실제 조회가 필요한 검증은 호출 한도·장부를 유지하며 별도로 다룬다.

## 휴대폰 알림

사이트를 닫아도 분양 알림을 받는 선택 기능은 GitHub Actions의 Telegram 연결이다. `TELEGRAM_BOT_TOKEN`과 `TELEGRAM_CHAT_ID`는 Repository Secrets에만 두고 [설정 안내](docs/api-keys.md#3-telegram-휴대폰-알림)를 따른다. 토큰·개인 청약정보·방문 메모를 공개 JSON이나 공개 Firestore에 저장하지 않는다. 수동 검증은 dry-run으로 수행하며 발송·기존 알림 조건을 임의 변경하지 않는다.

## 안내

- [작업 지침과 저장 계약](AGENTS.md)
- [전체 개발·검증](../../docs/development.md) · [전체 배포·복구](../../docs/deployment.md)
- [Render](docs/render-deployment.md) · [인증·Functions 대안](docs/firebase-cloud.md) · [Firestore 운영](docs/firestore-free-operation.md)
- [API 키 이름과 연결](docs/api-keys.md) · [금리 대시보드](docs/finance-dashboard.md) · [예상가격](docs/price-outlook.md)
- [통근 설계 근거](docs/report-source.md) · [공급자 정책](docs/rebuild-provider-policy.md)

이전 릴리스의 검증 횟수·연결 상태는 [archive/history](../../archive/history/README.md)의 해당 날짜 기록이다. 현재 릴리스의 완료 상태는 [루트 진행 상황](../../AGENTS.md#진행-상황)을 따른다.
