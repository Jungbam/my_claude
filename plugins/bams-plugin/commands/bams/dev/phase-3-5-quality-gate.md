# Dev: Phase 3.5 — Quality Gate (Step 9)

> 이 파일은 `/bams:dev`의 Phase 3.5를 실행합니다.
> 공통 규칙은 `_common.md`를 참조합니다.

## 입력 컨텍스트
- slug: {엔트리포인트에서 결정된 slug}
- 이전 Phase 산출물:
  - `.crew/artifacts/prd/{slug}-prd.md`
  - `.crew/artifacts/design/{slug}-design.md`
  - `.crew/artifacts/review/{slug}-review.md`
  - `.crew/artifacts/evaluation/{slug}-eval.md`
  - `.crew/artifacts/test/{slug}-tests.md`

---

## Phase 3.5: Quality Gate (최대 3회 반복, 델타 기반)

Bash로 다음을 실행합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_start "{slug}" 9 "Quality Gate" "Phase 3.5: QG"
```

### Step 9. Quality Gate (project-governance 위임)

현재 반복 횟수를 `iteration = 1`로 초기화합니다.
`qg_baseline_commit`을 현재 HEAD 커밋 해시로 기록합니다.

### Quality Gate 루프

**iteration 1 (최초)**: 전체 구현 파일 검증.
**iteration 2-3 (반복)**: `git diff --name-only {qg_baseline_commit}..HEAD`로 **변경된 파일만** 검증 대상으로 전달. 이전 QG에서 PASS된 파일은 재검증하지 않습니다.

**루프 A (Simple) — 단일 부서장(project-governance)이므로 메인이 직접 spawn합니다.** (orchestrator 조언 생략, `_shared_common.md` 부록 참조)

Bash로 agent_start emit:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_start "{slug}" "project-governance-9-$(date -u +%Y%m%d)" "project-governance" "claude-fable-5" "Step 9: Quality Gate iteration {iteration}"
```

Task tool, subagent_type: **"bams-plugin:project-governance"** — 메인이 직접 호출:

> **Phase 3.5 Quality Gate 검증 (iteration {iteration}/3)**
>
> **컨텍스트:**
> ```
> phase: 3.5
> slug: {slug}
> pipeline_type: dev
> prd: .crew/artifacts/prd/{slug}-prd.md
> design: .crew/artifacts/design/{slug}-design.md
> review_report: .crew/artifacts/review/{slug}-review.md
> evaluation_report: .crew/artifacts/evaluation/{slug}-eval.md
> test_results: .crew/artifacts/test/{slug}-tests.md
> iteration: {iteration}
> max_iterations: 3
> verification_files: [{iteration 1이면 전체 파일, 2-3이면 변경된 파일만}]
> previous_qg_result: [{iteration 2-3이면 이전 QG의 PASS/FAIL 파일별 상세}]
> ```
>
> ```
> task_description: "구현 결과물의 최종 품질을 검증하라 (iteration {iteration}/3)"
> input_artifacts:
>   - .crew/artifacts/prd/{slug}-prd.md
>   - .crew/artifacts/design/{slug}-design.md
>   - .crew/artifacts/review/{slug}-review.md
>   - .crew/artifacts/test/{slug}-tests.md
> expected_output:
>   type: quality_gate_result
>   paths: [.crew/artifacts/qg/{slug}-qg-{iteration}.md]
> quality_criteria:
>   - 인수 기준 전체 충족
>   - Critical 이슈 0건
>   - 빌드 성공
>   - 타입 체크 통과
> ```
>
> 검증 대상 파일들을 직접 Read 도구로 읽어서 검증합니다.
>
> **판정 전 실측 필수**: '빌드 성공'과 '타입 체크 통과'는 파일 Read 추정이 아니라 **Bash로 실제 명령 실행 결과**로 판정한다. 명령은 대상 프로젝트 package.json scripts 우선, 없으면 `references/stack-profile.md` 표준 명령(typecheck `bunx tsc --noEmit` / lint / build). 실행 로그 요약(명령·종료코드)을 판정 리포트에 포함한다.
>
> **기대 산출물**: Quality Gate 판단 (PASS/FAIL), 파일별 상세 결과, 실행 로그 요약(명령·종료코드). QG 산출물(`.crew/artifacts/qg/{slug}-qg-{iteration}.md`)에는 FAIL 이슈별로 **재작업 대상 부서장**(frontend-engineering / backend-engineering / platform-devops 중 지정) 필드를 명시한다.

반환 후 agent_end emit:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_end "{slug}" "project-governance-9-$(date -u +%Y%m%d)" "project-governance" "success" {duration_ms} "Step 9 완료: Quality Gate iteration {iteration}"
```

**PASS인 경우:** board.md에서 태스크를 `## Done`으로 이동. Phase 4로 진행.

**FAIL인 경우 (iteration <= 3):**
- `qg_baseline_commit`을 현재 HEAD로 업데이트
- QG에서 지적한 이슈를 메인이 해당 부서장(frontend-engineering / backend-engineering 등)에게 직접 Task tool로 재작업 spawn (루프 A)
- 완료 후 Quality Gate 루프 재시작 (변경된 파일만 재검증)

**iteration > 3:** 사용자에게 수동 확인 안내. Phase 4로 진행.

Quality Gate 완료 시, Bash로 다음을 실행합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" 9 "{status}" {duration_ms}
```
