#!/usr/bin/env node
// P1–P2: API latency per endpoint in server-cold and server-warm modes.
//   server-cold: every request sends the cache-bypass header (--nocache-header or profile perf.nocache_header).
//                No header configured -> server-cold is NOT measured: {mode:"server-cold", status:"unverified"}.
//                The header only means something when the server honours it (server-side cache-bypass/trace
//                setting, see profile perf.server_env).
//   server-warm: one discarded warm-up request, then N measured requests.
// Server-Timing is parsed per metric name and summarized (all names, or only profile perf.server_timing_names).
// 3xx (redirect: manual), 4xx/5xx (incl. 401) responses and network errors/timeouts are not used as
// latency samples (counted as `excluded`). No usable sample -> that endpoint/mode row is "unverified";
// every request failed without an HTTP response (timeout/network) -> "error".
// Each request is aborted after --timeout-ms (default 30000). After 3 consecutive network errors/timeouts
// (warm-up included) the endpoint/mode stops early and the next one runs.
//
//   node measure-api.mjs --endpoints endpoints.json --out <run>/ [--base http://localhost:3000] \
//     [--runs 30] [--modes server-cold,server-warm] [--nocache-header <header>] [--timing-names db,app] \
//     [--timeout-ms 30000] [--profile .crew/qa-profile.json] [--cookie "..."] [--server dev|prod|staging|unknown] [--allow-remote]
// endpoints.json (templates/endpoints.example.json): [{ "group": "list", "name": "items limit=50", "path": "/api/items?limit=50" }]
// <run> = .crew/artifacts/qa/<YYYY-MM-DD>-<scope>. Exit: 0 done · 2 usage/guard · 3 environment.
import path from "node:path";
import {
  assertAllowedBase, assertRoute, list, mdRunHeader, mdTable, median, ms, parseArgs, quantile, readJson, requireArgs, runInfo, usageError, writeFile,
} from "./lib/common.mjs";
import { loadProfile } from "./lib/profile.mjs";

const MODES = ["server-cold", "server-warm"];
const args = parseArgs(process.argv.slice(2), {
  defaults: { runs: "30", modes: MODES.join(","), cookie: process.env.QA_COOKIE ?? "", "timeout-ms": "30000" },
  known: ["endpoints", "out", "base", "runs", "modes", "nocache-header", "timing-names", "timeout-ms", "profile", "cookie"],
});
requireArgs(args, ["endpoints", "out"]);
const profile = loadProfile(args.profile);
const base = assertAllowedBase(args.base ?? profile.base_url, args["allow-remote"], { cookie: args.cookie });
const runs = Number(args.runs);
if (!Number.isInteger(runs) || runs < 1) usageError(`--runs는 1 이상의 정수: ${args.runs}`);
const timeoutMs = Number(args["timeout-ms"]);
if (!Number.isInteger(timeoutMs) || timeoutMs < 1) usageError(`--timeout-ms는 1 이상의 정수(ms): ${args["timeout-ms"]}`);
const MAX_CONSECUTIVE_ERRORS = 3;
const modes = list(args.modes);
const badMode = modes.find(m => !MODES.includes(m));
if (badMode || !modes.length) usageError(`--modes는 ${MODES.join("|")} 중에서: ${args.modes}`);
const nocacheHeader = (args["nocache-header"] ?? profile.perf?.nocache_header ?? "").trim() || null;
const nocacheSource = args["nocache-header"] ? "arg" : nocacheHeader ? "profile" : null;
if (nocacheHeader && !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(nocacheHeader)) usageError(`잘못된 헤더 이름: ${nocacheHeader}`);
const timingNames = list(args["timing-names"] ?? profile.perf?.server_timing_names);
const serverEnv = list(profile.perf?.server_env);

let endpoints;
try {
  endpoints = readJson(args.endpoints);
} catch (error) {
  usageError(`--endpoints 읽기 실패: ${args.endpoints} — ${error.message}`);
}
if (!Array.isArray(endpoints) || !endpoints.length) usageError(`--endpoints는 [{group,name,path}] 배열이어야 함: ${args.endpoints}`);
endpoints = endpoints.map((e, i) => {
  if (!e || typeof e.path !== "string") usageError(`--endpoints[${i}].path 없음`);
  return { group: e.group ?? "", name: e.name ?? e.path, path: assertRoute(e.path, base) };
});

