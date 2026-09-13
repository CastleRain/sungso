# 앱을 확장하는 구조

sungso는 앱 소스와 공개 URL을 분리한다. 앱·공통 코드·서비스를 저장소에서 구분하고 `config/apps.json`의 허용 목록으로 기존 웹 경로를 `dist/`에 만든다. 앱 실행 방식은 기존 정적 HTML·ES 모듈·CDN을 유지한다.

## 폴더와 출력

```text
sungso/
├── apps/
│   ├── hub/                 → dist/                   → /sungso/
│   ├── wecost/              → dist/wecost/            → /sungso/wecost/
│   ├── honeymoon/           → dist/honeymoon/          → /sungso/honeymoon/
│   ├── travel/              → dist/travel/             → /sungso/travel/
│   └── homehunt/            → dist/homehunt/           → /sungso/homehunt/
├── shared/
│   ├── firebase/            공개 설정
│   ├── finance/             재무 계산·목표 집값 연결
│   ├── travel/              여행 기준·검증·공동 저장
│   └── homehunt/            화면·서버 공통 순수 로직
├── services/
│   ├── homehunt/            server, scripts, render, cloud
│   │                       data/source, config, state
│   └── firebase-default/    기존 Firebase 함수
├── config/                 앱·자산·소스→공개 경로 등록
├── scripts/                빌드·미리보기·검사
├── tests/                  공통·사이트 통합 검사
├── docs/                   현행 구조·개발·운영
├── archive/                이전 실행자료·지침·이력
└── dist/                   생성 배포물, Git 제외
```

Firebase·Render·GitHub 설정은 도구가 찾는 루트 위치에 둔다. 앱 전용 UI와 CSS는 해당 앱 안에 남긴다. 여행 결정 패널도 소스는 `apps/travel/`에 있고 여행 페이지에서만 로드한다. 패널의 공개 URL은 기존 `shared/decision-panel.mjs`·`.css`를 유지한다. HomeHunt `providers/`는 브라우저 근거 표시용이므로 앱 안에 남긴다.

## 의존성과 경로 규칙

- 앱은 필요한 도메인의 `shared/` 모듈을 import한다. 서버도 같은 순수 로직을 사용한다. `shared/`와 서비스 코드에서 앱 구현 모듈을 import하지 않는다.
- 서비스가 `apps/homehunt/data/`의 공식 JSON을 읽거나 번들에 넣는 것은 데이터 의존성이다. 전국 원천자료는 `services/homehunt/data/source/`, 수집 대상은 `config/`, 알림 중복 장부는 `state/`에 둔다.
- JavaScript는 실제 **소스 위치**를 기준으로 import한다. 예를 들어 `apps/wecost/js/`에서 금융 공통 코드는 `../../../shared/finance/financial-calc.mjs`다. 빌드가 구문 분석한 import 경로를 등록된 공개 출력 위치에 맞춰 바꾼다. source 폴더 구조를 그대로 URL로 노출하지 않는다.
- HTML의 `src`/`href`와 CSS·fetch의 공개 자산 URL은 **출력 위치**를 기준으로 유지한다. 허브의 `wecost/`, 하위 앱의 `../`, 한글 PDF 경로와 지도·외부 링크를 소스 폴더 깊이에 맞춰 바꾸지 않는다.
- CDN URL·버전 query·동적 import·초기화 순서를 보존한다. 새로운 앱 공통화는 실제 소비자가 있을 때 수행하고, 화면만 비슷하다는 이유로 독립 앱 상태를 합치지 않는다.
- 공통 Firebase 모듈은 공개 설정만 내보낸다. 앱별 Firebase 이름·SDK·인증·구독·시딩은 해당 앱이 소유한다.

## 새 앱 추가

1. `apps/{id}/`에 `index.html`과 필요한 JS/CSS/자산, README·AGENTS를 만든다. 앱 ID와 공개 경로는 기존 등록과 중복되지 않게 선택한다.
2. `config/apps.json`의 `apps` 배열에 `id`, `source`, `output`, `files`를 등록한다. `files`에는 공개할 파일·디렉터리만 명시한다. 설정 파일·키·테스트·문서는 기본 배포 자산으로 넣지 않는다.
3. 허브에 노출할 앱이면 `apps/hub/index.html`에 공개 주소 링크를 추가한다. 등록부는 빌드 입력이며 허브 카드나 브라우저 메뉴를 자동 생성하지 않는다.
4. 여러 앱이 실제 함께 사용할 코드는 `shared/{domain}/`에 둔다. 새 Firebase 저장이 필요하면 기존 컬렉션·인증 정책을 검토하고 고유 계약으로 설계한다. 다른 앱의 저장 키를 재사용하지 않는다.
5. 루트 `npm run check`를 실행하고 `/sungso/{id}/` 직접 접근·홈 복귀·모바일·관련 앱 연결을 확인한다. 서버가 필요하면 별도의 `services/` 경계와 배포 검증을 추가한다.

등록 예시는 현재 `config/apps.json`의 앱 항목을 복사해 source/output과 허용 파일을 변경한다. 신규 앱 때문에 빌드 스크립트의 앱 목록을 하드코딩하지 않는다.

## 보관과 호환

[archive](../archive/README.md)는 이전 문서·WeCost 백업·몰디브 독립 보고서/XML·HomeHunt 2.5 인계자료를 보관한다. 기존 공개 자료 중 유지할 파일만 호환 출력으로 명시한다. archive 전체, 서비스 소스·자격증명·테스트·등록부는 웹에 공개하지 않는다.

공통 모듈은 소스→공개 경로 매핑으로 **기존 URL에 직접 출력**한다. 경유하는 wrapper나 새로운 별칭 URL을 만들지 않으며 import의 버전 query도 그대로 보존한다. 이 원칙은 배포 전부터 열린 페이지와 캐시된 모듈이 함께 사용될 때도 같은 모듈·클래스를 참조하도록 유지한다.

| 소스 | 공개 출력 |
|---|---|
| `shared/finance/*.mjs` | 기존 `dist/shared/{파일명}.mjs` |
| `shared/travel/*.mjs` | 기존 `dist/shared/{파일명}.mjs` |
| `shared/homehunt/*.mjs` | 기존 `dist/homehunt/js/{파일명}.mjs` |
| `apps/travel/decision-panel.mjs`·`.css` | 기존 `dist/shared/decision-panel.mjs`·`.css` |
| `shared/firebase/config.mjs` | 신규 `dist/shared/firebase/config.mjs` |

모듈을 옮길 때 소스 import와 공개 경로 매핑을 함께 확인한다. 소스 위치가 같더라도 서로 다른 query는 기존 브라우저 모듈 구분의 일부이므로 빌드에서 제거하거나 합치지 않는다.

Firestore 컬렉션, localStorage/IndexedDB 키, API 주소·함수명과 값의 단위는 변경하지 않는다. 폴더 이동을 데이터 마이그레이션으로 취급하지 않으며 로컬 `.env`·캐시·사용량 장부도 계승한다.
