# HomeHunt 클라우드 저장·검색 서버

## 현재 구성

화면은 기존 [GitHub Pages](https://castlerain.github.io/sungso/homehunt/)에 유지한다. Firebase Authentication의 Google 로그인과 Firestore로 **허용 계정의 개인 기록 백업**을 제공한다. 기존 페이지 접근 코드는 서버 인증으로 사용하지 않는다.

2026-09-08 확인 시 `sungso-358cb`는 Spark 무료 플랜이며 Firestore 위치는 서울(`asia-northeast3`)이다. Google 로그인과 실제 Pages·localhost 도메인 설정을 적용했다. **검색 서버 코드는 준비했지만 Functions는 배포하지 않았다.** 현재 공개 API 주소는 비워 두며, 로컬 검색은 기존 8787 서버를 사용한다. Functions 배포에는 Blaze 전환이 필요하고 요금제는 자동 변경하지 않는다. [Firebase 설명](https://firebase.google.com/docs/functions/faq-and-troubleshooting)

**배포 확인:** 2026-09-08 KST, 릴리스 `5978806`의 [Pages 배포](https://github.com/CastleRain/sungso/actions/runs/34151237385)가 성공했다. 공개 4.4.0 HTML·클라우드 모듈·CSS는 HTTP 200이며 실제 화면에서 지도·저장 UI·온라인 검색 미배포 표시를 확인했다. 로컬 화면의 실제 Google 로그인·새로고침 유지·비공개 백업과 저장 전 교체 취소를 검증했고, 관리자 조회로 회사 조건 보존·경로/점수/공급자 좌표 미저장을 대조했다. 일반 테스트 694개, 실제 Firestore Emulator 보안 테스트 16개를 통과했으며 운영 Firebase의 무로그인 개인 기록·회원·경로 캐시 읽기는 모두 403이었다. 이번 작업의 실제 통근 원호출은 0회다.

| 자료 | 저장 위치·재사용 |
|---|---|
| 회사명·입력 주소·비중·시간 제한·예산 | 로그인한 계정의 Firestore 백업 |
| 방문·관심 단지·개인 주차 확인값 | 같은 백업에 포함. 금융 원장·WeCost 전체 자료는 포함하지 않음 |
| 지도 공급자가 조회한 좌표 | 백업에서 제외. 복원 후 위치 재확인. 직접 지정·공식 좌표만 출처가 명시되면 보존 |
| 공식 국토부 월 자료 | 검색 서버 배포 후 Firestore 공개자료 캐시 재사용 |
| TMAP 경로 | 서버 배포 후 조회시각부터 8시간 재사용. 같은 출발·도착·수단·출발일시·옵션·스키마가 일치해야 함 |
| Kakao·NAVER 경로 | 완료 결과를 DB에 저장하지 않음. 진행 중 같은 요청만 합침 |
| 추천 점수 | 경로와 개인 조건에서 다시 계산. 개인 기록 백업에는 포함하지 않음 |

Kakao는 개인 사용 여부와 별개로 소요시간·환승 정보를 저장해 다음 요청에 재사용할 수 없다고 안내한다. TMAP은 24시간 이상 지난 저장 자료의 사용을 제한하므로 8시간 만료를 적용한다. 같은 경로라도 예산·회사 비중은 캐시 키에서 제외하고 점수만 다시 계산한다. [Kakao 공식 답변](https://devtalk.kakao.com/t/api/151435), [TMAP 약관](https://transit.tmapmobility.com/terms), [NAVER Maps 약관](https://www.ncloud.com/policy/terms/maps)

## 기록 저장 사용법

1. HomeHunt → **연결 상태 → 내 기록 클라우드 저장**에서 Google 로그인한다.
2. **이 기기 기록을 클라우드에 저장**을 누르면 현재 회사 조건·방문·관심·주차 확인값을 저장한다.
3. 다른 기기에서 같은 계정으로 로그인하고 **클라우드 기록으로 이 기기 복원**을 누른다. 해당 로컬 기록을 교체한다.
4. 복원된 회사 중 위치 확인이 필요한 곳은 주소 검색이나 지도 선택을 다시 한다. 예산·비중은 유지된다.

로그인만으로 로컬 기록을 덮어쓰지 않는다. 이미 원격 기록이 있으면 버전·저장일·개수를 확인한 뒤 **이 기기 기록으로 클라우드 교체**를 선택하거나 취소할 수 있다. 옛 클라우드 기록을 로컬로 불러와야만 저장할 수 있는 구조는 아니다. 저장 버전이 달라지면 409 충돌로 차단해 다른 기기의 수정을 조용히 덮지 않는다. 현재 무료 직접 저장은 계정별 공간이며 서로 다른 두 Google 계정의 자동 공동 편집은 제공하지 않는다.

## 접근 권한

- Google의 검증된 이메일 + 관리자 등록 회원 + 자기 UID 문서만 접근 가능.
- 회원 문서: `homehunt_members/{소문자 Google 이메일}`, 필드 `active: true`, `householdId: "sungso-home"`. 관리자 콘솔/Admin 권한으로만 등록한다. 회원 이메일을 브라우저 코드에 넣지 않는다.
- 무료 개인 백업: `homehunt_user_snapshots/{uid}`. 클라이언트 목록 조회·삭제는 차단하고 revision 증가와 스키마를 검사한다.
- 서버 가구 백업: `homehunt_households/{householdId}/snapshots/main`. HTTPS API의 회원 검사를 거친 Admin SDK만 접근한다. 무료 개인 백업과 자동 병합하지 않는다.
- 경로·사용량·작업·월 캐시와 회원 컬렉션은 클라이언트 직접 접근을 차단한다.
- 기존 일정·WeCost·신혼여행 컬렉션의 권한은 이번 작업에서 바꾸지 않는다. 따라서 **사이트 전체가 비공개로 전환된 것은 아니다.**

## 검색 서버 배포

`homehunt/cloud`는 별도 Firebase Functions 코드베이스(`homehunt`)다. Node 22, 서울 리전, 최소 인스턴스 0·최대 2, 인스턴스당 동시 요청 1, 512MiB, 요청 제한 540초로 설정했다. 최대 인스턴스와 호출 한도는 과금 상한이 아니므로 결제 전환 시 예산 알림도 설정한다.

```powershell
# 저장소 루트에서 실행
npm ci --prefix homehunt/cloud
npm run build --prefix homehunt/cloud
node --test homehunt/tests/*.test.mjs
node --check homehunt/js/app.js
git diff --check

# 사용자가 Blaze 전환을 완료한 뒤 실행한다.
# Secret JSON은 Git 제외 파일로 준비하며 값은 터미널에 출력하지 않는다.
firebase functions:secrets:set HOMEHUNT_PROVIDER_CONFIG --project sungso-358cb --data-file homehunt/.local/cloud-provider-config.json
firebase deploy --only functions:homehunt --project sungso-358cb
```

`HOMEHUNT_PROVIDER_CONFIG`는 필요한 항목만 포함하는 JSON이다. 가능한 항목은 `MOLIT_SERVICE_KEY`, `KAKAO_REST_API_KEY`, `TMAP_APP_KEY`, `TRANSIT_PROVIDER`, `NAVER_MAPS_CLIENT_ID`, `NAVER_MAPS_CLIENT_SECRET`, `NAVER_LOCAL_SEARCH_CLIENT_ID`, `NAVER_LOCAL_SEARCH_CLIENT_SECRET`, `KAKAO_DAILY_LIMIT`, `TMAP_DAILY_LIMIT`이다. 값은 `.env`나 Secret Manager에만 둔다. 기본 일일 한도는 Kakao 1000·TMAP 10이다. 로컬과 클라우드에서 같은 키를 병행할 때 공급자의 전체 사용량이 장부에 반영돼야 하므로 첫 배포 시 당일 로컬 사용량을 반영하고 병행 호출을 중단한다.

이후 순서:

1. 배포가 반환한 HTTPS 주소를 확인한다. 예상 주소는 `https://asia-northeast3-sungso-358cb.cloudfunctions.net/homehuntApi/api`지만 배포 전 연결된 주소로 간주하지 않는다.
2. 무로그인 401·비회원 403·회원 health 200을 검증한다. 공급자 키 설정 여부와 실제 조회 성공은 구분한다.
3. `js/config.js`의 `CLOUD_API_BASE_URL`을 검증한 주소로 채운다. 클라우드 로그인 토큰은 이 주소에만 보낸다. 원격 `/config` 키 입력 API는 제공하지 않는다.
4. 실제 작은 가격 조회, 한 후보의 회사 경로 행렬, 같은 TMAP 재조회에서 원호출 0회, 새로고침·작업 이어하기를 검증한다. 현재 TMAP 키는 이전 실조회에서 인증 오류였으므로 유효 키 확인 전 실제 캐시 재사용 성공으로 표시하지 않는다.
5. Firestore의 `homehunt_route_cache`, `homehunt_jobs`, 작업의 `chunks`, `homehunt_request_limits` 컬렉션 그룹에 `expiresAt` TTL 정책을 설정한다. TTL 삭제는 즉시 실행되지 않으므로 코드가 만료를 먼저 검사한다. [Firestore TTL](https://firebase.google.com/docs/firestore/ttl)
6. 기존 Pages 절차로 정적 화면을 배포하고 휴대폰에서 로그인·검색·저장·복원을 확인한다.

가격 검색은 Firestore 작업으로 저장하고 `/advance` 요청마다 최대 8개 월 자료를 처리한다. 모든 처리·체크포인트를 응답 전에 기다리며 작업은 24시간 유효하다. 창을 닫았을 때 무기한 백그라운드 실행하는 방식은 아니고, 작업 ID로 다시 요청하면 이어간다. 하나의 월은 40초 제한, 임대·fencing·취소·불완전 지역 제외가 적용된다.

## GitHub Pages와 Vercel 비교

| 선택 | 가능한 범위 | 추가 조건 |
|---|---|---|
| Pages + Firebase Spark | 정적 화면 + Google 로그인 + 계정별 개인 기록 저장 | 현재 무료 구성 |
| Pages + Firebase Blaze Functions | 위 기능 + PC 없이 가격 검색·통근·공식 자료 캐시 | 결제 전환, 서버 Secret, 실조회 검증 |
| Pages 또는 Vercel 정적 화면 + Vercel Functions + Firestore | 같은 기능 구현 가능 | Vercel 프로젝트 연결·서버 자격 증명·호출/응답 제한에 맞춘 어댑터 검증 |

현재 서버의 HTTP·인증·DB 코어는 플랫폼에 묶이지 않았지만 **Vercel 배포본은 아직 만들지 않았다.** Vercel Hobby의 요청 최대 300초와 응답 4.5MB 제한에 맞춰 advance 당 작업 수를 줄이고 결과를 페이지로 나눠야 한다. Firebase용 540초 설정과 최대 24MiB 작업 결과를 그대로 옮기면 안 된다. Vercel 프로젝트 연결 권한도 아직 없다. [Vercel 공식 제한](https://vercel.com/docs/functions/limitations)

Pages는 정적 호스팅이므로 Node API와 비밀키를 실행할 수 없다. Firebase 저장은 브라우저 SDK로 가능하며, 외부 공급자 비밀키를 쓰는 검색은 별도 서버가 필요하다. [GitHub Pages 설명](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
