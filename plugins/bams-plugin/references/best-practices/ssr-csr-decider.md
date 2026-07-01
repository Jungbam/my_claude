# Best Practice: ssr-csr-decider

## 1. 호출 컨텍스트
- **트리거**: design-import 파이프라인의 Phase B 또는 C에서 design-director가 위임. F2 guide-recomposer 및 F4 data-binding-mapper와 병렬 실행 가능.
- **입력**:
  - `.crew/artifacts/design/{slug}/guide-decomposition/components.json` (F1 산출물)
  - (선택) `.crew/artifacts/design/{slug}/data-binding/binding-map.json` (F4 산출물 — 상호 연동)
  - `src/` — 기존 `"use client"` 패턴 분석 (Read-only Grep)
- **출력**:
  - `ssr-decision/rendering-strategy.json` (컴포넌트별 Server/Client 결정 + 이유)
- **부서장**: design-director
- **모델**: gpt-5-codex (codex CLI 위임) + sonnet controller

## 2. 자주 발생하는 실수 3건

### 실수 1: `"use client"` 경계를 루트 컴포넌트에 배치 (번들 크기 폭증)
- **증상**: rendering-strategy.json에서 `HeroSection`, `PageLayout` 등 최상위 컴포넌트가 `"rendering": "client"`. 전체 하위 컴포넌트 트리가 Client Bundle에 포함.
- **원인**: 하위 인터랙티브 컴포넌트가 있으면 부모도 client로 처리하는 단순 논리.
- **회피**: "경계 최소화 원칙" 엄수 — `"use client"` 경계를 최대한 리프 노드로 내림. `boundary_type: "leaf"` 패턴 우선. `SearchInput`처럼 실제 이벤트 핸들러가 있는 말단 컴포넌트만 CC로 지정.

### 실수 2: F4 binding-map.json `component_type` 불일치 무시
- **증상**: F4가 `realtimePrice` 슬롯을 `"component_type": "client"`로 마킹했는데 F9는 해당 컴포넌트를 `"rendering": "server"`로 결정. frontend-engineering이 어느 것을 따를지 불명확하여 블로킹.
- **원인**: F4 binding-map.json Read 없이 독립적으로 결정.
- **회피**: binding-map.json 존재 시 반드시 Read → `component_type` 값을 rendering-strategy.json 초기값으로 설정 → 이후 인터랙티비티 분석으로 오버라이드 판단. 불일치 발생 시 `"conflict": true` 필드 추가 + design-director 경유 F4 협의.

### 실수 3: reason 필드 1줄 기록 누락
- **증상**: rendering-strategy.json 항목에 `"reason": ""` 또는 필드 자체 없음. frontend-engineering이 경계 결정 근거 파악 불가.
- **원인**: codex 위임 후 반환값에서 reason 필드 검증 없이 그대로 저장.
- **회피**: 모든 컴포넌트 항목에 reason 1줄 필수. codex 위임 프롬프트에 "각 컴포넌트마다 결정 이유를 이벤트 핸들러/state/브라우저 API/context 중 하나 이상 명시하여 1줄로 기록하라" 명시. Write 전 `jq '[.components[] | select(.reason == "" or .reason == null)] | length' rendering-strategy.json` 0 확인.

## 3. 권장 패턴

- **패턴 A — Server Component 우선 룰 적용**:
  ```bash
  # codex 위임 예시
  run_codex "다음 컴포넌트 목록에서 useState/useEffect/useRef/onClick/onChange/window/document 사용 여부를 분석하여 SC/CC를 결정하라. 경계는 최대한 리프 노드로 내림. 각 항목에 reason 1줄 포함. 결과: rendering-strategy.json 스키마 JSON: $(cat components.json)"
  ```
- **패턴 B — 기존 코드베이스 "use client" 과다 감지**:
  ```bash
  # 기존 패턴 분석
  grep -rn '"use client"' src/ --include="*.tsx" | wc -l
  # 과다 사용 시(전체 컴포넌트 50% 이상) design-director에 보고
  ```
- **패턴 C — use_client_directives 배열 생성**: rendering-strategy.json 루트에 `"use_client_directives": [{"file": "src/app/dashboard/SearchInput.tsx", "component": "SearchInput"}]` 배열 추가. F6 nextjs-convention-mapper가 컨벤션 매핑 시 직접 활용.

## 4. 체크리스트 (5건 필수)
- [ ] F4 binding-map.json 존재 시 Read + component_type 불일치 여부 확인
- [ ] frontmatter `model: gpt-5-codex` + result_summary `"RSC:N(N%) / CC:N (via gpt-5-codex)"` 포함
- [ ] viz `agent_start` (작업 시작 전) / `agent_end` (완료 후) emit 누락 0
- [ ] 모든 컴포넌트 `reason` 필드 비어있지 않음 (`jq` 검증 완료)
- [ ] `use_client_directives` 배열 rendering-strategy.json 루트에 포함 (F6 핸드오프용)

## 5. 참고
- 부모 deep-review: deep-review_designimport품질진단_20260630
- 후속 hotfix: PR #14 (Critical) + PR #15 (Major)
- 본 plan: plan_designimport정밀화 (F-R-A1)
- 협업: F1 guide-decomposer (components.json 수신), F4 data-binding-mapper (binding-map.json 상호 연동), F6 nextjs-convention-mapper (rendering-strategy.json 공유), frontend-engineering (use client 배치)
