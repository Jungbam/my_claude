// Shared helpers for bams qa-audit scripts. Node 18+ ESM.
// External npm dependencies are limited to playwright and axe-core, both resolved from the
// plugin bundle (<plugin root>/node_modules) — never added to or loaded from the target app repo.
// This file is the ONLY place allowed to require/import playwright; other scripts call loadPlaywright()
// (exits 3 when missing) or tryLoadPlaywright() (never exits).
//
// Exit codes (all scripts):
//   0  run completed (finding defects is still 0)
//   2  usage error, guard refusal (remote host, cross-origin route), profile validation failure
//   3  environment missing (Playwright package or browser binary)
//
// Common flags: --allow-remote (hosts other than localhost/127.0.0.1/::1),
//               --server dev|prod|staging|unknown (default unknown, recorded by runInfo()).
// Output dir convention: <run> = .crew/artifacts/qa/<YYYY-MM-DD>-<scope>
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---- exit codes --------------------------------------------------------------------------

export const EXIT = Object.freeze({ OK: 0, USAGE: 2, ENV: 3 });

/** Print message to stderr and exit with code (default 2). */
export function fail(code, message) {
  process.stderr.write(`${message}\n`);
  process.exit(code ?? EXIT.USAGE);
}

export const usageError = message => fail(EXIT.USAGE, message);
export const envError = message => fail(EXIT.ENV, message);

/** Exit 2 unless every named --key has a value. */
export function requireArgs(args, names) {
  const missing = names.filter(n => args[n] === undefined || args[n] === null || args[n] === "");
  if (missing.length) usageError(`${missing.map(n => `--${n}`).join(", ")} 필요`);
}

// ---- plugin root -------------------------------------------------------------------------

let pluginRootCache;

/** Plugin root: scripts/lib -> scripts -> qa-audit -> skills -> <plugin root>, confirmed by package.json name. */
export function pluginRoot() {
  if (pluginRootCache !== undefined) return pluginRootCache;
  const isPlugin = dir => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).name === "bams-plugin";
    } catch {
      return false;
    }
  };
  const expected = path.resolve(HERE, "../../../..");
  if (isPlugin(expected)) return (pluginRootCache = expected);
  for (let dir = HERE; ; dir = path.dirname(dir)) {
    if (isPlugin(dir)) return (pluginRootCache = dir);
    if (path.dirname(dir) === dir) break;
  }
  return (pluginRootCache = null);
}

const rootLabel = () => pluginRoot() ?? "<plugin root>";

function packageVersion(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).version ?? null;
  } catch {
    return null;
  }
}

const isInside = (child, parent) => {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};

// ---- Playwright --------------------------------------------------------------------------

/**
 * Locate Playwright without exiting. Order:
 *   1 env PLAYWRIGHT_MODULE (absolute path to the playwright package dir)
 *   2 plugin bundle <plugin root>/node_modules/playwright
 *   3 createRequire(import.meta.url) / NODE_PATH — results under <cwd>/node_modules are rejected
 * The target repo's (cwd) node_modules is never used.
 * Returns {status:"found", source:"env"|"bundle"|"resolve", path, version} or {status:"missing", reason, tried}.
 */
export function resolvePlaywright() {
  const tried = [];
  const envPath = process.env.PLAYWRIGHT_MODULE;
  if (envPath) {
    const dir = path.resolve(envPath);
    if (fs.existsSync(path.join(dir, "package.json"))) return { status: "found", source: "env", path: dir, version: packageVersion(dir) };
    tried.push(`env PLAYWRIGHT_MODULE=${envPath} (package.json 없음)`);
  }
  const root = pluginRoot();
  if (root) {
    const dir = path.join(root, "node_modules", "playwright");
    if (fs.existsSync(path.join(dir, "package.json"))) return { status: "found", source: "bundle", path: dir, version: packageVersion(dir) };
    tried.push(`bundle ${dir} (없음)`);
  } else {
    tried.push("bundle (플러그인 루트 확인 실패)");
  }
  try {
    const dir = path.dirname(require.resolve("playwright/package.json"));
    if (isInside(dir, path.join(process.cwd(), "node_modules"))) tried.push(`resolve ${dir} (대상 레포 node_modules — 사용 안 함)`);
    else return { status: "found", source: "resolve", path: dir, version: packageVersion(dir) };
  } catch {
    tried.push("resolve playwright (createRequire/NODE_PATH 실패)");
  }
  return { status: "missing", reason: "Playwright 패키지를 찾지 못함", tried };
}

