/**
 * stores/db.ts
 *
 * v3 신규 테이블(projects/work_profiles/work_profile_memories/project_rules/
 * execution_sessions)을 위한 shared bun:sqlite Database 헬퍼.
 *
 * DB 경로 규약:
 *   - BAMS_DB 환경변수가 있으면 그 경로 사용 (test/isolation)
 *   - 없으면 실 프로덕션 경로 사용 (getDefaultDB()와 동일 파일)
 *
 * WAL 모드 덕분에 TaskDB(getDefaultDB)의 Database 인스턴스와 별개 커넥션으로
 * 같은 파일을 안전하게 공유할 수 있다.
 *
 * initSchema 순서:
 *   1. work_units, pipelines (base — v3 컬럼 ALTER 대상)
 *   2. applyV3Schema (신규 5테이블 + project_slug 컬럼)
 *   3. seedPresetWorkProfiles (프리셋 3종, 멱등)
 */

import { Database } from "bun:sqlite";
import { homedir } from "os";
import { join } from "path";
import {
  WORK_UNITS_TABLE_DDL,
  PIPELINES_TABLE_DDL,
} from "../../../tools/bams-db/schema.ts";
import {
  applyV3Schema,
  seedPresetWorkProfiles,
} from "../../../tools/bams-db/index.ts";

const DEFAULT_DB_PATH = join(
  homedir(),
  ".claude",
  "plugins",
  "marketplaces",
  "my-claude",
  "bams.db",
);

function resolveDbPath(): string {
  return process.env.BAMS_DB ?? DEFAULT_DB_PATH;
}

let _sharedDb: Database | null = null;

export function getStoresDb(): Database {
  if (_sharedDb) return _sharedDb;

  const dbPath = resolveDbPath();
  const dir = dbPath.substring(0, dbPath.lastIndexOf("/"));
  if (dir) {
    const fs = require("fs");
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA synchronous = NORMAL;");

  // 신규 스크래치 DB에서도 v3 ALTER TABLE이 성공하도록 base 테이블부터 생성.
  db.exec(WORK_UNITS_TABLE_DDL);
  db.exec(PIPELINES_TABLE_DDL);

  applyV3Schema(db);
  seedPresetWorkProfiles(db);

  _sharedDb = db;
  return db;
}

/** 테스트용 — 커넥션 리셋. */
export function _resetStoresDbForTest(): void {
  if (_sharedDb) {
    try {
      _sharedDb.close();
    } catch {
      /* ignore */
    }
  }
  _sharedDb = null;
}
