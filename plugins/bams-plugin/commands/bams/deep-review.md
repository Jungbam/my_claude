---
description: 5관점 병렬 + 구조적 리뷰 + Codex 세컨드 오피니언 심층 조사 (--aspect 지원: spec/functional/performance/code/uiux/all. 출시 게이트 미포함 — 게이트는 `/bams:review`)
argument-hint: [파일/디렉토리/pr] [--aspect <spec|functional|performance|code|uiux|all>[,...]]
---

> **사용 시점**: 5관점 + 구조적 리뷰 + Codex 세컨드 오피니언까지 포함한 심층 리뷰가 필요할 때. review의 상위 확장.
>
> 본 커맨드와 review의 차이는 `references/multi-perspective-review.md` §역할 구분 참조 — **출시 게이트 미포함 — /bams:review Phase 4 또는 /bams:ship 필요**.
>
> **`references/issue-severity.md` §Release Gate 임계값 참조.**
>
> 차이점: 본 파이프라인은 게이트 판정을 직접 수행하지 않음 (심각도 정렬까지만 수행, N값 판정은 /bams:review Phase 4에서 적용).
>
> --aspect 지원 — 인자 없으면 기존 5관점(code aspect) 흐름과 100% 동일.

# Bams: Deep Review

3개 리뷰 시스템을 실행하여 코드를 다각도로 검증합니다.

## Pre-flight

**`references/preflight-protocol.md` 참조.** 표준 프로토콜을 따릅니다.

차이점:
- config.md 없어도 계속 진행 가능.
- 리뷰 대상: 인자 → `git diff` → `git diff --cached` → `git diff main...HEAD` 순. 모두 없으면 AskUserQuestion.
- 이전 리뷰(24시간 이내, 이후 변경 없음) 있으면 변경분만 리뷰. 미해결 이슈도 추적.
- Gotchas 영역은 리뷰 시 중점 확인 대상으로 전달.

스킬 로딩:

```bash
_REVIEW_SKILL=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/skills/review/SKILL.md" 2>/dev/null | head -1)
_CODEX_SKILL=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/skills/codex/SKILL.md" 2>/dev/null | head -1)
```

진행 추적 파일: `templates/deep-review-report.md` 기반으로 생성.

### Viz 이벤트: pipeline_start

진행 추적 파일 및 lock 파일 생성 직후, Bash로 다음을 실행합니다:

```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" pipeline_start "{slug}" "deep-review" "/bams:deep-review" "{arguments}"
```

### ★ Viz Agent 이벤트 규칙

**`references/viz-agent-protocol.md` 참조.** 모든 서브에이전트 호출 전후에 반드시 agent_start/agent_end 이벤트를 emit한다. orchestrator 내부에서 부서장/에이전트를 호출할 때도 동일하게 적용한다.

## Aspect 파싱

`references/multi-perspective-review.md` §--aspect 인자 파싱 규칙을 Read하여 그 절차를 따른다 (Pattern A).

- `ASPECT_LIST == ["code"]`(인자 없음)이면 본 섹션 이후 아무 것도 변경되지 않는다 — **이하 Step 0.5~Step 4·마무리를 기존과 완전히 동일하게 실행**(하위 호환).
- 그 외의 경우, 이후 Step 1-2-3에서 `ASPECT_LIST`를 참조한다.

## Step 0.5: Parent Pipeline 연결

이 리뷰가 분석하는 원본 파이프라인을 연결합니다.

Bash로 최근 파이프라인 목록을 조회합니다:

```bash
echo "=== 최근 파이프라인 목록 ==="
ls -t ~/.bams/artifacts/pipeline/*-events.jsonl 2>/dev/null | head -10 | while read f; do
  slug=$(basename "$f" -events.jsonl)
  type=$(grep '"pipeline_start"' "$f" 2>/dev/null | head -1 | jq -r '.pipeline_type // "unknown"' 2>/dev/null)
  echo "  $slug ($type)"
done
```

