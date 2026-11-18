#!/usr/bin/env node
// Self-test: runs every qa-audit script against a local fixture (127.0.0.1 only, no remote access)
// with planted defects and checks that each defect is reported. Negative checks make sure the
// scripts do not over-report: every network script refuses remote/cross-origin/credential/query
// bases before any request, 4xx/3xx/no-sample rows are unverified (never measured or captured),
// HTTP >= 400 pages are skipped, and a defect-free page yields 0 defects. Run after install or
// after changing a script — every check must pass.
//
//   node scripts/selftest/selftest.mjs [--no-axe] [--keep]
//   PLAYWRIGHT_MODULE=/abs/path/node_modules/playwright node scripts/selftest/selftest.mjs
//
// --no-axe  A1 (axe) check is printed as SKIP and left out of the denominator; audit-a11y runs with --axe none.
//           Without --no-axe, A1 is also SKIP when axe-core cannot be resolved (--axe/AXE_PATH/bundle/target repo).
// --keep    keep the work dir (bams-qa-audit-selftest-*) even when every check passes.
//
// Order: static checks (no browser) -> doctor -> browser checks. When doctor reports that Playwright or the
// browser is missing (exit 3), browser checks are not run: the cause and install command are printed instead.
// Exit: 0 all passed · 1 a check failed · 3 Playwright/browser missing (static checks still printed).
// Every script run has a wall-clock limit (60 s, P2-timeout 20 s): a hung script is killed and its check FAILs.
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { start, NOCACHE_HEADER } from "./fixture-server.mjs";
import { resolveAxe } from "../lib/common.mjs";

const argv = process.argv.slice(2);
const unknown = argv.filter(a => !["--no-axe", "--keep"].includes(a));
if (unknown.length) {
  process.stderr.write(`알 수 없는 인자: ${unknown.join(" ")} (사용: selftest.mjs [--no-axe] [--keep])\n`);
  process.exit(2);
}
const noAxe = argv.includes("--no-axe");
const keep = argv.includes("--keep");

const here = path.dirname(fileURLToPath(import.meta.url));
const scripts = path.resolve(here, "..");
const work = fs.mkdtempSync(path.join(os.tmpdir(), "bams-qa-audit-selftest-"));
const server = await start();
const base = `http://127.0.0.1:${server.address().port}`;
// Not an allowed host for the guard, yet it connects to the fixture: a missing guard shows up as fixture
// requests, not only as a wrong exit code.
const remoteBase = `http://0.0.0.0:${server.address().port}`;
const requests = () => server.stats.requests;
const firstLine = s => String(s ?? "").trim().split("\n")[0] ?? "";

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const skip = (name, reason) => console.log(`SKIP  ${name} — ${reason}`);

// Wall-clock limit per script run, so a regressed script (e.g. measure-api ignoring --timeout-ms on a
// hanging endpoint) fails its check instead of hanging the selftest. Override per call with { timeoutMs }.
const RUN_TIMEOUT_MS = 60000;
const KILL_GRACE_MS = 2000; // SIGTERM first (lets Playwright close its browser), SIGKILL after this
const TIMEOUT_CODE = 124; // like timeout(1); never an expected exit code of a script

/**
 * Run a script; resolves {code, stdout, stderr, timedOut} without throwing (async: the fixture server lives in
 * this process). Past timeoutMs the child gets SIGTERM, then SIGKILL; the promise resolves with timedOut=true and
 * code 124 even if a leftover grandchild keeps the output pipes open.
 */
const runRaw = (script, args, { timeoutMs = RUN_TIMEOUT_MS } = {}) =>
  new Promise(resolve => {
    let done = false;
    let timedOut = false;
    let killTimer = null;
    const finish = r => {
      if (done) return;
      done = true;
      clearTimeout(limitTimer);
      clearTimeout(killTimer);
      resolve(r);
    };
    const timeoutResult = (stdout, stderr) => ({ code: TIMEOUT_CODE, stdout: stdout ?? "", stderr: `${stderr ?? ""}\n${script} timed out after ${timeoutMs}ms (killed)`.trimStart(), timedOut: true, error: new Error(`${script} timed out after ${timeoutMs}ms`) });
    const child = execFile(process.execPath, [path.join(scripts, script), ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (timedOut) return finish(timeoutResult(stdout, stderr));
      finish({ code: error ? (typeof error.code === "number" ? error.code : 1) : 0, stdout: stdout ?? "", stderr: stderr ?? "", timedOut: false, error });
    });
    const limitTimer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        child.kill("SIGKILL");
        child.stdout?.destroy();
        child.stderr?.destroy();
        setTimeout(() => finish(timeoutResult("", "")), 500).unref();
      }, KILL_GRACE_MS);
    }, timeoutMs);
  });
