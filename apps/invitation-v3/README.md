# 성우 · 소희 — Invitation VER3

포르투의 사진 위 영문 필기체·작은 이름/날짜·여백을 사용자가 시각 기준으로 지정한 하객용 정적 청첩장이다. 현재는 **별도 로컬 미리보기**이며 기존 VER2·회원용 선택 앱·운영 배포를 변경하지 않는다.

```powershell
npm run build
npm test
npm run dev -- --port 8024
```

미리보기: http://127.0.0.1:8024/sungso/invitation-v3/

- 내용의 원본: `js/config.mjs`. 예식 정보, 초대글, 사진 이야기, 실제 문답, 약속, FAQ, 본인/부모님 계좌 슬롯을 편집하고 build를 실행한다.
- 계좌는 은행·예금주·유효 번호가 모두 입력된 항목만 공개한다. 양가 모두 비어 있으면 전체 계좌 영역과 이동 링크를 숨긴다. 문답·약속도 비어 있으면 숨긴다.
- 사진은 사용자 지정 여섯 장이며 기존 웹용 최적화본을 사용한다. 숲길 원본은 `scripts/prepare-photo.py`로 축소·WebP 변환·EXIF 제거만 했다. 생성된 인물·색상 보정·사진 합성은 사용하지 않는다.
- 영문은 Pinyon Script, 한글·숫자는 SUIT Regular/Medium을 자체 호스팅한다. 공식 폰트와 OFL 라이선스는 `assets/fonts`에 있다. 원래 포르투의 Dulcinea를 무단 복제하지 않고 비슷한 인상의 공개 폰트를 사용했다.
- 포르투의 삼각 테두리·꽃잎·시 인용·제3자 사진은 복제하지 않았다. 흰 배경·블루 포인트는 사용자의 명시 선택이며 표지 문자는 숲 배경 위에서 읽히는 흰색이다.
- 음악은 기존 자체 Web Audio 피아노를 사용자 클릭으로만 재생한다. 지도는 기존 공식 카카오 약도와 실제 장소 링크를 사용한다.
- Node 기본 모듈로 HTML·지도·CRLF 일정 파일을 생성한다. Firebase·회원 데이터·별도 서비스·외부 수집은 없다. GitHub Pages 정적 앱이라는 사용자 범위를 유지하므로 모바일 앱 템플릿을 추가하지 않았다.
- 화면은 JavaScript 실패 시에도 예식 정보·초대글·달력·사진·지도 앱 링크를 읽을 수 있다. 노스크립트에서는 사진 이야기 세 장을 모두 표시한다.

검증: `design-qa.md`, 작업 공간의 `docs/invitation-v3-review/`. 실제 휴대전화·OS 공유/캘린더 가져오기와 클립보드 읽기 확인은 별도로 남긴다.

공식 폰트: https://github.com/google/fonts/tree/main/ofl/pinyonscript · https://github.com/sun-typeface/SUIT
