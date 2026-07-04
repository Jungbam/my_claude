/**
 * bams-db/migrate-v3.ts
 *
 * bams-db 스키마 v3 마이그레이션 CLI (plan_viz웹개발플랫폼 F-P10)
 *
 * v3 신규 테이블(projects/work_profiles/work_profile_memories/project_rules/
 * execution_sessions) + pipelines.project_slug/work_units.project_slug 컬럼은
 * `TaskDB.initSchema()`가 서버 부팅마다 멱등하게 적용하므로(applyV3Schema()),
 * 신규 설치는 이 스크립트 없이도 자동으로 v3 스키마를 갖춘다.
 *
 * 본 스크립트는 "기존 프로덕션 DB(실데이터 보유)에 대한 안전장치" 목적이다:
 * 백업 → 사전 카운트 스냅샷 → (dry-run이면 종료) → 단일 트랜잭션 DDL 적용 →
 * 사후 카운트 검증(무손실 확인) → 프리셋 시드 → 요약 출력.
 *
 * 사용법:
 *   bun run plugins/bams-plugin/tools/bams-db/migrate-v3.ts \
 *     [--db=<path>] [--dry-run] [--backup-dir=<path>]
 *
 * 참조: .crew/artifacts/design/plan_viz웹개발플랫폼-design-infra.md §1-3
 */

import { existsSync, mkdirSync, copyFileSync, writeFileSync, chmodSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import { Database } from "bun:sqlite";
import { applyV3Schema, seedPresetWorkProfiles } from "./index.ts";

const DEFAULT_DB_PATH = join(homedir(), ".claude", "plugins", "marketplaces", "my-claude", "bams.db");

/** 무손실 검증 대상 테이블 (기존 8개 — 신규 테이블은 당연히 0에서 시작하므로 제외) */
const VERIFY_TABLES = [
  "work_units",
  "pipelines",
  "tasks",
  "task_events",
  "run_logs",
  "pipeline_events",
  "work_unit_events",
  "hr_reports",
] as const;

function nowStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function tableExists(db: Database, name: string): boolean {
  const row = db
    .prepare<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(name);
  return !!row;
}

function snapshotCounts(db: Database): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const t of VERIFY_TABLES) {
    if (!tableExists(db, t)) {
      counts[t] = 0;
      continue;
    }
    const row = db.prepare<{ c: number }>(`SELECT COUNT(*) as c FROM ${t}`).get();
    counts[t] = row?.c ?? 0;
  }
  return counts;
}

