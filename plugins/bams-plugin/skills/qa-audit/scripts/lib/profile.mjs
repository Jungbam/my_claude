// Project QA profile for bams qa-audit scripts. Node 18+ ESM, no npm dependencies.
// Profile file: target repo .crew/qa-profile.json (optional). Missing fields fall back to DEFAULT_PROFILE;
// rules that need a missing field are reported by skippedRules() as unverified, never as passed.
// Schema doc: skills/qa-audit/references/qa-profile.md. Output dir: <run> = .crew/artifacts/qa/<YYYY-MM-DD>-<scope>
import fs from "node:fs";
import path from "node:path";
import { usageError } from "./common.mjs";

/** Defaults ($schema_version 1). name/base_branch/source_roots are filled per repo by loadProfile(). */
export const DEFAULT_PROFILE = Object.freeze({
  $schema_version: 1,
  name: null, // repo directory name
  base_url: "http://localhost:3000",
  core_routes: [],
  routes: [],
  ready_selector: null,
  viewports: "1440x1000,390x844",
  base_branch: null, // auto-detect (detectBaseBranch)
  design_docs: [],
  source_roots: ["src"], // falls back to existing app/components/pages
  extensions: [".ts", ".tsx", ".js", ".jsx", ".css"],
  ui_dir: null,
  token_definition_files: [],
  runtime_vars: [],
  raw_color_allowed: [],
  skeleton_files: ["skeleton", "placeholder"],
  banned_imports: [],
  ui_wrappers: {},
  duplicate_threshold: 0.4,
  typography: {},
  extra_font_sizes_px: [],
  mobile_breakpoint_px: 768,
  target_size_px: { mobile: 44, minimum: 24 },
  contrast: { normal: 4.5, large: 3, ui: 3 },
  page_structure: {},
  perf: {
    server_env: [],
    nocache_header: null,
    server_timing_names: [], // empty = all
    budgets: {},
  },
  a11y: {
    axe_tags: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
    global_focus_rule: false,
    skip_link_pattern: "skip|본문|main content|콘텐츠로",
    reflow_width: 320,
    tab_limit: 80,
    placeholder_glyphs: ["—", "–", "-", "N/A", "n/a"],
    skeleton_selector: "[data-slot='skeleton'],.animate-pulse,[class*='skeleton']",
    // Dev-server tooling is not product UI (Next.js dev overlay, TanStack Query devtools).
    ignore_selector: "nextjs-portal,[data-nextjs-toast],[data-nextjs-dialog-overlay],.tsqd-parent-container,.tsqd-open-btn",
  },
  loading: {
    busy_selector: "[role='status'][aria-busy='true']",
    blocking_threshold_ms: null,
    slow_ms: null,
    overdue_ms: null,
  },
  project_checks: [],
  notation_rules: [],
  forbidden_ops: [],
});

const isPlainObject = v => v !== null && typeof v === "object" && !Array.isArray(v);

/** Deep merge: plain objects merge recursively, arrays and scalars from override replace. Inputs are not mutated. */
export function deepMerge(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) return structuredClone(override === undefined ? base : override);
  const out = structuredClone(base);
  for (const [key, value] of Object.entries(override)) {
    out[key] = isPlainObject(value) && isPlainObject(out[key]) ? deepMerge(out[key], value) : structuredClone(value);
  }
  return out;
}

// ---- validation ($schema_version 1) ---------------------------------------------------------
// Each node is (value, path, ctx) => void and pushes to ctx.errors ("profile.<field>: expected <type>")
// or ctx.unknown (unknown keys). Keys starting with "_" are comments (e.g. the draft's _todo) and are ignored.

const isFiniteNumber = v => typeof v === "number" && Number.isFinite(v);
const label = p => (p.startsWith("[") ? `profile${p}` : `profile.${p}`);
const child = (parent, key) => {
  if (typeof key === "number") return `${parent}[${key}]`;
  if (!/^[A-Za-z_$][\w$-]*$/.test(key)) return `${parent}[${JSON.stringify(key)}]`;
  return parent ? `${parent}.${key}` : key;
};
const typeError = (ctx, p, expected) => ctx.errors.push(`${label(p)}: expected ${expected}`);

