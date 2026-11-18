#!/usr/bin/env node
// P5–P6 capture device — Next.js App Router streaming ONLY. Holds streamed Suspense reveals
// (the `$RC("B:..","S:..")` calls Next.js/React inlines into the HTML stream) inside this QA
// browser only, screenshots the skeleton, releases the same server response, screenshots the
// loaded page, and compares container boxes between the two. Server code, API data and timings
// are untouched. These frames are NOT natural CLS measurements.
// Other frameworks (no `$RC` in the HTML) give held=0 -> status "unverified" (never counted as success).
//
//   node skeleton-hold.mjs --routes detail=/items/1,/about --out <run>/ [--base http://localhost:3000] \
//     [--viewports 1440x1000,390x1000 (default: profile viewports)] [--hold all|last] [--hydrate] [--phase before|after] \
//     [--boxes "main,h1,table,[data-qa-section]"] [--busy-selector "[role='status'][aria-busy='true']"] \
//     [--profile .crew/qa-profile.json] [--cookie "..."] [--server dev|prod|staging|unknown] [--allow-remote]
//
// --hold all (default) blocks hydration JS (/_next/**/*.js) so React cannot bypass the held reveals.
// --hydrate keeps JS (useful with --hold last for client-side placeholders).
// --phase before|after (default after) names the output (skeleton-<phase>.json/md) for before/after comparison.
// <run> = .crew/artifacts/qa/<YYYY-MM-DD>-<scope>. Exit: 0 done · 2 usage/guard · 3 environment.
import path from "node:path";
import {
  assertAllowedBase, assertRoute, cookiesFor, launchChromium, list, loadPlaywright, mdRunHeader, mdTable, parseArgs, parseViewports, playwrightInfo,
  readJson, requireArgs, runInfo, scrollThrough, usageError, writeFile,
} from "./lib/common.mjs";
import { loadProfile } from "./lib/profile.mjs";

const args = parseArgs(process.argv.slice(2), {
  flags: ["hydrate"],
  defaults: { hold: "all", phase: "after", cookie: process.env.QA_COOKIE ?? "", boxes: "main,h1,nav[aria-label='Breadcrumb' i],table,[data-qa-section]" },
  known: ["routes", "out", "base", "viewports", "hold", "phase", "boxes", "busy-selector", "profile", "cookie"],
});
requireArgs(args, ["routes", "out"]);
if (!["all", "last"].includes(args.hold)) usageError(`--hold는 all|last: ${args.hold}`);
if (!["before", "after"].includes(args.phase)) usageError(`--phase는 before|after: ${args.phase}`);
const profile = loadProfile(args.profile);
const base = assertAllowedBase(args.base ?? profile.base_url, args["allow-remote"], { cookie: args.cookie });
// "key=/path" or "/path". Only split on "=" when the part before it is a plain key (paths may contain "=" in the query).
const routes = list(args.routes).map((r, i) => {
  const eq = r.indexOf("=");
  const keyed = eq > 0 && /^[\w-]+$/.test(r.slice(0, eq));
  const raw = keyed ? r.slice(eq + 1) : r;
  const p = assertRoute(raw, base);
  const key = keyed ? r.slice(0, eq) : p.replace(/[^\w]+/g, "_").replace(/^_|_$/g, "") || `route${i}`;
  return { key, path: p };
});
if (!routes.length) usageError("--routes 필요");
// --viewports > profile file `viewports` > this tool's default (taller mobile frame for full skeleton shots).
// Only a value the profile file actually sets counts: loadProfile() fills a generic default otherwise.
const profileViewports = profile.$loaded.from_file ? readJson(profile.$loaded.path).viewports : undefined;
const viewports = parseViewports(args.viewports, list(profileViewports).length ? profileViewports : "1440x1000,390x1000");
const boxSelectors = list(args.boxes);
const busy = args["busy-selector"] ?? profile.loading?.busy_selector ?? "[role='status'][aria-busy='true']";

