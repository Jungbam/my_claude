# 에이전트 개선 프로토콜 (Agent Improvement Protocol)

에이전트의 반복적 패턴 실수를 감지하고, 구조적 개선을 적용하는 프로토콜입니다.
deep-review 및 hotfix finalization에서 개선점이 발견될 때 이 프로토콜의 Evolution Hook을 실행합니다.

## 1. 개선 기록 구조

개선점은 에이전트별 디렉터리에 파일로 저장합니다:

```
.crew/memory/{agent}/improvements/{YYYY-MM-DD}-{slug}.md
```

### 파일 형식

```yaml
---
date: {YYYY-MM-DD}
pipeline_slug: {slug}
parent_pipeline_slug: {parent_slug or null}
agent: {agent_type}
pattern_tag: {category}:{specific_tag}
type: one-off | structural
severity: minor | major | critical
---

## 리뷰에서 발견된 패턴
{반복 발견된 코드 패턴 또는 아키텍처 이슈}

## 개선 제안
{에이전트 또는 스킬에 대한 구체적 개선 제안}

## 관련 파이프라인
- 원본: {parent_pipeline_slug}
- 리뷰: {slug}
```

## 2. pattern_tag 체계

카테고리와 구체적 태그를 콜론으로 구분합니다:

| 카테고리 | 설명 | 태그 예시 |
|---------|------|----------|
| `code-quality:` | 코드 품질 관련 | `null-safety`, `error-handling`, `naming` |
| `architecture:` | 아키텍처/설계 관련 | `coupling`, `layer-violation`, `state-management` |
| `performance:` | 성능 관련 | `n-plus-one`, `memory-leak`, `bundle-size` |
| `security:` | 보안 관련 | `injection`, `auth-bypass`, `secret-exposure` |
| `test-coverage:` | 테스트 관련 | `missing-edge-case`, `flaky-test`, `mock-abuse` |

## 3. severity 분류

| 등급 | 기준 | 조치 |
|------|------|------|
| `minor` | 코드 스타일, 사소한 비효율 | 기록만 (자동 개선 대상 아님) |
| `major` | 버그 가능성, 유지보수 저해 | 반복 시 개선 제안 |
| `critical` | 보안 취약점, 데이터 손실 위험 | 즉시 개선 제안 |

## 4. 반복 감지 조건

동일 `pattern_tag`가 다음 조건을 충족하면 "반복"으로 판정합니다:

| 조건 | 설명 |
|------|------|
| 동일 에이전트에서 2회 이상 | 같은 에이전트가 같은 패턴 태그로 기록됨 |
| type이 `structural` | one-off가 아닌 구조적 문제 |
| 최근 30일 이내 | 오래된 기록은 반복 판정에서 제외 |

## 5. Evolution Hook

반복 감지 시 실행하는 개선 프로세스입니다.

### 트리거 조건
- `type: structural` 이고 동일 `pattern_tag`가 2회 이상 반복
- 사용자가 AskUserQuestion에서 "Yes" 응답

### 실행 단계

1. **패턴 분석**: 해당 pattern_tag의 모든 improvement 파일을 수집하여 공통 원인 도출
2. **개선안 작성**: 에이전트의 행동 규칙 또는 프롬프트 수정안 제안
3. **사용자 승인**: AskUserQuestion으로 수정안 승인 요청
4. **적용**: 승인 시 에이전트 `.md` 파일의 행동 규칙 섹션 수정
5. **검증 마커**: improvement 파일에 `resolved_by: {수정 내용 요약}` 추가

### 적용 대상

| 대상 | 수정 위치 | 예시 |
|------|----------|------|
| 에이전트 행동 규칙 | `agents/{agent}.md` 의 행동 규칙 섹션 | "SQL 작성 시 반드시 파라미터 바인딩" 추가 |
| 스킬 프로세스 | `commands/bams/{skill}.md` 의 해당 Step | Step 체크리스트에 검증 항목 추가 |
| gotchas 승격 | `.crew/gotchas.md` | gotchas-spec.md 승격 규칙에 따라 처리 |

## 6. 이력 관리

- improvement 파일은 **삭제하지 않음** (감사 추적용)
- resolved 상태의 파일은 6개월 후 `.crew/memory/{agent}/improvements/archive/`로 이동
- 에이전트당 active improvement 파일은 최대 20개 유지

## 7. 에이전트 정의 분량 상한 규칙 (NFR-2)

에이전트 정의 본문이 비대해지면 컨텍스트 로드 비용 증가·유지보수 저해가 발생한다. 신규 에이전트 등록(specialist-registration-checklist.md §5 검증) 및 Evolution Hook §5 적용 시 다음 상한을 강제한다.

### 7.1 본문 총 분량

| 조건 | 조치 |
|------|------|
| 본문 **400줄 초과** | `references/`로 분리 **의무** (초과 시 등록/개선 게이트 BLOCK) |
| 본문 300줄 초과 ~ 400줄 이하 | 분리 **권고** (다음 사이클 리팩터링 대상 등록) |
| 본문 300줄 이하 | 조치 불필요 |

- 측정: `wc -l agents/{slug}.md` (frontmatter 포함 본문 전체)
- 구조 계약상 이관 불가한 잔류 항목(spec의 "잔류" 컬럼 명시분)으로 인해 400줄 초과가 불가피한 경우 **CONDITIONAL**로 처리하고, 초과 사유·잔류 근거·2차 사이클 재분할 검토 여부를 `.crew/board.md` 백로그에 기록한다.

### 7.2 행동 규칙 항목 수

| 조건 | 조치 |
|------|------|
| `## 행동 규칙` 내 `-` 항목 **25건 초과** | 규칙 **ID화**(예: `R-01`, `P-A1`) + `references/agent-rules/{slug}-rules.md`로 **이관 의무** |
| 25건 이하 | 조치 불필요 |

- 이관 시 본문에는 규칙 ID + 1줄 요약 + rules 파일 참조 링크만 stub으로 남긴다.
- 이관 후 `references/agent-rules/{slug}-rules.md`가 규칙 원문의 SSOT가 되며, 본문 stub과 rules 파일 간 규칙 ID 정합을 검증한다(NFR-3 diff MISSING 0건).

### 7.3 근거

- 출처: `plan_모델재분배프롬프트세분화` FR-S4 — 교차 6파일 리팩터링 선례(pipeline-orchestrator/product-strategy/backend-engineering/platform-devops/design-director/guide-decomposer)에서 본문 300줄 이하 수렴 + 규칙 ID화 이관을 실증. `references/agent-rules/*-rules.md` 6종 신설.
