# HomeHunt Ver2 공식자료 연구

화면·Render 서버에서 학습하지 않고 Python 로컬 작업으로 공식자료를 확보하고 월별 워크포워드 실험을 실행한다. 개인 회사·경로·WeCost 원장은 학습하지 않는다.

```powershell
python -m pip install -r services/homehunt/research/v2/requirements.txt
python -X utf8 -m unittest discover -s services/homehunt/research/v2 -p test_*.py
python -X utf8 services/homehunt/research/v2/pipeline.py --as-of 2026-09
```

`-X utf8`은 Windows 콘솔에서도 한글·결과 상태를 손상 없이 출력하기 위한 옵션이다. 예측 origin은 완결된 월말만 사용하며, 기본은 한국시간의 직전월이다. 2026-10-11에는 2026-09 월말이 최근 origin이다. 결과는 `apps/homehunt-v2/data/manifest.json`, `forecasts.json`, `backtest.json`, `availability.json`, `analysis-targets.json`, `market-prices.json`이다. 마지막 파일은 모델 선정 대상에 국한하지 않은 실제 가격 관측이며 판매 중인 매물을 뜻하지 않는다. 상세 예측·원자료 해시는 Git 제외 `services/homehunt/.local/research/v2/runs/`에 저장한다.

## 소스·공개·비공개 경계

연구 프로그램은 `services/homehunt/research/v2/`에 있고 웹 배포 목록에 포함하지 않는다. 전국 단지 원천은 `services/homehunt/data/source/apartment-catalog.json`에서 서울·경기만 선택하며, 금리 공개자료는 `apps/homehunt/data/finance-dashboard.json`을 읽는다. 개인 회사·재무·회원 기록을 입력으로 사용하지 않는다. `--catalog-file`, `--finance-file`로 실제 공식 파일을 명시할 수 있다.

기존 실행에서 확보한 큰 원자료·캐시는 원래 로컬 저장 위치에 그대로 남겨 둔다. 폴더 통합은 이를 복사하거나 삭제하지 않는다. 공개 JSON 7개는 원본 해시를 유지해 이식한 뒤 독립 감사에서 발견한 모델 선택 목표확정 시점 결함을 수정하여 별도 `direction-6m-1.1.0` 실험으로 갱신했다. 원본 공개 결과는 그대로 남겨 둔다. 다른 checkout에서 재실험하려면 다음처럼 원래 위치를 명시한다. 이 명령은 공식 API를 호출하지 않지만 로컬 학습과 결과 갱신을 수행하므로, 자료 확인만 하려면 아래 수집기의 `--cache-only`를 사용한다.

```powershell
python -X utf8 services/homehunt/research/v2/pipeline.py --as-of 2026-09 --cache-dir "C:/Users/c/Desktop/sungso/homehunt/.local/market-cache/months" --raw-dir "C:/Users/c/Desktop/sungso/homehunt-v2/.local/research/raw"
```

원자료·staging·감사 실행의 기본 저장소는 `services/homehunt/.local/research/v2/`다. `--raw-dir`, `--local-dir`는 비공개 로컬 위치이고 `--output`만 공개 결과 위치다. 통합 후 재실험은 이미 보유한 공식 자료만 읽었으며 추가 HTTP·통근 호출은 없었다.

## 추가 공식 실거래 수집

```powershell
python -X utf8 services/homehunt/research/v2/collect.py --regions 41117,41463,41610,41597,41370 --months 120 --end-month 2026-09 --types sale,rent --request-budget 48 --prefer-existing-cache
python -X utf8 services/homehunt/research/v2/collect.py --regions 41117,41463,41610,41597,41370 --months 120 --end-month 2026-09 --types sale,rent --cache-only --prefer-existing-cache --cache-dir "C:/Users/c/Desktop/sungso/homehunt/.local/market-cache/months" --output "C:/Users/c/Desktop/sungso/homehunt-v2/.local/research/raw" --audit-dir "services/homehunt/.local/research/v2/coverage-check"
```

최대 120개월을 요청하되 **실제 HTTP 요청마다 예산 차감**한다. 1,000건을 넘는 월은 페이지마다 차감하고 한도가 닿으면 해당 월을 완전 자료로 저장하지 않는다. 기본 24회·600ms 간격, 동시 호출 없음. `--request-budget`/`--max-calls`로 명시적으로 늘릴 수 있다. 정상 저장 월과 기존 캐시는 무호출 재사용한다. `--cache-only`는 키를 읽거나 API를 호출하지 않고 확보/미확보 월만 센다. 중단·실패·사용량은 체크포인트와 실행별 장부에 남는다. 원 XML은 내용 해시를 파일명으로 보존하며 `.env`나 요청 URL은 저장하지 않는다. API 키는 기본 `services/homehunt/.env` 또는 명시한 `--env-file`에서 `MOLIT_SERVICE_KEY`만 읽고, 프로세스 환경변수가 우선한다. `--cache-dir`는 기존 월 캐시, `--output`은 연구 원자료 위치다. 원래 체크포인트를 보존하면서 과거 raw 위치를 확인하려면 `--audit-dir`를 새 Git 제외 위치로 지정한다.

