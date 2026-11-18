#!/usr/bin/env node
// U5–U7 browser layer: what the browser actually resolved, not what the code says.
// Per route × viewport: H1 count, typography role classes vs computed style, off-scale font
// sizes, text contrast against the effective background, token backgrounds that resolved
// to transparent, horizontal overflow, small touch targets, pageerror. axe lives in audit-a11y.mjs.
//
// Profile (optional, .crew/qa-profile.json): typography, extra_font_sizes_px, contrast,
// target_size_px, mobile_breakpoint_px, base_url, routes/core_routes, viewports, ready_selector.
// Empty typography -> role_mismatch is skipped; empty extra_font_sizes_px -> off_scale is skipped.
// Skipped rules are written to json `skipped_rules` and the md "건너뛴 규칙(미검증)" table (never "passed").
//
//   node inspect-computed-style.mjs --base http://localhost:3000 --routes /,/detail/a1 \
//     --out .crew/artifacts/qa/<YYYY-MM-DD>-<scope>/ [--profile .crew/qa-profile.json] \
//     [--viewports 1440x1000,390x844] [--cookie "..."] [--ready main] [--settle-ms 800] \
//     [--server dev|prod|staging|unknown] [--allow-remote]
//
// Output: <out>/ui-computed.json, <out>/ui-computed.md, <out>/screens/<route>__page__<vp>.png
// Exit: 0 run completed (defects found is still 0) · 2 usage/guard/profile error · 3 Playwright/browser missing.
import path from "node:path";
import {
  assertAllowedBase,
  assertRoutes,
  cookiesFor,
  launchChromium,
  loadPlaywright,
  mdRunHeader,
  mdTable,
  parseArgs,
  parseViewports,
  requireArgs,
  runInfo,
  usageError,
  writeFile,
} from "./lib/common.mjs";
import { loadProfile, skippedRules } from "./lib/profile.mjs";

const args = parseArgs(process.argv.slice(2), {
  defaults: { "settle-ms": "800" },
  known: ["base", "routes", "out", "profile", "repo", "viewports", "cookie", "ready", "settle-ms"],
});
const profile = loadProfile(args.profile, { repo: args.repo });
const cookie = args.cookie ?? process.env.QA_COOKIE ?? "";
// Guards first: a remote base or cross-origin route is refused before anything else.
const base = assertAllowedBase(args.base ?? profile.base_url, args["allow-remote"], { cookie });
const routeInput = args.routes ?? (profile.routes.length ? profile.routes : profile.core_routes);
const routes = assertRoutes(routeInput, base);
if (!routes.length) usageError("--routes 필요 (또는 프로필 routes/core_routes)");
requireArgs(args, ["out"]);
const viewports = parseViewports(args.viewports, profile.viewports);
const ready = args.ready ?? profile.ready_selector ?? null;
const settleMs = Number(args["settle-ms"]);
if (!Number.isFinite(settleMs) || settleMs < 0) usageError(`--settle-ms는 0 이상 숫자: ${args["settle-ms"]}`);

const skipped = skippedRules(profile, { scope: "computed" });
const checkRoles = !skipped.some(r => r.rule === "U5-role-mismatch");
const checkScale = !skipped.some(r => r.rule === "U5-off-scale");

