# 모바일 청첩장 선택

성우·소희가 기본 6종과 특별한 6종, 총 열두 가지 예시를 끝까지 내려보며 비교하고, 각자의 찜과 공동 디자인 선택을 저장하는 앱이다. 하객에게 전달할 실제 청첩장 제작·공개 기능은 별도 작업이다.

- 공개 경로: `/sungso/invitation/`.
- 화면: `#catalog`, `#preview/{templateId}`, `#selection`. 직접 접근·새로고침·뒤로가기를 지원한다.
- 홈: D-day 아래 첫 묶음 **결혼 전** → 모바일 청첩장 → Honeymoon → 여행 일정.
- 모바일은 문서 자체를 세로 스크롤한다. 데스크톱 미리보기는 최대 430px와 옆 설정 영역을 사용한다.
- 기존 `sungso_pin_auth` PIN 진입·홈 복귀를 따른다. PIN은 DB 인증이 아니다.

## 디자인과 설정

| ID | 이름 | 색감 | 기본 갤러리 |
|---|---|---|---|
| `minimal` | 단정한 청첩장 | 아이보리·블러시·그레이 | 격자 |
| `photo` | 우리의 화보 | 내추럴·웜톤·모노 | 슬라이드 |
| `garden` | 봄날의 정원 | 세이지·크림·피치 | 격자 |
| `letter` | 너에게 보내는 편지 | 파치먼트·크림·로즈 | 격자 |
| `sketch` | 우리 둘의 그림 | 크림·스카이·핑크 | 격자 |
| `cinema` | 우리라는 영화 | 차콜·미드나이트·버건디 | 필름 스트립 |
| `envelope` | 봉투 속 초대 | 왁스 크림·로즈·올리브 | 격자 |
| `constellation` | 우리의 별자리 | 인디고·플럼·딥 틸 | 슬라이드 |
| `camera` | 찰칵, 우리의 순간 | 버터·라벤더·민트 | 필름 스트립 |
| `storybook` | 펼치면, 우리 | 포레스트·살구·라일락 | 격자 |
| `ticket` | 둘만의 탑승권 | 오션·선셋·코발트 | 필름 스트립 |
| `curtain` | 우리의 첫 장면 | 벨벳·에메랄드·네이비 | 슬라이드 |

색감은 각 템플릿의 첫 번째가 기본이다. 갤러리·오시는 길·마음 전하실 곳은 기본 켬, 우리 이야기·참석 여부·방명록은 기본 끔이다. 표지·초대글·예식 정보·마무리는 고정한다. 메모는 최대 1,000자다.

같은 가상 커플 사진 3장을 모든 템플릿에서 사용한다. 그림 템플릿의 표지는 같은 커플을 참고해 생성한 일러스트다. 이름과 2027년 3월 6일 외의 사진·시간·장소·이야기는 예시다. 지도·계좌·참석·방명록은 형태만 보여주고 실제 데이터·응답을 받지 않는다. 갤러리 확대·닫기·사진 이동은 동작한다. 이미지 경로와 생성 프롬프트는 [이미지 기록](docs/image-prompts.md)에 있다.

## 특별한 여섯 장

목록의 **모두 보기·기본 6종·특별한 6종**을 먼저 고르고 사람별 찜 필터를 함께 사용할 수 있다. 모음 선택도 기기에 보관하고 목록 복귀 시 유지한다.

| 디자인 | 직접 해보는 동작 |
|---|---|
| 봉투 속 초대 | 봉인을 누르면 봉투 날개가 접히고 초대장이 올라온다. 다시 닫을 수 있다. |
| 우리의 별자리 | 별 다섯 개를 눌러 선을 이어 사진을 드러낸다. 한 번에 잇기와 다시 그리기도 제공한다. |
| 찰칵, 우리의 순간 | 셔터를 누르면 즉석사진이 나온다. 세 장의 예시 사진을 순서대로 꺼낼 수 있다. |
| 펼치면, 우리 | 책을 펼치면 종이 꽃과 사진으로 만든 입체 장면이 나타난다. |
| 둘만의 탑승권 | 탑승권의 절취선을 누르면 티켓이 나뉘고 결혼 도장이 찍힌다. |
| 우리의 첫 장면 | 커튼을 열면 스포트라이트와 짧은 축하 장식이 첫 장면을 드러낸다. |

장면 상태는 현재 앱 세션의 메모리에만 두며 색감·갤러리·섹션 변경으로 캔버스를 다시 그려도 유지한다. 브라우저를 새로고침하면 체험을 처음부터 시작한다. 찜·공동 선택·선택서에는 열린 봉투, 누른 별, 촬영 순서 등을 저장하지 않는다. 예식 정보는 체험을 완료하지 않아도 아래로 내려서 바로 읽을 수 있다. 키보드로 같은 버튼을 사용하며 모션 감소 설정에서는 동작 결과를 즉시 보여준다. 음원 재생은 추가하지 않는다.

## 모듈과 저장 계약