function leaf(expected, test) {
  const node = (v, p, ctx) => {
    if (!test(v)) typeError(ctx, p, expected);
  };
  return Object.assign(node, { expected, test });
}
const str = leaf("string", v => typeof v === "string");
const num = leaf("number", isFiniteNumber);
const bool = leaf("boolean", v => typeof v === "boolean");
const regex = leaf("regex", v => {
  if (typeof v !== "string") return false;
  try {
    new RegExp(v);
    return true;
  } catch {
    return false;
  }
});
const any = leaf("any", v => v !== undefined);

/**
 * Git ref name safe to place in a git argv (base_branch, --base, detectBaseBranch result):
 * [A-Za-z0-9._/@-] only, not starting with "-" (option injection such as --output=<path>),
 * no ".." (range syntax; also invalid in ref names).
 */
export const isSafeRefName = v => typeof v === "string" && /^[A-Za-z0-9._/@-]+$/.test(v) && !v.startsWith("-") && !v.includes("..");
const refName = leaf("ref name", isSafeRefName);
const oneOf = values => leaf(values.map(v => JSON.stringify(v)).join("|"), v => values.includes(v));
const orNull = node => leaf(`${node.expected}|null`, v => v === null || node.test(v));

function arrayOf(item) {
  const expected = `${item.expected}[]`;
  const node = (v, p, ctx) => {
    if (!Array.isArray(v)) return typeError(ctx, p, expected);
    v.forEach((x, i) => item(x, child(p, i), ctx));
  };
  return Object.assign(node, { expected, test: Array.isArray });
}

/** Object with known keys. Unknown keys -> ctx.unknown; required keys missing -> type error. */
function shape(fields, { required = [] } = {}) {
  const node = (v, p, ctx) => {
    if (!isPlainObject(v)) return typeError(ctx, p, "object");
    for (const [key, value] of Object.entries(v)) {
      if (key.startsWith("_")) continue;
      if (fields[key]) fields[key](value, child(p, key), ctx);
      else ctx.unknown.push(label(child(p, key)));
    }
    for (const key of required) if (!(key in v)) typeError(ctx, child(p, key), fields[key].expected);
  };
  return Object.assign(node, { expected: "object", test: isPlainObject, fields });
}

/** Object with free keys (role, module, route...) whose values all match `value`. */
function mapOf(value) {
  const node = (v, p, ctx) => {
    if (!isPlainObject(v)) return typeError(ctx, p, "object");
    for (const [key, x] of Object.entries(v)) if (!key.startsWith("_")) value(x, child(p, key), ctx);
  };
  return Object.assign(node, { expected: "object", test: isPlainObject });
}

const strList = arrayOf(str);
export const PAGE_STRUCTURE_KEYS = Object.freeze(["container", "breadcrumb", "header", "card", "table", "skeleton", "refresh_notice", "empty"]);
export const PROJECT_CHECK_AXES = Object.freeze(["ui", "a11y", "perf"]);

