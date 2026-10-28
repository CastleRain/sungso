# 발자취 비공개 저장

GitHub Pages의 발자취 화면은 기존 Render Free API를 호출한다. Firebase Admin은 기존 Google 로그인·활성 회원 검사 후에만 `journey_private/shared` 아래 자료를 읽거나 쓴다. 규칙의 기본 거부로 브라우저 직접 Firestore 접근은 두 회원에게도 허용되지 않는다. 기존 청첩장 공개 사진첩·계좌·다른 앱 저장소는 사용하지 않는다.

## API

기본 경로는 `/api/journey/v1`, 매 요청에 `Authorization: Bearer <Firebase ID token>`을 보낸다. JSON 쓰기는 `Content-Type: application/json`이다. 모든 응답은 `private, no-store`다.

| 요청 | 입력 | 성공 응답 (`ok:true` 포함) |
| --- | --- | --- |
| `GET /months` | 없음 | `months` 내림차순, `latestDate` 또는 null |
| `GET /months?month=YYYY-MM` | 월 | `month`, `days` 날짜별 요약 |
| `GET /playback?from=YYYY-MM-DD&to=YYYY-MM-DD&after=YYYY-MM-DD` | 시작·끝 날짜, 선택적 이전 페이지 마지막 날짜 | `days` 날짜 오름차순 재생 후보, `nextCursor` 또는 null |
| `GET /days/YYYY-MM-DD` | 날짜 | `day`; 없으면 빈 revision 0, 저장하지 않음 |
| `PUT /days/YYYY-MM-DD` | `{expectedRevision,day}` | `{day,changed,unchanged}` |
| `POST /days/YYYY-MM-DD/import` | `{source,records,tracks}` | `{day,changed,unchanged,addedRecords,addedTracks,duplicateRecords,duplicateEdges}` |
| `POST /photos` | `{id,full,thumb}` (v4 UUID, JPEG data URLs) | `{photo:{id,width,height},unchanged}` |
| `GET /photos/:id?size=thumb` | `thumb` 기본값 또는 `full` | 인증된 JPEG 바이트 |

날짜·시각·출처 계약은 `shared/journey/core.mjs`가 서버와 브라우저에 공통이다. 날짜는 한국 시간 기준, 정확한 시각을 모르면 `time:null,timePrecision:'day'`로 저장한다. `PUT`은 가져온 출처·경로·기록의 원본 구분을 보존하고 기존 기록을 누락시키는 요청도 거부한다. 수동·사진 기록을 추가하고 기존 기록의 장소·메모·사람·시각·위치를 보완할 수 있다. 다른 기기의 변경과 충돌하면 `409 JOURNEY_CONFLICT`이고 입력을 덮어쓰지 않는다. 이미 저장된 것과 같은 요청은 오래된 revision의 재시도여도 쓰지 않는다. 삭제 API는 없다.

재생 조회는 실제 저장된 `days` 문서만 기본 문서 ID 색인으로 읽는다. 한 페이지는 최대 31일·2MiB이며 다음 페이지는 `nextCursor`를 `after`로 보내 요청한다. 응답의 후보에는 날짜·revision·사람·장소·확인된 시각/좌표·원본 기록/경로 ID만 포함하고 메모·사진 바이트·파일명·해시·UID는 제외한다. 후보 선정과 구간 준비는 `shared/journey/playback-core.mjs`를 공통으로 사용한다. 날짜/기간/커서를 검증하고 조회로 장부·날짜 문서를 생성하거나 마이그레이션하지 않는다. 한 날짜의 후보가 응답 한도를 넘으면 `413 PLAYBACK_DAY_TOO_LARGE`로 알린다.

## 저장과 무료 요금제 한도

- 루트 문서: 월 목록·최신 날짜·날짜 수·총 날짜 JSON 바이트·사진 UUID/해시/바이트 장부. 스캔 없이 한도를 검사한다.
- `days/{date}`: `{schema:1,data:<하루 JSON 문자열>,updatedAt,updatedBy}`. 큰 경로를 한 JSON 문자열로 보관하여 자동 색인에서 경로점마다 항목을 만드는 일을 피한다. API는 검증된 객체로 돌려주며 내부 UID는 반환하지 않는다.
- `months/{YYYY-MM}`: 달력 요약. 날짜·월·루트 장부 변경은 같은 트랜잭션이다.
- `photos/{UUID}`: 메타데이터 제거된 JPEG 본문·썸네일 base64와 크기. UUID 재시도는 해시가 같으면 추가 문서·추가 용량이 발생하지 않는다. 같은 UUID로 다른 사진을 덮어쓸 수 없다.
- 하루 JSON 최대 600KiB, 기록/경로 각각 1,000개, 경로점 합계 12,000개, 출처 500개. 전체 날짜 JSON 최대 160MiB·날짜 10,000개.
- 사진 최대 400장·base64 문자열 합계 160MiB. 사진 본문은 data URL 360,000자·긴 변 1,600px 이하, 썸네일은 60,000자·480px 이하. 요청은 440,000바이트 이하. 실제 원본 해상도와 Exif는 보관하지 않는다.
- 회원별 요청은 10분 동안 600회. 기존 Render 동시성·요청 큐 상한을 유지한다. API 한도는 이 기능의 증가량을 제한하며, Firebase 전체 프로젝트의 다른 데이터·색인·읽기/쓰기와 무료 할당량을 공유한다.

사진을 먼저 업로드하고 그 UUID를 날짜 기록에 연결한다. 업로드 성공 후 날짜 저장 전에 취소한 사진은 비공개로 남고 보관 한도에 포함된다. 업로드 응답을 받지 못해도 같은 UUID로 재시도해야 중복 보관을 피할 수 있다. 자동 삭제는 하지 않는다.

원본 타임라인·사진·운영 DB는 검증에 사용하지 않는다. `node --test services/journey/tests/journey.test.mjs`는 메모리 Firestore와 localhost HTTP를, `services/homehunt/cloud/tests/couple-site-rules.test.mjs`는 `demo-homehunt`의 클라이언트 차단을 검사한다. 같은 Cloud 테스트 폴더의 `journey-persistence.test.mjs`는 localhost에 고정한 실제 Admin SDK로 사진·날짜 저장/재조회, 가져오기 재시도, 동시 수정·사진 업로드의 원자성을 확인한다. 배포 전 루트 검사와 서비스 빌드·Emulator를 실행한다.