function inspect({ typography, extraSizes, checkRoles, checkScale, contrast, targets, mobileBreakpoint }) {
  const px = v => parseFloat(v);
  const isVisible = el => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0;
  };
  const sel = el => {
    const id = el.id ? `#${el.id}` : "";
    const cls = typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
    return `${el.tagName.toLowerCase()}${id}${cls === "." ? "" : cls}`.slice(0, 120);
  };
  const parse = c => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r, g, b, a };
  };
  const lum = ({ r, g, b }) => {
    const f = v => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const blend = (top, bottom) => ({
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  });
  const effectiveBg = el => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.backgroundImage && s.backgroundImage !== "none") return null; // gradient/image: cannot compute
      const c = parse(s.backgroundColor);
      if (c && c.a > 0) {
        layers.push(c);
        if (c.a >= 1) break;
      }
    }
    let bg = { r: 255, g: 255, b: 255, a: 1 };
    for (const layer of layers.reverse()) bg = blend(layer, bg);
    return bg;
  };
  const mobile = innerWidth < mobileBreakpoint;
  // null = rule skipped (profile field missing), never "no defects".
  const out = {
    h1: [],
    role_mismatch: checkRoles ? [] : null,
    off_scale: checkScale ? {} : null,
    contrast_fail: [],
    transparent_token_bg: [],
    small_targets: [],
    contrast_checked: 0,
  };

  out.h1 = [...document.querySelectorAll("h1")].filter(isVisible).map(h => h.innerText.trim().slice(0, 80));

  // Role classes vs computed style
  if (checkRoles) {
    for (const [role, spec] of Object.entries(typography)) {
      const expectedPx = spec.size_rem ? spec.size_rem * px(getComputedStyle(document.documentElement).fontSize) : mobile ? spec.size_px_mobile : spec.size_px_desktop;
      for (const el of document.getElementsByClassName(role)) {
        if (!isVisible(el)) continue;
        const s = getComputedStyle(el);
        const size = px(s.fontSize);
        const lh = s.lineHeight === "normal" ? null : +(px(s.lineHeight) / size).toFixed(2);
        const issues = [];
        if (expectedPx && Math.abs(size - expectedPx) > 0.5) issues.push(`size ${size}px≠${expectedPx}px`);
        if (spec.line_height && lh && Math.abs(lh - spec.line_height) > 0.03) issues.push(`line-height ${lh}≠${spec.line_height}`);
        if (spec.weight && Number(s.fontWeight) !== spec.weight) issues.push(`weight ${s.fontWeight}≠${spec.weight}`);
        if (issues.length && out.role_mismatch.length < 40) out.role_mismatch.push({ role, el: sel(el), text: el.innerText.trim().slice(0, 50), issues });
      }
    }
  }

  // Font sizes in use and text contrast
  const allowed = new Set(extraSizes);
  for (const spec of Object.values(typography)) {
    if (spec.size_rem) allowed.add(+(spec.size_rem * 16).toFixed(2));
    if (spec.size_px_desktop) allowed.add(spec.size_px_desktop);
    if (spec.size_px_mobile) allowed.add(spec.size_px_mobile);
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.textContent.trim() ? 1 : 2) });
  const seen = new Set();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node.parentElement;
    if (!el || seen.has(el) || !isVisible(el) || el.closest("[aria-hidden='true'],svg,canvas,script,style,noscript")) continue;
    seen.add(el);
    const s = getComputedStyle(el);
    const size = +px(s.fontSize).toFixed(2);
    if (checkScale && !allowed.has(size)) {
      const k = `${size}px`;
      out.off_scale[k] ??= { count: 0, sample: `${sel(el)} "${el.innerText.trim().slice(0, 40)}"` };
      out.off_scale[k].count++;
    }
    const fg = parse(s.color);
    const bg = effectiveBg(el);
    if (!fg || !bg) continue;
    const ratio = (() => {
      const f = blend(fg, bg);
      const [a, b] = [lum(f), lum(bg)].sort((x, y) => y - x);
      return (a + 0.05) / (b + 0.05);
    })();
    out.contrast_checked++;
    const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
    const need = large ? contrast.large : contrast.normal;
    const disabled = el.closest("[disabled],[aria-disabled='true']");
    if (ratio < need && !disabled && out.contrast_fail.length < 60)
      out.contrast_fail.push({ el: sel(el), text: el.innerText.trim().slice(0, 40), ratio: +ratio.toFixed(2), need, color: s.color, size });
  }

  // Elements that request a token background but resolved to transparent (phantom token)
  for (const el of document.querySelectorAll("[class*='bg-']")) {
    if (!isVisible(el)) continue;
    const classes = (typeof el.className === "string" ? el.className : "").split(/\s+/).filter(c => /^bg-/.test(c) && !/^bg-(transparent|none|clip|cover|contain|center|no-repeat|gradient|linear|radial|fixed|local|scroll)/.test(c));
    if (!classes.length) continue;
    const s = getComputedStyle(el);
    if (s.backgroundColor === "rgba(0, 0, 0, 0)" && s.backgroundImage === "none" && out.transparent_token_bg.length < 40)
      out.transparent_token_bg.push({ el: sel(el), classes });
  }

  // Touch targets (mobile only)
  if (mobile) {
    for (const el of document.querySelectorAll("a[href],button,[role='button'],input:not([type='hidden']),select,textarea,[role='tab'],[role='radio'],[role='checkbox']")) {
      if (!isVisible(el) || el.closest("p,li > p")) continue; // inline links inside text are exempt
      const r = el.getBoundingClientRect();
      const small = Math.min(r.width, r.height);
      if (small < targets.mobile && out.small_targets.length < 60)
        out.small_targets.push({ el: sel(el), text: (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height), below_minimum: small < targets.minimum });
    }
  }
  out.overflow = document.documentElement.scrollWidth > innerWidth;
  return out;
}

