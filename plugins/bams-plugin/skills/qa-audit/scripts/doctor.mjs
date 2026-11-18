#!/usr/bin/env node
// Environment check for the qa-audit scripts: node version, Playwright (source, version, chromium
// launch), axe-core (source, version) and the allowed-host policy. Run before any browser script.
// Prints JSON to stdout; with --out also writes <out>/doctor.md. Never installs anything.
//
//   node doctor.mjs [--out <run>] [--axe <path>|none] [--repo <target repo>] [--base <url>] \
//     [--allow-remote] [--server dev|prod|staging|unknown]
// <run> = .crew/artifacts/qa/<YYYY-MM-DD>-<scope>
// Exit: 0 ready (axe missing is still 0 — A1 becomes unverified)
//       2 usage error (bad flag, --axe path not found)
//       3 node < 18, Playwright not resolvable/loadable, or chromium cannot launch
import fs from "node:fs";
import path from "node:path";

const NODE_MIN = 18;
const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < NODE_MIN) {
  // Checked before loading lib/common.mjs, which needs Node 18+ APIs.
  process.stdout.write(JSON.stringify({ ready: false, node: { version: process.version, ok: false, required: `>=${NODE_MIN}` } }, null, 2) + "\n");
  process.stderr.write(`Node ${NODE_MIN}+ 필요 (현재 ${process.version})\n`);
  process.exit(3);
}

const { EXIT, isLocalHost, mdRunHeader, mdTable, parseArgs, pluginRoot, resolveAxe, runInfo, tryLaunchChromium, tryLoadPlaywright, writeFile } = await import("./lib/common.mjs");

const args = parseArgs(process.argv.slice(2), { known: ["out", "axe", "repo", "base"] });
const root = pluginRoot();
const rootLabel = root ?? "<plugin root>";
const LOCAL = ["localhost", "127.0.0.1", "::1", "[::1]"];

const report = {
  ...runInfo({ tool: "doctor" }),
  ready: false,
  plugin_root: root,
  node: { version: process.version, ok: true, required: `>=${NODE_MIN}` },
  playwright: { status: "unknown" },
  axe: { status: "unknown" },
  hosts: {
    allowed: LOCAL,
    note: "그 외 호스트는 --allow-remote 명시 시에만. 라우트 절대 URL은 --base와 같은 출처만",
    allow_remote: !!args["allow-remote"],
  },
  hints: [],
};

if (args.base) {
  try {
    const { hostname, protocol } = new URL(args.base);
    const local = isLocalHost(hostname);
    report.hosts.base = { url: args.base, local, allowed: (protocol === "http:" || protocol === "https:") && (local || !!args["allow-remote"]) };
  } catch {
    report.hosts.base = { url: args.base, local: false, allowed: false, reason: "URL 형식 오류" };
  }
}

// ---- output: every exit path below calls finish(), so the JSON is never lost ----------------
function finish(code, stderrMessage) {
  report.ready = code === EXIT.OK;
  report.exit_code = code;
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (args.out) writeFile(path.join(args.out, "doctor.md"), toMarkdown());
  if (stderrMessage) process.stderr.write(`${stderrMessage}\n`);
  process.exit(code);
}