async function main() {
  const args = process.argv.slice(2);
  const dbPath = args.find((a) => a.startsWith("--db="))?.replace("--db=", "") ?? DEFAULT_DB_PATH;
  const dryRun = args.includes("--dry-run");
  const backupDirArg = args.find((a) => a.startsWith("--backup-dir="))?.replace("--backup-dir=", "");
  const backupDir = backupDirArg ?? dirname(dbPath);

  console.log("=== bams-db 스키마 v3 마이그레이션 ===");
  console.log(`DB 경로: ${dbPath}`);
  console.log(`모드: ${dryRun ? "dry-run (계획만 출력)" : "실적용"}`);
  console.log("");

  if (!existsSync(dbPath)) {
    console.error(`오류: DB 파일이 없습니다: ${dbPath}`);
    console.error("신규 설치는 마이그레이션 없이 TaskDB 생성만으로 v3 스키마가 자동 적용됩니다.");
    process.exit(1);
  }

  // ── Step 1: 백업 자동화 (R-4) — dry-run이 아니면 가장 먼저 실행 ──
  const stamp = nowStamp();
  let backupPath: string | null = null;
  if (!dryRun) {
    const bakDir = join(backupDir, `bams.db.bak-${stamp}`);
    try {
      mkdirSync(bakDir, { recursive: true, mode: 0o700 });
      for (const suffix of ["", "-wal", "-shm"]) {
        const src = `${dbPath}${suffix}`;
        if (existsSync(src)) {
          const dest = join(bakDir, `bams.db${suffix}`);
          copyFileSync(src, dest);
          chmodSync(dest, 0o600);
        }
      }
      backupPath = bakDir;
      console.log(`[1/6] 백업 완료: ${bakDir}`);
    } catch (err) {
      console.error(`[1/6] 백업 실패 — 마이그레이션을 중단합니다: ${err}`);
      process.exit(1);
    }
  } else {
    console.log("[1/6] dry-run — 백업 건너뜀");
  }

  const db = new Database(dbPath, { readwrite: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  // ── Step 2: 사전 카운트 스냅샷 ──
  const preCounts = snapshotCounts(db);
  console.log("[2/6] 사전 카운트 스냅샷:");
  for (const [t, c] of Object.entries(preCounts)) console.log(`      ${t}: ${c}`);

  if (backupPath) {
    const countsPath = join(backupPath, "pre-migration-counts.json");
    writeFileSync(countsPath, JSON.stringify(preCounts, null, 2), { mode: 0o600 });
    console.log(`      → 저장: ${countsPath}`);
  }

  // ── Step 3: dry-run이면 여기서 종료 ──
  if (dryRun) {
    console.log("");
    console.log("[3/6] dry-run — 아래 DDL을 적용할 예정입니다 (실제 실행 없음):");
    console.log("      - projects / work_profiles / work_profile_memories / project_rules / execution_sessions 테이블 생성");
    console.log("      - pipelines.project_slug / work_units.project_slug 컬럼 추가 (ensureColumn, 이미 있으면 스킵)");
    console.log("      - work_profiles 프리셋 3종 시드 (nextjs-fullstack / python-api / go-service) — 테이블이 비어있을 때만");
    console.log("");
    console.log("dry-run 완료. 실제 적용하려면 --dry-run 없이 재실행하세요.");
    db.close();
    return;
  }

  // ── Step 4: 단일 트랜잭션으로 DDL 적용 ──
  console.log("");
  console.log("[4/6] DDL 적용 시작 (단일 트랜잭션)...");
  try {
    db.exec("BEGIN IMMEDIATE");
    applyV3Schema(db);
    db.exec("COMMIT");
    console.log("      ✓ 트랜잭션 커밋 완료");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* 트랜잭션이 이미 종료된 경우 무시 */
    }
    console.error(`      ✗ DDL 적용 실패 — ROLLBACK 완료: ${err}`);
    if (backupPath) {
      console.error(`      복구 방법: 백업 파일(${backupPath})을 ${dbPath}로 복사 후 재시도하세요.`);
    }
    db.close();
    process.exit(1);
  }

  // ── Step 5: 사후 카운트 검증 (AC-6) ──
  const postCounts = snapshotCounts(db);
  console.log("");
  console.log("[5/6] 사후 카운트 검증:");
  let mismatch = false;
  for (const t of VERIFY_TABLES) {
    const pre = preCounts[t];
    const post = postCounts[t];
    const ok = pre === post;
    if (!ok) mismatch = true;
    console.log(`      ${t}: ${pre} → ${post} ${ok ? "OK" : "*** MISMATCH ***"}`);
  }
  if (mismatch) {
    console.error("");
    console.error("*** 무손실 검증 실패 — 사전/사후 카운트가 일치하지 않습니다. ***");
    if (backupPath) {
      console.error(`복구 방법: 백업 파일(${backupPath})을 ${dbPath}로 복사하세요.`);
    }
    db.close();
    process.exit(1);
  }

  // NULL 허용 확인 (design-infra.md §1-5)
  const nullCheck = db
    .prepare<{ c: number }>("SELECT COUNT(*) as c FROM pipelines WHERE project_slug IS NOT NULL")
    .get();
  console.log(`      pipelines.project_slug IS NOT NULL 개수 (기대값 0): ${nullCheck?.c ?? 0}`);

  // ── Step 6: 프리셋 시드 (멱등) ──
  const seeded = seedPresetWorkProfiles(db);
  console.log("");
  console.log(`[6/6] 프리셋 시드: ${seeded > 0 ? `${seeded}건 삽입` : "스킵 (work_profiles가 이미 존재함)"}`);

  db.close();

  // ── 완료 요약 ──
  console.log("");
  console.log("=== 마이그레이션 완료 ===");
  console.log(`백업 경로: ${backupPath}`);
  console.log("적용된 테이블: projects, work_profiles, work_profile_memories, project_rules, execution_sessions");
  console.log("적용된 컬럼: pipelines.project_slug, work_units.project_slug");
  console.log(`프리셋 시드: ${seeded > 0 ? "적용됨" : "스킵됨"}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
