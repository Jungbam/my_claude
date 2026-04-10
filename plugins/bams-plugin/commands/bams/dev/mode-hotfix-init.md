# Dev: mode-hotfix-init — dev-hotfix 모드 초기화

> `/bams:dev`에서 멀티이슈 hotfix를 처리할 때 사용합니다.
> Phase 0(초기화) 완료 후, 이 파일을 Read하여 이슈 분해 및 배치 생성을 수행합니다.
> Phase 1(기획)을 생략하고 Phase 2(구현)로 직행합니다.

> **실행 주체**: 이 파일은 dev.md 엔트리포인트(커맨드 레벨)에서 Read하여 직접 실행합니다.
> Step 0.8~0.95의 이슈 파싱, 배치 분할은 Grep/Glob/Read(읽기 전용)로 수행하며,
> 위임 원칙의 Edit/Write 금지 대상이 아닙니다.
> 파일 쓰기가 필요한 경우 Bash(아티팩트) 또는 부서장 위임(소스 코드)으로 처리합니다.

## 입력 컨텍스트

- slug: {dev 파이프라인 slug}
- pipeline_type: dev-hotfix
- issue_list: $ARGUMENTS (멀티이슈 목록)
- config: `.crew/config.md`

---

## Step 0.8: 이슈 파싱 및 태스크 분해

Bash로 step_start를 emit합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_start "{slug}" 0.8 "이슈 파싱 및 태스크 분해" "Phase 0: dev-hotfix 초기화"
```

$ARGUMENTS에서 이슈 목록을 파싱합니다.

**파싱 규칙:**
- 줄바꿈 구분: 각 줄 = 1 이슈
- 번호 목록: `1.`, `2.`, `-` 접두사 제거 후 이슈 본문 추출
- retro Problem 참조: `P-01`, `P-02` 등 → retro 산출물에서 상세 내용 로드
- 심각도 태그: `[Critical]`, `[Major]`, `[Medium]`, `[Low]` 인식

**태스크 분해 결과:**

각 이슈를 board.md 태스크로 변환합니다:

```
## Backlog

### TASK-{N}: {이슈 제목}
- **Feature**: {slug}
- **Severity**: {Critical|Major|Medium|Low}
- **Assignee**: {자동 라우팅 — 파일 패턴 기반}
- **Deps**: []
- **Files**: [{영향 파일 목록 — Grep/Glob으로 사전 분석}]
```

**태스크 등록:**
- **DB 존재 시 (권장)**: Bash로 bun 스크립트 실행 (커맨드 레벨 허용)
- **DB 미사용 시**: project-governance 부서장에게 board.md 수정 위임

**DB 등록 (DB 존재 시):**
```bash
if [ -f "$HOME/.claude/plugins/marketplaces/my-claude/bams.db" ]; then
  bun -e "
    import { TaskDB } from './plugins/bams-plugin/tools/bams-db/index.ts';
    const db = new TaskDB();
    // 각 이슈에 대해:
    // db.createTask({ pipeline_slug: '{slug}', title: '{이슈 제목}', status: 'pending', assignee_agent: '{에이전트}', phase: 2 });
    db.close();
  "
fi
```

---

## Step 0.9: 배치 분할 (의존성 DAG 기반)

Step 0.8 완료 후 step_end emit:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" 0.8 "done" {duration_ms}
```

