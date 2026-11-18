#!/usr/bin/env node
// A1–A6 browser layer for accessibility. Per route × viewport:
//   A1 axe (WCAG 2.0/2.1/2.2 A·AA tags from profile a11y.axe_tags). axe is resolved by resolveAxe():
//      --axe <path>|none -> env AXE_PATH -> plugin bundle -> target repo node_modules (read only).
//      Not found is not a failure: results[].axe.status = "unverified".
//   A2 structure: lang, title, main landmark, heading order, img alt, unnamed controls,
//      unlabeled form fields, tables without headers, aria-hidden focusables, positive tabindex,
//      duplicate ids referenced by aria-*
//   A3 keyboard: Tab traversal — skip link, focus indicator (vs unfocused style), focus hidden
//      or obscured by sticky/fixed layers, keyboard trap
//   A4 reflow at 320px (profile a11y.reflow_width), text spacing (WCAG 1.4.12) clipping,
//      infinite animation under reduced motion
//   A5 loading/state: busy status left after load, skeleton shapes exposed to AT
//   A6 data readability: placeholder glyphs ("—", "-", "N/A") without accessible text
// HTTP 4xx/5xx pages are excluded from the UI checks. Contrast and touch targets are measured by
// inspect-computed-style.mjs; run it in the same <run>.
//
//   node audit-a11y.mjs --base http://localhost:3000 --routes /,/detail/a1 \
//     --out .crew/artifacts/qa/<YYYY-MM-DD>-<scope>/ [--profile .crew/qa-profile.json] \
//     [--viewports 1440x1000,390x844] [--cookie "..."] [--axe /abs/path/axe.min.js|none] [--repo .] \
//     [--ready main] [--tab-limit 80] [--settle-ms 800] [--no-reflow] [--no-spacing] \
//     [--server dev|prod|staging|unknown] [--allow-remote]
//
// Output: <out>/a11y.json, <out>/a11y.md
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
  resolveAxe,
  runInfo,
  scrollThrough,
  usageError,
  writeFile,
} from "./lib/common.mjs";
import { loadProfile } from "./lib/profile.mjs";

const args = parseArgs(process.argv.slice(2), {
  flags: ["no-reflow", "no-spacing"],
  defaults: { "settle-ms": "800" },
  known: ["base", "routes", "out", "profile", "repo", "viewports", "cookie", "axe", "ready", "tab-limit", "settle-ms"],
});
const profile = loadProfile(args.profile, { repo: args.repo });
const cookie = args.cookie ?? process.env.QA_COOKIE ?? "";
// Guards first: a remote base or cross-origin route is refused before anything else.
const base = assertAllowedBase(args.base ?? profile.base_url, args["allow-remote"], { cookie });
const routeInput = args.routes ?? (profile.routes.length ? profile.routes : profile.core_routes);
const routes = assertRoutes(routeInput, base);
if (!routes.length) usageError("--routes 필요 (또는 프로필 routes/core_routes)");
requireArgs(args, ["out"]);

const a11y = profile.a11y;
const viewports = parseViewports(args.viewports, profile.viewports);
const ready = args.ready ?? profile.ready_selector ?? null;
const settleMs = Number(args["settle-ms"]);
if (!Number.isFinite(settleMs) || settleMs < 0) usageError(`--settle-ms는 0 이상 숫자: ${args["settle-ms"]}`);
const tabLimit = Number(args["tab-limit"] ?? a11y.tab_limit);
if (!Number.isInteger(tabLimit) || tabLimit < 1) usageError(`--tab-limit은 1 이상 정수: ${args["tab-limit"] ?? a11y.tab_limit}`);
const reflowWidth = Number(a11y.reflow_width);
if (!Number.isInteger(reflowWidth) || reflowWidth < 1) usageError(`profile.a11y.reflow_width는 1 이상 정수: ${a11y.reflow_width}`);
const placeholders = a11y.placeholder_glyphs;
const skipPattern = a11y.skip_link_pattern;
try {
  new RegExp(skipPattern, "i");
} catch (error) {
  usageError(`profile.a11y.skip_link_pattern 정규식 오류: ${error.message}`);
}
const skeletonSelector = a11y.skeleton_selector;
const busySelector = profile.loading.busy_selector;
const wcagTags = a11y.axe_tags;
// Dev-server tooling is not part of the product UI (defaults: Next.js dev overlay, TanStack Query devtools).
const ignoreSelector = a11y.ignore_selector;

