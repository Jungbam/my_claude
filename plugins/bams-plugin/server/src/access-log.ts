/**
 * bams-plugin/server/src/access-log.ts
 *
 * NF-OBS-2 — bams-server API 요청 액세스 로그.
 *
 * 모든 요청(method, path, status, latency_ms, ts)을
 * `${BAMS_ROOT}/artifacts/bams-viz-web.jsonl`에 append한다.
 * 응답 경로를 블로킹하지 않도록 fire-and-forget(비동기)로 기록하며,
 * 기록 실패는 non-fatal(요청 처리에 영향 없음)로 처리한다.
 *
 * 참고: .crew/gotchas.md — `~/.bams/artifacts/` 하위 신규 파일은 0600 권한 강제.
 */

import { appendFile, mkdir, chmod } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

// BAMS_ROOT — server/test/api-endpoints.test.ts 등 기존 코드와 동일한 override 관례
const BAMS_ROOT = process.env.BAMS_ROOT ?? join(homedir(), ".bams");
const ACCESS_LOG_DIR = join(BAMS_ROOT, "artifacts");
const ACCESS_LOG_PATH = join(ACCESS_LOG_DIR, "bams-viz-web.jsonl");

export interface AccessLogEntry {
  ts: string;
  method: string;
  path: string;
  status: number;
  latency_ms: number;
}

let dirEnsured = false;

async function ensureDir(): Promise<void> {
  if (dirEnsured) return;
  await mkdir(ACCESS_LOG_DIR, { recursive: true });
  dirEnsured = true;
}

/**
 * 액세스 로그 1건을 비동기로 append한다.
 * fire-and-forget — 호출자는 완료를 기다리지 않는다 (응답 경로 논블로킹).
 */
export function logAccess(entry: AccessLogEntry): void {
  void (async () => {
    try {
      await ensureDir();
      await appendFile(ACCESS_LOG_PATH, JSON.stringify(entry) + "\n", { mode: 0o600 });
      // umask에 따라 실제 생성 권한이 0600보다 넓어질 수 있으므로 명시적으로 재보정한다.
      await chmod(ACCESS_LOG_PATH, 0o600);
    } catch (err) {
      console.error("[bams-server] access log append failed (non-fatal):", err);
    }
  })();
}
