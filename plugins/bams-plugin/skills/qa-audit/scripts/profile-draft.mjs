#!/usr/bin/env node
// Draft a project QA profile from what the target repo already shows. Static, no browser, no network.
// Writes ONLY <out>/qa-profile.draft.json — never anything in the target repo's profile location.
// The user decides whether to save it as <repo>/.crew/qa-profile.json (schema: references/qa-profile.md).
//
//   node profile-draft.mjs --repo <target repo> --out .crew/artifacts/qa/<YYYY-MM-DD>-<scope>/
//     [--server dev|prod|staging|unknown] [--allow-remote]   (common flags, accepted and unused)
//
// Detects: source_roots, ui_dir (src/components/ui, components/ui), token definition CSS (files that define
// >= 5 distinct custom properties), ui_wrappers (files in ui_dir importing @radix-ui/react-*), base_branch,
// base_url (port from package.json "dev" script: -p 3001, --port 3001, PORT=3001).
// Fields that cannot be inferred (typography, core_routes, ...) stay empty and are listed in "_todo".
// "_"-prefixed keys are ignored by validateProfile(), so the draft can be saved as is.
//
// Exit: 0 written · 2 usage error (missing/unknown flag, repo not found, --out ending in qa-profile.json).
import fs from "node:fs";
import path from "node:path";
import { parseArgs, requireArgs, usageError, writeFile, detectBaseBranch } from "./lib/common.mjs";
import { DEFAULT_PROFILE, checkProfile } from "./lib/profile.mjs";

const args = parseArgs(process.argv.slice(2), { known: ["repo", "out"] });
requireArgs(args, ["repo", "out"]);

const repo = path.resolve(args.repo);
if (!fs.existsSync(repo) || !fs.statSync(repo).isDirectory()) usageError(`--repo 디렉터리 없음: ${args.repo}`);
const outDir = path.resolve(args.out);
if (/qa-profile\.json$/i.test(path.basename(outDir))) usageError(`--out은 실행 산출물 디렉터리여야 함 (프로필 파일 직접 쓰기 거부): ${args.out}`);
if (fs.existsSync(outDir) && !fs.statSync(outDir).isDirectory()) usageError(`--out이 파일임 (디렉터리 필요): ${args.out}`);
const outFile = path.join(outDir, "qa-profile.draft.json");

const SKIP_DIRS = new Set(["node_modules", ".git", ".next", ".turbo", ".vercel", ".crew", "dist", "build", "out", "coverage", "storybook-static"]);
const MAX_FILES = 20000;
const rel = file => path.relative(repo, file).split(path.sep).join("/");
const exists = p => fs.existsSync(path.join(repo, p));

function walk(dir, test, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (acc.length >= MAX_FILES) break;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(full, test, acc);
    } else if (e.isFile() && test(e.name)) acc.push(full);
  }
  return acc;
}

const read = file => {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
};

const draft = { $schema_version: 1, name: path.basename(repo) };
const detected = {};
const todo = [];

// source_roots: src, else existing app/components/pages (same fallback as loadProfile)
const roots = exists("src") ? ["src"] : ["app", "components", "pages"].filter(exists);
if (roots.length) {
  draft.source_roots = roots;
  detected.source_roots = roots[0] === "src" ? "src/ 존재" : "src/ 없음 — app/components/pages 중 존재하는 것";
} else {
  todo.push("source_roots: src/app/components/pages 모두 없음 — 소스 루트를 직접 지정");
}

// ui_dir
const uiDir = ["src/components/ui", "components/ui"].find(exists) ?? null;
draft.ui_dir = uiDir;
if (uiDir) detected.ui_dir = `${uiDir}/ 존재`;
else todo.push("ui_dir: src/components/ui·components/ui 없음 — 공용 UI 디렉터리를 지정(없으면 U2 래퍼·U3 규칙 건너뜀)");

