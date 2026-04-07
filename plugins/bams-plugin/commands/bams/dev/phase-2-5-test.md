# Dev: Phase 2.5 — 테스트 코드 생성

> 이 파일은 `/bams:dev`의 Phase 2.5를 실행합니다.
> 공통 규칙은 `_common.md`를 참조합니다.

## 입력 컨텍스트
- slug: {엔트리포인트에서 결정된 slug}
- 이전 Phase 산출물:
  - `.crew/artifacts/prd/{slug}-prd.md`
  - `.crew/artifacts/design/{slug}-design.md`
  - 구현에서 수정/생성된 파일 목록

---

## Phase 2.5: 테스트 코드 생성 (QA부장 위임)

Bash로 다음을 실행합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_start "{slug}" 6 "테스트 코드 생성" "Phase 2.5: 테스트"
```

### Step 6a. 테스트 작성 여부 묻기

**AskUserQuestion**:
Question: "구현과 병렬로 테스트 코드를 작성할까요?"
Header: "Tests"
Options:
- **Yes** - "각 배치 완료 즉시 테스트 작성 (구현과 병렬)"
- **나중에** - "모든 구현 완료 후 일괄 작성"
- **Skip** - "이번에는 테스트 스킵"

**Skip 선택 시**: Phase 2.5를 건너뛰고 Phase 3으로 진행합니다.

### Step 6b. 테스트 작성 (QA부장 위임)

pipeline-orchestrator에게 테스트 작성을 지시합니다.

Bash로 agent_start를 emit합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_start "{slug}" "pipeline-orchestrator-6-$(date -u +%Y%m%d)" "pipeline-orchestrator" "sonnet" "Step 6: 테스트 작성 위임"
```

서브에이전트 실행 (Task tool, subagent_type: **"bams-plugin:pipeline-orchestrator"**, model: **"sonnet"**):

> **Phase 2.5 테스트 작성 실행**
>
> **위임 메시지:**
> ```
> phase: 2.5
> slug: {slug}
> pipeline_type: dev
> context:
>   prd: .crew/artifacts/prd/{slug}-prd.md
>   design: .crew/artifacts/design/{slug}-design.md
>   changed_files: [{구현에서 수정/생성된 파일 목록}]
>   test_dir: {config.md의 test_dir 설정}
> ```
>
> **수행할 작업:**
> qa-strategy(QA부장)에게 테스트 작성을 위임합니다:
>
> ```
> task_description: "최근 구현된 코드에 대한 테스트를 작성하라"
> input_artifacts:
>   - .crew/artifacts/prd/{slug}-prd.md
>   - {테스트 커버리지가 없는 파일 목록}
> expected_output:
>   type: test_code
>   paths: [{test_dir}/**]
> quality_criteria:
>   - 핵심 유저 플로우 커버
>   - 엣지 케이스 테스트 포함
>   - 인수 기준 검증
> ```
>
> QA부장은 automation-qa 에이전트에게 테스트 작성을 분배합니다.
> 테스트 러너가 있으면 실행하여 결과를 보고합니다.
>
> **기대 산출물**: 테스트 코드, 테스트 계획 (.crew/artifacts/test/{slug}-tests.md), 실행 결과

orchestrator 반환 후, Bash로 agent_end를 emit합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_end "{slug}" "pipeline-orchestrator-6-$(date -u +%Y%m%d)" "pipeline-orchestrator" "success" {duration_ms} "Step 6 완료: 테스트 작성 완료"
```

**Yes 선택 시**: 배치별 오버랩 - `배치 N 테스트 작성 || 배치 N+1 구현`이 병렬로 진행됩니다.
**나중에 선택 시**: 모든 구현 완료 후 일괄 실행.

Phase 2.5 완료 시, Bash로 다음을 실행합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" 6 "{status}" {duration_ms}
```
