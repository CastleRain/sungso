# Local couple QA

`npm run build` 후 `node tests/site/couple-qa-server.mjs`를 실행하고 `http://127.0.0.1:8766/sungso/`를 연다. 다른 포트는 `COUPLE_QA_PORT`로 지정한다. 서버는 loopback에만 바인딩한다.

실제 공통 인증·boot·앱 코드를 사용하되 Firebase SDK를 로컬 대역으로 치환한다. 인증은 탭의 sessionStorage에 유지하며 성우·소희·비회원·로그아웃·권한 회수·다음 저장 실패·다른 기기 홈 편집을 화면 아래 제어판으로 실행한다. Firestore 상태와 트랜잭션 읽기 버전·원자적 쓰기는 프로세스 메모리에만 존재한다. 날짜4·메모11·홈6앱, WeCost 5종 문서와 여행6행 예산·현재/이전 일정·본인 UID별 개인 백업은 가상 데이터다.

기본 Travel/Honeymoon reference는 간단한 가상 자료다. 실제 기존 화면 구조 전체가 필요한 QA는 `QA_PRIVATE_REFERENCE_INPUT` 환경변수에 **이미 Git 제외된 로컬** 마이그레이션 JSON 경로를 명시해 실행한다. 이 모드는 `private_data/travel_reference`와 `private_data/honeymoon_reference` 두 문서만 메모리로 읽으며 실제 회원·재무 문서는 가져오지 않는다. 원본 파일을 수정하거나 payload를 로그·검사 결과·Git에 기록하지 않는다. 이 모드의 화면 캡처는 Git 제외된 개인 QA 폴더에만 보관한다. 서버를 다시 시작하면 모든 대역 변경이 초기화된다.

응답 CSP `connect-src 'self'`·`frame-src 'self'`가 실제 Firebase/검색/통근 연결을 차단한다. HomeHunt 지도는 대역 표시만 하고 위치·지도 타일·통근 공급자 API를 호출하지 않는다. 가상 API는 회원 health/quota 이외의 검색을 503으로 차단한다. `POST /__qa/control`의 fixture-doc은 로컬 메모리 문서를 교체해 실패·충돌 검증에 쓰며 운영 저장과 무관하다.

이 대역은 전체 Firestore 규칙의 복제가 아니다. 실제 보안 허용/거절·권한 범위는 별도의 Emulator 검사로 검증한다. 외부 지도 표시·공급자 경로·실제 계정·실제 배포 확인을 완료한 것으로 기록하지 않는다.