// token_definition_files: CSS files defining >= 5 distinct custom properties
const TOKEN_MIN = 5;
const cssRoots = [...new Set([...roots, "styles"])].filter(exists);
const tokenFiles = cssRoots
  .flatMap(r => walk(path.join(repo, r), name => /\.(css|scss|pcss)$/i.test(name)))
  .map(file => ({ file: rel(file), count: new Set([...read(file).matchAll(/(?:^|[{;\s])(--[A-Za-z0-9_-]+)\s*:/g)].map(m => m[1])).size }))
  .filter(x => x.count >= TOKEN_MIN)
  .sort((a, b) => b.count - a.count || a.file.localeCompare(b.file));
draft.token_definition_files = tokenFiles.map(x => x.file);
if (tokenFiles.length) detected.token_definition_files = tokenFiles.map(x => `${x.file} (사용자 정의 속성 ${x.count}개)`).join(", ");
else todo.push(`token_definition_files: 사용자 정의 속성 ${TOKEN_MIN}개 이상 정의한 CSS 없음 — 토큰 정의 파일을 지정`);

// ui_wrappers: @radix-ui/react-* imported inside ui_dir -> wrapper file (utility primitives excluded)
const RADIX_UTILITY = /^@radix-ui\/react-(slot|primitive|compose-refs|context|id|presence|use-[\w-]+)$/;
const wrappers = {};
if (uiDir) {
  const uiFiles = walk(path.join(repo, uiDir), name => /\.(tsx|ts|jsx|js)$/.test(name));
  const byModule = new Map();
  for (const file of uiFiles) {
    const text = read(file);
    for (const m of text.matchAll(/(?:from\s*|import\s*\(?\s*|require\s*\(\s*)["'](@radix-ui\/react-[\w-]+)["']/g)) {
      const mod = m[1];
      if (RADIX_UTILITY.test(mod)) continue;
      if (!byModule.has(mod)) byModule.set(mod, new Set());
      byModule.get(mod).add(rel(file));
    }
  }
  for (const [mod, files] of [...byModule].sort(([a], [b]) => a.localeCompare(b))) {
    const list = [...files].sort();
    const stem = mod.replace("@radix-ui/react-", "");
    wrappers[mod] = list.find(f => path.basename(f).replace(/\.\w+$/, "").toLowerCase() === stem) ?? list[0];
  }
}
draft.ui_wrappers = wrappers;
if (Object.keys(wrappers).length) detected.ui_wrappers = `${uiDir}에서 @radix-ui/react-* import ${Object.keys(wrappers).length}개 (slot·primitive 등 유틸 제외)`;
else todo.push("ui_wrappers: ui_dir에서 @radix-ui/react-* 래퍼 미감지 — 직접 사용을 막을 모듈과 래퍼 경로를 지정(없으면 U2-bypass-wrapper 건너뜀)");

// base_branch
const baseBranch = detectBaseBranch(repo);
draft.base_branch = baseBranch;
if (baseBranch) detected.base_branch = `git: ${baseBranch}`;
else todo.push("base_branch: git 기준 브랜치 미감지 — 변경 범위 scan의 기준 브랜치를 지정");

// base_url: port from package.json "dev" script
let pkg = null;
try {
  pkg = JSON.parse(read(path.join(repo, "package.json")) || "null");
} catch {
  pkg = null;
}
const devScript = typeof pkg?.scripts?.dev === "string" ? pkg.scripts.dev : null;
const port = devScript?.match(/(?:^|\s)(?:-p|--port)(?:\s+|=)(\d{2,5})\b/)?.[1] ?? devScript?.match(/(?:^|\s)PORT=(\d{2,5})\b/)?.[1] ?? null;
if (port) {
  draft.base_url = `http://localhost:${port}`;
  detected.base_url = `package.json scripts.dev 포트 ${port}`;
} else {
  draft.base_url = DEFAULT_PROFILE.base_url;
  todo.push(`base_url: ${devScript ? "dev 스크립트에 포트 지정 없음" : "package.json dev 스크립트 없음"} — 기본값 ${DEFAULT_PROFILE.base_url} 확인`);
}

// Not inferable: left empty, listed in _todo
draft.core_routes = [];
draft.typography = {};
todo.push(
  "core_routes: 핵심 경로를 지정(탐색 모드·standard 기본 라우트)",
  "typography: 역할 클래스별 크기·줄 간격·굵기 지정(비면 U5-role-mismatch 건너뜀)",
  "extra_font_sizes_px·page_structure·perf.nocache_header·perf.budgets·loading.*_ms: 비면 해당 규칙 미검증 — references/qa-profile.md 참조"
);

draft._todo = todo;
draft._detected = detected;
draft._generated = { at: new Date().toISOString(), tool: "profile-draft.mjs" };

const { errors } = checkProfile(draft);
if (errors.length) throw new Error(`draft가 스키마를 통과하지 못함 (버그): ${errors.join("; ")}`);

writeFile(outFile, JSON.stringify(draft, null, 2) + "\n");

const show = v => (Array.isArray(v) ? (v.length ? v.join(", ") : "(없음)") : v === null ? "(미감지)" : typeof v === "object" ? (Object.keys(v).length ? Object.entries(v).map(([k, x]) => `${k} → ${x}`).join(", ") : "(없음)") : String(v));
console.log(`프로필 초안: ${outFile}`);
for (const key of ["name", "base_url", "base_branch", "source_roots", "ui_dir", "token_definition_files", "ui_wrappers"]) console.log(`  ${key}: ${show(draft[key])}`);
console.log(`  _todo ${todo.length}건 — 저장 전 확인 필요`);
console.log("대상 레포에는 쓰지 않음. 저장은 사용자 승인 후 <repo>/.crew/qa-profile.json 으로.");