const shotName = (route, vp) => `${route.replace(/[/?#&=:]/g, "_") || "_root"}__page__${vp}.png`;

const playwright = await loadPlaywright();
const browser = await launchChromium(playwright);
const results = [];
try {
  for (const vp of viewports) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, reducedMotion: "reduce" });
    await context.addCookies(cookiesFor(base, cookie));
    for (const route of routes) {
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", e => pageErrors.push(e.message));
      const row = { route, viewport: vp.label };
      try {
        const res = await page.goto(base + route, { waitUntil: "load", timeout: 60000 });
        row.http = res?.status();
        if (row.http >= 400) {
          // Error pages are not normal UI (qa-principles): no checks, not counted. Screenshot kept as evidence.
          row.skipped = `HTTP ${row.http} — 정상 UI 검사 제외`;
        } else {
          if (ready) await page.locator(ready).first().waitFor({ timeout: 30000 });
          await page.waitForTimeout(settleMs);
          Object.assign(
            row,
            await page.evaluate(inspect, {
              typography: profile.typography ?? {},
              extraSizes: profile.extra_font_sizes_px ?? [],
              checkRoles,
              checkScale,
              contrast: profile.contrast,
              targets: profile.target_size_px,
              mobileBreakpoint: profile.mobile_breakpoint_px,
            }),
          );
        }
        row.screenshot = path.join("screens", shotName(route, vp.label));
        await page.screenshot({ path: path.join(args.out, row.screenshot), fullPage: true });
      } catch (error) {
        row.error = error.message.slice(0, 300);
      }
      row.page_errors = pageErrors;
      results.push(row);
      process.stderr.write(`[computed-style] ${route} @${vp.label} ${row.error ? "ERROR" : row.skipped ? "SKIP" : "ok"}\n`);
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
}

// Same defect on many nodes (chips in every row) is one finding: group by key, keep a count and one example.
function grouped(items = [], key, example) {
  const m = new Map();
  for (const it of items ?? []) {
    const k = key(it);
    if (!m.has(k)) m.set(k, [k, 0, example(it)]);
    m.get(k)[1]++;
  }
  return [...m.values()].sort((a, b) => b[1] - a[1]);
}

const NOT_VERIFIED = "미검증";
// Rows with an error or skipped (HTTP >= 400) carry no measurements: every check cell is "-", never 0/"아니오".
const noData = r => Boolean(r.error || r.skipped);
const roleCell = r => (noData(r) ? "-" : r.role_mismatch === null ? NOT_VERIFIED : r.role_mismatch?.length ?? "-");
const scaleCell = r => (noData(r) ? "-" : r.off_scale === null ? NOT_VERIFIED : Object.keys(r.off_scale ?? {}).join(" ") || 0);
const httpCell = r => (r.skipped ? `${r.http} (검사 제외)` : r.http ?? r.error);
const checked = results.filter(r => !noData(r)).length;
const skippedPages = results.filter(r => r.skipped).length;
const profileLabel = args.profile ? `\`${args.profile}\`` : "기본값 (프로필 없음)";

