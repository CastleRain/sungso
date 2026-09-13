# Travel

2027년 3월 7–17일 신혼여행의 현재 일정·지도·호텔 후보·결정과 변경 이력을 함께 관리한다.

- `navigation.mjs`: 전체 일정·숙소·항공/크루즈·리조트/이동·관광/식사·변경 기록의 여섯 화면.
- `calendar.mjs`와 `calendar.css`: 여행 두 주/3월 전체 달력, 선택 날짜·지도 연결.
- `app.mjs`: 일정·호텔·편집 UI. `decision-panel.mjs`와 `.css`는 기존 공개 `shared/decision-panel.*` URL로 출력하고 여행에서만 로드한다.
- `shared/travel/`: 여행 기준 데이터·검증·Firestore 저장과 구독. Honeymoon의 현재 여행 요약도 같은 저장소를 읽는다.
- 공개 경로는 `/sungso/travel/`이며 기존 hash 직접 주소와 뒤로/앞으로 이동을 유지한다.

저장소 루트의 `npm run dev`로 열고 [AGENTS.md](AGENTS.md)의 저장·이력·동시 편집 계약을 따른다. 기존 `itineraries/main`은 이 앱으로 이동하거나 덮어쓰지 않는다.
