# 개인 자료 이전 도구

이 폴더의 코드는 비밀값과 개인 payload를 포함하지 않는다. 작업 입력·백업·실행 증거는 Git에서 제외한 로컬 폴더에 둔다. 운영 자격증명은 외부에서 전달하고 토큰·UID·이메일·문서 내용·파일 링크를 출력하지 않는다.

1. `extract.mjs SOURCE_CHECKOUT PRIVATE_OUTPUT`는 검토한 **변경 전** 소스에서 여행·리조트 기준 데이터를 추출한다. 소스 1차 복사와 PDF 복사의 SHA-256을 원본과 비교한 뒤 manifest·비민감 건수/해시 증거를 만든다. 현재 코드의 빈 기본값으로 다시 실행하지 않는다.
2. `appendWeCostDefaults(sourceFilename, manifestFilename)`는 변경 전 WeCost settings/savings를 복구 입력에 추가한다. 기존 문서는 항상 우선한다.
3. `createFirestoreRest({projectId,getAccessToken})`에 외부 Admin 토큰 공급 함수를 주입한다. `backupPrivateDatabase(client, outputDirectory)`로 현재 개인 컬렉션과 하위 컬렉션을 읽고 기록한다. 부모가 없는 댓글도 보관한다. 발견한 미분류 컬렉션은 검토하여 개인 자료이면 allowlist에 추가하고 백업을 다시 한다. 서버 공공 캐시·사용량 장부는 임의 변경하지 않는다.
4. `dryRunMigration(client,{manifestPath,outputDirectory})`는 검증된 백업 해시를 확인하고 생성/보존 건수만 반환한다. 저장소에 이미 있는 모든 값이 source 기본값보다 우선한다.
5. 검토한 `dryRunSha256`을 명시해 `applyMigration(client,{manifestPath,outputDirectory,expectedDryRunSha256})`을 실행한다. 백업·manifest·dry-run 변경은 거부한다. 기존 문서에 쓰지 않으며 새 문서만 `exists:false` 전제조건을 걸어 한 번의 원자 commit으로 만든다. 생성 후 데이터 해시를 다시 읽어 비교한다. 동시에 새로 생긴 문서는 보존하고, 전제조건 충돌은 새 백업/검토 후 재시도한다.

`private_data/travel_reference`와 `private_data/honeymoon_reference`는 `{schemaVersion:1,payload:string}`이다. JSON 문자열은 링크 튜플처럼 중첩 배열이 있는 기존 형태를 보존한다. 회원만 읽고 Admin만 쓴다. 기존 `itineraries/honeymoon_2027`, `itineraries/main`, 예산과 이력을 다른 문서로 합치거나 덮어쓰지 않는다. 브라우저에는 보호된 기준 자료가 없을 때 운영 값을 대신 쓸 개인 기본값이 없다.

2026-09-13 사용자는 PDF의 GitHub 보존을 선택했다. 기존 PDF 10개와 공개 URL·뷰어를 유지하며 Drive 이전은 이번 실행에서 하지 않는다. 이 예외는 개인 PDF 보호가 완료됐다는 뜻이 아니다. 현재 공개 PDF와 과거 Git 이력의 자료 노출은 별도 후속 작업이다. 폐기되지 않은 과거 Naver 자격증명도 별도로 교체해야 한다. 유효 여부 확인을 위한 공급자 호출은 하지 않는다.

검증은 `node --test tests/private-migration.test.mjs tests/trip-core.test.mjs tests/trip-store.test.mjs`를 사용한다. 전부 인공 데이터·메모리 SDK 대역이며 운영 저장을 실행하지 않는다. 실행 스크립트는 외부 비밀값의 형식이나 저장 위치를 공개 코드에 고정하지 않는다.