/** Run a script that must exit 0; otherwise throw with its stderr. */
const run = async (script, args, opts) => {
  const r = await runRaw(script, args, opts);
  if (r.code !== 0) throw new Error(`${script} exit ${r.code}${r.timedOut ? " (timeout)" : ""}: ${r.stderr.trim().slice(0, 800)}`);
  return r;
};
const json = file => JSON.parse(fs.readFileSync(path.join(work, file), "utf8"));
const write = (file, data) => {
  fs.mkdirSync(path.dirname(path.join(work, file)), { recursive: true });
  fs.writeFileSync(path.join(work, file), typeof data === "string" ? data : JSON.stringify(data, null, 2));
};

/** Run one group of checks. If its script fails, the group's unrecorded checks are FAIL (denominator stays fixed). */
async function section(label, expected, fn) {
  const before = results.length;
  try {
    await fn();
  } catch (error) {
    const missing = expected - (results.length - before);
    const detail = String(error.message ?? error).slice(0, 800);
    for (let i = 0; i < missing; i++) check(`${label} — 미실행 (스크립트 오류)`, false, i === 0 ? detail : "");
  }
}

// ---- axe availability (A1) ---------------------------------------------------------------
const axeInfo = noAxe ? { status: "off" } : resolveAxe({});
const axeOn = axeInfo.status === "found";
const axeSkipReason = noAxe ? "--no-axe 지정 (분모 제외)" : `axe-core 미해석 — ${axeInfo.reason ?? "unverified"} (분모 제외)`;
const axeArgs = noAxe ? ["--axe", "none"] : [];

// Defect lists for the false-positive checks (empty = clean). A row that was not checked is a defect here.
function a11yDefects(r) {
  if (!r || r.error || !r.structure || !r.keyboard) return [`검사 안 됨 ${r?.error ?? r?.skipped ?? ""}`];
  const s = r.structure;
  const k = r.keyboard;
  const d = [];
  if (!s.lang) d.push("lang");
  if (!s.title) d.push("title");
  if (s.main !== 1) d.push(`main ${s.main}`);
  for (const key of ["heading_skips", "img_no_alt", "unnamed_controls", "unlabeled_fields", "tables_no_headers", "hidden_focusable", "positive_tabindex", "dup_aria_ids", "skeleton_exposed", "placeholder_no_text"])
    if (s[key]?.length) d.push(`${key} ${s[key].length}`);
  if (s.busy_after_load) d.push(`busy_after_load ${s.busy_after_load}`);
  if (!k.skip_link_first) d.push(`skip_link_first (${k.first_stop})`);
  if (k.trap) d.push("trap");
  if (!k.complete) d.push("tab incomplete");
  for (const key of ["no_indicator", "hidden_focus", "obscured"]) if (k[key]?.length) d.push(`${key} ${JSON.stringify(k[key])}`);
  if (!r.reflow) d.push("reflow 미실행");
  else if (r.reflow.overflow) d.push(`reflow overflow ${r.reflow.scroll_width}`);
  if (!Array.isArray(r.text_spacing_clipped)) d.push("text spacing 미실행");
  else if (r.text_spacing_clipped.length) d.push(`text_spacing_clipped ${JSON.stringify(r.text_spacing_clipped)}`);
  if (r.motion?.length) d.push("motion");
  if (axeOn && !(r.axe?.status === "ran" && r.axe.violations.length === 0)) d.push(`axe ${r.axe?.status} ${(r.axe?.violations ?? []).map(v => v.id).join(",")}`);
  if (r.page_errors?.length) d.push("pageerror");
  return d;
}
function uiDefects(r) {
  if (!r || r.error || r.skipped || !r.contrast_checked) return [`검사 안 됨 ${r?.error ?? r?.skipped ?? ""}`];
  const d = [];
  if (r.h1?.length !== 1) d.push(`h1 ${r.h1?.length}`);
  if (!Array.isArray(r.role_mismatch)) d.push("role 미검증");
  else if (r.role_mismatch.length) d.push(`role ${JSON.stringify(r.role_mismatch)}`);
  if (!r.off_scale) d.push("scale 미검증");
  else if (Object.keys(r.off_scale).length) d.push(`off_scale ${JSON.stringify(r.off_scale)}`);
  for (const key of ["contrast_fail", "transparent_token_bg", "small_targets", "page_errors"]) if (r[key]?.length) d.push(`${key} ${JSON.stringify(r[key])}`);
  if (r.overflow) d.push("overflow");
  return d;
}

// G1/G2 targets: every script that talks to a server. argsFor(base, route, out) -> argv.
const endpointsFile = route => {
  const file = `endpoints-${route.replace(/\W+/g, "_")}.json`;
  write(file, [{ name: "x", path: route }]);
  return path.join(work, file);
};
const NET_SCRIPTS = {
  "audit-a11y": (b, route, out) => ["--base", b, "--routes", route, "--out", out, "--axe", "none"],
  "inspect-computed-style": (b, route, out) => ["--base", b, "--routes", route, "--out", out],
  "measure-api": (b, route, out) => ["--base", b, "--endpoints", endpointsFile(route), "--out", out],
  "measure-web": (b, route, out) => ["--base", b, "--routes", route, "--out", out],
  "skeleton-hold": (b, route, out) => ["--base", b, "--routes", `x=${route}`, "--out", out],
};

