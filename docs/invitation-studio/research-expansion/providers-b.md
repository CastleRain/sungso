# 청첩장 조립실 확장 조사 B

조사일: 2026-10-29. 공식 업체 5곳의 공개 샘플 **27개**를 열어 텍스트·HTML·공개 디자인 설정을 비교했다. 디얼디어 5개 상품은 로그인으로 연결되어 봄카드 제휴 샘플로 대체했다. 개별 증거는 [providers-b.json](./providers-b.json)에 기록한다.

## 확인 범위

이 문서는 화면을 눈으로 재생한 검수가 아니다. 바른손은 공개 미리보기의 템플릿 JSON, 보자기는 공개 샘플 HTML 설정, 봄카드/살롱드레터는 공개 HTML·CSS, 아름은 web 도구로 읽은 실제 샘플 본문을 확인했다. DOM/설정에 있는 항목과 실제 표시·동작을 구분한다. 사진·폰트·장식·문구·소스를 가져오지 않았다. 작성·송금·계좌 복사·외부 앱 실행·등록은 하지 않았다.

루트 에이전트는 보자기 5개를 별도 브라우저로 열고 표지·메뉴·방명록 DOM과 화면을 기록했다. 그 실제 UI 증거는 루트의 캡처/검수 자료를 기준으로 하며 이 문서의 소스 조사에 혼합하지 않는다.

| 업체 | 공개 샘플 수 | 직접 확인 방법 |
|---|---:|---|
| 바른손M카드 | 5 | 공식 상세→preview의 템플릿 배치·서체·영역 JSON |
| 보자기카드 | 5 | 공식 카드 data-mc-sample-url→공개 샘플 설정 |
| 봄카드(필카드 제휴) | 6 | 공식 VIEW 연결→실제 HTML·CSS·Promise 타이핑 코드 |
| 아름 | 5 | 공식 목록→개별 샘플의 본문·섹션·버튼 |
| 살롱드레터 | 6 | 공식 블로그 이미지 링크→단축 URL→공개 HTML |

## 업체별 샘플

### 바른손M카드

