#!/usr/bin/env node
// P1, P3, P4: page-level timing per cache layer.
//   browser-cold : new browser context per run (empty HTTP/JS cache, empty query cache)
//   browser-warm : same context, one warm-up visit, then measured visits (HTTP/JS cache warm)
//   query-warm   : SPA re-entry — load route, click an internal link away, go back; measures
//                  time to ready and whether a busy skeleton re-appeared (client query cache).
//                  No usable leave link -> that sample is "unverified" (never counted as success).
// A document response with HTTP >= 400 or no response makes the sample "unverified" (reason "HTTP <n>"),
// in every mode; the row records the HTTP statuses seen (md "HTTP" column).
// Metrics: TTFB, FCP, LCP, CLS, ready (data selector visible), transfer bytes, Server-Timing
// of the document, and (P4) fetched JSON bytes/leaf values vs rendered [data-qa-field] count (overfetch).
//
//   node measure-web.mjs --routes /items,/items/1 --out <run>/ [--base http://localhost:3000] \
//     [--ready "[data-qa-field]"] [--devices mobile,desktop] [--runs 3] \
//     [--modes browser-cold,browser-warm,query-warm] [--api-pattern "/api/"] [--leave-selector "header a[href='/about']"] \
//     [--busy-selector "[role='status'][aria-busy='true']"] [--observe-ms 1500] [--profile .crew/qa-profile.json] \
//     [--cookie "..."] [--server dev|prod|staging|unknown] [--allow-remote]
// Defaults for --base/--ready/--busy-selector come from the profile (base_url, ready_selector, loading.busy_selector).
// <run> = .crew/artifacts/qa/<YYYY-MM-DD>-<scope>. Exit: 0 done · 2 usage/guard · 3 environment.
import path from "node:path";
import {
  assertAllowedBase, assertRoutes, cookiesFor, launchChromium, list, loadPlaywright, mdRunHeader, mdTable, median, ms, parseArgs, playwrightInfo,
  requireArgs, runInfo, usageError, writeFile,
} from "./lib/common.mjs";
import { loadProfile } from "./lib/profile.mjs";

const MODES = ["browser-cold", "browser-warm", "query-warm"];
const args = parseArgs(process.argv.slice(2), {
  defaults: { runs: "3", devices: "mobile,desktop", modes: MODES.join(","), cookie: process.env.QA_COOKIE ?? "", "observe-ms": "1500" },
  known: ["routes", "out", "base", "ready", "devices", "runs", "modes", "api-pattern", "leave-selector", "busy-selector", "observe-ms", "profile", "cookie"],
});
requireArgs(args, ["routes", "out"]);
const profile = loadProfile(args.profile);
const base = assertAllowedBase(args.base ?? profile.base_url, args["allow-remote"], { cookie: args.cookie });
const routes = assertRoutes(args.routes, base);
if (!routes.length) usageError("--routes 필요");
const runs = Number(args.runs);
if (!Number.isInteger(runs) || runs < 1) usageError(`--runs는 1 이상의 정수: ${args.runs}`);
const observeMs = Number(args["observe-ms"]);
if (!Number.isFinite(observeMs) || observeMs < 0) usageError(`--observe-ms는 0 이상의 숫자: ${args["observe-ms"]}`);
const modes = list(args.modes);
const badMode = modes.find(m => !MODES.includes(m));
if (badMode || !modes.length) usageError(`--modes는 ${MODES.join("|")} 중에서: ${args.modes}`);
const ready = args.ready ?? profile.ready_selector ?? null;
const busySelector = args["busy-selector"] ?? profile.loading?.busy_selector ?? "[role='status'][aria-busy='true']";
let apiPattern = null;
if (args["api-pattern"]) {
  try {
    apiPattern = new RegExp(args["api-pattern"]);
  } catch (error) {
    usageError(`잘못된 --api-pattern: ${error.message}`);
  }
}

const playwright = await loadPlaywright();
const DEVICES = { mobile: playwright.devices["Pixel 7"], desktop: { viewport: { width: 1440, height: 1000 } } };
const deviceNames = list(args.devices);
const badDevice = deviceNames.find(d => !DEVICES[d]);
if (badDevice || !deviceNames.length) usageError(`--devices는 ${Object.keys(DEVICES).join("|")} 중에서: ${args.devices}`);