export const PLAYWRIGHT_INSTALL_HINT = () =>
  `(cd ${rootLabel()} && bun install && bunx playwright install chromium) 또는 bash ${rootLabel()}/setup.sh`;

let playwrightCache;
let playwrightLoadedInfo;

/**
 * Load Playwright without exiting (resolvePlaywright order).
 * Returns {ok:true, playwright, info} or {ok:false, info, reason, hint}:
 *   info.status "missing" -> package not found (reason = info.reason)
 *   info.status "found"   -> package found but require failed (reason = the require error message)
 */
export async function tryLoadPlaywright() {
  if (playwrightCache) return { ok: true, playwright: playwrightCache, info: playwrightLoadedInfo };
  const info = resolvePlaywright();
  const hint = PLAYWRIGHT_INSTALL_HINT();
  if (info.status !== "found") return { ok: false, info, reason: info.reason, hint };
  try {
    // "resolve" loads by name (same lookup as resolvePlaywright step 3); env/bundle load by absolute path.
    playwrightCache = info.source === "resolve" ? require("playwright") : require(info.path);
  } catch (error) {
    return { ok: false, info, reason: String(error.message), hint };
  }
  playwrightLoadedInfo = info;
  return { ok: true, playwright: playwrightCache, info };
}

/** Load Playwright (tryLoadPlaywright). Missing or unloadable -> exit 3 with install guidance. Module has .chromium, .devices. */
export async function loadPlaywright() {
  const r = await tryLoadPlaywright();
  if (r.ok) return r.playwright;
  if (r.info.status !== "found") envError(`Playwright 미설치 — ${r.hint}\n  시도: ${r.info.tried.join("; ")}`);
  envError(`Playwright 로드 실패 (${r.info.source}: ${r.info.path}) — ${r.hint}\n  원인: ${r.reason}`);
}

/** Resolution info of the last loadPlaywright() call (or a fresh resolve). */
export const playwrightInfo = () => playwrightLoadedInfo ?? resolvePlaywright();

export const CHROMIUM_INSTALL_HINT = () => `(cd ${rootLabel()} && bunx playwright install chromium)`;

/** chromium.launch without exiting: {ok:true, browser} or {ok:false, reason (first non-empty error line), hint}. */
export async function tryLaunchChromium(playwright, options = {}) {
  try {
    return { ok: true, browser: await playwright.chromium.launch({ headless: true, ...options }) };
  } catch (error) {
    return { ok: false, reason: String(error.message).split("\n").find(Boolean) ?? "실행 실패", hint: CHROMIUM_INSTALL_HINT() };
  }
}

/** chromium.launch with exit 3 on browser binary failure. */
export async function launchChromium(playwright, options = {}) {
  const r = await tryLaunchChromium(playwright, options);
  if (!r.ok) envError(`브라우저 실행 실패 — ${r.hint}\n  원인: ${r.reason}`);
  return r.browser;
}

// ---- axe-core ----------------------------------------------------------------------------

