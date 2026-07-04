/**
 * orchestrator/knowledge-loader.ts
 *
 * 지식 3계층 프롬프트 조립 (design-be §6, spec §1-3).
 *
 * 계층:
 *   L1 Global — claude 자체가 CLAUDE.md 로드 (본 로더 관여 안 함)
 *   L2 WorkProfile — system_prompt_md + memories (kind별)
 *   L3 ProjectRule — must-read(무제한) + pref(20건 상한) + style(20건 상한)
 *
 * 상한 정책(OQ-3, design-be §6-1 step 4):
 *   - must-read: 무제한
 *   - pref: 최근 20건 (created_at DESC slice)
 *   - style: 최근 20건 (동일)
 *   - memory learned-pattern: 20건 상한
 *   - memory gotcha: 무제한 (중요도 최고)
 *   - memory gold-snippet: 20건 상한
 *
 * 상한 초과 시:
 *   - stats.truncated: 잘려나간 항목 요약
 *   - 이벤트 `system_prompt_pref_truncated` emit (호출자가 위임)
 *
 * PromptSanitizer 통합(design-be §6-2):
 *   - 각 rule/memory 본문을 개별 스캔
 *   - hard_blocked → 조립 실패 (호출자에게 preflight 실패 반환)
 *   - soft_flagged → 배너 부착본으로 대체 주입
 */

import { mkdirSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { Database } from "bun:sqlite";
import type {
  ProjectRow,
  ProjectRuleRow,
  WorkProfileRow,
  WorkProfileMemoryRow,
  WorkProfileMemoryKind,
  ProjectRuleKind,
} from "../../../tools/bams-db/schema.ts";
import { ProjectRuleStore } from "../stores/project-rule-store.ts";
import { WorkProfileStore } from "../stores/work-profile-store.ts";
import { WorkProfileMemoryStore } from "../stores/work-profile-memory-store.ts";
import { scanPrompt } from "./prompt-sanitizer-impl.ts";

/** 상한 정책 상수 — OQ-3. */
export const PREF_CAP = 20;
export const STYLE_CAP = 20;
export const MEMORY_LEARNED_CAP = 20;
export const MEMORY_SNIPPET_CAP = 20;
// memory gotcha, project must-read: 무제한

export interface TruncatedItem {
  category: "pref" | "style" | "memory-learned-pattern" | "memory-gold-snippet";
  dropped_count: number;
  kept_count: number;
}

export interface KnowledgeLoaderStats {
  work_profile_slug: string;
  memory_counts: Record<WorkProfileMemoryKind, number>;
  rule_counts: Record<ProjectRuleKind, number>;
  truncated: TruncatedItem[];
  soft_flagged_count: number;
  bytes: number;
}

export type BuildSystemPromptResult =
  | {
      ok: true;
      promptText: string;
      filePath: string;
      stats: KnowledgeLoaderStats;
    }
  | {
      ok: false;
      code: "PROMPT_INJECTION_HARD_BLOCK";
      detail: string;
      offender: { kind: "rule" | "memory" | "work_profile"; id: string; title?: string };
    };

export interface BuildOptions {
  sessionId: string;
  /**
   * tmp 파일 저장 루트 — 미지정 시 `$HOME/.bams/tmp/execution-prompts/`.
   * 테스트에서 override 가능.
   */
  tmpRoot?: string;
}

export class KnowledgeLoader {
  private ruleStore: ProjectRuleStore;
  private workProfileStore: WorkProfileStore;
  private memoryStore: WorkProfileMemoryStore;

  constructor(db: Database) {
    this.ruleStore = new ProjectRuleStore(db);
    this.workProfileStore = new WorkProfileStore(db);
    this.memoryStore = new WorkProfileMemoryStore(db);
  }

  /**
   * L2+L3 시스템 프롬프트를 조립한다.
   *
   * 순서(design-be §6-1 step 6):
   *   ## [PROJECT MUST-READ RULES]     — L3 must-read (무제한)
   *   ## [WORKPROFILE MEMORY — gotchas] — L2 gotcha (무제한)
   *   ## [WORKPROFILE MEMORY — patterns/snippets] — L2 learned + snippet (각 20건)
   *   ## [WORKPROFILE SYSTEM PROMPT]    — L2 base
   *   ## [PROJECT PREF RULES]           — L3 pref (20건)
   *   ## [PROJECT STYLE RULES]          — L3 style (20건)
   */
  buildSystemPrompt(project: ProjectRow, options: BuildOptions): BuildSystemPromptResult {
    const workProfile = this.workProfileStore.get(project.work_profile_slug);
    if (!workProfile) {
      return {
        ok: false,
        code: "PROMPT_INJECTION_HARD_BLOCK",
        detail: `work_profile_slug not found: ${project.work_profile_slug}`,
        offender: { kind: "work_profile", id: project.work_profile_slug },
      };
    }

    // WorkProfile system_prompt_md sanitize
    const wpScan = scanPrompt(workProfile.system_prompt_md);
    if (wpScan.ok === "hard_blocked") {
      return {
        ok: false,
        code: "PROMPT_INJECTION_HARD_BLOCK",
        detail: `WorkProfile.system_prompt_md contains hard-blocked markers`,
        offender: { kind: "work_profile", id: workProfile.slug, title: workProfile.name },
      };
    }
    let softFlaggedCount = wpScan.ok === "soft_flagged" ? 1 : 0;

    // L3 rules
    const mustReadRules = this.ruleStore.list(project.slug, { kind: "must-read" });
    const prefRulesAll = this.ruleStore.list(project.slug, { kind: "pref" });
    const styleRulesAll = this.ruleStore.list(project.slug, { kind: "style" });
    // 최근 20건 (created_at DESC)
    const prefRules = takeRecent(prefRulesAll, PREF_CAP);
    const styleRules = takeRecent(styleRulesAll, STYLE_CAP);

    // L2 memories
    const gotchas = this.memoryStore.list(workProfile.slug, {
      kind: "gotcha",
      alive_only: true,
    });
    const learnedAll = this.memoryStore.list(workProfile.slug, {
      kind: "learned-pattern",
      alive_only: true,
    });
    const snippetsAll = this.memoryStore.list(workProfile.slug, {
      kind: "gold-snippet",
      alive_only: true,
    });
    const learned = takeRecent(learnedAll, MEMORY_LEARNED_CAP);
    const snippets = takeRecent(snippetsAll, MEMORY_SNIPPET_CAP);

    // hard-block 스캔 (must-read → gotcha → learned → snippet → pref → style)
    const groups: Array<{
      title: string;
      rows: Array<{ id: string; title: string; body_md: string }>;
      offenderKind: "rule" | "memory";
    }> = [
      {
        title: "[PROJECT MUST-READ RULES]",
        rows: mustReadRules.map((r) => ({ id: r.id, title: r.title, body_md: r.body_md })),
        offenderKind: "rule",
      },
      {
        title: "[WORKPROFILE MEMORY — gotchas]",
        rows: gotchas.map((m) => ({ id: m.id, title: m.title, body_md: m.body_md })),
        offenderKind: "memory",
      },
      {
        title: "[WORKPROFILE MEMORY — learned patterns]",
        rows: learned.map((m) => ({ id: m.id, title: m.title, body_md: m.body_md })),
        offenderKind: "memory",
      },
      {
        title: "[WORKPROFILE MEMORY — gold snippets]",
        rows: snippets.map((m) => ({ id: m.id, title: m.title, body_md: m.body_md })),
        offenderKind: "memory",
      },
      {
        title: "[PROJECT PREF RULES]",
        rows: prefRules.map((r) => ({ id: r.id, title: r.title, body_md: r.body_md })),
        offenderKind: "rule",
      },
      {
        title: "[PROJECT STYLE RULES]",
        rows: styleRules.map((r) => ({ id: r.id, title: r.title, body_md: r.body_md })),
        offenderKind: "rule",
      },
    ];

    // 조립 (hard-block 있으면 즉시 반환)
    const chunks: string[] = [];
    for (const group of groups) {
      if (group.rows.length === 0) continue;
      chunks.push(`## ${group.title}`);
      for (const row of group.rows) {
        const scan = scanPrompt(row.body_md);
        if (scan.ok === "hard_blocked") {
          return {
            ok: false,
            code: "PROMPT_INJECTION_HARD_BLOCK",
            detail: `${group.title} — item "${row.title}" contains hard-blocked marker`,
            offender: {
              kind: group.offenderKind,
              id: row.id,
              title: row.title,
            },
          };
        }
        const body = scan.ok === "soft_flagged" ? scan.sanitized_body! : row.body_md;
        if (scan.ok === "soft_flagged") softFlaggedCount++;
        chunks.push(`### ${row.title}\n${body}`);
      }
      chunks.push("");
    }

    // L2 base system_prompt_md (soft-flagged면 배너 부착본)
    if (workProfile.system_prompt_md.trim()) {
      chunks.push("## [WORKPROFILE SYSTEM PROMPT]");
      const body = wpScan.ok === "soft_flagged" ? wpScan.sanitized_body! : workProfile.system_prompt_md;
      chunks.push(body);
      chunks.push("");
    }

    const promptText = chunks.join("\n").trim() + "\n";
    const filePath = writePromptFile(promptText, options.sessionId, options.tmpRoot);

    // truncation stats
    const truncated: TruncatedItem[] = [];
    if (prefRulesAll.length > prefRules.length) {
      truncated.push({
        category: "pref",
        dropped_count: prefRulesAll.length - prefRules.length,
        kept_count: prefRules.length,
      });
    }
    if (styleRulesAll.length > styleRules.length) {
      truncated.push({
        category: "style",
        dropped_count: styleRulesAll.length - styleRules.length,
        kept_count: styleRules.length,
      });
    }
    if (learnedAll.length > learned.length) {
      truncated.push({
        category: "memory-learned-pattern",
        dropped_count: learnedAll.length - learned.length,
        kept_count: learned.length,
      });
    }
    if (snippetsAll.length > snippets.length) {
      truncated.push({
        category: "memory-gold-snippet",
        dropped_count: snippetsAll.length - snippets.length,
        kept_count: snippets.length,
      });
    }

    const stats: KnowledgeLoaderStats = {
      work_profile_slug: workProfile.slug,
      memory_counts: {
        "gotcha": gotchas.length,
        "learned-pattern": learnedAll.length,
        "gold-snippet": snippetsAll.length,
      },
      rule_counts: {
        "must-read": mustReadRules.length,
        pref: prefRulesAll.length,
        style: styleRulesAll.length,
      },
      truncated,
      soft_flagged_count: softFlaggedCount,
      bytes: Buffer.byteLength(promptText, "utf-8"),
    };

    return { ok: true, promptText, filePath, stats };
  }
}

/**
 * created_at DESC 최근 N건. store가 반환하는 순서에 상관없이 방어적으로 정렬.
 */
function takeRecent<T extends { created_at: string }>(rows: T[], cap: number): T[] {
  if (rows.length <= cap) return rows;
  const sorted = [...rows].sort((a, b) => {
    if (a.created_at < b.created_at) return 1;
    if (a.created_at > b.created_at) return -1;
    return 0;
  });
  return sorted.slice(0, cap);
}

/**
 * tmp 파일 저장 — `${tmpRoot}/execution-prompts/${sessionId}.md`.
 *
 * platform-devops 트랙(§7-3)이 24시간 후 삭제 cleanup 담당. BE는 write만.
 * 파일 mode 0o600 — spec §NF-SEC-6/gotchas 로그 정책.
 */
function writePromptFile(text: string, sessionId: string, tmpRoot?: string): string {
  const root = tmpRoot ?? join(homedir(), ".bams", "tmp", "execution-prompts");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const filePath = join(root, `${sessionId}.md`);
  writeFileSync(filePath, text, { mode: 0o600, encoding: "utf-8" });
  return filePath;
}
