/**
 * orchestrator/command-validator.ts
 *
 * NF-SEC-4 — Command Injection 방어.
 *
 * spec.md §1-7 Argument Whitelist:
 *   - 허용 명령 정규식: ^/bams:[a-z][a-z0-9-]{1,20}$
 *   - 인자는 shell 없이 배열로 개별 전달
 *   - 인자 검증: [a-zA-Z0-9_\-./=@:가-힣ㄱ-ㅎ]{0,200}
 *     shell metachar(`;`, `|`, `&`, `` ` ``, `$`, `>`, `<`, 개행) → UNSAFE_ARGUMENT
 *
 * design-be §4-3 결정:
 *   - shell-quote escape 하지 않음 — shell:false 전제이므로 리터럴 그대로 arg[]에 push.
 *   - `SpawnRequest.cmd`는 반드시 string[] — 인터페이스 자체에서 raw string cmd를 차단.
 */

/**
 * Whitelist 정규식 — spec §1-7 그대로.
 * "/bams:" prefix + lowercase 시작 + 2~21자 lower/digit/dash.
 */
export const COMMAND_WHITELIST_PATTERN = /^\/bams:[a-z][a-z0-9-]{1,20}$/;

/**
 * 인자 최대 길이 (spec §1-7: `{1,200}`, design-be §4-3: 512자).
 * 두 규약 중 보수적 값(spec) 채택 — Korean/영문 조합 아이디에 여유 있음.
 */
export const ARG_MAX_LEN = 200;
export const ARG_MAX_COUNT = 32;

/**
 * spec §1-7 인자 허용 문자 집합:
 *   `[a-zA-Z0-9_\-./=@:가-힣ㄱ-ㅎ]` — 알파뉴메릭 + 경로 문자 + 한글.
 * 명시적으로 화이트리스트 방식(블랙리스트 아님).
 */
const ARG_ALLOWED_PATTERN = /^[a-zA-Z0-9_\-./=@:가-힣ㄱ-ㅎ]*$/;

/**
 * shell metachar / control char — 발견 시 즉시 거부(추가 방어선).
 * ARG_ALLOWED_PATTERN이 이미 이들을 배제하지만, 검출 문자를 응답에 실어 사용자 힌트로 활용.
 */
const SHELL_METACHAR_PATTERN = /[;|&`$><\n\r\t\0"'\\]/;

export type CommandValidationResult =
  | { ok: true; command: string }
  | { ok: false; code: "COMMAND_NOT_ALLOWED"; detail: string };

export type ArgValidationResult =
  | { ok: true; argv: string[] }
  | { ok: false; code: "UNSAFE_ARGUMENT" | "ARGUMENT_TOO_LONG" | "TOO_MANY_ARGUMENTS"; detail: string };

/**
 * `/bams:*` 화이트리스트 검증.
 */
export function validateCommand(raw: unknown): CommandValidationResult {
  if (typeof raw !== "string" || raw.length === 0) {
    return { ok: false, code: "COMMAND_NOT_ALLOWED", detail: "command must be a non-empty string" };
  }
  if (!COMMAND_WHITELIST_PATTERN.test(raw)) {
    return {
      ok: false,
      code: "COMMAND_NOT_ALLOWED",
      detail: `command must match ${COMMAND_WHITELIST_PATTERN.source}`,
    };
  }
  return { ok: true, command: raw };
}

/**
 * argv 배열 검증. spec §1-7 규약:
 *   - 각 요소는 string
 *   - 요소당 길이 1~200
 *   - ARG_ALLOWED_PATTERN 준수
 *   - shell metachar 발견 시 UNSAFE_ARGUMENT
 *   - 총 개수 상한 ARG_MAX_COUNT
 *
 * 빈 argv([])는 허용 — `/bams:status` 처럼 인자 없는 커맨드 지원.
 */
export function validateArgv(raw: unknown): ArgValidationResult {
  if (raw === undefined || raw === null) {
    return { ok: true, argv: [] };
  }
  if (!Array.isArray(raw)) {
    return { ok: false, code: "UNSAFE_ARGUMENT", detail: "argv must be an array" };
  }
  if (raw.length > ARG_MAX_COUNT) {
    return {
      ok: false,
      code: "TOO_MANY_ARGUMENTS",
      detail: `argv length ${raw.length} exceeds max ${ARG_MAX_COUNT}`,
    };
  }
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const el = raw[i];
    if (typeof el !== "string") {
      return {
        ok: false,
        code: "UNSAFE_ARGUMENT",
        detail: `argv[${i}] must be string, got ${typeof el}`,
      };
    }
    if (el.length === 0) {
      return { ok: false, code: "UNSAFE_ARGUMENT", detail: `argv[${i}] must not be empty` };
    }
    if (el.length > ARG_MAX_LEN) {
      return {
        ok: false,
        code: "ARGUMENT_TOO_LONG",
        detail: `argv[${i}] length ${el.length} exceeds max ${ARG_MAX_LEN}`,
      };
    }
    // Fast-fail: shell metachar 우선 검출 (사용자 힌트 응답)
    const metaMatch = SHELL_METACHAR_PATTERN.exec(el);
    if (metaMatch) {
      return {
        ok: false,
        code: "UNSAFE_ARGUMENT",
        detail: `argv[${i}] contains disallowed character '${metaMatch[0]}'`,
      };
    }
    if (!ARG_ALLOWED_PATTERN.test(el)) {
      return {
        ok: false,
        code: "UNSAFE_ARGUMENT",
        detail: `argv[${i}] contains disallowed character (allowed: [a-zA-Z0-9_\\-./=@:가-힣ㄱ-ㅎ])`,
      };
    }
    out.push(el);
  }
  return { ok: true, argv: out };
}
