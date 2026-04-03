# Hotfix: 공통 규칙

> 이 파일은 `/bams:hotfix` 파이프라인의 공통 규칙을 정의합니다.
> 엔트리포인트(`hotfix.md`)에서 Pre-flight 완료 직후 Read하여 로드합니다.

---

## 스킬 로딩

```bash
_QA_SKILL=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/skills/qa-only/SKILL.md" 2>/dev/null | head -1)
_SHIP_SKILL=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/skills/ship/SKILL.md" 2>/dev/null | head -1)
_DEPLOY_SKILL=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/skills/land-and-deploy/SKILL.md" 2>/dev/null | head -1)
```

스킬이 없으면 해당 단계를 `skipped` 기록하고 계속 진행합니다.

---

## ★ Viz Agent 이벤트 규칙

**`references/viz-agent-protocol.md` 참조.** 모든 서브에이전트 호출 전후에 반드시 agent_start/agent_end 이벤트를 emit한다. orchestrator 내부에서 부서장/에이전트를 호출할 때도 동일하게 적용한다.

**호출 직전:**
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_start "{slug}" "{call_id}" "{agent_type}" "{model}" "{description}"
```

**호출 직후:**
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_end "{slug}" "{call_id}" "{agent_type}" "{status}" {duration_ms} "{result_summary}"
```

- `{call_id}` 형식: `{agent_type}-{step_number}-{timestamp}` (예: `pipeline-orchestrator-1-20260403`)
- `{status}`: `success` / `error` / `timeout`

---

## ★ 위임 원칙 — 커맨드 레벨 직접 수정 금지

**이 커맨드에서 직접 Read/Edit/Write로 코드를 수정하지 않는다.**
모든 코드 수정은 `pipeline-orchestrator → 부서장 → 에이전트` 위임 체계를 통해 수행한다.

- 허용: Bash, Glob으로 상태 확인, viz 이벤트 emit, 사용자 질문
- 금지: Edit/Write로 소스 코드 직접 변경, Read 없이 결과 가정
- **위반 시**: 즉시 중단하고 pipeline-orchestrator에게 해당 작업을 위임할 것

---

## TaskDB 연동 (DB가 존재하면 board.md 대신 DB 사용)

`.crew/db/bams.db`가 존재하면 DB를 우선 사용합니다:

```bash
# DB 존재 확인
if [ -f ".crew/db/bams.db" ]; then
  echo "[bams-db] DB 모드 활성화"
fi
```

**태스크 등록 시 (DB가 존재하면):** Bash로 bun 스크립트를 실행하여 TaskDB에 태스크를 등록합니다.

```bash
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
