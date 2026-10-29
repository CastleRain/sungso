# 모바일 청첩장 공식 사례 조사 A

2026-10-29 · TO OUR GUEST / Theirmood / MOID

이 문서는 공식 웹 페이지의 본문과 공개 샘플 URL을 확인한 기록이다. 실제 모션의 속도·방향·전환은 웹 텍스트만으로 추정하지 않았다. 루트가 따로 수행한 CUA 화면 확인은 별도 통합 기록에서 다룬다.

세 업체 각각 공개 샘플 URL 5개, 총 15개를 열었다. 이 조사 도구가 추출한 것은 본문 1개, 서비스 셸 3개, 제목만 5개이며 나머지 6개는 접근 오류였다. 접근 오류를 샘플 본문 확인 성공으로 세지 않는다. 이를 보완해 공식 기능 사례 18개를 각각 구분했다. 개별 관측·제한·출처는 [구조화 기록](providers-a.json)에 있다.

## 샘플별 확인

### TO OUR GUEST

[공식 샘플 목록](https://toourguest.com/home/mobile)

| ID | 공개 샘플 | 웹 확인 범위 |
| --- | --- | --- |
| tog-01 | [Seychelles](https://toourguest.com/preview/seychelles) | 접근 실패, 공식 목록으로 식별 |
| tog-02 | [Porto](https://toourguest.com/preview/porto) | 접근 실패, 공식 목록으로 식별 |
| tog-03 | [Sydney](https://toourguest.com/preview/sydney) | 서비스 셸만 추출 |
| tog-04 | [Seoul](https://toourguest.com/preview/seoul) | 서비스 셸만 추출 |
| tog-05 | [Copenhagen](https://toourguest.com/preview/copenhagen) | 서비스 셸만 추출 |

공식 기능 사례:

- tog-f01: [QR 다운로드](https://toourguest.com/home/news) — 2025-03-26 하트 QR / 2025-05-27 투명 QR
- tog-f02: [안내 슬라이더](https://toourguest.com/home/news) — 2025-03-26 공지 영역
- tog-f03: [표지 글자 위치](https://toourguest.com/home/news) — 2025-05-21 커버 폰트 / 2025-03-24 레터링 위치
- tog-f04: [마지막 사진](https://toourguest.com/home/news) — 2025-04-07 엔딩글귀
- tog-f05: [중간 블록](https://toourguest.com/home/news) — 2026-05-26 신규 커버 등
- tog-f06: [가족·계좌 배치](https://toourguest.com/home/news) — 2024-08-07 가족 / 2024-07-07 계좌

### Theirmood

[공식 샘플 목록](https://theirmood.com/mcards/sample)

| ID | 공개 샘플 | 웹 확인 범위 |
| --- | --- | --- |
| tm-01 | [01 브라이트 데이](https://theirmood.com/card/vzUGuBO4E1) | 문서 제목만 추출 |
| tm-02 | [02 로즈 스크립트](https://theirmood.com/card/kcVXiy7cf1) | 문서 제목만 추출 |
| tm-03 | [03 톤온톤 타이포](https://theirmood.com/card/VnQQJqztIk) | 문서 제목만 추출 |
| tm-04 | [18 블루 캐주얼](https://theirmood.com/card/mPWlDg9AGv) | 문서 제목만 추출 |
| tm-05 | [35 핸드라이팅](https://theirmood.com/card/Eo5huVAcEU) | 문서 제목만 추출 |

공식 기능 사례:

- tm-f01: [예식 당일 안내](https://theirmood.com/mcards/specs) — 하객나우 / §7 하객 편의
- tm-f02: [사진 격자 세부 설정](https://theirmood.com/mcards/specs) — §3 사진·영상
- tm-f03: [마지막 장면](https://theirmood.com/mcards/specs) — §3 엔딩 스타일
- tm-f04: [QR와 이미지 공유](https://theirmood.com/mcards/specs) — §9 공유
- tm-f05: [글자 크기](https://theirmood.com/mcards/specs) — §1 제작·편집
- tm-f06: [개인 초대 편지](https://theirmood.com/mcards/specs) — 모청편지 / §9 공유
- tm-f07: [하객 사진 수집](https://theirmood.com/mcards/specs) — §4 모청스냅

### MOID

[공식 샘플 목록](https://moid.co.kr/samples)

| ID | 공개 샘플 | 웹 확인 범위 |
| --- | --- | --- |
| moid-01 | [Classic Ivory](https://moid.co.kr/samples/classic-ivory) | 본문 추출 |
| moid-02 | [Sage Garden](https://moid.co.kr/samples/sage-garden) | 접근 실패, 공식 목록으로 식별 |
| moid-03 | [Editorial Mono](https://moid.co.kr/samples/editorial-mono) | 접근 실패, 공식 목록으로 식별 |
| moid-04 | [Modern Minimal](https://moid.co.kr/samples/modern-minimal) | 접근 실패, 공식 목록으로 식별 |
| moid-05 | [Golden Letter](https://moid.co.kr/samples/golden-letter) | 접근 실패, 공식 목록으로 식별 |

공식 기능 사례:

- moid-f01: [QR 미리 준비](https://moid.co.kr/qr) — QR Builder
- moid-f02: [교통 안내 분리](https://moid.co.kr/) — 홈의 두 예시 청첩장
- moid-f03: [신랑·신부 프로필](https://moid.co.kr/) — PROFILE
- moid-f04: [블록 순서·표시](https://moid.co.kr/faq) — 블록을 원하는 순서로 변경할 수 있나요?
- moid-f05: [방명록·하객 접근](https://moid.co.kr/faq) — 하객 기능

## 조립실에 적용할 선택

현재 조립실은 7개 기본 장면과 6개 선택 장면, 색감·서체·여백·구분선·모션·속도·강도·순서·보관함을 이미 갖춘다. 기능 이름만 늘리기보다 같은 내용을 새 방식으로 읽고 전달하는 선택이 유용하다.

| 우선 | 새 선택 | 활용 방법 | 공식 근거 ID |
| --- | --- | --- | --- |
| 1 | QR로 휴대폰 이어 보기 | 지금 고른 조합을 다른 기기에서 그대로 확인하고 이미지 저장 | tog-f01, tm-f04, moid-f01 |
| 1 | 당일 패스 | 시간·장소·길찾기 중심으로 짧게 확인하고 전체 초대로 복귀 | tm-f01, moid-f02 |
| 1 | 사진첩 비율·열 수 | 한 사진첩에서 원본·정사각, 2·3열을 선택 | tm-f02 |
| 1 | 마지막 사진 연출 | 기존 마무리를 정적·스크롤·블러 편지 중 선택 | tm-f03, tog-f04 |
| 2 | 안내 모아보기·넘기기 | 긴 설명을 쌓지 않고 필요한 안내를 선택 | tog-f02 |
| 2 | 글자 크기·줄 간격 | 혼주 세대까지 읽기 편한 정도를 조합에 저장 | tm-f05 |
| 2 | 표지 초점·글자 위치 | 인물과 이름·날짜가 겹치지 않도록 비교 | tog-f03 |

위 구현안은 우리 청첩장에 맞춘 제안이다. 업체의 실제 모션 궤적이나 구현 코드를 확인·복제한 것이 아니다. 각 옵션의 기본값은 기존 완료 조합을 유지해야 한다.

사진 자동 넘김과 사진 톤은 이 세 업체 자료에서 근거를 찾지 못했다. 추가한다면 자체 제안으로 분류하고, 자동 넘김은 직접 시작·정지 및 사용자 조작 우선을 갖춘다.

## 중복·보류

- 가족 소개, 계좌 탭·복사, 방명록, 달력·일정 저장, 순서·표시 선택은 이미 있다. 새 기능 수로 다시 세지 않는다.
- 중간 사진·문구는 기존 이야기·한 문장·감사 장면과 겹칠 수 있어 낮은 우선순위다.
- 하객별 편지는 사적인 글과 접근 정책이 필요하다. 공개 조합 URL에 그대로 넣지 않는다.
- 하객 사진 업로드는 현재 두 사람 사진첩과 다른 서비스다. 저장소·파일 검사·관리 권한·개인정보 처리가 필요하므로 이번 정적 UI 확장과 분리한다.
- 사용자 요청으로 뺀 RSVP는 다시 넣지 않는다. 줌 차단, 상업 화환, 제작사 홍보도 도입하지 않는다.

## 구현 시 경계

QR은 정확한 현재 조합 URL을 담고 디코딩까지 검증한다. 업체의 예약 QR과 같은 주소 변경 추적은 별도 서버가 필요하므로 있다고 주장하지 않는다. 당일 패스에는 확인된 시간·주소만 사용하며 미정 주차·식사·ATM을 만들지 않는다. 비교 시연은 복사·다운로드·외부 지도·서버 쓰기를 자동 실행하지 않는다.

서체 크기·사진 배열은 320px에서 확인하고 선택된 사진·음악·작성 중 입력을 유지한다. 모션 감소/효과 끄기는 존중한다. 기존 공개 청첩장·API·계좌·관리 권한은 이번 조사 및 선택 UI 확장의 변경 대상이 아니다.

## 다음

루트가 저장한 15개 실제 샘플 화면·조작 근거와 이 공식 기능 기록을 합쳐 선택 범위를 확정한다. 새 선택 구현 뒤 저장·URL·모바일·음악·시연 취소 회귀를 검증한다.

