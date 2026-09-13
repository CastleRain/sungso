# sungso

성우와 소희의 결혼 준비를 위한 여러 앱을 한 저장소에서 운영한다. 화면은 GitHub Pages, 공동 데이터는 Firebase, HomeHunt 검색은 Render에서 제공한다.

[서비스 열기](https://CastleRain.github.io/sungso/) · [구조](docs/architecture.md) · [개발·검증](docs/development.md) · [배포·복구](docs/deployment.md) · [작업 지침](AGENTS.md) · [이번 구조 정리 검증](docs/restructure-verification.md)

## 앱

| 소스 | 공개 경로 | 역할 |
|---|---|---|
| [apps/hub](apps/hub/README.md) | `/sungso/` | 홈·일정·달력·D-day |
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
- `shared/`: Firebase 공개 설정, 금융·여행·HomeHunt의 실제 공통 코드. 앱 구현을 역으로 참조하지 않는다.
- `services/`: 검색 API·수집·배포 진입점·원천자료·비공개 로컬 상태.
- `config/apps.json`: 앱과 공개 출력의 등록부. `scripts/`가 등록된 파일만 `dist/`에 생성한다.
- `docs/`: 현행 개발·운영 안내. `archive/`는 이전 문서와 보관 자료이며 현재 구현 기준이 아니다.

새 앱은 `apps/{id}/`와 등록부 항목을 추가한다. 자세한 순서는 [새 앱 추가](docs/architecture.md#새-앱-추가)를 따른다. 소스 폴더 이동과 공개 URL 변경은 별개다. 공통 모듈도 소스→공개 경로 매핑으로 기존 URL에 직접 출력하고 버전 query를 유지한다. 이번 정리에서는 기존 URL·Firestore 컬렉션·브라우저 저장 키를 보존한다.

## 개발 계획

[우리 둘의 홈·인증 전환 계획과 프로토타입](docs/development-plans/active/couple-home/README.md) · [계획 목록](docs/development-plans/README.md)