const md = [
  "# UI 브라우저 측정 (computed style)",
  "",
  mdRunHeader({ base }),
  `- viewport: ${viewports.map(v => `${v.width}x${v.height}`).join(", ")} · reduced-motion: reduce · 프로필: ${profileLabel}${ready ? ` · ready: \`${ready}\`` : ""}`,
  "- 대비·터치 대상은 A11Y 감사에서도 이 결과를 쓴다. 자동 측정 통과는 WCAG 전체 준수를 뜻하지 않는다. HTTP 4xx/5xx 화면은 검사하지 않으며(검사 제외) 집계에 넣지 않는다.",
  `- 검사 ${checked} / 검사 제외(HTTP ≥400) ${skippedPages} / 오류 ${results.filter(r => r.error).length}`,
  "",
  mdTable(
    ["route", "vp", "HTTP", "H1", "역할 불일치", "스케일 밖 크기", "대비 미달", "투명 토큰 배경", "작은 터치 대상", "넘침", "pageerror"],
    results.map(r => [r.route, r.viewport, httpCell(r), r.h1?.length ?? "-", roleCell(r), scaleCell(r), r.contrast_fail?.length ?? "-", r.transparent_token_bg?.length ?? "-", r.small_targets?.length ?? "-", noData(r) ? "-" : r.overflow ? "예" : "아니오", r.skipped ? "-" : r.page_errors.length]),
  ),
  "",
  ...(skipped.length
    ? ["## 건너뛴 규칙(미검증)", "", mdTable(["규칙", "프로필 필드", "사유"], skipped.map(s => [s.rule, s.field, s.reason])), ""]
    : []),
  ...results.flatMap(r => [
    `## ${r.route} @${r.viewport}`,
    "",
    r.error ? `- 측정 실패: ${r.error}` : null,
    r.skipped ? `- ${r.skipped}` : null,
    r.h1 && r.h1.length !== 1 ? `- **H1 ${r.h1.length}개**: ${r.h1.join(" / ")}` : null,
    ...grouped(r.role_mismatch, m => `${m.role} — ${m.issues.join(", ")}`, m => `\`${m.el}\` "${m.text.replace(/\s+/g, " ").slice(0, 40)}"`).map(([k, n, ex]) => `- 역할 ${k}: ${n}곳 (예: ${ex})`),
    ...Object.entries(r.off_scale ?? {}).map(([size, v]) => `- 스케일 밖 크기 ${size}: ${v.count}곳 (예: ${v.sample})`),
    ...grouped(r.contrast_fail, c => `${c.ratio}:1 < ${c.need}:1 (${c.color})`, c => `\`${c.el}\` "${c.text}" ${c.size}px`).map(([k, n, ex]) => `- 대비 ${k}: ${n}곳 (예: ${ex})`),
    ...grouped(r.transparent_token_bg, t => t.classes.join(" "), t => `\`${t.el}\``).map(([k, n, ex]) => `- 토큰 배경이 투명으로 해석됨 ${k}: ${n}곳 (예: ${ex})`),
    ...(r.small_targets ?? []).filter(t => t.below_minimum).slice(0, 15).map(t => `- ${profile.target_size_px.minimum}px 미만 대상: \`${t.el}\` "${t.text}" ${t.w}×${t.h}`),
    r.overflow ? "- 가로 넘침 (documentElement.scrollWidth > viewport)" : null,
    ...(r.page_errors ?? []).map(e => `- pageerror: ${e.slice(0, 120)}`),
    "",
  ]),
].filter(line => line !== null).join("\n");

writeFile(path.join(args.out, "ui-computed.json"), {
  ...runInfo({ base }),
  profile: args.profile ?? null,
  viewports: viewports.map(v => `${v.width}x${v.height}`),
  ready,
  skipped_rules: skipped,
  summary: { rows: results.length, checked, skipped_http: skippedPages, error: results.filter(r => r.error).length },
  results,
});
writeFile(path.join(args.out, "ui-computed.md"), md);
console.log(md);
