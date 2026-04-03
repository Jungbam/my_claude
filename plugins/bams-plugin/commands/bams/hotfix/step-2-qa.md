# Hotfix: Step 2 — QA 검증

> 이 파일은 `/bams:hotfix`의 Step 2를 실행합니다.
> 공통 규칙은 `_common.md`를 참조합니다 (엔트리포인트에서 이미 로드됨).

## 입력 컨텍스트

- slug: {엔트리포인트에서 결정된 slug}
- fix_artifacts: `.crew/artifacts/hotfix/{slug}-triage.md` (Step 1 산출물)
- _QA_SKILL: 공통 규칙에서 로드된 QA 스킬 경로

---

## Step 2: QA 검증 (bams browse 스킬, 선택)

Bash로 다음을 실행합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_start "{slug}" 2 "QA 검증" "Phase 2: 검증"
```

**스킬 미설치 시**: `skipped` 기록.

pipeline-orchestrator에게 QA 검증을 지시합니다.

Bash로 agent_start를 emit합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_start "{slug}" "pipeline-orchestrator-2-$(date -u +%Y%m%d)" "pipeline-orchestrator" "sonnet" "Step 2: QA 검증 위임"
```

서브에이전트 실행 (Task tool, subagent_type: **"bams-plugin:pipeline-orchestrator"**, model: **"sonnet"**):

> **핫픽스 QA 검증 모드** — 수정 사항의 회귀 여부를 빠르게 검증합니다.
>
> **위임 메시지:**
> ```
> phase: 2
> slug: {slug}
> pipeline_type: hotfix
> context:
>   fix_artifacts: .crew/artifacts/hotfix/{slug}-triage.md
> constraints:
>   urgency: critical
>   scope: regression_only
> ```
>
> **수행할 작업:**
> qa-strategy(QA부장)에게 테스트 계획 수립을 위임합니다:
> ```
> task_description: "핫픽스 회귀 테스트 계획을 수립하고 automation-qa로 실행하라"
> input_artifacts:
>   - .crew/artifacts/hotfix/{slug}-triage.md
> expected_output:
>   type: qa_test_plan
> quality_criteria:
>   - 수정된 영역 회귀 테스트 포함
>   - 관련 사이드 이펙트 체크 포함
> ```
>
> qa-strategy는 내부적으로 automation-qa 에이전트를 활용하여 테스트를 실행합니다.

orchestrator 반환 후, Bash로 agent_end를 emit합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_end "{slug}" "pipeline-orchestrator-2-$(date -u +%Y%m%d)" "pipeline-orchestrator" "success" {duration_ms} "Step 2 완료: QA 검증 완료"
```

AskUserQuestion — "브라우저 QA 테스트를 진행할까요?"
- **건너뛰기 (Recommended)**
- **QA 진행** — URL 입력 후 `_QA_SKILL` 실행

Step 2 완료 시, Bash로 다음을 실행합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" 2 "{status}" {duration_ms}
```

---

## Step 2 게이트 조건

- [ ] 회귀 테스트 계획 수립 완료
- [ ] automation-qa 실행 완료 (또는 skipped)
- [ ] 브라우저 QA 완료 (또는 건너뜀)
- [ ] QA 이슈 없음 또는 해결 완료

Step 2 완료 → 엔트리포인트가 Step 3-4를 라우팅합니다.
