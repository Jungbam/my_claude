# Shared: Phase 2 — 구현 (멀티에이전트 배치 실행)

> stub(`dev/phase-2-implementation.md` 또는 `feature/phase-2-implementation.md`)이 이 파일을 Read하여 실행합니다.
> `{PLACEHOLDER}`는 stub의 Delta 파라미터 표 값으로 치환합니다. `[확장점: NAME]`은 stub의 "커스터마이징" 항목이 있으면 실행하고, 없으면 스킵합니다.
> 실행 규약 상세는 `_shared/README.md` 참조.

## 입력 컨텍스트

- slug: {엔트리포인트에서 결정된 slug}
- 이전 Phase 산출물:
  - `.crew/artifacts/prd/{slug}-prd.md`
  - `.crew/artifacts/design/{slug}-design.md`
  - `.crew/board.md` (태스크 분해 결과)
  - (stub별 추가 컨텍스트는 stub 파일의 "입력 컨텍스트" 절 참조)

---

## Step {STEP_N}. 멀티에이전트 구현 (개발부장 위임)

Bash로 다음을 실행합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_start "{slug}" {STEP_N} "{STEP_N_LABEL}" "Phase 2: 구현"
```

board.md에서 태스크 목록을 의존성 순서로 정렬합니다. 배치로 그룹화:
- **배치 1**: 의존성 없는 태스크
- **배치 2**: 의존성이 모두 배치 1에 있는 태스크
- **배치 N**: 모든 태스크가 스케줄될 때까지 계속

**루프 B — 각 배치마다 Advisor 조언 → 메인이 권고된 부서장들 병렬 직접 spawn.**

### Step {STEP_N}-a. pipeline-orchestrator 조언 요청 (배치 {N} 라우팅)

Bash로 agent_start emit:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_start "{slug}" "pipeline-orchestrator-{STEP_N}-{N}-$(date -u +%Y%m%d)" "pipeline-orchestrator" "claude-fable-5" "Step {STEP_N}: 배치 {N} 라우팅 조언 요청"
```

Task tool, subagent_type: **"bams-plugin:pipeline-orchestrator"** — **조언자 모드**:

> **Phase 2 배치 {N} Advisor 호출 — 부서장 라우팅 권고**
>
> **컨텍스트:**
> ```
> phase: 2
> slug: {slug}
> pipeline_type: {PIPELINE_TYPE}
> prd: .crew/artifacts/prd/{slug}-prd.md
> design: .crew/artifacts/design/{slug}-design.md
> board: .crew/board.md
> model_strategy: {Phase 0에서 받은 모델 전략}
> batch: {N}
> tasks: [{이 배치의 태스크 ID 목록}]
> ```
>
> **요청:** 태스크의 파일 범위/태그에 따라 적절한 부서장을 결정(`delegation-protocol.md` 3-1/3-2/3-3 참조):
>
> - UI/컴포넌트/스타일 → frontend-engineering
> - API/DB/비즈니스 로직 → backend-engineering
> - 인프라/배포 → platform-devops
> - 데이터 → data-integration
> - 겹치는 경우 → 파일 기준 분리 + cross-department-coordinator 조율 권고
>
> {DESIGN_DIRECTOR_ADVISOR_NOTE}
>
> 각 부서장별 위임 메시지 템플릿, 병렬/순차 실행 권고, Phase 2 게이트 기준을 Advisor Response로 반환하세요. 직접 spawn 금지(harness 깊이 2 제약).

