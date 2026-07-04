/**
 * orchestrator/auto-retro.ts
 *
 * OQ-4 자동 회고 트리거 (opt-out) — spec §1-4, PRD F-P7 후속.
 *
 * 흐름:
 *   1. 세션 exit 감지 시 orchestrator.onExit()에서 scheduleAutoRetro() 호출
 *      (조건: exit_code=0, aborted=false, linkedPipelineSlug 존재)
 *   2. delayMs(기본 30s) 지연 후 유효 정책 재평가
 *      - project.auto_retro_override !== 'inherit' → override 값 사용
 *      - 아니면 workProfile.auto_retro_enabled 사용
 *   3. 활성화 상태이면 새 ExecutionSession spawn — `/bams:retro {pipeline_slug}`
 *   4. spawn 실패(TOO_MANY_ACTIVE_SESSIONS 등)해도 원 세션 상태에 영향 없음
 *
 * 격리 원칙:
 *   - ExecutionOrchestrator 라이프사이클과 분리 (테스트 단순화)
 *   - 실패해도 exception이 상위로 전파되지 않음 (fire-and-forget)
 *   - 정책 평가는 지연 시점에 수행 (사용자가 대기 중 override 변경 가능)
 */

import type { Database } from "bun:sqlite";
import type { SseBroker } from "../sse-broker.ts";
import type {
  StartExecutionInput,
  StartExecutionResult,
  StartExecutionErrorResult,
} from "./execution-orchestrator.ts";

// ─────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────

export interface AutoRetroTrigger {
  pipelineSlug: string;
  projectSlug: string;
  triggeredBySessionId: string;
}

export interface AutoRetroDeps {
  db: Database;
  broker: SseBroker;
  /**
   * ExecutionOrchestrator.start bound method — auto-retro는 spawn을 위해 정상 진입점
   * 재사용. 동시 상한/preflight/sanitizer 모두 재적용된다.
   */
  startExecution: (
    input: StartExecutionInput,
  ) => Promise<StartExecutionResult | StartExecutionErrorResult>;
}

export interface AutoRetroOptions {
  /** 지연 시간(ms). 기본 30_000 = spec §1-4. */
  delayMs?: number;
}

export interface AutoRetroScheduled {
  scheduled: boolean;
  reason: string;
  timer?: ReturnType<typeof setTimeout>;
}

// ─────────────────────────────────────────────────────────────
// 정책 평가
// ─────────────────────────────────────────────────────────────

interface ProjectPolicyRow {
  slug: string;
  work_profile_slug: string;
  auto_retro_override: string; // 'inherit' | 'on' | 'off'
}

interface WorkProfilePolicyRow {
  slug: string;
  auto_retro_enabled: number; // 0/1
}

/**
 * 유효 정책 계산:
 *   Project.override !== 'inherit' ? (override === 'on') : !!workProfile.auto_retro_enabled
 *
 * 반환 { enabled, reason }. reason은 로그/이벤트 payload용.
 */
export function evaluateAutoRetroPolicy(
  db: Database,
  projectSlug: string,
): { enabled: boolean; reason: string } {
  const project = db
    .prepare<ProjectPolicyRow>(
      `SELECT slug, work_profile_slug, auto_retro_override
       FROM projects
       WHERE slug = ?`,
    )
    .get(projectSlug);
  if (!project) {
    return { enabled: false, reason: `project_not_found:${projectSlug}` };
  }
  if (project.auto_retro_override === "on") {
    return { enabled: true, reason: "project_override_on" };
  }
  if (project.auto_retro_override === "off") {
    return { enabled: false, reason: "project_override_off" };
  }
  // inherit → workprofile
  const wp = db
    .prepare<WorkProfilePolicyRow>(
      `SELECT slug, auto_retro_enabled FROM work_profiles WHERE slug = ?`,
    )
    .get(project.work_profile_slug);
  if (!wp) {
    return { enabled: false, reason: `work_profile_not_found:${project.work_profile_slug}` };
  }
  return {
    enabled: !!wp.auto_retro_enabled,
    reason: wp.auto_retro_enabled ? "workprofile_enabled" : "workprofile_disabled",
  };
}

