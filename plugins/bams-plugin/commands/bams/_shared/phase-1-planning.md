# Shared: Phase 1 — 기획 (PRD + 기술 설계 + 태스크 분해)

> stub(`dev/phase-1-planning.md` 또는 `feature/phase-1-planning.md`)이 이 파일을 Read하여 실행합니다.
> `{PLACEHOLDER}`는 stub의 Delta 파라미터 표 값으로 치환합니다. `[확장점: NAME]`은 stub의 "커스터마이징" 항목이 있으면 실행하고, 없으면 스킵합니다.
> 실행 규약 상세는 `_shared/README.md` 참조.

## 입력 컨텍스트

- slug: 엔트리포인트에서 결정된 slug
- feature_description: $ARGUMENTS
- config: `.crew/config.md`
- board: `.crew/board.md`
- (stub별 추가 컨텍스트는 stub 파일의 "입력 컨텍스트" 절 참조)

---

## Step {STEP_1}. PRD 작성 (루프 B — Advisor + 기획부장 직접 spawn)

### Step {STEP_1}-a. pipeline-orchestrator 조언 요청 (Advisor)

Task tool, subagent_type: **"bams-plugin:pipeline-orchestrator"** — **조언자 모드**:

> **Phase 1 Step {STEP_1} Advisor 호출 — PRD 작성 라우팅 권고**
>
> **컨텍스트:**
> ```
> phase: 1
> slug: {slug}
> pipeline_type: {PIPELINE_TYPE}
> config: .crew/config.md
> feature_description: {$ARGUMENTS}
> ```
>
> **요청:** 이 단계에서 메인이 직접 spawn할 부서장과 위임 메시지, Phase 게이트 기준을 Advisor Response 형식으로 반환하세요. 부서장을 직접 spawn하지 마세요 (harness 깊이 2 제약).
>
> **기대 Advisor Response:** 부서장 라우팅(product-strategy 권고), 위임 메시지 템플릿, PRD 게이트 조건, CHAIN_VIOLATION 여부.

반환 후 Advisor Response 파싱 + CHAIN_VIOLATION 체크 (발견 시 즉시 중단 + 에스컬레이션).

### Step {STEP_1}-b. 메인이 product-strategy(기획부장) 직접 spawn

Task tool, subagent_type: **"bams-plugin:product-strategy"** — 메인이 직접 호출:

> **Phase 1 Step {STEP_1} — PRD 작성**
>
> ```
> task_description: "피처 요청을 분석하고 PRD를 작성하라"
> input_artifacts:
>   - .crew/config.md
> expected_output:
>   type: prd_document
>   paths: [.crew/artifacts/prd/{slug}-prd.md]
> quality_criteria:
>   - 명확한 문제 정의와 목표
>   - 사용자 스토리 포함
>   - 인수 기준 정의
>   - 스코프 경계 명시
> ```
>
> product-strategy는 자신의 도메인 내에서 business-analysis/ux-research specialist를 최대 1회 추가 spawn할 수 있습니다 (harness 깊이 2 한도).
>
> **미결 질문이 있으면** 반드시 보고하세요.

**미결 질문이 있으면** 사용자에게 제시하고 답변을 기다립니다.

---

## Step {STEP_2}. 기술 설계 + 태스크 분해 (루프 B — Advisor + 기획/개발부장 병렬 직접 spawn)

### Step {STEP_2}-a. pipeline-orchestrator 조언 요청 (Advisor)

Task tool, subagent_type: **"bams-plugin:pipeline-orchestrator"** — **조언자 모드**:

> **Phase 1 Step {STEP_2} Advisor 호출 — 기술 설계 + 태스크 분해 라우팅 권고**
>
> **컨텍스트:**
> ```
> phase: 1
> slug: {slug}
> pipeline_type: {PIPELINE_TYPE}
> prd: .crew/artifacts/prd/{slug}-prd.md
> config: .crew/config.md
> ```
>
> **요청:** 병렬로 spawn해야 할 부서장 목록(product-strategy, frontend-engineering, backend-engineering 권고), 각 부서장별 위임 메시지 템플릿{STEP_2_ADVISOR_EXTRA}, Phase 게이트 기준을 Advisor Response로 반환하세요. 직접 spawn 금지.

반환 후 Advisor Response 파싱 + CHAIN_VIOLATION 체크.

### Step {STEP_2}-b. 메인이 부서장 3명 병렬 직접 spawn (단일 메시지 복수 Task)

**단일 메시지에 3개 Task tool 호출을 묶어** 다음을 병렬 spawn합니다:

1. Task tool, subagent_type: **"bams-plugin:product-strategy"**:
> ```
> task_description: "PRD 기반 상세 동작 명세를 작성하라"
> input_artifacts: [.crew/artifacts/prd/{slug}-prd.md]
> expected_output:
>   type: functional_spec
>   paths: [.crew/artifacts/design/{slug}-spec.md]
> quality_criteria:
>   - 모든 유저 플로우 커버
>   - 엣지 케이스 정의
>   - 데이터 모델 명시
> ```
> product-strategy는 business-analysis specialist를 최대 1회 추가 spawn 가능.

