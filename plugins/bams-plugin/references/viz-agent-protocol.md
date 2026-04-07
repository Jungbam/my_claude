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
| `{call_id}` | `{agent_type}-{step_number}-{timestamp}` | `pipeline-orchestrator-1-20260403`, `backend-engineering-5-20260403` |
| `{agent_type}` | 에이전트 타입 (하이픈 구분) | `pipeline-orchestrator`, `backend-engineering` |
| `{model}` | 모델명 | `sonnet`, `opus`, `haiku` |
| `{description}` | 한 줄 설명 (300자 이내) | `파이프라인 초기화` |
| `{status}` | 결과 상태 | `success` / `error` / `timeout` / `interrupted` |
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

## §2 slug 불변 원칙

`{slug}`는 파이프라인 수명 동안 불변이다. 커맨드에서 전달받은 값을 그대로 사용하며,
자체 suffix 추가(`hotfix_$(date)`, `{slug}_진행중` 등)는 절대 금지한다.
slug가 변경되면 viz에서 별도 파이프라인으로 분리되어 추적이 불가능해진다.

## §3 recover 프로토콜 (세션 중단 안전장치)

세션이 강제 종료, 네트워크 끊김, 에이전트 타임아웃 등으로 중단된 경우 viz에
미완료 이벤트가 남는다. 파이프라인 재시작 시 반드시 `recover`를 먼저 실행한다.

### recover 이벤트 emit

```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1)
[ -n "$_EMIT" ] && bash "$_EMIT" recover "{slug}"
```

### recover 동작

| 미완료 이벤트 | 자동 생성 이벤트 | 비고 |
|-------------|----------------|------|
| `agent_start` (매칭 `agent_end` 없음) | `agent_end(status=interrupted)` | call_id 기준 매칭 |
| `step_start` (매칭 `step_end` 없음) | `step_end(status=interrupted)` | step_number 기준 매칭 |
| `pipeline_start` (`pipeline_end` 없음) | `pipeline_end(status=interrupted)` | 전체 파이프라인 닫기 |

### interrupted 상태 의미

`interrupted`는 세션 중단으로 정상 완료되지 않은 이벤트를 나타낸다.
viz에서 회색 또는 중단 아이콘으로 표시되며, 재시도 대상임을 나타낸다.

### recover 실행 시점

파이프라인 slug가 결정된 직후, `pipeline_start` emit 이전에 실행한다:

```
recover("{slug}")          ← 이전 중단 이벤트 정리
pipeline_start("{slug}")   ← 새 파이프라인 시작
step_start(...)
...
```

이벤트 파일이 없으면 no-op으로 종료한다 (최초 실행 시 안전).
