/**
 * bams-db/schema.ts
 *
 * SQLite 태스크 관리 스키마 (Bun 네이티브 sqlite API)
 * Paperclip의 issues 테이블(PostgreSQL + Drizzle ORM) 패턴을 SQLite + Bun 네이티브로 포팅
 *
 * 참조: reference/paperclip/packages/db/src/schema/issues.ts
 */

/**
 * tasks 테이블 DDL
 *
 * Paperclip issues 테이블의 핵심 패턴 적용:
 * - execution_locked_at → checkout_locked_at (atomic checkout용)
 * - checkout_run_id (잠금 소유자 식별)
 * - status: backlog|in_progress|done|blocked|cancelled
 */
export const TASKS_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS tasks (
    id                  TEXT PRIMARY KEY,           -- UUID (crypto.randomUUID())
    pipeline_id         TEXT NOT NULL REFERENCES pipelines(id),  -- 파이프라인 FK
    phase               INTEGER,                    -- Phase 번호 (1, 2, 3, 4, 5)
    step                TEXT,                       -- Step 식별자 (e.g. "design", "implement")
    title               TEXT NOT NULL,              -- 태스크 제목
    description         TEXT,                       -- 상세 설명 (Markdown)
    status              TEXT NOT NULL DEFAULT 'backlog',  -- backlog|in_progress|in_review|done|blocked|cancelled
    priority            TEXT NOT NULL DEFAULT 'medium',   -- high|medium|low
    size                TEXT,                       -- XS|S|M|L|XL
    assignee_agent      TEXT,                       -- 담당 에이전트 슬러그
    checkout_run_id     TEXT,                       -- 체크아웃한 실행 ID (atomic lock 소유자)
    checkout_locked_at  TEXT,                       -- ISO-8601 타임스탬프 (잠금 시각)
    deps                TEXT,                       -- JSON 배열: ["REF-A1", "REF-A2"]
    tags                TEXT,                       -- JSON 배열: ["backend", "infra"]
    model               TEXT,                       -- 사용 모델 (e.g. "claude-sonnet-4")
    label               TEXT,                       -- 태스크 라벨
    duration_ms         INTEGER,                    -- 소요 시간 (ms)
    summary             TEXT,                       -- 태스크 요약
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
    started_at          TEXT,
    completed_at        TEXT
  );
`;

/**
 * tasks 인덱스 DDL
 * Paperclip의 issues 테이블 인덱스 패턴 참조
 */
export const TASKS_INDEXES_DDL = `
  CREATE INDEX IF NOT EXISTS tasks_pipeline_id_status_idx
    ON tasks(pipeline_id, status);

  CREATE INDEX IF NOT EXISTS tasks_assignee_status_idx
    ON tasks(assignee_agent, status);

  CREATE INDEX IF NOT EXISTS tasks_phase_idx
    ON tasks(pipeline_id, phase);
`;

/**
 * task_events 테이블 DDL
 *
 * 태스크 상태 전환 이력을 영구 보존한다.
 * Paperclip의 이벤트 소싱 패턴 적용.
 */
export const TASK_EVENTS_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS task_events (
    id          TEXT PRIMARY KEY,
    task_id     TEXT NOT NULL REFERENCES tasks(id),
    event_type  TEXT NOT NULL,    -- status_change|checkout|assign|comment
    from_status TEXT,             -- 이전 상태
    to_status   TEXT,             -- 다음 상태
    agent_slug  TEXT,             -- 변경을 수행한 에이전트
    run_id      TEXT,             -- 파이프라인 실행 ID
    payload     TEXT,             -- JSON: 추가 데이터
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS task_events_task_idx
    ON task_events(task_id);

  CREATE INDEX IF NOT EXISTS task_events_created_idx
    ON task_events(created_at);
`;

/**
 * 유효한 status 값
 */
export const TASK_STATUS = {
  BACKLOG: "backlog",
  IN_PROGRESS: "in_progress",
  IN_REVIEW: "in_review",
  DONE: "done",
  BLOCKED: "blocked",
  CANCELLED: "cancelled",
} as const;

