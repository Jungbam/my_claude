# Viz Agent Protocol

> 작성일: 2026-04-03
> 적용 대상: pipeline-orchestrator, 모든 커맨드 스킬 (`/bams:feature`, `/bams:hotfix`, `/bams:dev` 등)
> 목적: viz 이벤트 emit 시 slug 일관성 보장 — 파이프라인 중복 표시 버그 예방

## 핵심 원칙: Pipeline Slug Immutability

**파이프라인 slug는 pipeline_start 시 결정되고 파이프라인 종료까지 절대 변경하지 않습니다.**

slug가 변경되면 `bams-viz-emit.sh`가 slug를 파일명으로 사용하므로 별도 JSONL 파일이 생성됩니다.
하나의 파이프라인이 viz에서 여러 항목으로 분리되어 표시되는 버그의 근본 원인입니다.

## 1. 커맨드 → orchestrator slug 전달 규칙

### 커맨드 스킬 책임

커맨드 스킬(`/bams:hotfix`, `/bams:feature` 등)은:
1. 파이프라인 시작 시 slug를 `{command}_{한글요약}` 형식으로 **1회만** 생성
2. 생성한 slug를 orchestrator에게 위임 메시지의 `slug` 필드로 전달
3. 파이프라인 종료 이벤트 emit 시 **동일한 slug** 사용

```bash
# 올바른 예
SLUG="hotfix_빌드에러수정"
bash "$_EMIT" pipeline_start "$SLUG" "hotfix" "/bams:hotfix" "..."
# ... 파이프라인 실행 ...
bash "$_EMIT" pipeline_end "$SLUG" "completed"   # 동일 slug 사용
```

**금지:**
```bash
# slug에 상태 suffix 추가 — 절대 금지
bash "$_EMIT" pipeline_start "hotfix_빌드에러수정_진행중" ...
bash "$_EMIT" pipeline_end   "hotfix_빌드에러수정_완료"   ...   # 다른 파일 생성됨!
```

## 2. pipeline-orchestrator slug 사용 규칙

### orchestrator 책임

orchestrator는:
1. 커맨드에서 전달받은 `slug` 필드를 session 변수로 저장
2. **자체 slug를 생성하지 않습니다** — 커맨드 전달 slug만 사용
3. 모든 `agent_start` / `agent_end` emit 시 커맨드 전달 slug를 `pipeline_slug`로 사용

```bash
# 올바른 사용: 커맨드에서 받은 slug 사용
PIPELINE_SLUG="hotfix_빌드에러수정"   # 위임 메시지에서 파싱
bash "$_EMIT" agent_start "$PIPELINE_SLUG" "backend-engineering-1-20260403" "backend-engineering" ...
bash "$_EMIT" agent_end   "$PIPELINE_SLUG" "backend-engineering-1-20260403" "backend-engineering" "success" ...
```

**금지:**
```bash
# 자체 slug 생성 — 절대 금지
bash "$_EMIT" agent_start "hotfix-enforce-pipeline-delegation-triage" ...   # WRONG
bash "$_EMIT" agent_start "hotfix_$(date +%s)" ...   # WRONG
```

## 3. call_id 형식

agent_start / agent_end의 `call_id`는 다음 형식을 따릅니다:

```
{agent_type}-{step_number}-{YYYYMMDD}
```

예: `backend-engineering-1-20260403`, `qa-strategy-3-20260403`

call_id는 파이프라인 내에서 고유해야 합니다. 같은 에이전트를 재호출할 경우 step_number를 증가시킵니다.

## 4. agent_start / agent_end 필수 필드

### agent_start
```bash
bash "$_EMIT" agent_start \
  "{pipeline_slug}" \      # 커맨드 전달 slug — 불변
  "{call_id}" \            # {agent_type}-{step}-{date}
  "{agent_type}" \         # backend-engineering, qa-strategy 등
  "{model}" \              # sonnet, haiku, opus
  "{description}"          # 한 줄 작업 설명
```

### agent_end
```bash
bash "$_EMIT" agent_end \
  "{pipeline_slug}" \      # 동일 slug — 불변
  "{call_id}" \            # agent_start와 동일한 call_id
  "{agent_type}" \         # 동일 agent_type
  "{status}" \             # success | error | timeout
  {duration_ms} \          # 밀리초 단위 소요 시간
  "{result_summary}"       # 한 줄 결과 요약
```

## 5. 병렬 호출 시 emit 순서

병렬로 여러 에이전트를 호출할 때:

