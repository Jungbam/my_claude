/**
 * bams-db/backfill-projects.ts
 *
 * v3 마이그레이션 직후 project_slug가 NULL인 기존 Work Unit/Pipeline을
 * 특정 project로 backfill하는 관리자 액션 CLI (design-infra.md §1-4, AC-6 후속).
 *
 * WU→project 매핑을 backfill하면 해당 WU 소속 파이프라인도 함께 backfill된다
 * (TaskDB.backfillProjectSlugForWorkUnit()이 WU→Pipeline 순으로 cascade).
 *
 * 사용법:
 *   단건:   bun run plugins/bams-plugin/tools/bams-db/backfill-projects.ts \
 *             --wu=<work_unit_slug> --project=<project_slug> [--db=<path>] [--dry-run]
 *
 *   배치:   bun run plugins/bams-plugin/tools/bams-db/backfill-projects.ts \
 *             --mapping=<json 파일 경로> [--db=<path>] [--dry-run]
 *           mapping JSON 형식: { "work_unit_slug": "project_slug", ... }
 *
 * 멱등: project_slug IS NULL 가드로 이미 backfill된 행은 건너뛴다 — 재실행 안전.
 */

import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { TaskDB } from "./index.ts";

const DEFAULT_DB_PATH = join(homedir(), ".claude", "plugins", "marketplaces", "my-claude", "bams.db");

function loadMapping(args: string[]): Record<string, string> {
  const wu = args.find((a) => a.startsWith("--wu="))?.replace("--wu=", "");
  const project = args.find((a) => a.startsWith("--project="))?.replace("--project=", "");
  const mappingPath = args.find((a) => a.startsWith("--mapping="))?.replace("--mapping=", "");

  if (mappingPath) {
    if (!existsSync(mappingPath)) {
      console.error(`오류: mapping 파일이 없습니다: ${mappingPath}`);
      process.exit(1);
    }
    const raw = JSON.parse(readFileSync(mappingPath, "utf-8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      console.error("오류: mapping 파일은 { work_unit_slug: project_slug, ... } 형태의 객체여야 합니다.");
      process.exit(1);
    }
    return raw as Record<string, string>;
  }

  if (wu && project) {
    return { [wu]: project };
  }

  console.error("사용법:");
  console.error("  bun run backfill-projects.ts --wu=<work_unit_slug> --project=<project_slug> [--db=<path>] [--dry-run]");
  console.error("  bun run backfill-projects.ts --mapping=<json 경로> [--db=<path>] [--dry-run]");
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const dbPath = args.find((a) => a.startsWith("--db="))?.replace("--db=", "") ?? DEFAULT_DB_PATH;
  const dryRun = args.includes("--dry-run");

  const mapping = loadMapping(args);

  console.log("=== project_slug backfill ===");
  console.log(`DB 경로: ${dbPath}`);
  console.log(`모드: ${dryRun ? "dry-run (계획만 출력)" : "실적용"}`);
  console.log(`대상 WU→Project 매핑: ${Object.keys(mapping).length}건`);
  console.log("");

  const db = new TaskDB(dbPath);

  let totalWuUpdated = 0;
  let totalPipelinesUpdated = 0;
  let totalPipelinesPlanned = 0;
  let notFound = 0;

  for (const [wuSlug, projectSlug] of Object.entries(mapping)) {
    const project = db.getProjectBySlug(projectSlug);
    if (!project) {
      console.warn(`  ⚠ project '${projectSlug}' 없음 — '${wuSlug}' 건너뜀 (먼저 project를 등록하세요)`);
      notFound++;
      continue;
    }

    if (dryRun) {
      // dry-run: 실제 UPDATE 없이 대상 건수만 미리 조회
      const preview = db.getPipelinesByWorkUnitSlugPendingBackfill(wuSlug);
      console.log(`  [dry-run] '${wuSlug}' → '${projectSlug}': pipelines ${preview.length}건 backfill 예정`);
      totalPipelinesPlanned += preview.length;
      continue;
    }

    const result = db.backfillProjectSlugForWorkUnit(wuSlug, projectSlug);
    if (!result.work_unit_updated && result.pipelines_updated === 0) {
      console.log(`  - '${wuSlug}' → '${projectSlug}': 변경 없음 (WU 없음 또는 이미 backfill됨)`);
    } else {
      console.log(
        `  ✓ '${wuSlug}' → '${projectSlug}': work_unit ${result.work_unit_updated ? "갱신됨" : "변경없음"}, pipelines ${result.pipelines_updated}건 갱신`
      );
    }
    totalWuUpdated += result.work_unit_updated ? 1 : 0;
    totalPipelinesUpdated += result.pipelines_updated;
  }

  console.log("");
  console.log("=== 완료 ===");
  if (dryRun) {
    console.log(`(dry-run) backfill 예정 pipelines: ${totalPipelinesPlanned}건, project 미존재로 건너뜀: ${notFound}건`);
  } else {
    console.log(`work_units 갱신: ${totalWuUpdated}건`);
    console.log(`pipelines 갱신: ${totalPipelinesUpdated}건`);
    console.log(`project 미존재로 건너뜀: ${notFound}건`);
  }

  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
