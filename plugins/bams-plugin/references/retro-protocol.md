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
           [강제: architecture|type|hook/lint/CI|test|doc] (증명: {과거 사고에 적용하면 실패하는 명령+기대 출력} | doc 사유: {상위 수준 불가 이유})
```

- Problem 출처: history.md 실패, 반복 재작업, 에스컬레이션, 반복 리뷰 지적, 사용자 불만.
- 모든 Problem에 Try ≥1. Try는 다음 파이프라인에 바로 적용할 행동·설정·프롬프트 변경이어야 한다("더 잘하겠다" 금지).

### 3-1-a. 강제 수준 사다리

교훈은 텍스트보다 구조로 남긴다. Try마다 위에서부터 검토해 **작동하는 가장 높은 수준**을 고른다. 텍스트 규칙은 아무도 읽지 않아도 아무것도 실패하지 않는다.

| 순위 | 강제 | 의미 | 증명 |
|------|------|------|------|
| 1 | architecture | 잘못된 경로 자체를 없앤다 — 단일 소유자·SSOT·내부 은닉·옛 경로 삭제 | 과거 사고의 코드가 더는 작성·import 불가 |
| 2 | type | 잘못된 상태를 타입·스키마로 작성 불가하게 | 과거 사고 코드가 타입체크 실패 |
| 3 | hook/lint/CI | 위반 시 실패하고 에러가 올바른 대안(파일·함수)을 지목. 기존 위반이 많으면 신규 추가분만 실패 | 과거 사고 diff에 돌려 실패 출력 확인 |
| 4 | test | 동작 테스트 — 동작이 깨지면 실패, 내부만 바뀌면 통과 | 과거 사고 커밋에서 테스트 실패 확인 |
| 5 | doc | 문서·에이전트 규칙·MEMORY.md — **판단이 필요한 경우만** | 없음 → `doc 사유` 필수 |

- 1~4는 `증명` 필수: 과거 사고(대상 Problem의 커밋·산출물)에 적용해 실패함을 명령+출력으로 보인다. 증명하지 못하면 `[강제: doc]`로 적고 `doc 사유`에 "미증명"을 쓴다.
- 구조로 고치면 구조만 쓴다 — 같은 내용의 문서 규칙·MEMORY.md 항목을 추가하지 않고, 있으면 삭제한다(§5-2 구조 승격).
- 1~4 Try의 구현은 코드 변경이므로 §6-1 경로 E로 부서장에게 위임한다.

### 3-1-b. hook 승격 후보 자동 플래그

회고마다 `.crew/gotchas.md`를 읽어 `enforced-by: doc` 항목 중 아래에 해당하면 보고서의 "hook 승격 후보" 섹션에 올리고 강제 수준 ≥3 Try를 제안한다(`gotchas-spec.md` §구조 승격).

| 조건 | 근거 |
|------|------|
| 발생 횟수 ≥3 | 반복 영역 |
| gotcha 등록 이후 재발 ≥1 (같은 class 2회째) | 규칙이 있었는데 막지 못함 = 텍스트 강제 실패 |

### 3-2. 합의

orchestrator가 Problem을 영향도로 정렬하고, Try마다 담당·적용 시점을 지정하며, 부서 간 Keep/Problem 모순을 확인한다. `[강제: doc]` Try는 `doc 사유`가 상위 수준을 실제로 배제하는지 확인하고, 아니면 상위 수준으로 되돌린다.

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
| 구조 승격 | 교훈이 강제 수준 1~4(§3-1-a)로 적용되고 증명이 통과하면 해당 항목을 삭제한다 — 구조가 메모리다 |
| 승인 | MEMORY.md 반영 전 사용자 확인. Write 불가 에이전트 몫은 hr-agent가 대행 |
| 구형식 | `## [YYYY-MM-DD] {slug}` 항목은 conf low·seen 1·last=헤더 날짜로 간주. TTL 경과분은 즉시 삭제, 유효분만 쓸 때 전환 |

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
| E 구조 | 코드·타입·hook·lint·CI·test (프로젝트 또는 plugin) | `[강제: 1~4]` Try (§3-1-a) | 사용자 확인 → 해당 부서장 위임. 적용 후 A·B의 같은 교훈 삭제/`enforced-by` 갱신 |

경로 선택은 E → B/C → A → D 순으로 검토한다(구조 우선, 정의 파일은 마지막).

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
      enforcement: architecture|type|hook/lint/CI|test|doc
      proof: "{명령 + 과거 사고에서의 실패 출력}"   # doc이면 doc 사유
      status: pending
  try_by_enforcement: {architecture: N, type: N, hook/lint/CI: N, test: N, doc: N}
  hook_candidates: [G-ID 목록]          # §3-1-b
  lessons_saved: [에이전트 목록]
  lessons_removed_by_structure: N        # §5-2 구조 승격
  gotchas_promoted: [승격된 gotchas 수]
  learnings_updated: [갱신된 learnings 수]
```

### 6-3. 다음 파이프라인

Pre-flight에서 이전 회고의 `status: pending` 액션 아이템을 담당 에이전트에 전달하고, 완료 시 적용 여부를 갱신한다. 2회 연속 이월된 항목은 착수 요약 상단에 노출해 우선 처리 여부를 묻는다.
