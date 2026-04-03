---
description: 버그 핫픽스 — 디버깅 → QA → 검증 → 배포 빠른 경로
argument-hint: <버그 설명 또는 에러 메시지>
---

# Bams: Hotfix

버그를 진단하고 수정한 뒤, 검증과 배포까지 빠르게 진행하는 핫픽스 파이프라인입니다.

## Pre-flight

**`references/preflight-protocol.md` 참조.** 표준 프로토콜을 따릅니다.

차이점:
- config.md 없어도 계속 진행 가능.
- 인자 비어있으면 AskUserQuestion으로 버그 설명 받기.
- Gotchas에서 버그 영역과 관련된 항목을 디버거 힌트로 전달.

스킬 로딩:

```bash
_QA_SKILL=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/skills/qa-only/SKILL.md" 2>/dev/null | head -1)
_SHIP_SKILL=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/skills/ship/SKILL.md" 2>/dev/null | head -1)
_DEPLOY_SKILL=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/skills/land-and-deploy/SKILL.md" 2>/dev/null | head -1)
```

진행 추적 파일: `templates/hotfix-tracking.md` 기반으로 생성.

### Viz 이벤트: pipeline_start

진행 추적 파일 및 lock 파일 생성 직후, Bash로 다음을 실행합니다:

```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" pipeline_start "{slug}" "hotfix" "/bams:hotfix" "{arguments}"
```

### ★ Viz Agent 이벤트 규칙

**`references/viz-agent-protocol.md` 참조.** 모든 서브에이전트 호출 전후에 반드시 agent_start/agent_end 이벤트를 emit한다. orchestrator 내부에서 부서장/에이전트를 호출할 때도 동일하게 적용한다.


## ★ 위임 원칙 — 커맨드 레벨 직접 수정 금지

**이 커맨드에서 직접 Read/Edit/Write로 코드를 수정하지 않는다.**
모든 코드 수정은 `pipeline-orchestrator → 부서장 → 에이전트` 위임 체계를 통해 수행한다.

- 허용: Bash, Glob으로 상태 확인, viz 이벤트 emit, 사용자 질문
- 금지: Edit/Write로 소스 코드 직접 변경, Read 없이 결과 가정
- **위반 시**: 즉시 중단하고 pipeline-orchestrator에게 해당 작업을 위임할 것

## Step 0.5: 파이프라인 타입 검증

Pre-flight 완료 직후, 입력 내용이 hotfix에 적합한지 확인합니다.

**타입 판별 기준:**

| 입력 특성 | 적합한 파이프라인 |
|-----------|-----------------|
| 재현 가능한 버그, 에러 메시지, 기존 기능 오작동 | hotfix (계속 진행) |
| 새로운 기능 추가, "~를 만들어줘", 신규 화면 | feature |
| 기존 피처 개선, 리팩토링, 성능 최적화 | dev |
| 보안 취약점, OWASP 관련 | security |

$ARGUMENTS를 분석하여:
1. **hotfix에 적합**: 바로 Step 1로 진행
2. **다른 파이프라인이 적합**: AskUserQuestion으로 사용자에게 안내

Question: "입력 내용이 버그 픽스보다 {적합한 파이프라인} 작업에 가까워 보입니다."
Header: "파이프라인 타입 불일치"
Options:
- **hotfix로 계속** — "현재 파이프라인으로 진행"
- **/{적합한 파이프라인} 사용** — "올바른 파이프라인으로 재시작 (현재 파이프라인 중단)"

## Step 0.6: Parent Pipeline 연결

이 핫픽스가 수정하는 원본 파이프라인을 연결합니다.

Bash로 최근 파이프라인 목록을 조회합니다:

```bash
echo "=== 최근 파이프라인 목록 ==="
ls -t ~/.bams/artifacts/pipeline/*-events.jsonl 2>/dev/null | head -10 | while read f; do
  slug=$(basename "$f" -events.jsonl)
  type=$(grep '"pipeline_start"' "$f" 2>/dev/null | head -1 | jq -r '.pipeline_type // "unknown"' 2>/dev/null)
  echo "  $slug ($type)"
done
```

AskUserQuestion — "이 핫픽스가 수정하는 파이프라인을 선택하세요"
Header: "Parent"
Options:
- 조회된 파이프라인 목록에서 최근 5개를 옵션으로 제시
- **없음** — "새로운 독립 핫픽스 (특정 파이프라인과 무관)"