async function boxes(page) {
  return page.evaluate(selectors => {
    const out = {};
    for (const s of selectors) {
      let el;
      try {
        el = [...document.querySelectorAll(s)].find(e => e.getBoundingClientRect().height > 0);
      } catch {
        continue; // invalid selector
      }
      if (el) {
        const r = el.getBoundingClientRect();
        out[s] = { x: Math.round(r.x), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height) };
      }
    }
    return out;
  }, boxSelectors);
}

const playwright = await loadPlaywright();
const browser = await launchChromium(playwright);
const rows = [];
try {
  for (const vp of viewports) {
    for (const route of routes) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, reducedMotion: "reduce" });
      await context.addCookies(cookiesFor(base, args.cookie));
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", e => pageErrors.push(e.message));
      let held = 0;
      if (!args.hydrate) await page.route("**/_next/**/*.js*", r => r.abort());
      await page.route(`${base}/**`, async r => {
        if (!r.request().isNavigationRequest()) return r.continue();
        const response = await r.fetch();
        let body = await response.text();
        const calls = [...body.matchAll(/\$RC\("(B:[^"]+)","(S:[^"]+)"\)/g)];
        const lastIndex = calls.at(-1)?.index;
        body = body.replace(/\$RC\("(B:[^"]+)","(S:[^"]+)"\)/g, (match, b, s, offset) => {
          if (args.hold === "last" && offset !== lastIndex) return match;
          held++;
          return `(window.__heldSuspense??=[]).push([${JSON.stringify(b)},${JSON.stringify(s)}])`;
        });
        await r.fulfill({ response, body });
      });
      const row = { key: route.key, path: route.path, viewport: vp.label, phase: args.phase };
      const stem = `${route.key}__${args.phase}`;
      try {
        await page.goto(base + route.path, { waitUntil: "load", timeout: 60000 });
        row.held = held;
        await page.locator(`${busy} >> visible=true`).first().waitFor({ timeout: held ? 10000 : 1000 }).catch(() => (row.no_visible_busy_status = true));
        row.visible_busy_status = await page.locator(`${busy} >> visible=true`).count();
        row.skeleton_overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        row.skeleton_boxes = await boxes(page);
        row.skeleton_text = (await page.locator("body").innerText()).slice(0, 400);
        row.skeleton_screenshot = path.join("screens", `${stem}-held__${vp.label}.png`);
        await page.screenshot({ path: path.join(args.out, row.skeleton_screenshot), fullPage: true });

        await page.evaluate(() => {
          for (const call of window.__heldSuspense ?? []) window.$RC?.(...call);
          window.__heldSuspense = [];
        });
        await page.waitForTimeout(800);
        // With JS, the "loaded" side is a fresh unheld load of the same route: releasing held reveals
        // by hand does not reliably resume client sections. Scroll once (viewport-lazy sections), then
        // wait until no busy status is visible. Without JS, client sections never load, so the
        // remaining busy status on the released page is expected and not judged.
        let target = page;
        if (args.hydrate) {
          target = await context.newPage(); // page.route above is per page: this load is unheld
          const t0 = Date.now();
          await target.goto(base + route.path, { waitUntil: "load", timeout: 60000 });
          await scrollThrough(target);
          await target.waitForFunction(sel => ![...document.querySelectorAll(sel)].some(e => e.getClientRects().length), busy, { timeout: 15000 }).catch(() => (row.loaded_busy_timeout = true));
          row.loaded_wait_ms = Date.now() - t0;
        }
        row.loaded_busy_status = await target.locator(`${busy} >> visible=true`).count();
        row.loaded_overflow = await target.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        row.loaded_boxes = await boxes(target);
        row.loaded_screenshot = path.join("screens", `${stem}-loaded__${vp.label}.png`);
        await target.screenshot({ path: path.join(args.out, row.loaded_screenshot), fullPage: true });
        row.box_delta = Object.fromEntries(
          Object.keys({ ...row.skeleton_boxes, ...row.loaded_boxes }).map(s => {
            const a = row.skeleton_boxes[s];
            const b = row.loaded_boxes[s];
            if (!a || !b) return [s, { only_in: a ? "skeleton" : "loaded" }];
            return [s, { dx: b.x - a.x, dy: b.y - a.y, dw: b.w - a.w, dh: b.h - a.h }];
          }),
        );
        if (held >= 1) row.status = "captured";
        else {
          row.status = "unverified";
          row.reason = "held=0 — 스트리밍 경계($RC) 없음 또는 Next.js 내부 형식 변경 (Next.js 스트리밍 전용 도구)";
        }
      } catch (error) {
        row.held ??= held;
        row.status = "error";
        row.error = error.message.slice(0, 300);
      }
      row.page_errors = pageErrors.slice(0, 5);
      rows.push(row);
      process.stderr.write(`[skeleton-hold] ${route.key} @${vp.label} held=${held} ${row.status}\n`);
      await context.close();
    }
  }
} finally {
  await browser.close();
}

