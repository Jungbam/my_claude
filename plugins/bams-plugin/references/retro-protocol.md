# 회고 프로토콜

파이프라인 완료 시 수행하는 KPT 회고. 근거는 정성 소스(산출물·`.crew/history.md`·사용자 관찰)만 쓴다. 권장 패턴: `references/retro-best-practices.md`.

## 1. 트리거

- 파이프라인 완료·실패 시 필수(실패면 원인 중심). `/bams:weekly`는 주간 회고. completion-protocol Step 5(완료 요약) 전에 수행한다.
- 스킵: 사용자 명시 요청 시 `skipped (사용자 선택)`. `debug/review/deep-review/verify/sprint`가 변경 없음·읽기 전용이면 질문 없이 스킵하고 history.md 완료 기록에 사유를 병기한다.

## 2. 참여자

| 참여자 | 역할 |
|--------|------|
| pipeline-orchestrator | 진행·합의·액션 아이템 확정(조언자) |
| product-analytics | 근거 수집·트렌드 비교·보고서 |
| 참여 부서장 | 해당 파이프라인에 실제 참여한 부서장만 자기 부서 KPT 제출 |

spawn 프롬프트에는 이전 Phase 요약 대신 산출물 경로를 넘긴다(`delegation-protocol.md` §2-2).

## 3. KPT

### 3-0. 용어

| 용어 | 정의 |
|------|------|
| 일반화 가능성 | 모든 Problem/Try에 붙이는 분류. 아래 둘 중 하나 |
| 다중 프로젝트 재현 가능 | 3개 이상 프로젝트에서 재현될 일반 행동·프로세스 이슈 → plugin 개선 후보 |
| 단일 프로젝트 한정 | 특정 스택·도메인·외부 서비스·브라우저/OS/디바이스 한정 → `.crew/gotchas.md` 후보 또는 프로젝트 액션 |

애매하면 단일 프로젝트 한정으로 분류한다. 구체 버전명 대신 "특정 브라우저/OS 한정 이슈"처럼 일반화해 쓴다.

### 3-1. 수집 형식

```
Keep:    - [부서] 내용 (근거: 사례·산출물 경로)
Problem: - [부서] 내용 (영향: 재작업/품질/지연) [일반화 가능성: 다중 프로젝트 재현 가능|단일 프로젝트 한정]
Try:     - [부서] 구체 조치 (대상 Problem: #N) [일반화 가능성: 대상 Problem 상속]
```

- Problem 출처: history.md 실패, 반복 재작업, 에스컬레이션, 반복 리뷰 지적, 사용자 불만.
- 모든 Problem에 Try ≥1. Try는 다음 파이프라인에 바로 적용할 행동·설정·프롬프트 변경이어야 한다("더 잘하겠다" 금지).

### 3-2. 합의

orchestrator가 Problem을 영향도로 정렬하고, Try마다 담당·적용 시점을 지정하며, 부서 간 Keep/Problem 모순을 확인한다.

## 4. 근거 수집

product-analytics가 `.crew/history.md`, `.crew/artifacts/{prd,design,review,report}/`, 사용자 관찰을 수집하고, 이전 회고(`.crew/artifacts/retro/`)와 비교해 반복 Problem·개선/악화·이월 액션 아이템을 정성 서술한다.

## 5. 학습 루프

회고 학습은 `.crew/memory/{agent-slug}/MEMORY.md` 항목으로만 축적한다. 정의 파일(`agents/*.md`·`references/*.md`)에는 날짜·회고 slug·프로젝트 경로·KPT 인용을 쓰지 않는다.

### 5-1. 항목 형식

`references/agent-memory.md`의 형식(`conf`·`seen`·`last`·when/do/evidence)을 따른다.

### 5-2. 유지 규칙 (회고마다 적용)

| 규칙 | 내용 |
|------|------|
| 갱신 우선 | 같은 교훈 재관찰 → 새 항목 대신 `seen`+1, `last` 갱신, evidence 추가(최근 3개) |
| seen | 서로 다른 pipeline-slug 기준 독립 관찰 수(같은 파이프라인 내 반복은 1) |
| 신뢰도 | seen 1 → low, 2 → med, 3+이고 반증 0 → high. 반증(사용자 교정·반례) 1건마다 한 단계 하향, low에서 반증되면 삭제 |
| TTL | `last`가 90일 지난 항목 삭제 |
| 상한 | 10항목·3,000자. 초과 시 conf 낮은 순 → `last` 오래된 순으로 삭제 |
| 승인 | MEMORY.md 반영 전 사용자 확인. Write 불가 에이전트 몫은 hr-agent가 대행 |
| 구형식 | `## [YYYY-MM-DD] {slug}` 항목은 conf low·seen 1·last=헤더 날짜로 간주, 그 파일을 쓸 때 새 형식으로 전환(일괄 변환 금지) |

### 5-3. 반영

에이전트는 세션 시작 시 MEMORY.md를 Read해 관련 항목을 행동에 반영한다.

### 5-4. 정의 파일 승격 (예외)

MEMORY.md 항목을 `agents/*.md` 행동 규칙이나 `references/*.md` SSOT로 옮기는 것은 `agent-improvement-protocol.md` §5 승격 게이트(seen ≥3 독립 관찰 + high + 다중 프로젝트 재현 가능 + 순증가 0)를 통과할 때만 한다.

## 6. 피드백 루프

### 6-1. 적용 경로

| 경로 | 대상 | 조건 | 승인 |
|------|------|------|------|
| A 교훈 | MEMORY.md | 매 회고(§5-2) | 사용자 확인 |
| B gotchas | `.crew/gotchas.md` (+ completion-protocol Step 3 CLAUDE.md 동기화) | gotchas-spec.md 승격 규칙 | 사용자 확인 |
| C learnings | `.crew/config.md` Pipeline Learnings | pipeline-learnings-taxonomy.md 형식 | 불필요 |
| D 정의 파일 | `agents/*.md`·`references/*.md` | §5-4 승격 게이트 | 명시적 승인 |

### 6-2. 결과 기록

```yaml
retro:
  conducted_at: [ISO timestamp]
  keep_count: N
  problem_count: N
  try_count: N
  action_items:
    - description: "..."
      assignee: [에이전트명]
      target: "다음 파이프라인"
      status: pending
  lessons_saved: [에이전트 목록]
  gotchas_promoted: [승격된 gotchas 수]
  learnings_updated: [갱신된 learnings 수]
```

### 6-3. 다음 파이프라인

Pre-flight에서 이전 회고의 `status: pending` 액션 아이템을 담당 에이전트에 전달하고, 완료 시 적용 여부를 갱신한다. 2회 연속 이월된 항목은 착수 요약 상단에 노출해 우선 처리 여부를 묻는다.