선택된 parent_pipeline_slug를 이후 pipeline_start emit 시 6번째 인자로 전달합니다.

기존 pipeline_start emit 라인을 수정:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" pipeline_start "{slug}" "hotfix" "/bams:hotfix" "{arguments}" "{parent_pipeline_slug}"
```

## Step 1: 버그 진단 + 수정

Bash로 다음을 실행합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_start "{slug}" 1 "버그 진단 + 수정" "Phase 1: 진단/수정"
```

pipeline-orchestrator에게 긴급 진단 및 수정을 지시합니다.

Bash로 agent_start를 emit합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_start "{slug}" "pipeline-orchestrator-1-$(date -u +%Y%m%d)" "pipeline-orchestrator" "sonnet" "Step 1: 버그 진단 + 수정 위임"
```

서브에이전트 실행 (Task tool, subagent_type: **"bams-plugin:pipeline-orchestrator"**, model: **"sonnet"**):

> **핫픽스 긴급 진단 모드** — 버그를 즉시 진단하고 수정합니다.
>
> **위임 메시지:**
> ```
> phase: 1
> slug: {slug}
> pipeline_type: hotfix
> context:
>   config: .crew/config.md
>   bug_description: {$ARGUMENTS}
>   gotchas: [config.md에서 버그 영역 관련 항목 전달]
> constraints:
>   urgency: critical
> ```
>
> **수행할 작업:**
>
> 1. defect-triage를 호출하여 결함 분류 및 근본 원인 추적을 지시합니다:
> ```
> task_description: "버그를 긴급 분류하고 근본 원인을 추적하라"
> input_artifacts:
>   - .crew/config.md
>   - bug_description: {$ARGUMENTS}
> expected_output:
>   type: defect_analysis
>   paths: [.crew/artifacts/hotfix/{slug}-triage.md]
> quality_criteria:
>   - 근본 원인 식별
>   - 영향 범위(Impact Analysis) 완료
>   - Scope Lock 확정
> ```
>
> 2. defect-triage 결과를 바탕으로 개발부장에게 외과적 수정을 위임합니다:
> ```
> task_description: "근본 원인에 맞는 최소 범위 수정을 적용하고 회귀 테스트를 생성하라"
> input_artifacts:
>   - .crew/artifacts/hotfix/{slug}-triage.md
> expected_output:
>   type: code_fix + regression_tests
> quality_criteria:
>   - 수정 파일 최소화 (범위 외 변경 금지)
>   - Root Cause Verification 통과
>   - 회귀 테스트 생성 완료
> ```
>
> **기대 산출물**: 결함 분석 리포트, 수정된 코드, 회귀 테스트

orchestrator 반환 후, Bash로 agent_end를 emit합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_end "{slug}" "pipeline-orchestrator-1-$(date -u +%Y%m%d)" "pipeline-orchestrator" "success" {duration_ms} "Step 1 완료: 결함 분석 + 수정 완료"
```

Step 1 완료 시, Bash로 다음을 실행합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" 1 "done" {duration_ms}
```

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

## Step 3-4: CI/CD 프리플라이트 + 출시 준비 검토 (오버랩)

Bash로 다음을 실행합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_start "{slug}" 3 "CI/CD 프리플라이트" "Phase 3: 배포 준비"
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_start "{slug}" 4 "출시 준비 검토" "Phase 3: 배포 준비"
```

**Step 3 — CI/CD 프리플라이트:**

Bash로 agent_start를 emit합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_start "{slug}" "pipeline-orchestrator-3-$(date -u +%Y%m%d)" "pipeline-orchestrator" "sonnet" "Step 3: CI/CD 프리플라이트 위임"
```

pipeline-orchestrator에게 CI/CD 검증을 지시합니다. orchestrator는 개발부장에게 `/bams:verify` 실행을 위임합니다. FAIL 시 자동 수정(최대 2회) / 수동 / 무시.

orchestrator 반환 후, Bash로 agent_end를 emit합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_end "{slug}" "pipeline-orchestrator-3-$(date -u +%Y%m%d)" "pipeline-orchestrator" "success" {duration_ms} "Step 3 완료: CI/CD 검증 완료"
```

**Step 4 — 출시 준비 검토 (Step 3 PASS 시):**
**스킬 미설치 시**: "수동 PR 생성" 안내 후 `skipped`.

