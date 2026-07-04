/**
 * orchestrator/execution-orchestrator.ts
 *
 * F-P6 실행 오케스트레이션 — 세션 생명주기·spawn·SSE 브릿지·session↔pipeline 매핑.
 *
 * TASK-119 스코프:
 *   ✓ preflight (검증 + git status + knowledge assembly + sanitizer)
 *   ✓ spawn (Bun.spawn, cwd + minimal env + arg[]) — NF-SEC-3/4
 *   ✓ stdout/stderr → SSE 브릿지 + ring buffer 512라인
 *   ✓ pipeline_start 감지 → linkPipeline
 *   ✓ 첫 stdout 25s 감지 → execution_slow_start
 *   ✓ 동시 상한 5 → TOO_MANY_ACTIVE_SESSIONS
 *   ✓ execution_session_start/end emit
 *   ✓ uncommitted 감지 → pending_confirmation + 3지분기 (proceed/stash/cancel)
 *
 * TASK-120 스코프 (완료):
 *   ✓ abort() — SIGTERM 15s grace → SIGKILL fallback (spec §F-P7, design-be §5)
 *   ✓ scanOrphans() — 부팅 시 running/queued 세션 pid alive 검사 → orphaned 마킹
 *   ✓ auto-retro 트리거 — pipeline_end status=completed 감지 30s 후 조건부 spawn
 *     (WorkProfile.auto_retro_enabled ⊕ Project.auto_retro_override 유효 정책)
 *
 * emit 경로 (design-be BC-1, design-infra §4-2):
 *   - **1차: TS 인프로세스** — 본 파일이 broker.pushEvent() + TaskDB.insertPipelineEvent()를
 *     직접 호출한다. bams-viz-emit.sh(bash) 인자 순서 최종 확정 전까지 유일한 정본 경로.
 *   - 2차: bash emit — 자식 프로세스가 자체 emit하는 pipeline_start/end는 기존 POST /api/events
 *     경로를 그대로 통과 (linkPipeline은 그 지점에서 트리거).
 *   - 선택 근거: 자식이 emit하지 못하는 상위 이벤트(session_start/session_end/slow_start)를
 *     서버가 확정 발행해야 하고, insertPipelineEvent()가 이미 auto-create를 지원하므로
 *     `session:${id}`를 pipeline_slug로 위임 저장할 수 있다.
 */

import { existsSync } from "fs";
import type { Database } from "bun:sqlite";
import { getDefaultDB } from "../../../tools/bams-db/index.ts";
import type { ProjectRow } from "../../../tools/bams-db/schema.ts";
import { getBroker } from "../sse-broker.ts";
import type { SseBroker } from "../sse-broker.ts";
import { ProjectStore } from "../stores/project-store.ts";
import { validateRepoPath } from "../stores/validate-repo-path.ts";
import { validateCommand, validateArgv } from "./command-validator.ts";
import { KnowledgeLoader } from "./knowledge-loader.ts";
import type { KnowledgeLoaderStats } from "./knowledge-loader.ts";
import { ExecutionSessionStore, serializeExecution } from "./execution-store.ts";
import type { ExecutionSessionRow } from "../../../tools/bams-db/schema.ts";
import { scheduleAutoRetro, type AutoRetroDeps } from "./auto-retro.ts";

// ─────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────

export const MAX_CONCURRENT_ACTIVE = 5;
export const SLOW_START_THRESHOLD_MS = 25_000;
export const RING_BUFFER_MAX_LINES = 512;
/**
 * QG Major-fix: 종료된 세션 로그 보존 상한(LRU).
 *
 * 이전에는 `onExit`/`markOrphaned`가 `this.active.delete()`로 ring buffer를 즉시 폐기해
 * 종료 세션 대상 `getLogs()`가 항상 `[]`를 반환했다(사용자가 실패/취소 사유를 사후 확인 불가).
 * 최근 종료 세션 20건의 tail 버퍼를 별도 Map(insertion-order LRU)에 보존해 조회 가능하게 한다.
 * DB/파일 영속화보다 간단·안전(추가 스토리지 없이 프로세스 메모리에만 512라인 × 20 세션 = 최대 10K라인).
 */
export const TERMINATED_LOG_RETENTION_MAX = 20;
/** F-P7: SIGTERM → grace → SIGKILL 대기 시간(ms). design-be §5-2. */
export const ABORT_GRACE_MS = 15_000;
/** F-P7: SIGKILL 후 프로세스 종료 확인 대기(ms). KILL_FAILED 판정 트리거. */
export const KILL_VERIFY_DELAY_MS = 500;
/** OQ-4: pipeline_end status=completed 수신 후 자동 회고 spawn까지 대기(ms). */
export const AUTO_RETRO_DELAY_MS = 30_000;

/** child 커맨드 스크립트 인자용 argv 렌더러 — 단순 join. */
function renderCommandLine(command: string, argv: string[]): string {
  return argv.length > 0 ? `${command} ${argv.join(" ")}` : command;
}

// ─────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────

export type UncommittedAction = "proceed" | "stash" | "cancel";

export interface StartExecutionInput {
  project_slug: string;
  command: string;
  argv: string[];
  uncommitted_action?: UncommittedAction;
}

export type PreflightFailure =
  | { code: "PROJECT_NOT_FOUND"; detail: string }
  | { code: "PROJECT_ARCHIVED"; detail: string }
  | { code: "PATH_MISSING"; detail: string }
  | { code: "PATH_ESCAPED"; detail: string }
  | { code: "COMMAND_NOT_ALLOWED"; detail: string }
  | { code: "UNSAFE_ARGUMENT"; detail: string }
  | { code: "ARGUMENT_TOO_LONG"; detail: string }
  | { code: "TOO_MANY_ARGUMENTS"; detail: string }
  | { code: "PROMPT_INJECTION_BLOCKED"; detail: string; offender?: unknown }
  | { code: "TOO_MANY_ACTIVE_SESSIONS"; detail: string; running: number };

