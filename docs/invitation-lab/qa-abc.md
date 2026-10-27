# Invitation Lab — A/B/C 및 예식 카드 검증

검증일: 2026-10-28. 로컬 통합 빌드 `http://127.0.0.1:8031/lab/v6-1/`를 Chrome 실제 탭에서 CUA로 열어 확인했다. 이 하위 작업의 브라우저에는 IAB가 노출되지 않아 별도 Chrome 검증 탭 두 개만 만들었으며, 검증 후 모두 닫고 뷰포트 설정을 원복했다. 사용자 탭은 조작하지 않았다.

## 범위와 환경

- A/B/C를 390×844 모바일 뷰포트와 1440×900 PC 뷰포트에서 확인했다. Windows Chrome의 세로 스크롤바 때문에 일반 본문의 측정 폭은 각각 375px / 1425px이며, 모달에서 스크롤이 잠기면 390px이었다.
- 첫 화면, 실제 스크롤, 이야기 열기와 장 이동, 사진 확대와 다음 이동, C의 가로 사진첩과 세로 스크롤 통과, 전체 사진첩, 큰 글씨, 효과 끄기, 예식 카드 생성 UI를 확인했다.
- 시안 자료만 사용했다. 운영 방명록·앨범·계좌 쓰기나 관리 권한 변경은 없다.

## 관찰 결과

| 항목 | 실제 관찰 | 결과 |
| --- | --- | --- |
| A 이어지는 선 | 첫 화면 `stroke-dashoffset:1`, 첫 스크롤 `.88589`, 이야기 진입 `.444866` | 스크롤에 따라 실제 선이 이어짐 |
| A 이야기 | 1장 커피숍 → 2장 결혼의 확신, 닫기 후 본문 복귀 | 정상 |
| A 사진 | 2 / 7 → 3 / 7, 실제 확대 이미지 `naturalWidth:1440` | 정상 |
| B 표지 프레임 | 배율 `1` → `.9504`, 이동 `-7.44px`, 좌우 inset `3.721%` | 전체 사진이 인화 사진 형태로 변함 |
| B 사진첩 펼침 | 첫 사진 `x165.50 / -6deg / .88` → `x94.40 / -3.423deg / .9315` → `x0 / 0deg / 1` | 같은 실제 버튼 6개가 펼쳐져 정렬됨 |
| B 사진첩 정착 | 완료 후 `.b-album-open`, 390px 사진 버튼 약102px, 계속 내려갔다 돌아와도 정렬 유지 | 정상 |
| B 이야기/사진 | 2장 바로 열기, 3번째 사진 확대/닫기 | 정상 |
| C 표지 빛 | 빛 불투명도 `0` → `.2573`, X 이동 `-168.75` → `279.525px` | 사진 위 빛 이동 관찰 |
| C 이름 대비 | 공통 `.hero-photo::after` 어두운 그라디언트가 유지됨 | 빛 효과가 가독성 층을 덮어쓰지 않음 |
| C 가로 사진첩 | 가로 스크롤 `scrollLeft:0` → `249` | 다음 사진 노출 |
| C 세로 이동 | 같은 사진 위에서 세로 휠 조작 시 앨범 top `43.69` → `-294.31px`; 가로 위치249 유지 | 세로 스크롤을 가로 앨범이 가로채지 않음 |
| C 전체 보기 | 실제7개 사진 버튼과 사진2/7 확대 | 정상 |
| C 큰 글씨 | `html.large-text`, `body[data-text-size=large]`, 이야기 본문16px | 정상, 모달 가로 넘침 없음 |
| C 효과 끄기 | 빛 불투명도0, 모든 사진 inset0%, `.reveal` 중 opacity0인 항목0개 | 읽을 수 있는 최종 상태 유지 |
| 반응형 | A/B/C의 두 검증 폭에서 문서 scrollWidth와 clientWidth 일치 | 가로 넘침 없음 |
| 브라우저 오류 | 검증 탭의 warn/error 기록 조회 | 관측0개 |

## 브라우저 검증 중 보완한 점

1. 공통 이야기 카드의 기본 사진 폭61%와 텍스트 폭68%가 테마의 세로 카드 구조에 남아 있던 부분을 수정했다. A/B/C 사진과 문구를 모두 폭100%로 명시하고 문구를 flex column으로 배치했다. 손글씨 제목과 한국어 안내가 한 줄에 붙지 않는다. A 최종 모바일 사진·문구 폭은 각각327px로 일치했다.
2. 공통 `.gallery-decoration`의 absolute 배치가 B/C의 작은 앨범 장식을 제목 위에 올리는 문제를 수정했다. B/C는 relative spacer로 분리하고 가운데 정렬했다. C 최종 모바일에서 제목 하단245.77px, 장식 상단277.77px로 분리된다.
3. 첫 진입 때 공통 빠른 보기와 바로 보기 버튼이 겹치는 현상을 부모 작업에 전달했다. 부모 작업이 공통 UI에서 처리한다. 본 보고서의 개별 테마 파일은 공통 UI를 수정하지 않았다.

## 예식 카드 생성