// P2 timeout: an endpoint that never answers. Started now (it only waits) and checked last, so its
// ~4.5 s (3 × 1500 ms, then early stop) overlap the other checks.
write("endpoints-hang.json", [{ name: "hang", path: "/api/hang" }]);
const hangStarted = Date.now();
const hangRun = runRaw("measure-api.mjs", ["--base", base, "--endpoints", path.join(work, "endpoints-hang.json"), "--modes", "server-warm", "--runs", "5", "--timeout-ms", "1500", "--out", path.join(work, "perf-hang")], { timeoutMs: 20000 }).then(r => ({ ...r, elapsed: Date.now() - hangStarted }));

let envMissing = null;
try {
  // ======================= static (no browser) =======================

  // U/A static scan with a profile
  write("repo/src/app/globals.css", ":root{--color-surface:#111;--color-text-primary:#fff}");
  write("repo/src/components/ui/tag.tsx", 'export function Tag({ label, tone }: { label: string; tone: string }) { return <span className="rounded px-2 text-xs bg-surface">{label}</span>; }');
  write("repo/src/app/x/status_tag.tsx", [
    'import * as Tabs from "@radix-ui/react-tabs";',
    "export function StatusTag({ label, tone }: { label: string; tone: string }) {",
    '  return <div><Tabs.Root><TabsTrigger value="a">A</TabsTrigger></Tabs.Root>',
    '  <span className="rounded px-2 text-xs bg-surface text-text-ghost text-[13px] bg-[var(--surface)]" style={{ color: "#ff0000" }}>{label}</span>',
    "  <button onClick={() => {}}>go</button>",
    '  <img src="/a.png" /><button type="button"><XIcon /></button>',
    '  <div onClick={() => {}} className="outline-none" tabIndex={2}>x</div></div>;',
    "}",
  ].join("\n"));
  write("profile.json", { source_roots: ["src"], ui_dir: "src/components/ui", token_definition_files: ["src/app/globals.css"], ui_wrappers: { "@radix-ui/react-tabs": "src/components/ui/tabs.tsx" }, banned_imports: ["@radix-ui/themes"], duplicate_threshold: 0.3 });

  await section("U static", 13, async () => {
    await run("scan-ui-static.mjs", ["--repo", path.join(work, "repo"), "--profile", path.join(work, "profile.json"), "--files", "src/app/x/status_tag.tsx", "--out", path.join(work, "ui")]);
    const ui = json("ui/ui-static.json");
    const rule = r => ui.findings.some(f => f.rule === r);
    check("U4 phantom token class", rule("U4-unknown-token-class"));
    check("U4 undefined var (transparent fallback)", rule("U4-undefined-var"));
    check("U4 raw color", rule("U4-raw-color"));
    check("U5 arbitrary type size", rule("U5-arbitrary-type"));
    check("U2 tabs without panel", rule("U2-tabs-without-panel"));
    check("U2 wrapper bypass", rule("U2-bypass-wrapper"));
    check("U2 button without type", rule("U2-button-no-type"));
    check("A2 static img without alt", rule("A2-img-no-alt"));
    check("A2 static icon-only button without label", rule("A2-icon-button-no-label"));
    check("A3 static clickable div", rule("A3-click-non-interactive"));
    check("A3 static outline-none without replacement", rule("A3-outline-none"));
    check("A3 static positive tabIndex", rule("A3-positive-tabindex"));
    check("U3 duplicate component candidate", ui.duplicates.some(d => d.candidates.some(c => c.ui.endsWith("tag.tsx"))));
  });

  // S0: no profile -> defaults; rules needing missing fields are listed as skipped (unverified)
  await section("S0", 1, async () => {
    await run("scan-ui-static.mjs", ["--repo", path.join(work, "repo"), "--files", "src/app/x/status_tag.tsx", "--out", path.join(work, "ui-noprofile")]);
    const ui = json("ui-noprofile/ui-static.json");
    const raw = ui.findings.some(f => f.rule === "U4-raw-color");
    const skipped = (ui.skipped_rules ?? []).some(s => s.rule === "U2-bypass-wrapper");
    check("S0 scan without profile: raw color found, wrapper rule skipped", raw && skipped, JSON.stringify({ raw, skipped_rules: (ui.skipped_rules ?? []).map(s => s.rule) }));
  });

  // S1: profile-draft detects fields from a fixture repo, writes only <out>, refuses a qa-profile.json target
  write("draft-repo/package.json", { name: "draft-fixture", private: true, scripts: { dev: "next dev -p 3001" } });
  write("draft-repo/src/app/page.tsx", "export default function Page() { return <main />; }");
  write("draft-repo/src/app/globals.css", ":root{--color-surface:#fff;--color-text:#111;--color-border:#ddd;--radius-md:8px;--space-2:8px;--space-4:16px}");
  write("draft-repo/src/app/extra.css", ".x{--only-one:1px;--only-two:2px}");
  write("draft-repo/src/components/ui/tabs.tsx", 'import * as TabsPrimitive from "@radix-ui/react-tabs";\nexport const Tabs = TabsPrimitive.Root;');
  write("draft-repo/src/components/ui/button.tsx", 'import { Slot } from "@radix-ui/react-slot";\nexport const Button = Slot;');
  await section("S1", 1, async () => {
    const repoDir = path.join(work, "draft-repo");
    const tree = (dir, prefix = "") =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? [`${prefix}${e.name}/`, ...tree(path.join(dir, e.name), `${prefix}${e.name}/`)] : [`${prefix}${e.name}`]));
    const listFiles = dir => tree(dir).sort().join("\n");
    const before = listFiles(repoDir);
    const r = await runRaw("profile-draft.mjs", ["--repo", repoDir, "--out", path.join(work, "draft-run")]);
    const draft = r.code === 0 ? json("draft-run/qa-profile.draft.json") : {};
    const refuse = await runRaw("profile-draft.mjs", ["--repo", repoDir, "--out", path.join(repoDir, ".crew", "qa-profile.json")]);
    const got = {
      exit: r.code,
      source_roots: JSON.stringify(draft.source_roots) === '["src"]',
      ui_dir: draft.ui_dir === "src/components/ui",
      tokens: JSON.stringify(draft.token_definition_files) === '["src/app/globals.css"]',
      wrapper: draft.ui_wrappers?.["@radix-ui/react-tabs"] === "src/components/ui/tabs.tsx" && !draft.ui_wrappers?.["@radix-ui/react-slot"],
      base_url: draft.base_url === "http://localhost:3001",
      todo: Array.isArray(draft._todo) && draft._todo.some(t => t.startsWith("core_routes")),
      repo_untouched: listFiles(repoDir) === before && !fs.existsSync(path.join(repoDir, ".crew", "qa-profile.json")),
      refuse_exit: refuse.code,
    };
    const ok = got.exit === 0 && got.refuse_exit === 2 && Object.values(got).every(v => v !== false);
    check("S1 profile-draft detects fields, repo untouched, qa-profile.json target refused (exit 2)", ok, ok ? "" : `${JSON.stringify(got)} ${r.stderr.trim().split("\n")[0] ?? ""}`);
  });

  // S2: invalid profile type -> exit 2 naming the field
  write("profile-bad.json", { source_roots: "src" });
  await section("S2", 1, async () => {
    const r = await runRaw("scan-ui-static.mjs", ["--repo", path.join(work, "repo"), "--profile", path.join(work, "profile-bad.json"), "--files", "src/app/x/status_tag.tsx", "--out", path.join(work, "ui-bad")]);
    check("S2 invalid profile type refused (exit 2, profile.source_roots)", r.code === 2 && r.stderr.includes("profile.source_roots"), `exit ${r.code}: ${r.stderr.trim().split("\n")[0]}`);
  });

  // G1/G2: every network script refuses before any network access (exit 2, 0 fixture requests, no output).
  // G1 runs one script at a time so a request is attributed to the script that made it.
  for (const [id, argsFor] of Object.entries(NET_SCRIPTS)) {
    await section(`G1 ${id}`, 1, async () => {
      const out = path.join(work, `g1-${id}`);
      const before = requests();
      const r = await runRaw(`${id}.mjs`, argsFor(remoteBase, "/", out));
      const hits = requests() - before;
      check(`G1 ${id}: remote base refused without --allow-remote (exit 2, 0 requests, no output)`, r.code === 2 && r.stderr.includes("--allow-remote") && hits === 0 && !fs.existsSync(out), `exit ${r.code} · requests ${hits} · ${firstLine(r.stderr)}`);
    });
  }
  await section("G2", 5, async () => {
    const runs = await Promise.all(
      Object.entries(NET_SCRIPTS).map(async ([id, argsFor]) => {
        const out = path.join(work, `g2-${id}`);
        return { id, out, r: await runRaw(`${id}.mjs`, argsFor(base, "https://example.invalid/x", out)) };
      }),
    );
    for (const { id, out, r } of runs)
      check(`G2 ${id}: cross-origin route refused (exit 2, no output)`, r.code === 2 && r.stderr.includes("출처") && !fs.existsSync(out), `exit ${r.code}: ${firstLine(r.stderr)}`);
  });

  // G4/G5: base with credentials, query or fragment -> exit 2 before any request; the secret is never echoed.
  await section("G4", 1, async () => {
    const before = requests();
    const r = await runRaw("measure-api.mjs", ["--base", `http://qauser:qasecret@127.0.0.1:${server.address().port}`, "--endpoints", endpointsFile("/api/detail/a1"), "--out", path.join(work, "g4")]);
    const hits = requests() - before;
    check("G4 credential URL base refused (exit 2, secret not echoed, 0 requests)", r.code === 2 && !r.stderr.includes("qasecret") && hits === 0, `exit ${r.code} · requests ${hits} · ${firstLine(r.stderr)}`);
  });
  await section("G5", 1, async () => {
    const before = requests();
    const rs = await Promise.all([`${base}/?token=qasecret`, `${base}/app#frag`, `${base}/?`].map(b => runRaw("measure-api.mjs", ["--base", b, "--endpoints", endpointsFile("/api/detail/a1"), "--out", path.join(work, "g5")])));
    const hits = requests() - before;
    check("G5 base with query/fragment refused (exit 2, query not echoed, 0 requests)", rs.every(r => r.code === 2 && r.stderr.includes("쿼리·조각") && !r.stderr.includes("qasecret")) && hits === 0, `${rs.map(r => `exit ${r.code}`).join(", ")} · requests ${hits} · ${firstLine(rs[0].stderr)}`);
  });

  // P2 negative (no browser): 404/401/3xx are excluded samples -> unverified; no --nocache-header -> server-cold
  // unverified; G6: a base with a path is kept as origin+path in json and md.
  write("endpoints-neg.json", [{ name: "ok", path: "/detail/a1" }, { name: "missing", path: "/detail/zz" }, { name: "auth", path: "/auth" }, { name: "redirect", path: "/redirect" }]);
  await section("P2 negative", 5, async () => {
    await run("measure-api.mjs", ["--base", `${base}/api/`, "--endpoints", path.join(work, "endpoints-neg.json"), "--runs", "3", "--out", path.join(work, "api-neg")]);
    const out = json("api-neg/perf-api.json");
    const row = (mode, name) => out.results.find(r => r.mode === mode && r.name === name);
    const brief = r => JSON.stringify(r && { status: r.status, excluded: r.excluded, statuses: r.statuses, p95: r.p95 });
    const excludedRow = (name, code) => {
      const r = row("server-warm", name);
      return r?.status === "unverified" && r.excluded === 3 && r.statuses?.[code] === 3 && r.p95 === undefined;
    };
    check("P2-404 404 endpoint -> unverified, 3/3 excluded", excludedRow("missing", 404), brief(row("server-warm", "missing")));
    check("P2-401 401 endpoint -> unverified, 3/3 excluded", excludedRow("auth", 401), brief(row("server-warm", "auth")));
    check("P2-3xx redirect (not followed) -> unverified, 3/3 excluded", excludedRow("redirect", 302), brief(row("server-warm", "redirect")));
    const cold = out.results.filter(r => r.mode === "server-cold");
    check(
      "P2-nohdr no --nocache-header -> every server-cold row unverified (2xx warm still measured)",
      cold.length === 4 && cold.every(r => r.status === "unverified" && r.reason === "캐시 우회 수단 없음") && row("server-warm", "ok")?.status === "measured",
      JSON.stringify({ cold: cold.map(r => r.status), warm_ok: row("server-warm", "ok")?.status }),
    );
    const md = fs.readFileSync(path.join(work, "api-neg", "perf-api.md"), "utf8");
    check("G6 base path recorded as origin+path (json, md)", out.base === `${base}/api` && md.includes(`base: ${base}/api ·`), `json base ${out.base}`);
  });

  await section("G3", 1, async () => {
    const r = await runRaw("audit-a11y.mjs", ["--base", base, "--routes", "/", "--bogus", "1", "--out", path.join(work, "g3"), "--axe", "none"]);
    check("G3 unknown flag refused (exit 2)", r.code === 2 && r.stderr.includes("알 수 없는 플래그: --bogus"), `exit ${r.code}: ${r.stderr.trim().split("\n")[0]}`);
  });

  // ======================= environment =======================
  await section("E1", 1, async () => {
    const r = await runRaw("doctor.mjs", ["--out", path.join(work, "doctor"), ...axeArgs]);
    let report = null;
    try {
      report = JSON.parse(r.stdout);
    } catch {
      report = null;
    }
    if (r.code === 3) {
      envMissing = { report, stderr: r.stderr };
      return;
    }
    const pwSource = report?.playwright?.source;
    const axeStatus = report?.axe?.status;
    check(
      "E1 doctor ready (playwright source, axe status)",
      r.code === 0 && ["env", "bundle", "resolve"].includes(pwSource) && ["found", "unverified"].includes(axeStatus),
      `exit ${r.code} · playwright ${pwSource ?? "-"} ${report?.playwright?.version ?? ""} · axe ${axeStatus ?? "-"}${report?.axe?.source ? ` (${report.axe.source})` : ""}`
    );
  });

  if (!envMissing) {
    // ======================= browser =======================

    // U browser layer
    write("profile-browser.json", { typography: { "page-title": { size_px_desktop: 48, size_px_mobile: 32, weight: 600 }, "text-label": { size_rem: 0.75, weight: 600 } }, extra_font_sizes_px: [16, 32, 48, 12] });
    await section("U browser", 5, async () => {
      await run("inspect-computed-style.mjs", ["--profile", path.join(work, "profile-browser.json"), "--base", base, "--routes", "/detail/a1", "--viewports", "1280x900,390x844", "--out", path.join(work, "ui")]);
      const comp = json("ui/ui-computed.json").results;
      check("U5 role mismatch (text-label 13px)", comp.some(r => r.role_mismatch?.some(m => m.role === "text-label")));
      check("U5 mobile page-title mismatch (48px on mobile)", comp.some(r => r.viewport === "390" && r.role_mismatch?.some(m => m.role === "page-title")));
      check("U7 low contrast", comp.some(r => r.contrast_fail?.some(c => c.text.includes("low contrast"))));
      check("U4 token bg resolved transparent", comp.some(r => r.transparent_token_bg?.length));
      check("U7 small touch target on mobile", comp.some(r => r.viewport === "390" && r.small_targets?.length));
    });

    // A browser layer (+ A1 axe when resolvable and not --no-axe)
    await section("A browser", 17 + (axeOn ? 1 : 0), async () => {
      await run("audit-a11y.mjs", ["--base", base, "--routes", "/a11y", "--viewports", "1280x900", "--tab-limit", "40", "--out", path.join(work, "a11y"), ...axeArgs]);
      const ax = json("a11y/a11y.json").results[0];
      const st = ax.structure;
      const kb = ax.keyboard;
      check("A2 missing lang", st.lang === "");
      check("A2 heading level skip", st.heading_skips.some(h => h.to === "h3"));
      check("A2 image without alt", st.img_no_alt.length === 1);
      check("A2 unnamed icon button (labelled one not flagged)", st.unnamed_controls.length === 1 && st.unnamed_controls[0].html.includes("<svg"), JSON.stringify(st.unnamed_controls.map(c => c.el)));
      check("A2 unlabeled input (placeholder only)", st.unlabeled_fields.some(f => f.placeholder_only));
      check("A2 table without headers", st.tables_no_headers.length === 1);
      check("A2 focusable inside aria-hidden", st.hidden_focusable.length === 1);
      check("A3 positive tabindex", st.positive_tabindex.length === 1);
      check("A3 no skip link first", kb.skip_link_first === false);
      check("A3 focus indicator missing", kb.no_indicator.some(x => x.el.includes("nofocus")), JSON.stringify(kb.no_indicator));
      check("A3 focus obscured by fixed bar", kb.obscured.some(x => x.el.includes("covered")), JSON.stringify(kb.obscured));
      check("A3 keyboard trap", Boolean(kb.trap), JSON.stringify({ stops: kb.tab_stops, distinct: kb.distinct_stops }));
      check("A4 reflow overflow at 320px", ax.reflow?.overflow === true && ax.reflow.culprits.length > 0);
      check("A4 text spacing clipping", ax.text_spacing_clipped.some(x => x.text.includes("Fits before")));
      check("A4 infinite animation under reduced motion", ax.motion.some(x => x.includes("spin")));
      check("A5 busy status after load / skeleton exposed", st.busy_after_load === 1 && st.skeleton_exposed.length === 1);
      check("A6 placeholder glyph without accessible text", st.placeholder_no_text.some(x => x.qa_field === "item.holding"));
      if (axeOn) check("A1 axe violations reported", ax.axe?.status === "ran" && ax.axe.violations.some(v => v.id === "html-has-lang"), `axe ${ax.axe?.status} ${ax.axe?.source ?? ""} ${ax.axe?.version ?? ""}`);
    });
    if (!axeOn) skip("A1 axe", axeSkipReason);

    // A1-off: --axe none -> axe unverified (not a failure), md says 미검증
    await section("A1-off", 1, async () => {
      let dir = "a11y";
      if (!noAxe) {
        dir = "a11y-axe-off";
        await run("audit-a11y.mjs", ["--base", base, "--routes", "/a11y", "--viewports", "1280x900", "--tab-limit", "5", "--no-reflow", "--no-spacing", "--axe", "none", "--out", path.join(work, dir)]);
      }
      const axe = json(`${dir}/a11y.json`).results[0].axe;
      const md = fs.readFileSync(path.join(work, dir, "a11y.md"), "utf8");
      check("A1-off --axe none -> axe unverified, md 미검증", axe?.status === "unverified" && md.includes("axe: 미검증"), JSON.stringify({ status: axe?.status, source: axe?.source }));
    });

    // P API + web + skeleton
    await section("P api", 2, async () => {
      write("endpoints.json", [{ name: "detail", group: "detail", path: "/api/detail/a1" }]);
      await run("measure-api.mjs", ["--base", base, "--endpoints", path.join(work, "endpoints.json"), "--runs", "5", "--nocache-header", NOCACHE_HEADER, "--out", path.join(work, "perf")]);
      const api = json("perf/perf-api.json").results;
      const cold = api.find(r => r.mode === "server-cold");
      const warm = api.find(r => r.mode === "server-warm");
      check(
        "P2 both cache modes measured (cold bypasses cache)",
        api.length === 2 && api.every(r => r.status === "measured" && Number.isFinite(r.p95)) && cold?.cache?.includes("BYPASS") && warm?.cache?.includes("HIT"),
        JSON.stringify(api.map(r => ({ mode: r.mode, status: r.status, cache: r.cache })))
      );
      check("P2 Server-Timing parsed", (warm ?? api[0])?.timing?.db?.median_dur === 12, JSON.stringify((warm ?? api[0])?.timing));
    });
    await section("P web", 2, async () => {
      await run("measure-web.mjs", ["--base", base, "--routes", "/detail/a1", "--ready", "[data-qa-section]", "--runs", "2", "--devices", "desktop", "--api-pattern", "/api/", "--leave-selector", "a[href='/about']", "--observe-ms", "300", "--out", path.join(work, "perf")]);
      const web = json("perf/perf-web.json").results;
      check("P3 load metrics", web.some(r => r.mode === "browser-cold" && Number.isFinite(r.ttfb) && Number.isFinite(r.ready)));
      // query-warm rows carry re-entry keys only (no ttfb/load metrics).
      check("P1 query-warm re-entry measured", web.some(r => r.mode === "query-warm" && r.status === "measured" && r.skeleton_reappeared?.length), JSON.stringify(web.filter(r => r.mode === "query-warm").map(r => ({ status: r.status, reasons: r.unverified_reasons }))));
    });
    await section("P skeleton", 2, async () => {
      await run("skeleton-hold.mjs", ["--base", base, "--routes", "item=/detail/a1", "--viewports", "1280x900", "--hydrate", "--boxes", "main,h1", "--out", path.join(work, "perf")]);
      const sk = json("perf/skeleton-after.json").rows[0];
      check("P6 reveal held and released", sk.held === 1 && sk.visible_busy_status === 1 && sk.loaded_busy_status === 0, JSON.stringify({ held: sk.held, busy: sk.visible_busy_status, after: sk.loaded_busy_status, status: sk.status }));
      check("P6 box delta computed", Boolean(sk.box_delta?.main));
    });

    // Negative / false-positive (browser): HTTP >= 400 pages are skipped and not counted; a defect-free
    // page (/clean) gives 0 defects; no-sample rows are unverified, never measured/captured.
    // The four runs start together (independent outputs); each section awaits its own run.
    const settle = p => p.then(() => null, error => error);
    const neg = {
      a11y: settle(run("audit-a11y.mjs", ["--base", base, "--routes", "/clean,/detail/zz", "--viewports", "1280x900", "--tab-limit", "40", "--out", path.join(work, "a11y-neg"), ...axeArgs])),
      ui: settle(run("inspect-computed-style.mjs", ["--profile", path.join(work, "profile-browser.json"), "--base", base, "--routes", "/clean,/detail/zz", "--viewports", "1280x900,390x844", "--out", path.join(work, "ui-neg")])),
      web: settle(run("measure-web.mjs", ["--base", base, "--routes", "/detail/zz,/clean", "--modes", "browser-cold,query-warm", "--runs", "1", "--devices", "desktop", "--observe-ms", "0", "--out", path.join(work, "web-neg")])),
      skel: settle(run("skeleton-hold.mjs", ["--base", base, "--routes", "about=/about", "--viewports", "1280x900", "--phase", "before", "--out", path.join(work, "skel-neg")])),
    };
    const awaitNeg = async key => {
      const error = await neg[key];
      if (error) throw error;
    };
    await section("A negative", 2, async () => {
      await awaitNeg("a11y");
      const res = json("a11y-neg/a11y.json").results;
      const bad = res.filter(r => r.route === "/detail/zz");
      check(
        "A-skip404 HTTP 404 page skipped (no checks, no reflow row, nothing counted)",
        bad.length === 1 && bad[0].http === 404 && Boolean(bad[0].skipped) && !bad[0].structure && !bad[0].keyboard && !bad[0].axe && !bad[0].reflow && !bad[0].motion,
        JSON.stringify(bad.map(r => ({ http: r.http, skipped: r.skipped, checked: Boolean(r.structure), reflow: Boolean(r.reflow) }))),
      );
      const defects = a11yDefects(res.find(r => r.route === "/clean" && r.viewport === "1280"));
      check(`A-clean defect-free page -> 0 defects${axeOn ? " (axe 포함)" : ""}`, defects.length === 0, defects.join(" · "));
    });
    await section("U negative", 2, async () => {
      await awaitNeg("ui");
      const out = json("ui-neg/ui-computed.json");
      const bad = out.results.filter(r => r.route === "/detail/zz");
      check(
        "U-skip404 HTTP 404 page skipped (no measurements, summary skipped_http 2 / checked 2)",
        bad.length === 2 && bad.every(r => r.http === 404 && r.skipped && r.h1 === undefined && r.contrast_fail === undefined && r.small_targets === undefined) && out.summary?.skipped_http === 2 && out.summary?.checked === 2,
        JSON.stringify({ summary: out.summary, rows: bad.map(r => ({ vp: r.viewport, http: r.http, skipped: Boolean(r.skipped), contrast: r.contrast_fail?.length })) }),
      );
      const clean = out.results.filter(r => r.route === "/clean");
      const defects = clean.flatMap(r => uiDefects(r).map(d => `${r.viewport}: ${d}`));
      check("U-clean defect-free page -> 0 defects (desktop + mobile)", clean.length === 2 && defects.length === 0, defects.join(" · "));
    });
    await section("P web negative", 2, async () => {
      await awaitNeg("web");
      const web = json("web-neg/perf-web.json").results;
      const row = (route, mode) => web.find(r => r.route === route && r.mode === mode);
      const brief = r => JSON.stringify(r && { mode: r.mode, status: r.status, http: r.http, measured: r.measured_samples, reasons: r.unverified_reasons, errors: r.errors });
      const nf = ["browser-cold", "query-warm"].map(m => row("/detail/zz", m));
      check(
        "P3-404 HTTP 404 route -> measured 0, unverified, http [404] (every mode)",
        nf.every(r => r?.status === "unverified" && r.measured_samples === 0 && JSON.stringify(r.http) === "[404]" && r.unverified_reasons.includes("HTTP 404")),
        nf.map(brief).join(" "),
      );
      const qw = row("/clean", "query-warm");
      check("P1-noleave query-warm without a leave link -> unverified (not success)", qw?.status === "unverified" && qw.measured_samples === 0 && qw.unverified_reasons.some(x => x.includes("이탈")), brief(qw));
    });
    await section("P skeleton negative", 1, async () => {
      await awaitNeg("skel");
      const sk = json("skel-neg/skeleton-before.json");
      const r = sk.rows[0];
      check("P6-held0 route without streaming -> held=0 unverified (not captured)", sk.rows.length === 1 && r.held === 0 && r.status === "unverified" && sk.summary.captured === 0, JSON.stringify({ held: r?.held, status: r?.status, summary: sk.summary }));
    });

    await section("Gallery", 1, async () => {
      await run("build-gallery.mjs", ["--dirs", path.join(work, "perf/screens"), "--out", path.join(work, "gallery.html")]);
      check("Gallery built", fs.statSync(path.join(work, "gallery.html")).size > 1000);
    });
  }

  // P2 timeout (no browser; started at the top): bounded run, row "error" with the timeout reason, early stop.
  await section("P2 timeout", 1, async () => {
    const r = await hangRun;
    const row = r.code === 0 ? json("perf-hang/perf-api.json").results[0] : null;
    check(
      "P2-timeout unresponsive endpoint + --timeout-ms 1500 -> ends in time, status error",
      !r.timedOut && r.code === 0 && r.elapsed < 15000 && row?.status === "error" && row.stopped_early === true && row.errors?.includes("timeout 1500ms"),
      `exit ${r.code}${r.timedOut ? " (selftest 제한 20000ms 초과로 kill)" : ""} · ${r.elapsed}ms · ${JSON.stringify(row && { status: row.status, stopped_early: row.stopped_early, errors: row.errors })}${r.code ? ` · ${firstLine(r.stderr)}` : ""}`,
    );
  });
} catch (error) {
  check("selftest execution", false, String(error.stack || error.message || error).slice(0, 800));
} finally {
  server.closeAllConnections?.(); // /api/hang keeps its socket open
  server.close();
}