function parseServerTiming(header) {
  const out = {};
  for (const part of (header ?? "").split(",")) {
    const [name, ...params] = part.trim().split(";");
    if (!name) continue;
    if (timingNames.length && !timingNames.includes(name)) continue;
    const dur = params.map(p => p.trim()).find(p => p.startsWith("dur="));
    const desc = params.map(p => p.trim()).find(p => p.startsWith("desc="));
    out[name] = { dur: dur ? Number(dur.slice(4)) : NaN, desc: desc ? desc.slice(5).replace(/^"|"$/g, "") : "" };
  }
  return out;
}

// Only 2xx responses are latency samples: 3xx (login redirect etc.), 4xx/5xx (incl. 401 auth) are not the
// endpoint's real latency (qa-principles: error pages are not normal checks); errors/timeouts have no response.
const usable = s => typeof s.status === "number" && s.status < 300;

const errorText = error => {
  if (error?.name === "TimeoutError" || error?.name === "AbortError") return `timeout ${timeoutMs}ms`;
  const code = error?.cause?.code;
  return String(code ? `${code} ${error.message}` : error?.message ?? error).split("\n")[0].slice(0, 200);
};

async function once(target, mode) {
  const headers = { accept: "application/json" };
  if (args.cookie) headers.cookie = args.cookie;
  if (mode === "server-cold") headers[nocacheHeader] = "1";
  const start = performance.now();
  try {
    // The signal also aborts reading the body, so a server that never finishes the response cannot hang the run.
    const res = await fetch(base + target.path, { headers, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    const body = new Uint8Array(await res.arrayBuffer());
    return { ms: performance.now() - start, status: res.status, bytes: body.byteLength, timing: parseServerTiming(res.headers.get("server-timing")), cache: res.headers.get("x-cache") ?? res.headers.get("cf-cache-status") ?? "" };
  } catch (error) {
    return { ms: performance.now() - start, status: "error", bytes: 0, timing: {}, error: errorText(error) };
  }
}

/** Why a row has no usable sample: "4xx/5xx 404×5", "오류 timeout 2000ms×3" ... */
function noSampleReason(samples, stoppedEarly) {
  const n = pred => samples.filter(pred).length;
  const parts = [];
  const http = [...new Set(samples.filter(s => typeof s.status === "number" && s.status >= 300).map(s => s.status))];
  if (http.length) parts.push(`HTTP ${http.map(code => `${code}×${n(s => s.status === code)}`).join(" ")}`);
  const errs = [...new Set(samples.filter(s => s.status === "error").map(s => s.error))];
  if (errs.length) parts.push(`오류 ${errs.map(e => `${e}×${n(s => s.error === e)}`).join(", ")}`);
  const hint = http.some(c => c === 401 || (c >= 300 && c < 400)) ? " — 인증 쿠키 확인" : "";
  return `측정 가능한 응답 없음 (${parts.join(" · ") || "표본 없음"})${hint}${stoppedEarly ? ` · 연속 오류 ${MAX_CONSECUTIVE_ERRORS}회(예열 포함)로 중단` : ""}`;
}

const results = [];
for (const mode of modes) {
  for (const target of endpoints) {
    if (mode === "server-cold" && !nocacheHeader) {
      results.push({ mode, ...target, status: "unverified", reason: "캐시 우회 수단 없음" });
      process.stderr.write(`[measure-api] ${mode} ${target.name}: unverified (캐시 우회 헤더 없음)\n`);
      continue;
    }
    let streak = 0;
    const warmup = mode === "server-warm" ? await once(target, mode) : null;
    if (warmup?.status === "error") streak++;
    const samples = [];
    let stoppedEarly = false;
    for (let i = 0; i < runs; i++) {
      if (streak >= MAX_CONSECUTIVE_ERRORS) {
        stoppedEarly = true;
        break;
      }
      const s = await once(target, mode);
      samples.push(s);
      streak = s.status === "error" ? streak + 1 : 0;
    }
    const statuses = samples.reduce((m, s) => ((m[s.status] = (m[s.status] ?? 0) + 1), m), {});
    const valid = samples.filter(usable);
    const excluded = samples.length - valid.length;
    const errors = [...new Set([warmup, ...samples].filter(s => s?.status === "error").map(s => s.error))];
    if (!valid.length) {
      // No HTTP response at all (every request timed out / failed) -> error; responses that are all excluded -> unverified.
      const noResponse = samples.every(s => s.status === "error");
      const status = noResponse ? "error" : "unverified";
      results.push({ mode, ...target, runs, status, reason: noSampleReason(samples.length ? samples : [warmup].filter(Boolean), stoppedEarly), statuses, excluded, errors, stopped_early: stoppedEarly });
      process.stderr.write(`[measure-api] ${mode} ${target.name}: ${status}\n`);
      continue;
    }
    const sorted = valid.map(s => s.ms).sort((a, b) => a - b);
    const names = [...new Set(valid.flatMap(s => Object.keys(s.timing)))];
    const timing = Object.fromEntries(names.map(n => [n, { median_dur: median(valid.map(s => s.timing[n]?.dur)), last_desc: valid.at(-1).timing[n]?.desc ?? "" }]));
    const cache = [...new Set(valid.map(s => s.cache).filter(Boolean))];
    results.push({ mode, ...target, runs, status: "measured", samples: valid.length, excluded, errors, stopped_early: stoppedEarly, p50: quantile(sorted, 0.5), p95: quantile(sorted, 0.95), max: sorted.at(-1), bytes: median(valid.map(s => s.bytes)), statuses, timing, cache });
    process.stderr.write(`[measure-api] ${mode} ${target.name}\n`);
  }
}

const measured = results.filter(r => r.status === "measured");
const unverified = results.filter(r => r.status === "unverified");
const errored = results.filter(r => r.status === "error");
const shownTiming = [...new Set(measured.flatMap(r => Object.keys(r.timing)))];
const auth = args.cookie ? "cookie (값 비공개)" : "없음";
const summary = { endpoints: endpoints.length, measured: measured.length, unverified: unverified.length, error: errored.length };
const md = [
  "# API 지연 (server-cold / server-warm)",
  "",
  mdRunHeader({ base, runs, auth, timeout_ms: timeoutMs }),
  `- 엔드포인트 ${endpoints.length}개 · 엔드포인트당 ${runs}회 · 요청 제한시간 ${timeoutMs}ms · 측정 ${measured.length} / 미검증 ${unverified.length} / 오류 ${errored.length}`,
  nocacheHeader
    ? `- server-cold는 \`${nocacheHeader}: 1\` 헤더(출처: ${nocacheSource === "arg" ? "--nocache-header" : "프로필 perf.nocache_header"})로 서버 캐시를 우회한다. 서버 측 캐시 우회·추적 설정(프로필 \`perf.server_env\`${serverEnv.length ? `: ${serverEnv.map(e => `\`${e}\``).join(", ")}` : " — 미기재"})이 켜져 있어야 의미가 있다.`
    : "- server-cold: **미검증** — 캐시 우회 수단 없음 (`--nocache-header` 또는 프로필 `perf.nocache_header` 미지정). 성공으로 세지 않는다.",
  `- server-warm은 1회 예열 후 측정. 2xx 응답만 측정값으로 쓴다 — 3xx·4xx/5xx(401 포함) 응답과 네트워크 오류·타임아웃은 제외(제외 수 표기). 제외 후 표본이 0이면 **미검증**(응답 자체가 없으면 **오류**)이며 성공으로 세지 않는다. 연속 오류 ${MAX_CONSECUTIVE_ERRORS}회면 그 행은 중단하고 다음으로 넘어간다.`,
  `- Server-Timing 열은 지표별 중앙값(ms)${timingNames.length ? ` — 지정 지표만: ${timingNames.map(n => `\`${n}\``).join(", ")}` : " — 응답의 모든 지표"}. '-'는 헤더 없음(서버 측 추적 설정 꺼짐 가능).`,
  "",
  measured.length
    ? mdTable(
        ["mode", "group", "request", "p50", "p95", "max", "body bytes", "statuses", "제외", ...shownTiming.map(n => `${n} ms`)],
        measured.map(r => [r.mode, r.group, r.name, ms(r.p50), ms(r.p95), ms(r.max), r.bytes, Object.entries(r.statuses).map(([k, v]) => `${k}×${v}`).join(" "), r.excluded, ...shownTiming.map(n => ms(r.timing[n]?.median_dur))]),
      )
    : "측정된 결과 없음",
  "",
  ...(unverified.length
    ? ["## 미검증", "", mdTable(["mode", "group", "request", "사유"], unverified.map(r => [r.mode, r.group, r.name, r.reason])), ""]
    : []),
  ...(errored.length
    ? ["## 오류 (응답 없음)", "", mdTable(["mode", "group", "request", "사유"], errored.map(r => [r.mode, r.group, r.name, r.reason])), ""]
    : []),
].join("\n");
writeFile(path.join(args.out, "perf-api.json"), {
  ...runInfo({ base, runs, timeout_ms: timeoutMs, auth: args.cookie ? "cookie" : "none", nocache_header: nocacheHeader, nocache_source: nocacheSource, server_timing_names: timingNames, server_env: serverEnv, profile: profile.$loaded.path }),
  summary,
  results,
});
writeFile(path.join(args.out, "perf-api.md"), md);
console.log(md);
