---
description: PRD + 기술 설계 + 태스크 분해 — 풀 피처 플래닝
argument-hint: <피처 또는 이슈 설명>
---

# Bams Plan

Bams 오케스트레이터로서 product-strategy, business-analysis, frontend/backend-engineering 에이전트를 활용한 플래닝 워크플로를 실행합니다.

기획할 피처/이슈: $ARGUMENTS

$ARGUMENTS가 비어있으면, 사용자에게 어떤 피처를 기획할지 물어보고 중단합니다.

## 코드 최신화

Bash로 `git rev-parse --is-inside-work-tree 2>/dev/null`를 실행하여 git 저장소인지 확인합니다.

**git 저장소인 경우**: Bash로 `git branch --show-current`를 실행하여 현재 브랜치를 확인한 뒤, `git pull origin {현재 브랜치}`를 실행하여 원격 저장소의 최신 코드를 가져옵니다. 충돌이 발생하면 사용자에게 알리고 중단합니다.

**git 저장소가 아닌 경우**: 이 단계를 스킵합니다.

## 사전 조건

Glob으로 `.crew/config.md`가 존재하는지 확인합니다. 없으면:
- 출력: "프로젝트가 초기화되지 않았습니다. `/bams:init`을 실행하여 설정하세요."
- 여기서 중단.

`.crew/config.md`와 `.crew/board.md`를 읽어 현재 상태를 파악합니다.

> **위임 체계 (Canonical)**: 이 커맨드는 `_shared_common.md` §위임 원칙 + 부록 **루프 B**(Advised)를 따른다. 메인(커맨드)이 부서장을 **직접** Task tool로 spawn하며, pipeline-orchestrator는 조언자(Advisor) 모드로 1회만 호출된다. orchestrator를 경유한 중첩 spawn 금지(harness 깊이 2 제약).

## Phase 1: PRD 작성 — 루프 A (Simple, 단일 부서장 직접 spawn)

Phase 1은 단일 도메인(기획)이므로 **루프 A**를 따른다. orchestrator 조언을 생략하고 메인이 product-strategy(기획부장)를 직접 호출한다.

Bash로 step_start + agent_start emit:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1)
[ -n "$_EMIT" ] && bash "$_EMIT" step_start "{slug}" 1 "PRD 작성" "Phase 1: 기획"
[ -n "$_EMIT" ] && bash "$_EMIT" agent_start "{slug}" "product-strategy-1-$(date -u +%Y%m%d)" "product-strategy" "sonnet" "Phase 1: PRD 작성"
```

Task tool, subagent_type: **"bams-plugin:product-strategy"**, model: **"sonnet"** — 메인이 직접 호출:

> **기획 Phase 1 — PRD 작성**
>
> ```
> task_description: "피처 요청을 분석하고 구조화된 PRD를 작성하라"
> input_artifacts:
>   - .crew/config.md
>   - feature_description: {$ARGUMENTS}
> expected_output:
>   type: prd_document
>   paths: [.crew/artifacts/prd/{slug}-prd.md]
> quality_criteria:
>   - 문제 정의 및 목표 명확
>   - 사용자 스토리 / 유스케이스 포함
>   - 기능 요구사항 (필수/선택) 구분
>   - 비기능 요구사항 (성능, 보안, 접근성) 포함
>   - 인수 기준 (테스트 가능한 구체적 기준) 정의
>   - 미결 질문 명시
> ```
>
> 기획부장은 도메인 내 business-analysis / ux-research specialist를 **최대 1회** 추가 spawn 가능(harness 깊이 2 한도).
>
> **미결 질문이 있으면** 반드시 보고하세요.

반환 후 agent_end + step_end emit:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1)
[ -n "$_EMIT" ] && bash "$_EMIT" agent_end "{slug}" "product-strategy-1-$(date -u +%Y%m%d)" "product-strategy" "success" {duration_ms} "PRD 작성 완료"
[ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" 1 "done" {duration_ms}
```

**미결 질문이 있으면**: 불릿 포인트로 사용자에게 제시합니다. Phase 2로 진행하기 전에 사용자의 답변을 기다립니다. 이 단계를 절대 건너뛰지 마세요. 답변을 받은 후 PRD에 반영합니다.

## Phase 2: 기능 명세 + 기술 설계 — 루프 B (Advised, 다부서 병렬 직접 spawn)

Phase 2는 기획/개발 **다부서** 병렬 트랙이므로 **루프 B**를 따른다. orchestrator를 Advisor로 1회 호출하여 라우팅/게이트 권고를 받은 뒤, 메인이 권고된 부서장들을 단일 메시지 내 복수 Task 호출로 **직접 병렬 spawn**한다.