const count = s => rows.filter(r => r.status === s).length;
const summary = { rows: rows.length, captured: count("captured"), unverified: count("unverified"), error: count("error") };
const pw = playwrightInfo();
const auth = args.cookie ? "cookie (값 비공개)" : "없음";
const fmt = d => (d.only_in ? `${d.only_in}에만 있음` : `x${d.dx >= 0 ? "+" : ""}${d.dx} y${d.dy >= 0 ? "+" : ""}${d.dy} w${d.dw >= 0 ? "+" : ""}${d.dw}`);
const statusLabel = r => (r.status === "captured" ? "캡처" : r.status === "unverified" ? "미검증" : "오류");
const md = [
  "# 스켈레톤 ↔ 실제 화면 (reveal 보류 캡처)",
  "",
  mdRunHeader({ base, phase: args.phase, auth }),
  "- **Next.js App Router 스트리밍 전용**: HTML 스트림의 Suspense reveal 호출(`$RC`)을 이 QA 브라우저 안에서만 보류한다. 다른 프레임워크·스트리밍 없는 페이지는 held=0 → 미검증.",
  `- hold=${args.hold} · hydration ${args.hydrate ? "허용 (완료 = 보류 없이 새로 연 같은 화면, 끝까지 스크롤 후 가시 busy status가 사라질 때까지 최대 15초)" : "차단 (클라이언트 데이터 섹션은 로드되지 않으므로 완료 쪽 busy status는 판정에 쓰지 않는다)"} · phase=${args.phase} · Playwright ${pw.version ?? "?"} (${pw.source ?? "?"}) · 캡처 ${summary.captured} / 미검증 ${summary.unverified} / 오류 ${summary.error}`,
  "- 이 캡처는 로딩 화면 재현 장치이며 자연 네트워크의 CLS 측정이 아니다. held=0이면 스트리밍 경계가 없거나 Next.js 내부 형식이 바뀐 것이므로 **미검증**이며 성공으로 세지 않는다.",
  `- 기준: held ≥ 1, 보류 중 가시 busy status(\`${busy}\`) 정확히 1개, 넘침 없음, 주요 컨테이너의 x·w 차이 0 (y·h는 데이터 길이에 따라 달라질 수 있음).`,
  "",
  mdTable(
    ["route", "vp", "상태", "held", "busy status (보류/완료)", "넘침 (보류/완료)", "박스 차이 (스켈레톤→실제)", "오류·사유"],
    rows.map(r => [r.key, r.viewport, statusLabel(r), r.held ?? "-", `${r.visible_busy_status ?? "-"} / ${r.loaded_busy_status ?? "-"}`, `${r.skeleton_overflow ? "예" : "아니오"} / ${r.loaded_overflow ? "예" : "아니오"}`, Object.entries(r.box_delta ?? {}).map(([s, d]) => `\`${s}\` ${fmt(d)}`).join("<br>"), r.error ?? r.reason ?? (r.page_errors.length ? `pageerror ${r.page_errors.length}` : "")]),
  ),
  "",
].join("\n");
writeFile(path.join(args.out, `skeleton-${args.phase}.json`), {
  ...runInfo({ base, phase: args.phase, hold: args.hold, hydrate: !!args.hydrate, busy_selector: busy, auth: args.cookie ? "cookie" : "none", playwright: { source: pw.source ?? null, version: pw.version ?? null }, profile: profile.$loaded.path }),
  summary,
  rows,
});
writeFile(path.join(args.out, `skeleton-${args.phase}.md`), md);
console.log(md);