반환 후 agent_end emit + Advisor Response 파싱 + CHAIN_VIOLATION 체크:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_end "{slug}" "pipeline-orchestrator-{STEP_N}-{N}-$(date -u +%Y%m%d)" "pipeline-orchestrator" "success" "$(( $([ -n "$_EMIT" ] && bash "$_EMIT" now_ms || echo 0) - {agent_start_ms} ))" "Step {STEP_N} 배치 {N} Advisor 응답 수신"
```

### Step {STEP_N}-b. 메인이 권고된 부서장들 병렬 직접 spawn

### [확장점: DESIGN_DIRECTOR_MODE] — stub Delta의 `{DESIGN_DIRECTOR_MODE}` 값에 따라 분기합니다:

- **`sequential-mandatory`** (feature): UI/UX 태스크가 포함된 경우 **먼저 design-director를 spawn**하여 디자인 산출물을 확보한 뒤, 파일 겹침이 없는 태스크는 단일 메시지에 복수 Task 호출로 병렬 spawn합니다.
- **`parallel-optional`** (dev): 부서장 병렬 spawn을 먼저 진행하고, Advisor Response에 프론트엔드 태스크가 포함된 경우에만 design-director를 FE 부서장과 **병렬로 추가** 호출합니다 (비용 최적화). FE 태스크가 없으면 design-director를 호출하지 않습니다.

파일 겹침이 없는 태스크는 **단일 메시지에 복수 Task 호출**로 병렬 spawn합니다.

각 부서장 호출 전 agent_start를 일괄 emit한 뒤, Task tool, subagent_type: **"bams-plugin:{dept}"** (frontend-engineering / backend-engineering / platform-devops / data-integration / design-director), model: 배치 전략 기반으로 **직접** 호출합니다. 위임 메시지는 Advisor Response 템플릿(`delegation-protocol.md` 2-2 형식)을 사용:

> ```
> task_description: "{태스크 제목과 설명}"
> input_artifacts:
>   - .crew/artifacts/prd/{slug}-prd.md
>   - .crew/artifacts/design/{slug}-design.md
> expected_output:
>   type: code_implementation
>   paths: [{태스크에서 정의된 파일 경로}]
> quality_criteria:
>   - 인수 기준 충족
>   - 타입 에러 0건
>   - 린트 에러 0건
> constraints:
>   allowed_files: [{태스크 파일 범위}]
> {STEP_N_GOTCHAS_LINE}
> ```

각 부서장은 자신의 도메인 내 specialist를 최대 1회 추가 spawn 가능(harness 깊이 2 한도). 파일 겹침 태스크는 cross-department-coordinator(메인이 추가로 직접 spawn)로 조율합니다.

**`parallel-optional` 모드 전용 — 디자인부 연동 (FE 태스크 포함 시)**:

Advisor Response에 프론트엔드 태스크가 포함되어 있으면, design-director(디자인부장)를 FE 부서장과 **병렬로** 추가 호출합니다:

Task tool, subagent_type: **"bams-plugin:design-director"**:
> **디자인 검토 및 UI 가이드 제공**
>
> FE 구현 태스크에 대한 디자인 검토를 수행합니다:
> - UI 컴포넌트 설계 리뷰
> - 디자인 시스템 일관성 확인
> - 접근성(a11y) 가이드라인 제공
>
> design-director는 내부적으로 ui-designer, ux-designer, design-system-agent 등 specialist를 최대 1회 추가 spawn 가능.

디자인부장은 FE 태스크가 없으면 호출하지 않습니다 (비용 최적화). (`sequential-mandatory` 모드에서는 이 절이 아니라 위 확장점 분기의 "선행 spawn" 절차를 따릅니다.)

모든 부서장 완료 후, 각 부서장에 대해 결과를 확인합니다:
- **성공 시**: agent_end status="success", step 계속 진행
- **에러 시**: agent_end status="error". 사용자에게 에러를 보고하고 AskUserQuestion으로 계속/중단 확인. 중단 선택 시 pipeline_end status="failed" emit 후 종료.

```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_end "{slug}" "{dept}-{STEP_N}-{N}-$(date -u +%Y%m%d)" "{dept}" "{success|error}" "$(( $([ -n "$_EMIT" ] && bash "$_EMIT" now_ms || echo 0) - {agent_start_ms} ))" "Step {STEP_N} 배치 {N} 부서장 완료"
```

그 후:
- 파일을 읽어 올바르게 생성/수정되었는지 확인
- board.md에서 해당 태스크를 `## In Review`로 이동
- **DB 상태 업데이트 (board.md 이동과 동시에 실행)**: `~/.claude/plugins/marketplaces/my-claude/bams.db`가 존재하면 해당 태스크의 상태를 `in_review`로 업데이트한다:
  ```bash
  if [ -f "$HOME/.claude/plugins/marketplaces/my-claude/bams.db" ]; then
    bun -e "
      import { TaskDB } from './plugins/bams-plugin/tools/bams-db/index.ts';
      const db = new TaskDB();
      // 배치의 각 태스크 ID에 대해 호출 (task_id는 createTask() 반환값 또는 board.md에서 조회):
      // db.updateTaskStatus('{task_id}', 'in_review', 'pipeline-orchestrator');
      db.close();
    "
  fi
  ```
- git 저장소인 경우 `git diff --stat` 표시

### [확장점: CHANGE_CONFIRM_GATE] — 값이 있으면(dev) 아래 AskUserQuestion 확인 단계를 실행합니다. 값이 없으면(feature) 위 "git diff --stat 표시"만으로 충분하며 이 단계를 건너뜁니다.

**AskUserQuestion**으로 확인:
Question: "구현 결과를 적용할까요?"
Header: "Confirm"
Options:
- **적용** - "변경사항을 유지하고 다음 단계로 진행"
- **되돌리기** - "모든 변경사항을 되돌리고 중단"
- **부분 되돌리기** - "특정 파일만 되돌리기"

