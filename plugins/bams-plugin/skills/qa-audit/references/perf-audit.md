# PERF 성능 감사 (P1–P6) [L2]

> `/bams:qa --audit perf` 단계에서 읽는다. 관찰 전용 — 수정은 사용자 요청 시 `/bams:hotfix`·`/bams:dev`.
> 표기: `$S` = 감사 엔진 스크립트 디렉터리(SKILL §실행 환경에서 설정), `<run>` = `.crew/artifacts/qa/<YYYY-MM-DD>-<scope>`.

성능 수치는 측정 조건과 함께만 의미가 있다. 모든 실행에 **서버 종류**(`--server dev|prod|staging|unknown`)를 적고, 리포트 표 위에 서버 종류·캐시 계층·viewport·관찰 시간을 쓴다. **dev 서버 값은 운영 수치로 쓰지 않는다.** 대상 레포 제약이 build를 금지하면 그 사실과 함께 dev 서버 값만 내고 `미검증·한계`에 기록한다(`references/qa-principles.md` 원칙 4·§4).

## P1. cold·warm은 캐시 계층으로 정의한다

| 계층 | cold | warm | 스크립트 모드 |
|---|---|---|---|
| 서버 인프로세스 캐시 | 캐시 우회 요청 헤더 — **프로필 `perf.nocache_header`(또는 `--nocache-header`)가 있을 때만** | 1회 예열 후 | `measure-api` `server-cold` / `server-warm` |
| 브라우저 HTTP·JS 캐시 | 새 browser context | 같은 context 재방문 | `measure-web` `browser-cold` / `browser-warm` |
| 클라이언트 Query 캐시 | 하드 로드 | SPA 내부 링크 → 뒤로 가기 재진입 | `measure-web` `query-warm` |

- 캐시 우회 수단이 없으면 server-cold는 `{status: "unverified", reason: "캐시 우회 수단 없음"}`으로 남는다. 우회 헤더를 지어내지 않는다.
- 리포트 열 이름에 계층을 붙인다. "cold 1.2s"처럼 계층 없는 표현을 쓰지 않는다.

## P2. API

```sh
node "$S/measure-api.mjs" --profile .crew/qa-profile.json \
  --base http://localhost:3000 --endpoints <run>/endpoints.json \
  --runs 30 --modes server-cold,server-warm --nocache-header <우회 헤더 이름> \
  --timeout-ms 30000 --server dev --out <run>
```

- `--nocache-header`는 기본값이 없다. 프로필 `perf.nocache_header` 값을 쓰고, 둘 다 없으면 스크립트가 엔드포인트마다 server-cold 행을 `{status: "unverified"}`로 남기고 server-warm만 측정한다(`--modes server-warm`으로 돌리면 server-cold 행 자체가 없으니 리포트 `미검증`에 직접 적는다).
- 엔드포인트 목록은 엔진 템플릿 `endpoints.example.json` 형식으로 `<run>/endpoints.json`에 만든다.
- `--timeout-ms <ms>`: 요청 하나의 제한시간(기본 30000, 본문 읽기 포함). 1 미만이거나 정수가 아니면 exit 2.
- 결과(`perf-api.json` `results[]`): 엔드포인트·모드별 `status`(`measured`·`unverified`·`error`), `p50`/`p95`/`max`, `samples`(측정에 쓴 표본 수), `bytes`(응답 바이트 중앙값), `statuses`(상태 코드 분포 — 응답 없는 요청은 `error`), `excluded`(측정 제외 수), `errors`(오류 사유 — `timeout <ms>ms` 등), `stopped_early`, `timing`(Server-Timing 지표별 `median_dur` — `--timing-names` 또는 프로필 `perf.server_timing_names`가 있으면 그 지표만, 없으면 전부). `unverified`·`error` 행은 `reason`을 갖는다.
- 서버 측 캐시 우회·추적 설정이 필요하면(프로필 `perf.server_env`) 사용자에게 그 설정으로 서버를 띄워 달라고 요청한다. QA가 대상 레포 env를 바꾸지 않는다. 받지 못하면 해당 모드를 `미검증`으로 둔다.
- 인증 API는 `--cookie` 또는 `QA_COOKIE`(값은 리포트·로그 금지). **2xx 응답만 측정 표본**이다 — 3xx·4xx/5xx(401 포함) 응답과 네트워크 오류·타임아웃은 측정값으로 쓰지 않는다(`excluded`에 수만 남는다).
- 표본이 0이면 그 행은 `unverified`이고 `reason`에 상태 분포(예: `측정 가능한 응답 없음 (HTTP 401×30) — 인증 쿠키 확인`)가 남는다. HTTP 응답이 하나도 없으면(전부 타임아웃·네트워크 오류) 행 `status`는 `error`다. 둘 다 성공으로 세지 않는다.
- 연속 3회 네트워크 오류·타임아웃(예열 포함)이면 그 엔드포인트·모드 행을 중단하고 다음으로 넘어간다(`stopped_early: true`, 사유에 중단 표기).
- 배치 작업·캐시 갱신 시간대와 측정 시간이 겹치면 표에 표시한다.
- localhost/127.0.0.1/::1 외 호스트는 사용자가 명시했을 때만 `--allow-remote`.