const axe = resolveAxe(args); // {status:"found", source, path, version} | {status:"unverified", reason}
const axeSummary = axe.status === "found" ? { status: "found", source: axe.source, version: axe.version ?? null } : { status: "unverified", source: axe.source ?? null, version: null, reason: axe.reason };

// Checks turned off by flags or missing tools: reported as unverified, never as passed.
const skipped = [
  axe.status !== "found" ? { rule: "A1-axe", reason: axe.reason, field: "--axe / AXE_PATH / axe-core 번들" } : null,
  args["no-reflow"] ? { rule: "A4-reflow", reason: "--no-reflow 지정", field: "--no-reflow" } : null,
  args["no-spacing"] ? { rule: "A4-text-spacing", reason: "--no-spacing 지정", field: "--no-spacing" } : null,
].filter(Boolean);

// ---- in-page helpers (serialized into the page) ------------------------------------------
const PAGE_HELPERS = `
window.__qa = (() => {
  const isVisible = el => {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0;
  };
  const sel = el => {
    if (!el || el === document.body) return "body";
    const id = el.id ? "#" + el.id : "";
    const cls = typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\\s+/).slice(0, 3).join(".") : "";
    return (el.tagName.toLowerCase() + id + cls).slice(0, 120);
  };
  const text = el => (el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim();
  const byIds = ids => (ids || "").split(/\\s+/).map(id => document.getElementById(id)).filter(Boolean);
  // Approximate accessible name (not the full accname algorithm): enough to find empty names.
  const name = el => {
    const label = el.getAttribute("aria-label");
    if (label && label.trim()) return label.trim();
    const by = byIds(el.getAttribute("aria-labelledby")).map(text).join(" ").trim();
    if (by) return by;
    if (el.labels && el.labels.length) return [...el.labels].map(text).join(" ").trim();
    if (el.tagName === "IMG") return (el.getAttribute("alt") || "").trim();
    if (el.tagName === "INPUT" && ["submit", "button", "reset"].includes(el.type)) return el.value;
    const own = text(el);
    if (own) return own;
    const imgAlt = [...el.querySelectorAll("img[alt],svg[aria-label],[role='img'][aria-label]")].map(n => n.getAttribute("alt") || n.getAttribute("aria-label")).join(" ").trim();
    if (imgAlt) return imgAlt;
    const svgTitle = el.querySelector("svg title");
    if (svgTitle && text(svgTitle)) return text(svgTitle);
    return (el.getAttribute("title") || el.getAttribute("placeholder") || "").trim();
  };
  const focusStyle = el => {
    const s = getComputedStyle(el);
    return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderColor, s.backgroundColor, s.color, s.textDecorationLine].join("|");
  };
  return { isVisible, sel, text, name, focusStyle };
})();
`;