Bash로 agent_start를 emit합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_start "{slug}" "pipeline-orchestrator-4-$(date -u +%Y%m%d)" "pipeline-orchestrator" "sonnet" "Step 4: 출시 준비 검토 위임"
```

pipeline-orchestrator에게 출시 준비 검토를 지시합니다. orchestrator는 qa-strategy(QA부장)에게 release-quality-gate 실행을 위임합니다.
**최적화**: verify PASS 판정이 나오면 release-quality-gate는 verify 결과를 기다리지 않고 즉시 코드 리뷰 기반 검토를 시작합니다. verify 결과는 RQG에 후속 전달됩니다.

orchestrator 반환 후, Bash로 agent_end를 emit합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_end "{slug}" "pipeline-orchestrator-4-$(date -u +%Y%m%d)" "pipeline-orchestrator" "success" {duration_ms} "Step 4 완료: 출시 준비 검토 완료"
```

AskUserQuestion — "PR을 생성할까요?"
- **Ship (Recommended)** — `_SHIP_SKILL` 실행
- **나중에** — `status: paused_at_step_4` 기록 후 종료.

Step 3-4 완료 시, Bash로 다음을 실행합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" 3 "{status}" {duration_ms}
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" 4 "{status}" {duration_ms}
```

## Step 5: 배포 (bams deploy 스킬, 선택)

Bash로 다음을 실행합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_start "{slug}" 5 "배포" "Phase 4: 배포"
```

Bash로 agent_start를 emit합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_start "{slug}" "pipeline-orchestrator-5-$(date -u +%Y%m%d)" "pipeline-orchestrator" "sonnet" "Step 5: 배포 환경 점검 위임"
```

pipeline-orchestrator에게 배포 환경 점검을 지시합니다. orchestrator는 개발부장을 통해 `platform-devops` 에이전트로 배포 환경을 점검합니다.

orchestrator 반환 후, Bash로 agent_end를 emit합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_end "{slug}" "pipeline-orchestrator-5-$(date -u +%Y%m%d)" "pipeline-orchestrator" "success" {duration_ms} "Step 5 완료: 배포 환경 점검 완료"
```

AskUserQuestion — "즉시 배포할까요?"
- **나중에 (Recommended)**
- **배포** — `_DEPLOY_SKILL` 실행

Step 5 완료 시, Bash로 다음을 실행합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" 5 "{status}" {duration_ms}
```

## Step 4.5: 에이전트 개선점 수집

pipeline-orchestrator에게 개선점 수집을 지시합니다.

Bash로 agent_start를 emit합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_start "{slug}" "pipeline-orchestrator-6-$(date -u +%Y%m%d)" "pipeline-orchestrator" "opus" "Step 4.5: 에이전트 개선점 분석 위임"
```

서브에이전트 실행 (Agent tool, subagent_type: **"bams-plugin:pipeline-orchestrator"**, model: **"opus"**):

> **에이전트 개선점 분석 모드** — 이 핫픽스의 근본 원인이 된 에이전트를 식별하고 개선점을 기록합니다.
>
> **수행할 작업:**
> 1. `.crew/artifacts/hotfix/{slug}-triage.md`를 읽어 근본 원인 분석
> 2. 이 버그를 만든 에이전트(또는 스킬)를 식별
> 3. 일회성 실수인지 구조적 개선이 필요한지 판별:
>    - `.crew/memory/{agent}/improvements/` 디렉토리에서 동일 pattern_tag 기존 레코드 검색
>    - 기존 레코드가 있으면 type: structural, 없으면 type: one-off
> 4. `.crew/memory/{agent}/improvements/{date}-{slug}.md` 파일 생성:
>    ```yaml
>    ---
>    date: {YYYY-MM-DD}
>    pipeline_slug: {slug}
>    parent_pipeline_slug: {parent_slug or null}
>    agent: {agent_type}
>    pattern_tag: {카테고리 태그}
>    type: one-off | structural
>    severity: minor | major | critical
>    ---
>    
>    ## 근본 원인
>    {triage에서 식별된 근본 원인}
>    
>    ## 개선 제안
>    {에이전트 또는 스킬에 대한 구체적 개선 제안}
>    
>    ## 관련 파이프라인
>    - 원본: {parent_pipeline_slug}
>    - 핫픽스: {slug}
>    ```
> 5. structural 유형이고 동일 pattern_tag가 2회 이상이면:
>    - AskUserQuestion: "이 패턴이 반복되고 있습니다. 에이전트 개선을 진행할까요?"
>    - Yes → `references/agent-improvement-protocol.md`의 Evolution Hook 실행
>    - No → 기록만 남기고 종료