export interface StartExecutionResult {
  session: ReturnType<typeof serializeExecution>;
  status: "pending_confirmation" | "running" | "queued";
  prompt_stats?: KnowledgeLoaderStats;
}

export interface StartExecutionErrorResult {
  error: PreflightFailure;
}

// ─────────────────────────────────────────────────────────────
// Bun.spawn 인터페이스 — 테스트 mock 주입 지점
// ─────────────────────────────────────────────────────────────

export interface SpawnRequest {
  cwd: string;
  cmd: readonly [string, ...string[]];
  env: Readonly<Record<string, string>>;
  sessionId: string;
}

export interface ProcessHandle {
  pid: number;
  exited: Promise<number>; // exit code
  stdout: ReadableStream<Uint8Array> | null;
  stderr: ReadableStream<Uint8Array> | null;
  kill(signal?: number | NodeJS.Signals): void;
}

/**
 * 실제 spawn 구현체 — Bun.spawn 래퍼. CLAUDE_BIN env로 바이너리 오버라이드 가능
 * (테스트: `echo` 등 mock 실행).
 */
export type Spawner = (req: SpawnRequest) => ProcessHandle;

const defaultSpawner: Spawner = (req: SpawnRequest): ProcessHandle => {
  // Bun.spawn 사용 (Bun 런타임 전제 — 기존 sse-broker.ts와 동일)
  const proc = Bun.spawn({
    cmd: [...req.cmd] as unknown as string[],
    cwd: req.cwd,
    env: { ...req.env }, // Bun.spawn는 mutable Record 요구
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    pid: proc.pid,
    exited: proc.exited.then((c) => (typeof c === "number" ? c : 0)),
    stdout: proc.stdout as ReadableStream<Uint8Array> | null,
    stderr: proc.stderr as ReadableStream<Uint8Array> | null,
    kill(signal) {
      try {
        proc.kill(signal as number | undefined);
      } catch {
        /* already dead */
      }
    },
  };
};

// ─────────────────────────────────────────────────────────────
// Ring Buffer
// ─────────────────────────────────────────────────────────────

class LineRingBuffer {
  private lines: string[] = [];
  constructor(private cap: number = RING_BUFFER_MAX_LINES) {}
  push(line: string): void {
    this.lines.push(line);
    if (this.lines.length > this.cap) this.lines.splice(0, this.lines.length - this.cap);
  }
  tail(n: number): string[] {
    if (n <= 0) return [];
    if (n >= this.lines.length) return [...this.lines];
    return this.lines.slice(-n);
  }
  size(): number {
    return this.lines.length;
  }
}

// ─────────────────────────────────────────────────────────────
// ExecutionOrchestrator (singleton)
// ─────────────────────────────────────────────────────────────

interface ActiveSession {
  handle: ProcessHandle;
  ringBuffer: LineRingBuffer;
  startedAt: number;
  firstStdoutAt: number | null;
  slowStartTimer: ReturnType<typeof setTimeout> | null;
  linkedPipelineSlug: string | null;
  /**
   * F-P7: abort() 호출로 SIGTERM 발송 후 세팅. onExit에서 이 플래그가 true면
   * exit_code와 무관하게 status='aborted'로 전이하고 pipeline_end shim(cancelled) emit.
   */
  aborted: boolean;
  /** F-P7: SIGTERM → SIGKILL fallback timer. abort 시 세팅, exit 관측 시 clear. */
  graceTimer: ReturnType<typeof setTimeout> | null;
  /** F-P7: SIGKILL 후 KILL_FAILED 판정용 verify timer. */
  killVerifyTimer: ReturnType<typeof setTimeout> | null;
  /** abort 요청 사유(user/timeout/server_shutdown). 감사 이벤트 payload용. */
  abortReason: string | null;
}

/**
 * F-P7 테스트 훅 — 프로세스 alive 검사 커스터마이즈.
 * 프로덕션은 process.kill(pid, 0) 사용, 테스트는 mock으로 교체.
 */
export type PidAliveCheck = (pid: number) => boolean;

const defaultPidAliveCheck: PidAliveCheck = (pid: number): boolean => {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    // EPERM = 존재하지만 시그널 권한 없음 → alive로 판정
    return e.code === "EPERM";
  }
};

export interface OrchestratorOptions {
  db?: Database;
  broker?: SseBroker;
  spawner?: Spawner;
  /** F-P7 grace period 오버라이드 — 테스트에서 짧게 설정. */
  graceMs?: number;
  /** F-P7 SIGKILL 후 KILL_FAILED 판정 대기 오버라이드. */
  killVerifyDelayMs?: number;
  /** F-P7 pid alive 검사 커스터마이즈 (테스트 mock). */
  pidAliveCheck?: PidAliveCheck;
  /** OQ-4 auto-retro delay 오버라이드 — 테스트에서 짧게 설정. */
  autoRetroDelayMs?: number;
  /** OQ-4 auto-retro 완전 비활성 (테스트에서 spurious spawn 방지). */
  disableAutoRetro?: boolean;
}

/**
 * env whitelist — design-be §4-5 SAFE_ENV_KEYS + spec §F-P6 최소 env.
 * 자식은 이 목록에 없는 env를 전달받지 않는다.
 */
const SAFE_ENV_KEYS: readonly string[] = [
  "PATH",
  "HOME",
  "USER",
  "LANG",
  "LC_ALL",
  "TZ",
  "SHELL",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_CODE_SSE_PORT",
];

export class ExecutionOrchestrator {
  private db: Database;
  private broker: SseBroker;
  private spawner: Spawner;
  private sessionStore: ExecutionSessionStore;
  private projectStore: ProjectStore;
  private knowledge: KnowledgeLoader;
  private active = new Map<string, ActiveSession>();
  /**
   * QG Major-fix: 종료된 세션의 ring buffer를 최근 N건까지 보존한다.
   * `active`에서 제거될 때 이곳으로 이동시켜 `getLogs()`가 tail을 계속 반환할 수 있게 한다.
   * Map은 삽입 순서를 보존하므로 별도 자료구조 없이 LRU 폐기가 가능하다.
   */
  private terminated = new Map<string, {
    ringBuffer: LineRingBuffer;
    linkedPipelineSlug: string | null;
  }>();
  private graceMs: number;
  private killVerifyDelayMs: number;
  private pidAliveCheck: PidAliveCheck;
  private autoRetroDelayMs: number;
  private disableAutoRetro: boolean;
  /**
   * F-P7 재진입 방지 — 활성 세션에 대응하는 in-flight abort 시퀀스가 있을 때 세팅.
   * 서버 프로세스 재시작(active 손실) 이후 pid 기반 폴백 경로에서도 재사용 가능.
   */
  private abortInFlight = new Set<string>();

