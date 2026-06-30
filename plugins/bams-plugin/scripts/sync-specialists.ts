#!/usr/bin/env bun
/**
 * sync-specialists.ts — plugin.json agents → 5 위치 자동 동기화
 *
 * Usage:
 *   bun run sync-specialists.ts             # default: --dry-run
 *   bun run sync-specialists.ts --apply     # 실제 갱신
 *
 * SYNC marker 규약: 각 TARGET 파일에 다음 코멘트로 영역 표시
 *   <!-- SYNC-SPECIALISTS:START -->
 *   {auto-generated content}
 *   <!-- SYNC-SPECIALISTS:END -->
 *
 * marker가 없는 파일은 첫 실행 시 추가 commit으로 marker 삽입 필요.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

interface PluginJson {
  agents: string[];  // e.g. "./agents/xxx.md"
}

const ROOT = join(import.meta.dir, "..", "..", "..");
const SOURCE = join(ROOT, "plugins/bams-plugin/.claude-plugin/plugin.json");

const TARGETS: Array<{ path: string; render: (specialists: string[]) => string }> = [
  // 1. delegation-protocol.md
  {
    path: "plugins/bams-plugin/references/delegation-protocol.md",
    render: (s) => `<!-- SYNC-SPECIALISTS:START -->\n` +
      `디자인부 specialist 9종 (design-director 산하):\n` +
      s.map(x => `- ${x}`).join("\n") +
      `\n<!-- SYNC-SPECIALISTS:END -->`,
  },
  // 2. init.md
  {
    path: "plugins/bams-plugin/commands/bams/init.md",
    render: (s) => `<!-- SYNC-SPECIALISTS:START -->\n` +
      `- 디자인 specialist: ${s.join(", ")}\n` +
      `<!-- SYNC-SPECIALISTS:END -->`,
  },
  // 3. agent-tool-policy.md
  {
    path: "plugins/bams-plugin/references/agent-tool-policy.md",
    render: (s) => `<!-- SYNC-SPECIALISTS:START -->\n` +
      s.map(x => `- ${x}: \`disallowedTools: []\``).join("\n") +
      `\n<!-- SYNC-SPECIALISTS:END -->`,
  },
  // 4. bams-viz-emit.sh dept_map
  {
    path: "plugins/bams-plugin/hooks/bams-viz-emit.sh",
    render: (s) => `# SYNC-SPECIALISTS:START\n` +
      `_DESIGN_SPECIALISTS=(${s.map(x => `"${x}"`).join(" ")})\n` +
      `# SYNC-SPECIALISTS:END`,
  },
  // 5. jojikdo.json (design 부서원 배열)
  {
    path: "plugins/bams-plugin/references/jojikdo.json",
    render: (s) => `"SYNC-SPECIALISTS-START": ${JSON.stringify(s)}, "SYNC-SPECIALISTS-END": null`,
  },
];

function extractAgentSlugs(json: PluginJson): string[] {
  // plugin.json agents는 './agents/xxx.md' 형식
  // design specialist만 필터: F1~F9 (guide/data/ui/visual/accessibility/routing/ssr/nextjs 패턴)
  const designKeywords = /^(guide-|data-|ui-diff|visual-|accessibility-|routing-|ssr-|nextjs-)/;
  return json.agents
    .map(p => p.replace(/^\.\/agents\//, "").replace(/\.md$/, ""))
    .filter(name => designKeywords.test(name))
    .sort();
}

function extractBlock(content: string, startMarker: string, endMarker: string): string | null {
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker);
  if (start === -1 || end === -1) return null;
  return content.substring(start, end + endMarker.length);
}

function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");

  if (!existsSync(SOURCE)) {
    console.error(`[ERROR] plugin.json not found: ${SOURCE}`);
    process.exit(1);
  }

  const source: PluginJson = JSON.parse(readFileSync(SOURCE, "utf-8"));
  const specialists = extractAgentSlugs(source);

  console.log(`Source: ${SOURCE}`);
  console.log(`Specialists: ${specialists.length}`);

  let driftCount = 0;
  for (const target of TARGETS) {
    const fullPath = join(ROOT, target.path);
    if (!existsSync(fullPath)) {
      console.log(`[SKIP] ${target.path} not found`);
      continue;
    }

    const content = readFileSync(fullPath, "utf-8");
    const expected = target.render(specialists);

    // SYNC marker 추출 (start marker는 expected의 첫 줄)
    const firstLineEnd = expected.indexOf("\n");
    const startMarker = expected.substring(0, firstLineEnd);
    const lastNewline = expected.lastIndexOf("\n");
    const endMarker = expected.substring(lastNewline + 1);

    const actual = extractBlock(content, startMarker, endMarker);

    if (actual === null) {
      console.log(`[NO-MARKER] ${target.path} — SYNC marker not found (manual marker insertion needed first)`);
      driftCount++;
      continue;
    }

    if (actual !== expected) {
      console.log(`[DRIFT] ${target.path}`);
      driftCount++;
      if (apply) {
        const newContent = content.replace(actual, expected);
        writeFileSync(fullPath, newContent);
        console.log(`  → applied`);
      }
    } else {
      console.log(`[OK] ${target.path}`);
    }
  }

  if (apply) {
    console.log(`Apply mode: ${driftCount} drifts applied.`);
    process.exit(0);
  } else {
    console.log(`Dry-run: ${driftCount} drifts.`);
    process.exit(driftCount === 0 ? 0 : 1);
  }
}

main();
