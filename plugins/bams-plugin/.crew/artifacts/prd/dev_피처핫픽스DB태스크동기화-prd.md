# PRD: feature/hotfix 파이프라인 DB tasks 동기화

> pipeline_slug: dev_피처핫픽스DB태스크동기화
> created: 2026-04-06
> author: product-strategy
> pipeline_type: dev

---

## 1. 문제 정의

### AS-IS (현재 상태)

| 파이프라인 | 파일 | board.md 업데이트 | DB 동기화 |
|-----------|------|------------------|----------|
| /bams:dev | phase-1-planning.md | Backlog 추가 | createTask() — 완료 |
| /bams:dev | phase-2-implementation.md | In Review 이동 | updateTaskStatus('in_review') — 완료 |
| /bams:dev | phase-4-finalization.md | Done 이동 | updateTaskStatus('done') — 완료 |
| /bams:feature | phase-1-planning.md | Backlog 추가 | createTask() — 완료 |
| /bams:feature | phase-2-implementation.md | In Review 이동 | **DB 동기화 없음** |
| /bams:feature | phase-5-finalization.md | Done 이동 | **DB 동기화 없음** |
| /bams:hotfix | step-1-diagnose.md | (추가 없음) | **createTask 없음** |
| /bams:hotfix | step-finalization.md | Done 이동 | sync-board.ts 방식 (dev 패턴과 불일치) |

### 문제점

1. `/bams:feature` 파이프라인에서 태스크가 In Review / Done으로 전환될 때 bams.db에 상태가 반영되지 않는다.
2. `/bams:hotfix` 파이프라인에서 태스크 시작 시 bams.db에 태스크가 생성되지 않는다.
3. `/bams:hotfix` 완료 시 `sync-board.ts` 방식을 사용하는데, 이는 dev 패턴(`updateTaskStatus` 직접 호출)과 불일치한다.

결과적으로 bams-viz 대시보드에서 feature/hotfix 파이프라인의 태스크 진행 상태가 표시되지 않는다.

### TO-BE (목표 상태)

feature/hotfix 파이프라인도 dev 파이프라인과 동일하게:
- 태스크 생성 시 `db.createTask()` 호출
- In Review 전환 시 `db.updateTaskStatus(id, 'in_review', 'pipeline-orchestrator')` 호출
- Done 전환 시 `db.updateTaskStatus(id, 'done', 'pipeline-orchestrator')` 호출

---

## 2. 목표

1. feature/hotfix 파이프라인 태스크 상태가 bams.db에 실시간으로 반영된다.
2. bams-viz 대시보드에서 모든 파이프라인 유형(dev/feature/hotfix)의 태스크 진행 상태가 동일하게 시각화된다.
3. DB 동기화 패턴이 dev/feature/hotfix 전체에서 일관성을 갖는다.

---

## 3. 사용자 스토리

### /bams:feature 사용자

- **US-1**: /bams:feature 파이프라인을 실행하면, 구현 완료 후 태스크가 In Review로 전환될 때 bams.db에도 `in_review` 상태가 기록되어야 한다.
- **US-2**: /bams:feature 파이프라인이 완료되면, 태스크가 Done으로 전환될 때 bams.db에도 `done` 상태가 기록되어야 한다.

### /bams:hotfix 사용자

- **US-3**: /bams:hotfix 파이프라인을 시작하면, 핫픽스 태스크가 bams.db에 `in_review` 상태로 생성되어야 한다 (hotfix는 처음부터 진단/수정을 시작하므로 in_review 상태로 생성).
- **US-4**: /bams:hotfix 파이프라인이 완료되면, 태스크가 Done으로 전환될 때 bams.db에도 `done` 상태가 기록되어야 한다. 이때 `updateTaskStatus` 직접 호출 방식으로 통일한다.

---

## 4. 인수 기준 (Acceptance Criteria)

### AC-1: feature/phase-2-implementation.md — In Review DB 동기화

**파일**: `plugins/bams-plugin/commands/bams/feature/phase-2-implementation.md`

