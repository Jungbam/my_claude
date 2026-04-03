# Viz Agent 이벤트 프로토콜

모든 파이프라인 스킬에서 서브에이전트(pipeline-orchestrator 포함)를 호출할 때 적용하는 공통 규칙입니다.

## 핵심 원칙

1. **모든 Agent tool 호출 전후에 반드시 agent_start/agent_end 이벤트를 emit한다.**
2. **orchestrator 내부에서 부서장/에이전트를 호출할 때도** 동일하게 emit한다.
3. 이 규칙을 따르지 않으면 bams-viz에 에이전트 호출이 표시되지 않는다.

## 이벤트 emit 방법

### agent_start (호출 직전)

```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_start "{slug}" "{call_id}" "{agent_type}" "{model}" "{description}"
```

### agent_end (호출 직후)

```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_end "{slug}" "{call_id}" "{agent_type}" "{status}" {duration_ms} "{result_summary}"
```

## 파라미터 규칙

| 파라미터 | 형식 | 예시 |
|---------|------|------|
| `{slug}` | 파이프라인 slug | `feature-login` |
| `{call_id}` | `{agent_type}-{phase_or_step}` | `orchestrator-phase0`, `backend-engineering-step5` |
| `{agent_type}` | 에이전트 타입 (하이픈 구분) | `pipeline-orchestrator`, `backend-engineering` |
| `{model}` | 모델명 | `sonnet`, `opus`, `haiku` |
| `{description}` | 한 줄 설명 (300자 이내) | `파이프라인 초기화` |
| `{status}` | 결과 상태 | `success` / `error` / `timeout` |
| `{duration_ms}` | 소요 시간 (밀리초) | `45000` |
| `{result_summary}` | 결과 요약 (300자 이내) | `PRD 작성 완료, 4개 태스크 분해` |

## 병렬 호출 시

1. 각 agent_start를 **먼저 모두** emit한다
2. Agent tool을 **병렬로** 호출한다
3. 완료 후 각 agent_end를 emit한다

```
agent_start(backend-engineering-step5)
agent_start(platform-devops-step5)
→ Agent(backend-engineering) ∥ Agent(platform-devops)
agent_end(backend-engineering-step5)
agent_end(platform-devops-step5)
```

## 적용 범위

- 파이프라인 커맨드(dev.md, hotfix.md, debug.md, feature.md 등)에서 orchestrator 호출 시
- orchestrator 내부에서 부서장(product-strategy, backend-engineering 등) 호출 시
- 부서장 내부에서 에이전트(automation-qa, defect-triage 등) 호출 시

**3단 위임 구조의 모든 레벨에서 적용된다.**
