/**
 * orchestrator/prompt-sanitizer-impl.ts
 *
 * NF-SEC-5 — Prompt Injection Sanitizer (실구현).
 *
 * design-be §7-2 Detection Rules (5 hard + 6 soft), spec.md §NF-SEC-5.
 *
 * 진입점:
 *   1) `installRealSanitizer()` — 서버 부팅 시 1회 호출 → stores/prompt-sanitizer.ts의
 *      NOOP를 교체. 이후 routes/workprofiles·work-profile-memory·project-rules에서
 *      `scanPromptContent()`가 이 실구현을 사용.
 *   2) `KnowledgeLoader.buildSystemPrompt` step 5 — 각 rule/memory 본문을 실행 직전 최종 스캔.
 *
 * 계약(순환 import 방지):
 *   - 이 파일은 stores/prompt-sanitizer.ts만 참조한다(orchestrator ↔ stores 단방향).
 *   - stores 계층은 이 파일을 참조하지 않는다.
 */

import {
  installPromptSanitizer,
  type PromptSanitizerImpl,
  type PromptScanMarker,
  type PromptScanResult,
} from "../stores/prompt-sanitizer.ts";

// ─────────────────────────────────────────────────────────────
// Detection Rules — design-be §7-2 표 그대로.
// ─────────────────────────────────────────────────────────────

interface RuleDef {
  id: string;
  pattern: RegExp;
  severity: "hard" | "soft";
}

/**
 * Hard-block markers — 발견 시 즉시 hard_blocked.
 * 개별 패턴은 대소문자 무시(`i` 플래그) 기준.
 *
 * 1. `role: "system"` 등 JSON role 위장
 * 2. chat template 특수 토큰 (<|im_start|> 등)
 * 3. Llama-family instruction 마커 ([INST] / [/INST])
 * 4. 지시 override 헤딩 (### New/Ignore/Override instructions)
 * 5. jailbreak persona (you are now/a jailbroken/DAN/unrestricted)
 */