화성의 구 REB 카탈로그 `41590`과 실거래 동탄구 `41597`는 공식 행정구역 변경 후 다를 수 있다. 연구 매칭은 새 구 코드를 원 카탈로그로 매핑하되 **같은 법정동·단지명·필요시 지번까지** 확인한다. 새 코드의 실제 응답 범위는 확보 현황에 남기며, 구 코드 0건만 보고 동탄 거래가 없다고 판단하지 않는다.

## 당시 자료와 과거 재구성

기존 normalized cache는 취소 거래를 이미 제외했고 과거 접수·정정 일시를 제공하지 않는다. 과거 실험은 `reconstructed`로만 표시한다. 2개월 신고·공표 지연 가정은 역사적 공개시점의 증명이 아니다. 새로 받은 XML에도 과거 공개시점이 없으면 그대로 재구성이다.

`strict`에는 거래별 증명된 `publishedAt/availableAt`과 `vintageVerified=true`가 필요하다. 입주계획·노선·규제 등 외부 특징도 당시 공표·효력일이 확인된 행만 사용한다. 미래 취소를 알고 과거 취소가 없던 예측을 재현했다고 주장하지 않는다.

Model C의 세대수는 현재 공식 카탈로그를 과거에도 같다고 가정한 **정적 대리변수**이며 세대수 변동 이력을 확보하지 못했다. 공개 `featureAssumptions`에 이 한계를 표시한다. `build_panel(..., strict=True)`는 당시 공표가 검증된 `households` 관측만 사용하며 없으면 결측으로 둔다.

## 공식 추가 특징 가져오기

`services/homehunt/.local/research/v2/official-features.csv`는 다음 열을 받는다.

```csv
feature,value,observedMonth,publishedAt,sourceUrl,regionCode,catalogId,validFrom,validTo,verificationLevel
```

필수 열은 `feature,value,observedMonth,publishedAt,sourceUrl`이다. 파일은 공식 원자료에서 사용자가 추출한 실제 숫자만 담는다. `publishedAt` 이전에는 학습 입력으로 보지 않으며, 역 개통·노선·규제는 `validFrom` 이전에 사용하지 않는다. `regionCode`, `catalogId`가 있으면 해당 지역/단지만 적용한다. 이 문서에는 임의의 예시 관측값을 제공하지 않는다.

지원 특징은 `pipeline.py`의 `FEATURES`에 정의된 금리·입주·미분양·교통·경매 항목이다. 가격지수·인구·일자리는 확보 표에 남겨 두고 실제 이력을 검증한 뒤 특징군을 추가한다. `--feature-csv`로 다른 검증된 파일을 지정할 수 있다. 미확보 항목은 0으로 바꾸지 않는다.

## 월·면적·검증 계약

- 서로 다른 실제 전용면적은 서로 다른 시계열이다. 59/60/85 구간으로 합치지 않는다.
- 기준 가격: 예측월 기준 2개월 전까지 같은 면적의 최근 3개월 평균, 최소 3거래. 목표는 **예측월+6개월**의 최근 3개월 평균이다.
- 목표 가격 자료의 2개월 신고 지연까지 지난 학습 사례만 사용한다. 따라서 학습 origin과 예측 origin 사이에 최소 8개월 간격이 생긴다.
- 최근 12개월 중 거래월 6개 미만, 최근 기준가격 3건 미만, 12개월 비교자료 부족이면 단지 수치를 보류한다.
- 마지막 24개 평가 가능 origin을 최종 시험으로 고정한다. 모델 선택에는 **목표값의 신고 지연까지 첫 시험 직전월에 확정된** 최근 4개 origin만 사용한다. 2024-02부터 시험하면 개발 origin은 늦어도2023-05이고 실제 개발 구간은2023-02~05다. `selectionAudit`가 선택 cutoff·마지막 dev 목표확정월을 기록한다. 최종 시험이 모델 선택에 들어가지 않는다.
- ±3%가 주 결과이며 ±2%·±5%는 다시 학습한 민감도 결과다. 가장 잘 나온 임계값으로 주 결과를 교체하지 않는다.
- 순열 대신 단계별 공통 표본 성능·지역 제외·단지 제외를 제공한다. 단지 제외 검증은 마지막 6개 origin의 제한된 계산임을 결과에 명시한다.
- 모델 기준을 통과하기 전 상승/하락 확률은 공개 JSON에서 `null`이다. 실제 평균가격·표본·예측 보류 사유는 그대로 볼 수 있다.