function structure({ placeholders, skeletonSelector, busySelector, ignoreSelector }) {
  const { sel, text, name } = window.__qa;
  const isVisible = el => window.__qa.isVisible(el) && !el.closest(ignoreSelector);
  const out = { lang: document.documentElement.getAttribute("lang") || "", title: document.title.trim(), main: 0, heading_skips: [], headings: [], img_no_alt: [], unnamed_controls: [], unlabeled_fields: [], tables_no_headers: [], hidden_focusable: [], positive_tabindex: [], dup_aria_ids: [], busy_after_load: 0, skeleton_exposed: [], placeholder_no_text: [] };
  const cap = (arr, item, n = 30) => arr.length < n && arr.push(item);

  out.main = [...document.querySelectorAll("main,[role='main']")].filter(isVisible).length;

  let prev = 0;
  for (const h of document.querySelectorAll("h1,h2,h3,h4,h5,h6,[role='heading']")) {
    if (!isVisible(h) || h.closest("[aria-hidden='true']")) continue;
    const level = h.getAttribute("aria-level") ? Number(h.getAttribute("aria-level")) : Number(h.tagName[1]) || 2;
    out.headings.push(`h${level} ${text(h).slice(0, 40)}`);
    if (prev && level > prev + 1) cap(out.heading_skips, { from: `h${prev}`, to: `h${level}`, el: sel(h), text: text(h).slice(0, 40) });
    prev = level;
  }
  out.headings = out.headings.slice(0, 40);

  for (const img of document.querySelectorAll("img")) {
    if (!isVisible(img) || img.closest("[aria-hidden='true']")) continue;
    if (!img.hasAttribute("alt") && img.getAttribute("role") !== "presentation") cap(out.img_no_alt, { el: sel(img), src: (img.getAttribute("src") || "").slice(0, 80) });
  }

  const controls = "a[href],button,[role='button'],[role='link'],[role='tab'],[role='menuitem'],[role='switch'],[role='checkbox'],[role='radio'],summary";
  for (const el of document.querySelectorAll(controls)) {
    if (!isVisible(el) || el.closest("[aria-hidden='true'],[inert]")) continue;
    if (!name(el)) cap(out.unnamed_controls, { el: sel(el), html: el.outerHTML.slice(0, 120) });
  }

  for (const el of document.querySelectorAll("input:not([type='hidden']):not([type='submit']):not([type='button']):not([type='reset']),select,textarea,[role='combobox'],[role='textbox'],[role='slider']")) {
    if (!isVisible(el) || el.closest("[aria-hidden='true'],[inert]")) continue;
    const labelled = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || (el.labels && el.labels.length) || el.getAttribute("title");
    if (!labelled) cap(out.unlabeled_fields, { el: sel(el), placeholder_only: Boolean(el.getAttribute("placeholder")) });
  }

  for (const t of document.querySelectorAll("table")) {
    if (!isVisible(t) || t.getAttribute("role") === "presentation") continue;
    if (!t.querySelector("th,[role='columnheader'],[role='rowheader']")) cap(out.tables_no_headers, { el: sel(t), rows: t.rows.length });
  }

  const focusable = "a[href],button:not([disabled]),input:not([disabled]):not([type='hidden']),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1']),summary";
  for (const el of document.querySelectorAll(focusable)) {
    if (el.closest("[aria-hidden='true']") && !el.closest("[inert]") && el.tabIndex >= 0) cap(out.hidden_focusable, { el: sel(el) });
    if (el.tabIndex > 0) cap(out.positive_tabindex, { el: sel(el), tabindex: el.tabIndex });
  }

  const idCount = {};
  for (const el of document.querySelectorAll("[id]")) idCount[el.id] = (idCount[el.id] || 0) + 1;
  for (const el of document.querySelectorAll("[aria-labelledby],[aria-describedby],[aria-controls]"))
    for (const attr of ["aria-labelledby", "aria-describedby", "aria-controls"])
      for (const id of (el.getAttribute(attr) || "").split(/\s+/).filter(Boolean))
        if (idCount[id] > 1) cap(out.dup_aria_ids, { id, attr, el: sel(el) });

  out.busy_after_load = [...document.querySelectorAll(busySelector)].filter(isVisible).length;
  for (const el of document.querySelectorAll(skeletonSelector)) {
    if (!isVisible(el) || el.closest("[aria-hidden='true'],[role='status'],[inert]")) continue;
    cap(out.skeleton_exposed, { el: sel(el) });
  }

  // A6: a cell/value that is only a placeholder glyph is read as "dash"/nothing by screen readers.
  const glyphs = new Set(placeholders);
  for (const el of document.querySelectorAll("body *")) {
    if (el.children.length || !isVisible(el) || el.closest("[aria-hidden='true']")) continue;
    if (!glyphs.has(text(el))) continue;
    const accessible = el.getAttribute("aria-label") || el.getAttribute("title") || el.parentElement?.getAttribute("aria-label") || el.parentElement?.querySelector(".sr-only,.visually-hidden,[data-sr-only]");
    if (!accessible) cap(out.placeholder_no_text, { el: sel(el), qa_field: el.closest("[data-qa-field]")?.getAttribute("data-qa-field") || null, glyph: text(el) });
  }
  return out;
}

function captureBaseline() {
  const { focusStyle } = window.__qa;
  const all = document.querySelectorAll("a[href],button,input,select,textarea,summary,[tabindex]");
  all.forEach((el, i) => {
    el.setAttribute("data-qa-a11y-i", String(i));
    window.__qaBase = window.__qaBase || {};
    window.__qaBase[i] = focusStyle(el);
  });
  return all.length;
}