AskUserQuestion — "이 리뷰가 분석하는 파이프라인을 선택하세요"
Header: "Parent"
Options:
- 조회된 파이프라인 목록에서 최근 5개를 옵션으로 제시
- **없음** — "독립 리뷰 (특정 파이프라인과 무관)"

선택된 parent_pipeline_slug를 이후 pipeline_start emit 시 6번째 인자로 전달합니다.

기존 pipeline_start emit 라인을 수정:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" pipeline_start "{slug}" "deep-review" "/bams:deep-review" "{arguments}" "{parent_pipeline_slug}"
```

### Parent Pipeline의 WU 자동 상속

**`references/parent-wu-inheritance.md`를 Read하여 지시를 따른다.** 해당 파일의 bash 스크립트를 실행하여 WU를 상속한다.

AskUserQuestion에서 "없음" 선택 시: `PARENT_PIPELINE_SLUG=""`로 설정하여 상속 로직을 스킵한다.

> **위임 체계 (Canonical)**: 이 커맨드는 `_shared_common.md` §위임 원칙 + 부록 **루프 B**(Advised 병렬)를 따른다. Step 1-3의 5관점 리뷰·구조적 리뷰·Codex 리뷰는 메인이 qa-strategy 부서장 및 리뷰 스킬을 **직접** 병렬 spawn한다. Step 4는 orchestrator를 조언자로 1회 호출한다. orchestrator를 경유한 중첩 spawn 금지(harness 깊이 2 제약).

## Step 1-2-3: 리뷰 실행 전략 선택

**AskUserQuestion** — "리뷰 범위를 선택하세요:"
- **풀 리뷰 (Recommended)** — 5관점 병렬 + 구조적 리뷰 + Codex 전부 **동시 실행**
- **5관점만** — 5관점 병렬 리뷰만 실행
- **5관점 + 구조적** — 5관점 + 구조적 리뷰 (Codex 제외)

(스킬 미설치 시 해당 옵션 비활성. Codex CLI 미설치 시 해당 옵션 비활성.)

### 실행

Bash로 다음을 실행합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_start "{slug}" 1 "5관점 리뷰" "Phase 1: 리뷰"
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_start "{slug}" 2 "구조적 리뷰" "Phase 1: 리뷰"
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_start "{slug}" 3 "Codex 세컨드 오피니언" "Phase 1: 리뷰"
```
(선택되지 않은 Step은 즉시 `skipped`로 step_end를 기록합니다)

config.md의 컨벤션 + 관련 gotchas + 이전 미해결 이슈를 리뷰 에이전트에 전달.

**선택에 따라 모든 리뷰를 최대한 병렬로 실행합니다:**

**Step 1 — 5개 qa-strategy 에이전트** (항상 병렬):
5관점 정의는 `references/multi-perspective-review.md` §code aspect — 5관점 정의 참조.

**Step 2 — 구조적 리뷰** (선택 시 Step 1과 **동시 실행**):
`_REVIEW_SKILL` 실행

**Step 3 — Codex 세컨드 오피니언** (선택 시 Step 1과 **동시 실행**):
`_CODEX_SKILL` 실행

**풀 리뷰 선택 시**: Step 1 (5에이전트) + Step 2 + Step 3 = **최대 7개가 동시 실행**됩니다.

### Step 1-extra. aspect 확장 (ASPECT_LIST에 code 외 항목이 있을 때만)

`ASPECT_LIST == ["code"]`이면 스킵. 그 외에는 `references/multi-perspective-review.md` §aspect별 위임 메시지 템플릿으로 code 외 각 aspect 부서장을 Step 1(5관점)·Step 2(구조적)·Step 3(Codex)와 **동시 병렬** spawn한다(동시 spawn 상한 8, 최악 케이스 5 aspect + 구조적 + Codex = 7로 상한 이내).

