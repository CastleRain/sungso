# VER6.1 F / G · 빌드와 비교실 점검

확인일: 2026-10-28. 로컬 주소: `http://127.0.0.1:8032/lab/experience/`.

## 기존 버전 보존과 배포 경계

- 이전 공개 산출물 177개를 `baseline.json`에 크기·SHA-256·줄바꿈 형식과 함께 기록했다. 기준 소스는 `49f1c04`다.
- 전용 빌드는 기존 루트 VER5.6, `/v6/` VER6.1, `/lab/v6-1/` A–E의 177개 파일이 모두 같아야 성공한다. 줄바꿈 정규화만 원래 공개 형식으로 복원하며 내용 변경은 실패한다.
- 이번 산출물은 205개, 추가 파일 28개는 전부 `/lab/experience/` 아래에 있다. 전용 빌드 성공과 보존 검사를 확인했다.
- F/G는 빌드 시 고정된 demo 모드다. 자기 시안의 기기별 방명록과 예시 계좌만 사용하며 기존 운영 데이터·서버·관리 인증은 수정하지 않는다. CSP의 `connect-src 'self'`, `form-action 'none'`를 유지한다.
- 새 canonical·Open Graph URL·ICS는 `/lab/experience/f/`, `/lab/experience/g/`로 연결한다. 관리·소스·테스트·다른 앱 하위 경로는 제공하지 않는다.
- 이미지 저장 기능의 허용 URL과 팔레트도 F/G로 분리했다. 이전 A–E URL이나 다른 앱 주소는 이미지 생성 입력으로 거부한다.

## 검사

- `node --test tests/site/invitation-experience-build.test.mjs tests/site/invitation-lab-build.test.mjs tests/site/invitation-vercel.test.mjs`: 10개 통과. 첫 sandbox 실행에서는 localhost 연결이 EACCES였고, 권한 범위를 허용한 동일 검사로 모두 통과했다.
- 비교실 실제 브라우저의 320×720, 390×844, 1440×900에서 가로 넘침이 없었다. 320px에서 섹션 링크는 최소 44×44px다.
- 두 비교 이미지 로딩·웹폰트 loaded를 확인했다. F의 날짜 링크는 `/f/#wedding-day`, G의 길안내 링크는 `/g/#location`으로 이동했다. 브라우저 기록의 오류·경고는 없었다.
- 검토한 화면은 `catalog-qa/01-390-top.png`, `02-320-bottom.png`, `03-1440-top.png`에 보관했다. 이미지 파일은 캡처한 그대로 확인했다. 이후 섹션 링크 최소 너비를 44px로 보완했다.
- 초기 리소스 산정은 `measure-resources.mjs`, 결과는 `resource-budget.json`이다. 각 시안은 약 1.29MB(HTML/CSS/선택 모듈 gzip + 표지·글꼴 raw), JavaScript gzip 약 33KB다. 기준 1.8MB/150KB 안이다.

## 범위와 한계

이 문서는 전용 빌드와 비교실을 다룬다. 본문 모션·사진첩·계좌·방명록의 동작 점검은 담당자의 별도 기록을 따른다. 리소스 산정은 실제 네트워크 전송량이나 LCP/CLS/저사양 휴대폰 FPS 측정이 아니다. 이 단계에서는 원격 배포·실기기 지도 앱·OS 공유를 확인했다고 주장하지 않는다. 운영 데이터 검증 쓰기는 0회다.
