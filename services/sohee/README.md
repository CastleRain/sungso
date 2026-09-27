# 비공개 매출 원본 갱신 서비스

Firebase Spark를 유지하는 로컬 Node/Python 서비스다. Functions나 Render를 새로 배포하거나 과금 설정을 변경하지 않았다. `services/sohee`를 정적 배포에 넣지 않는다.

## 현재 가능한 흐름

사용자가 필요할 때 이 컴퓨터에서 토스 열기 → 새 매출 원본 ZIP 받기 → 공통 회원 로그인 → ZIP 선택·실제 추출 시각 입력 → 로컬에서 새 원본 검증 → 교체 날짜 범위 확인 → 명시적 Firebase 저장.

사용자가 선택한 운영 방식은 **실행할 때마다 로컬에서 수동 수집**이다. 예약·백그라운드 수집·토스 Open API 연동을 후속 필수 작업으로 두지 않는다. 앱 시작·서버 시작·분석 재조회는 수집을 실행하지 않는다. 페이히어는 과거 자료만 보존하며 앞으로 토스만 갱신한다. [수동 갱신 절차](manual-update.md)를 따른다.

서버는 매 요청 Google ID 토큰의 검증 이메일·Google provider와 서버의 활성 `site_members` 역할을 확인한다. Admin SDK는 규칙을 우회하므로 이 검사를 제거하지 않는다. 원본 검증 후·저장 전에도 회원을 다시 확인한다. 비밀키·ZIP 암호·원본 수치·추적 오류를 로그나 공개 응답에 넣지 않는다.

`prepare`는 Git 제외된 `sohee/runtime/candidates/`에만 후보를 만든다. 기존 원본·정리 자료를 직접 수정하지 않는다. 30분 만료·동시 검증 1개·후보 3개·ZIP 15MB·분석 180초 제한을 둔다. 암호는 요청/자식 프로세스 메모리에만 존재한다. 분석 실패는 기존 Firestore와 아카이브에 영향을 주지 않는다.

`commit`은 검증한 사용자 본인의 후보만 받는다. 로컬 버전별 원본/정리 자료를 준비한 뒤 Firestore에 크기가 제한된 조각을 저장하고 트랜잭션으로 현재 포인터를 전환한다. 원본 SHA-256 기반 동일 버전은 멱등이며 revision 충돌·더 오래된 원본·기간 후퇴를 막는다. 예전 버전은 삭제하지 않는다. 조각 저장 중 실패하면 현재 포인터는 유지된다.

기존 `process_sales.py`와 통합 `build_data.py`를 재사용했다. 날짜 교체·음수 취소·집계 기준/공백 검사에 추가로 조회 범위 밖 행·예전 부분일 예측 제외·거래 없는 마지막 날 범위·빈 변화 후보를 보완했다. 대량 주문 월별 영향은 새 정리 자료로 다시 계산하고 과거 아메리카노 비교는 원래 기간을 유지한다.

## 실행 환경

```sh
npm ci --prefix services/sohee
# Python: pandas, numpy, openpyxl
node services/sohee/server.mjs
```

환경변수:

- `SOHEE_PRIVATE_ROOT`: 원본을 보관하는 비공개 `sohee/` 절대 경로. 기본은 루트에서 실행한 `sohee`.
- `SOHEE_PYTHON`: 필요한 패키지가 설치된 Python 실행 파일.
- `SOHEE_ALLOWED_ORIGIN`: 기본 `http://127.0.0.1:4177`.
- `PORT`: 기본 8791. 서버는 `127.0.0.1`에만 바인딩한다.
- 기존 안전한 ADC를 사용한다. 이 PC의 기존 Firebase CLI 로그인을 재사용하려면 `SOHEE_FIREBASE_CLI`에 설치된 `firebase-tools` 패키지 디렉터리의 절대 경로를 지정한다. 새 키 파일을 만들지 않고 메모리에서만 인증한다. 자격증명 파일이나 실제 값은 앱·Git·문서에 넣지 않는다.
- `SOHEE_WRITES_ENABLED=1`: **별도 운영 승인 후에만** 설정한다. 기본은 저장 금지다. localhost Emulator에서는 테스트 저장을 허용한다.

운영 프로젝트는 `sungso-358cb`로 고정한다. `FIRESTORE_EMULATOR_HOST`가 설정되면 loopback과 `demo-homehunt`만 허용한다. 네트워크 인증은 운영 프로젝트를 대상으로 임의 테스트하지 않는다.

## 최초 이전

```sh
node services/sohee/migrate.mjs
```

기본은 **dry-run**이다. 실제 ZIP/XLSX의 원본 해시·일별/월별/메뉴 합계를 검증하고 민감한 값 없이 통과 여부만 출력한다. `runtime/local-current.json`이 있으면 해시가 일치하는 최신 로컬 버전을 선택하고 과거 원본도 함께 검증한다. 초기 적용은 검토 후 `--apply`를 사용하며, 다른 현재 버전이 이미 있으면 기본적으로 덮어쓰지 않는다. 후속 명시적 갱신은 검토한 이전 해시를 `--expected-version`으로 지정한다. 원본과 Firebase의 기존 버전을 보존한다. 운영 적용 전에 현재 포인터를 비공개 폴더에 백업한다.

## Open API 참고 — 현재 사용하지 않음

2026-09-27 확인: [토스 상세 요금 안내](https://docs.tossplace.com/guide/getting-started/pricing.html)는 **2026-12-31까지 Open API 월 0원**, 기본 정책 매장당 월 5,000원(VAT 별도), 2027년 변경 가능성을 명시한다. [개요 페이지](https://docs.tossplace.com/guide/start.html)는 기본 요금만 표시하므로 면제 기간은 상세 요금 페이지를 기준으로 읽는다. [공식 FAQ](https://docs.tossplace.com/faq.html)는 일반 사장님이 직접 키를 받는 방식 대신 솔루션 파트너 앱을 설치하도록 안내한다.

이 구현의 갱신 버튼은 **새 ZIP 원본 업로드**다. 토스 API를 자동 호출하거나 비공개 POS API를 스크래핑하지 않는다. 아래 요금·파트너 조건은 이전 조사 참고이며 수동 수집의 선행 조건이 아니다. 사용자가 별도로 방향을 바꾸지 않는 한 API 연동을 추진하지 않는다.

현재 서비스는 비공개 원본을 가진 한 PC에서만 실행한다. 공개 GitHub Pages는 Firebase의 저장된 분석만 읽으며 `/api` 요청이나 원본 업로드를 하지 않는다. Codex에 갱신을 요청하면 이 PC에서 수집·검증·명시적 저장을 실행한다. 원격 서버·새 요금제·예약 수집은 사용하지 않는다.

## 검증

```sh
npm test --prefix services/sohee
python3 services/sohee/tests/import_pipeline.py
SOHEE_PYTHON=python3 node services/sohee/tests/full-import.mjs
```

합성 XLSX/ZIP과 임시 폴더를 사용하며 실제 매출 파일을 읽거나 수정하지 않는다. 기존 서비스와 새 매출 규칙의 Emulator 명령은 [화면 검증 기록](../../apps/sohee/sales/verification.md)을 따른다.