각 aspect마다 step_start(step_number: spec=5/functional=6/performance=7/uiux=8 — SSOT `multi-perspective-review.md` §step_number 예약 구간 표의 deep-review 열 대비 +1 교정 값. 기존 Step 1~3 emit 대역 및 Step 4 Advisor call_id 네임스페이스("pipeline-orchestrator-4-{date}")와의 혼동을 피하기 위해 5부터 시작 — TASK-112 확정)/step_end + agent_start/agent_end emit. code는 기존 Step 1이 담당(신규 번호 없음).

각 aspect의 step_start는 spawn 직전에 개별 실행합니다(ASPECT_LIST에 포함된 aspect만, code 제외):
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1)
for asp in spec functional performance uiux; do
  case " ${ASPECT_LIST[*]} " in
    *" $asp "*)
      case "$asp" in
        spec) n=5 ;; functional) n=6 ;; performance) n=7 ;; uiux) n=8 ;;
      esac
      [ -n "$_EMIT" ] && bash "$_EMIT" step_start "{slug}" "$n" "aspect-${asp} 리뷰" "Phase 1: 리뷰"
      ;;
  esac
done
```

각 Step 완료 시, Bash로 다음을 실행합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" 1 "{status}" "$(( $([ -n "$_EMIT" ] && bash "$_EMIT" now_ms || echo 0) - {step_start_ms} ))"
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" 2 "{status}" "$(( $([ -n "$_EMIT" ] && bash "$_EMIT" now_ms || echo 0) - {step_start_ms} ))"
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" 3 "{status}" "$(( $([ -n "$_EMIT" ] && bash "$_EMIT" now_ms || echo 0) - {step_start_ms} ))"
for asp in spec functional performance uiux; do
  case " ${ASPECT_LIST[*]} " in
    *" $asp "*)
      case "$asp" in
        spec) n=5 ;; functional) n=6 ;; performance) n=7 ;; uiux) n=8 ;;
      esac
      _EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" "$n" "{status}" "$(( $([ -n "$_EMIT" ] && bash "$_EMIT" now_ms || echo 0) - {step_start_ms} ))"
      ;;
  esac
done
```

## 종합 리포트

1. 중복 제거 (같은 파일/라인의 동일 이슈 병합)
2. 이전 미해결 이슈 재검증 — `resolved` / `persists`
3. 고유 발견 분류
4. 심각도 정렬 (Critical → Major → Minor)

## Step 4: 에이전트 개선점 수집 — 루프 A (Advisor 단독 호출)

리뷰에서 발견된 이슈 중 에이전트 개선 가능한 항목을 기록합니다. 이 단계는 코드 수정이 없는 분석/파일 기록 전용 작업이므로 pipeline-orchestrator를 **조언자(Advisor) 모드 1회**로 직접 호출하여 개선 레코드를 수집합니다. 부서장 spawn은 발생하지 않습니다.

Bash로 agent_start emit:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_start "{slug}" "pipeline-orchestrator-4-$(date -u +%Y%m%d)" "pipeline-orchestrator" "claude-fable-5" "Step 4: 에이전트 개선점 분석 (Advisor)"
```

Task tool, subagent_type: **"bams-plugin:pipeline-orchestrator"** — **조언자 모드**:

> **코드 품질 관점 에이전트 개선점 분석 모드 (Advisor)** — 리뷰에서 반복적으로 발견된 패턴을 에이전트 개선 기회로 기록합니다.
>
> **수행할 작업:**
> 1. 종합 리포트에서 에이전트가 유발했을 가능성이 있는 이슈를 식별:
>    - 코드 품질 패턴 → `code-quality:` 접두사
>    - 아키텍처 설계 문제 → `architecture:` 접두사
>    - 성능 이슈 → `performance:` 접두사
>    - 보안 패턴 → `security:` 접두사
>    - 테스트 커버리지 갭 → `test-coverage:` 접두사
> 2. 각 이슈에 대해 원인이 된 에이전트를 식별
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
>    pattern_tag: {code-quality:|architecture:|performance:|security:|test-coverage:}{구체적 태그}
>    type: one-off | structural
>    severity: minor | major | critical
>    ---
>    
>    ## 리뷰에서 발견된 패턴
>    {반복 발견된 코드 패턴 또는 아키텍처 이슈}
>    
>    ## 개선 제안
>    {에이전트 또는 스킬에 대한 구체적 개선 제안}
>    
>    ## 관련 파이프라인
>    - 원본: {parent_pipeline_slug}
>    - 리뷰: {slug}
>    ```
> 5. structural 유형이고 동일 pattern_tag가 2회 이상이면:
>    - AskUserQuestion: "이 패턴이 반복되고 있습니다. 에이전트 개선을 진행할까요?"
>    - Yes → `references/agent-improvement-protocol.md`의 Evolution Hook 실행
>    - No → 기록만 남기고 종료

