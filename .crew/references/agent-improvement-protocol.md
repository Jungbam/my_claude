# Agent Improvement Protocol

> 작성일: 2026-04-03
> 버전: 1.0.0

---

## 개요

에이전트 자기개선 시스템의 핵심 규칙을 정의한다. 파이프라인 실행 중 발견된 에이전트의
반복적 실수 패턴을 식별하고, 안전하게 에이전트 .md를 개선하는 절차를 표준화한다.

---

## §1. 개선점 식별 (Identification)

### 근본 원인 에이전트 식별 기준

hotfix 또는 deep-review 완료 시, 수정된 결함의 근본 원인이 된 에이전트를 식별한다:

1. 결함이 발생한 산출물(파일, API 응답, 설계 문서)의 담당 에이전트를 확인
2. 해당 에이전트의 지시(instructions)에서 결함을 유발한 누락/모호한 규칙을 찾는다
3. 규칙이 없었다면 → 에이전트 개선 대상
4. 규칙이 있었지만 미준수 → 지시 명확화 대상

### 에이전트 vs 스킬 vs 프로토콜 구분 기준

| 원인 위치 | 분류 | 개선 대상 |
|-----------|------|-----------|
| 에이전트 .md의 지시 누락/모호 | 에이전트 문제 | 해당 에이전트 .md |
| 스킬 템플릿의 단계 누락 | 스킬 문제 | 해당 skill .md (별도 Phase) |
| 프로토콜 규칙 불일치 | 프로토콜 문제 | references/ 프로토콜 파일 |
| 에이전트 간 인터페이스 오해 | 조율 문제 | delegation-protocol.md |

### pattern_tag 명명 규칙

- 소문자 + 하이픈 구분
- `{대상}-{문제유형}` 형식
- 예시:
  - `api-response-shape-mismatch` — API 응답 형식 불일치
  - `missing-null-check` — null 체크 누락
  - `schema-drift-undetected` — 스키마 변경 미감지
  - `dependency-version-conflict` — 의존성 버전 충돌
  - `handoff-artifact-missing` — 핸드오프 산출물 누락

---

## §2. 개선 레코드 생성 (Recording)

### 파일 경로

```
.crew/memory/{agent}/improvements/{YYYY-MM-DD}-{pipeline-slug}.md
```

### frontmatter 스키마

```yaml
---
date: YYYY-MM-DD
pipeline_slug: {현재 파이프라인 슬러그}
parent_pipeline_slug: {핫픽스인 경우 원본 파이프라인, 없으면 null}
agent: {에이전트 슬러그}
pattern_tag: {패턴 태그, 예: "api-response-shape-mismatch"}
type: one-off | structural
severity: minor | major | critical
status: open | applied | rejected | superseded
---
```

### 본문 구조

```markdown
## 근본 원인

[결함이 발생한 이유와 에이전트 지시의 어떤 부분이 원인이었는지 서술]

## 개선 제안

[에이전트 .md에 추가/수정해야 할 구체적인 지시 내용]

## 관련 파이프라인

- 발견: {pipeline-slug}
- 영향 범위: {영향을 받은 산출물 또는 Phase}
```

---

## §3. 일회성 vs 구조적 분류 (Classification)

### 분류 규칙

| 조건 | 분류 |
|------|------|
| 동일 `pattern_tag`의 기존 레코드 없음 | `one-off` |
| 동일 `pattern_tag`의 기존 레코드 존재 (status: open 또는 applied) | `structural` |

### 승격 규칙

- `one-off`로 생성된 레코드도, 이후 동일 `pattern_tag`로 새 레코드가 생성되면 기존 레코드를 `structural`로 업데이트한다
- 승격 시 `status`는 변경하지 않는다 (기존 상태 유지)

### 기존 레코드 조회 방법

```bash
# 특정 에이전트의 동일 pattern_tag 레코드 검색
grep -r "{pattern_tag}" .crew/memory/{agent}/improvements/
```

---

## §4. Evolution Hook 트리거 조건 (Trigger)

### 자동 트리거

다음 조건이 모두 충족될 때 pipeline-orchestrator가 Evolution Hook을 실행한다:

1. 동일 `pattern_tag`의 레코드가 2개 이상
2. 해당 레코드의 `type: structural`
3. 해당 레코드의 `status: open`

조건 확인 명령:

```bash
# 에이전트별 open structural 레코드 집계
grep -l "type: structural" .crew/memory/{agent}/improvements/*.md | \
  xargs grep -l "status: open" | wc -l
```

### 수동 트리거

```
/bams:evolve {agent-slug}
```

(향후 구현 예정)

### 트리거 임계값 조정

- 기본 임계값: 2개
- 사용자 거부 시: +2 상향 (4개)
- 추가 거부 시: +2 상향 (6개, 최대)

---

## §5. 개악 방지 가드레일 (Guardrails)

### 필수 조건