### Phase 2-a. pipeline-orchestrator 조언 요청 (Advisor)

Bash로 step_start + agent_start emit:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1)
[ -n "$_EMIT" ] && bash "$_EMIT" step_start "{slug}" 2 "명세+설계 계획" "Phase 2: Advisor"
[ -n "$_EMIT" ] && bash "$_EMIT" agent_start "{slug}" "pipeline-orchestrator-2-$(date -u +%Y%m%d)" "pipeline-orchestrator" "sonnet" "Phase 2: 기능명세+기술설계 조언 요청"
```

Task tool, subagent_type: **"bams-plugin:pipeline-orchestrator"**, model: **"sonnet"** — **조언자 모드**:

> **Plan Phase 2 Advisor 호출 — 기능 명세 + 기술 설계 라우팅 권고**
>
> **컨텍스트:**
> ```
> phase: 2
> slug: {slug}
> pipeline_type: plan
> prd: .crew/artifacts/prd/{slug}-prd.md
> config: .crew/config.md
> ```
>
> **요청:** 메인이 병렬 spawn할 부서장 목록과 위임 메시지 템플릿(기능 명세는 product-strategy, FE/BE 기술 설계는 frontend-engineering / backend-engineering), 산출물 경로, 게이트 조건을 Advisor Response로 반환하세요. 직접 spawn 금지(harness 깊이 2 제약).

반환 후 agent_end emit + Advisor Response 파싱 + CHAIN_VIOLATION 체크:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1)
[ -n "$_EMIT" ] && bash "$_EMIT" agent_end "{slug}" "pipeline-orchestrator-2-$(date -u +%Y%m%d)" "pipeline-orchestrator" "success" {duration_ms} "Phase 2 Advisor 응답 수신"
[ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" 2 "done" {duration_ms}
```

### Phase 2-b. 메인이 부서장 3트랙 병렬 직접 spawn

Bash로 step_start + 3개 agent_start 일괄 emit:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1)
[ -n "$_EMIT" ] && bash "$_EMIT" step_start "{slug}" 3 "명세+설계 병렬 실행" "Phase 2: 실행"
[ -n "$_EMIT" ] && bash "$_EMIT" agent_start "{slug}" "product-strategy-2-$(date -u +%Y%m%d)" "product-strategy" "sonnet" "Phase 2: 기능 명세"
[ -n "$_EMIT" ] && bash "$_EMIT" agent_start "{slug}" "frontend-engineering-2-$(date -u +%Y%m%d)" "frontend-engineering" "sonnet" "Phase 2: FE 기술 설계"
[ -n "$_EMIT" ] && bash "$_EMIT" agent_start "{slug}" "backend-engineering-2-$(date -u +%Y%m%d)" "backend-engineering" "sonnet" "Phase 2: BE 기술 설계"
```

**단일 메시지에 3개 Task tool 호출을 동시에 발행하여 메인이 직접 병렬 spawn:**

1. Task tool, subagent_type: **"bams-plugin:product-strategy"**, model: **"sonnet"**
   > **Plan Phase 2 — 기능 명세**
   > ```
   > task_description: "PRD를 기반으로 상세 기능 명세를 작성하라"
   > input_artifacts: [.crew/artifacts/prd/{slug}-prd.md, .crew/config.md]
   > expected_output: { type: functional_spec, paths: [.crew/artifacts/design/{slug}-spec.md] }
   > quality_criteria:
   >   - 화면/API별 상세 동작 명세 완성
   >   - 데이터 모델 정의
   >   - 상태 전이 다이어그램 (필요 시)
   >   - 에러 시나리오 및 처리 방법
   >   - 외부 시스템 연동 명세
   > ```
   > 기획부장은 business-analysis specialist를 최대 1회 추가 spawn 가능.

2. Task tool, subagent_type: **"bams-plugin:frontend-engineering"**, model: **"sonnet"**
   > **Plan Phase 2 — FE 기술 설계**
   > ```
   > task_description: "PRD를 기반으로 프론트엔드 기술 설계를 작성하라"
   > input_artifacts: [.crew/artifacts/prd/{slug}-prd.md, .crew/config.md]
   > expected_output: { type: technical_design_fe, paths: [.crew/artifacts/design/{slug}-design-fe.md] }
   > quality_criteria:
   >   - 컴포넌트 구조 명확
   >   - 상태 관리/라우팅/스타일링 전략
   >   - 파일 목록
   > ```

3. Task tool, subagent_type: **"bams-plugin:backend-engineering"**, model: **"sonnet"**
   > **Plan Phase 2 — BE 기술 설계**
   > ```
   > task_description: "PRD를 기반으로 백엔드 기술 설계를 작성하라"
   > input_artifacts: [.crew/artifacts/prd/{slug}-prd.md, .crew/config.md]
   > expected_output: { type: technical_design_be, paths: [.crew/artifacts/design/{slug}-design-be.md] }
   > quality_criteria:
   >   - API 엔드포인트 정의 완료
   >   - DB 스키마 / 비즈니스 로직
   >   - 인증/권한
   >   - 파일 목록
   > ```

3개 반환 후 agent_end 일괄 emit + step_end:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1)
[ -n "$_EMIT" ] && bash "$_EMIT" agent_end "{slug}" "product-strategy-2-$(date -u +%Y%m%d)" "product-strategy" "success" {duration_ms} "기능 명세 완료"
[ -n "$_EMIT" ] && bash "$_EMIT" agent_end "{slug}" "frontend-engineering-2-$(date -u +%Y%m%d)" "frontend-engineering" "success" {duration_ms} "FE 설계 완료"
[ -n "$_EMIT" ] && bash "$_EMIT" agent_end "{slug}" "backend-engineering-2-$(date -u +%Y%m%d)" "backend-engineering" "success" {duration_ms} "BE 설계 완료"
[ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" 3 "done" {duration_ms}
```