산출물: `<run>/perf-api.{json,md}`.

## P3. 웹

```sh
node "$S/measure-web.mjs" --base http://localhost:3000 \
  --routes /products/1 --ready "[data-qa-section]" \
  --devices mobile,desktop --runs 3 --api-pattern "/api/" --server dev --out <run>
```

- TTFB, FCP, LCP, CLS(load 후 관찰 시간 `--observe-ms`, 기본 1500), ready(데이터 셀렉터가 보인 시점), 전송 바이트, 문서 Server-Timing. `--runs`(기본 3)회 중앙값. `--ready`를 생략하면 프로필 `ready_selector`, 그것도 없으면 ready는 측정하지 않는다.
- `--modes`: `browser-cold,browser-warm,query-warm`. `query-warm`은 내부 링크로 이탈했다가 돌아온다 — 이탈 링크를 못 찾으면 그 표본은 `미검증`(성공 아님), 표본이 모두 미검증이면 행 `status`가 `unverified`. 링크는 `--leave-selector`로 지정한다.
- 표본마다 문서 응답의 HTTP 상태를 기록한다(행 `http` 배열, md `HTTP` 칸 — 응답 없음은 `응답 없음`). HTTP ≥400이거나 응답이 없는 표본은 모든 모드에서 `미검증`(사유 `HTTP <n>`·`HTTP 응답 없음`)이며 측정값·성공으로 세지 않는다.
- `perf-web.json` `results[]`: 모든 행에 `status`·`http`·`errors`·`measured_samples`·`unverified_samples`·`unverified_reasons`가 있다. browser-cold·browser-warm 행은 `ttfb`·`fcp`·`lcp`·`cls`·`ready`·`bytes`·`server_timing`·`api_bytes`·`api_leaves`·`api_responses`·`qa_fields`·`api_top`. query-warm 행에는 이 로드 지표 키가 없고 `reentry_ready`·`skeleton_reappeared`(표본별 true/false/null — null은 전체 새로고침)·`via`가 있다.

산출물: `<run>/perf-web.{json,md}`.

## P4. 원천 조회와 렌더 비교

| 비교 | 어떻게 | 해석 |
|---|---|---|
| 시간 분해 | API Server-Timing → TTFB → ready → LCP | 원천 조회가 대부분이면 서빙·쿼리 문제, ready − TTFB가 크면 클라이언트 fetch·렌더 문제 |
| 데이터량 | `--api-pattern`으로 받은 JSON 바이트·값 수 vs 렌더된 `data-qa-field` 수 | 받은 값 대비 렌더 값이 매우 적으면 overfetch 후보 (예: 목록이 쓰지 않는 상세 필드까지 함께 받는 응답) |

- 서버 컴포넌트가 서버에서 읽는 데이터는 브라우저에서 보이지 않는다. Server-Timing과 서버 로그로 본다.
- 화면 값이 원천과 같은지(데이터 정합성)는 이 엔진의 범위가 아니다 — 도메인 데이터 QA 도구를 사용한다.

## P5. 로딩 처리

라우트마다 **로딩 소유권 표**를 먼저 만든다(코드 읽기 — 감사 모드 정적 확인 예외).

| 화면 | 로딩 소유권 / 데이터 | 구조와 유지할 셸 | 최초 / 재조회 |
|---|---|---|---|
| 예: 상품 목록 | 서버 page의 목록 조회, 상위 loading 경계 | 데스크톱 표 / 모바일 카드. 제목·설명·필터 라벨·표 헤더 유지 | 최초만 전체 셸, 필터 전환은 기존 콘텐츠 유지 |

그다음 `loading-skeleton-checklist.md`를 따라 확인한다. 오류·지연 주입이 필요하면 QA 브라우저 안에서만 Playwright `page.route`로 해당 API에 503·지연을 돌려준다(서버 코드·env 미변경).

