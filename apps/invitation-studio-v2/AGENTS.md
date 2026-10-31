# Studio V2

- Separate protected editor at `/lab/studio-v2/`; preserve Studio V1, public invitations, APIs and authorization.
- Reuse the existing version 1 composition/content and scene runtime. Editor version 2 does not imply a new stored schema.
- Keep one persistent iframe and audio player. Global changes retain the reading position. Scene demos never write live data.
- V2 working content uses a separate IndexedDB database. V1 content import is explicit; the existing 40-item visual library remains compatible.
- Shared save/publication uses the existing authenticated connected build only. Local QA uses synthetic data.
- No RSVP, photo captions, guest photo upload, invented venue information or inferred private details.

## Progress

2026-11-01: V2 implementation started from `docs/invitation-studio/v2-analysis/PLAN.md`, prioritizing editor layout, unified controls and save compatibility.

### 2026-11-01 — Studio V2 별도 편집기 구현과 보호 배포

- 승인한 V2 계획의 0~2단계를 `apps/invitation-studio-v2/`에 구현했다. 장면 목록·큰 실제 미리보기·통합 디자인/문구/세부 설정, 이전/다음, 순서 변경, 선택 장면 추가, 모바일 하단 패널을 제공한다. 전체 색감·폰트·크기 변경은 읽던 위치를 보존한다.
- 문구 직접 편집, 사진 추가·제외, 전체 조합 기준 비교, 되돌리기/다시 실행, 기존 형식 1 URL·40개 디자인 보관함·파일 가져오기, 기존 공동 저장·명시적 공개 흐름을 연결했다. V2 문구/사진 작업 DB는 V1과 분리했고 V1 가져오기는 명시적 동작이다.
- `npm run build`, 전체 2,537개 검사, `npm run check` 통과. 합성 서버에서 직접 문구 편집/되돌리기, 사진 7→8장, 별점·메모, 공동 초안 저장, 순서·이전/다음, 음악 재생 위치·정지 보존, 320/390/430/1100/1440px 가로 넘침 없음 확인. 운영 데이터 QA 쓰기는 없다.
- Vercel `dpl_39JDRvJGryxiX9R8HnoiqBwgmBjc` READY, 보호 경로 `/lab/studio-v2/`에 배포했다. 루트 VER5.6·VER6·음악·사진 해시 동일, 익명 V1/V2 로그인 이동·스크립트401·관리401, 다른 앱3개404를 확인했다. 기존 공개 파일204개는 보존했다. 배포 중 잘못 생성한 임시 프로젝트는 사용자 승인 후 삭제했다.
- 상세 범위와 브라우저 증거는 `docs/invitation-studio/v2-implementation/README.md` 및 같은 폴더에 있다. 신규 하객 연출15종을 모두 구현한 단계가 아니며 필름 사진첩·폴라로이드 등3단계는 후속이다.

**다음:** 두 분이 V2에서 실제 조합을 공동 초안으로 사용하며 편집 흐름을 확인한 뒤, 영수증형 패스·필름형 사진첩·폴라로이드 표현을 선택 기능으로 확장한다.

