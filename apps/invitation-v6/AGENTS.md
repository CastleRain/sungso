# Invitation VER6

VER5.6의 사진·서체·손글씨·음악을 보존하며 이야기를 3장으로 통합한 별도 버전. 이전 앱 소스는 수정하지 않는다. 하객 콘텐츠는 공통 UI 색상 규칙의 기존 예외다.

- 사진·사연·일시·장소는 실제 성우/소희 자료만 사용한다. 사용자 지정 가족 임시 표기 ‘아빠·엄마’는 표시한다. 미입력 전화·계좌·식사·주차·피로연·추천 장소는 숨긴다. 사진 설명 입력은 없다.
- 원본의 상용 AbramoSerif/SometimesTimes는 복제하지 않고 OFL Antic Didone, Pinyon과 한글 리디바탕/Hahmlet을 자체 호스팅한다. 원본과 같은 서체라고 설명하지 않는다.
- 공개 사진첩/방명록은 기존 v3 API를 공유한다. 사진 관리는 기존 Google 활성 두 회원만 사용한다. VER5.2 하객 화면에서는 RSVP를 제거했다. 기존 응답 API와 회원 전용 responses.html은 보존한다.
- 영상 없이 사용자 MP3 전체를 반복한다. 자동재생 시도/첫 터치 재생과 명시적 정지를 존중한다.
- source template 변경 후 node apps/invitation-v6/scripts/build.mjs, 루트 npm run check. 서버 변경 시 build:services/Emulator 검사. 320/390/430/1440px와 실제 로컬 동작을 확인한다. 운영 DB에 검증용 데이터를 만들지 않는다.


