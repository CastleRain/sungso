# 업체 비교 C — 공개 샘플 5개와 추가 공식 기능 사례

조사일: 2026-10-29. 기준 구현은 [Studio 진행 기록](../PROGRESS.md)의 세부 조절·추가 장면 완료본이다. 원시 구조화 결과는 [providers-c.json](providers-c.json).

## 집계 기준과 결과

**잇츠카드의 실제 공개 청첩장 5개를 확인했다.** FillTheSpace·젠스디자인·메종드마리에는 추가 공식 자료로 분리했다. 이 세 업체에서 각 5개의 실제 완료 샘플을 검증했다고 주장하지 않는다.

| 업체 | 실제 공개 샘플 | 추가 근거 | 이번 확인 수준 |
|---|---:|---|---|
| 잇츠카드 | 5 | 각 상품 페이지의 iframe 연결 | 공개 HTML·텍스트와 섹션/팝업 구조 |
| FillTheSpace | 0으로 집계 | 홈 미리보기·편집기·공식 FAQ | 홈 구성과 설정 DOM, 공식 기능 설명 |
| 젠스디자인 | 0 | 상품 상세 5개 | 제목·상세 이미지 참조·주문 연결 |
| 메종드마리에 | 0 | 공식 기능 소개 | 소개용 시연 UI·문구 |

이번 담당자는 브라우저 조작을 하지 않았다. 별도 root 화면 검수와 구분한다. 샘플에 있는 버튼이 실제 OS 기능으로 연결되는지, 음악·애니메이션이 어떻게 움직이는지, 작성/복사가 성공하는지는 이 문서의 검증 범위가 아니다.

## 잇츠카드: 실제 샘플 5개

각 상품 제목과 iframe 경로를 공식 상품 HTML에서 확인했고, 샘플 HTML은 모두 HTTP 200이었다. MCard41·53은 웹 읽기 도구에서 한글 인코딩 오류가 나서 공개 HTML을 직접 읽었다.

