/**
 * stores/prompt-sanitizer.ts
 *
 * TASK-118 스텁 — TASK-119에서 orchestrator/PromptSanitizer가 완성되면
 * `installPromptSanitizer(impl)`을 통해 실제 구현이 교체된다.
 *
 * 순환 import 방지:
 *   - 이 파일은 orchestrator/*를 import하지 않는다.
 *   - orchestrator/PromptSanitizer.ts는 완성 시 이 파일의 install*()를 호출한다.
 *   - stores/route 계층은 오직 scanPromptContent(text)만 사용한다.
 */

export type PromptScanSeverity = "hard" | "soft";

export interface PromptScanMarker {
  severity: PromptScanSeverity;
  rule: string;
  line?: number;
  snippet: string;
}

export type PromptScanResult = {
  ok: "clean" | "soft_flagged" | "hard_blocked";
  markers: PromptScanMarker[];
  /** soft_flagged일 때 배너 부착본. clean이면 undefined. */
  sanitized_body?: string;
};

export interface PromptSanitizerImpl {
  scan(text: string): PromptScanResult;
}

// TASK-118 스텁: pass-through. 저장 시 warnings 없이 clean.
const NOOP_IMPL: PromptSanitizerImpl = {
  scan: (_text: string): PromptScanResult => ({ ok: "clean", markers: [] }),
};

let _impl: PromptSanitizerImpl = NOOP_IMPL;

/**
 * TASK-119(orchestrator/PromptSanitizer)가 부팅 시 호출하여 실제 구현을 주입한다.
 * 여러 번 호출되면 가장 마지막 구현이 유효하다.
 */
export function installPromptSanitizer(impl: PromptSanitizerImpl): void {
  _impl = impl;
}

/** 현재 등록된 sanitizer를 사용해 텍스트를 스캔한다. */
export function scanPromptContent(text: string): PromptScanResult {
  return _impl.scan(text);
}

/** 테스트용 — 스텁으로 초기화. */
export function _resetPromptSanitizerForTest(): void {
  _impl = NOOP_IMPL;
}
