# Best Practice: routing-strategist

## 1. 호출 컨텍스트
- **트리거**: design-import 파이프라인의 Phase E에서 design-director가 조건부 위임. **트리거 조건: F1 산출물 components.json에 페이지 >= 2인 경우에만 호출. 단일 페이지 가이드는 본 단계 생략.**
- **입력**:
  - `.crew/artifacts/design/{slug}/guide-decomposition/components.json` (F1 산출물 — 페이지 목록)
  - (선택) 가이드의 네비게이션 구조 설명 (호출자 텍스트)
  - `src/app/` — 현행 라우팅 구조 (Read-only Glob)
  - (선택) PRD 페이지 구조 섹션
- **출력**:
  - `routing/route-tree.json` (App Router 라우팅 트리)
  - `routing/nav-strategy.md` (네비게이션 전략)
  - `routing/conflict-routes.md` (기존 라우팅 충돌 목록)
- **부서장**: design-director
- **모델**: gpt-5-codex (codex CLI 위임) + sonnet controller

## 2. 자주 발생하는 실수 3건

### 실수 1: Preflight 페이지 수 확인 없이 실행 (단일 페이지 미스)
- **증상**: 페이지 1개짜리 가이드에 routing-strategist 실행 → route-tree.json에 라우트 1개만 생성되고 Phase E 불필요하게 소요.
- **원인**: design-director 위임 메시지에서 페이지 수 확인 없이 바로 실행.
- **회피**: 작업 시작 시 반드시 Preflight:
  ```bash
  PAGE_COUNT=$(bun -e "const c=JSON.parse(require('fs').readFileSync('components.json','utf8')); console.log(c.components.filter(x=>x.depth===0||/Page|Screen|View/i.test(x.name)).length)")
  [ "$PAGE_COUNT" -lt 2 ] && echo "[routing-strategist] 단일 페이지 — Phase E 생략" && exit 0
  ```

### 실수 2: 동적 세그먼트에 generateStaticParams 누락
- **증상**: route-tree.json의 동적 라우트(`/dashboard/[teamId]`)에 `"generate_static_params": false`만 기록. frontend-engineering이 SSG 불가 상태로 구현.
- **원인**: 동적 세그먼트 식별 후 렌더링 전략(`dynamic` vs `static`) 명시 없이 route-tree.json 저장.
- **회피**: 동적 세그먼트마다 반드시 `"generate_static_params": boolean` + `"dynamic": "force-dynamic" | "auto" | "force-static"` 명시. F9 ssr-csr-decider 결과 있으면 연동.

### 실수 3: 기존 `src/app/` 라우팅 Glob 없이 충돌 미감지
- **증상**: conflict-routes.md가 빈 파일로 생성. 실제로는 기존 `/app/dashboard/page.tsx`와 가이드 `/dashboard` 라우트 충돌 존재.
- **원인**: 현행 라우팅 Glob 스캔 없이 바로 route-tree.json 생성.
- **회피**: 반드시 `Glob("src/app/**/*.tsx")` 먼저 실행하여 기존 세그먼트 목록 추출. 신규 라우트와 교집합 체크. 충돌 시 conflict-routes.md에 기록 + design-director 결정 요청 (자동 덮어쓰기 금지).

## 3. 권장 패턴

- **패턴 A — 현행 라우팅 Glob 선행**: `Glob("src/app/**/page.tsx")` 결과를 세그먼트 트리로 파싱 후 가이드 페이지 구조와 비교. codex 위임: `run_codex "현행 라우팅 ${existing}과 가이드 페이지 ${guide_pages}를 비교하여 충돌을 식별하고 통합 route-tree.json을 생성하라"`.
- **패턴 B — 라우트 그룹 (group) 적극 활용**: 공유 네비게이션/헤더 범위가 동일한 라우트들은 `(group)` 패턴으로 묶어 URL 변경 없이 layout.tsx 공유. route-tree.json `groups` 배열에 명시.
- **패턴 C — parallel/intercepting 라우트는 명시적 근거 필수**: `@slot` 병렬 라우트나 `(.)`인터셉팅 라우트는 남용하면 복잡도 폭증. 각 사용 건마다 "왜 일반 중첩 레이아웃으로 처리 불가한가" 근거를 nav-strategy.md에 1줄 기록.

## 4. 체크리스트 (5건 필수)
- [ ] Preflight: components.json 페이지 수 >= 2 확인 (미달 시 Phase E 생략 보고)
- [ ] 현행 `src/app/` Glob 스캔 완료 + 충돌 목록 conflict-routes.md 생성
- [ ] viz `agent_start` (작업 시작 전) / `agent_end` (완료 후) emit 누락 0
- [ ] 동적 세그먼트마다 `generate_static_params` + `dynamic` 전략 명시
- [ ] route-tree.json `"via": "gpt-5-codex (codex CLI)"` 필드 포함

## 5. 참고
- 부모 deep-review: deep-review_designimport품질진단_20260630
- 후속 hotfix: PR #14 (Critical) + PR #15 (Major)
- 본 plan: plan_designimport정밀화 (F-R-A1)
- 협업: F1 guide-decomposer (components.json 수신), F6 nextjs-convention-mapper (병렬 — 단일 페이지 컨벤션), F9 ssr-csr-decider (라우트별 렌더링 전략), frontend-engineering (route-tree.json 수신하여 세그먼트 디렉터리 생성)