function toMarkdown() {
  const pw = report.playwright;
  const ax = report.axe;
  const pwCell = pw.status === "found" ? `${pw.source} · ${pw.version ?? "버전 미상"}` : `${pw.status}${pw.reason ? ` — ${pw.reason}` : ""}`;
  const launch = pw.chromium_launch ? `${pw.chromium_launch}${pw.chromium_reason ? ` — ${pw.chromium_reason}` : ""}` : "-";
  const axCell = ax.status === "found" ? `${ax.source} · ${ax.version ?? "버전 미상"}` : `미검증 — ${ax.reason ?? ax.status}`;
  const hosts = `${LOCAL.join(", ")} (그 외 --allow-remote${report.hosts.allow_remote ? " — 이번 실행 허용" : ""})`;
  return [
    `# QA 감사 환경 점검 — ${report.ready ? "준비됨" : "준비 안 됨"} (exit ${report.exit_code})`,
    "",
    mdRunHeader({ tool: "doctor" }),
    "",
    mdTable(
      ["항목", "결과"],
      [
        ["node", `${report.node.version} (${report.node.required})`],
        ["플러그인 루트", report.plugin_root ?? "확인 실패"],
        ["Playwright", pwCell],
        ["chromium 실행", launch],
        ["axe-core", axCell],
        ["허용 호스트", hosts],
        ...(report.hosts.base ? [["--base", `${report.hosts.base.url} — ${report.hosts.base.allowed ? "허용" : "차단 (--allow-remote 필요)"}`]] : []),
      ]
    ),
    "",
    ...(report.hints.length ? ["## 조치", "", ...report.hints.map(h => `- ${h}`), ""] : []),
  ].join("\n");
}

// ---- axe (not required: missing -> A1 unverified, exit stays 0) ---------------------------
// An explicit --axe path that does not exist is a usage error; checked here so the JSON is still printed.
if (args.axe && args.axe !== "none" && !fs.existsSync(path.resolve(args.axe))) {
  report.axe = { status: "unknown", reason: `--axe 경로 없음: ${args.axe}` };
  finish(EXIT.USAGE, report.axe.reason);
}
const axe = resolveAxe(args);
report.axe = { status: axe.status, source: axe.source ?? null, version: axe.version ?? null, path: axe.path ?? null, ...(axe.reason ? { reason: axe.reason } : {}) };
if (axe.status === "found" && axe.source !== "bundle") report.axe.hint = `플러그인 번들 axe 없음 — (cd ${rootLabel} && bun install)`;
if (axe.status !== "found" && axe.source !== "arg") {
  report.axe.hint = `(cd ${rootLabel} && bun install)`;
  report.hints.push(`axe-core 번들 없음 — ${report.axe.hint} (없으면 A1 axe 검사는 미검증)`);
}

// ---- Playwright -------------------------------------------------------------------------
const loaded = await tryLoadPlaywright();
const info = loaded.info;
if (!loaded.ok && info.status !== "found") {
  report.playwright = { status: "missing", reason: loaded.reason, tried: info.tried, hint: loaded.hint };
  report.hints.push(`Playwright 미설치 — ${loaded.hint}`);
  finish(EXIT.ENV, `Playwright 미설치 — ${loaded.hint}`);
}
report.playwright = { status: "found", source: info.source, version: info.version, path: info.path };
if (!loaded.ok) {
  const reason = loaded.reason.split("\n").find(Boolean) ?? "로드 실패";
  report.playwright = { ...report.playwright, status: "load_fail", reason, hint: loaded.hint };
  report.hints.push(`Playwright 로드 실패 — ${loaded.hint}`);
  finish(EXIT.ENV, `Playwright 로드 실패 (${info.source}: ${info.path}) — ${loaded.hint}\n  원인: ${reason}`);
}
const playwright = loaded.playwright;

let executable = null;
try {
  executable = playwright.chromium.executablePath();
} catch {
  executable = null;
}
report.playwright.chromium_executable = executable;
report.playwright.chromium_executable_exists = !!executable && fs.existsSync(executable);

const launched = await tryLaunchChromium(playwright, { timeout: 30000 });
if (!launched.ok) {
  report.playwright.chromium_launch = "fail";
  report.playwright.chromium_reason = launched.reason;
  report.playwright.hint = launched.hint;
  report.hints.push(`chromium 실행 불가 — ${launched.hint}`);
  finish(EXIT.ENV, `브라우저 실행 실패 — ${launched.hint}\n  원인: ${launched.reason}`);
}
report.playwright.chromium_version = launched.browser.version();
await launched.browser.close();
report.playwright.chromium_launch = "ok";

finish(EXIT.OK);
