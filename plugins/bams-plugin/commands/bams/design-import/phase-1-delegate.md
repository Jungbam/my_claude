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

시나리오별 Phase 실행 가이드:
  S1(new_page):    Phase A(F1) → B(F2) → C(F4,F9 병렬) → D(F6[,F8]) → E(FE) → F(F5,F7 병렬)
                   F3 skip (신규 페이지 — diff 대상 없음)
  S2(partial):     Phase A(F1) → B(F2) → C(F3[opus],F4,F9 병렬) → D(F6) → E(FE) → F(F5,F7 병렬)
                   F3 필수 (기존 파일 patch.diff + conflict-report)
  S3(standalone):  F5 단독 호출 [+ F7 선택]

dry_run=true 시 Phase E(frontend-engineering 호출) 직전 중단.
design-director는 F1~F9 sub-step을 phase-1-delegate 의 sub-step으로 viz에 기록한다.

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

## step_end emit

```bash
[ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" 1 "{status}" {duration_ms}
```

SKIP_VERIFY=true 이거나 S3 standalone이면 Phase 4(finalization)로 바로 이동:
`commands/bams/dev/phase-4-finalization.md` 를 Read하여 지시를 따른다.

그 외는 Phase 2(verify)로 진행:
`commands/bams/design-import/phase-2-verify.md` 를 Read.
