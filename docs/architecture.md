# 앱을 확장하는 구조

sungso는 앱 소스와 공개 URL을 분리한다. 앱·공통 코드·서비스를 저장소에서 구분하고 `config/apps.json`의 허용 목록으로 기존 웹 경로를 `dist/`에 만든다. 앱 실행 방식은 기존 정적 HTML·ES 모듈·CDN을 유지한다.

## 폴더와 출력

```text
sungso/
├── apps/
│   ├── hub/                 → dist/                   → /sungso/
│   ├── dates/               → dist/dates/             → /sungso/dates/
│   ├── invitation/          → dist/invitation/         → /sungso/invitation/
│   ├── wecost/              → dist/wecost/            → /sungso/wecost/
│   ├── honeymoon/           → dist/honeymoon/          → /sungso/honeymoon/
│   ├── travel/              → dist/travel/             → /sungso/travel/
│   ├── homehunt/            → dist/homehunt/           → /sungso/homehunt/
│   ├── table/               → dist/table/              → /sungso/table/
│   ├── footprints/          → dist/footprints/         → /sungso/footprints/
│   └── wedding/             → dist/wedding/            → /sungso/wedding/
├── shared/
│   ├── firebase/            공개 설정·Google 회원 인증·앱 시작/정리
│   ├── home/                앱 목록·공유 홈·메모
│   ├── life/                생활 앱 공통 입력·로컬 기록·화면
│   ├── theme/               공통 솜사탕 블루 색상·손글씨 로고
│   ├── finance/             재무 계산·목표 집값·여행 예산 연결
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

`shared/theme/brand.css`와 손글씨 로고 PNG는 등록부를 통해 `dist/shared/theme/`에 출력한다. 대문을 포함한 10개 진입점이 공통 색상을 먼저 로드하고 앱별 CSS가 용도에 맞게 연결한다. 밝은 배경·카드·선택/주요 버튼과 읽기용 글자색을 분리하며, 청첩장 예시 자체의 팔레트와 지도·금액·경고 등의 의미색은 앱 안에서 유지한다. 인증·생활 앱의 로고 URL도 이 공통 자산을 가리킨다.

일반 UI의 기본 글꼴과 색상은 [공통 화면 기준](../shared/theme/README.md)을 따른다. 새 화면에 별도 브랜드 HEX·RGB를 만들지 않고 기존 토큰을 사용하며, 글자색과 채운 버튼 배경은 서로 다른 역할로 관리한다. 개인 자료나 청첩장 콘텐츠의 디자인은 공통 UI 색상 변경의 대상이 아니다.

## 의존성과 경로 규칙

- 앱은 필요한 도메인의 `shared/` 모듈을 import한다. 서버도 같은 순수 로직을 사용한다. `shared/`와 서비스 코드에서 앱 구현 모듈을 import하지 않는다.
- 서비스가 `apps/homehunt/data/`의 공식 JSON을 읽거나 번들에 넣는 것은 데이터 의존성이다. 전국 원천자료는 `services/homehunt/data/source/`, 수집 대상은 `config/`, 알림 중복 장부는 `state/`에 둔다.
- JavaScript는 실제 **소스 위치**를 기준으로 import한다. 예를 들어 `apps/wecost/js/`에서 금융 공통 코드는 `../../../shared/finance/financial-calc.mjs`다. 빌드가 구문 분석한 import 경로를 등록된 공개 출력 위치에 맞춰 바꾼다. source 폴더 구조를 그대로 URL로 노출하지 않는다.
- HTML의 `src`/`href`와 CSS·fetch의 공개 자산 URL은 **출력 위치**를 기준으로 유지한다. 허브의 `wecost/`, 하위 앱의 `../`, 한글 PDF 경로와 지도·외부 링크를 소스 폴더 깊이에 맞춰 바꾸지 않는다.
- CDN URL·버전 query·동적 import·초기화 순서를 보존한다. 새로운 앱 공통화는 실제 소비자가 있을 때 수행하고, 화면만 비슷하다는 이유로 독립 앱 상태를 합치지 않는다.
- 공통 Firebase 모듈은 Google 로그인·서버 회원 확인·다섯 명명 앱의 인증 동기화와 로그아웃 정리를 소유한다. 각 앱의 데이터 구독은 회원 확인 후 시작하며 자동 시딩하지 않는다.

## 개인 홈과 인증

각 앱 HTML은 개인 루트를 숨긴 상태로 `shared/firebase/boot.mjs`만 실행한다. 회원 확인 후 기존 classic/module 스크립트를 순차 로드한다. `homehunt-private-cloud`를 기준으로 `[DEFAULT]`, `sungso-travel`, `sungso-travel-budget`, `sungso-invitation`에 같은 Google 사용자를 동기화한다. 회원 전용 개인 컬렉션과 HomeHunt 본인 UID 제한은 Firestore 규칙과 Render 서버에서 별도로 강제한다.

`site_members/{uid}`는 관리자만 관리한다. `site_home/shared`는 3개 그룹·6개 앱의 순서/숨김 및 revision을 저장하고, 변경 전 revision을 비교해 충돌 시 초안을 보존한다. 홈의 `#home`은 저장된 앱 배열 중 숨기지 않은 앞 네 개를 바로가기로 요약한다. 바로가기를 명시적으로 적용할 때 선택한 앱을 배열 앞에 두고 나머지 앱은 홈에서 숨기며 새 필드를 추가하지 않는다. `#apps`는 홈 숨김과 무관하게 등록된 전체 앱을 검색·그룹·페이지로 탐색한다. 그룹 순서는 전체 앱 분류와 목록에 적용된다. 기존 여섯 앱이 모두 표시된 설정을 읽을 때 저장하거나 잘라내지 않는다.