- `catalog.mjs`: 템플릿, 팔레트, 사진, 섹션 정의.
- `core.mjs`: 입력 정리, 임시 설정, 경로, 필터, 트랜잭션 변경 규칙, 선택서 출력.
- `templates.mjs` / `css/invitation.css`: 기본 여섯 디자인의 표지·본문·마무리.
- `special-paper.mjs`·`special-worlds.mjs`와 같은 이름의 CSS: 특별한 여섯 디자인의 표지와 본문.
- `experiences.mjs`: 체험 진행·다시 보기·키보드 버튼·타이머 정리. 저장 계층과 독립한다.
- `app.mjs` / `css/app.css`: 목록·꾸미기·공동 선택·모달 UI.
- `store.mjs`: 공동 상태와 실패 처리. `firestore-adapter.mjs`: SDK를 주입하는 실제 트랜잭션·구독.
- `firebase.mjs`: SDK 10.12.0, 이름 `sungso-invitation`, 공통 공개 설정만 사용한다.

Firestore는 **`couplePicks/invitation_templates`** 한 문서만 사용한다. 기존 공개 `couplePicks` 정책을 계승하며 규칙을 변경하지 않았다. 기존 리조트 문서 `couplePicks/main`에는 접근하지 않는다. 조회로 문서를 생성하지 않는다.

```js
{
  schemaVersion: 1,
  favorites: { sungwoo: ['minimal'], sohee: ['garden'] },
  selection: {
    schemaVersion: 1,
    templateId: 'garden', paletteId: 'sage', galleryLayout: 'grid',
    sections: { story: false, gallery: true, directions: true,
                accounts: true, rsvp: false, guestbook: false },
    note: ''
  },
  selectionRevision: 1,
  updatedBy: 'sohee',
  updatedAt: /* Firestore serverTimestamp */ null
}
```

찜은 트랜잭션에서 최신 문서를 읽고 해당 사람의 배열만 중첩 병합한다. 찜 변경은 공동 선택 번호를 증가시키지 않는다. 공동 선택 저장은 초안을 시작한 `baseRevision`과 서버의 `selectionRevision`이 같을 때만 설정·번호·변경자·시각을 한 번에 기록한다. 충돌하면 최신 선택을 보여주며, 확인 버튼은 초안 기준 번호만 갱신한다. 사용자가 저장을 다시 눌러야 반영된다.

`localStorage.sungso_invitation_v1`에는 기기의 선택자, 디자인 모음·목록 필터·스크롤 위치, 템플릿별 임시 설정과 기준 번호를 저장한다. 임시 옵션은 공동 문서를 바꾸지 않는다. 연결·저장 실패를 성공으로 표시하지 않고 예시와 임시 설정은 계속 제공한다. 저장소가 막힌 브라우저에서는 세션 중 사용과 안내를 제공한다.

**선택 내용 복사**와 **선택서 내려받기**는 공동으로 저장된 `selection`만 사용한다. 내려받는 `sungso-invitation-selection.json`에는 위의 선택 객체 7개 키만 포함한다. 선택자·찜·변경 번호·시각은 제작용 JSON에 넣지 않는다. 실제 사진 업로드·문구 편집·음원·연락처·계좌정보·하객 응답은 별도 제작 앱의 범위다.

## 로컬 검증

루트 `npm test`와 `npm run check`에 `tests/core.test.mjs`와 `tests/experiences.test.mjs`가 포함된다. 브라우저 검증은 다음 대역 서버를 사용한다.

```sh
node apps/invitation/tests/qa-server.mjs
```

`http://127.0.0.1:8017/sungso/invitation/`에서 PIN을 통과한다. 서버가 빌드 결과를 제공하므로 소스 수정 후 `npm run build`와 브라우저 새로고침이 필요하다. 이 서버의 공동 데이터는 메모리에만 있고 재시작하면 사라진다. 홈의 일정은 읽기 전용 대역이며 CSP로 외부 API 연결을 차단한다. `/__qa/state`는 대역 상태, `/__qa/mode`는 `live`·`failure`·`offline` 상황 제어용이다. 이 파일과 테스트·문서는 웹 배포에 포함되지 않는다.

카탈로그·저장 규칙을 수정하면 QA 서버도 재시작한다. 로컬 선택을 보존하려면 `/__qa/state` 응답을 임시 JSON 파일로 저장하고 `INVITATION_QA_SEED_FILE=/tmp/저장한파일.json` 환경 변수로 시작한다. `INVITATION_QA_PORT`로 독립 검증용 포트를 지정할 수 있다.

Emulator 테스트는 `services/homehunt/cloud`의 설치된 Firebase 테스트 SDK와 Java·Firebase CLI를 사용한다. [기존 Emulator 환경](../../docs/development.md#firestore-emulator)을 준비한 뒤 루트에서 실행한다.

```sh
npx firebase-tools emulators:exec --only firestore --project demo-homehunt "node --test apps/invitation/tests/firestore.emulator.mjs"
```

로컬 Emulator 주소가 없거나 localhost가 아니면 테스트가 중단된다. 조회 시 미생성, 두 사람 동시 찜, 공동 선택 충돌·재저장, 오프라인 실패를 실제 어댑터와 저장소 규칙으로 검사한다. 운영 저장·공개 배포를 검증 목적으로 실행하지 않는다. [검증 결과](../../docs/invitation-verification.md)를 참고한다.