```
1. 모든 agent_start를 순서대로 emit
2. 모든 Agent tool을 병렬 호출
3. 완료 후 각 agent_end를 emit
```

```bash
# 1. 먼저 모든 시작 이벤트
bash "$_EMIT" agent_start "$SLUG" "backend-1-20260403" "backend-engineering" ...
bash "$_EMIT" agent_start "$SLUG" "qa-2-20260403" "qa-strategy" ...

# 2. 병렬 Agent 호출 (실제 실행)
# ... Agent tool 병렬 호출 ...

# 3. 완료 후 종료 이벤트
bash "$_EMIT" agent_end "$SLUG" "backend-1-20260403" "backend-engineering" "success" 45000 "..."
bash "$_EMIT" agent_end "$SLUG" "qa-2-20260403" "qa-strategy" "success" 38000 "..."
```

## 6. 상태 판별 방식 (viz)

viz(`parser.ts`)는 이벤트 내용으로 파이프라인 상태를 판별합니다:

| 이벤트 파일 상태 | viz 표시 |
|----------------|---------|
| `pipeline_start`만 존재 | 진행 중 (running) |
| `pipeline_end` (status=completed) | 완료 |
| `pipeline_end` (status=failed) | 실패 |

slug를 불변으로 유지하면 하나의 파일에 모든 이벤트가 기록되어 상태가 올바르게 표시됩니다.

## 7. 위반 사례 (이전 버그 기록)

**2026-04-03 발생 — hotfix_위임원칙강제적용 파이프라인:**

생성된 파일:
- `hotfix_위임원칙강제적용_진행중-events.jsonl` (pipeline_start 1건) — slug에 _진행중 suffix
- `hotfix_위임원칙강제적용_완료-events.jsonl` (pipeline_end 1건) — slug에 _완료 suffix
- `hotfix-enforce-pipeline-delegation-triage-events.jsonl` (agent 이벤트 4건) — orchestrator 자체 생성

결과: viz에서 3개 파이프라인으로 분리 표시. 이 문서 작성의 계기가 된 버그.

## 8. 커맨드 레벨 orchestrator 추적 규칙

커맨드 스킬(`/bams:hotfix`, `/bams:feature`, `/bams:dev`)에서 pipeline-orchestrator를 Agent tool로 호출할 때 반드시 호출 전후에 agent_start/agent_end를 emit해야 합니다.

**이 규칙이 없으면 viz에서 orchestrator의 동작이 보이지 않습니다.**

### 올바른 패턴

```bash
# 1. agent_start emit (orchestrator 호출 전)
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1)
[ -n "$_EMIT" ] && bash "$_EMIT" agent_start "{slug}" "pipeline-orchestrator-{N}-$(date -u +%Y%m%d)" "pipeline-orchestrator" "{model}" "{description}"

# 2. Agent tool 호출 (실제 orchestrator 실행)
# subagent_type: "bams-plugin:pipeline-orchestrator"
# ...

# 3. agent_end emit (orchestrator 반환 후)
[ -n "$_EMIT" ] && bash "$_EMIT" agent_end "{slug}" "pipeline-orchestrator-{N}-$(date -u +%Y%m%d)" "pipeline-orchestrator" "success" {duration_ms} "{result_summary}"
```

### call_id 형식

커맨드 레벨 orchestrator 호출의 call_id는 다음 형식을 사용합니다:

```
pipeline-orchestrator-{step_identifier}-{YYYYMMDD}
```

예:
- `pipeline-orchestrator-0-20260403` — Phase 0 초기화
- `pipeline-orchestrator-1-20260403` — Step 1
- `pipeline-orchestrator-handoff1-20260403` — 1→2 핸드오프
- `pipeline-orchestrator-567-20260403` — Step 5-6-7 병렬

### 적용 대상 파일

| 파일 | orchestrator 호출 수 |
|------|----------------------|
| `hotfix.md` | 7곳 (Step 1, 2, 3, 4, 4.5, 5, 마무리) |
| `feature.md` | 12곳 (Step 0, 1, 2, 핸드오프1, 3배치, 핸드오프2, 4, 567, 8, 9, 11, 12, 13) |
| `dev.md` | 11곳 (Step 0, 1, 2, 4, 5배치, 6, 7, 8, 9a, 9b) |

### 위반 시 결과

- viz DAG에서 orchestrator 레이어가 표시되지 않음
- 부서장과 에이전트만 간헐적으로 표시 (orchestrator 내부에서 emit한 경우)
- 파이프라인 추적 체인이 단절됨: `커맨드 → (gap) → 부서장 → 에이전트`