function focusState({ skipPattern, ignoreSelector }) {
  const { isVisible, sel, name, focusStyle } = window.__qa;
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return { body: true };
  if (el.closest(ignoreSelector)) return { ignored: true, key: sel(el) };
  const i = el.getAttribute("data-qa-a11y-i");
  const base = i !== null ? window.__qaBase?.[i] : null;
  const r = el.getBoundingClientRect();
  const offscreen = r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth;
  let obscuredBy = null;
  if (isVisible(el) && !offscreen) {
    const cx = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1);
    const cy = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
    const top = document.elementFromPoint(cx, cy);
    if (top && top !== el && !el.contains(top) && !top.contains(el) && !top.closest(ignoreSelector)) obscuredBy = sel(top);
  }
  return {
    key: i ?? sel(el),
    el: sel(el),
    name: (name(el) || "").slice(0, 40),
    visible: isVisible(el) && !offscreen,
    indicator: base === null ? null : base !== focusStyle(el),
    obscured_by: obscuredBy,
    skip_link: new RegExp(skipPattern, "i").test(name(el) || "") || /^#/.test(el.getAttribute("href") || ""),
  };
}

async function keyboard(page) {
  const total = await page.evaluate(captureBaseline);
  await page.evaluate(() => document.activeElement?.blur?.());
  const seq = [];
  for (let n = 0; n < tabLimit; n++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(40);
    const st = await page.evaluate(focusState, { skipPattern, ignoreSelector });
    seq.push(st);
    if (st.body && n > 0) break; // wrapped out of the document: traversal complete
  }
  const stops = seq.filter(s => !s.body && !s.ignored);
  const keys = stops.map(s => s.key);
  // Trap: Tab never leaves the document and the tail keeps cycling over ≤3 elements.
  const tail = keys.slice(-12);
  const trapped = seq.length >= tabLimit && tail.length >= 12 && new Set(tail).size <= 3;
  return {
    focusable_in_dom: total,
    tab_stops: stops.length,
    distinct_stops: new Set(keys).size,
    complete: seq.at(-1)?.body === true,
    skip_link_first: Boolean(stops[0]?.skip_link),
    first_stop: stops[0]?.el ?? null,
    trap: trapped ? [...new Set(tail)].map(k => stops.find(s => s.key === k)?.el) : null,
    no_indicator: stops.filter(s => s.indicator === false).slice(0, 30).map(s => ({ el: s.el, name: s.name })),
    hidden_focus: stops.filter(s => !s.visible).slice(0, 30).map(s => ({ el: s.el, name: s.name })),
    obscured: stops.filter(s => s.obscured_by).slice(0, 30).map(s => ({ el: s.el, name: s.name, by: s.obscured_by })),
    sequence: stops.slice(0, 60).map(s => s.el),
  };
}

function overflowCulprits(width) {
  const { isVisible, sel } = window.__qa;
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    if (!isVisible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right <= width + 1) continue;
    // Content inside a horizontal scroll container (data tables) is allowed by 1.4.10.
    let scroller = false;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if ((ox === "auto" || ox === "scroll") && p.getBoundingClientRect().right <= width + 1) {
        scroller = true;
        break;
      }
    }
    if (!scroller && ![...el.children].some(c => c.getBoundingClientRect().right > width + 1)) out.push({ el: sel(el), right: Math.round(r.right) });
    if (out.length >= 15) break;
  }
  return { overflow: document.documentElement.scrollWidth > width + 1, scroll_width: document.documentElement.scrollWidth, culprits: out };
}

function clippedSet() {
  const { isVisible, sel } = window.__qa;
  const out = {};
  for (const el of document.querySelectorAll("body *")) {
    if (!isVisible(el) || !el.textContent.trim()) continue;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if ((r.width <= 1 && r.height <= 1) || (s.clip && s.clip !== "auto") || s.clipPath === "inset(50%)") continue; // sr-only
    const clipY = ["hidden", "clip"].includes(s.overflowY) && el.scrollHeight > el.clientHeight + 2;
    const clipX = ["hidden", "clip"].includes(s.overflowX) && el.scrollWidth > el.clientWidth + 2 && s.textOverflow !== "ellipsis";
    if (clipY || clipX) out[sel(el) + "@" + Math.round(el.getBoundingClientRect().top)] = { el: sel(el), text: el.textContent.trim().slice(0, 40) };
  }
  return out;
}