orchestrator 반환 후, Bash로 agent_end를 emit합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_end "{slug}" "pipeline-orchestrator-6-$(date -u +%Y%m%d)" "pipeline-orchestrator" "success" {duration_ms} "Step 4.5 완료: 에이전트 개선점 분석 완료"
```

## 마무리

### 자동 회고 (축소판)

pipeline_end 직전, pipeline-orchestrator에게 핫픽스 축소 회고를 지시합니다.

Bash로 agent_start를 emit합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_start "{slug}" "pipeline-orchestrator-7-$(date -u +%Y%m%d)" "pipeline-orchestrator" "sonnet" "마무리: 핫픽스 축소 회고 위임"
```

서브에이전트 실행 (Task tool, subagent_type: **"bams-plugin:pipeline-orchestrator"**, model: **"sonnet"**):

> **핫픽스 축소 회고 모드** — 파이프라인 완료 후 핵심 학습만 빠르게 수집합니다.
>
> **위임 메시지:**
> ```
> phase: retro
> slug: {slug}
> pipeline_type: hotfix
> context:
>   triage: .crew/artifacts/hotfix/{slug}-triage.md
> ```
>
> **수행할 작업:**
> executive-reporter를 호출하여 다음 항목을 기록합니다:
> 1. `hotfix:` — 근본 원인 + 영향 범위 요약
> 2. `vulnerable:` — 같은 영역에서 반복 버그가 감지되면 경고 수준 상향
> 3. `regression-test:` — 추가된 회귀 테스트 경로
>
> `.crew/board.md`의 관련 태스크를 `Done`으로 변경합니다.

orchestrator 반환 후, Bash로 agent_end를 emit합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_end "{slug}" "pipeline-orchestrator-7-$(date -u +%Y%m%d)" "pipeline-orchestrator" "success" {duration_ms} "마무리 완료: 축소 회고 및 board 업데이트 완료"
```

### Viz 이벤트: pipeline_end

파이프라인 종료 시, Bash로 다음을 실행합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" pipeline_end "{slug}" "{status}" {total} {completed} {failed} {skipped}
```
(`{status}`는 `completed` / `paused` / `failed` 중 하나, `{total}`은 5)

**`references/completion-protocol.md` 참조.** 표준 프로토콜을 따릅니다.

이 파이프라인의 Learnings 카테고리:
1. `hotfix:` — 근본 원인 + 영향 범위
2. `vulnerable:` — 같은 영역 반복 버그 시 경고 수준 상향
3. `regression-test:` — 추가된 회귀 테스트 경로

`.crew/board.md` 업데이트: 관련 태스크 있으면 `Done`으로 변경.


### TaskDB 연동 (DB가 존재하면 board.md 대신 DB 사용)

`.crew/db/bams.db`가 존재하면 DB를 우선 사용합니다:

```bash
# DB 존재 확인
if [ -f ".crew/db/bams.db" ]; then
  echo "[bams-db] DB 모드 활성화"
fi
```

**태스크 등록 시 (DB가 존재하면):** Bash로 bun 스크립트를 실행하여 TaskDB에 태스크를 등록합니다.

```bash
# DB가 존재하면 TaskDB에 태스크 등록
if [ -f ".crew/db/bams.db" ]; then
  bun -e "
    import { TaskDB } from './plugins/bams-plugin/tools/bams-db/index.ts';
    const db = new TaskDB('.crew/db/bams.db');
    db.createTask({ pipeline_slug: '{slug}', title: '{task_title}', status: 'in_progress', assignee_agent: '{agent}', phase: {phase} });
    db.close();
  "
fi
```

**파이프라인 완료 시 (DB가 존재하면):** board.md를 DB 스냅샷으로 갱신합니다.

```bash
if [ -f ".crew/db/bams.db" ]; then
  bun run plugins/bams-plugin/tools/bams-db/sync-board.ts {slug} --write
fi
```

DB가 없으면 기존 board.md 방식을 유지합니다.

