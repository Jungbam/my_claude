# Hotfix Triage: hotfix_viz에이전트추적누락

```yaml
date: 2026-04-03
pipeline_slug: hotfix_viz에이전트추적누락
parent_pipeline_slug: hotfix_emitsh한글바이트절단
agent: pipeline-orchestrator
pattern_tag: viz-event-missing
type: structural
severity: major
```

## 증상

viz에서 pipeline-orchestrator → 부서장 → 에이전트 전체 체인이 보이지 않음.
말단 에이전트(backend-engineering, frontend-engineering 등)만 간헐적으로 표시됨.

## 근본 원인 분석

### 원인 1: 커맨드 레벨 — orchestrator 호출 전후 agent_start/agent_end 누락

커맨드 스킬(hotfix.md, feature.md, dev.md)에서 `pipeline-orchestrator`를 Agent tool로 호출할 때
호출 전후의 viz 이벤트 emit이 없었음.

현재 구조:
```
step_start emit → Agent(pipeline-orchestrator) → step_end emit
```

올바른 구조:
```
step_start emit → agent_start(pipeline-orchestrator) emit → Agent(pipeline-orchestrator) → agent_end(pipeline-orchestrator) emit → step_end emit
```

**영향**: viz DAG에서 orchestrator 레이어 전체가 표시되지 않음. 부서장과 에이전트의 추적 체인이 최상위 Step과 연결되지 않음.

### 원인 2: pipeline-orchestrator 에이전트 정의 — slug 불변 원칙 불충분 강조

orchestrator 에이전트 정의 파일에 slug 불변 원칙이 충분히 강조되어 있지 않아
자체 slug 생성(suffix 추가, 자체 생성)이 반복됨.

**영향**: 동일 파이프라인의 이벤트가 별도 JSONL 파일로 분산되어 viz에서 중복 파이프라인으로 표시됨.

## 증거 (이벤트 파일 분석)

**hotfix_emitsh한글바이트절단-events.jsonl:**
```
pipeline_start → step_start → agent_start(platform-devops) → agent_end(platform-devops) → step_end → pipeline_end
```
→ pipeline-orchestrator agent_start/end 없음

**hotfix_viz파이프라인중복표시-events.jsonl:**
```
pipeline_start → agent_start(backend-engineering) → agent_end(backend-engineering) → pipeline_end → step_end
```
→ pipeline-orchestrator agent_start/end 없음, step 순서 역전

**hotfix_viz한글slug검증-events.jsonl:**
```
pipeline_start → step_start → agent_start(pipeline-orchestrator) → pipeline_start(중복!) → agent_start(frontend-engineering) → agent_end(frontend-engineering) → step_end → pipeline_end
```
→ orchestrator agent_start는 있으나 agent_end 없음, pipeline_start 중복

## 수정 내용

### 수정 A: 커맨드 스킬 3개 — orchestrator 호출 전후 emit 추가

| 파일 | 수정 위치 수 |
|------|-------------|
| `hotfix.md` | 7곳 (Step 1, 2, 3, 4, 4.5, 5, 마무리 회고) |
| `feature.md` | 12곳 (Step 0~13, 핸드오프 2곳) |
| `dev.md` | 11곳 (Step 0~9b, 핸드오프 1곳) |

각 orchestrator 호출 전 `agent_start` emit, 반환 후 `agent_end` emit 추가.

### 수정 B: pipeline-orchestrator.md — slug 불변 원칙 명시 강화

기존 viz 이벤트 규칙 섹션에 slug 불변 원칙 강조 텍스트 추가:
- 자체 slug 생성 및 suffix 추가 절대 금지
- 커맨드 전달 slug만 사용
- viz-agent-protocol.md §2 참조 링크

### 수정 C: viz-agent-protocol.md — 섹션 8 추가

커맨드 레벨 orchestrator 추적 규칙 섹션 신규 추가:
- 올바른 패턴 (bash 코드 예시)
- call_id 형식 규약
- 적용 대상 파일별 호출 수
- 위반 시 결과 설명

## 검증 방법

수정 후 다음 커맨드 실행 후 이벤트 파일 확인:
```bash
cat ~/.bams/artifacts/pipeline/{slug}-events.jsonl | jq '.event_type' | sort | uniq -c
```

기대 패턴:
```
1 pipeline_start
N agent_start       ← orchestrator + 부서장 포함
N agent_end         ← orchestrator + 부서장 포함
M step_start
M step_end
1 pipeline_end
```

## 재발 방지

- viz-agent-protocol.md §8에 커맨드 레벨 규칙 영구 문서화
- 신규 커맨드 스킬 추가 시 checklist: "orchestrator 호출 전후 emit 추가했는가?"
- hotfix 파이프라인 자체가 이 버그의 근본 원인이므로 pattern_tag: `viz-event-missing` 으로 관리

## 관련 파이프라인

- 원본: hotfix_emitsh한글바이트절단
- 이전 관련: hotfix_viz파이프라인중복표시, hotfix_viz한글slug검증
- 핫픽스: hotfix_viz에이전트추적누락