## 갱신·장애

### 월별 로컬 갱신: 계획 확인 후 명시적 실행

`refresh.py`는 기본적으로 **읽기 전용 계획**이다. `--execute`가 없으면 API 호출·키 읽기·학습·결과/장부 파일 쓰기는 모두0회다. 기준월은 한국시간의 직전 완결월이고 목표월은6개월 뒤다. 다음 기본 명령은 실행하지 않고 대상·기간·호출 상한·기존 캐시 상태만 보여 준다.

```powershell
python -X utf8 services/homehunt/research/v2/refresh.py
python -X utf8 services/homehunt/research/v2/refresh.py --as-of 2026-09 --cache-dir "C:/Users/c/Desktop/sungso/homehunt/.local/market-cache/months" --raw-dir "C:/Users/c/Desktop/sungso/homehunt-v2/.local/research/raw" --env-file "C:/Users/c/Desktop/sungso/homehunt/.env"
```

계획을 확인하고 월 갱신을 원할 때만 같은 명령에 `--execute`를 붙인다. 기본은 지정5지역의 **최근2개월 매매·전월세**만 새로 확인하며 과거 원자료는 복사·재수집하지 않는다. `--recent-months 3`으로 최근3개월까지 선택할 수 있다. 기본 HTTP 한도는24회, `--request-budget`의 명시적 범위는1~120회다. 한 월이 여러 페이지면 페이지마다 차감하므로24회 안에 모든 요청이 끝나지 않을 수 있다. 부족한 경우 실패·미완료를 표시하며 정상 월과 기존 자료로 분석한다. 실제 통근·WeCost·개인 기록은 호출하거나 변경하지 않는다.

`--local-dir`, `--raw-dir`, `--cache-dir`, `--env-file`로 원래 로컬 위치를 지정할 수 있다. 일반 .env 읽기는 수집기에서 허용된 `MOLIT_SERVICE_KEY`만 사용하고 프로세스 환경변수가 우선한다. 키·요청 URL·자식 프로세스의 원시 출력은 갱신 stdout에 전달하지 않는다. 기존36개월 이상 매매 캐시와 공식 단지·금리 입력이 없으면 **추가 수집 전에 중단**한다. 이 작은 월 갱신 명령은 최초5~10년 대규모 수집을 대신하지 않는다.

실행 순서는 제한된 수집 → 별도 비공개 후보 출력에 학습 → 성공한 후보만 기존 publisher로 반영이다. 수집 실패·학습 실패·빈 연구 표본은 기존 공개 결과를 그대로 보존한다. 새 모델의 성능 기준 미달은 마지막 검증 전망을 유지하며, 부분 수집·원 기준월과 실제 공개 기준월을 실행 영수증에 남긴다. 영수증·원문 해시는 `services/homehunt/.local/research/v2/refresh-runs/` 안에 있고 동시 실행 잠금이 중복 호출을 막는다. 비정상 프로세스 종료 후 잠금이 남으면 다른 갱신이 실제 실행 중인지 확인한 뒤 해당 단일 `refresh.lock`만 수동 정리한다.

**무료 로컬 Python 작업으로 수동 실행 가능하지만 월별 자동 실행은 아직 설정하지 않았다.** 이번 구현·검증은 대역 subprocess를 사용했으며 실제 `--execute`나 새 API/학습을 실행하지 않았다. Windows 작업 스케줄러나 GitHub 실행을 나중에 설정할 경우 사용자 승인, 같은 호출 한도·원자료 보존·기존 키 정책을 별도로 확인한다. 무료 Render 웹 요청에 학습을 붙이거나 서버를 주기적으로 깨우지 않는다.

첫 전체 실험을 완료한 뒤 동일 스냅샷 해시와 결과를 보존한다. 새 자료 실험은 별도 실행으로 만들고 최종 시험을 다시 튜닝용으로 쓰지 않는다. 파이프라인은 `services/homehunt/.local/research/v2/staging`에서 전부 생성한 후 `publish.py`로 반영한다. 새 실험이 gate를 통과하지 못하면 마지막 검증 `manifest/forecasts`는 유지하고, 새 실험의 `backtest/availability/실제가격`과 `update-status.json`만 갱신한다. 각 전망의 기준월·목표월을 보존하며 새 예측처럼 표시하지 않는다. 학습이 오류로 종료하면 public 파일을 건드리지 않는다. 운영 자동 갱신은 이 CLI를 월별 실행하는 작업으로 연결할 수 있다. 대규모 수집·학습을 무료 Render 웹 요청에 연결하지 않는다.
