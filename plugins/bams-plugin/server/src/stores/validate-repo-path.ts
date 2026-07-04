/**
 * stores/validate-repo-path.ts
 *
 * spec §1-2 validateRepoPath 규약 구현.
 *
 * 요구사항:
 * 1. path.isAbsolute(input) 검사
 * 2. realpath(input) — symlink 정규화
 * 3. HOME = process.env.HOME (반드시 존재)
 * 4. realpath.startsWith(HOME + sep) 또는 realpath === HOME 검사
 * 5. 심볼릭 링크 escape 방지 — realpath 결과가 HOME 밖이면 SYMLINK_ESCAPE
 * 6. 실패 시 reason: OUT_OF_HOME | NOT_ABSOLUTE | SYMLINK_ESCAPE | NOT_A_DIRECTORY
 *
 * OUT_OF_HOME vs SYMLINK_ESCAPE 구분 규약:
 * - 입력 문자열이 $HOME 밖 → OUT_OF_HOME (raw path가 이미 밖)
 * - 입력은 $HOME 안이지만 realpath 후 밖 → SYMLINK_ESCAPE (링크로 탈출)
 */

import { realpathSync, statSync } from "fs";
import { isAbsolute, sep } from "path";

export type ValidateRepoPathResult =
  | { ok: true; absolute: string }
  | {
      ok: false;
      reason: "NOT_ABSOLUTE" | "NOT_A_DIRECTORY" | "OUT_OF_HOME" | "SYMLINK_ESCAPE";
    };

/**
 * HOME 경로를 realpath로 정규화하여 캐싱한다.
 * (매 요청마다 realpath(HOME)를 다시 호출할 필요는 없다 — 프로세스 라이프사이클 내 불변.)
 */
let _homeRealCache: string | null = null;
function getHomeReal(): string | null {
  if (_homeRealCache) return _homeRealCache;
  const HOME = process.env.HOME;
  if (!HOME || !isAbsolute(HOME)) return null;
  try {
    _homeRealCache = realpathSync(HOME);
  } catch {
    _homeRealCache = HOME;
  }
  return _homeRealCache;
}

/** 테스트용 — HOME 캐시 리셋. */
export function _resetHomeCacheForTest(): void {
  _homeRealCache = null;
}

function isUnderHome(p: string, homeReal: string): boolean {
  return p === homeReal || p.startsWith(homeReal + sep);
}

export function validateRepoPath(input: unknown): ValidateRepoPathResult {
  if (typeof input !== "string" || input.length === 0) {
    return { ok: false, reason: "NOT_ABSOLUTE" };
  }
  if (!isAbsolute(input)) {
    return { ok: false, reason: "NOT_ABSOLUTE" };
  }

  const homeReal = getHomeReal();
  if (!homeReal) {
    // HOME 부재 — server boot invariant 위반. 방어적으로 OUT_OF_HOME 취급.
    return { ok: false, reason: "OUT_OF_HOME" };
  }

  const rawClaimsUnder = isUnderHome(input, homeReal);

  let absolute: string;
  try {
    absolute = realpathSync(input);
  } catch (err: unknown) {
    const code = (err as { code?: string } | null)?.code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      return { ok: false, reason: "NOT_A_DIRECTORY" };
    }
    // 권한 등 기타 오류 — 방어적으로 처리
    return {
      ok: false,
      reason: rawClaimsUnder ? "SYMLINK_ESCAPE" : "OUT_OF_HOME",
    };
  }

  try {
    const st = statSync(absolute);
    if (!st.isDirectory()) return { ok: false, reason: "NOT_A_DIRECTORY" };
  } catch {
    return { ok: false, reason: "NOT_A_DIRECTORY" };
  }

  if (!isUnderHome(absolute, homeReal)) {
    // input이 HOME 안이었는데 realpath는 밖 → symlink escape
    // input이 HOME 밖이었다면 → out of home
    return {
      ok: false,
      reason: rawClaimsUnder ? "SYMLINK_ESCAPE" : "OUT_OF_HOME",
    };
  }

  return { ok: true, absolute };
}
