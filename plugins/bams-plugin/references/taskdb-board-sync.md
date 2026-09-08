# TaskDB ↔ board.md 동기화 프로토콜

> 목적: 파이프라인이 `.crew/board.md`에 기록한 **정식 태스크(`TASK-NNN`)** 를
> TaskDB(`bams.db`)에도 반드시 반영하여 board.md ↔ DB 드리프트를 방지한다.
> 이 문서는 파이프라인 종료(`pipeline_end` emit) **직전**에 실행하는 board → DB upsert 절차의 정본이다.

---

## 1. 배경: 왜 드리프트가 발생하는가

파이프라인은 태스크를 board.md에 `### TASK-NNN: 제목` 형식으로 기록한다. 그러나 이 태스크가
TaskDB에 자동으로 등록되게 하는 **정상 동작하는 훅이 존재하지 않는다.** 그 결과 board.md에는
태스크가 있으나 DB에는 해당 `TASK-NNN` 행이 없는 드리프트가 반복 발생한다.

실측 사례: 파이프라인 `plan_검색필터폼제출재조회전환`의 `TASK-942~949` 8건이 board.md에는
정상 기록됐으나 DB에는 `title LIKE 'TASK-94%'` 행이 0건. (DB의 해당 파이프라인 태스크 37건은
board.md의 정식 번호 태스크가 아니라 에이전트 활동 요약 성격의 별도 행이었다.)

### 근본 원인 (3개 결함)

1. **plan.md은 board→DB 등록을 아예 하지 않는다.**
   `plan.md` Phase 4는 태스크를 board.md `## Backlog`에 기록할 뿐 `db.createTask()`를 호출하지 않는다.
   Phase 7의 "DB 연동"은 `sync-board.ts --write`뿐인데, 이는 **DB → board.md** (반대 방향)이다.

2. **`sync-board.ts`는 방향이 반대이며, 현재 코드가 깨져 있다.**
   - 방향: DB의 태스크를 읽어 board.md를 덮어쓴다(`--write`). board → DB 등록 용도가 **아니다.**
   - 파괴 위험: DB에 정식 태스크가 없거나 부분만 있으면 `--write` 시 board.md의 풍부한
     포맷(Role/Priority/Depends/Files/Acceptance)이 유실될 수 있다. (현재는 태스크 0건 시 조기 return이라 무해하나, 등록이 시작되면 위험.)
   - 버그: `sync-board.ts:142`가 `db.getTasksByPipeline(pipelineSlug)`를 호출하는데
     **`getTasksByPipeline` 메서드는 `index.ts`에 존재하지 않는다**(실제 API는 `getTasksByPipelineId(pipelineId)`).
     또한 slug를 pipeline_id 자리에 넘긴다. 즉 실행 시 예외로 `exit(1)` → 조용히 실패한다.

3. **공유 템플릿의 `createTask` 인자가 실제 API와 불일치한다.**
   `_shared_common.md` / `_shared/phase-*.md`의 템플릿은
   `db.createTask({ pipeline_slug: '{slug}', ..., status: 'in_progress' })`를 쓰는데,
   실제 `createTask` 시그니처는 `pipeline_id`를 받고 **`status` 인자가 없다**(아래 §2 참조).
   `pipeline_slug`는 무시되어 `pipeline_id`가 NULL로 삽입되고, `status`도 무시된다.

---

## 2. 실제 TaskDB API (검증됨, `tools/bams-db/index.ts` 기준)

```typescript
// slug → 파이프라인 행(id 포함) 조회. 없으면 null.
db.getPipelineBySlug(slug: string): PipelineRow | null   // PipelineRow.id 가 pipeline_id

// 파이프라인의 모든 태스크 조회 (pipeline_id 기준!)
db.getTasksByPipelineId(pipelineId: string): Task[]

// 태스크 생성 — pipeline_id 필수, status 인자 없음(생성 시 기본 상태), UUID 반환
db.createTask(input: {
  pipeline_id: string;      // ★ slug 아님. getPipelineBySlug(slug).id 를 넘길 것
  title: string;            // 'TASK-NNN: 제목' 형식으로 저장 (정식 ID를 프리픽스로)
  description?: string;
  phase?: number;
  step?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  size?: 'xs' | 's' | 'm' | 'l' | 'xl';
  assignee_agent?: string;
  deps?: string[];
  tags?: string[];
}): string;                 // 반환: 생성된 태스크 UUID (board.md의 TASK-NNN 아님)

// 상태 전환 — 첫 인자는 태스크 UUID(id). board.md의 'TASK-NNN'이 아님에 주의.
db.updateTaskStatus(taskId: string, toStatus: TaskStatus, agentSlug: string): void

db.close(): void
```

