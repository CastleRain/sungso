# 성우 · 소희 — Invitation VER3.2

사용자가 선택한 Porto의 사진 위 필기체·작은 이름/날짜·여백, 화이트와 블루를 유지한 공개 청첩장. URL: https://castlerain.github.io/sungso/invitation-v3/

앱 폴더에서 npm run build / npm test / npm run dev -- --port 8024. 내용 원본은 js/config.mjs, 생성 HTML은 src/index.template.html과 scripts/build.mjs에서 갱신한다. 루트 config/apps.json 등록으로 Pages에 배포한다.

- 여섯 장의 사용자 사진, 장면 필터, 확대·키보드/스와이프·썸네일 선택·웹 사진 저장. 원본 인물/사진색은 변경하지 않는다.
- 영문 Pinyon Script 손글씨, 한글 고운바탕, 숫자/영문 안내 Cormorant Garamond를 자체 호스팅한다. 공식 원본을 WOFF2로 압축했으며 라이선스는 assets/fonts에 둔다. Porto의 Dulcinea와 같은 폰트라고 설명하지 않는다. 숫자는 바뀌는 자리만 롤링하며 효과 끄기·모션 감소·정지/복귀를 따른다. 날짜/축하/공유/방명록 액션은 손글씨와 한글 설명으로 표시하고 채운 도형 버튼을 사용하지 않는다.
- 사용자 요청으로 YouTube 및 연결 음악 플레이어·API 요청을 제거했다. 외부 영상은 생성/로드하지 않는다.
- 네이버 지도·카카오맵·TMAP을 공식 사이트 아이콘으로 표시한다. 카카오 실제 장소24484800과 약도는 지연 로드. TMAP은 설치 앱 검색/주소 복사 안내를 제공하며 실제 휴대전화 앱 전환은 별도 검증 대상이다.
- 방명록: 이름/메시지 공개 동의 후 서버에 저장. 다른 하객도 목록을 읽고, 작성 기기의 토큰으로 자기 글을 삭제한다. 가입/사진 업로드 없음. 구현과 한도는 services/invitation/README.md. 미리보기는 별도 JSON 저장소로 표시하며 운영 DB에 검증 메시지를 쓰지 않는다.
- 양가 본인/부모 계좌 슬롯은 은행·예금주·번호를 받은 항목만 공개한다. 현재 모두 빈 상태여서 전체 섹션/메뉴를 숨긴다. 문답/약속과 부모 이름도 만들지 않는다.
- JavaScript가 없어도 예식 정보·초대글·달력·사진·외부 지도 링크는 보인다. 방명록과 숫자 모션은 JavaScript가 필요하다.

검증: design-qa.md. 공식 폰트: https://github.com/google/fonts/tree/main/ofl/pinyonscript · https://github.com/google/fonts/tree/main/ofl/gowunbatang · https://github.com/google/fonts/tree/main/ofl/cormorantgaramond
