# sungso

성우와 소희의 일상·집 준비·결혼·여행을 위한 개인 홈이다. 화면은 GitHub Pages, 공동 데이터는 Firebase, HomeHunt 검색은 Render에서 제공한다. 승인된 두 Google 계정으로 로그인한 뒤 개인 데이터를 읽는다.

[서비스 열기](https://CastleRain.github.io/sungso/) · [구조](docs/architecture.md) · [개발·검증](docs/development.md) · [배포·복구](docs/deployment.md) · [작업 지침](AGENTS.md) · [이번 구조 정리 검증](docs/restructure-verification.md)

## 앱

| 소스 | 공개 경로 | 역할 |
|---|---|---|
| [apps/hub](apps/hub/README.md) | `/sungso/` | 공유 앱 그룹·홈 편집·다가오는 일정·메모 |
| [apps/dates](apps/dates/README.md) | `/sungso/dates/` | 기존 일정·달력·D-day |
| [apps/invitation](apps/invitation/README.md) | `/sungso/invitation/` | 청첩장 기본 6종·특별한 6종·찜·공동 디자인 선택 |
| [apps/wecost](apps/wecost/README.md) | `/sungso/wecost/` | 결혼비용·현금흐름·집 예산 |
| [apps/honeymoon](apps/honeymoon/README.md) | `/sungso/honeymoon/` | 리조트 비교·견적 PDF·커플 picks |
| [apps/travel](apps/travel/README.md) | `/sungso/travel/` | 현재 여행 일정·숙소·WeCost 연결 예산·출발 준비·변경 이력 |
| [apps/homehunt](apps/homehunt/README.md) | `/sungso/homehunt/` | 아파트·실거래·통근·분양 |

## 시작

Node.js 22에서 저장소 루트의 명령을 실행한다.

```sh
npm ci
npm run dev
```

터미널에 표시된 `/sungso/` 미리보기 주소를 연다. 브라우저는 `dist/`의 배포 구조를 사용하므로 소스 HTML을 직접 열지 않는다. 외부 Firebase·지도 연결은 실제 서비스 설정을 사용한다. 자동 시딩·환율 갱신을 포함한 DB 쓰기를 차단하려면 [검증 안내](docs/development.md)를 따른다.

```sh
npm run build
npm test
npm run check
```

서버는 [서비스 의존성 설치와 빌드](docs/development.md#서비스-빌드) 후 별도로 실행한다. 웹 빌드는 서버를 실행하거나 배포하지 않는다.

## 구조의 기준

- `apps/`: 앱별 화면·자산·공개 데이터·관련 테스트.
- `shared/`: Firebase 인증·공개 설정, 공유 홈·금융·여행·HomeHunt의 공통 코드. 앱 구현을 역으로 참조하지 않는다.
- `services/`: 검색 API·수집·배포 진입점·원천자료·비공개 로컬 상태.
- `config/apps.json`: 앱과 공개 출력의 등록부. `scripts/`가 등록된 파일만 `dist/`에 생성한다.
- `docs/`: 현행 개발·운영 안내. `archive/`는 이전 문서와 보관 자료이며 현재 구현 기준이 아니다.

새 앱은 `apps/{id}/`와 등록부 항목을 추가한다. 자세한 순서는 [새 앱 추가](docs/architecture.md#새-앱-추가)를 따른다. 소스 폴더 이동과 공개 URL 변경은 별개다. 공통 모듈도 소스→공개 경로 매핑으로 기존 URL에 직접 출력하고 버전 query를 유지한다. 이번 정리에서는 기존 URL·Firestore 컬렉션·브라우저 저장 키를 보존한다.

## 개발 계획

[우리 둘의 홈·인증 전환 계획과 프로토타입](docs/development-plans/active/couple-home/README.md) · [계획 목록](docs/development-plans/README.md)

개인 PDF 10개는 사용자 요청으로 GitHub에 유지한다. NAVER 신규 키의 서버 설정·배포는 완료했으며 이전 키 폐기와 Drive 제한 공유, 남은 실제 회원 접근은 [진행 기록](docs/development-plans/active/couple-home/PROGRESS.md)의 후속 작업이다. 새 키를 설정해도 일정 기간 유효한 이전 키가 즉시 폐기되지는 않는다. 현재 소스에서 개인 기준 자료를 제거해도 과거 Git 이력의 노출이 해소되는 것은 아니다.