const INIT = () => {
  window.__qa = { lcp: 0, cls: 0, fcp: NaN, busySeen: false };
  new PerformanceObserver(l => { for (const e of l.getEntries()) window.__qa.lcp = Math.max(window.__qa.lcp, e.startTime); }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__qa.cls += e.value; }).observe({ type: "layout-shift", buffered: true });
  new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.name === "first-contentful-paint") window.__qa.fcp = e.startTime; }).observe({ type: "paint", buffered: true });
};

async function collect(page, startedAt) {
  return page.evaluate(([observeMs, startedAt]) => new Promise(resolve => setTimeout(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const resources = performance.getEntriesByType("resource");
    resolve({
      ttfb: nav ? nav.responseStart - nav.requestStart : NaN,
      fcp: window.__qa.fcp,
      lcp: window.__qa.lcp || NaN,
      cls: +window.__qa.cls.toFixed(4),
      ready: startedAt === null ? NaN : startedAt,
      bytes: (nav?.transferSize ?? 0) + resources.reduce((s, r) => s + (r.transferSize ?? 0), 0),
      server_timing: nav?.serverTiming?.map(t => `${t.name}=${Math.round(t.duration)}`).join(" ") ?? "",
      qa_fields: document.querySelectorAll("[data-qa-field]").length,
    });
  }, observeMs)), [observeMs, startedAt]);
}

function trackApi(page) {
  const stats = { responses: 0, bytes: 0, leaves: 0, urls: {} };
  if (!apiPattern) return stats;
  const count = v => (v === null || typeof v !== "object" ? 1 : Object.values(v).reduce((s, x) => s + count(x), 0));
  page.on("response", async r => {
    if (!apiPattern.test(r.url()) || !(r.headers()["content-type"] ?? "").includes("json")) return;
    try {
      const body = await r.body();
      stats.responses++;
      stats.bytes += body.byteLength;
      stats.leaves += count(JSON.parse(body.toString("utf8")));
      const u = new URL(r.url());
      const key = (u.pathname + u.search).slice(0, 140);
      stats.urls[key] = (stats.urls[key] ?? 0) + body.byteLength;
    } catch { /* body unavailable for redirects */ }
  });
  return stats;
}

async function waitReady(page) {
  if (!ready) return NaN;
  await page.locator(ready).first().waitFor({ timeout: 60000 });
  return page.evaluate(() => performance.now());
}

// HTTP 4xx/5xx or no response: not a normal page (qa-principles) -> the sample is "unverified", never measured.
const GOTO_TIMEOUT_MS = 90000;
async function open(page, route) {
  const res = await page.goto(base + route, { waitUntil: "load", timeout: GOTO_TIMEOUT_MS });
  const http = res ? res.status() : null;
  if (http === null) return { http, bad: { unverified: true, reason: "HTTP 응답 없음", http } };
  if (http >= 400) return { http, bad: { unverified: true, reason: `HTTP ${http}`, http } };
  return { http };
}