const TEXT_SPACING_CSS = "*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}";

async function waitReady(page) {
  if (ready) await page.locator(ready).first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(settleMs);
}

async function open(context, route) {
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", e => pageErrors.push(e.message));
  const res = await page.goto(base + route, { waitUntil: "load", timeout: 60000 });
  await waitReady(page);
  await page.addScriptTag({ content: PAGE_HELPERS });
  return { page, http: res?.status(), pageErrors };
}

/** A1: inject axe and run it. Missing or failing axe is "unverified", never a pass or a script failure. */
async function runAxe(page) {
  if (axe.status !== "found") return { status: "unverified", source: axe.source ?? null, version: null, reason: axe.reason, violations: null, incomplete: null };
  try {
    await page.addScriptTag({ path: axe.path });
    const r = await page.evaluate(async tags => {
      const res = await window.axe.run(document, { runOnly: { type: "tag", values: tags } });
      return { violations: res.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help, sample: v.nodes[0]?.target?.join(" ") })), incomplete: res.incomplete.length };
    }, wcagTags);
    return { status: "ran", source: axe.source, version: axe.version ?? null, ...r };
  } catch (error) {
    return { status: "unverified", source: axe.source, version: axe.version ?? null, reason: `axe 실행 실패: ${String(error.message).split("\n")[0].slice(0, 200)}`, violations: null, incomplete: null };
  }
}