const HARD_RULES: RuleDef[] = [
  {
    id: "role_system_impersonation",
    severity: "hard",
    // JSON `"role": "system"` / YAML `role: system` / role="system" 모두 커버
    pattern: /["']?role["']?\s*[:=]\s*["']?system["']?/i,
  },
  {
    id: "chat_template_token",
    severity: "hard",
    pattern: /<\|(?:im_start|im_end|system|assistant|user|endoftext)\|>/i,
  },
  { id: "llama_instruction_marker", severity: "hard", pattern: /\[\/?INST\]/ },
  {
    id: "override_heading",
    severity: "hard",
    pattern: /^\s*#{1,6}\s*(new|ignore|override)\s+(instructions?|system|rules?|prompt)/im,
  },
  {
    id: "jailbreak_persona",
    severity: "hard",
    pattern: /you\s+are\s+(?:now\s+)?(?:a\s+)?(?:free|jailbroken|unrestricted|DAN(?:\s+mode)?)/i,
  },
];

/**
 * Soft-flag markers — 발견 시 경고 배너 부착 후 주입.
 *
 * 1. "ignore (all) previous instructions/prompts/rules"
 * 2. "disregard (your) system prompt"
 * 3. "bypass (all) safety/guardrails/filters"
 * 4. "execute the following command/shell/script"
 * 5. base64 blob 감지 (200자 이상 연속) — 잠재 payload
 * 6. 이질 URL scheme (file://, data:, javascript:)
 */
const SOFT_RULES: RuleDef[] = [
  {
    id: "ignore_previous_instructions",
    severity: "soft",
    pattern: /ignore\s+(?:all\s+)?previous\s+(?:instructions?|prompts?|rules?)/i,
  },
  {
    id: "disregard_system_prompt",
    severity: "soft",
    pattern: /disregard\s+(?:your\s+)?system\s+prompt/i,
  },
  {
    id: "bypass_safety",
    severity: "soft",
    pattern: /bypass\s+(?:all\s+)?(?:safety|guardrails?|filters?)/i,
  },
  {
    id: "execute_following_command",
    severity: "soft",
    pattern: /execute\s+the\s+following\s+(?:command|shell|script)/i,
  },
  { id: "base64_blob", severity: "soft", pattern: /[A-Za-z0-9+/=]{200,}/ },
  {
    id: "suspicious_url_scheme",
    severity: "soft",
    pattern: /(?:^|[\s(])(?:file:\/\/|data:|javascript:)/i,
  },
];

// ─────────────────────────────────────────────────────────────
// Scanner
// ─────────────────────────────────────────────────────────────

const MAX_SNIPPET_LEN = 160;

function snippet(line: string, matchStart: number, matchLen: number): string {
  const from = Math.max(0, matchStart - 40);
  const to = Math.min(line.length, matchStart + matchLen + 40);
  const raw = line.slice(from, to);
  return raw.length > MAX_SNIPPET_LEN ? raw.slice(0, MAX_SNIPPET_LEN) + "…" : raw;
}

/**
 * 텍스트를 라인 단위로 순회하며 hard + soft 룰을 스캔한다.
 *
 * 순회 대상 축소:
 *  - `override_heading`은 multiline 앵커(^)를 사용하므로 line-loop과 별개로 전체 텍스트 1회 검사.
 *  - 나머지는 라인 단위로 first-match만 기록 (동일 라인 중복 리포트 방지).
 *
 * Snippet 노출 최소화:
 *  - 매칭 라인만 40자 컨텍스트로 반환. 전체 본문은 회피.
 */
function runScan(text: string): PromptScanResult {
  if (typeof text !== "string" || text.length === 0) {
    return { ok: "clean", markers: [] };
  }
  const markers: PromptScanMarker[] = [];

  // 전체 텍스트 대상(멀티라인 앵커) — override heading 등
  for (const rule of [...HARD_RULES, ...SOFT_RULES]) {
    if (!rule.pattern.multiline && !rule.pattern.source.includes("^") && !rule.pattern.source.includes("$")) {
      continue;
    }
    const m = rule.pattern.exec(text);
    if (m) {
      const before = text.slice(0, m.index);
      const lineNumber = (before.match(/\n/g) ?? []).length + 1;
      const lineStart = before.lastIndexOf("\n") + 1;
      const lineEnd = text.indexOf("\n", m.index);
      const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
      markers.push({
        severity: rule.severity,
        rule: rule.id,
        line: lineNumber,
        snippet: snippet(line, m.index - lineStart, m[0].length),
      });
    }
  }

  // 라인 단위 — 나머지 룰
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    for (const rule of [...HARD_RULES, ...SOFT_RULES]) {
      // 전체-텍스트 앵커 룰은 이미 위에서 처리 — 스킵
      if (rule.pattern.source.includes("^") || rule.pattern.source.includes("$")) continue;
      // 이미 같은 rule/line 조합으로 기록된 게 있으면 스킵
      if (markers.some((m) => m.rule === rule.id && m.line === i + 1)) continue;
      const m = rule.pattern.exec(line);
      if (m) {
        markers.push({
          severity: rule.severity,
          rule: rule.id,
          line: i + 1,
          snippet: snippet(line, m.index, m[0].length),
        });
      }
    }
  }

  if (markers.length === 0) {
    return { ok: "clean", markers: [] };
  }
  const hasHard = markers.some((m) => m.severity === "hard");
  if (hasHard) {
    return { ok: "hard_blocked", markers };
  }
  // soft only — 경고 배너 부착본 반환
  const bannerLines = markers.map(
    (m) => `> [!warning] Injection-suspect (${m.rule}) at line ${m.line ?? "?"}: ${m.snippet}`,
  );
  const banner = bannerLines.join("\n");
  const sanitizedBody = `${banner}\n\n${text}`;
  return { ok: "soft_flagged", markers, sanitized_body: sanitizedBody };
}

// ─────────────────────────────────────────────────────────────
// Public API — install & scan
// ─────────────────────────────────────────────────────────────

const IMPL: PromptSanitizerImpl = {
  scan(text: string): PromptScanResult {
    return runScan(text);
  },
};

/**
 * 서버 부팅 시 1회 호출 — stores/prompt-sanitizer.ts의 NOOP 스텁을 교체한다.
 * app.ts의 라우트 chain wiring 직후에서 호출하면 이후 모든 스토어 저장 경로가
 * 실구현을 사용한다.
 */
export function installRealSanitizer(): void {
  installPromptSanitizer(IMPL);
}

/** 직접 스캔이 필요한 경우(orchestrator KnowledgeLoader) 사용. */
export function scanPrompt(text: string): PromptScanResult {
  return runScan(text);
}