Bash로 step_start를 emit합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_start "{slug}" 0.9 "배치 분할" "Phase 0: dev-hotfix 초기화"
```

태스크 목록을 배치로 분할합니다.

**배치 분할 알고리즘:**

1. **변경 대상 파일 사전 분석**: 각 이슈의 영향 파일을 Grep/Glob으로 추정
2. **파일 겹침 그래프 생성**:
   - 겹침 없는 이슈 → 같은 배치에 병렬 배치 가능
   - 겹침 있는 이슈 → 순차 배치 (의존성 edge)
3. **심각도 정렬**: Critical → Major → Medium → Low 순으로 앞 배치 우선 배치
4. **배치 크기 제한**: 배치당 최대 4건 (hotfix 특성상 각 수정이 검증 필요)
5. **부서 분산**: 가능하면 같은 부서의 이슈를 같은 배치에 (부서장 1명이 처리)

**배치 생성 결과:**

```
Batch 1: [TASK-1(Critical), TASK-2(Major), TASK-3(Major)]  → 파일 겹침 없음, 병렬
Batch 2: [TASK-4(Major), TASK-5(Medium)]  → TASK-4가 TASK-1과 같은 파일, 순차
...
```

**사용자 확인:**

AskUserQuestion — "다음과 같이 {N}개 배치로 분할합니다. 진행할까요?"
Header: "배치 분할 확인"
Options:
- **이대로 진행** — "배치 순서대로 실행"
- **수정 필요** — "배치 구성을 변경하고 싶음"

---

## Step 0.95: 배치 실행 계획 확정

Step 0.9 완료 후 step_end emit:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" 0.9 "done" {duration_ms}
```

Bash로 step_start를 emit합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_start "{slug}" 0.95 "배치 실행 계획 확정" "Phase 0: dev-hotfix 초기화"
```

**배치 계획 기록:**
확정된 배치 목록을 `.crew/artifacts/pipeline/{slug}-batch-plan.md`에 기록합니다.
이 파일은 파이프라인 아티팩트(소스 코드 아님)이므로 커맨드 레벨에서 Bash `cat <<EOF >` 패턴으로 직접 생성합니다.

```markdown
# 배치 실행 계획

- pipeline_slug: {slug}
- pipeline_type: dev-hotfix
- total_issues: {N}
- total_batches: {M}
- created_at: {ISO timestamp}

## Batch 1
- tasks: [TASK-1, TASK-2, TASK-3]
- parallel: true
- assignees: [frontend-engineering, backend-engineering]
- verification: build + typecheck

## Batch 2
- tasks: [TASK-4, TASK-5]
- depends_on: [Batch 1]
- parallel: true
- assignees: [backend-engineering]
- verification: build + typecheck

## 전체 완료 후
- verification: full test suite (Phase 2.5)
- quality_gate: Phase 3 + Phase 3.5
```

---

## Phase 1.5 → Phase 2 전환

배치 계획 확정 후, 순서대로 진행합니다:

1. **Phase 1.5 (Git 브랜치)**: `plugins/bams-plugin/commands/bams/dev/phase-1-5-git.md`를 Read하여 Git 브랜치를 생성합니다.
   - 브랜치명: `hotfix/{slug}` 또는 dev 표준 브랜치 규칙 따르기
2. **Phase 2 (구현)**: `plugins/bams-plugin/commands/bams/dev/phase-2-implementation.md`를 Read하여 배치별 구현을 시작합니다.
   - 배치 계획의 각 Batch를 순서대로 실행
   - Batch 내 태스크는 부서장별 병렬 spawn 가능
   - 각 Batch 완료 후 중간 검증 (`bun run build && bun run typecheck`)

**Phase 1(기획) 생략 이유**: dev-hotfix 모드에서는 각 이슈가 이미 retro/bug report로 정의되어 있으므로 PRD 작성이 불필요합니다. 이슈 파싱 + 배치 분할이 기획을 대체합니다.

---

Step 0.95 완료 후 step_end emit:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" 0.95 "done" {duration_ms}
```

## 게이트 조건

- [ ] 이슈 목록 파싱 완료 (최소 1건)
- [ ] 각 이슈에 영향 파일 목록 추정 완료
- [ ] 배치 분할 확정 (사용자 확인)
- [ ] batch-plan.md 기록 완료
- [ ] board.md 또는 DB에 태스크 등록 완료

모든 조건 충족 → Phase 2 진행