**Step {STEP_N} 종료 시점 (중요 — stub Delta에 따라 분기)**:
- `{STEP_N_HANDOFF}`가 비어 있는 경우(dev): 여기서 즉시 step_end를 emit합니다.
  ```bash
  _EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" {STEP_N} "done" "$(( $([ -n "$_EMIT" ] && bash "$_EMIT" now_ms || echo 0) - {step_start_ms} ))"
  ```
  이 경우 아래 "구현 → 검증 핸드오프" 섹션은 건너뛰고, Phase 2 게이트 조건으로 바로 이동합니다.
- `{STEP_N_HANDOFF}`가 지정된 경우(feature): 여기서 step_end를 emit하지 **않습니다**. 아래 "구현 → 검증 핸드오프" 섹션을 계속 실행한 뒤, 그 섹션 끝에서 step_end({STEP_N})를 한 번만 emit합니다.

---

## 구현 → 검증 핸드오프

`{STEP_N_HANDOFF}`가 지정된 경우에만 실행합니다 (값이 없으면 이 섹션 전체를 건너뜁니다 — dev는 별도 `phase-2-5-test.md`가 검증을 이어받습니다, 고유 구조이므로 변경하지 않습니다).

**루프 B — Advisor 게이트 판정 후 메인이 cross-department-coordinator 직접 spawn.**

### 핸드오프-a. pipeline-orchestrator 조언 요청 (Phase 게이트 판정)

Bash로 agent_start emit:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_start "{slug}" "pipeline-orchestrator-handoff2-$(date -u +%Y%m%d)" "pipeline-orchestrator" "claude-fable-5" "구현→검증 게이트 판정 조언"
```

Task tool, subagent_type: **"bams-plugin:pipeline-orchestrator"** — **조언자 모드**:

> **Phase 2 → Phase 3 Advisor 호출 — 게이트 판정 + 핸드오프 라우팅**
>
> **컨텍스트:**
> ```
> phase: 2→3 handoff
> slug: {slug}
> pipeline_type: {PIPELINE_TYPE}
> prd: .crew/artifacts/prd/{slug}-prd.md
> design: .crew/artifacts/design/{slug}-design.md
> changed_files: [{구현에서 수정/생성된 파일 목록}]
> board: .crew/board.md
> ```
>
> **요청:** Phase 2 완료 조건 검증 결과(GO/NO-GO/CONDITIONAL-GO) — 빌드 성공, 타입 체크, 린트 — 와, 메인이 spawn할 cross-department-coordinator의 위임 메시지를 Advisor Response로 반환하세요. 직접 spawn 금지.

반환 후 agent_end emit + 파싱 + CHAIN_VIOLATION 체크:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_end "{slug}" "pipeline-orchestrator-handoff2-$(date -u +%Y%m%d)" "pipeline-orchestrator" "success" "$(( $([ -n "$_EMIT" ] && bash "$_EMIT" now_ms || echo 0) - {agent_start_ms} ))" "구현→검증 Advisor 응답 수신"
```

### 핸드오프-b. 메인이 cross-department-coordinator 직접 spawn

Advisor 판정이 GO 또는 CONDITIONAL-GO인 경우에 진행. NO-GO이면 미충족 항목을 사용자에게 보고하고 해결 후 재시도.

Bash로 agent_start emit:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_start "{slug}" "cross-department-coordinator-handoff2-$(date -u +%Y%m%d)" "cross-department-coordinator" "claude-opus-4-8" "구현→검증 핸드오프 조율"
```

Task tool, subagent_type: **"bams-plugin:cross-department-coordinator"** — 메인이 직접 호출:

> **Phase 2→3 핸드오프 조율**
>
> - 개발부장의 산출물이 QA부장에게 올바르게 전달되는지 확인
> - 검증 대상 파일 목록, 테스트 범위 확인
>
> **기대 산출물**: 핸드오프 체크리스트 결과

반환 후 agent_end emit:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_end "{slug}" "cross-department-coordinator-handoff2-$(date -u +%Y%m%d)" "cross-department-coordinator" "success" "$(( $([ -n "$_EMIT" ] && bash "$_EMIT" now_ms || echo 0) - {agent_start_ms} ))" "구현→검증 핸드오프 완료"
```

**Phase 게이트 결과가 NO-GO이면**: 미충족 항목을 사용자에게 보고하고, 해결 후 재시도합니다.

AskUserQuestion — "구현 완료. 검증 단계로 진행?"
- **검증 진행 (Recommended)**
- **구현까지만** — `status: paused_at_step_{STEP_N}` 기록 후 종료.

Step {STEP_N} 완료 시, Bash로 다음을 실행합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" {STEP_N} "done" "$(( $([ -n "$_EMIT" ] && bash "$_EMIT" now_ms || echo 0) - {step_start_ms} ))"
```

---

## Phase 2 게이트 조건

{GATE_CHECKLIST_ITEMS}

Phase 2 완료 → {NEXT_ROUTING} (stub Delta로 치환 — 라우팅 방식은 stub이 소유)