| 샘플 | 확인한 차이·구성 | 한계 |
|---|---|---|
| [영화 같은 순간 MC4114](https://mcard.barunsoncard.com/preview/1188) | 전체 높이 사진 위 흰색 이름·일시·장소; 이름은 표지 상부, 날짜/장소는 하부; GIF 레이어 참조(재생 내용 미확인) | public-template-json; 모션/조작 미검증 |
| [마가렛 MC4115](https://mcard.barunsoncard.com/preview/1189) | 표지 상부 사진과 하부 이름·일시 영역 분리; 나눔명조 이름과 중립색 날짜 | public-template-json; 모션/조작 미검증 |
| [행복한 시작 MC4108](https://mcard.barunsoncard.com/preview/1182) | 전체 높이 사진 위 이름·날짜·장소를 하부에 배치; 나눔명조 초대글과 옅은 회색 배경 | public-template-json; 모션/조작 미검증 |
| [Elegant Pearl MC3220](https://mcard.barunsoncard.com/preview/1126) | 사진 아래 정보 영역; 갈색 이름·일시와 따뜻한 초대글 배경 | public-template-json; 모션/조작 미검증 |
| [On The Grass MC4106](https://mcard.barunsoncard.com/preview/1180) | 전체 높이 사진과 흰색 하부 정보; GIF 레이어 참조(재생 내용 미확인) | public-template-json; 모션/조작 미검증 |

이름과 MC 코드는 공식 상품 상세 기준이다. preview 내부 자원 ID가 상품 코드와 다르므로 두 식별자를 같은 값으로 해석하지 않았다. 공통 영역 정의에는 연락·사진·동영상·길·송금·방명록·공유·RSVP·BGM이 있으나, 정의 존재만으로 하객 화면의 활성 기능이라고 판단하지 않았다.

### 보자기카드

| 샘플 | 확인한 차이·구성 | 한계 |
|---|---|---|
| [사랑을 그린 날](https://bojagicard.com/v5/home.php?uid=sample1025&landing_sample=1) | 공식 카탈로그의 별도 표지 스킨; 초대글·사진·위치·연락·방명록·프로필/인터뷰/히스토리 활성화 설정; 계좌·RSVP·음악·공지·달력은 이 샘플 설정에서 비활성 | public-html-config; 모션/조작 미검증 |
| [A new track](https://bojagicard.com/v5/home.php?uid=sample1023&landing_sample=1) | 제목 Georgia·본문 고운돋움 설정; 배경 교대·섹션 순서·연락/계좌 접기 옵션; 방명록 답장 작성자 설정; 갤러리 grid-basic·모서리 square 설정; 진입/배경 효과는 none | public-html-config; 모션/조작 미검증 |
| [Forever Begins](https://bojagicard.com/v5/home.php?uid=sample1021&landing_sample=1) | 공식 카탈로그의 별도 표지 스킨; 초대글·사진·위치·연락·방명록·프로필/인터뷰/히스토리 활성화 설정; 계좌·RSVP·음악·공지·달력은 이 샘플 설정에서 비활성 | public-html-config; 모션/조작 미검증 |
| [Minimal Pearl](https://bojagicard.com/v5/home.php?uid=sample1018&landing_sample=1) | 공식 카탈로그의 별도 표지 스킨; 초대글·사진·위치·연락·방명록·프로필/인터뷰/히스토리 활성화 설정; 계좌·RSVP·음악·공지·달력은 이 샘플 설정에서 비활성 | public-html-config; 모션/조작 미검증 |
| [버건디 러브](https://bojagicard.com/v5/home.php?uid=sample1017&landing_sample=1) | 공식 카탈로그의 별도 표지 스킨; 초대글·사진·위치·연락·방명록·프로필/인터뷰/히스토리 활성화 설정; 계좌·RSVP·음악·공지·달력은 이 샘플 설정에서 비활성 | public-html-config; 모션/조작 미검증 |

5개 모두 기능 활성화 설정을 읽었지만 샘플의 사진 배열이 비어 있다. 1023 이외 4개의 design 값은 null이었다. 1023의 효과는 none이며, 설정 필드가 있다는 이유로 해당 효과의 시각 품질이나 모든 옵션을 확인했다고 하지 않는다. 공식 랜딩의 기능 예시에서 혼주 연락·주차/포토부스 안내·신랑신부 답장·사진 순번·공유를 확인했다. [공식 기능 예시](https://bojagicard.com/card/mobile-card.php).

### 봄카드(제휴 필카드)

| 샘플 | 확인한 차이·구성 | 한계 |
|---|---|---|
| [Fall in love](https://partner.feelcard.co.kr/fall_in_love) | 바둑판 앨범 안내; 혼주 연락 창·계좌 복사/PAY·방명록 전체보기; 로즈 강조색 | public-html-css; 모션/조작 미검증 |
| [Wedding day](https://partner.feelcard.co.kr/wedding_day) | 가로 슬라이드 앨범 안내; 사진 아래 그라디언트 레이어; 네이비 강조·직선형 액션 CSS | public-html-css; 모션/조작 미검증 |
| [Promise](https://partner.feelcard.co.kr/promise) | 바둑판 앨범 안내; 가족 연락을 초대글 앞에 배치; 100ms 간격으로 글자를 추가하는 typing 코드와 커서 CSS; Damion 영문·따뜻한 크림 배경 | public-html-css; 모션/조작 미검증 |
| [Everything](https://partner.feelcard.co.kr/everything) | 가로 슬라이드 앨범 안내; 상하 그라디언트 레이어; 골드 강조·둥근 계좌/연락 액션 CSS | public-html-css; 모션/조작 미검증 |
| [Love motion](https://partner.feelcard.co.kr/love_motion) | 바둑판 앨범 안내; arch 클래스와 중립색 액션 CSS; 명칭만으로 모션을 판단하지 않음 | public-html-css; 모션/조작 미검증 |
| [Lovely day](https://partner.feelcard.co.kr/lovely_day) | 가로 슬라이드 앨범 안내; 살구색 외곽과 흰 내부 프레임 CSS; Pacifico 제목·오렌지 강조색 | public-html-css; 모션/조작 미검증 |

### 아름

| 샘플 | 확인한 차이·구성 | 한계 |
|---|---|---|
| [베이직 1](https://www.areum.co.kr/invitation/basic-1) | 월·일 중심 표지; 공식 목록: 프리텐다드 S; 여섯 교통 분류·공지·양가 계좌; 하객 사진 업로드 기간 종료 문구 | public-page-text; 모션/조작 미검증 |
| [클래식 1](https://www.areum.co.kr/invitation/classic-1) | 영문 월·일·연도 분리 표지; 공식 목록: 리디바탕 L; 사진·영상 올리기 버튼과 공지사항 | public-page-text; 모션/조작 미검증 |
| [아치 1](https://www.areum.co.kr/invitation/arch-1) | 큰 월·일과 이름·시간·홀 표지; 공식 목록: 경복궁 수문장 L; 교통/주차/식사/버스 안내 구분 | public-page-text; 모션/조작 미검증 |
| [포스터 1](https://www.areum.co.kr/invitation/poster-1) | 시간(12:30)과 날짜·이름 표지; 공식 목록: 에스코어드림 S; 연락·달력·갤러리·위치·계좌·방명록 구성 | public-page-text; 모션/조작 미검증 |
| [실링왁스 1](https://www.areum.co.kr/invitation/sealing-1) | wax-seal 이미지와 이름·일시·홀 표지; 공식 목록: 프리텐다드 M; 가족 연락과 달력으로 이어지는 구성 | public-page-text; 모션/조작 미검증 |

[공식 12개 목록](https://www.areum.co.kr/wedding-samples)에서 서로 다른 표지 5종을 선택했다. 서체 이름/크기는 목록의 안내이며 실제 font loaded 상태는 미검증이다. 표지 외 기본 기능은 유사하다. 실제 샘플의 식사·주차·버스 안내는 예시로만 읽었고 우리 예식 정보로 옮기지 않는다. 하객 포토 드롭은 버튼/기간 문구까지 확인했으며 업로드는 실행하지 않았다.

### 살롱드레터

| 샘플 | 확인한 차이·구성 | 한계 |
|---|---|---|
| [공식 샘플 001](https://salondeletter.com/w/sample1_2) | type_j 표지·음악 준비 문구·로딩 SVG 구조; 인터뷰·사진·게스트스냅·교통·계좌·방명록; 원고/사진첩 여러 레이아웃 DOM이 함께 존재 | public-html; 모션/조작 미검증 |
| [공식 샘플 003](https://salondeletter.com/w/fb7i16olnt) | type_i 표지·로딩 구조; 이름 영문 병기·부모 편지·게스트스냅; 10개 사진 번호와 복사/PAY UI | public-html; 모션/조작 미검증 |
| [공식 샘플 004](https://salondeletter.com/w/fpglo0twky) | type_h 표지·로딩·상단 구역 메뉴 구조; 갤러리·인터뷰·교통·게스트스냅·방명록 | public-html; 모션/조작 미검증 |
| [공식 샘플 002](https://salondeletter.com/w/s5lajly1m3) | type_j 표지·로딩 DOM 없음; 게스트스냅·갤러리·교통·계좌·방명록; gallery_portrait DOM 참조 | public-html; 모션/조작 미검증 |
| [공식 샘플 011](https://salondeletter.com/w/id05keatry) | type_j 표지·로딩·상단 구역 메뉴; 피로연 안내·박스형/카드형 안내문 구분; 계좌·방명록·화환 UI | public-html; 모션/조작 미검증 |
| [공식 샘플 014](https://salondeletter.com/w/iojsro5wcc) | type_j 표지·상단 구역 메뉴, 로딩 DOM 없음; 사진 8개 번호와 더보기; 피로연·공지·계좌·방명록 | public-html; 모션/조작 미검증 |

[공식 샘플 블로그](https://blog.naver.com/salondeletter/223882221463)의 이미지 링크를 따라 열었다. 001 등은 이미지 파일의 번호이며 공식 작품명이 아니다. 공개 HTML에는 숨긴 갤러리 레이아웃/팝업이 함께 있어 DOM 존재를 화면 표시로 단정하지 않는다. 로딩 DOM 유무·표지 type·구역 메뉴와 내용 순서 차이는 확인했다. 실제 손글씨/스크롤은 루트 화면 검수가 필요하다.

## 가져올 후보와 현재 조합과의 차이

1. **당일 안내 패스:** 날짜·시간·홀·주소·길찾기를 한 면에 모은 선택 장면. [살롱드레터의 당일 안내 설명](https://www.salondeletter.com/manage/w)을 참고한다. 긴 사진/이야기에서 필요한 정보까지 반복 스크롤하는 부담을 줄인다. 실제 날짜 자동 전환은 별도 정책이며 기본 화면 강제 변경은 하지 않는다.
2. **QR 간직하기:** 지금 선택한 조합 링크를 QR로 내려받는 선택지. [공식 QR 안내](https://salondeletter.com/manage/w/qrcode)는 인쇄 후 연결 유지 흐름을 설명한다. 우리 기능은 외부 서비스에 URL을 보내지 않고 로컬에서 QR을 생성한다. 기존 이미지 안내 카드와 구별한다.
3. **안내 한 장씩 보기:** 이미 확인된 안내를 앞/뒤로 넘기는 레이아웃. 보자기·아름·살롱드레터의 공지 분류를 참고하되 별도 주차/식사/전세버스/포토부스 사실을 만들지 않는다.
4. **표지 정보 위치:** 바른손 상부·하부·사진 아래 정보 분리를 참고해 글자 가독성을 선택으로 분리할 수 있다. 기존 손글씨 원형과 음악을 유지한다.

다음은 후속 설계 대상이다. 보자기의 두 사람 답장은 운영 방명록 API·권한 확장이 필요하다. 아름/살롱드레터의 하객 사진 수집은 기존 두 사람 사진첩과 다른 비공개 수집 기능으로 서버·용량·보관 정책이 먼저 필요하다. RSVP·동영상·두 번째 사진첩은 사용자 이전 선택을 따라 추가하지 않는다.

## 접근 한계와 탐색 기록

- **디얼디어:** [기존 mcard 주소](https://deardeer.kr/mcard/list)는 [LetterB 제휴 목록](https://deardeer.kr/letterb/list)으로 연결된다. 사랑 네 컷, 블랙 네 컷, Polaroid, 코발트 노트, 소프트 레터링 5개를 열었으나 로그인 편집기였다. 독립 샘플로 세지 않았다.
- **보자기:** web 도구의 5개 샘플 접근은 실패했다. 공식 카탈로그의 선언된 샘플 주소를 공개 HTTP GET으로 열어 모두 200과 설정을 확인했다. 카탈로그 디자인 수는 조사 중 달라져 비교 결론에 쓰지 않았다.
- **봄카드:** PC 목록은 web 도구 redirect loop, 모바일 목록은 정상. 공식 page5.js의 샘플 주소 연결을 확인하고 공개 HTTP GET으로 6개 모두 200을 확인했다.
- **살롱드레터:** web 도구에서 공식 블로그/샘플 접근이 제한됐다. 공식 블로그의 공개 HTML 이미지 링크와 리디렉션을 읽어 주소를 확보했다. 출처 없는 샘플 ID를 추측하거나 비공개 API를 요청하지 않았다.
- 업체 홍보의 제공 기능·속도·리뷰 점수와 실제 조작 검증을 구분했다. 무료/가격/수수료 설명을 금융·구매 권고로 사용하지 않는다. 모션 이름이나 GIF 파일이 있다는 사실만으로 실제 모션을 추정하지 않는다.

## 다음

확인된 정보만 사용하는 당일 패스·QR 간직하기·안내 슬라이드 선택지를 조립실에 추가하고, 원래 조합/음악/입력 보존과 QR 디코딩을 검증한다. 운영 청첩장/API/실제 데이터는 변경하지 않는다.

