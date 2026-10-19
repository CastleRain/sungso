# 성우 · 소희 — Invitation VER3.1

사용자가 선택한 Porto의 사진 위 필기체·작은 이름/날짜·여백, 화이트와 블루를 유지한 공개 청첩장. URL: https://castlerain.github.io/sungso/invitation-v3/

앱 폴더에서 npm run build / npm test / npm run dev -- --port 8024. 내용 원본은 js/config.mjs, 생성 HTML은 src/index.template.html과 scripts/build.mjs에서 갱신한다. 루트 config/apps.json 등록으로 Pages에 배포한다.

- 여섯 장의 사용자 사진, 장면 필터, 확대·키보드/스와이프·썸네일 선택·웹 사진 저장. 원본 인물/사진색은 변경하지 않는다.
- 영문 Pinyon Script와 한글 SUIT를 자체 호스팅한다. Porto의 Dulcinea와 같은 폰트라고 설명하지 않는다. 표지의 단어별 필기체 리빌·다시 보기, 섹션 등장·읽기 진행률·카운트다운·달력·축하 하트. 효과 끄기와 기기 움직임 줄이기를 따른다.
- 음악은 사용자가 지정한 https://www.youtube.com/watch?v=yhAJdMuR55c 공식 표시 플레이어. Ever After, Us라는 사용자 지정 곡명으로 선택 영상 전체를 반복한다. 소스는 NUUM FM 웨딩 플레이리스트이며 곡 단독 파일/구간 확인 없이 음원을 추출하지 않는다. 최초 클릭 후에만 API/플레이어를 불러오며, 재생·정지·음량·오류 상태를 연동한다. 240px 높이의 실제 영상을 음악 섹션에 표시한다. 페이지가 숨겨지면 정지한다. 별도 음원 파일을 제공받으면 정당한 파일 소스로 교체할 수 있다.
- 네이버 지도·카카오맵·TMAP을 공식 사이트 아이콘으로 표시한다. 카카오 실제 장소24484800과 약도는 지연 로드. TMAP은 설치 앱 검색/주소 복사 안내를 제공하며 실제 휴대전화 앱 전환은 별도 검증 대상이다.
- 방명록: 이름/메시지 공개 동의 후 서버에 저장. 다른 하객도 목록을 읽고, 작성 기기의 토큰으로 자기 글을 삭제한다. 가입/사진 업로드 없음. 구현과 한도는 services/invitation/README.md. 미리보기는 별도 JSON 저장소로 표시하며 운영 DB에 검증 메시지를 쓰지 않는다.
- 양가 본인/부모 계좌 슬롯은 은행·예금주·번호를 받은 항목만 공개한다. 현재 모두 빈 상태여서 전체 섹션/메뉴를 숨긴다. 문답/약속과 부모 이름도 만들지 않는다.
- JavaScript가 없어도 예식 정보·초대글·달력·사진·외부 지도 링크는 보인다. 방명록/음악은 JavaScript가 필요하다.

검증: design-qa.md. 공식 폰트: https://github.com/google/fonts/tree/main/ofl/pinyonscript · https://github.com/sun-typeface/SUIT