const failed = results.filter(r => !r.ok);
const passed = results.length - failed.length;

if (envMissing) {
  const pw = envMissing.report?.playwright ?? {};
  const cause = pw.status === "missing" ? `Playwright 패키지 없음 (${pw.reason ?? "미해석"})` : pw.chromium_launch === "fail" ? `chromium 실행 실패 (${pw.chromium_reason ?? "원인 미상"})` : envMissing.stderr.trim().split("\n")[0] || "환경 확인 실패";
  const hint = pw.hint ?? envMissing.report?.hints?.[0] ?? envMissing.stderr.trim().split("\n")[0];
  console.log(`\n환경 없음 — 브라우저 검사를 실행하지 않음 (doctor exit 3)`);
  console.log(`  원인: ${cause}`);
  console.log(`  설치: ${hint}`);
  console.log("  또는 PLAYWRIGHT_MODULE=<chromium이 설치된 playwright 패키지 절대 경로> 로 다시 실행");
  console.log(`정적 검사 ${passed}/${results.length} passed (브라우저 검사 미실행). Work dir: ${keep || failed.length ? work : "(삭제됨)"}`);
  if (!keep && !failed.length) fs.rmSync(work, { recursive: true, force: true });
  console.log(`환경 없음 (exit 3)`);
  process.exitCode = failed.length ? 1 : 3;
} else {
  const expected = 73 + (axeOn ? 1 : 0);
  if (results.length !== expected) console.log(`WARN  검사 수 ${results.length} ≠ 기대 ${expected}`);
  console.log(`\nWork dir: ${keep || failed.length ? work : "(삭제됨)"}`);
  if (!keep && !failed.length) fs.rmSync(work, { recursive: true, force: true });
  console.log(`${passed}/${results.length} passed`);
  process.exitCode = failed.length || results.length !== expected ? 1 : 0;
}