export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];

/**
 * 유효한 priority 값
 */
export const TASK_PRIORITY = {
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
} as const;

export type TaskPriority = (typeof TASK_PRIORITY)[keyof typeof TASK_PRIORITY];

/**
 * 유효한 size 값
 */
export const TASK_SIZE = {
  XS: "XS",
  S: "S",
  M: "M",
  L: "L",
  XL: "XL",
} as const;

export type TaskSize = (typeof TASK_SIZE)[keyof typeof TASK_SIZE];

/**
 * Task 레코드 타입
 */
export interface Task {
  id: string;
  pipeline_id: string;
  phase: number | null;
  step: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  size: TaskSize | null;
  assignee_agent: string | null;
  checkout_run_id: string | null;
  checkout_locked_at: string | null;
  deps: string | null;          // JSON string: string[]
  tags: string | null;          // JSON string: string[]
  model: string | null;
  label: string | null;
  duration_ms: number | null;
  summary: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

/**
 * TaskEvent 레코드 타입
 */
export interface TaskEvent {
  id: string;
  task_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  agent_slug: string | null;
  run_id: string | null;
  payload: string | null;       // JSON string
  created_at: string;
}

// ─────────────────────────────────────────────────────────────
// C2: 실시간 실행 로그 스키마
// ─────────────────────────────────────────────────────────────

/**
 * run_logs 테이블 DDL
 * 에이전트 실행 이벤트를 DB에 영구 보존 (SSE 스트리밍 + 재생용)
 * 보존 정책: 최근 30일 또는 1,000건 (초과 시 자동 삭제)
 */
export const RUN_LOGS_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS run_logs (
    id              TEXT PRIMARY KEY,
    pipeline_id     TEXT NOT NULL REFERENCES pipelines(id),
    run_id          TEXT,
    agent_slug      TEXT NOT NULL,
    event_type      TEXT NOT NULL,   -- agent_start | tool_call | tool_result | text_chunk | agent_end | error
    payload         TEXT,            -- JSON 직렬화된 이벤트 데이터
    created_at      DATETIME NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS run_logs_pipeline_id_idx
    ON run_logs(pipeline_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS run_logs_agent_idx
    ON run_logs(agent_slug, created_at DESC);

  -- 자동 정리 트리거: 30일 초과 또는 파이프라인당 1,000건 초과 시 삭제
  CREATE TRIGGER IF NOT EXISTS run_logs_cleanup
    AFTER INSERT ON run_logs
    BEGIN
      DELETE FROM run_logs
      WHERE created_at < datetime('now', '-30 days');
    END;
`;

export interface RunLog {
  id: string;
  pipeline_id: string;
  run_id: string | null;
  agent_slug: string;
  event_type: string;
  payload: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────
// HR Reports 스키마
// retro 파이프라인 완료 시 자동 저장되는 HR 보고서 테이블
// ─────────────────────────────────────────────────────────────

/**
 * hr_reports 테이블 DDL
 * retro 완료 시 convertRetroToHR()가 생성한 HRReport를 DB에 영구 저장.
 * JSON 파일(~/.bams/artifacts/hr/)과 병렬 저장하며, DB가 primary source로 사용됨.
 */
export const HR_REPORTS_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS hr_reports (
    id              TEXT PRIMARY KEY,
    retro_slug      TEXT NOT NULL UNIQUE,
    report_date     TEXT NOT NULL,
    source          TEXT NOT NULL DEFAULT 'retro',
    period_start    TEXT,
    period_end      TEXT,
    data            TEXT NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT (datetime('now')),
    updated_at      DATETIME NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS hr_reports_date_idx ON hr_reports(report_date DESC);
`;

/**
 * HrReport DB 레코드 타입
 * data 컬럼에는 전체 HRReport JSON이 직렬화되어 저장됨
 */
export interface HrReportRow {
  id: string;
  retro_slug: string;
  report_date: string;
  source: string;
  period_start: string | null;
  period_end: string | null;
  data: string;           // JSON serialized HRReport
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────
// Pipelines 스키마
// 파이프라인 실행 인스턴스 — Work Unit에 연결되는 실행 단위
// ─────────────────────────────────────────────────────────────

/**
 * pipelines 테이블 DDL
 * 파이프라인 실행 인스턴스. work_units와 N:1 관계.
 * tasks, run_logs가 pipeline_id로 FK 참조한다.
 */
export const PIPELINES_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS pipelines (
    id              TEXT PRIMARY KEY,
    slug            TEXT NOT NULL UNIQUE,
    work_unit_id    TEXT REFERENCES work_units(id),
    type            TEXT NOT NULL,
    command         TEXT,
    status          TEXT NOT NULL DEFAULT 'running',
    arguments       TEXT,
    started_at      TEXT,
    ended_at        TEXT,
    duration_ms     INTEGER,
    total_steps     INTEGER DEFAULT 0,
    completed_steps INTEGER DEFAULT 0,
    failed_steps    INTEGER DEFAULT 0,
    created_at      DATETIME NOT NULL DEFAULT (datetime('now')),
    updated_at      DATETIME NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS pipelines_work_unit_idx ON pipelines(work_unit_id);
  CREATE INDEX IF NOT EXISTS pipelines_status_idx ON pipelines(status);
`;

/**
 * PipelineRow 레코드 타입
 */
export interface PipelineRow {
  id: string;
  slug: string;
  work_unit_id: string | null;
  type: string;
  command: string | null;
  status: string;
  arguments: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_ms: number | null;
  total_steps: number;
  completed_steps: number;
  failed_steps: number;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────
// Pipeline Events 스키마
// 파이프라인 이벤트 소싱 — JSONL에 저장되던 모든 이벤트를 DB에 영구 보존
// ─────────────────────────────────────────────────────────────

/**
 * pipeline_events 테이블 DDL
 * 모든 파이프라인 이벤트(pipeline_start/end, step_start/end, agent_start/end, error, recover)를
 * 하나의 범용 테이블에 저장한다. JSONL 파일과 병렬 저장하며, DB가 primary source.
 */
export const PIPELINE_EVENTS_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS pipeline_events (
    id              TEXT PRIMARY KEY,
    pipeline_id     TEXT REFERENCES pipelines(id),
    event_type      TEXT NOT NULL,
    call_id         TEXT,
    agent_type      TEXT,
    department      TEXT,
    model           TEXT,
    step_number     INTEGER,
    step_name       TEXT,
    phase           TEXT,
    status          TEXT,
    duration_ms     INTEGER,
    description     TEXT,
    result_summary  TEXT,
    message         TEXT,
    is_error        INTEGER,
    payload         TEXT,
    ts              TEXT NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS pipeline_events_pipeline_type_idx
    ON pipeline_events(pipeline_id, event_type);

  CREATE INDEX IF NOT EXISTS pipeline_events_type_ts_idx
    ON pipeline_events(event_type, ts);

  CREATE INDEX IF NOT EXISTS pipeline_events_call_id_idx
    ON pipeline_events(call_id);
`;

/**
 * 유효한 pipeline event type 값
 */
export const PIPELINE_EVENT_TYPE = {
  PIPELINE_START: "pipeline_start",
  PIPELINE_END: "pipeline_end",
  STEP_START: "step_start",
  STEP_END: "step_end",
  AGENT_START: "agent_start",
  AGENT_END: "agent_end",
  ERROR: "error",
  RECOVER: "recover",
} as const;

export type PipelineEventType = (typeof PIPELINE_EVENT_TYPE)[keyof typeof PIPELINE_EVENT_TYPE];

/**
 * PipelineEvent 레코드 타입
 */
export interface PipelineEventRow {
  id: string;
  pipeline_id: string | null;
  event_type: string;
  call_id: string | null;
  agent_type: string | null;
  department: string | null;
  model: string | null;
  step_number: number | null;
  step_name: string | null;
  phase: string | null;
  status: string | null;
  duration_ms: number | null;
  description: string | null;
  result_summary: string | null;
  message: string | null;
  is_error: number | null;
  payload: string | null;
  ts: string;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────
// Work Unit Events 스키마
// WU 관련 이벤트 소싱 — JSONL에 저장되던 WU 이벤트를 DB에 영구 보존
// ─────────────────────────────────────────────────────────────

/**
 * work_unit_events 테이블 DDL
 * work_unit_start/end, pipeline_linked, work_unit_archived 이벤트 저장.
 */
export const WORK_UNIT_EVENTS_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS work_unit_events (
    id              TEXT PRIMARY KEY,
    work_unit_id    TEXT REFERENCES work_units(id),
    event_type      TEXT NOT NULL,
    pipeline_slug   TEXT,
    payload         TEXT,
    ts              TEXT NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS work_unit_events_wu_type_idx
    ON work_unit_events(work_unit_id, event_type);
`;

/**
 * WorkUnitEvent 레코드 타입
 */
export interface WorkUnitEventRow {
  id: string;
  work_unit_id: string | null;
  event_type: string;
  pipeline_slug: string | null;
  payload: string | null;
  ts: string;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────
// Work Unit 스키마
// 작업 단위(Work Unit) — 여러 파이프라인을 하나의 논리적 작업으로 묶는다
// ─────────────────────────────────────────────────────────────

/**
 * work_units 테이블 DDL
 * 논리적 작업 단위. 여러 파이프라인이 하나의 work unit에 연결될 수 있다.
 */
export const WORK_UNITS_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS work_units (
    id              TEXT PRIMARY KEY,
    slug            TEXT NOT NULL UNIQUE,
    name            TEXT,
    status          TEXT NOT NULL DEFAULT 'active',
    started_at      TEXT NOT NULL,
    ended_at        TEXT,
    deleted_at      TEXT,                                         -- 소프트 삭제 타임스탬프 (NULL=활성)
    created_at      DATETIME NOT NULL DEFAULT (datetime('now'))
  );
`;

/**
 * WorkUnit 레코드 타입
 */
export interface WorkUnitRow {
  id: string;
  slug: string;
  name: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────
// Schema v3 — Projects / WorkProfiles / Rules / Execution Sessions
// (plan_viz웹개발플랫폼 F-P1/F-P3/F-P4/F-P5/F-P6/F-P10)
//
// 컨벤션: 기존 스키마와 동일하게 TEXT PRIMARY KEY(UUID) + DATETIME
// (datetime('now')) 문자열 타임스탬프를 사용한다 — spec.md 초안은
// INTEGER AUTOINCREMENT + unix-ms를 제안했으나, 코드베이스 전체가
// 예외 없이 TEXT/UUID + DATETIME 컨벤션을 쓰므로(schema.ts 전수 확인)
// 일관성을 우선한다(design-infra.md §0 "컨벤션 준수" 원칙).
// CHECK 제약은 spec.md §2 DDL을 그대로 채택한다.
// ─────────────────────────────────────────────────────────────

/**
 * projects.auto_retro_override 유효 값
 */
export const AUTO_RETRO_OVERRIDE = {
  INHERIT: "inherit",
  ON: "on",
  OFF: "off",
} as const;

export type AutoRetroOverride = (typeof AUTO_RETRO_OVERRIDE)[keyof typeof AUTO_RETRO_OVERRIDE];

/**
 * projects 테이블 DDL
 * 로컬 레포 등록 단위. repo_path는 realpath 정규화된 절대 경로.
 * archived_at IS NULL 조건의 partial unique index로 "아카이브 후 재등록 허용 +
 * 활성 상태 중복 등록 방지"를 동시에 만족한다(design-infra.md §1-1 결정 #2).
 */
export const PROJECTS_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS projects (
    slug                TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    repo_path           TEXT NOT NULL,
    work_profile_slug   TEXT NOT NULL REFERENCES work_profiles(slug),
    default_branch      TEXT NOT NULL DEFAULT 'main',
    auto_retro_override TEXT NOT NULL DEFAULT 'inherit'
                          CHECK(auto_retro_override IN ('inherit','on','off')),
    created_at          DATETIME NOT NULL DEFAULT (datetime('now')),
    updated_at          DATETIME NOT NULL DEFAULT (datetime('now')),
    archived_at         TEXT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS projects_repo_path_active_idx
    ON projects(repo_path) WHERE archived_at IS NULL;

  CREATE INDEX IF NOT EXISTS projects_work_profile_idx
    ON projects(work_profile_slug);

  CREATE INDEX IF NOT EXISTS projects_archived_at_idx
    ON projects(archived_at);
`;

export interface ProjectRow {
  slug: string;
  name: string;
  repo_path: string;
  work_profile_slug: string;
  default_branch: string;
  auto_retro_override: AutoRetroOverride;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

/**
 * work_profiles 테이블 DDL
 * 스택 프로파일(Next.js FS / Python API / Go 등). 프리셋 3종은
 * PRESET_WORK_PROFILES(아래)로 시드하며 is_preset=1로 표시된다.
 */
export const WORK_PROFILES_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS work_profiles (
    slug                TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    stack_tags          TEXT NOT NULL DEFAULT '[]',
    system_prompt_md    TEXT NOT NULL DEFAULT '',
    auto_retro_enabled  INTEGER NOT NULL DEFAULT 1,
    is_preset           INTEGER NOT NULL DEFAULT 0,
    created_at          DATETIME NOT NULL DEFAULT (datetime('now')),
    updated_at          DATETIME NOT NULL DEFAULT (datetime('now'))
  );
`;

export interface WorkProfileRow {
  slug: string;
  name: string;
  stack_tags: string;           // JSON string: string[]
  system_prompt_md: string;
  auto_retro_enabled: number;   // 0/1
  is_preset: number;            // 0/1
  created_at: string;
  updated_at: string;
}

/**
 * 프리셋 3종 시드 데이터 (F-P3 AC 요구, spec.md §2 F-P3 표)
 * migrate-v3.ts(신규 설치 없는 기존 DB)와 TaskDB.initSchema()(신규 설치) 양쪽에서
 * seedPresetWorkProfiles()를 통해 재사용된다.
 */
export const PRESET_WORK_PROFILES: Array<{
  slug: string;
  name: string;
  stack_tags: string[];
  system_prompt_md: string;
}> = [
  {
    slug: "nextjs-fullstack",
    name: "Next.js Full-Stack",
    stack_tags: ["nextjs", "typescript", "tailwind", "prisma"],
    system_prompt_md:
      "# Next.js Full-Stack 컨벤션\n\n" +
      "- App Router 컨벤션(page/layout/loading/error/not-found.tsx)을 따른다.\n" +
      "- Server Component를 기본으로 하고, 상호작용이 필요한 leaf에만 \"use client\"를 붙인다(RSC/CSR 경계).\n" +
      "- 데이터 변경은 Server Actions을 우선 사용한다.\n" +
      "- TypeScript strict 모드를 유지하고 any를 지양한다.\n",
  },
  {
    slug: "python-api",
    name: "Python API Service",
    stack_tags: ["python", "fastapi", "pydantic", "pytest"],
    system_prompt_md:
      "# Python API Service 컨벤션\n\n" +
      "- 모든 함수 시그니처에 type hints를 명시한다.\n" +
      "- 의존성은 FastAPI Depends를 통한 dependency injection으로 주입한다.\n" +
      "- I/O 바운드 로직은 async/await를 사용한다.\n" +
      "- 린트는 ruff를 사용하고 경고를 0으로 유지한다.\n",
  },
  {
    slug: "go-service",
    name: "Go Service",
    stack_tags: ["go", "fiber", "testify"],
    system_prompt_md:
      "# Go Service 컨벤션\n\n" +
      "- 외부 프레임워크보다 표준 라이브러리를 우선한다.\n" +
      "- 에러는 fmt.Errorf(\"...: %w\", err)로 wrapping하여 컨텍스트를 보존한다.\n" +
      "- 테스트는 table-driven test 패턴을 사용한다.\n",
  },
];

/**
 * work_profile_memories.kind 유효 값
 */
export const WORK_PROFILE_MEMORY_KIND = {
  LEARNED_PATTERN: "learned-pattern",
  GOTCHA: "gotcha",
  GOLD_SNIPPET: "gold-snippet",
} as const;

export type WorkProfileMemoryKind =
  (typeof WORK_PROFILE_MEMORY_KIND)[keyof typeof WORK_PROFILE_MEMORY_KIND];

/**
 * work_profile_memories 테이블 DDL
 * 스택 공통 축적 경험(회고 산출물에서 promote). decayed_at이 NULL이면 살아있는 항목.
 */
export const WORK_PROFILE_MEMORIES_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS work_profile_memories (
    id                 TEXT PRIMARY KEY,
    work_profile_slug  TEXT NOT NULL REFERENCES work_profiles(slug),
    kind               TEXT NOT NULL CHECK(kind IN ('learned-pattern','gotcha','gold-snippet')),
    source             TEXT NOT NULL,
    title              TEXT NOT NULL,
    body_md            TEXT NOT NULL,
    created_at         DATETIME NOT NULL DEFAULT (datetime('now')),
    decayed_at         TEXT
  );

  CREATE INDEX IF NOT EXISTS wpm_profile_created_idx
    ON work_profile_memories(work_profile_slug, created_at DESC);

  CREATE INDEX IF NOT EXISTS wpm_profile_alive_idx
    ON work_profile_memories(work_profile_slug, decayed_at);
`;

export interface WorkProfileMemoryRow {
  id: string;
  work_profile_slug: string;
  kind: WorkProfileMemoryKind;
  source: string;
  title: string;
  body_md: string;
  created_at: string;
  decayed_at: string | null;
}

/**
 * project_rules.kind 유효 값
 */
export const PROJECT_RULE_KIND = {
  MUST_READ: "must-read",
  PREF: "pref",
  STYLE: "style",
} as const;

export type ProjectRuleKind = (typeof PROJECT_RULE_KIND)[keyof typeof PROJECT_RULE_KIND];

/**
 * project_rules 테이블 DDL
 * 프로젝트 로컬 룰. must-read는 ordering으로 시스템 프롬프트 주입 순서를 제어한다.
 */
export const PROJECT_RULES_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS project_rules (
    id            TEXT PRIMARY KEY,
    project_slug  TEXT NOT NULL REFERENCES projects(slug),
    kind          TEXT NOT NULL CHECK(kind IN ('must-read','pref','style')),
    title         TEXT NOT NULL,
    body_md       TEXT NOT NULL,
    ordering      INTEGER NOT NULL DEFAULT 0,
    created_at    DATETIME NOT NULL DEFAULT (datetime('now')),
    updated_at    DATETIME NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS project_rules_project_kind_idx
    ON project_rules(project_slug, kind, ordering);
`;

export interface ProjectRuleRow {
  id: string;
  project_slug: string;
  kind: ProjectRuleKind;
  title: string;
  body_md: string;
  ordering: number;
  created_at: string;
  updated_at: string;
}

/**
 * execution_sessions.status 유효 값
 * spec.md §2 F-P6 CHECK 제약을 그대로 채택(design-infra.md 원안의
 * queued|running|completed|failed|aborted|orphaned에 pending_confirmation·
 * cancelled를 추가한 상위집합 — OQ-5 uncommitted 확인 분기와 F-P7 취소 분기에 필요).
 */
export const EXECUTION_SESSION_STATUS = {
  PENDING_CONFIRMATION: "pending_confirmation",
  QUEUED: "queued",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
  ABORTED: "aborted",
  ORPHANED: "orphaned",
} as const;

export type ExecutionSessionStatus =
  (typeof EXECUTION_SESSION_STATUS)[keyof typeof EXECUTION_SESSION_STATUS];

/**
 * execution_sessions 테이블 DDL
 * 웹 트리거 실행 세션. id는 PID+nonce가 아니라 UUID(design-infra.md §1-1 결정 #1 —
 * PID는 OS가 재사용하므로 영구 보존 테이블의 PK로 부적합). pid는 실행 중 프로세스
 * 식별·kill 용도의 별도 컬럼으로 유지한다.
 */
export const EXECUTION_SESSIONS_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS execution_sessions (
    id                TEXT PRIMARY KEY,
    project_slug      TEXT NOT NULL REFERENCES projects(slug),
    work_profile_slug TEXT,
    pipeline_slug     TEXT,
    command           TEXT NOT NULL,
    argv_json         TEXT,
    status            TEXT NOT NULL DEFAULT 'queued'
                        CHECK(status IN ('pending_confirmation','queued','running','completed','failed','cancelled','aborted','orphaned')),
    pid               INTEGER,
    spawn_nonce       TEXT NOT NULL,
    stash_ref         TEXT,
    started_at        TEXT,
    ended_at          TEXT,
    exit_code         INTEGER,
    stdout_ring_key   TEXT,
    created_at        DATETIME NOT NULL DEFAULT (datetime('now')),
    updated_at        DATETIME NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS execution_sessions_project_idx
    ON execution_sessions(project_slug, created_at DESC);

  CREATE INDEX IF NOT EXISTS execution_sessions_status_idx
    ON execution_sessions(status);
`;

export interface ExecutionSessionRow {
  id: string;
  project_slug: string;
  work_profile_slug: string | null;
  pipeline_slug: string | null;
  command: string;
  argv_json: string | null;
  status: ExecutionSessionStatus;
  pid: number | null;
  spawn_nonce: string;
  stash_ref: string | null;
  started_at: string | null;
  ended_at: string | null;
  exit_code: number | null;
  stdout_ring_key: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * v3 신규 테이블 DDL 목록 (FK 의존 순서 — work_profiles → projects →
 * work_profile_memories/project_rules/execution_sessions).
 * TaskDB.initSchema()와 migrate-v3.ts가 동일 순서로 재사용한다.
 */
export const V3_NEW_TABLES_DDL: string[] = [
  WORK_PROFILES_TABLE_DDL,
  PROJECTS_TABLE_DDL,
  WORK_PROFILE_MEMORIES_TABLE_DDL,
  PROJECT_RULES_TABLE_DDL,
  EXECUTION_SESSIONS_TABLE_DDL,
];

/**
 * v3에서 기존 테이블에 추가되는 컬럼 목록 (ensureColumn 헬퍼로 멱등 적용).
 * SQLite ALTER TABLE ADD COLUMN은 IF NOT EXISTS를 지원하지 않으므로
 * PRAGMA table_info로 존재 여부를 먼저 확인해야 한다(design-infra.md §1-2).
 */
export const PROJECT_SLUG_COLUMN_MIGRATIONS: Array<{
  table: string;
  column: string;
  ddlFragment: string;
  indexDdl: string;
}> = [
  {
    table: "pipelines",
    column: "project_slug",
    ddlFragment: "project_slug TEXT REFERENCES projects(slug)",
    indexDdl: "CREATE INDEX IF NOT EXISTS pipelines_project_slug_idx ON pipelines(project_slug);",
  },
  {
    table: "work_units",
    column: "project_slug",
    ddlFragment: "project_slug TEXT REFERENCES projects(slug)",
    indexDdl: "CREATE INDEX IF NOT EXISTS work_units_project_slug_idx ON work_units(project_slug);",
  },
];
