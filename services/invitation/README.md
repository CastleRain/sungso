# Wedding guestbook API

기존 Render Free Node 서버에서 /api/invitation/v3/guestbook만 별도 공개 처리한다. 별도 호스팅·Firebase 요금제·Storage·신규 비밀키가 필요하지 않다. Render 배포는 master의 services/invitation/server 변경으로 진행된다.

GET은 최신 10개, next UUID로 다음 페이지를 읽는다. POST는 name(20자), text(300자/8줄), 공개 consent:true, 랜덤 clientId/requestId UUIDv4, deleteToken 32바이트 hex를 받는다. 동일 요청 재시도는 같은 글을 반환한다. DELETE /UUID는 같은 deleteToken을 요구한다. 반환 DTO는 id/name/text/createdAt뿐이다.

하루 기준 Asia/Seoul. 전체300개·하루100등록·기기당3개·60초 간격. 메모리 네트워크 요청 한도는 시간당 읽기120/쓰기12. 악성 요청은 오류를 반환하며 본문·토큰·IP를 로그에 기록하지 않는다. 공개 사용자 등록이라 본인 인증/스팸 완전 방지는 제공하지 않는다.

Firestore wedding_guestbooks/sungso_20270306 문서는 서버 Admin만 접근한다. 문서 안 messages 배열의 대상 id를 Firebase Console에서 제거하면 운영자가 부적절한 글을 관리할 수 있다. daily/visitors 한도는 보존한다. 기존 개인 문서는 읽지 않는다. 추후 행사 후 해당 전용 문서의 보관/삭제 시점을 사용자와 정한다.

로컬: apps/invitation-v3의 npm run dev가 8024 정적 사이트와 8025 JSON 방명록/앨범을 함께 시작한다. 앱 .local/invitation-preview-store.json은 Git·배포에서 제외되고 화면에 미리보기 표시가 있다. 운영 확인은 GET만 사용한다.


## Couple album API

`/api/invitation/v3/album` GET은 공개 선택 목록만 읽는다. `GET /photos/{UUID}/full|thumb`은 공개 목록 안의 사진에만 JPEG를 반환한다. `full?download=1`은 사진 저장용 attachment 응답이다. `GET /manage`, `GET /manage/photos/{UUID}/full|thumb`, `POST /upload`, `PUT /publish`는 기존 createSiteMemberGate로 Google 토큰·승인 멤버 역할을 검증한다.

Firestore `wedding_albums/sungso_20270306`과 `photos/{UUID}`만 Admin으로 사용한다. 업로드는 비공개 보관함에 저장하고 명시적 publish에서만 노출한다. 메타 revision으로 동시 편집과 늦은 재시도를 보호한다. 공개 20장/보관 60장, 이미지 full DataURL 360,000자/thumbnail 60,000자, 업로드 JSON 440,000바이트/목록 12,000바이트. JPEG 마커/크기/비율을 검사하고 APP 메타데이터를 제거한다. 읽기는 문서를 만들지 않는다.

공개 목록 캐시 15초, 이미지 메모리 캐시 24개, 하객 JPEG max-age 60초. 이미지 응답 전에 현재 공개 선택 여부를 확인한다. UID/해시/보관함은 공개하지 않는다. 요청 한도는 멤버180회/10분, 하객600회/10분이며 원 IP를 저장하지 않는다. 기존 Node 동시성2/대기8을 유지하고 화면은 업로드 썸네일을 2개씩 요청한다. Firestore 클라이언트 규칙·Firebase 요금제·Storage·회원 허용 범위는 변경하지 않는다.
