# Home 공통 모듈

홈과 날짜 화면이 공유하는 앱 설정·KST 날짜 계산·메모 저장 계약이다. 실제 화면은 apps/hub와 apps/dates가 소유한다.

- home-core.mjs: 알려진 앱 등록부, 저장 구성 정규화, 순서/그룹 변경, 날짜와 메모 검증.
- home-store.mjs: 주입된 SDK를 사용한 회원 구독, 공유 홈 revision 트랜잭션, 작성자 메모 저장/삭제, 구독 정리.

기본 그룹은 공개 기능 설정이며 개인 데이터 시드가 아니다. Firebase 읽기는 앱이 requireMember와 syncAppAuth를 끝낸 뒤 시작한다. SDK 주입은 운영 DB에 쓰지 않고 동작을 검증하기 위한 경계다.