- **정식 ID(`TASK-NNN`) ↔ UUID 매핑**: DB는 `TASK-NNN`을 별도 컬럼으로 갖지 않는다.
  관례상 `title`을 `'TASK-NNN: 제목'`으로 저장하고, 조회 시 `title.split(':')[0].trim()`으로 정식 ID를 추출한다.
- **멱등성**: `createTask`는 `ON CONFLICT`가 없는 순수 `INSERT`다. 중복 실행 시 행이 중복 생성된다.
  → 반드시 아래 절차처럼 기존 `TASK-NNN` 집합과 대조해 **없을 때만** 삽입할 것.
- **DB 경로**: 기본값은 `$BAMS_DB` 또는 `~/.claude/plugins/marketplaces/my-claude/bams.db`
  (`getDefaultDbPath()`). 무인자 `new TaskDB()`가 이 경로를 사용한다.

---

## 3. board → DB upsert 절차 (pipeline_end 직전에 실행)

DB가 존재할 때만 실행하는 조건부 훅이다. board.md에서 이번 파이프라인이 신규 등록/상태변경한
`TASK-NNN` 목록을 대화 컨텍스트에서 확보한 뒤, 아래 스니펫의 주석 자리에 리터럴로 채워 실행한다.

```bash
if [ -f "$HOME/.claude/plugins/marketplaces/my-claude/bams.db" ]; then
  bun -e "
    import { TaskDB } from './plugins/bams-plugin/tools/bams-db/index.ts';
    const db = new TaskDB();
    const slug = '{slug}';
    const pl = db.getPipelineBySlug(slug);
    if (!pl) { console.error('[taskdb-sync] pipeline 없음:', slug); db.close(); process.exit(0); }

    // 기존 태스크의 정식 ID 집합 (title 프리픽스 기준) — 멱등성 가드
    const rows = db.getTasksByPipelineId(pl.id);
    const byHuman = new Map(rows.map(t => [String(t.title).split(':')[0].trim(), t]));

    // ── board.md 신규 태스크: 없을 때만 INSERT (아래를 각 태스크마다 반복) ──
    // const hid = 'TASK-942';
    // if (!byHuman.has(hid)) {
    //   db.createTask({ pipeline_id: pl.id, title: hid + ': 태스크 제목',
    //     phase: 4, priority: 'high', assignee_agent: 'frontend-engineering', tags: ['plan'] });
    // }

    // ── board.md 상태변경 태스크: 기존 행 UUID로 전환 (in_review/done 등) ──
    // const cur = byHuman.get('TASK-942');
    // if (cur && cur.status !== 'done') db.updateTaskStatus(cur.id, 'done', 'pipeline-orchestrator');

    console.log('[taskdb-sync] 완료:', slug, '기존', rows.length, '건 대조');
    db.close();
  "
fi
```

- board.md 필드 → createTask 매핑: `Priority P0/P1/P2 → high/medium/low`, `Role → assignee_agent`,
  `Depends on → deps`, `Feature/기타 → tags`.
- DB가 없는 프로젝트에서는 조건문이 거짓이라 실행되지 않는다(안전).

---

## 4. sync-board.ts 사용 지침 (경고)

- `sync-board.ts`는 **DB → board.md** 스냅샷 생성용이며 board → DB 등록에 쓰면 안 된다.
- 현재 `getTasksByPipeline` 미존재로 **실행 시 예외**가 난다. 수정 전까지 `--write` 호출을 신뢰하지 말 것.
- 커맨드 문서의 `pipeline_end` 직전 "DB 연동" 단계에서 `sync-board.ts --write`를 board→DB 동기화로
  기대하고 있었다면, 이는 오해다. 실제 board→DB 등록은 위 §3 절차로 수행한다.

---

## 5. 후속 코드 수정 과제 (별도 dev 파이프라인 필요 — 본 문서는 절차 명문화까지)

아래는 문서가 아니라 **코드** 수정이므로 별도 `/bams:dev` 또는 `/bams:hotfix`로 처리한다.

1. `sync-board.ts:142` `getTasksByPipeline(pipelineSlug)` → `getTasksByPipelineId(getPipelineBySlug(slug).id)` 교정.
2. `_shared_common.md` 등 공유 템플릿의 `createTask({ pipeline_slug, status })` → `pipeline_id`(slug 해석 후) 로 교정, `status` 인자 제거.
3. (선택) `createTask`에 `TASK-NNN` 정식 ID 컬럼 도입 또는 `upsertTask(byHumanId)` 헬퍼 추가로 멱등성 내장화.
