#!/usr/bin/env bun
/**
 * migrate-jsonl-to-db.ts
 *
 * 1회성 마이그레이션 스크립트: JSONL 이벤트 파일 → SQLite DB
 *
 * 기존 ~/.bams/artifacts/pipeline/ 하위의 JSONL 파일들을 읽어
 * bams.db의 pipeline_events, work_unit_events, pipelines, work_units, tasks 테이블에 기록한다.
 *
 * 중복 방지: pipeline_events.ts 컬럼으로 동일 타임스탬프+이벤트타입 조합 체크,
 *            pipelines/work_units는 upsert 패턴으로 idempotent.
 */

import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { TaskDB, WorkUnitDB } from "./index.ts";

const BAMS_ROOT = process.env.BAMS_ROOT ?? join(homedir(), ".bams");
const PIPELINE_DIR = join(BAMS_ROOT, "artifacts", "pipeline");

interface Stats {
  pipelineFiles: number;
  workunitFiles: number;
  eventsProcessed: number;
  eventsSkipped: number;
  eventsFailed: number;
  pipelinesUpserted: number;
  workUnitsUpserted: number;
  tasksCreated: number;
}

const stats: Stats = {
  pipelineFiles: 0,
  workunitFiles: 0,
  eventsProcessed: 0,
  eventsSkipped: 0,
  eventsFailed: 0,
  pipelinesUpserted: 0,
  workUnitsUpserted: 0,
  tasksCreated: 0,
};