const PROFILE_SCHEMA = shape({
  $schema_version: leaf("1", v => v === 1),
  name: orNull(str),
  base_url: str,
  core_routes: strList,
  routes: strList,
  ready_selector: orNull(str),
  viewports: str,
  base_branch: orNull(refName),
  design_docs: strList,
  source_roots: strList,
  extensions: strList,
  ui_dir: orNull(str),
  token_definition_files: strList,
  runtime_vars: strList,
  raw_color_allowed: arrayOf(regex),
  skeleton_files: strList,
  banned_imports: strList,
  ui_wrappers: mapOf(str),
  duplicate_threshold: num,
  typography: mapOf(shape({ size_rem: num, size_px_desktop: num, size_px_mobile: num, line_height: num, weight: num })),
  extra_font_sizes_px: arrayOf(num),
  mobile_breakpoint_px: num,
  target_size_px: shape({ mobile: num, minimum: num }),
  contrast: shape({ normal: num, large: num, ui: num }),
  page_structure: shape(Object.fromEntries(PAGE_STRUCTURE_KEYS.map(k => [k, any]))),
  perf: shape({
    server_env: strList,
    nocache_header: orNull(str),
    server_timing_names: strList,
    budgets: mapOf(shape({ api_p95_ms: num, lcp_mobile_ms: num, ready_ms: num })),
  }),
  a11y: shape({
    axe_tags: strList,
    global_focus_rule: bool,
    skip_link_pattern: regex,
    reflow_width: num,
    tab_limit: num,
    placeholder_glyphs: strList,
    skeleton_selector: str,
    ignore_selector: str,
  }),
  loading: shape({ busy_selector: str, blocking_threshold_ms: orNull(num), slow_ms: orNull(num), overdue_ms: orNull(num) }),
  project_checks: arrayOf(shape({ name: str, cmd: str, axis: oneOf(PROJECT_CHECK_AXES) }, { required: ["name", "cmd", "axis"] })),
  notation_rules: arrayOf(shape({ scope: str, rule: str })),
  forbidden_ops: strList,
});

/** Validate without exiting: {errors: ["profile.<field>: expected <type>"], unknown: ["profile.<key>"]}. */
export function checkProfile(profile) {
  const ctx = { errors: [], unknown: [] };
  if (!isPlainObject(profile)) ctx.errors.push("profile: expected object");
  else PROFILE_SCHEMA(profile, "", ctx);
  return ctx;
}

// Guard: every DEFAULT_PROFILE key is known to the schema and every default value passes it.
{
  const self = checkProfile(DEFAULT_PROFILE);
  if (self.errors.length || self.unknown.length) throw new Error(`DEFAULT_PROFILE/schema mismatch: ${[...self.errors, ...self.unknown].join(", ")}`);
}

/**
 * Validate a profile object as written in the file (before merging defaults).
 * Type mismatch or $schema_version other than 1 -> every error on stderr, exit 2.
 * Unknown keys -> one stderr warning line (not a failure). Returns {unknown}.
 */
export function validateProfile(profile, { source = "프로필" } = {}) {
  const { errors, unknown } = checkProfile(profile);
  if (unknown.length) process.stderr.write(`경고: ${source} 알 수 없는 키 ${unknown.length}개 (무시됨): ${unknown.join(", ")}\n`);
  if (errors.length) usageError(`${errors.join("\n")}\n프로필 검증 실패 ${errors.length}건: ${source} — 스키마 skills/qa-audit/references/qa-profile.md`);
  return { unknown };
}

const SOURCE_ROOT_FALLBACKS = ["app", "components", "pages"];

/**
 * Load profile: DEFAULT_PROFILE deep-merged with the JSON at profilePath (optional).
 * Unreadable/invalid JSON or a validateProfile() type error exits 2 (unknown keys only warn). Fills name (repo dir name) and source_roots fallback
 * (src -> existing app/components/pages) when the file does not set them.
 * The result carries a non-enumerable `$loaded` = {path, repo, from_file, source_roots_fallback}.
 */
export function loadProfile(profilePath, { repo = process.cwd() } = {}) {
  const repoDir = path.resolve(repo);
  let fromFile = {};
  if (profilePath) {
    const file = path.resolve(profilePath);
    if (!fs.existsSync(file)) usageError(`프로필 없음: ${profilePath}`);
    try {
      fromFile = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
      usageError(`프로필 JSON 오류: ${profilePath} — ${error.message}`);
    }
    if (!isPlainObject(fromFile)) usageError(`프로필 최상위는 객체여야 함: ${profilePath}`);
    validateProfile(fromFile, { source: profilePath });
  }
  const profile = deepMerge(DEFAULT_PROFILE, fromFile);
  if (!profile.name) profile.name = path.basename(repoDir);
  let fallback = false;
  if (!("source_roots" in fromFile) && !fs.existsSync(path.join(repoDir, "src"))) {
    const found = SOURCE_ROOT_FALLBACKS.filter(d => fs.existsSync(path.join(repoDir, d)));
    if (found.length) {
      profile.source_roots = found;
      fallback = true;
    }
  }
  Object.defineProperty(profile, "$loaded", {
    value: { path: profilePath ? path.resolve(profilePath) : null, repo: repoDir, from_file: !!profilePath, source_roots_fallback: fallback },
    enumerable: false,
  });
  return profile;
}

