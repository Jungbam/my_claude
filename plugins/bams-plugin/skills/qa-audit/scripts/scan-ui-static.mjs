#!/usr/bin/env node
// U1–U6 static layer: scan changed files for design-system rule violations,
// duplicate-component candidates and static accessibility rules (A2/A3). Regex/heuristic based (not an AST),
// tuned for Tailwind classes and CSS custom properties: every finding is a candidate the review must confirm
// by reading the code. No dependencies (no browser).
//
//   node scan-ui-static.mjs --repo <target repo> [--profile <repo>/.crew/qa-profile.json] \
//     [--base <ref>] [--files a.tsx,b.tsx] [--all] --out <run>
// <run> = .crew/artifacts/qa/<YYYY-MM-DD>-<scope>
// --profile is optional: missing fields fall back to defaults and the rules that need them are listed
// as skipped (unverified), never as passed. --base default: profile.base_branch, else auto-detected
// (origin/HEAD -> origin/main -> origin/master -> main -> master).
// --base / profile.base_branch must be a plain ref name ([A-Za-z0-9._/@-], not starting with "-") that
// resolves to a commit. Findings are listed up to 60 per (file, rule); json counts/truncated keep the totals.
// Output: <out>/ui-static.json, <out>/ui-static.md; stdout prints only a summary (rule counts + output paths).
// Exit: 0 scan completed (findings are still 0), 2 usage error.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { detectBaseBranch, list, mdRunHeader, mdTable, parseArgs, requireArgs, runInfo, usageError, writeFile } from "./lib/common.mjs";
import { isSafeRefName, loadProfile, skippedRules } from "./lib/profile.mjs";

const args = parseArgs(process.argv.slice(2), { flags: ["all"], known: ["repo", "profile", "base", "files", "out"] });
requireArgs(args, ["repo", "out"]);
const repo = path.resolve(args.repo);
if (!fs.existsSync(repo) || !fs.statSync(repo).isDirectory()) usageError(`--repo 디렉터리 없음: ${args.repo}`);
const profile = loadProfile(args.profile, { repo });
const exts = profile.extensions;
const mode = args.files ? "files" : args.all ? "all" : "diff";

const REF_RULE = "영문·숫자·._/@- 만, '-'로 시작·'..' 포함 불가";
if (args.base !== undefined && !isSafeRefName(args.base)) usageError(`--base: expected ref name (${REF_RULE}): ${args.base}`);

// Path lists use -z (NUL-separated, never quoted) so non-ASCII file names come back verbatim.
const gitRaw = (...a) => execFileSync("git", ["-C", repo, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024 });
const gitPaths = (...a) => {
  try {
    return gitRaw(...a).split("\0").filter(Boolean);
  } catch (error) {
    usageError(`git ${a.join(" ")} 실패 (${repo}) — ${String(error.stderr || error.message).trim().split("\n")[0]}`);
  }
};

let base = null;
if (mode === "diff") {
  try {
    gitRaw("rev-parse", "--is-inside-work-tree");
  } catch {
    usageError(`git 저장소가 아님: ${repo} — --all 또는 --files 사용`);
  }
  // profile.base_branch is already checked by validateProfile(); detectBaseBranch() output is checked here too.
  const detected = args.base || profile.base_branch ? null : detectBaseBranch(repo);
  if (detected && !isSafeRefName(detected)) process.stderr.write(`경고: 자동 감지한 기준 브랜치 이름이 허용 형식이 아님 (${REF_RULE}) — 무시: ${detected}\n`);
  base = args.base || profile.base_branch || (isSafeRefName(detected) ? detected : null);
  // Second guard: the ref must resolve to a commit before it is placed in a diff argv.
  if (base) {
    try {
      gitRaw("rev-parse", "--verify", "--quiet", `${base}^{commit}`);
    } catch {
      usageError(`기준 브랜치를 커밋으로 해석할 수 없음: ${base} — --base 또는 profile.base_branch 확인`);
    }
  }
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", ".git"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(path.relative(repo, full));
  }
  return out;
}

// ---- rules turned off by missing profile fields (reported as unverified) -------------------
const skipped = skippedRules(profile, { scope: "scan", repo });
const uiDir = profile.ui_dir;
const skippedSet = new Set(skipped.map(r => r.rule));