  constructor(opts: OrchestratorOptions = {}) {
    // stores/db.ts의 shared connection 사용 (요청자가 override 가능)
    // 순환 import를 피하려면 지연 로드가 필요하지만 여기서는 opts.db 미지정 시
    // getStoresDb를 지연 임포트 — 간단히 처리.
    if (opts.db) {
      this.db = opts.db;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getStoresDb } = require("../stores/db.ts") as typeof import("../stores/db.ts");
      this.db = getStoresDb();
    }
    this.broker = opts.broker ?? getBroker();
    this.spawner = opts.spawner ?? defaultSpawner;
    this.sessionStore = new ExecutionSessionStore(this.db);
    this.projectStore = new ProjectStore(this.db);
    this.knowledge = new KnowledgeLoader(this.db);
    this.graceMs = opts.graceMs ?? ABORT_GRACE_MS;
    this.killVerifyDelayMs = opts.killVerifyDelayMs ?? KILL_VERIFY_DELAY_MS;
    this.pidAliveCheck = opts.pidAliveCheck ?? defaultPidAliveCheck;
    this.autoRetroDelayMs = opts.autoRetroDelayMs ?? AUTO_RETRO_DELAY_MS;
    this.disableAutoRetro = opts.disableAutoRetro ?? false;
  }

  // ── Public API ───────────────────────────────────────────

  /**
   * F-P6 실행 트리거. 다음 순서로 진행:
   *   1. preflight (project/path/command/argv 검증)
   *   2. 동시 상한 확인
   *   3. git status --porcelain (spec §1-5)
   *      - dirty && action 미지정 → pending_confirmation 세션 생성 후 반환
   *      - dirty && action="cancel" → cancelled 세션
   *      - dirty && action="stash" → git stash push (실패 시 즉시 실패)
   *      - dirty && action="proceed" 또는 clean → 계속
   *   4. KnowledgeLoader.buildSystemPrompt
   *   5. spawn + SSE 브릿지 시작
   */
  async start(
    input: StartExecutionInput,
  ): Promise<StartExecutionResult | StartExecutionErrorResult> {
    // 1) command / argv 검증 (spec §1-7)
    const cmdResult = validateCommand(input.command);
    if (!cmdResult.ok) {
      return { error: { code: "COMMAND_NOT_ALLOWED", detail: cmdResult.detail } };
    }
    const argResult = validateArgv(input.argv);
    if (!argResult.ok) {
      return { error: { code: argResult.code, detail: argResult.detail } };
    }

    // 2) project 존재/아카이브
    const project = this.projectStore.get(input.project_slug);
    if (!project) {
      return { error: { code: "PROJECT_NOT_FOUND", detail: input.project_slug } };
    }
    if (project.archived_at !== null) {
      return { error: { code: "PROJECT_ARCHIVED", detail: input.project_slug } };
    }

    // 3) repo_path 재검증 (spec §2-2 TOCTOU 방어)
    if (!existsSync(project.repo_path)) {
      return { error: { code: "PATH_MISSING", detail: project.repo_path } };
    }
    const pathCheck = validateRepoPath(project.repo_path);
    if (!pathCheck.ok) {
      return {
        error: {
          code: pathCheck.reason === "OUT_OF_HOME" || pathCheck.reason === "SYMLINK_ESCAPE"
            ? "PATH_ESCAPED"
            : "PATH_MISSING",
          detail: `${project.repo_path} → ${pathCheck.reason}`,
        },
      };
    }

    // 4) 동시 상한
    const activeCount = this.sessionStore.countActive();
    if (activeCount >= MAX_CONCURRENT_ACTIVE) {
      return {
        error: {
          code: "TOO_MANY_ACTIVE_SESSIONS",
          detail: `max concurrent executions (${MAX_CONCURRENT_ACTIVE}) reached`,
          running: activeCount,
        },
      };
    }

    // 5) uncommitted 감지 (spec §1-5)
    const dirty = await this.checkGitDirty(project.repo_path);
    if (dirty && !input.uncommitted_action) {
      // pending_confirmation 세션 반환 (spawn 없이)
      const session = this.sessionStore.create({
        project_slug: project.slug,
        work_profile_slug: project.work_profile_slug,
        command: cmdResult.command,
        argv: argResult.argv,
        status: "pending_confirmation",
      });
      return {
        session: serializeExecution(session),
        status: "pending_confirmation",
      };
    }

    let stashRef: string | null = null;
    if (dirty && input.uncommitted_action === "cancel") {
      const session = this.sessionStore.create({
        project_slug: project.slug,
        work_profile_slug: project.work_profile_slug,
        command: cmdResult.command,
        argv: argResult.argv,
        status: "cancelled",
      });
      this.emitExecutionSessionEnd({
        sessionId: session.id,
        projectSlug: project.slug,
        pipelineSlug: null,
        status: "cancelled",
        exitCode: null,
        durationMs: 0,
      });
      return { session: serializeExecution(session), status: "queued" };
    }
    if (dirty && input.uncommitted_action === "stash") {
      try {
        stashRef = await this.stashChanges(project.repo_path);
      } catch (err) {
        return {
          error: {
            code: "PATH_MISSING", // stash 실패는 500 이지만 preflight 계약상 4xx 처리
            detail: `git stash failed: ${err instanceof Error ? err.message : String(err)}`,
          },
        };
      }
    }

    // 6) KnowledgeLoader 조립
    // sessionId 필요 — 먼저 queued 세션 생성
    const session = this.sessionStore.create({
      project_slug: project.slug,
      work_profile_slug: project.work_profile_slug,
      command: cmdResult.command,
      argv: argResult.argv,
      status: "queued",
      stash_ref: stashRef,
    });
    const build = this.knowledge.buildSystemPrompt(project, { sessionId: session.id });
    if (!build.ok) {
      // 세션을 failed로 마킹
      this.sessionStore.update(session.id, { status: "failed" });
      this.emitExecutionSessionEnd({
        sessionId: session.id,
        projectSlug: project.slug,
        pipelineSlug: null,
        status: "failed",
        exitCode: null,
        durationMs: 0,
      });
      return {
        error: {
          code: "PROMPT_INJECTION_BLOCKED",
          detail: build.detail,
          offender: build.offender,
        },
      };
    }

    // truncation emit
    if (build.stats.truncated.length > 0) {
      this.broker.pushEvent({
        type: "system_prompt_pref_truncated" as import("../sse-broker.ts").SseEventType,
        pipeline_slug: `session:${session.id}`,
        agent_slug: "execution",
        run_id: session.id,
        ts: new Date().toISOString(),
        payload: {
          session_id: session.id,
          project_slug: project.slug,
          truncated: build.stats.truncated,
        },
      });
    }

    // 7) spawn
    const claudeBin = process.env.CLAUDE_BIN ?? "claude";
    const commandLine = renderCommandLine(cmdResult.command, argResult.argv);
    const env = this.buildEnv(session.id, project);
    const cmdArray: [string, ...string[]] = [
      claudeBin,
      "-p",
      commandLine,
      "--append-system-prompt",
      build.filePath,
    ];

    let handle: ProcessHandle;
    try {
      handle = this.spawner({
        cwd: pathCheck.absolute,
        cmd: cmdArray,
        env,
        sessionId: session.id,
      });
    } catch (err) {
      this.sessionStore.update(session.id, { status: "failed" });
      this.emitExecutionSessionEnd({
        sessionId: session.id,
        projectSlug: project.slug,
        pipelineSlug: null,
        status: "failed",
        exitCode: null,
        durationMs: 0,
      });
      return {
        error: {
          code: "PATH_MISSING",
          detail: `spawn failed: ${err instanceof Error ? err.message : String(err)}`,
        },
      };
    }

    // 세션을 running으로 전이
    const startedAtIso = new Date().toISOString();
    const startedAtMs = Date.now();
    this.sessionStore.update(session.id, {
      status: "running",
      pid: handle.pid,
      started_at: startedAtIso,
      stdout_ring_key: `session:${session.id}`,
    });
    const activeEntry: ActiveSession = {
      handle,
      ringBuffer: new LineRingBuffer(),
      startedAt: startedAtMs,
      firstStdoutAt: null,
      slowStartTimer: null,
      linkedPipelineSlug: null,
      aborted: false,
      graceTimer: null,
      killVerifyTimer: null,
      abortReason: null,
    };
    this.active.set(session.id, activeEntry);

    // execution_session_start emit
    this.emitExecutionSessionStart({
      sessionId: session.id,
      projectSlug: project.slug,
      command: cmdResult.command,
      pid: handle.pid,
    });

    // 25s slow-start 감시
    activeEntry.slowStartTimer = setTimeout(() => {
      const cur = this.active.get(session.id);
      if (!cur) return;
      if (!cur.firstStdoutAt) {
        this.broker.pushEvent({
          type: "execution_slow_start" as import("../sse-broker.ts").SseEventType,
          pipeline_slug: `session:${session.id}`,
          agent_slug: "execution",
          run_id: session.id,
          ts: new Date().toISOString(),
          payload: { session_id: session.id, threshold_ms: SLOW_START_THRESHOLD_MS },
        });
      }
    }, SLOW_START_THRESHOLD_MS);

    // stdout/stderr 브릿지 (fire-and-forget)
    void this.pipeStream(session.id, handle.stdout, "stdout", project.slug);
    void this.pipeStream(session.id, handle.stderr, "stderr", project.slug);

    // exit watcher
    void handle.exited.then((exitCode) => this.onExit(session.id, exitCode, startedAtMs, project.slug));

    const latest = this.sessionStore.get(session.id);
    return {
      session: serializeExecution(latest ?? session),
      status: "running",
      prompt_stats: build.stats,
    };
  }

  /**
   * child가 stdout에 emit한 pipeline_start를 감지했을 때(POST /api/events 경로에서
   * 별도 호출) 세션 매핑을 완료한다. session_id는 env로 주입한 BAMS_SESSION_ID.
   */
  linkPipelineForSession(sessionId: string, pipelineSlug: string): boolean {
    const active = this.active.get(sessionId);
    const linked = this.sessionStore.linkPipeline(sessionId, pipelineSlug);
    if (linked && active) {
      active.linkedPipelineSlug = pipelineSlug;
      this.broker.pushEvent({
        type: "execution_session_linked" as import("../sse-broker.ts").SseEventType,
        pipeline_slug: pipelineSlug,
        agent_slug: "execution",
        run_id: sessionId,
        ts: new Date().toISOString(),
        payload: { session_id: sessionId, pipeline_slug: pipelineSlug },
      });
    }
    return linked;
  }

  /**
   * 로그 tail 조회 (GET /api/executions/:id/logs).
   * QG Major-fix: 종료된 세션(최근 20건)도 `terminated` LRU에서 조회 가능.
   */
  getLogs(sessionId: string, tail: number): string[] {
    const active = this.active.get(sessionId);
    if (active) return active.ringBuffer.tail(tail);
    const terminated = this.terminated.get(sessionId);
    if (terminated) return terminated.ringBuffer.tail(tail);
    return [];
  }

  /**
   * QG Major-fix helper: active 세션을 정리하고 ring buffer를 `terminated` LRU로 이동한다.
   * onExit/markOrphaned 양쪽에서 재사용하여 종료 경로 어디로 가든 로그가 보존되도록 한다.
   * insertion-order Map을 활용해 상한 초과 시 가장 오래된 항목부터 폐기(간단·안전).
   */
  private moveActiveToTerminated(sessionId: string): void {
    const a = this.active.get(sessionId);
    if (!a) return;
    if (a.slowStartTimer) clearTimeout(a.slowStartTimer);
    if (a.graceTimer) clearTimeout(a.graceTimer);
    if (a.killVerifyTimer) clearTimeout(a.killVerifyTimer);
    // 이미 terminated에 있으면 갱신 위해 삭제 후 재삽입 (LRU refresh)
    if (this.terminated.has(sessionId)) this.terminated.delete(sessionId);
    this.terminated.set(sessionId, {
      ringBuffer: a.ringBuffer,
      linkedPipelineSlug: a.linkedPipelineSlug,
    });
    while (this.terminated.size > TERMINATED_LOG_RETENTION_MAX) {
      const oldest = this.terminated.keys().next().value;
      if (oldest === undefined) break;
      this.terminated.delete(oldest);
    }
    this.active.delete(sessionId);
  }

  /**
   * F-P7 abort — SIGTERM → 15s grace → SIGKILL fallback.
   *
   * 응답 규약 (routes/executions.ts가 HTTP status로 매핑):
   *   - { ok: true, session, signal: 'SIGTERM' } → 202 Accepted (abort in progress)
   *   - { ok: false, code: 'NOT_FOUND' } → 404
   *   - { ok: false, code: 'NOT_RUNNING', session } → 409
   *   - { ok: false, code: 'ORPHANED', session } → 200 (spec §F-P7 에러 표: "pid 없거나 이미 죽은 프로세스 → orphaned 정정, 200")
   *   - { ok: false, code: 'ALREADY_ABORTING', session } → 409
   *
   * onExit는 aborted 플래그를 관측하여 status='aborted'로 전이하고 pipeline_end
   * shim(cancelled) emit. SIGKILL 후에도 alive면 killVerifyTimer가 KILL_FAILED
   * 경로로 orphaned 마킹 + broker 이벤트.
   */
  abort(
    sessionId: string,
    opts?: { reason?: string },
  ):
    | { ok: true; session: ExecutionSessionRow; signal: "SIGTERM" }
    | { ok: false; code: "NOT_FOUND" }
    | { ok: false; code: "NOT_RUNNING"; session: ExecutionSessionRow }
    | { ok: false; code: "ORPHANED"; session: ExecutionSessionRow }
    | { ok: false; code: "ALREADY_ABORTING"; session: ExecutionSessionRow } {
    const session = this.sessionStore.get(sessionId);
    if (!session) return { ok: false, code: "NOT_FOUND" };

    // 재진입 방지 — 동일 세션에 대해 여러 abort 요청 병렬 방어
    if (this.abortInFlight.has(sessionId)) {
      return { ok: false, code: "ALREADY_ABORTING", session };
    }

    if (session.status !== "running") {
      return { ok: false, code: "NOT_RUNNING", session };
    }

    const reason = opts?.reason ?? "user";
    const active = this.active.get(sessionId);
    const pid = session.pid;

    // pid alive 검사 — 이미 죽은 pid → orphaned 정정
    if (typeof pid === "number" && !this.pidAliveCheck(pid)) {
      this.markOrphaned(sessionId, session.project_slug, session.pipeline_slug);
      const latest = this.sessionStore.get(sessionId) ?? session;
      return { ok: false, code: "ORPHANED", session: latest };
    }

    this.abortInFlight.add(sessionId);
    if (active) {
      active.aborted = true;
      active.abortReason = reason;
    }

    // 감사 이벤트 (NF-SEC-6)
    const requestedAt = new Date().toISOString();
    this.broker.pushEvent({
      type: "execution_aborted_requested",
      pipeline_slug: session.pipeline_slug ?? `session:${sessionId}`,
      agent_slug: "execution",
      run_id: sessionId,
      ts: requestedAt,
      payload: {
        session_id: sessionId,
        project_slug: session.project_slug,
        reason,
        requested_at: requestedAt,
      },
    });
    // execution 이벤트로 감사 로그 남김 (spec §F-P7 audit)
    try {
      const dbInst = getDefaultDB();
      dbInst.insertPipelineEvent({
        pipeline_slug: session.pipeline_slug ?? `session:${sessionId}`,
        event_type: "execution_aborted_requested",
        call_id: sessionId,
        description: `abort requested (${reason})`,
        payload: {
          session_id: sessionId,
          project_slug: session.project_slug,
          reason,
          requested_at: requestedAt,
        },
        ts: requestedAt,
      });
    } catch (err) {
      console.error(
        "[orchestrator] execution_aborted_requested insertPipelineEvent failed:",
        err,
      );
    }

    // SIGTERM
    this.sendSignal(active, pid, "SIGTERM");
    this.emitExecutionAborted(
      sessionId,
      session.project_slug,
      session.pipeline_slug,
      "SIGTERM",
      reason,
    );

    // Grace timer → SIGKILL fallback
    const graceTimer = setTimeout(() => {
      // exit이 이미 관측되었으면 (onExit이 abortInFlight/active 정리) 이 콜백은 no-op
      if (!this.abortInFlight.has(sessionId)) return;
      // 최신 세션 조회 — running이 아니면 이미 종료
      const cur = this.sessionStore.get(sessionId);
      if (!cur || cur.status !== "running") return;
      const p = cur.pid;
      if (typeof p !== "number" || !this.pidAliveCheck(p)) {
        // 프로세스가 조용히 죽었음 — 상태 정정
        this.markOrphaned(sessionId, cur.project_slug, cur.pipeline_slug);
        return;
      }
      // 여전히 살아있음 → SIGKILL
      this.sendSignal(this.active.get(sessionId), p, "SIGKILL");
      this.emitExecutionAborted(
        sessionId,
        cur.project_slug,
        cur.pipeline_slug,
        "SIGKILL",
        reason,
      );
      this.broker.pushEvent({
        type: "execution_force_killed",
        pipeline_slug: cur.pipeline_slug ?? `session:${sessionId}`,
        agent_slug: "execution",
        run_id: sessionId,
        ts: new Date().toISOString(),
        payload: {
          session_id: sessionId,
          project_slug: cur.project_slug,
          reason,
          signal: "SIGKILL",
        },
      });

      // KILL_FAILED verify — 짧은 지연 후 여전히 alive면 orphaned 마킹
      const killVerifyTimer = setTimeout(() => {
        if (!this.abortInFlight.has(sessionId)) return;
        const latest = this.sessionStore.get(sessionId);
        if (!latest || latest.status !== "running") return;
        const p2 = latest.pid;
        if (typeof p2 === "number" && this.pidAliveCheck(p2)) {
          console.error(
            `[orchestrator] SIGKILL failed for session ${sessionId} (pid=${p2}) — marking orphaned`,
          );
          this.markOrphaned(sessionId, latest.project_slug, latest.pipeline_slug);
        }
      }, this.killVerifyDelayMs);
      const activeNow = this.active.get(sessionId);
      if (activeNow) activeNow.killVerifyTimer = killVerifyTimer;
    }, this.graceMs);
    if (active) active.graceTimer = graceTimer;

    const latest = this.sessionStore.get(sessionId) ?? session;
    return { ok: true, session: latest, signal: "SIGTERM" };
  }

  /**
   * NF-REL-1 부팅 시 orphan 스캔 — status IN ('queued','running')인 세션의 pid alive를
   * 확인하고, 죽었으면 'orphaned'로 마킹한다. **자동 재spawn은 절대 금지**
   * (사용자가 결과를 확인하고 재실행해야 함, design-be §5 안전 원칙).
   */
  scanOrphans(): { scanned: number; orphaned: string[] } {
    const orphaned: string[] = [];
    try {
      const rows = this.sessionStore.list({
        status: ["queued", "running"],
        limit: 500,
      });
      for (const row of rows) {
        // 서버 재시작 후 active Map은 비어있음 → 서버가 소유하지 않는 pid는 orphan 후보
        // pid null 또는 dead → orphaned
        if (row.pid == null || !this.pidAliveCheck(row.pid)) {
          this.markOrphaned(row.id, row.project_slug, row.pipeline_slug);
          orphaned.push(row.id);
        }
        // pid alive: 서버 재시작 후에도 여전히 살아있는 프로세스는 놔둔다
        // (자식이 자체 pipeline_end emit으로 상태 전이 가능). 스캔은 dead pid만 정정.
      }
      if (rows.length > 0) {
        console.log(
          `[orchestrator] scanOrphans: scanned ${rows.length} active sessions, ${orphaned.length} marked orphaned`,
        );
      }
    } catch (err) {
      console.error("[orchestrator] scanOrphans failed:", err);
    }
    return { scanned: orphaned.length, orphaned };
  }

  // ── Private F-P7 helpers ───────────────────────────────

  private sendSignal(
    active: ActiveSession | undefined,
    pid: number | null,
    signal: "SIGTERM" | "SIGKILL",
  ): void {
    try {
      if (active) {
        active.handle.kill(signal);
        return;
      }
      // active 없음(서버 재시작 후 등) → pid로 직접 시그널
      if (typeof pid === "number" && this.pidAliveCheck(pid)) {
        process.kill(pid, signal);
      }
    } catch (err) {
      // 이미 죽은 프로세스 등은 무시
      const e = err as NodeJS.ErrnoException;
      if (e.code !== "ESRCH") {
        console.error(`[orchestrator] sendSignal ${signal} failed:`, err);
      }
    }
  }

  private markOrphaned(
    sessionId: string,
    projectSlug: string,
    pipelineSlug: string | null,
  ): void {
    const endedAtIso = new Date().toISOString();
    this.sessionStore.update(sessionId, {
      status: "orphaned",
      ended_at: endedAtIso,
    });
    this.emitExecutionSessionEnd({
      sessionId,
      projectSlug,
      pipelineSlug,
      status: "orphaned",
      exitCode: null,
      durationMs: 0,
    });
    this.abortInFlight.delete(sessionId);
    // QG Major-fix: 즉시 active.delete 하지 않고 ring buffer를 terminated LRU로 이관.
    this.moveActiveToTerminated(sessionId);
  }

  private emitExecutionAborted(
    sessionId: string,
    projectSlug: string,
    pipelineSlug: string | null,
    signal: "SIGTERM" | "SIGKILL",
    reason: string,
  ): void {
    const ts = new Date().toISOString();
    const pipeline_slug = pipelineSlug ?? `session:${sessionId}`;
    this.broker.pushEvent({
      type: "execution_aborted",
      pipeline_slug,
      agent_slug: "execution",
      run_id: sessionId,
      ts,
      payload: {
        session_id: sessionId,
        project_slug: projectSlug,
        pipeline_slug: pipelineSlug,
        reason,
        signal,
      },
    });
    try {
      const dbInst = getDefaultDB();
      dbInst.insertPipelineEvent({
        pipeline_slug,
        event_type: "execution_aborted",
        call_id: sessionId,
        description: `${signal} (${reason})`,
        payload: {
          session_id: sessionId,
          project_slug: projectSlug,
          pipeline_slug: pipelineSlug,
          reason,
          signal,
        },
        ts,
      });
    } catch (err) {
      console.error("[orchestrator] execution_aborted insertPipelineEvent failed:", err);
    }
  }

  // ── Internal ────────────────────────────────────────────

  private buildEnv(sessionId: string, project: ProjectRow): Record<string, string> {
    const out: Record<string, string> = {};
    for (const k of SAFE_ENV_KEYS) {
      const v = process.env[k];
      if (typeof v === "string" && v.length > 0) out[k] = v;
    }
    // 필수 오버라이드 — child가 세션 컨텍스트를 알 수 있게
    out.BAMS_SESSION_ID = sessionId;
    out.BAMS_PROJECT_SLUG = project.slug;
    out.BAMS_SERVER_PORT = process.env.BAMS_SERVER_PORT ?? "3099";
    out.TERM = "dumb";
    return out;
  }

  private async checkGitDirty(cwd: string): Promise<boolean> {
    try {
      const proc = Bun.spawn({
        cmd: ["git", "status", "--porcelain=v1", "-z"],
        cwd,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "ignore",
      });
      const exitCode = await proc.exited;
      if (exitCode !== 0) return false; // .git 없으면 dirty=false (F-P1 allow_non_git 케이스)
      const buf = proc.stdout ? await new Response(proc.stdout as ReadableStream<Uint8Array>).arrayBuffer() : new ArrayBuffer(0);
      return buf.byteLength > 0;
    } catch {
      return false;
    }
  }

  private async stashChanges(cwd: string): Promise<string> {
    const iso = new Date().toISOString();
    const message = `bams-viz auto-stash ${iso}`;
    const proc = Bun.spawn({
      cmd: ["git", "stash", "push", "-u", "-m", message],
      cwd,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const stderr = proc.stderr
        ? await new Response(proc.stderr as ReadableStream<Uint8Array>).text()
        : "unknown";
      throw new Error(stderr.trim() || `git stash exited with ${exitCode}`);
    }
    return message;
  }

  private async pipeStream(
    sessionId: string,
    stream: ReadableStream<Uint8Array> | null,
    which: "stdout" | "stderr",
    projectSlug: string,
  ): Promise<void> {
    if (!stream) return;
    const active = this.active.get(sessionId);
    if (!active) return;
    const decoder = new TextDecoder();
    let carry = "";
    try {
      const reader = stream.getReader();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        carry += decoder.decode(value, { stream: true });
        let idx = carry.indexOf("\n");
        while (idx !== -1) {
          const line = carry.slice(0, idx);
          carry = carry.slice(idx + 1);
          this.onLine(sessionId, line, which, projectSlug);
          idx = carry.indexOf("\n");
        }
      }
      if (carry.length > 0) {
        this.onLine(sessionId, carry, which, projectSlug);
      }
    } catch {
      /* stream closed */
    }
  }

  private onLine(
    sessionId: string,
    line: string,
    stream: "stdout" | "stderr",
    projectSlug: string,
  ): void {
    const active = this.active.get(sessionId);
    if (!active) return;
    active.ringBuffer.push(line);
    if (stream === "stdout" && !active.firstStdoutAt) {
      active.firstStdoutAt = Date.now();
      if (active.slowStartTimer) {
        clearTimeout(active.slowStartTimer);
        active.slowStartTimer = null;
      }
    }
    const targetSlug = active.linkedPipelineSlug ?? `session:${sessionId}`;
    this.broker.pushEvent({
      type: "text_chunk",
      pipeline_slug: targetSlug,
      agent_slug: "execution",
      run_id: sessionId,
      ts: new Date().toISOString(),
      payload: { line, stream, session_id: sessionId, project_slug: projectSlug },
    });

    // pipeline_start 라인 감지 — child가 emit한 JSON에서 type/event_type 필드 검사
    // best-effort — malformed JSON은 무시
    if (stream === "stdout" && !active.linkedPipelineSlug && line.includes("pipeline_start")) {
      const detected = tryDetectPipelineSlug(line);
      if (detected) {
        this.linkPipelineForSession(sessionId, detected);
      }
    }
  }

  private onExit(
    sessionId: string,
    exitCode: number,
    startedAtMs: number,
    projectSlug: string,
  ): void {
    const active = this.active.get(sessionId);
    // 타이머 정리는 moveActiveToTerminated에 위임되지만, 아래 emit 이전에 참조를 위해
    // active 스냅샷을 확보한다. 타이머만 여기서 clear해도 idempotent (moveActive에서 재-clear).
    if (active?.slowStartTimer) {
      clearTimeout(active.slowStartTimer);
      active.slowStartTimer = null;
    }
    if (active?.graceTimer) {
      clearTimeout(active.graceTimer);
      active.graceTimer = null;
    }
    if (active?.killVerifyTimer) {
      clearTimeout(active.killVerifyTimer);
      active.killVerifyTimer = null;
    }
    const durationMs = Date.now() - startedAtMs;
    // F-P7: abort 요청 후 exit이면 status='aborted'로 전이 (exit_code 무관)
    const aborted = active?.aborted === true || this.abortInFlight.has(sessionId);
    const status: "completed" | "failed" | "aborted" = aborted
      ? "aborted"
      : exitCode === 0
        ? "completed"
        : "failed";
    const endedAtIso = new Date().toISOString();
    this.sessionStore.update(sessionId, {
      status,
      exit_code: exitCode,
      ended_at: endedAtIso,
    });
    const pipelineSlug = active?.linkedPipelineSlug ?? null;
    this.emitExecutionSessionEnd({
      sessionId,
      projectSlug,
      pipelineSlug,
      status,
      exitCode,
      durationMs,
    });

    // F-P7: aborted 상태이고 linked pipeline이 있으면 pipeline_end shim(cancelled) emit
    if (aborted && pipelineSlug) {
      this.emitPipelineEndCancelled(sessionId, projectSlug, pipelineSlug, active?.abortReason);
    }

    this.abortInFlight.delete(sessionId);
    // QG Major-fix: ring buffer를 terminated LRU로 이관 (getLogs가 종료 후에도 tail 반환).
    this.moveActiveToTerminated(sessionId);

    // OQ-4: pipeline_end status=completed 트리거 자동 회고
    // - aborted/failed는 회고 대상 아님
    // - linkedPipelineSlug 없으면 dogfooding 불가
    if (!aborted && exitCode === 0 && pipelineSlug && !this.disableAutoRetro) {
      this.triggerAutoRetroIfEligible(pipelineSlug, projectSlug, sessionId);
    }
  }

  /**
   * F-P7 pipeline_end shim — child가 emit하지 못한 채 강제 종료된 경우
   * cancelled 상태로 파이프라인을 마감한다. 기존 POST /api/events pipeline_end
   * case와 동일한 DB 쓰기 시퀀스를 인프로세스로 재사용.
   */
  private emitPipelineEndCancelled(
    sessionId: string,
    projectSlug: string,
    pipelineSlug: string,
    abortReason: string | null | undefined,
  ): void {
    const ts = new Date().toISOString();
    try {
      const dbInst = getDefaultDB();
      // 이미 pipeline_end가 emit되었으면(child가 종료 직전 emit) 중복 방지
      const existing = dbInst.getPipelineEvents(pipelineSlug, "pipeline_end");
      if (existing.length > 0) {
        // 상태만 cancelled로 강제 정정 (aborted가 completed 승리하지 않도록)
        dbInst.updatePipelineStatus(pipelineSlug, "cancelled", ts, undefined);
        return;
      }
      dbInst.updatePipelineStatus(pipelineSlug, "cancelled", ts, undefined);
      dbInst.insertPipelineEvent({
        pipeline_slug: pipelineSlug,
        event_type: "pipeline_end",
        status: "cancelled",
        ts,
        payload: {
          forced: true,
          session_id: sessionId,
          project_slug: projectSlug,
          reason: abortReason ?? "aborted",
        },
      });
    } catch (err) {
      console.error("[orchestrator] pipeline_end shim (cancelled) failed:", err);
    }
  }

  /**
   * OQ-4 자동 회고 트리거 — auto-retro.ts로 위임.
   * 정책 평가(WorkProfile.auto_retro_enabled ⊕ Project.auto_retro_override)와
   * spawn(/bams:retro {pipeline_slug})은 별도 모듈에서 처리하여 오케스트레이터의
   * 라이프사이클 로직과 분리한다.
   */
  private triggerAutoRetroIfEligible(
    pipelineSlug: string,
    projectSlug: string,
    triggeredBySessionId: string,
  ): void {
    const deps: AutoRetroDeps = {
      db: this.db,
      broker: this.broker,
      startExecution: (input) => this.start(input),
    };
    try {
      scheduleAutoRetro(
        {
          pipelineSlug,
          projectSlug,
          triggeredBySessionId,
        },
        deps,
        { delayMs: this.autoRetroDelayMs },
      );
    } catch (err) {
      console.error("[orchestrator] scheduleAutoRetro failed (non-fatal):", err);
    }
  }

  // ── Event emit helpers ─────────────────────────────────

  private emitExecutionSessionStart(input: {
    sessionId: string;
    projectSlug: string;
    command: string;
    pid: number;
  }): void {
    const ts = new Date().toISOString();
    this.broker.pushEvent({
      type: "execution_session_start" as import("../sse-broker.ts").SseEventType,
      pipeline_slug: `session:${input.sessionId}`,
      agent_slug: "execution",
      run_id: input.sessionId,
      ts,
      payload: {
        session_id: input.sessionId,
        project_slug: input.projectSlug,
        command: input.command,
        pid: input.pid,
      },
    });
    // TS 정본 경로 — TaskDB.insertPipelineEvent (design-infra §4-2)
    try {
      const db = getDefaultDB();
      db.insertPipelineEvent({
        pipeline_slug: `session:${input.sessionId}`,
        event_type: "execution_session_start",
        call_id: input.sessionId,
        description: input.command,
        payload: {
          session_id: input.sessionId,
          project_slug: input.projectSlug,
          command: input.command,
          pid: input.pid,
        },
        ts,
      });
    } catch (err) {
      console.error("[orchestrator] execution_session_start insertPipelineEvent failed:", err);
    }
  }

  private emitExecutionSessionEnd(input: {
    sessionId: string;
    projectSlug: string;
    pipelineSlug: string | null;
    status: "completed" | "failed" | "aborted" | "orphaned" | "cancelled";
    exitCode: number | null;
    durationMs: number;
  }): void {
    const ts = new Date().toISOString();
    const pipeline_slug = input.pipelineSlug ?? `session:${input.sessionId}`;
    this.broker.pushEvent({
      type: "execution_session_end" as import("../sse-broker.ts").SseEventType,
      pipeline_slug,
      agent_slug: "execution",
      run_id: input.sessionId,
      ts,
      payload: {
        session_id: input.sessionId,
        project_slug: input.projectSlug,
        pipeline_slug: input.pipelineSlug,
        status: input.status,
        exit_code: input.exitCode,
        duration_ms: input.durationMs,
      },
    });
    try {
      const db = getDefaultDB();
      db.insertPipelineEvent({
        pipeline_slug,
        event_type: "execution_session_end",
        call_id: input.sessionId,
        status: input.status,
        duration_ms: input.durationMs,
        payload: {
          session_id: input.sessionId,
          project_slug: input.projectSlug,
          pipeline_slug: input.pipelineSlug,
          status: input.status,
          exit_code: input.exitCode,
          duration_ms: input.durationMs,
        },
        ts,
      });
    } catch (err) {
      console.error("[orchestrator] execution_session_end insertPipelineEvent failed:", err);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * child stdout 라인에서 pipeline_slug 감지. 여러 형식 지원:
 *   - JSON: {"type":"pipeline_start", "pipeline_slug":"..."}
 *   - JSON: {"event_type":"pipeline_start", "pipeline_slug":"..."}
 *   - shell echo 형식은 정확한 JSON이 아니므로 무시.
 */
function tryDetectPipelineSlug(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    const t = obj.type ?? obj.event_type;
    if (t !== "pipeline_start") return null;
    const slug = obj.pipeline_slug;
    if (typeof slug === "string" && slug.length > 0 && !slug.startsWith("session:")) {
      return slug;
    }
    return null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────

let _instance: ExecutionOrchestrator | null = null;

export function getExecutionOrchestrator(): ExecutionOrchestrator {
  if (!_instance) _instance = new ExecutionOrchestrator();
  return _instance;
}

/** 테스트용 — 오케스트레이터 리셋. */
export function _resetOrchestratorForTest(opts?: OrchestratorOptions): ExecutionOrchestrator {
  _instance = new ExecutionOrchestrator(opts);
  return _instance;
}