function main() {
  console.log("=== JSONL → DB Migration ===");
  console.log(`Source: ${PIPELINE_DIR}`);

  if (!existsSync(PIPELINE_DIR)) {
    console.log("Pipeline directory does not exist. Nothing to migrate.");
    return;
  }

  const db = new TaskDB();
  const wuDb = new WorkUnitDB();

  // ── Phase 1: Work Unit JSONL 마이그레이션 ──────────────────
  console.log("\n--- Phase 1: Work Unit Events ---");
  const wuFiles = readdirSync(PIPELINE_DIR).filter((f) =>
    f.endsWith("-workunit.jsonl")
  );
  stats.workunitFiles = wuFiles.length;
  console.log(`Found ${wuFiles.length} workunit JSONL files`);

  for (const file of wuFiles) {
    const wuSlug = file.replace("-workunit.jsonl", "");
    const filePath = join(PIPELINE_DIR, file);
    const lines = readFileSync(filePath, "utf-8")
      .split("\n")
      .filter(Boolean);

    for (const line of lines) {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(line);
      } catch {
        console.warn(`  [WARN] Parse failed in ${file}: ${line.slice(0, 80)}...`);
        stats.eventsFailed++;
        continue;
      }

      const eventType = event.type as string;
      const ts = (event.ts as string) ?? new Date().toISOString();

      try {
        switch (eventType) {
          case "work_unit_start": {
            const name =
              (event.work_unit_name as string) ??
              (event.name as string) ??
              wuSlug;
            wuDb.createWorkUnit(wuSlug, name, ts);
            stats.workUnitsUpserted++;

            // WU event 기록 (중복 체크: 동일 ts + event_type)
            try {
              db.insertWorkUnitEvent({
                work_unit_slug: wuSlug,
                event_type: "work_unit_start",
                payload: event as Record<string, unknown>,
                ts,
              });
              stats.eventsProcessed++;
            } catch {
              stats.eventsSkipped++;
            }
            break;
          }

          case "work_unit_end": {
            const status = (event.status as string) ?? "completed";
            wuDb.endWorkUnit(wuSlug, status, ts);

            try {
              db.insertWorkUnitEvent({
                work_unit_slug: wuSlug,
                event_type: "work_unit_end",
                payload: { status },
                ts,
              });
              stats.eventsProcessed++;
            } catch {
              stats.eventsSkipped++;
            }
            break;
          }

          case "pipeline_linked": {
            const pipelineSlug = event.pipeline_slug as string;
            if (pipelineSlug) {
              db.upsertWorkUnit(wuSlug);
              db.linkPipelineToWorkUnit(pipelineSlug, wuSlug);

              try {
                db.insertWorkUnitEvent({
                  work_unit_slug: wuSlug,
                  event_type: "pipeline_linked",
                  pipeline_slug: pipelineSlug,
                  payload: event as Record<string, unknown>,
                  ts,
                });
                stats.eventsProcessed++;
              } catch {
                stats.eventsSkipped++;
              }
            }
            break;
          }

          default: {
            // Unknown WU event — still record
            try {
              db.insertWorkUnitEvent({
                work_unit_slug: wuSlug,
                event_type: eventType,
                payload: event as Record<string, unknown>,
                ts,
              });
              stats.eventsProcessed++;
            } catch {
              stats.eventsSkipped++;
            }
            break;
          }
        }
      } catch (err) {
        console.warn(`  [WARN] Event processing failed: ${err}`);
        stats.eventsFailed++;
      }
    }
  }

  // ── Phase 2: Pipeline JSONL 마이그레이션 ──────────────────
  console.log("\n--- Phase 2: Pipeline Events ---");
  const pipelineFiles = readdirSync(PIPELINE_DIR).filter((f) =>
    f.endsWith("-events.jsonl")
  );
  stats.pipelineFiles = pipelineFiles.length;
  console.log(`Found ${pipelineFiles.length} pipeline JSONL files`);

  for (const file of pipelineFiles) {
    const slug = file.replace("-events.jsonl", "");
    const filePath = join(PIPELINE_DIR, file);
    const lines = readFileSync(filePath, "utf-8")
      .split("\n")
      .filter(Boolean);

    let fileProcessed = 0;
    let fileSkipped = 0;

    for (const line of lines) {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(line);
      } catch {
        console.warn(`  [WARN] Parse failed in ${file}: ${line.slice(0, 80)}...`);
        stats.eventsFailed++;
        continue;
      }

      const eventType = event.type as string;
      const ts = (event.ts as string) ?? new Date().toISOString();

      try {
        // Step 1: Handle pipeline_start → upsertPipeline
        if (eventType === "pipeline_start") {
          const pType = (event.pipeline_type as string) ?? "unknown";
          const command = (event.command as string) ?? undefined;
          const args = (event.arguments as string) ?? undefined;
          const wuSlug = (event.work_unit_slug as string) ?? "";

          db.upsertPipeline({
            slug,
            type: pType,
            command,
            arguments: args,
            status: "running",
            started_at: ts,
          });
          stats.pipelinesUpserted++;

          // WU 연결
          if (wuSlug) {
            db.upsertWorkUnit(wuSlug);
            db.linkPipelineToWorkUnit(slug, wuSlug);
          }
        }

        // Step 2: Handle pipeline_end → updatePipelineStatus
        if (eventType === "pipeline_end") {
          const status = (event.status as string) ?? "completed";
          const durationMs = (event.duration_ms as number) ?? undefined;
          db.updatePipelineStatus(slug, status, ts, durationMs);
        }

        // Step 3: Insert pipeline event (all types)
        try {
          db.insertPipelineEvent({
            pipeline_slug: slug,
            event_type: eventType,
            call_id: (event.call_id as string) ?? undefined,
            agent_type: (event.agent_type as string) ?? undefined,
            department: (event.department as string) ?? undefined,
            model: (event.model as string) ?? undefined,
            step_number: (event.step_number as number) ?? undefined,
            step_name: (event.step_name as string) ?? undefined,
            phase: (event.phase as string) ?? undefined,
            status: (event.status as string) ?? undefined,
            duration_ms: (event.duration_ms as number) ?? undefined,
            description: (event.description as string) ?? undefined,
            result_summary: (event.result_summary as string) ?? undefined,
            message: (event.message as string) ?? undefined,
            is_error:
              event.is_error === true || event.is_error === "true"
                ? true
                : event.is_error === false || event.is_error === "false"
                  ? false
                  : undefined,
            payload: event as Record<string, unknown>,
            ts,
          });
          fileProcessed++;
          stats.eventsProcessed++;
        } catch {
          fileSkipped++;
          stats.eventsSkipped++;
        }

        // Step 4: agent_end → tasks 테이블 기록
        if (eventType === "agent_end") {
          const agentType = (event.agent_type as string) ?? "unknown";
          const callId = (event.call_id as string) ?? "";
          const resultSummary = (event.result_summary as string) ?? "";
          const durationMs = (event.duration_ms as number) ?? undefined;
          const isError =
            event.is_error === true || event.is_error === "true";
          const agentStatus = (event.status as string) ?? "success";

          try {
            const pipeline = db.getPipelineBySlug(slug);
            if (pipeline) {
              const taskTitle = `[${agentType}] ${resultSummary.slice(0, 120) || "작업 완료"}`;
              const taskDesc =
                resultSummary ||
                `Agent: ${agentType}, Call ID: ${callId}`;
              db.createTask({
                pipeline_id: pipeline.id,
                title: taskTitle,
                description: taskDesc,
                assignee_agent: agentType,
                label: callId || undefined,
                duration_ms: durationMs,
                summary: resultSummary || undefined,
                tags: [agentType, isError ? "error" : agentStatus],
              });
              stats.tasksCreated++;
            }
          } catch {
            // Non-fatal: task creation might fail for duplicate
          }
        }
      } catch (err) {
        console.warn(`  [WARN] Event processing failed for ${slug}: ${err}`);
        stats.eventsFailed++;
      }
    }

    if (fileProcessed > 0 || fileSkipped > 0) {
      console.log(
        `  ${slug}: ${fileProcessed} processed, ${fileSkipped} skipped`
      );
    }
  }

  // ── Results ──────────────────────────────────────────────
  console.log("\n=== Migration Complete ===");
  console.log(`Pipeline JSONL files:  ${stats.pipelineFiles}`);
  console.log(`WorkUnit JSONL files:  ${stats.workunitFiles}`);
  console.log(`Events processed:      ${stats.eventsProcessed}`);
  console.log(`Events skipped (dup):  ${stats.eventsSkipped}`);
  console.log(`Events failed (parse): ${stats.eventsFailed}`);
  console.log(`Pipelines upserted:    ${stats.pipelinesUpserted}`);
  console.log(`Work units upserted:   ${stats.workUnitsUpserted}`);
  console.log(`Tasks created:         ${stats.tasksCreated}`);

  db.close();
  wuDb.close();
}

main();