- [ ] board.md에서 태스크를 `## In Review`로 이동하는 지점 바로 다음에 DB 업데이트 코드가 삽입된다.
- [ ] `.crew/db/bams.db`가 존재하는 경우에만 실행 (조건부 실행).
- [ ] 사용 패턴: `db.updateTaskStatus('{task_id}', 'in_review', 'pipeline-orchestrator')`
- [ ] dev 패턴(`dev/phase-2-implementation.md` lines 95-106)과 동일한 코드 구조를 사용한다.

```bash
# 삽입될 코드 (dev 패턴 동일):
if [ -f ".crew/db/bams.db" ]; then
  bun -e "
    import { TaskDB } from './plugins/bams-plugin/tools/bams-db/index.ts';
    const db = new TaskDB('.crew/db/bams.db');
    // 배치의 각 태스크 ID에 대해 호출:
    // db.updateTaskStatus('{task_id}', 'in_review', 'pipeline-orchestrator');
    db.close();
  "
fi
```

### AC-2: feature/phase-5-finalization.md — Done DB 동기화

**파일**: `plugins/bams-plugin/commands/bams/feature/phase-5-finalization.md`

- [ ] board.md에서 태스크를 `## Done`으로 이동하는 지점 바로 다음에 DB 업데이트 코드가 삽입된다.
- [ ] `.crew/db/bams.db`가 존재하는 경우에만 실행 (조건부 실행).
- [ ] 사용 패턴: `db.updateTaskStatus('{task_id}', 'done', 'pipeline-orchestrator')`
- [ ] dev 패턴(`dev/phase-4-finalization.md` lines 61-71)과 동일한 코드 구조를 사용한다.

```bash
# 삽입될 코드 (dev 패턴 동일):
if [ -f ".crew/db/bams.db" ]; then
  bun -e "
    import { TaskDB } from './plugins/bams-plugin/tools/bams-db/index.ts';
    const db = new TaskDB('.crew/db/bams.db');
    // 완료된 각 태스크 ID에 대해 호출:
    // db.updateTaskStatus('{task_id}', 'done', 'pipeline-orchestrator');
    db.close();
  "
fi
```

### AC-3: hotfix/step-1-diagnose.md — createTask DB 등록

**파일**: `plugins/bams-plugin/commands/bams/hotfix/step-1-diagnose.md`

- [ ] Step 1 시작 시 (버그 진단 전) 핫픽스 태스크를 bams.db에 등록하는 코드가 추가된다.
- [ ] `.crew/db/bams.db`가 존재하는 경우에만 실행 (조건부 실행).
- [ ] hotfix 특성상 태스크 시작 시 status를 `in_review`로 설정한다 (backlog 단계 없음).
- [ ] 사용 패턴:

```bash
if [ -f ".crew/db/bams.db" ]; then
  bun -e "
    import { TaskDB } from './plugins/bams-plugin/tools/bams-db/index.ts';
    const db = new TaskDB('.crew/db/bams.db');
    // db.createTask({ pipeline_slug: '{slug}', title: '{hotfix_title}', status: 'in_review', assignee_agent: 'pipeline-orchestrator', phase: 1, priority: 'high', tags: ['hotfix'] });
    db.close();
  "
fi
```

### AC-4: hotfix/step-finalization.md — Done DB 동기화 (패턴 통일)

**파일**: `plugins/bams-plugin/commands/bams/hotfix/step-finalization.md`

- [ ] 기존 `sync-board.ts` 방식을 `updateTaskStatus` 직접 호출 방식으로 교체한다.
- [ ] `.crew/db/bams.db`가 존재하는 경우에만 실행 (조건부 실행).
- [ ] 사용 패턴: `db.updateTaskStatus('{task_id}', 'done', 'pipeline-orchestrator')`
- [ ] dev/feature 패턴과 동일한 코드 구조로 통일한다.

> **주의**: 기존 `bun run plugins/bams-plugin/tools/bams-db/sync-board.ts {slug} --write` 라인을 제거하고 직접 호출 방식으로 대체한다.

### AC-5: feature/phase-1-planning.md — 이미 완료 (변경 불필요)

