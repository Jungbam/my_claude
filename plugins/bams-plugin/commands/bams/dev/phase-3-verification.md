# Dev: Phase 3 — 검증

> 이 파일은 `/bams:dev`의 Phase 3를 실행합니다.
> 공통 규칙은 `_common.md`를 참조합니다.

## 입력 컨텍스트
- slug: {엔트리포인트에서 결정된 slug}
- 이전 Phase 산출물:
  - `.crew/artifacts/prd/{slug}-prd.md`
  - `.crew/artifacts/design/{slug}-design.md`
  - `.crew/artifacts/test/{slug}-tests.md`
  - 수정/생성된 모든 파일 목록

---

## Phase 3: 검증 (QA부장 + 평가부장 병렬)

Bash로 다음을 실행합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_start "{slug}" 7 "검증 (QA + 평가 병렬)" "Phase 3: 검증"
```

### Step 7. 3관점 리뷰 + 성과 평가 (병렬 실행)

pipeline-orchestrator에게 검증 Phase를 지시합니다.

Bash로 agent_start를 emit합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_start "{slug}" "pipeline-orchestrator-7-$(date -u +%Y%m%d)" "pipeline-orchestrator" "sonnet" "Step 7: 검증 Phase 위임"
```

서브에이전트 실행 (Task tool, subagent_type: **"bams-plugin:pipeline-orchestrator"**, model: **"sonnet"**):

> **Phase 3 검증 실행**
>
> **위임 메시지:**
> ```
> phase: 3
> slug: {slug}
> pipeline_type: dev
> context:
>   prd: .crew/artifacts/prd/{slug}-prd.md
>   design: .crew/artifacts/design/{slug}-design.md
>   changed_files: [{수정/생성된 모든 파일 목록}]
>   test_results: .crew/artifacts/test/{slug}-tests.md
>   config: .crew/config.md
> ```
>
> **수행할 작업 (2개 부서장 병렬 위임):**
>
> **1. qa-strategy(QA부장)에게 3관점 리뷰 위임:**
> ```
> task_description: "3관점(정확성, 보안+성능, 코드품질) 병렬 리뷰를 실행하라"
> input_artifacts:
>   - .crew/artifacts/prd/{slug}-prd.md
>   - {변경된 파일 목록}
> expected_output:
>   type: review_report
>   paths: [.crew/artifacts/review/{slug}-review.md]
> quality_criteria:
>   - 3관점 모두 커버
>   - 심각도별 분류 (Critical/Major/Minor)
>   - 중복 제거
> ```
>
> QA부장은 내부적으로 automation-qa, defect-triage, release-quality-gate 에이전트를 활용하여 3관점 리뷰를 병렬 실행합니다:
> - 관점 1: 기능적 정확성
> - 관점 2: 보안 + 성능
> - 관점 3: 코드 품질 + 유지보수성
>
> **2. product-analytics(평가부장)에게 성과 평가 위임:**
> ```
> task_description: "구현 결과의 성능과 비즈니스 지표를 평가하라"
> input_artifacts:
>   - .crew/artifacts/prd/{slug}-prd.md
>   - {변경된 파일 목록}
> expected_output:
>   type: evaluation_report
>   paths: [.crew/artifacts/evaluation/{slug}-eval.md]
> quality_criteria:
>   - 성능 기준 측정 (있는 경우)
>   - 비즈니스 KPI 영향 분석
> ```
>
> 평가부장은 performance-evaluation, business-kpi 에이전트를 활용합니다.
>
> **기대 산출물**: 리뷰 리포트, 평가 리포트

orchestrator 반환 후, Bash로 agent_end를 emit합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_end "{slug}" "pipeline-orchestrator-7-$(date -u +%Y%m%d)" "pipeline-orchestrator" "success" {duration_ms} "Step 7 완료: 검증 완료"
```

### 리뷰 결과 처리

1. 모든 발견 사항 수집, 중복 제거, 심각도 순 정렬
2. 리뷰 리포트를 `.crew/artifacts/review/{slug}-review.md`에 저장
3. 평가 리포트를 `.crew/artifacts/evaluation/{slug}-eval.md`에 저장

**Critical 이슈 발견 시:** 사용자에게 제시 후 Edit 도구로 수정 적용.
**Major 이슈 발견 시:** 사용자에게 제시 후 수정 여부 확인.

Phase 3 검증 완료 시, Bash로 다음을 실행합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" 7 "done" {duration_ms}
```
