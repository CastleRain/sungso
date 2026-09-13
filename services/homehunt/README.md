# HomeHunt 서비스

HomeHunt의 검색 API와 공식자료 수집을 담당한다. 브라우저 화면은 `apps/homehunt/`, 공통 계산은 `shared/homehunt/`에 있다.

| 폴더 | 역할 |
|---|---|
| `server/` | 인증·HTTP API·공공 캐시·가격 작업·통근·시설·정리, 국토부 공통 구현 |
| `scripts/` | 로컬 서버·공급자 연동·공식 수집기·카탈로그/역 자료 생성 |
| `render/` | 현재 Render Node 서버 진입점·번들 빌드 |
| `cloud/` | Firebase Functions 대안 진입점·Emulator 검사 |
| `data/source/` | 전국 단지 원천자료; 공개 서울·경기 자료 생성 입력 |
| `config/` | 지역·추적 단지 수집 설정 |
| `state/` | 공공 분양 알림의 중복 방지 장부 |
| `.env`, `.local/` | Git 제외 로컬 키·캐시·사용량 장부 |

## 실행

루트의 [개발 안내](../../docs/development.md#서비스-빌드)에 따라 의존성을 설치한다. 현재 Render 빌드와 실행 명령은 저장소 루트 기준 다음과 같다.

```sh
npm run build --prefix services/homehunt/render
npm start --prefix services/homehunt/render
```

이 명령은 Render용 환경변수가 준비된 서버에서 사용한다. 로컬 개발 서버는 기존 허용 환경변수를 사용하며 PowerShell 실행기가 `.env`를 읽는다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File services/homehunt/scripts/start-local-market.ps1
```

별도 터미널에서 루트 `npm run dev`로 화면을 연다. API 포트 `8787`과 공개 주소 `https://sungso-homehunt-api.onrender.com/api`는 유지한다. 폴더 이동은 운영 DB·캐시·일일 사용량을 초기화하는 작업이 아니다.

[작업 지침](AGENTS.md) · [배포·복구](../../docs/deployment.md) · [기존 세부 운영 문서](../../apps/homehunt/docs/render-deployment.md)