빠른 보기 → 예식 정보 이미지 저장을 실제 클릭했다. 생성된 `#card-preview`는 실제 사진을 포함한 `blob:` PNG이며 자연 크기1080×1440, 파일명 `sungso-wedding-6.1-a-preview.png`였다. 화면에서 손글씨 제목, 성우·소희, 2027년3월6일 토요일 오후3시30분, 부산 목화웨딩홀15층 벨리스홀, 주소, A 시안의 새 canonical URL과 비교 시안 표기를 확인했다. 사진이나 서체 오류 때 빈 이미지를 반환하지 않는 실패 처리는 단위 검사로 확인했다.

다섯 팔레트의 색상 대비·같은 출처 사진 URL·정확한 시안 URL·크롭 범위·한글 줄바꿈·PNG 크기·서체/사진/인코딩 실패를 검사했다. OS 다운로드 폴더의 파일 저장 완료나 휴대폰 공유 시트 전송까지 검증했다는 의미는 아니다.

## 대표 화면

- A 모바일 최종 이야기: [a-mobile-story.png](qa/a-mobile-story.png)
- A 모바일 이야기 창: [a-mobile-story-dialog.png](qa/a-mobile-story-dialog.png)
- A 모바일 사진첩: [a-mobile-gallery.png](qa/a-mobile-gallery.png)
- A PC 사진첩: [a-desktop-gallery.png](qa/a-desktop-gallery.png)
- A 예식 카드 UI: [a-card-desktop.png](qa/a-card-desktop.png)
- B PC 프레임 변환: [b-desktop-frame.png](qa/b-desktop-frame.png)
- B PC 사진 펼침 중간: [b-desktop-fan.png](qa/b-desktop-fan.png)
- B 최종 모바일 사진첩: [b-mobile-gallery.png](qa/b-mobile-gallery.png)
- B 최종 PC 사진첩: [b-desktop-gallery.png](qa/b-desktop-gallery.png)
- B 모바일 이야기: [b-mobile-story.png](qa/b-mobile-story.png)
- C 모바일 표지: [c-mobile-hero.png](qa/c-mobile-hero.png)
- C 표지 빛 이동: [c-mobile-light.png](qa/c-mobile-light.png)
- C 최종 모바일 사진첩: [c-mobile-gallery.png](qa/c-mobile-gallery.png)
- C 가로 이동 후: [c-mobile-gallery-next.png](qa/c-mobile-gallery-next.png)
- C 전체 사진첩: [c-mobile-album.png](qa/c-mobile-album.png)
- C 최종 PC 사진첩: [c-desktop-gallery.png](qa/c-desktop-gallery.png)

중간 스크롤/빛 캡처는 해당 시점의 화면이며, 최종 장식 간격은 이름에 ‘최종’이 붙은 결과를 기준으로 본다.

## 자동 검사와 남은 범위

`node --test apps/invitation-lab/tests/themes-abc.test.mjs apps/invitation-lab/tests/invitation-card.test.mjs` — 12개 모두 통과. 드라이버의 프레임 합치기, 숨은 탭/열린 대화상자에서 작업 중단, 모션 감소 우선, 정리 후 재활성화 방지, 위치별 진행률, 사진 펼침의 최종 접근 가능한 배치도 포함한다.

실제 iPhone/Android 터치, Safari의 주소창 변화, 기기 모션 감소 설정, OS 다운로드·공유 시트, 음악 소리의 기기 출력과 네이티브 지도 앱 전환은 별도 실기기 확인 범위다. 이 기록은 A/B/C와 카드 모듈의 로컬 검증이며 공개 배포 완료를 의미하지 않는다.

다음: 다섯 시안 통합 검증과 비교 페이지에서 실제 휴대폰으로 모션 강도·스크롤 길이를 비교한다.

## 공개 배포 후 독립 교차 확인

같은 날 공개 주소 `https://sungso-wedding.vercel.app/lab/v6-1/`를 별도 Chrome 탭에서 확인했다. 비교 화면에서 B 사진첩 이동, E 이야기 이동과 E 사진첩 이동이 실제로 이루어졌다. 프레임 내부 DOM에서 E의 `theme-e-motion`, 이야기 top43.67px, 사진첩 top43.75px 및 실제6개 사진 버튼을 확인했다.

시안을 B → E → D → B → E로 연속 교체해도 해당 Chrome 탭의 error/warn 기록은0개였다. 다른 브라우저에서 한 번 관찰된 일반 `MutationObserver.observe` 대상 오류는 이 독립 확인에서 재현되지 않았다. 오류가 절대 발생하지 않는다는 보장은 아니며, 현재 소스 결함으로 판정할 근거는 발견하지 못했다.

E 단독 공개 페이지의 390×844 화면도 확인했다. `theme-e-motion`이 활성화되고 실제338px 스크롤에서 표지 `scale1 → 1.0088`, Y이동 `0 → 6.81px`가 관찰됐다. 이야기 구역 진입 후 진행률1, 컵 획 dashoffset0%, 가로 넘침 없음, 관측 error/warn0개였다. 서버나 운영 데이터 쓰기는 없으며 검증 탭과 임시 뷰포트는 모두 정리했다.

- [공개 B 비교 사진첩](qa/public-catalog-b-gallery.png)
- [공개 E 비교 이야기](qa/public-catalog-e-story.png)
- [공개 E 비교 사진첩](qa/public-catalog-e-gallery.png)
- [공개 E 모바일 이야기](qa/public-e-mobile-story.png)
