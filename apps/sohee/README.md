# 소희의 공간

`/sungso/sohee/workspace/`에서 회원 전용 매출 앱과 기존 포트폴리오 예시를 연다. 공개 sungso 대문과 모든 앱 목록에 진입점이 있다. [매출 앱 구조·실행](sales/README.md)과 [검증 기록](sales/verification.md)을 따른다.

`workspace/`는 공통 회원 인증 이후 기존 작업실·포트폴리오 구성 요소를 재사용한다. 실제 매출은 `sales/`가 Firestore에서 읽으며 예시 경력·성과·사진과 섞지 않는다. `prototype/`은 기존의 독립 탐색용 미리보기로 유지한다. `build.mjs`는 코드·인증 셸·명시된 예시 사진만 `dist/`에 생성하고 루트 등록부가 이를 배포한다. 원본·매출·테스트·프로토타입 서버는 배포하지 않는다.

## 현재 폴더

- `sales/`: 전체 매출·메뉴·디저트 준비·변화·데이터 관리, 회원 전용 Firebase 조회와 원본 갱신 UI.
- `sales/preview.mjs`: 기존 작업실·포트폴리오와 매출 앱을 함께 제공하는 로컬 미리보기.

- `prototype/src/home/`: 선택한 첫 번째 대문 시안의 오른쪽 작업실 진입 영역.
- `prototype/src/workspace/`: 프로젝트 없는 초기 작업실과 오늘·프로젝트·인박스 전환.
- `prototype/src/portfolio/`: 포트폴리오 목록, 가상 사례 상세, 소개 화면.
- `prototype/assets/`: 실제 제작물이 아닌 예시 이미지.

`prototype/` 자체는 기존 sungso와 독립적인 React/Vite 미리보기다. 회원용 진입점은 별도 `workspace/`에서 공통 인증에 연결한다. `prototype/` 전체를 배포 허용 목록에 넣지 않는다.

## 실행과 탐색

이 폴더의 `prototype/`에서 `npm install`, `npm run dev -- --host 127.0.0.1 --port 4175 --strictPort`.

- `/sungso/sohee/`: 대문 예시
- `/sungso/sohee/workspace/`: 빈 작업실
- `/sungso/sohee/portfolio/`: 포트폴리오 예시
- `/sungso/sohee/portfolio/cases/dessert-set/`: 가상 사례 상세·목차·목록 복귀
- `/sungso/sohee/portfolio/about/`: 작성 전 소개·이력

브라우저 뒤로/앞으로, 직접 URL, 새로고침을 지원한다. 기존 앱으로 나가는 링크는 운영 앱·새 탭으로 명시했다. 내부 미리보기는 운영 요청을 보내지 않는다.

## 향후 구조와 웹/PDF 분리

정식 앱은 `apps/sohee/` 아래 `workspace/`(내부 기록), `portfolio/`(선정한 외부 공개용 문장·사례), `exports/`(PDF 전용 레이아웃)를 구분하는 방향이다. 아직 `exports/`나 PDF 출력 기능은 만들지 않았다.

웹은 목록→사례 상세→목차 탐색→목록 복귀와 About 연결을 갖춘다. PDF는 표지→소개→선정 사례→결과·배움 순서로 압축하고 페이지 번호·고정 판형을 따로 설계한다. 같은 공개 승인 콘텐츠를 사용할 수 있지만 내부 매출/레시피를 자동 전달하거나 웹 전체 캡처를 PDF로 삼지 않는다.

## 검증

2026-09-24: 루트 build 및 check(1,730개 테스트, 참조 516개·JS 188개) 통과. 첫 sandbox 내 test는 로컬 listen EPERM으로 실패했고 허용된 환경의 check에서 동일 테스트를 전부 통과했다. 독립 프로토타입 build 통과. 1440px·390px 인앱 브라우저로 진입·목록/상세/소개·목차·복귀·새로고침을 확인했다. 자세한 근거는 `prototype/design-qa.md`.

다음: 사용자가 실제 탐색 후 대문 진입 방식·포트폴리오 밀도를 검토한다. 운영 통합·기록 저장·PDF 제작·배포는 별도다.