function axeVersion(file) {
  const fromPkg = packageVersion(path.dirname(file));
  if (fromPkg) return fromPkg;
  try {
    const head = fs.readFileSync(file, "utf8").slice(0, 400);
    return head.match(/axe v?(\d+\.\d+\.\d+)/i)?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Locate axe.min.js. Order: --axe <path> ("none" disables) -> env AXE_PATH -> plugin bundle
 * <plugin root>/node_modules/axe-core -> target repo <repo|cwd>/node_modules/axe-core (read only).
 * Not found is NOT a failure: {status:"unverified", reason}. Found: {status:"found", source:"arg"|"env"|"bundle"|"target-repo", path, version}.
 * An explicit --axe path that does not exist is a usage error (exit 2).
 */
export function resolveAxe(args = {}) {
  const found = (source, file) => ({ status: "found", source, path: file, version: axeVersion(file) });
  const arg = args.axe;
  if (arg === "none") return { status: "unverified", source: "arg", reason: "--axe none (사용자 지정으로 끔)" };
  if (arg) {
    const file = path.resolve(arg);
    if (!fs.existsSync(file)) usageError(`--axe 경로 없음: ${arg}`);
    return found("arg", file);
  }
  const notes = [];
  if (process.env.AXE_PATH) {
    const file = path.resolve(process.env.AXE_PATH);
    if (fs.existsSync(file)) return found("env", file);
    notes.push(`AXE_PATH 경로 없음 (${process.env.AXE_PATH})`);
  }
  const root = pluginRoot();
  if (root) {
    const file = path.join(root, "node_modules", "axe-core", "axe.min.js");
    if (fs.existsSync(file)) return found("bundle", file);
    notes.push(`번들 없음 — (cd ${root} && bun install)`);
  }
  const repo = path.resolve(args.repo || process.cwd());
  const repoFile = path.join(repo, "node_modules", "axe-core", "axe.min.js");
  if (fs.existsSync(repoFile)) return found("target-repo", repoFile);
  notes.push("대상 레포 node_modules/axe-core 없음");
  return { status: "unverified", reason: `axe-core 미발견: ${notes.join("; ")}` };
}

// ---- host / route guards -----------------------------------------------------------------

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export const isLocalHost = hostname => LOCAL_HOSTS.has(String(hostname).toLowerCase());

/**
 * Allow http/https on localhost/127.0.0.1/::1 (any port). Other hosts need --allow-remote, else exit 2.
 * A base with username/password (http://u:p@host) exits 2 — credentials go through --cookie/QA_COOKIE.
 * A base with a query or fragment ("?"/"#") exits 2; a path (http://host/app) is allowed and kept.
 * Remote + cookie (opts.cookie or QA_COOKIE) prints a stderr warning. Returns base without trailing slash.
 */
export function assertAllowedBase(base, allowRemote, { cookie = process.env.QA_COOKIE } = {}) {
  let url;
  try {
    url = new URL(base);
  } catch {
    usageError(`잘못된 --base: ${base}`);
  }
  if (url.username || url.password) usageError(`자격증명이 든 URL은 받지 않는다 — --cookie/QA_COOKIE 사용 (${url.origin})`);
  // Checked on the raw string: new URL() drops an empty "?" or "#". The message never echoes the query.
  if (/[?#]/.test(String(base))) usageError(`base에는 쿼리·조각을 넣지 않는다 — 경로까지만 (${recordedUrl(url.href)})`);
  if (url.protocol !== "http:" && url.protocol !== "https:") usageError(`--base는 http/https만 허용: ${url.origin}`);
  if (!isLocalHost(url.hostname)) {
    if (!allowRemote) usageError(`원격 호스트 차단: --allow-remote 필요 (${url.host})`);
    if (cookie) process.stderr.write(`경고: 원격 호스트 ${url.host}에 쿠키를 전송합니다 (--cookie/QA_COOKIE). 값은 리포트·로그에 남기지 마세요.\n`);
  }
  return String(base).replace(/\/+$/, "");
}

/**
 * Route must be a "/"-path or an absolute URL with the same origin as base; otherwise exit 2.
 * Returns the path (pathname + search + hash) so callers can use base + route.
 */
export function assertRoute(route, base) {
  const raw = String(route ?? "").trim();
  const isAbsolute = /^[a-z][a-z0-9+.-]*:/i.test(raw);
  if (!isAbsolute && !raw.startsWith("/")) usageError(`라우트는 "/"로 시작해야 함: ${raw}`);
  let url;
  let baseUrl;
  try {
    baseUrl = new URL(base);
    url = new URL(raw, baseUrl);
  } catch {
    usageError(`잘못된 라우트: ${raw}`);
  }
  if (url.origin !== baseUrl.origin) usageError(`다른 출처 라우트 차단: ${raw} (base ${baseUrl.origin})`);
  return `${url.pathname}${url.search}${url.hash}`;
}

export const assertRoutes = (routes, base) => list(routes).map(r => assertRoute(r, base));

// ---- args --------------------------------------------------------------------------------

export const SERVER_KINDS = Object.freeze(["dev", "prod", "staging", "unknown"]);
export const COMMON_FLAGS = Object.freeze(["allow-remote"]);
/** Value flags every script accepts (in addition to its own `known` list). */
export const COMMON_VALUE_FLAGS = Object.freeze(["server"]);
let serverKind = "unknown";

/**
 * Parse --key value / --flag arguments. Repeated keys become arrays when the default is an array.
 * Common flags (--allow-remote) are always boolean; --server defaults to "unknown" and is validated.
 * known: the script's value flags. When given, any --key outside flags, known, COMMON_FLAGS and
 * COMMON_VALUE_FLAGS exits 2 ("알 수 없는 플래그: --key"). Bad arguments exit 2.
 */
export function parseArgs(argv, { flags = [], defaults = {}, known } = {}) {
  const allFlags = [...COMMON_FLAGS, ...flags];
  const allowed = known ? new Set([...allFlags, ...COMMON_VALUE_FLAGS, ...known]) : null;
  const args = { server: "unknown", ...defaults };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) usageError(`알 수 없는 인자: ${token}`);
    const key = token.slice(2);
    if (allowed && !allowed.has(key)) usageError(`알 수 없는 플래그: --${key}`);
    if (allFlags.includes(key)) {
      args[key] = true;
      continue;
    }
    const value = argv[++i];
    if (value === undefined) usageError(`--${key} 값 없음`);
    if (key in args && Array.isArray(args[key])) args[key] = [...args[key], value];
    else args[key] = value;
  }
  if (!SERVER_KINDS.includes(args.server)) usageError(`--server는 ${SERVER_KINDS.join("|")} 중 하나: ${args.server}`);
  serverKind = args.server;
  return args;
}

export function list(value) {
  if (value === undefined || value === null || value === "") return [];
  if (Array.isArray(value)) return value.flatMap(list);
  return String(value).split(",").map(s => s.trim()).filter(Boolean);
}

// ---- files -------------------------------------------------------------------------------

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content, null, 2));
}