async function measureLoad(context, route) {
  const page = await context.newPage();
  try {
    const api = trackApi(page);
    const { http, bad } = await open(page, route);
    if (bad) return bad;
    const readyAt = await waitReady(page).catch(() => NaN);
    const metrics = await collect(page, readyAt);
    const api_top = Object.entries(api.urls ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { ...metrics, http, api_bytes: api.bytes, api_leaves: api.leaves, api_responses: api.responses, api_top };
  } finally {
    await page.close();
  }
}

async function measureReentry(context, route) {
  const page = await context.newPage();
  try {
    const { http, bad } = await open(page, route);
    if (bad) return bad;
    await waitReady(page).catch(() => {});
    const routePath = new URL(route, base).pathname;
    const leave = args["leave-selector"]
      ? page.locator(`${args["leave-selector"]} >> visible=true`).first()
      : page.locator(`a[href^="/"]:not([href="${route}"]):not([href="${routePath}"]):visible`).first();
    if (!(await leave.count())) {
      return { unverified: true, http, reason: args["leave-selector"] ? `이탈 링크 없음 (--leave-selector ${args["leave-selector"]})` : "이탈할 내부 링크 없음 (--leave-selector 지정 필요)" };
    }
    const href = await leave.getAttribute("href");
    await leave.click();
    const left = await page.waitForURL(u => u.pathname !== routePath, { timeout: 30000 }).then(() => true, () => false);
    if (!left) return { unverified: true, http, reason: `링크(${href}) 클릭 후 경로가 바뀌지 않음`, via: href };
    await page.waitForTimeout(500);
    // Same document after SPA navigation: watch for a busy skeleton while going back.
    await page.evaluate(sel => {
      window.__qaBusy = false;
      const check = () => { if (document.querySelector(sel)) window.__qaBusy = true; };
      window.__qaObserver = new MutationObserver(check);
      window.__qaObserver.observe(document.body, { subtree: true, childList: true, attributes: true });
    }, busySelector);
    const t0 = Date.now();
    await page.goBack({ waitUntil: "commit" });
    let readyMs = NaN;
    if (ready) {
      await page.locator(ready).first().waitFor({ timeout: 60000 }).catch(() => {});
      readyMs = Date.now() - t0;
    }
    await page.waitForTimeout(observeMs);
    const busy = await page.evaluate(() => window.__qaBusy ?? null).catch(() => null); // null = full reload happened
    return { http, reentry_ready: readyMs, skeleton_reappeared: busy, via: href };
  } finally {
    await page.close();
  }
}

const cleanError = e => String(e.message ?? e).replace(/\x1b\[\d+m/g, "").split("\n")[0].slice(0, 200);
const browser = await launchChromium(playwright);
const results = [];
try {
  for (const deviceName of deviceNames) {
    const device = DEVICES[deviceName];
    const newContext = async () => {
      const c = await browser.newContext({ ...device });
      await c.addCookies(cookiesFor(base, args.cookie));
      await c.addInitScript(INIT);
      return c;
    };
    for (const route of routes) {
      for (const mode of modes) {
        const samples = [];
        if (mode === "browser-cold") {
          for (let i = 0; i < runs; i++) {
            const c = await newContext();
            samples.push(await measureLoad(c, route).catch(e => ({ error: cleanError(e) })));
            await c.close();
          }
        } else if (mode === "browser-warm") {
          const c = await newContext();
          await measureLoad(c, route).catch(() => {});
          for (let i = 0; i < runs; i++) samples.push(await measureLoad(c, route).catch(e => ({ error: cleanError(e) })));
          await c.close();
        } else {
          const c = await newContext();
          for (let i = 0; i < runs; i++) samples.push(await measureReentry(c, route).catch(e => ({ error: cleanError(e) })));
          await c.close();
        }
        const ok = samples.filter(s => !s.error && !s.unverified);
        const pick = k => median(ok.map(s => s[k]));
        const unverifiedReasons = [...new Set(samples.filter(s => s.unverified).map(s => s.reason))];
        const row = {
          device: deviceName, route, mode, runs, status: ok.length ? "measured" : unverifiedReasons.length ? "unverified" : "error",
          http: [...new Set(samples.map(s => s.http).filter(v => v !== undefined))],
          errors: samples.filter(s => s.error).map(s => s.error),
          measured_samples: ok.length,
          unverified_samples: samples.filter(s => s.unverified).length,
          unverified_reasons: unverifiedReasons,
        };
        if (mode === "query-warm") {
          Object.assign(row, {
            reentry_ready: pick("reentry_ready"),
            skeleton_reappeared: ok.map(s => s.skeleton_reappeared),
            via: ok.find(s => s.via)?.via ?? null,
          });
        } else {
          Object.assign(row, {
            ttfb: pick("ttfb"), fcp: pick("fcp"), lcp: pick("lcp"), cls: pick("cls"), ready: pick("ready"), bytes: pick("bytes"),
            server_timing: ok.find(s => s.server_timing)?.server_timing ?? "",
            api_bytes: pick("api_bytes"), api_leaves: pick("api_leaves"), api_responses: pick("api_responses"), qa_fields: pick("qa_fields"),
            api_top: ok.find(s => s.api_top?.length)?.api_top ?? [],
          });
        }
        results.push(row);
        process.stderr.write(`[measure-web] ${deviceName} ${mode} ${route} ${row.status}\n`);
      }
    }
  }
} finally {
  await browser.close();
}

const loads = results.filter(r => r.mode !== "query-warm");
const reentries = results.filter(r => r.mode === "query-warm");
const count = s => results.filter(r => r.status === s).length;
const summary = { rows: results.length, measured: count("measured"), unverified: count("unverified"), error: count("error") };
const pw = playwrightInfo();
const auth = args.cookie ? "cookie (값 비공개)" : "없음";
const statusCell = r => (r.status === "measured" ? `측정 ${r.measured_samples}/${r.runs}` : r.status === "unverified" ? "미검증" : "오류");
const httpCell = r => r.http.map(h => (h === null ? "응답 없음" : h)).join(", ") || "-";
const md = [
  "# 웹 성능 (캐시 계층별)",
  "",
  mdRunHeader({ base, runs, auth }),
  `- ${runs}회 중앙값 · ready 기준: ${ready ? `\`${ready}\`` : "미지정"} · Playwright ${pw.version ?? "?"} (${pw.source ?? "?"}) · 측정 ${summary.measured} / 미검증 ${summary.unverified} / 오류 ${summary.error}`,
  "- browser-cold: 매 회 새 context / browser-warm: 같은 context 예열 후 / query-warm: SPA 내부 이동 후 뒤로 가기 재진입.",
  "- 문서 응답이 HTTP 4xx/5xx이거나 응답이 없는 표본은 정상 화면이 아니므로 **미검증**이며 측정값·성공으로 세지 않는다(HTTP 칸에 상태 코드 표기).",
  `- CLS는 load 후 ${observeMs}ms 관찰값이다. 서버 종류(dev/prod build)와 서버 캐시 상태를 리포트에 함께 적고, 운영 성능 보장으로 해석하지 않는다.`,
  "",
  "## 로드",
  "",
  loads.length
    ? mdTable(
        ["device", "route", "mode", "상태", "HTTP", "TTFB", "FCP", "LCP", "ready", "CLS", "transfer bytes", "doc Server-Timing", "API JSON bytes / 값 수", "렌더된 qa-field", "미검증 사유", "오류"],
        loads.map(r => [r.device, r.route, r.mode, statusCell(r), httpCell(r), ms(r.ttfb), ms(r.fcp), ms(r.lcp), ms(r.ready), Number.isFinite(r.cls) ? r.cls : "-", Number.isFinite(r.bytes) ? Math.round(r.bytes) : "-", r.server_timing, apiPattern ? `${ms(r.api_bytes)} / ${ms(r.api_leaves)}` : "미측정", ms(r.qa_fields), r.unverified_reasons.join("; ") || "-", r.errors.length]),
      )
    : "미측정",
  "",
  "## SPA 재진입 (query-warm)",
  "",
  reentries.length
    ? mdTable(
        ["device", "route", "상태", "HTTP", "재진입 ready ms", "스켈레톤 재노출", "이탈 링크", "미검증 사유", "오류"],
        reentries.map(r => [r.device, r.route, statusCell(r), httpCell(r), ms(r.reentry_ready), r.skeleton_reappeared.map(v => (v === null ? "전체 새로고침" : v ? "예" : "아니오")).join(", ") || "-", r.via ?? "-", r.unverified_reasons.join("; ") || "-", r.errors.length]),
      )
    : "미측정",
  "",
  ...(reentries.some(r => r.unverified_reasons.some(reason => !reason.startsWith("HTTP ")))
    ? ["- 이탈 링크를 찾지 못한 query-warm 표본은 **미검증**이며 성공으로 세지 않는다. `--leave-selector`로 이탈 링크를 지정해 다시 측정한다.", ""]
    : []),
  ...(apiPattern ? loads.filter(r => r.api_top.length && r.mode === "browser-cold").flatMap(r => [`- API 응답 상위 (${r.device} ${r.route}): ${r.api_top.map(([u, b]) => `\`${u}\` ${Math.round(b / 1024)}KB`).join(", ")}`]) : []),
  "",
  apiPattern ? "API 값 수 대비 렌더된 qa-field 수는 overfetch 근사치다. 서버 컴포넌트가 서버에서 가져오는 데이터는 브라우저에서 보이지 않으므로 Server-Timing으로만 본다." : "",
  "",
].join("\n");
writeFile(path.join(args.out, "perf-web.json"), {
  ...runInfo({ base, runs, auth: args.cookie ? "cookie" : "none", ready, busy_selector: busySelector, observe_ms: observeMs, playwright: { source: pw.source ?? null, version: pw.version ?? null }, profile: profile.$loaded.path }),
  summary,
  results,
});
writeFile(path.join(args.out, "perf-web.md"), md);
console.log(md);
