# sungso 공통 화면 기준

배경·버튼·글자·테두리·포커스와 기본 글꼴은 `brand.css` 한 곳에서 관리한다. 앱마다 화면 구조는 유지하고 같은 역할에 같은 토큰을 사용한다. 이 문서는 배포 파일 목록에 포함되지 않는다.

| 용도 | 토큰 |
|---|---|
| 페이지 배경 / 카드 | `--ss-bg` / `--ss-surface` |
| 연한 구역 배경 | `--ss-soft` |
| 주요 버튼·선택 배경 / 버튼 글자 | `--ss-accent` / `--ss-on-accent` |
| Hover 배경 | `--ss-hover` |
| 본문 / 보조 설명 | `--ss-text` / `--ss-muted` |
| 링크 / 키보드 포커스 | `--ss-link` / `--ss-focus` |
| 기본 / 강조 테두리 | `--ss-border` / `--ss-border-strong` |
| 본문·입력·버튼 글꼴 / 고정폭 | `--ss-font-sans` / `--ss-font-mono` |

새 화면은 해당 앱의 기존 CSS에서 이 토큰을 사용한다. 앱에 이미 `--primary`, `--accent`, `--text` 같은 별칭이 있으면 사용처를 확인한 뒤 공통 역할에 연결한다. 글자와 버튼 배경에 같은 별칭을 공유하지 않는다. 일반 글자에 연한 버튼 색을 쓰거나 연한 버튼에 흰 글자를 쓰지 않는다.

```css
.page { background: var(--ss-bg); color: var(--ss-text); font-family: var(--ss-font-sans); }
.card { background: var(--ss-surface); border: 1px solid var(--ss-border); }
.action { background: var(--ss-accent); color: var(--ss-on-accent); font-family: inherit; }
.action:hover { background: var(--ss-hover); }
.hint { color: var(--ss-muted); }
```

일반 UI의 HEX·RGB를 새로 직접 입력하지 않는다. 반투명 브랜드색은 `color-mix(in srgb, var(--ss-accent) 30%, transparent)`처럼 토큰에서 파생한다. 색상 변경은 공통 파일에서 시작하고 실제 기본·hover·focus·선택 상태의 글자 대비를 확인한다. 일반 글자는 4.5:1 이상을 유지한다.

위험·오류·완료, 수입·지출·대출, 국가·지도 마커·리조트 등급 등의 의미색과 청첩장 예시·지도·사진 같은 콘텐츠의 팔레트는 해당 앱이 관리한다. 테마를 바꾸기 위해 운영 데이터·저장된 청첩장 선택·개인 여행 기준 본문을 수정하지 않는다. 앱 UI와 예시가 같은 변수명을 쓰면 앱 UI의 선언만 공통 토큰에 연결한다.

공통 글꼴은 기기의 시스템 글꼴이다. 외부 폰트가 로드된 앱과 그렇지 않은 앱의 기본 UI 차이를 줄인다. 청첩장 예시의 개별 글꼴은 별도다. 기존 폰트 CDN·스크립트의 버전 및 로드 순서는 유지한다.

`config/apps.json`은 이 폴더의 `brand.css`와 `sungso-wordmark-sky.png`만 `/sungso/shared/theme/`로 출력한다. 로고는 이미지 파일 하나를 공유한다. 새 앱의 HTML도 공통 테마를 앱 스타일보다 먼저 로드한다. 변경 후 루트 build/test/check와 `/sungso/` 경로의 PC·모바일 검증을 수행한다.