2. Task tool, subagent_type: **"bams-plugin:frontend-engineering"**:
> ```
> task_description: "PRD 기반 프론트엔드 기술 설계(UI/컴포넌트/상태관리)를 작성하라"
> input_artifacts: [.crew/artifacts/prd/{slug}-prd.md, .crew/config.md]
> expected_output:
>   type: technical_design
>   paths: [.crew/artifacts/design/{slug}-design.md (FE 섹션)]
> quality_criteria:
>   - 컴포넌트 구조 명확
>   - 데이터 흐름 명시
> ```

3. Task tool, subagent_type: **"bams-plugin:backend-engineering"**:
> ```
> task_description: "PRD 기반 백엔드 기술 설계(API/DB/비즈니스 로직)를 작성하라"
> input_artifacts: [.crew/artifacts/prd/{slug}-prd.md, .crew/config.md]
> expected_output:
>   type: technical_design
>   paths: [.crew/artifacts/design/{slug}-design.md (BE 섹션)]
> quality_criteria:
>   - API 엔드포인트 정의
>   - DB 스키마 명확
> ```

3개 결과 수신 후 메인이 종합하여 태스크를 분해합니다 (각 태스크에 범위, 역할 할당, 우선순위, 의존성, 인수 기준 포함, board.md 형식).

### [확장점: STEP_2_EXTRA] — stub 커스터마이징에 값이 있으면 여기서 추가 spawn을 실행합니다 (예: feature의 project-governance 스프린트 설정 spawn을 "Step {STEP_2}-c"로 실행). 값이 없으면 이 섹션을 건너뜁니다.

---

## 저장 절차

orchestrator로부터 받은 결과물을 저장합니다:

1. PRD를 `.crew/artifacts/prd/{slug}-prd.md`에 저장
2. 설계를 `.crew/artifacts/design/{slug}-design.md`에 저장
3. 태스크를 `.crew/board.md`의 `## Backlog`에 추가
4. `.crew/config.md`의 `last_task_id` 업데이트

각 태스크에는 다음 필드를 포함합니다: `title`, `phase` (1), `priority`, `assignee_agent`, `deps`, `tags`.

---

## 기획 → 구현 핸드오프

`{STEP_HANDOFF}`가 지정된 경우 별도 단계로, 지정되지 않은 경우 위 Step {STEP_2} 흐름 안에서 이어서 실행합니다.

**루프 B — Advisor가 게이트 판정, 메인이 cross-department-coordinator 직접 spawn.**

### 핸드오프-a. pipeline-orchestrator 조언 요청 (Phase 게이트 판정)

Task tool, subagent_type: **"bams-plugin:pipeline-orchestrator"** — **조언자 모드**:

> **Phase 1 → Phase 2 Advisor 호출 — 게이트 판정 + 핸드오프 라우팅**
>
> **컨텍스트:**
> ```
> phase: 1→2 handoff
> slug: {slug}
> pipeline_type: {PIPELINE_TYPE}
> prd: .crew/artifacts/prd/{slug}-prd.md
> design: .crew/artifacts/design/{slug}-design.md
> board: .crew/board.md
> ```
>
> **요청:** Phase 1 완료 조건 검증 결과(GO/NO-GO/CONDITIONAL-GO) — {GATE_CHECKLIST} — 와, 핸드오프 조율을 위해 메인이 spawn할 조율자(cross-department-coordinator 권고)의 위임 메시지를 Advisor Response로 반환하세요. 직접 spawn 금지.

반환 후 파싱 + CHAIN_VIOLATION 체크.

### 핸드오프-b. 메인이 cross-department-coordinator 직접 spawn

Advisor 판정이 GO 또는 CONDITIONAL-GO인 경우에 진행합니다. NO-GO이면 미충족 항목을 사용자에게 보고하고 해결 후 재시도합니다.

Task tool, subagent_type: **"bams-plugin:cross-department-coordinator"** — 메인이 직접 호출:

> **Phase 1→2 핸드오프 조율**
>
> - 기획부장의 산출물(PRD, 설계, 태스크)이 개발부장에게 올바르게 전달되는지 확인
> - 부서 간 인터페이스(API 계약, 데이터 스키마) 정합성 확인
> - 누락되거나 모호한 인터페이스 항목 보고
>
> **기대 산출물**: 핸드오프 체크리스트 결과

**Phase 게이트 결과가 NO-GO이면**: 미충족 항목을 사용자에게 보고하고, 해결 후 재시도합니다.

AskUserQuestion — "{HANDOFF_QUESTION_TITLE}"
- **{HANDOFF_QUESTION_PROCEED} (Recommended)**

### [확장점: HANDOFF_EXTRA_QUESTION] — stub 커스터마이징에 값이 있으면 위 AskUserQuestion에 추가 분기를 삽입합니다 (예: feature의 "기획까지만" 옵션 → `status: paused_at_step_2` 기록 후 종료). 값이 없으면 기본 문구(진행/중단)만 사용합니다.

---

## Phase 1 게이트 조건

{GATE_CHECKLIST_ITEMS}

Phase 1 완료 → `{NEXT_FILE_PATH}`를 Read합니다 (또는 stub에 지정된 라우팅 방식을 따릅니다).