반환 후 agent_end emit + CHAIN_VIOLATION 체크:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_end "{slug}" "pipeline-orchestrator-4-$(date -u +%Y%m%d)" "pipeline-orchestrator" "success" "$(( $([ -n "$_EMIT" ] && bash "$_EMIT" now_ms || echo 0) - {agent_start_ms} ))" "Step 4 개선점 분석 완료"
```

## 마무리

### Viz 이벤트: pipeline_end

파이프라인 종료 시, Bash로 다음을 실행합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" pipeline_end "{slug}" "{status}" {total} {completed} {failed} {skipped}
```
(`{status}`는 `completed` / `paused` / `failed` 중 하나, `{total}`은 `3 + (선택된 aspect 중 code를 제외한 개수)` — 인자 없으면 기존과 동일하게 3)

## 회고 연결

pipeline_end emit 후 `references/completion-protocol.md` Step 4.95에 따라 `/bams:retro {slug}` 실행 여부를 확인한다 (CLAUDE.md §5 회고 의무). 스팸 방지 조건(소요 10분 미만 + 변경 없음/경량 파이프라인) 충족 시 자동 생략.

**`references/completion-protocol.md` 참조.** 표준 프로토콜을 따릅니다.

이 파이프라인의 Learnings 카테고리:
1. `review:` — 여러 리뷰에서 동시 발견된 반복 패턴
2. `convention:` — 리뷰에서 확인된 프로젝트 컨벤션
3. `security:` — 보안 리뷰에서 발견된 주의 영역


### TaskDB 연동 (DB가 존재하면 board.md 대신 DB 사용)

`~/.claude/plugins/marketplaces/my-claude/bams.db`가 존재하면 DB를 우선 사용합니다:

```bash
# DB 존재 확인
if [ -f "$HOME/.claude/plugins/marketplaces/my-claude/bams.db" ]; then
  echo "[bams-db] DB 모드 활성화"
fi
```

**태스크 등록 시 (DB가 존재하면):** Bash로 bun 스크립트를 실행하여 TaskDB에 태스크를 등록합니다.

```bash
# DB가 존재하면 TaskDB에 태스크 등록
if [ -f "$HOME/.claude/plugins/marketplaces/my-claude/bams.db" ]; then
  bun -e "
    import { TaskDB } from './plugins/bams-plugin/tools/bams-db/index.ts';
    const db = new TaskDB();
    db.createTask({ pipeline_slug: '{slug}', title: '{task_title}', status: 'in_progress', assignee_agent: '{agent}', phase: {phase} });
    db.close();
  "
fi
```

**파이프라인 완료 시 (DB가 존재하면):** board.md를 DB 스냅샷으로 갱신합니다.

```bash
if [ -f "$HOME/.claude/plugins/marketplaces/my-claude/bams.db" ]; then
  bun run plugins/bams-plugin/tools/bams-db/sync-board.ts {slug} --write
fi
```

DB가 없으면 기존 board.md 방식을 유지합니다.