// ---- U1 inventory --------------------------------------------------------------
const sourceFiles = profile.source_roots.flatMap(r => walk(path.join(repo, r)));
let files = list(args.files);
let newFiles = new Set();
if (!files.length) {
  if (args.all) files = sourceFiles;
  else {
    const untracked = gitPaths("ls-files", "-z", "--others", "--exclude-standard");
    const worktree = [...gitPaths("diff", "--name-only", "-z", "--diff-filter=AMR"), ...untracked];
    // --end-of-options: even a ref that passed both checks can never be read as a git option.
    const branchDiff = filter => (base ? gitPaths("diff", "--name-only", "-z", `--diff-filter=${filter}`, "--end-of-options", `${base}...HEAD`) : []);
    files = [...new Set([...branchDiff("AMR"), ...worktree])];
    newFiles = new Set([...branchDiff("A"), ...untracked]);
  }
}
files = files.filter(f => exts.includes(path.extname(f)) && fs.existsSync(path.join(repo, f)) && !/__tests__|\.test\.|\.spec\.|\.stories\./.test(f));

// ---- defined tokens --------------------------------------------------------------
const cssFiles = sourceFiles.filter(f => f.endsWith(".css"));
const definedVars = new Set();
for (const f of cssFiles) for (const m of fs.readFileSync(path.join(repo, f), "utf8").matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)) definedVars.add(m[1]);
for (const v of profile.runtime_vars ?? []) definedVars.add(v);
// Variables defined from JS/TS: next/font `variable: "--font-x"`, inline style objects, setProperty.
for (const f of sourceFiles.filter(f => /\.(ts|tsx|js|jsx)$/.test(f))) {
  const t = fs.readFileSync(path.join(repo, f), "utf8");
  for (const m of t.matchAll(/(?:variable:\s*|setProperty\(\s*)["'`](--[a-zA-Z0-9_-]+)|["'](--[a-zA-Z0-9_-]+)["']\s*:/g)) definedVars.add(m[1] ?? m[2]);
}
const colorTokens = new Set([...definedVars].filter(v => v.startsWith("--color-")).map(v => v.slice(8)));
const textTokens = new Set([...definedVars].filter(v => v.startsWith("--text-") && !v.includes("--", 2)).map(v => v.slice(7)));

// Tailwind v4 default theme namespaces: defined by the framework, not by project CSS.
// Also runtime vars set by Radix (--radix-*) and dynamic names built in template strings (ending in "-").
const TAILWIND_THEME_VAR = /^--radix-|-$|^--(spacing|leading-|tracking-|text-(xs|sm|base|lg|\d?xl)(--|$)|font-(weight-|sans|serif|mono)|radius-|shadow-|inset-shadow-|drop-shadow-|ease-|animate-|blur-|perspective-|aspect-|breakpoint-|container-|default-|tw-|color-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)\b)/;
const TW_PALETTE = /^(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}$/;
const TW_KEYWORDS = new Set(["white", "black", "transparent", "current", "inherit", "none"]);
const TEXT_NON_COLOR = /^(xs|sm|base|lg|[2-9]?xl|left|center|right|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip)$/;
const BORDER_NON_COLOR = /^([0-9]+|x|y|t|b|l|r|s|e|solid|dashed|dotted|double|hidden|none|collapse|separate|spacing.*|[xytblrse]-[0-9]+|[xytblrse]-\[.*|[xytblrse])$/;

const allowedRaw = (profile.raw_color_allowed ?? []).map(p => new RegExp(p));
const isSkeletonFile = f => (profile.skeleton_files ?? ["skeleton"]).some(p => f.toLowerCase().includes(p));
const tokenFiles = profile.token_definition_files ?? [];
// No token files declared: every CSS custom property definition line counts as a token definition.
const isTokenDefinitionFile = f => !tokenFiles.length || tokenFiles.includes(f);

// Listed findings per (file, rule). Beyond this the rest are only counted: counts = all detected,
// truncated.by_file = omitted per (file, rule), md gets one "외 N건" row per truncated group.
const MAX_PER_FILE_RULE = 60;
const findings = [];
const seen = new Set();
const detected = {}; // rule -> all detected (listed + omitted)
const perFileRule = new Map(); // `${file}\0${rule}` -> {file, rule, severity, listed, omitted}
const add = (file, line, rule, severity, message, snippet) => {
  if (skippedSet.has(rule)) return;
  const detail = rule === "U4-raw-color" ? "" : rule === "U4-undefined-var" ? message.match(/--[\w-]+/)?.[0] : snippet;
  const key = `${file}:${line}:${rule}:${detail}`;
  if (seen.has(key)) return;
  seen.add(key);
  detected[rule] = (detected[rule] ?? 0) + 1;
  const groupKey = `${file}\0${rule}`;
  let group = perFileRule.get(groupKey);
  if (!group) perFileRule.set(groupKey, (group = { file, rule, severity, listed: 0, omitted: 0 }));
  if (group.listed >= MAX_PER_FILE_RULE) {
    group.omitted++;
    return;
  }
  group.listed++;
  findings.push({ file, line, rule, severity, message, snippet: snippet?.trim().slice(0, 160) });
};

/** Per-file line index: lineStarts[k] = offset of line k+1. lineOf() is a binary search (1-based). */
function lineIndex(text) {
  const starts = [0];
  for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) starts.push(i + 1);
  return index => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

function classTokens(text) {
  const tokens = [];
  for (const m of text.matchAll(/className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{([^}]*)\})/g)) {
    const body = m[1] ?? m[2] ?? m[3] ?? m[4] ?? "";
    for (const s of body.matchAll(/["'`]([^"'`]*)["'`]/g)) tokens.push(...s[1].split(/\s+/).map(t => ({ t, i: m.index })));
    if (m[1] ?? m[2] ?? m[3]) tokens.push(...(m[1] ?? m[2] ?? m[3]).split(/\s+/).map(t => ({ t, i: m.index })));
  }
  for (const m of text.matchAll(/\b(?:cn|cva|clsx|twMerge)\(([\s\S]*?)\)/g))
    for (const s of m[1].matchAll(/["'`]([^"'`]*)["'`]/g)) tokens.push(...s[1].split(/\s+/).map(t => ({ t, i: m.index })));
  return tokens.filter(x => x.t);
}

for (const file of files) {
  const text = fs.readFileSync(path.join(repo, file), "utf8");
  const isCss = file.endsWith(".css");
  const inUi = uiDir && file.startsWith(uiDir);
  const lineOf = lineIndex(text);
  const lines = text.split("\n");

  // U4 raw colors
  if (!allowedRaw.some(r => r.test(file))) {
    for (const m of text.matchAll(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab)\(/g)) {
      const lineText = lines[lineOf(m.index) - 1];
      if (/^\s*(\/\/|\*|\/\*)/.test(lineText) || /href=|url\(|#[0-9a-f]{3,8}"?\s*\/\/\s*qa-allow/.test(lineText)) continue;
      // Value of a CSS custom property declaration (`--x: #hex`, also inline `:root{--x:#hex}`).
      const beforeMatch = text.slice(text.lastIndexOf("\n", m.index - 1) + 1, m.index);
      if (isCss && /--[\w-]+\s*:[^;{}]*$/.test(beforeMatch) && isTokenDefinitionFile(file)) continue;
      add(file, lineOf(m.index), "U4-raw-color", "P1", "원시 색상 값. 역할 토큰을 사용", lineText);
    }
  }
  // U4 undefined CSS variables (phantom tokens)
  for (const m of text.matchAll(/var\((--[a-zA-Z0-9_-]+)/g))
    if (!definedVars.has(m[1]) && !TAILWIND_THEME_VAR.test(m[1])) add(file, lineOf(m.index), "U4-undefined-var", "P1", `정의되지 않은 CSS 변수 ${m[1]} (투명/기본값으로 렌더될 수 있음)`, m[0]);

  if (!isCss) {
    // U4/U5 utility classes
    for (const { t, i } of classTokens(text)) {
      const bare = t
        .replace(/^[^\w[!(&-]+|["'`}{,;]+$/g, "")
        .replace(/\)+$/, m => m.slice(0, Math.max(0, (t.match(/\(/g) ?? []).length - (t.match(/\)/g) ?? []).length + m.length)))
        .split(":")
        .pop()
        .replace(/^!|!$/g, "")
        .split("/")[0]
        .replace(/^(border|divide)-[xytblrse]-(?=[a-z])/, "$1-");
      if (TAILWIND_THEME_VAR.test(bare.match(/\((--[\w-]+)\)/)?.[1] ?? "")) continue;
      const cm = bare.match(/^(bg|text|border|ring|outline|fill|stroke|from|via|to|divide|placeholder|decoration|accent|caret)-(.+)$/);
      const shorthandVar = bare.match(/^[a-z-]+-\((--[\w-]+)\)$/); // Tailwind v4 text-(--x)
      if (shorthandVar) {
        if (!definedVars.has(shorthandVar[1]) && !TAILWIND_THEME_VAR.test(shorthandVar[1])) add(file, lineOf(i), "U4-undefined-var", "P1", `정의되지 않은 변수 ${shorthandVar[1]}`, t);
        continue;
      }
      if (cm && !cm[2].startsWith("[")) {
        const [, prefix, value] = cm;
        if (prefix === "text" && (TEXT_NON_COLOR.test(value) || textTokens.has(value))) continue;
        if (["border", "divide", "outline", "ring"].includes(prefix) && (BORDER_NON_COLOR.test(value) || /^offset/.test(value))) continue;
        if (prefix === "bg" && /^(clip|origin|fixed|local|scroll|repeat|no-repeat|cover|contain|auto|center|top|bottom|left|right|gradient|linear|radial|conic|none|blend)/.test(value)) continue;
        if (prefix === "decoration" && /^(solid|double|dotted|dashed|wavy|auto|from-font|clone|slice|\d)/.test(value)) continue;
        if (TW_KEYWORDS.has(value) || colorTokens.has(value)) continue;
        if (TW_PALETTE.test(value)) add(file, lineOf(i), "U4-palette-class", "P2", `Tailwind 기본 팔레트 ${t}. 역할 토큰 우선`, t);
        else if (!/^(opacity|\d)/.test(value)) add(file, lineOf(i), "U4-unknown-token-class", "P1", `정의된 --color-* 토큰이 없는 클래스 ${t}`, t);
      }
      if (/^(text|leading|tracking|font)-\[[\d.]+(px|rem|em)?\]$/.test(bare)) add(file, lineOf(i), "U5-arbitrary-type", "P1", `임의 타이포 값 ${t}. 타이포 역할 사용`, t);
      if (/^(bg|text|border|fill|stroke|ring)-\[(#|rgb|hsl)/.test(bare)) add(file, lineOf(i), "U4-raw-color", "P1", `임의 색상 값 ${t}`, t);
      if (/^(bg|text|border)-\[var\(--/.test(bare)) {
        const v = bare.match(/var\((--[\w-]+)/)[1];
        if (!definedVars.has(v) && !TAILWIND_THEME_VAR.test(v)) add(file, lineOf(i), "U4-undefined-var", "P1", `정의되지 않은 변수 ${v}`, t);
      }
      if (/^(p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y)-\[\d+px\]$/.test(bare)) add(file, lineOf(i), "U6-arbitrary-spacing", "P2", `임의 간격 ${t}. 4px 계열 스케일 사용`, t);
      if (bare === "animate-pulse" && !isSkeletonFile(file)) add(file, lineOf(i), "P6-direct-pulse", "P1", "직접 animate-pulse. 공통 Skeleton 사용", t);
    }
    for (const m of text.matchAll(/fontSize\s*:\s*["'`]?[\d.]+/g)) add(file, lineOf(m.index), "U5-inline-font-size", "P2", "인라인 fontSize", m[0]);

    // U2 primitives
    for (const m of text.matchAll(/from\s+["']([^"']+)["']/g)) {
      const mod = m[1];
      if ((profile.banned_imports ?? []).some(b => mod === b || mod.startsWith(b))) add(file, lineOf(m.index), "U2-banned-import", "P1", `금지된 UI 라이브러리 ${mod}`, m[0]);
      if (!inUi && profile.ui_wrappers?.[mod]) add(file, lineOf(m.index), "U2-bypass-wrapper", "P2", `${mod} 직접 사용. ${profile.ui_wrappers[mod]} 래퍼 우선`, m[0]);
    }
    if (/<(Tabs|TabsList|TabsTrigger)\b/.test(text) && !/<TabsContent\b|Tabs\.Content|TabsPrimitive\.Content/.test(text) && !inUi)
      add(file, lineOf(text.search(/<Tabs/)), "U2-tabs-without-panel", "P1", "Tabs에 대응 패널 없음. 결과를 바꾸는 필터면 ToggleGroup", "<Tabs ...>");
    for (const m of text.matchAll(/<button\b(?![^>]*\btype=)[^>]*>/g)) add(file, lineOf(m.index), "U2-button-no-type", "P2", "native button에 type 없음", m[0]);
    if (/<form\b|onSubmit=/.test(text) && /<Button\b/.test(text) && !/type=["']submit["']/.test(text))
      add(file, lineOf(text.search(/<form\b|onSubmit=/)), "U2-submit-type", "P1", "폼에 type=\"submit\" 버튼 없음 (Button 기본 type은 button)", "");
    if (!inUi && /aria-label=["']breadcrumb["']/i.test(text)) add(file, lineOf(text.search(/aria-label=["']breadcrumb/i)), "U3-duplicate-breadcrumb", "P1", `Breadcrumb 직접 구현. ${uiDir}의 breadcrumb 컴포넌트 사용`, "");
    if (!inUi && /<table\b/.test(text)) add(file, lineOf(text.search(/<table\b/)), "U3-raw-table", "P2", `raw <table>. ${uiDir}의 table 컴포넌트 사용 검토`, "");
    if (/\/page\.(tsx|jsx)$/.test(file) && (text.match(/<h1\b/g) ?? []).length > 1) add(file, 1, "U5-multiple-h1", "P1", "page 파일에 h1 2개 이상", "");

    // A2/A3 accessibility (static layer; the browser layer is audit-a11y.mjs)
    const inComment = i => /^\s*(\/\/|\*|\/\*|\{\/\*)/.test(lines[lineOf(i) - 1]);
    const a11y = (re, fn) => {
      for (const m of text.matchAll(re)) if (!inComment(m.index)) fn(m);
    };
    a11y(/<(img|Image)\b(?![^>]*\balt=)[^>]*>/g, m => add(file, lineOf(m.index), "A2-img-no-alt", "P1", "alt 없는 이미지. 장식이면 alt=\"\"", m[0]));
    a11y(/<(button|Button)\b([^>]*)>\s*<([A-Z]\w*)\b[^>]*\/>\s*<\/\1>/g, m => {
      if (!/aria-label|aria-labelledby|title=/.test(m[2])) add(file, lineOf(m.index), "A2-icon-button-no-label", "P1", `아이콘만 있는 버튼에 aria-label 없음 (<${m[3]} />)`, m[0]);
    });
    a11y(/<(div|span|li|td|tr|p|section|article)\b([^>]*?)\bonClick=/g, m => {
      if (!/\brole=/.test(m[2]) || !/onKeyDown|onKeyUp/.test(text.slice(m.index, m.index + 400))) add(file, lineOf(m.index), "A3-click-non-interactive", "P1", `<${m[1]} onClick>: 키보드로 쓸 수 없음. button/Link 또는 role+tabIndex+키 처리`, m[0]);
    });
    // Skipped when the profile declares an unlayered global :focus-visible rule that overrides
    // outline-none; audit-a11y.mjs A3 then decides from the rendered focus style.
    if (!profile.a11y?.global_focus_rule) a11y(/(?:^|[\s"'`])(?:focus:)?outline-none\b/gm, m => {
      const ln = lineOf(m.index);
      // Look ±4 lines (cva/cn arrays). tabIndex={-1} targets receive programmatic focus only;
      // data-[highlighted] is Radix's roving-focus indicator for menu/select items.
      const near = lines.slice(Math.max(0, ln - 5), ln + 4).join("\n");
      if (!/focus-visible:|focus:ring|focus:border|focus-within:|data-\[highlighted\]|tabIndex=\{-1\}/.test(near)) add(file, ln, "A3-outline-none", "P1", "outline-none 후 대체 포커스 표시 없음 (앞뒤 4줄 기준)", lines[ln - 1]);
    });
    a11y(/tab[iI]ndex=\{?["']?([1-9]\d*)/g, m => add(file, lineOf(m.index), "A3-positive-tabindex", "P2", `양수 tabIndex ${m[1]}. 문서 순서를 바꿈`, m[0]));
    if (!inUi && /role=["']status["'][^>]*aria-busy/.test(text) && /skeleton/i.test(text)) add(file, lineOf(text.search(/role=["']status/)), "P6-status-ownership", "P2", "스켈레톤 status 직접 선언. 상위·공통 컴포넌트와 중복 안내 여부 확인", "");
  }
}

// ---- U3 duplicate component candidates -----------------------------------------------
function signature(file) {
  const text = fs.readFileSync(path.join(repo, file), "utf8");
  const names = [...text.matchAll(/export\s+(?:default\s+)?(?:function|const)\s+([A-Z]\w*)/g)].map(m => m[1]);
  const props = new Set();
  for (const m of text.matchAll(/(?:interface|type)\s+\w*Props\b[^{]*\{([\s\S]*?)\n\}/g))
    for (const p of m[1].matchAll(/^\s*(\w+)\??\s*:/gm)) props.add(p[1]);
  for (const m of text.matchAll(/(?:function\s+[A-Z]\w*|=)\s*\(\s*\{([^}]*)\}/g))
    for (const p of m[1].split(",")) {
      const name = p.trim().split(/[=:\s]/)[0].replace("...", "");
      if (name) props.add(name);
    }
  const tags = new Set([...text.matchAll(/<([A-Za-z][\w.]*)/g)].map(m => m[1]));
  const classes = new Set(classTokens(text).map(x => x.t.split(":").pop()));
  const words = new Set(names.concat(path.basename(file, path.extname(file))).flatMap(n => n.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[\s_-]+/)).filter(w => w.length > 2));
  return { file, names, props, tags, classes, words, importsUi: uiDir ? text.includes(uiDir.replace(/^src\//, "@/")) || text.includes("components/ui") : false };
}
const jaccard = (a, b, min = 1) => {
  if (a.size < min || b.size < min) return 0; // tiny sets (one <span>) are not evidence
  if (!a.size && !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
};

const duplicates = [];
if (!skippedSet.has("U3-duplicate") && uiDir && fs.existsSync(path.join(repo, uiDir))) {
  const catalog = fs.readdirSync(path.join(repo, uiDir)).filter(f => /\.(tsx|jsx)$/.test(f)).map(f => signature(path.join(uiDir, f)));
  const candidates = files.filter(f => /\.(tsx|jsx)$/.test(f) && !f.startsWith(uiDir) && !/\/(page|layout|loading|error|not-found)\.(tsx|jsx)$/.test(f));
  for (const file of candidates) {
    const sig = signature(file);
    if (!sig.names.length) continue;
    const scored = catalog
      .map(c => {
        const s = { name: jaccard(sig.words, c.words), props: jaccard(sig.props, c.props, 2), jsx: jaccard(sig.tags, c.tags, 3), style: jaccard(sig.classes, c.classes, 3) };
        return { ui: c.file, score: +(0.2 * s.name + 0.3 * s.props + 0.25 * s.jsx + 0.25 * s.style).toFixed(2), signals: s };
      })
      // Require a structural signal (props or JSX) so shared utility classes alone do not match.
      .filter(x => x.score >= (profile.duplicate_threshold ?? 0.4) && Math.max(x.signals.props, x.signals.jsx) >= 0.4)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    if (scored.length) duplicates.push({ file, components: sig.names, is_new: newFiles.has(file), imports_ui: sig.importsUi, candidates: scored });
  }
}

// ---- output ------------------------------------------------------------------------------
const loaded = profile.$loaded;
const profileLabel = loaded.from_file ? loaded.path : "없음 — 기본값";
const scopeLabel = mode === "all" ? "전체 (참고용)" : mode === "files" ? "지정" : base ? `${base}...HEAD + 작업 트리` : "작업 트리만 (기준 브랜치 미감지)";
const truncatedGroups = [...perFileRule.values()].filter(g => g.omitted).map(({ file, rule, severity, omitted }) => ({ file, rule, severity, omitted }));
const omittedByRule = truncatedGroups.reduce((m, g) => ((m[g.rule] = (m[g.rule] ?? 0) + g.omitted), m), {});
const omittedTotal = truncatedGroups.reduce((n, g) => n + g.omitted, 0);
const summary = {
  ...runInfo({ tool: "scan-ui-static" }),
  repo,
  profile: loaded.from_file ? loaded.path : null,
  source_roots: profile.source_roots,
  source_roots_fallback: loaded.source_roots_fallback,
  mode,
  base,
  files_scanned: files.length,
  skipped_rules: skipped.map(({ rule, field, reason }) => ({ rule, field, reason })),
  findings,
  duplicates,
  // counts = all detected per rule (listed + omitted); findings holds at most MAX_PER_FILE_RULE per (file, rule).
  counts: detected,
  truncated: { limit_per_file_rule: MAX_PER_FILE_RULE, omitted: omittedTotal, by_rule: omittedByRule, by_file: truncatedGroups },
};
// Finding rows with one "외 N건" row after the last listed row of each truncated (file, rule) group.
const findingRows = [];
{
  const lastIndex = new Map();
  findings.forEach((f, i) => lastIndex.set(`${f.file}\0${f.rule}`, i));
  const tail = new Map(truncatedGroups.map(g => [lastIndex.get(`${g.file}\0${g.rule}`), g]));
  findings.forEach((f, i) => {
    findingRows.push([f.severity, f.rule, `${f.file}:${f.line}`, f.message, f.snippet ? `\`${f.snippet}\`` : ""]);
    const g = tail.get(i);
    if (g) findingRows.push([g.severity, g.rule, g.file, `외 ${g.omitted}건 (파일·규칙당 ${MAX_PER_FILE_RULE}건 초과 — 생략, 전체 건수는 규칙별 건수 참조)`, ""]);
  });
}
const countRows = Object.entries(detected)
  .sort()
  .map(([rule, n]) => [rule, n, omittedByRule[rule] ?? 0]);
const md = [
  "# UI 정적 스캔 (후보 — 코드 확인 후 판정)",
  "",
  mdRunHeader({ tool: "scan-ui-static" }, { server: false }),
  "- 방식: 정규식 근사·Tailwind/CSS 변수 기반 (AST 아님) — 모든 발견은 후보이며, 위반 0건이 준수를 뜻하지 않음",
  `- 대상: ${files.length}개 파일 (${scopeLabel})`,
  `- 프로필: ${profileLabel} · source_roots ${profile.source_roots.join(", ")}${loaded.source_roots_fallback ? " (src 없음 — 대체)" : ""} · 건너뛴 규칙 ${skipped.length}개`,
  `- 정의된 CSS 변수 ${definedVars.size}개, --color-* 토큰 ${colorTokens.size}개 기준`,
  ...(tokenFiles.length ? [] : ["- token_definition_files 없음 — CSS 사용자 정의 속성 정의(`--x: 값`)는 모든 CSS 파일에서 U4-raw-color 제외"]),
  "",
  "## 건너뛴 규칙(미검증)",
  "",
  skipped.length ? mdTable(["규칙", "필드", "사유"], skipped.map(r => [r.rule, r.field, r.reason])) : "없음",
  "",
  "## 규칙별 건수",
  "",
  countRows.length ? mdTable(["규칙", "건수", "목록 생략"], countRows) : "없음",
  "",
  "## 발견 목록",
  "",
  ...(omittedTotal ? [`- 파일·규칙당 ${MAX_PER_FILE_RULE}건까지만 나열 — ${truncatedGroups.length}개 묶음에서 ${omittedTotal}건 생략 (json \`truncated\`)`, ""] : []),
  findingRows.length ? mdTable(["심각도", "규칙", "위치", "내용", "코드"], findingRows) : "없음",
  "",
  "## 중복 컴포넌트 후보 (U3)",
  "",
  skippedSet.has("U3-duplicate")
    ? "미검증 (건너뛴 규칙 참조)"
    : duplicates.length
      ? mdTable(["신규/변경 파일", "컴포넌트", "ui import", "후보 (점수: 이름/props/JSX/스타일)"], duplicates.map(d => [d.file + (d.is_new ? " (신규)" : ""), d.components.join(", "), d.imports_ui ? "예" : "아니오", d.candidates.map(c => `${path.basename(c.ui)} ${c.score} (${c.signals.name.toFixed(2)}/${c.signals.props.toFixed(2)}/${c.signals.jsx.toFixed(2)}/${c.signals.style.toFixed(2)})`).join("<br>")]))
      : "후보 없음",
  "",
].join("\n");
const jsonPath = path.join(args.out, "ui-static.json");
const mdPath = path.join(args.out, "ui-static.md");
writeFile(jsonPath, summary);
writeFile(mdPath, md);
// stdout: summary only (the full table can be MBs on large inputs) — details are in the md/json.
const totalDetected = Object.values(detected).reduce((a, b) => a + b, 0);
console.log(
  [
    `scan-ui-static: ${files.length}개 파일 (${scopeLabel}) · 발견 ${totalDetected}건${omittedTotal ? ` (목록 생략 ${omittedTotal}건)` : ""} · 중복 후보 ${duplicates.length}건 · 건너뛴 규칙 ${skipped.length}개`,
    ...countRows.map(([rule, n, omitted]) => `  ${rule}: ${n}${omitted ? ` (생략 ${omitted})` : ""}`),
    `산출물: ${mdPath}`,
    `        ${jsonPath}`,
  ].join("\n"),
);