// ─────────────────────────────────────────────────────────────
// 스케줄러
// ─────────────────────────────────────────────────────────────

/**
 * 자동 회고 스폰을 delayMs 후 예약한다. 정책 평가는 delay 만료 시점에 수행
 * (spawn 대기 중 사용자가 override 변경 가능).
 *
 * 반환값 { scheduled: true, timer }를 통해 테스트에서 clearTimeout으로 취소 가능.
 * scheduled=false는 파이프라인 slug가 이미 회고 대상이 아닌 경우 등.
 */
export function scheduleAutoRetro(
  trigger: AutoRetroTrigger,
  deps: AutoRetroDeps,
  opts: AutoRetroOptions = {},
): AutoRetroScheduled {
  const delayMs = opts.delayMs ?? 30_000;

  // pipeline_slug이 이미 retro_* 이면 재귀 회고 방지
  if (trigger.pipelineSlug.startsWith("retro_")) {
    return { scheduled: false, reason: "recursive_retro_blocked" };
  }

  // 사전 정책 조회 — off 확정이면 timer 자체를 걸지 않아 자원 절약
  const preview = evaluateAutoRetroPolicy(deps.db, trigger.projectSlug);
  if (!preview.enabled) {
    return { scheduled: false, reason: preview.reason };
  }

  const timer = setTimeout(() => {
    void runAutoRetro(trigger, deps);
  }, delayMs);
  return { scheduled: true, reason: preview.reason, timer };
}

async function runAutoRetro(
  trigger: AutoRetroTrigger,
  deps: AutoRetroDeps,
): Promise<void> {
  try {
    // 지연 만료 시점에 정책 재평가
    const policy = evaluateAutoRetroPolicy(deps.db, trigger.projectSlug);
    if (!policy.enabled) {
      console.log(
        `[auto-retro] skipped (policy=${policy.reason}) pipeline=${trigger.pipelineSlug}`,
      );
      return;
    }

    // 브로커 안내 이벤트 (broker 화이트리스트 밖 타입이지만 payload는 DB로 관찰 가능)
    // 여기서는 DB 이벤트만 emit — broker.pushEvent SseEventType 확장은 별도 PR.
    try {
      const { getDefaultDB } = await import("../../../tools/bams-db/index.ts");
      getDefaultDB().insertPipelineEvent({
        pipeline_slug: trigger.pipelineSlug,
        event_type: "auto_retro_triggered",
        call_id: trigger.triggeredBySessionId,
        description: `auto-retro spawn queued for ${trigger.pipelineSlug}`,
        payload: {
          pipeline_slug: trigger.pipelineSlug,
          project_slug: trigger.projectSlug,
          triggered_by_session_id: trigger.triggeredBySessionId,
          policy_reason: policy.reason,
        },
      });
    } catch (err) {
      console.error("[auto-retro] insert audit event failed (non-fatal):", err);
    }

    // 실제 spawn
    const result = await deps.startExecution({
      project_slug: trigger.projectSlug,
      command: "/bams:retro",
      argv: [trigger.pipelineSlug],
      // 자동 회고는 uncommitted 검사 프롬프트를 우회 — spec §OQ-5는 사용자 명시 실행에만 적용
      uncommitted_action: "proceed",
    });
    if ("error" in result) {
      console.warn(
        `[auto-retro] spawn failed (${result.error.code}): ${result.error.detail} pipeline=${trigger.pipelineSlug}`,
      );
      return;
    }
    console.log(
      `[auto-retro] spawned session=${(result.session as { id: string }).id} pipeline=${trigger.pipelineSlug}`,
    );
  } catch (err) {
    console.error(
      "[auto-retro] runAutoRetro unexpected error (fire-and-forget):",
      err,
    );
  }
}