export function appendJsonl(file, row) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(row) + "\n");
}

export function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        return { corrupt_line: index + 1 };
      }
    });
}

// ---- browser helpers ---------------------------------------------------------------------

/** Viewports: "1440x1000,390x844" -> [{width,height,label}]. Bad value exits 2. */
export function parseViewports(value, fallback = "1440x1000,390x844") {
  return list(value || fallback).map(v => {
    const [width, height] = v.split("x").map(Number);
    if (!width || !height) usageError(`잘못된 viewport: ${v}`);
    return { width, height, label: `${width}` };
  });
}

/** Cookie header string -> Playwright cookies for the base URL host. */
export function cookiesFor(base, cookieHeader) {
  if (!cookieHeader) return [];
  const { hostname } = new URL(base);
  return cookieHeader
    .split(";")
    .map(p => p.trim())
    .filter(Boolean)
    .map(pair => {
      const [name, ...rest] = pair.split("=");
      return { name: name.trim(), value: rest.join("=").trim(), domain: hostname, path: "/" };
    });
}

/**
 * Scroll the whole page once so viewport-lazy sections (IntersectionObserver) load, then return to top.
 * Uses wheel events like a user: some layouts scroll <body> instead of the window. Stops when the
 * page bottom is in view or the position stops changing.
 */