`home_notes`는 회원 일반 텍스트 메모이며 작성자만 삭제한다. 홈에서는 최신 메모 두 줄을 요약하고 전문·최근 3개·더보기·작성·삭제는 메모 대화상자에서 제공한다. 홈은 `events`를 읽어 다가오는 3개와 저장된 중요 일정 하나를 표시하고 기존 날짜 CRUD는 `/sungso/dates/`가 담당한다. 대문에 개인 예시 날짜나 미완성 앱을 넣지 않으며, 다른 앱의 개인 데이터 전체를 미리 구독하지 않는다.

생활 앱 기본 틀 세 개는 `shared/life/registry.mjs`의 별도 등록부로 모든 앱 목록에 합쳐 표시한다. 기본 버전이라는 표시와 기기·계정별 저장 범위를 안내하며, 기존 여섯 앱만 허용하는 공유 홈 문서의 배열·바로가기에는 새 ID를 저장하지 않는다. `table`, `footprints`, `wedding`은 공통 회원 확인 후 같은 회원의 로컬 생활 기록을 읽는다. 장소·방문·앨범과 레시피·장보기는 ID로 연결하고, 기존 일정·재무·청첩장 데이터는 복제하지 않는다. 원본 사진 업로드·지도 API·운영 생활 컬렉션·새 규칙은 이 기본 틀에 포함하지 않는다.

여행·리조트의 개인 기준은 `private_data/{travel_reference,honeymoon_reference}`에서 인증 후 읽는다. 기존 운영 일정·재무 문서는 기준 자료보다 우선하며 누락 문서를 자동 생성하지 않는다. 로그아웃/계정 전환은 구독·비동기 결과·개인 DOM을 정리한다. 명시적 로그아웃은 별도 비식별 잠금 표식을 두고 모든 SDK의 로그아웃 성공 뒤 메모리 Firestore를 종료하고 다시 연다. 실패하면 잠금과 재시도 화면을 유지하며 브라우저 저장소 제한에 따른 새로고침/새 탭 한계를 안내한다. 로컬 초안 키는 삭제하지 않고 비인증 상태에서 숨긴다. PDF 10개 공개 유지는 사용자 지정 예외이며 Drive 보호는 미완료다.

