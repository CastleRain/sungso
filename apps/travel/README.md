# Travel

2027년 3월 7–17일 신혼여행의 현재 일정·지도·호텔 후보·여행 비용·출발 준비와 변경 이력을 함께 관리한다.

- `navigation.mjs`: 전체 일정·숙소·항공/크루즈·리조트/이동·관광/식사·여행 비용·출발 준비·변경 기록의 여덟 화면.
- `calendar.mjs`와 `calendar.css`: 여행 두 주/3월 전체 달력, 이동일 출발·도착 국가, 선택 날짜·지도 연결.
- `app.mjs`: 일정·호텔·편집 UI. `decision-panel.mjs`와 `.css`는 기존 공개 `shared/decision-panel.*` URL로 출력하고 여행에서만 로드한다.
- `budget.mjs`와 `budget.css`: 기존 WeCost 신혼여행 항목의 예상액·지급액·앞으로 지출할 금액, 준비금·추가 필요 금액과 예산 증감. 공통 계산·저장은 `shared/finance/travel-budget-{core,store}.mjs`를 사용한다.
- `readiness.mjs`와 `readiness.css`: 서류·예약 기한·이동·보험·통신·귀가 준비. 상태·메모는 기존 여행 결정 패널로 편집한다.
- `shared/travel/`: 여행 기준 데이터·검증·Firestore 저장과 구독. Honeymoon의 현재 여행 요약도 같은 저장소를 읽는다.
- 공개 경로는 `/sungso/travel/`이며 기존 hash 직접 주소와 뒤로/앞으로 이동을 유지한다.

저장소 루트의 `npm run dev`로 열고 [AGENTS.md](AGENTS.md)의 저장·이력·동시 편집 계약을 따른다. 조회나 초안 변경만으로 예산을 저장하지 않으며, 같은 WeCost 항목을 연결하므로 결혼비용에 중복 합산하지 않는다. 기존 `itineraries/main`은 이 앱으로 이동하거나 덮어쓰지 않는다.