- **반드시 opus 모델 사용** — 판별 정확도 보장을 위해 다른 모델 사용 금지
- **에이전트 .md 원본 백업 필수** — 적용 전 백업 생성

### 판별 결과 처리

| 판별 결과 | 처리 방식 |
|-----------|-----------|
| `improve` | 사용자에게 diff 제시 후 승인 시 적용 |
| `degradation` | 변경 미적용, 사유를 레코드에 기록 |
| `uncertain` | 변경 미적용, 사유를 레코드에 기록, 추가 데이터 수집 |

### 사용자 거부 처리

사용자가 승인 단계에서 거부 시:
1. 레코드 `status: rejected` + 거부 사유 기록
2. 트리거 임계값 +2 상향 적용

### 원본 백업 위치

```
.crew/memory/{agent}/improvements/backups/{agent}-{YYYY-MM-DD}.md
```

---

## §6. opus 판별 프롬프트 구조

### 제공할 정보

opus에게 다음 정보를 전달한다:

1. **에이전트 현재 .md 전문** — 개선 대상 에이전트의 전체 지시 내용
2. **누적된 improvement 레코드들** — 해당 에이전트의 open structural 레코드 전체
3. **구체적 개선 제안** — 각 레코드의 "개선 제안" 섹션을 통합한 내용

### 판별 기준

opus는 다음 기준으로 `improve | degradation | uncertain`을 판별한다:

| 기준 | 설명 |
|------|------|
| 기존 기능/행동 보존 | 기존에 잘 동작하던 규칙을 손상시키지 않는가 |
| 명확성 향상 | 모호한 지시가 구체적인 지시로 개선되는가 |
| 범용성 | 특정 케이스에만 해당하는 변경인가, 일반적으로 적용 가능한가 |
| 부작용 가능성 | 다른 Phase나 파이프라인에 예기치 않은 영향을 줄 수 있는가 |

### 프롬프트 템플릿

```
당신은 AI 에이전트 시스템의 품질 심사관입니다.

다음 에이전트의 지시(instructions)를 개선하려 합니다.

[현재 에이전트 .md 전문]
{agent_md_content}

[누적된 개선 레코드]
{improvement_records}

[통합 개선 제안]
{consolidated_suggestions}

위 개선 제안을 에이전트 .md에 적용하면:
1. 기존 기능/행동이 보존되는가?
2. 지시의 명확성이 향상되는가?
3. 특정 케이스가 아닌 범용적으로 적용 가능한가?
4. 다른 파이프라인에 부작용을 일으킬 가능성은 없는가?

판별: improve | degradation | uncertain
사유: [판별 근거 상세 설명]
```

---

## §7. 적용 프로세스 (Application)

### 단계별 절차

```
1. Evolution Hook 트리거 확인
   → 동일 pattern_tag의 structural + open 레코드 2개 이상

2. 에이전트 .md 원본 백업
   → .crew/memory/{agent}/improvements/backups/{agent}-{YYYY-MM-DD}.md

3. 개선 제안 통합
   → 해당 pattern_tag의 모든 open 레코드에서 "개선 제안" 섹션 수집

4. opus 판별 실행
   → §6 프롬프트 구조에 따라 opus 모델 호출

5-a. 판별 결과: improve
     → diff 생성 (에이전트 .md의 before/after)
     → AskUserQuestion으로 diff 제시 + 승인 요청

5-b. 판별 결과: degradation 또는 uncertain
     → 변경 미적용
     → 레코드에 판별 결과와 사유 기록 (status는 유지)
     → 파이프라인 계속 진행

6. 사용자 승인 시
   → Edit으로 에이전트 .md 적용
   → 관련 레코드 status: applied
   → pipeline-orchestrator에게 완료 보고

7. 사용자 거부 시
   → 관련 레코드 status: rejected + 거부 사유 기록
   → 트리거 임계값 +2 상향
   → 파이프라인 계속 진행
```

---

## §8. 제한사항

### 수정 불가 항목

- 에이전트 .md의 frontmatter: `name`, `description`, `model` 필드는 수정 금지
- system_prompt의 첫 줄(역할 정의) 수정 시 반드시 사용자 확인 필요

### 스킬 수정 분리

- 스킬 .md 수정은 에이전트 .md 개선과 별도 Phase에서 진행
- 에이전트 .md 개선이 완료되고 안정화된 후 스킬 반영

### 연쇄 수정 방지

- 한 번에 한 에이전트만 개선 (동시에 여러 에이전트 수정 금지)
- 이유: 여러 에이전트를 동시에 수정하면 상호작용 문제 추적이 불가능

### 개선 주기

- 동일 에이전트에 대한 Evolution Hook은 최소 1개 파이프라인 간격을 두고 실행
- 이유: 이전 개선의 효과를 충분히 관찰한 후 다음 개선 적용

---

> 이 프로토콜은 agent-self-improvement 파이프라인 Phase 2에서 구현되었다.
> 관련 프로토콜: `.crew/references/memory-protocol.md`