export async function scrollThrough(page, { step = 900, pauseMs = 300, max = 60 } = {}) {
  const bottom = () => page.evaluate(() => Math.round(document.body.getBoundingClientRect().bottom));
  let last = await bottom();
  for (let i = 0; i < max; i++) {
    await page.mouse.wheel(0, step);
    await page.waitForTimeout(pauseMs);
    const now = await bottom();
    const inView = await page.evaluate(() => document.body.getBoundingClientRect().bottom <= innerHeight + 2);
    if (inView || now === last) break;
    last = now;
  }
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.scrollingElement?.scrollTo(0, 0);
    document.body.scrollTo?.(0, 0);
  });
}

// ---- data helpers ------------------------------------------------------------------------

/** Dot/bracket path lookup: "a.b[0].c". Returns undefined when any segment is missing. */
export function getPath(obj, p) {
  if (!p) return obj;
  const parts = String(p).replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let cur = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[part];
  }
  return cur;
}

export function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? encodeURIComponent(vars[k]) : `{${k}}`));
}

export const quantile = (sorted, p) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))] : NaN;

export const median = values => {
  const s = values.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN;
};

export const ms = v => (Number.isFinite(v) ? v.toFixed(0) : "-");

export function mdTable(headers, rows) {
  const esc = v => String(v ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map(r => `| ${r.map(esc).join(" | ")} |`),
  ].join("\n");
}

// ---- run info ----------------------------------------------------------------------------

/**
 * URL -> origin + path, trailing "/" dropped (never userinfo, query or hash): "http://u:p@h/app/?x#y" -> "http://h/app".
 * Non-URL values are returned unchanged.
 */
export function recordedUrl(value) {
  if (typeof value !== "string") return value;
  try {
    const { origin, pathname } = new URL(value);
    return origin && origin !== "null" ? `${origin}${pathname.replace(/\/+$/, "")}` : value;
  } catch {
    return value;
  }
}

/** extra.base is recorded as origin + path only (never credentials, query or hash). */
const safeExtra = extra => ("base" in extra ? { ...extra, base: recordedUrl(extra.base) } : extra);

/** Run metadata for every json output. server comes from the last parseArgs() (--server), overridable via extra. */
export function runInfo(extra = {}) {
  return { measured_at: new Date().toISOString(), node: process.version, server: serverKind, ...safeExtra(extra) };
}

/**
 * One-line md header for every md output: server kind, time, node (+ extra key: value pairs).
 * options.server false: tools that do not talk to a server (static scan) omit the "서버 종류" part.
 */
export function mdRunHeader(extra = {}, { server = true } = {}) {
  const info = runInfo(extra);
  const note = info.server === "dev" ? " (dev 서버 — 성능 수치를 운영 수치로 쓰지 않음)" : info.server === "unknown" ? " (서버 종류 미기재)" : "";
  const rest = Object.entries(safeExtra(extra))
    .filter(([k]) => k !== "server")
    .map(([k, v]) => ` · ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join("");
  const serverPart = server ? `서버 종류: ${info.server}${note} · ` : "";
  return `- ${serverPart}측정 시각: ${info.measured_at} · node ${info.node}${rest}`;
}

/** Base branch for diff scans: origin/HEAD -> origin/main -> origin/master -> main -> master. null if none. */
export function detectBaseBranch(repo = process.cwd()) {
  const git = argv => {
    try {
      return execFileSync("git", ["-C", repo, ...argv], { stdio: ["ignore", "pipe", "ignore"], encoding: "utf8" }).trim();
    } catch {
      return null;
    }
  };
  const head = git(["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
  if (head && git(["rev-parse", "--verify", "--quiet", `${head}^{commit}`])) return head;
  for (const ref of ["origin/main", "origin/master", "main", "master"]) {
    if (git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`])) return ref;
  }
  return null;
}

// ---- concurrency -------------------------------------------------------------------------

/** Run async jobs with bounded concurrency. */
export async function pool(items, concurrency, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (next < items.length) {
      const index = next++;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

/** Deterministic spread sample: picks n items evenly across the list (keeps order). */
export function spreadSample(items, n) {
  if (!n || n >= items.length) return items;
  const step = items.length / n;
  return Array.from({ length: n }, (_, i) => items[Math.floor(i * step)]);
}