**기대 산출물**: 기능 명세, FE 기술 설계, BE 기술 설계 (3트랙 병렬 결과)

## Phase 3: 태스크 분해

pipeline-orchestrator가 반환한 Phase 2 결과를 종합하여 구체적인 태스크로 분해합니다:

1. 기능 명세(spec)와 기술 설계(design) 문서 읽기
2. 기능 명세와 기술 설계를 병합
3. 작업을 개별 태스크로 분해. 각 태스크는:
   - 한 세션에서 완료 가능 (생성/수정 파일 5개 이하, 변경 라인 200줄 이하 목표)
   - 명확한 입력(읽을 것)과 출력(만들 것) 보유
   - 명시적 파일 범위
   - 역할 할당: Developer, Reviewer, 또는 QA
   - 우선순위: P0 (핵심 경로), P1 (중요), P2 (있으면 좋음)
4. 태스크 간 의존성 식별
5. 병렬 실행 가능한 태스크 식별

## Phase 4: 아티팩트 저장 및 보드 업데이트

1. 피처명에서 slug 생성 (소문자, 하이픈, 특수문자 없음)

2. PRD를 `.crew/artifacts/prd/[slug]-prd.md`에 저장

3. 기술 설계를 `.crew/artifacts/design/[slug]-design.md`에 저장 (기능 명세 + 프론트엔드 설계 + 백엔드 설계 통합)

4. `.crew/config.md` 프론트매터에서 현재 `last_task_id` 읽기

5. `.crew/board.md` 업데이트: 각 태스크를 `## Backlog` 섹션에 다음 형식으로 추가:

```markdown
### TASK-[NNN]: [태스크 제목]
- **Role**: Developer | Reviewer | QA
- **Priority**: P0 | P1 | P2
- **Depends on**: TASK-[NNN] | none
- **Feature**: [slug]
- **Files**: [생성/수정할 파일 목록]
- **Description**: [1-2문장 설명]
- **Acceptance criteria**: [구체적이고 테스트 가능한 기준]
```

6. `.crew/config.md` 프론트매터의 `last_task_id`를 업데이트

7. `board.md`의 `> Last updated:` 타임스탬프 업데이트

## Phase 5: 사용자에게 계획 제시

간결한 요약을 제시합니다:

```
피처: [name]
PRD: .crew/artifacts/prd/[slug]-prd.md
설계: .crew/artifacts/design/[slug]-design.md

태스크 ([N]개 총):
  [의존성 트리 보여주는 정렬된 목록]
  예시:
    TASK-001: [title] (P0, Developer)
    TASK-002: [title] (P0, Developer) - TASK-001에 블록됨
    TASK-003: [title] (P1, Developer) - TASK-001과 병렬 실행 가능

병렬 실행 가능: [N]개 태스크 동시 실행 가능
핵심 경로: TASK-XXX -> TASK-XXX -> TASK-XXX

개발 시작하려면: /bams:dev [slug]
```

## Phase 6: CLAUDE.md 상태 업데이트

`CLAUDE.md`의 `## Bams 현재 상태` 섹션을 업데이트합니다 (없으면 파일 끝에 추가, 있으면 Edit으로 교체). `.crew/board.md`를 읽어 다음을 포함:
- 마지막 업데이트 타임스탬프
- 진행 중인 작업 (In Progress/In Review 태스크)
- 활성 스프린트 정보
- 이번 실행에서 생성된 아티팩트 경로 (PRD, 설계)
- 다음 명령 제안 (`/bams:dev`, `/bams:sprint plan`)