**파일**: `plugins/bams-plugin/commands/bams/feature/phase-1-planning.md`

- [x] board.md Backlog 추가 직후 `db.createTask()` 호출 코드가 이미 존재한다 (lines 155-166).
- [x] 추가 수정 불필요. 현재 상태 유지.

---

## 5. 스코프 경계

### IN SCOPE (이번 작업 범위)

- `feature/phase-2-implementation.md`: DB updateTaskStatus('in_review') 추가
- `feature/phase-5-finalization.md`: DB updateTaskStatus('done') 추가
- `hotfix/step-1-diagnose.md`: DB createTask({ status: 'in_review' }) 추가
- `hotfix/step-finalization.md`: sync-board.ts → updateTaskStatus('done') 교체

### OUT OF SCOPE (이번 작업 외)

- DB 스키마 변경 없음 (`bams.db` 테이블 구조 그대로 유지)
- `TaskDB` 클래스 수정 없음 (`plugins/bams-plugin/tools/bams-db/index.ts` 변경 없음)
- `sync-board.ts` 삭제 없음 (다른 곳에서 참조될 수 있으므로 파일 유지, 호출만 제거)
- dev 파이프라인 파일 수정 없음 (이미 완료)
- feature/phase-1-planning.md 수정 없음 (이미 완료)

---

## 6. 기술 참조

### TaskDB API

```typescript
// 태스크 생성
db.createTask({
  pipeline_slug: string,   // 파이프라인 slug
  title: string,           // 태스크 제목
  status?: string,         // 'backlog' | 'in_progress' | 'in_review' | 'done' (기본: 'backlog')
  assignee_agent?: string, // 담당 에이전트
  phase?: number,          // Phase 번호
  priority?: string,       // 'low' | 'medium' | 'high' | 'critical'
  size?: string,           // 'xs' | 's' | 'm' | 'l' | 'xl'
  tags?: string[],         // 태그 배열
  deps?: number[],         // 의존 태스크 ID 배열
}): number                 // 반환: 생성된 task_id

// 상태 업데이트
db.updateTaskStatus(
  task_id: number | string,  // 태스크 ID
  status: string,            // 새 상태
  agent?: string             // 변경한 에이전트
): void

// DB 종료 (반드시 호출)
db.close(): void
```

### 적용 위치 가이드

| 파일 | 삽입 위치 | 삽입 내용 |
|------|---------|---------|
| feature/phase-2-implementation.md | board.md In Review 이동 직후 (현재 line 99 이후) | updateTaskStatus('in_review') 블록 |
| feature/phase-5-finalization.md | board.md Done 이동 직후 | updateTaskStatus('done') 블록 |
| hotfix/step-1-diagnose.md | Step 1 시작 후 (pipeline-orchestrator 위임 전) | createTask({ status: 'in_review' }) 블록 |
| hotfix/step-finalization.md | TaskDB 완료 처리 섹션 (현재 sync-board.ts 호출 위치) | sync-board.ts 교체 → updateTaskStatus('done') 블록 |

---

## 7. 완료 기준 (Definition of Done)

- [ ] AC-1 ~ AC-4 모두 충족
- [ ] 4개 수정 파일에 대해 코드 리뷰 완료
- [ ] `/bams:feature` 실행 시 태스크 상태가 bams.db에 올바르게 기록됨을 확인
- [ ] `/bams:hotfix` 실행 시 태스크 상태가 bams.db에 올바르게 기록됨을 확인
- [ ] bams-viz 대시보드에서 feature/hotfix 태스크 상태가 정상 표시됨을 확인
- [ ] pipeline_end 이벤트 기록 완료

---

## 8. 미결 질문

없음 — 구현 패턴이 dev 파이프라인에서 이미 검증되었으므로 추가 확인 없이 진행 가능.

---

## 9. 의존성

- `plugins/bams-plugin/tools/bams-db/index.ts` — TaskDB 클래스 (변경 없음, 현재 API 그대로 사용)
- `.crew/db/bams.db` — 런타임 DB 파일 (존재하지 않는 프로젝트에서는 코드가 실행되지 않음, 안전)