const playwright = await loadPlaywright();
const browser = await launchChromium(playwright);
const results = [];
try {
  for (const vp of viewports) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, reducedMotion: "reduce" });
    await context.addCookies(cookiesFor(base, cookie));
    for (const route of routes) {
      const row = { route, viewport: vp.label };
      let page;
      try {
        const opened = await open(context, route);
        page = opened.page;
        row.http = opened.http;
        if (row.http >= 400) {
          row.skipped = `HTTP ${row.http} — 정상 UI 검사에서 제외`;
        } else {
          // Load viewport-lazy sections first so their loading placeholders are not counted as stuck.
          await scrollThrough(page);
          await page.waitForTimeout(settleMs);
          row.structure = await page.evaluate(structure, { placeholders, skeletonSelector, busySelector, ignoreSelector });
          // A4 reduced motion: infinite animations still running although prefers-reduced-motion: reduce
          row.motion = await page.evaluate(() =>
            document
              .getAnimations()
              .filter(a => a.playState === "running" && a.effect?.getTiming().iterations === Infinity)
              .slice(0, 20)
              .map(a => window.__qa.sel(a.effect.target)),
          );
          row.axe = await runAxe(page);
          if (!args["no-spacing"]) {
            const before = await page.evaluate(clippedSet);
            await page.addStyleTag({ content: TEXT_SPACING_CSS });
            await page.waitForTimeout(100);
            const after = await page.evaluate(clippedSet);
            row.text_spacing_clipped = Object.entries(after).filter(([k]) => !(k in before)).slice(0, 20).map(([, v]) => v);
            await page.reload({ waitUntil: "load" });
            await waitReady(page);
            await page.addScriptTag({ content: PAGE_HELPERS });
          }
          row.keyboard = await keyboard(page);
        }
        row.page_errors = opened.pageErrors;
      } catch (error) {
        row.error = error.message.slice(0, 300);
      }
      await page?.close();
      results.push(row);
      process.stderr.write(`[a11y] ${route} @${vp.label} ${row.error ? "ERROR" : row.skipped ? "SKIP" : "ok"}\n`);
    }
    await context.close();
  }

  // A4 reflow: WCAG 1.4.10 at 320 CSS px (profile a11y.reflow_width), once per route.
  if (!args["no-reflow"]) {
    const width = reflowWidth;
    const context = await browser.newContext({ viewport: { width, height: 800 }, reducedMotion: "reduce" });
    await context.addCookies(cookiesFor(base, cookie));
    for (const route of routes) {
      let page;
      try {
        const opened = await open(context, route);
        page = opened.page;
        if (opened.http < 400) {
          const reflow = await page.evaluate(overflowCulprits, width);
          const target = results.find(r => r.route === route && !r.skipped && !r.error);
          if (target) target.reflow = { width, ...reflow };
          else results.push({ route, viewport: String(width), http: opened.http, reflow: { width, ...reflow } });
        }
      } catch (error) {
        results.push({ route, viewport: String(width), error: error.message.slice(0, 300) });
      }
      await page?.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
}

// ---- report --------------------------------------------------------------------------
const n = v => (Array.isArray(v) ? v.length : v ?? "-");
const axeHeader = axe.status === "found" ? `실행 (${axe.source}, ${axe.version ?? "버전 미상"})` : `미검증 (${axe.reason})`;
const axeCell = r => (!r.axe ? "-" : r.axe.status === "ran" ? r.axe.violations.length : "미검증");
const profileLabel = args.profile ? `\`${args.profile}\`` : "기본값 (프로필 없음)";
const md = [
  "# 접근성 브라우저 감사 (후보 — 화면 확인 후 판정)",
  "",
  mdRunHeader({ base }),
  `- viewport: ${viewports.map(v => `${v.width}x${v.height}`).join(", ")} · reduced-motion: reduce · Tab 최대 ${tabLimit}회 · 프로필: ${profileLabel}${ready ? ` · ready: \`${ready}\`` : ""}`,
  `- axe: ${axeHeader} · 태그: ${wcagTags.join(", ")}`,
  "- 대비·터치 대상은 `ui-computed.md`(inspect-computed-style)에 있다. 자동 검사 위반 0은 WCAG 준수를 뜻하지 않는다. 실제 스크린리더 확인은 별도다.",
  "- 이름 계산은 근사다(aria-label, labelledby, label, 텍스트, img alt, title). 후보마다 접근성 트리(DevTools)로 확인한다.",
  "",
  mdTable(
    ["route", "vp", "HTTP", "lang", "main", "제목 건너뜀", "alt 없음", "이름 없는 컨트롤", "라벨 없는 입력", "Tab 정지", "skip link", "포커스 표시 없음", "포커스 가려짐", "트랩", `${reflowWidth} 넘침`, "간격 잘림", "무한 애니메이션", "기호만 있는 값", "axe"],
    results.map(r => {
      const s = r.structure ?? {};
      const k = r.keyboard ?? {};
      return [r.route, r.viewport, r.http ?? r.error ?? "-", s.lang || (r.structure ? "**없음**" : "-"), n(s.main), n(s.heading_skips), n(s.img_no_alt), n(s.unnamed_controls), n(s.unlabeled_fields), k.tab_stops ?? "-", r.keyboard ? (k.skip_link_first ? "예" : "아니오") : "-", n(k.no_indicator), n(k.obscured), k.trap ? "**예**" : r.keyboard ? "아니오" : "-", r.reflow ? (r.reflow.overflow ? `**${r.reflow.scroll_width}px**` : "아니오") : args["no-reflow"] ? "미검증" : "-", r.structure && args["no-spacing"] ? "미검증" : n(r.text_spacing_clipped), n(r.motion), n(s.placeholder_no_text), axeCell(r)];
    }),
  ),
  "",
  ...(skipped.length ? ["## 건너뛴 규칙(미검증)", "", mdTable(["규칙", "원인", "사유"], skipped.map(s => [s.rule, s.field, s.reason])), ""] : []),
  ...results.flatMap(r => {
    const s = r.structure ?? {};
    const k = r.keyboard ?? {};
    const lines = [
      r.skipped ? `- ${r.skipped}` : null,
      r.error ? `- 검사 실패: ${r.error}` : null,
      r.structure && !s.lang ? "- A2 `<html lang>` 없음" : null,
      r.structure && !s.title ? "- A2 문서 title 없음" : null,
      r.structure && s.main !== 1 ? `- A2 main landmark ${s.main}개` : null,
      ...(s.heading_skips ?? []).map(h => `- A2 제목 단계 건너뜀 ${h.from}→${h.to} \`${h.el}\` "${h.text}"`),
      ...(s.img_no_alt ?? []).map(x => `- A2 alt 없는 이미지 \`${x.el}\` ${x.src}`),
      ...(s.unnamed_controls ?? []).map(x => `- A2 이름 없는 컨트롤 \`${x.el}\` \`${x.html.replaceAll("`", "'")}\``),
      ...(s.unlabeled_fields ?? []).map(x => `- A2 라벨 없는 입력 \`${x.el}\`${x.placeholder_only ? " (placeholder만 있음)" : ""}`),
      ...(s.tables_no_headers ?? []).map(x => `- A2 헤더 셀 없는 표 \`${x.el}\` (${x.rows}행)`),
      ...(s.hidden_focusable ?? []).map(x => `- A2 aria-hidden 안의 포커스 가능 요소 \`${x.el}\``),
      ...(s.positive_tabindex ?? []).map(x => `- A3 양수 tabindex=${x.tabindex} \`${x.el}\``),
      ...(s.dup_aria_ids ?? []).map(x => `- A2 ${x.attr}가 중복 id \`${x.id}\`를 가리킴 \`${x.el}\``),
      r.keyboard && !k.skip_link_first ? `- A3 첫 Tab이 skip link가 아님 (\`${k.first_stop}\`)` : null,
      k.trap ? `- **A3 키보드 트랩**: ${k.trap.map(e => `\`${e}\``).join(" → ")}` : null,
      r.keyboard && !k.complete && !k.trap ? `- A3 Tab ${tabLimit}회 안에 문서 끝에 도달하지 않음 (정지 ${k.tab_stops}, 고유 ${k.distinct_stops}). --tab-limit을 늘려 다시 확인` : null,
      ...(k.no_indicator ?? []).map(x => `- A3 포커스 표시 변화 없음 \`${x.el}\` "${x.name}"`),
      ...(k.hidden_focus ?? []).map(x => `- A3 보이지 않는 요소에 포커스 \`${x.el}\` "${x.name}"`),
      ...(k.obscured ?? []).map(x => `- A3 포커스 요소가 가려짐 \`${x.el}\` ← \`${x.by}\``),
      r.reflow?.overflow ? `- A4 ${r.reflow.width}px 가로 넘침 (scrollWidth ${r.reflow.scroll_width}px): ${r.reflow.culprits.map(c => `\`${c.el}\`→${c.right}px`).join(", ")}` : null,
      ...(r.text_spacing_clipped ?? []).map(x => `- A4 텍스트 간격 조정 시 잘림 \`${x.el}\` "${x.text}"`),
      ...(r.motion ?? []).map(x => `- A4 reduced-motion에서도 무한 애니메이션 \`${x}\``),
      s.busy_after_load ? `- A5 로드 후에도 busy status ${s.busy_after_load}개` : null,
      ...(s.skeleton_exposed ?? []).map(x => `- A5 스켈레톤이 보조기기에 노출됨 (aria-hidden·status 밖) \`${x.el}\``),
      ...(s.placeholder_no_text ?? []).map(x => `- A6 "${x.glyph}"만 있고 읽을 텍스트 없음 \`${x.el}\`${x.qa_field ? ` (${x.qa_field})` : ""}`),
      r.axe?.status === "unverified" && axe.status === "found" ? `- A1 axe 미검증: ${r.axe.reason}` : null,
      ...(r.axe?.violations ?? []).map(v => `- A1 axe ${v.id} (${v.impact}) ${v.nodes}개 노드: ${v.help}${v.sample ? ` — \`${v.sample}\`` : ""}`),
      r.axe?.status === "ran" && r.axe.incomplete ? `- A1 axe incomplete ${r.axe.incomplete}건 — 수동 확인 목록` : null,
      ...(r.page_errors ?? []).map(e => `- pageerror: ${e.slice(0, 120)}`),
    ].filter(Boolean);
    return lines.length ? [`## ${r.route} @${r.viewport}`, "", ...lines, ""] : [];
  }),
].join("\n");

writeFile(path.join(args.out, "a11y.json"), {
  ...runInfo({ base }),
  profile: args.profile ?? null,
  viewports: viewports.map(v => `${v.width}x${v.height}`),
  ready,
  tab_limit: tabLimit,
  reflow_width: args["no-reflow"] ? null : reflowWidth,
  wcag_tags: wcagTags,
  axe: axeSummary,
  skipped_rules: skipped,
  results,
});
writeFile(path.join(args.out, "a11y.md"), md);
console.log(md);
