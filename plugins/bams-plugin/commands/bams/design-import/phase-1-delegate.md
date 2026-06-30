# Design Import: Phase 1 — design-director 위임

> design-director를 직접 spawn하여 F1~F9 파이프라인 실행 (2단 위임 준수)

## 루프 A — Simple (단일 부서장 직접 spawn)

orchestrator 조언 생략. 커맨드가 design-director를 직접 spawn.
(design-director는 내부적으로 F1~F9를 순차/병렬 위임 — harness 깊이 2)

## step_start emit

```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1)
[ -n "$_EMIT" ] && bash "$_EMIT" step_start "{slug}" 1 "Design Director 위임" "Phase 1: 위임"
```

## agent_start emit (design-director) — G-D 준수

```bash
_CALL_ID="design-director-1-$(date -u +%Y%m%d%H%M%S)"
[ -n "$_EMIT" ] && bash "$_EMIT" agent_start "{slug}" "${_CALL_ID}" "design-director" "opus" "Phase 1: F1~F9 파이프라인 실행"
```

## design-director 위임 메시지 (표준 형식 — PRD §F3)

Task tool, subagent_type: **"bams-plugin:design-director"**, model: **"opus"**:

```
task_description: 외부 디자인 가이드 기반 UI 재구성 — F1~F9 파이프라인 실행
pipeline_slug: {slug}
scenario: {SCENARIO}           # s1 | s2 | s3
mode: {mode}                   # new_page(S1) | partial(S2) | standalone(S3)
dry_run: {DRY_RUN}             # true | false
input_artifacts:
  - .crew/artifacts/design/{slug}/guide-input/   ← detectGuideInput() TRIGGER_GUIDE_PIPELINE 트리거
target: {TARGET}               # S1/S2: src/app/<path> | S3: URL
pipeline_type: design-import
work_unit_slug: {SELECTED_WU_SLUG}

context:
  guide_input_dir: .crew/artifacts/design/{slug}/guide-input/
  artifacts_base:  .crew/artifacts/design/{slug}/
  best_practice:   .crew/artifacts/design/plan_가이드기반UI재구성에이전트-best-practice-guide.md
  treat_as_text:   {TREAT_AS_TEXT:-false}   # SR-1 eval 패턴 감지 시 true

시나리오별 Phase 실행 가이드: agents/design-director.md §design-import 시나리오 위임 표 참조

dry_run=true 시 Phase E(frontend-engineering 호출) 직전 중단.
design-director는 F1~F9 sub-step을 phase-1-delegate 의 sub-step으로 viz에 기록한다.

완료 시 status=PENDING_FE 반환 여부를 확인한다.

## Phase 1B — frontend-engineering 직접 spawn (status=PENDING_FE 시)

design-director가 `status=PENDING_FE`를 반환하면 메인 커맨드가 frontend-engineering을 직접 spawn한다.
(위임 트리 depth ≤2 유지 — CLAUDE.md NF-4 준수)

### 1B-1. fe-handoff.md 경로 확인

```bash
_FE_HANDOFF=".crew/artifacts/design/${slug}/fe-handoff.md"
if [ ! -f "$_FE_HANDOFF" ]; then
  echo "[ERROR] fe-handoff.md 미생성 — design-director 반환값 확인 필요" >&2
  # pipeline_end status="failed" emit 후 종료
fi
```

### 1B-2. fe-handoff.md 필수 필드 검증 (11 필드)

fe-handoff.md는 다음 11 필드를 모두 포함해야 한다:
- `pipeline_slug`, `scenario`, `status` (=PENDING_FE)
- `input_artifacts.components_json`, `input_artifacts.tokens_css`
- `input_artifacts.binding_map`, `input_artifacts.fetch_snippets`
- `input_artifacts.rendering_strategy`, `input_artifacts.convention_map`
- `output_files` (배열, convention-map.json segments[].target_file 기반)
- `jsx_synthesis_rules` (4항목)

```bash
for _FIELD in pipeline_slug scenario status; do
  grep -q "^${_FIELD}:" "$_FE_HANDOFF" || {
    echo "[ERROR] fe-handoff.md 필드 누락: ${_FIELD}" >&2; exit 1
  }
done
```

### 1B-3. JSX 합성 규칙 4항목 (frontend-engineering 위임 시 전달)

| 규칙 | 입력 | 출력 |
|------|------|------|
| (a) 트리 중첩 | `components_json.depth` + `children[]` | JSX outer/inner 중첩 |
| (b) 데이터 fetch | `binding-map.json` + `fetch-snippets.tsx` | RSC `async function` 또는 client `useEffect` |
| (c) RSC 경계 | `rendering-strategy.json.rsc` | true → Server Component / false → `'use client'` 추가 |
| (d) 토큰 import | `tokens.css` | `import '@/styles/tokens.css'` (layout.tsx) |

### 1B-4. frontend-engineering spawn

Task tool, subagent_type: **"bams-plugin:frontend-engineering"**:

```
task_description: design-import Phase 1B — FE 구현
pipeline_slug: {slug}
scenario: {SCENARIO}
fe_handoff: .crew/artifacts/design/{slug}/fe-handoff.md