const isEmpty = v => v === null || v === undefined || v === "" || (Array.isArray(v) ? v.length === 0 : isPlainObject(v) && Object.keys(v).length === 0);

function uiDirHas(profile, pattern, repo = profile.$loaded?.repo) {
  if (!repo || !profile.ui_dir) return null; // unknown
  try {
    return fs.readdirSync(path.join(repo, profile.ui_dir)).some(f => pattern.test(f));
  } catch {
    return false;
  }
}

/**
 * Rules turned off because a profile field is missing. Each is reported as unverified (not passed).
 * scope: "scan" (scan-ui-static) | "computed" (inspect-computed-style) | "perf" | "checklist"; omit for all.
 * repo: target repo dir used to check that ui_dir exists (default: the repo loadProfile() was called with).
 * Returns [{rule, reason, field, scope}].
 */
export function skippedRules(profile, { scope, repo } = {}) {
  const out = [];
  const skip = (s, rule, field, reason) => out.push({ rule, reason: reason ?? `profile.${field} 없음`, field, scope: s });
  const p = profile ?? {};
  const repoDir = repo ? path.resolve(repo) : p.$loaded?.repo;

  if (isEmpty(p.ui_wrappers)) skip("scan", "U2-bypass-wrapper", "ui_wrappers");
  if (isEmpty(p.banned_imports)) skip("scan", "U2-banned-import", "banned_imports");
  if (isEmpty(p.ui_dir)) {
    skip("scan", "U2-tabs-without-panel", "ui_dir", "profile.ui_dir 없음 — 래퍼 판정 불가");
    skip("scan", "U3-duplicate", "ui_dir", "profile.ui_dir 없음 — 중복 컴포넌트 비교 불가");
    skip("scan", "U3-duplicate-breadcrumb", "ui_dir");
    skip("scan", "U3-raw-table", "ui_dir");
  } else {
    if (uiDirHas(p, /^breadcrumb/i, repoDir) === false) skip("scan", "U3-duplicate-breadcrumb", "ui_dir", `${p.ui_dir}에 breadcrumb* 파일 없음`);
    if (uiDirHas(p, /^table/i, repoDir) === false) skip("scan", "U3-raw-table", "ui_dir", `${p.ui_dir}에 table* 파일 없음`);
    if (repoDir && !fs.existsSync(path.join(repoDir, p.ui_dir))) skip("scan", "U3-duplicate", "ui_dir", `${p.ui_dir} 경로 없음 — 중복 컴포넌트 비교 불가`);
  }

  if (isEmpty(p.typography)) skip("computed", "U5-role-mismatch", "typography");
  if (isEmpty(p.extra_font_sizes_px)) skip("computed", "U5-off-scale", "extra_font_sizes_px");

  if (isEmpty(p.perf?.nocache_header)) skip("perf", "P-server-cold", "perf.nocache_header", "profile.perf.nocache_header 없음 — 캐시 우회 수단 없음");
  if (isEmpty(p.perf?.budgets)) skip("perf", "P-budget", "perf.budgets", "profile.perf.budgets 없음 — 기준선만, 성능 판정 미사용");

  if (isEmpty(p.page_structure?.skeleton)) skip("checklist", "L-skeleton", "page_structure.skeleton");
  if (isEmpty(p.page_structure?.refresh_notice)) skip("checklist", "L-refresh-notice", "page_structure.refresh_notice");
  for (const key of ["blocking_threshold_ms", "slow_ms", "overdue_ms"]) {
    if (isEmpty(p.loading?.[key])) skip("checklist", `L-${key.replace(/_ms$/, "").replaceAll("_", "-")}`, `loading.${key}`);
  }

  return scope ? out.filter(r => r.scope === scope) : out;
}