## 여행과 재무 연결

Travel의 `budget.mjs`와 WeCost의 기존 비용 편집은 `shared/finance/travel-budget-core.mjs`의 계산·검증과 `travel-budget-store.mjs`의 구독·트랜잭션을 공유한다. 저장소는 기존 `sungso-travel-budget` 이름을 사용하며 인증 동기화 후 연결한다. 두 모듈도 등록부를 통해 `/sungso/shared/{파일명}.mjs`로 직접 출력한다.

여행비는 기존 `wecost_items/{id}` 중 `cat === '✈️신혼여행'`인 한 항목을 연결한다. 세부 예산을 결혼비용의 새 항목으로 복제하지 않는다. `itineraries/honeymoon_2027_budget`에는 연결 ID·세부 비용·처음 비교 금액·계산 환율·남은 여행용 준비금을 저장하며, 일정 문서 `itineraries/honeymoon_2027`과 과거 `itineraries/main`은 분리한다. 지급액은 기존 `deposit + actual`, 잔금은 `max(planned - 지급액, 0)` 계약을 따른다.

Travel의 명시적 예산 저장은 같은 트랜잭션에서 기존 장부의 예상액·잔금, 상세 예산 문서, `itineraries/honeymoon_2027_budget_log_…` 이력을 반영한다. 기존 신혼여행 장부 항목을 편집할 때도 장부와 금액 이력을 원자적으로 기록한다. 앱은 이력을 추가만 하며 과거 이력을 편집·삭제하지 않는다. 조회·초안 계산·후보 가격 적용은 저장하지 않고, 저장 시 편집 전 원본을 비교해 동시 변경을 차단한다. Firestore 보안 규칙이나 인증 정책을 이 연결의 부수 작업으로 변경하지 않는다.

## 새 앱 추가

1. `apps/{id}/`에 `index.html`과 필요한 JS/CSS/자산, README·AGENTS를 만든다. 앱 ID와 공개 경로는 기존 등록과 중복되지 않게 선택한다.
2. `config/apps.json`의 `apps` 배열에 `id`, `source`, `output`, `files`를 등록한다. `files`에는 공개할 파일·디렉터리만 명시한다. 설정 파일·키·테스트·문서는 기본 배포 자산으로 넣지 않는다.
3. 허브에 노출할 앱이면 `shared/home/home-core.mjs`의 명시적 목록과 관련 Firestore 홈 구성 검증을 갱신한다. 저장된 구성에 없는 새 앱은 기본 그룹 끝에 보충한다. 알 수 없는 ID로 실행 링크를 만들지 않는다.
4. 여러 앱이 실제 함께 사용할 코드는 `shared/{domain}/`에 둔다. 새 Firebase 저장이 필요하면 기존 컬렉션·인증 정책을 검토하고 고유 계약으로 설계한다. 다른 앱의 저장 키를 재사용하지 않는다.
5. 루트 `npm run check`를 실행하고 `/sungso/{id}/` 직접 접근·홈 복귀·모바일·관련 앱 연결을 확인한다. 서버가 필요하면 별도의 `services/` 경계와 배포 검증을 추가한다.

등록 예시는 현재 `config/apps.json`의 앱 항목을 복사해 source/output과 허용 파일을 변경한다. 신규 앱 때문에 빌드 스크립트의 앱 목록을 하드코딩하지 않는다.

## 보관과 호환

[archive](../archive/README.md)는 이전 문서·WeCost 백업·몰디브 독립 보고서/XML·HomeHunt 2.5 인계자료를 보관한다. 기존 공개 자료 중 유지할 파일만 호환 출력으로 명시한다. 전국 단지 카탈로그·메타 JSON 두 파일도 서비스의 원천자료 위치에서 기존 `homehunt/data/` 공개 URL로 출력하는 명시적 예외다. archive 전체, 서비스 구현·자격증명·상태 장부·테스트·등록부는 웹에 공개하지 않는다.

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