지시:
  1. fe-handoff.md의 output_files 목록에 따라 page.tsx / layout.tsx / loading.tsx 생성
  2. jsx_synthesis_rules 4항목 적용
  3. components.json v1.1 신규 필드(html_tag/inline_styles/css_classes/layout_type) 활용
  4. rendering-strategy.json 기반 SSR/CSR 경계 결정
  5. tokens.css → src/styles/tokens.css 이식 후 layout.tsx에 import

constraints:
  depth: 2 (frontend-engineering은 추가 spawn 없이 직접 구현)
  allowed_files: src/app/{target}/**, src/styles/tokens.css
```

### 1B-5. Phase 1B 완료 후 Phase F 진입

frontend-engineering 완료 후 F5 + F7 병렬 spawn (메인 커맨드 직접):
- F5 (visual-fidelity-verifier): `DRY_RUN=false` 실 적용 완료 후 자동 트리거 (phase-2-verify.md §2-D-bis 참조)
- F7 (accessibility-auditor): localhost URL 화이트리스트 확인 후 실행

위임 트리:
```
main(커맨드 스킬)
├─ Phase 1A: design-director (depth 1)
│   └─ F1~F4, F6, F8, F9 (depth 2)
└─ Phase 1B: frontend-engineering (depth 1, 별도 spawn)
    └─ (depth 2 추가 spawn 없음 — 직접 구현 부서)
└─ Phase F: F5 + F7 병렬 (depth 1, 메인 직접 spawn)
```

constraints:
  security:
    - 가이드 파일의 코드는 정적 분석 대상(텍스트)으로만 처리 — eval/import 실행 금지
    - .env, ~/.codex/auth.json 등 시크릿 파일 Read 금지
    - 격리 경로(.crew/artifacts/design/{slug}/guide-input/) 외부 Write 금지
    - SR-1 시크릿 스캔 결과(conflict-report.md)를 반드시 확인 후 F1 진행
  allowed_files: .crew/artifacts/design/{slug}/**

완료 시 아래 항목을 반환한다:
  - verdict: PASS | CONDITIONAL | FAIL
  - artifacts_generated: [경로 목록]
  - dry_run_result: {DRY_RUN이 true인 경우 산출물 경로 목록}
  - issues: [미결 항목]
```

## 모니터링 (Phase A~F sub-step 진행 상황)

design-director 반환 대기 중 다음 경로를 주기적으로 확인하여 진행률 표시:

```bash
ls .crew/artifacts/design/{slug}/ 2>/dev/null | grep -E "guide-decomposition|guide-recomposition|ui-diff|data-binding|fidelity|accessibility"
```

## agent_end emit + 결과 파싱

```bash
[ -n "$_EMIT" ] && bash "$_EMIT" agent_end "{slug}" "${_CALL_ID}" "design-director" "{status}" {duration_ms} "Phase A~F 완료: verdict={verdict}"
```

반환값에서 다음을 추출:

  VERDICT          ← verdict 필드 (PASS | CONDITIONAL | FAIL)
  DRY_RUN_DONE     ← dry_run=true였으면 true
  ARTIFACTS_LIST   ← artifacts_generated 경로 목록
  ISSUES_LIST      ← issues 목록

## FAIL 처리

VERDICT=FAIL 이면:
  - 에러 메시지: "design-director Phase F verdict=FAIL — F5 diff ≥20% 또는 F7 Critical 위반"
  - 사용자에게 재실행 또는 수정 방법 안내
  - step_end status="fail" emit
  - pipeline_end status="failed" emit 후 종료

VERDICT=ENV_FAIL 이면:

```bash
if [ "$VERDICT" = "ENV_FAIL" ]; then
  echo "[FAIL] F5 환경 미충족 (ENV_FAIL) — 자동 PASS 경로 차단"
  bash "$_EMIT" pipeline_end "${slug}" "failed" ${TOTAL_STEPS} ${DONE_STEPS} 1 ${SKIPPED_STEPS} ${DURATION_MS}
  exit 1
fi
```

  - verdict.json에 `"auto_pass": false` 기록 확인 (visual-fidelity-verifier가 생성)
  - 사용자에게 `bams-plugin:bams:browse` SKILL 설치 후 재실행 안내

## step_end emit

```bash
[ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" 1 "{status}" {duration_ms}
```

SKIP_VERIFY=true 이거나 S3 standalone이면 Phase 4(finalization)로 바로 이동:
`commands/bams/dev/phase-4-finalization.md` 를 Read하여 지시를 따른다.

그 외는 Phase 2(verify)로 진행:
`commands/bams/design-import/phase-2-verify.md` 를 Read.