| 샘플 | 실제 관측한 차이 | 확인 경로 |
|---|---|---|
| 모던포토3 (MCard47) | 표지의 이름·예식 정보, 이미지형 구역 제목, roll_type01 갤러리 | [실제 샘플](https://www.itscard.co.kr/mobile/new_m/mcard/minifyHTML/MCard47.asp) · [공식 상품](https://www.itscard.co.kr/script/mcard/new/mcard_view.asp?CardCode=MCard47) |
| 핑크빛 웨딩 (MCard41) | h-100 표지 구조, 이름 사이 접속어, 숫자형 날짜·영문 요일, roll_type01 | [실제 샘플](https://www.itscard.co.kr/mobile/new_m/mcard/minifyHTML/MCard41.asp) · [공식 상품](https://www.itscard.co.kr/script/mcard/new/mcard_view.asp?CardCode=MCard41) |
| 스몰웨딩 (MCard35) | 글자 사이 공간을 둔 한국어 구역 제목, roll_type01 | [실제 샘플](https://www.itscard.co.kr/mobile/new_m/mcard/minifyHTML/MCard35.asp) · [공식 상품](https://www.itscard.co.kr/script/mcard/new/mcard_view.asp?CardCode=MCard35) |
| 결혼합니다 (MCard53) | 한국어 문장형 표지 일시, roll_type01 | [실제 샘플](https://www.itscard.co.kr/mobile/new_m/mcard/minifyHTML/MCard53.asp) · [공식 상품](https://www.itscard.co.kr/script/mcard/new/mcard_view.asp?CardCode=MCard53) |
| 싱그러운날2 (MCard49) | 표지 D-day, type2 갤러리 배열, 별도 확대 갤러리. 다른 4개에 있는 영상 뒤 배너 섹션 없음 | [실제 샘플](https://www.itscard.co.kr/mobile/new_m/mcard/minifyHTML/MCard49.asp) · [공식 상품](https://www.itscard.co.kr/script/mcard/new/mcard_view.asp?CardCode=MCard49) |

공통 구조는 표지 → 초대글/가족 → 당사자·혼주 연락 → 달력 → 갤러리 → 영상 → 위치/교통 → 양가 계좌 → RSVP → 방명록이다. 계좌 팝업·복사 완료창, 이름/비밀번호 방명록·삭제창, 지도/내비 버튼, 전세버스 안내 마크업이 있다. 샘플 5개는 기능 엔진을 공유하고 표지·구역 제목·갤러리 표현이 주로 달라지는 사례다.

**한계:** 연락·문자 링크가 실제 tel/sms 대신 샘플용 `pcAlert()`다. 샘플 UI 존재와 실제 연락 동작을 구분해야 한다. 일부 날짜도 표지와 RSVP 예시가 다르므로 실제 운영 데이터 일관성 사례로 사용하지 않는다.

공식 상품 설명의 글자 크기 확대와 공유 문구 설정은 실사용 편의를 위한 참고다. 해당 편집 설정을 직접 저장한 것은 아니다. 우리 Studio에는 갤러리·교통·계좌·방명록·달력 기능이 이미 있으므로 신규 구현 개수로 다시 세지 않는다.

## 추가 공식 사례: FillTheSpace

- [홈](https://fillthespace.co.kr/): 별도의 두 사람 프로필 사진·짧은 소개가 눈에 띈다. 앨범·날짜·교통·계좌·방명록도 이어진다. 홈에서 세 프리셋을 소개하지만 이를 개별 완료 샘플 5개로 늘려 세지 않았다.
- [편집기](https://fillthespace.co.kr/building): 이름 순서, 사진 편집, 표지, 달력 표시, 글씨체/크기, 배경 효과의 설정 DOM을 확인했다. root는 초기 신규/불러오기 모달이 뒤늦게 본문을 가리는 상태를 확인했다. 신규 생성·불러오기·저장은 하지 않았다.
- [FAQ](https://fillthespace.co.kr/faq): 비율형/격자/회전식 앨범, 달력 마커, KR/EN 등은 **공식 설명**이며 이번에 모두 실행한 기능이 아니다.
- [편집기에 연결된 테스트 경로](https://fillthespace.co.kr/v/sample_invitation?preview=true)는 웹 읽기 실패로 완료 샘플 수에서 제외했다.

새 후보는 짧은 프로필 장면과 달력 강조 형태다. 지도·일정·계좌·카드·셔틀 안내는 기존 구현이나 데이터가 필요한 항목으로 분류한다.

## 추가 공식 사례: 젠스디자인

[공식 목록](https://www.gensdesign.co.kr/product/list.html?cate_no=25)에서 다음 5개 상품을 직접 읽었다.

| 공식 상품 | 관측 | 한계 |
|---|---|---|
| [메리골드](https://www.gensdesign.co.kr/product/메리골드/203/category/25/display/1/) | 상품 제목·상세 이미지 참조·주문 연결 | 실행 샘플 미확보 |
| [릴리](https://www.gensdesign.co.kr/product/릴리/188/category/25/display/1/) | 상품 제목·상세 이미지 참조·주문 연결 | 실행 샘플 미확보 |
| [러브 에세이](https://www.gensdesign.co.kr/product/러브-에세이/157/category/25/display/1/) | 상품 제목·상세 이미지 참조·주문 연결 | 실행 샘플 미확보 |
| [그린브리즈](https://www.gensdesign.co.kr/product/그린브리즈/181/category/25/display/1/) | 상품 제목·상세 이미지 참조·주문 연결 | 실행 샘플 미확보 |
| [너는 나의 봄](https://www.gensdesign.co.kr/product/너는-나의-봄/180/category/25/display/1/) | 상품 제목·상세 이미지 참조·주문 연결 | 실행 샘플 미확보 |

주문 게시판을 열거나 제출하지 않았다. 상품 이미지를 실제 애니메이션 검증의 근거로 사용하지 않았다. 이 5개는 공개 샘플 5개 요건을 채우지 않는다.

## 추가 공식 사례: 메종드마리에

[공식 소개](https://maisondemarie.co.kr/)에 사진 밝기·대비·채도와 글씨 크기·간격·위치 조절 시연 UI가 있다. 앨범·계좌·지도·오프닝에 관한 설명도 제공한다. 실제 완료 청첩장 5개나 편집 후 결과를 확인하지 못했으므로 **공식 기능 소개**로만 분류했다.

기존 Studio의 서체·색 선택에 더할 실용적인 후보는 사진 초점/밝기와 본문 크기/행간/자간이다. 소개 화면 수치를 그대로 복제할 필요는 없으며 우리 사진·한국어에 맞는 작은 범위가 적절하다.

## 기존 구성과 비교한 새 후보

| 후보 | 기존과 다른 점 | 권장 적용 | 필수 검증 |
|---|---|---|---|
| 표지 사진 초점·밝기 | 사진은 고정이고 표현만 선택하던 구조 보완 | 위/중앙/아래 초점과 제한된 밝기 조절을 저장 | 얼굴·이름 가독성, 다양한 폭, 원본/음악 노드 보존 |
| 본문 크기·행간·자간 | 서체 선택과 별개의 읽기 편의 | 의미가 쉬운 프리셋과 작은 조절 범위 | 긴 한국어·모달·계좌·44px 조작 영역, URL 왕복 |
| 두 사람 프로필 | 긴 이야기 대신 짧은 소개 | 자료 입력 후 켜는 선택 장면 | 임의 MBTI·나이·사연 생성 금지, 이야기 중복 방지 |
| 달력 날짜 표시 | 날짜 레이아웃과 별개인 강조 모양 | 원·작은 하트·밑줄 등 | 숫자 가독성·정확한 날짜·모션 감소 |
| 원본 비율 앨범 | 스택/필름/격자 밖의 배열 | masonry 추가 검토 | DOM/키보드 순서·선택 사진 유지·이미지 지연 |

이 표는 조사에서 도출한 구현 제안이며 타 업체의 모든 기능을 실제 실행했다는 뜻이 아니다. RSVP는 기존 사용자 제외 요청을 유지한다. 결혼식 정보가 없는 연락처·교통편·송금 링크나 꽃배달을 임의로 추가하지 않는다. 기존 하객 안내·체크리스트·초대 카드·감사 인사를 신규 기능으로 중복 집계하지 않는다.

## 진행 상황

- 실제 공개 샘플 5개와 추가 공식 사례 3개 업체를 구분해 기록했다.
- 앱 소스·배포·운영 데이터 변경은 없다.
- 다음: 사진 가독성과 본문 읽기 조절부터 선택 기능으로 구현하고 실제 시연·저장·반응형 검증을 진행한다.