## P6. 스켈레톤 ↔ 실제 화면

```sh
node "$S/skeleton-hold.mjs" --base http://localhost:3000 \
  --routes list=/products,detail=/products/1 \
  --viewports 1440x1000,390x1000 --phase after --server dev --out <run>
node "$S/build-gallery.mjs" --dirs <run>/screens --out <run>/gallery.html --title "스켈레톤 전후" --cases list,detail
```

- `--viewports`를 생략하면 프로필 파일의 `viewports`, 그것도 없으면 `1440x1000,390x1000`(스켈레톤 전체를 담는 긴 모바일 프레임)을 쓴다.
- `skeleton-hold`는 **Next.js 스트리밍 Suspense reveal(`$RC`) 전용**이다. 다른 프레임워크이거나 스트리밍 경계가 없으면 `held = 0`이 되고, 행 `status`가 `unverified`다 — 성공으로 세지 않는다(`captured`만 캡처 성공).
- 캡처 파일은 `screens/<key>__<phase>-held__<width>.png`·`screens/<key>__<phase>-loaded__<width>.png`다. 같은 `screens/`에 `inspect-computed-style`의 `<route>__page__<width>.png`도 있으므로 갤러리는 `--cases <key,…>`로 스켈레톤 케이스만 고른다.
- 수정 전 캡처가 필요하면 수정 전 커밋에서 `--phase before`로 먼저 찍는다(같은 `--out`). 같은 `screens/`에 쌓이면 갤러리가 before/after를 나란히 보여 준다. 커밋 전환은 대상 레포 제약(자동 stash·checkout 금지 등)을 먼저 확인한다.
- 판정 기준: `held ≥ 1`, 보류 중 가시 busy status 정확히 1개, 넘침 없음, 주요 컨테이너(`--boxes`)의 x·w 차이 0. y·h 차이는 데이터 길이에 따라 생길 수 있으니 섹션 순서·컬럼·breakpoint가 같은지 스크린샷으로 본다.
- 클라이언트에서 데이터를 불러오는 섹션이 있으면 `--hydrate`를 붙인다. 이때 "완료" 쪽은 보류 없이 새로 연 같은 화면을 끝까지 스크롤한 뒤 가시 busy status가 사라질 때까지 기다린 결과다. `--hydrate` 없이는 JS가 막혀 클라이언트 섹션이 로드되지 않으므로 완료 쪽 busy 수를 판정에 쓰지 않는다.
- `measure-web`의 `API 응답 상위`는 브라우저가 받은 JSON을 URL별 크기순으로 보여 준다. 화면에 쓰지 않는 큰 응답은 overfetch 후보다.
- 자연 CLS는 `measure-web` 값만 쓴다. 보류 캡처는 CLS가 아니다.

산출물: `<run>/skeleton-{before,after}.{json,md}`, `<run>/screens/*.png`, `<run>/gallery.html`.

## 성능 예산

- 첫 실행은 **기준선만** 기록한다. 라우트·엔드포인트별 예산(API p95, 모바일 LCP, ready)은 기준선을 본 뒤 팀이 합의해 프로필 `perf.budgets`에 넣는다.
- 예산이 없으면 리포트에 "예산 미정, 기준선 기록"이라고 쓰고 **성능을 판정에 쓰지 않는다**.
- 예산이 있으면 초과를 P1, 예산의 10% 이내 근접을 P2로 둔다.
- dev 서버 측정값으로는 예산 판정을 하지 않는다 — 해당 예산 항목은 `미검증`(prod build·staging 측정 필요)으로 남긴다.

## 판정

심각도 예시다. P0/P1/P2를 게이트 판정으로 옮기는 기준은 플러그인 루트 `references/issue-severity.md` §QA 판정 매핑을 따른다 — 이 문서는 임계값을 두지 않는다.

| 심각도 | 예 |
|---|---|
| P0 | 측정 중 핵심 경로가 반복해서 응답하지 않거나(타임아웃·5xx) ready에 도달하지 않음 — 재현 명령과 시도 수를 함께 |
| P1 | 합의된 예산 초과(prod build·staging 측정), 재조회·SPA 재진입에서 전체 스켈레톤 재노출, 스켈레톤 ↔ 실제 화면의 컨테이너 x·w 어긋남 |
| P2 | 예산 10% 이내 근접, 확인된 overfetch, 보류 중 가시 busy status 중복 |

측정 실패·재시도는 원시 결과에 모두 남기고 요약은 최신 시도 + 재시도 수로 쓴다(`references/qa-principles.md` 원칙 5).
