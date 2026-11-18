#!/usr/bin/env node
// Build one offline HTML gallery from screenshots named "<case>__<state>__<width>.png".
// Cases become sections, states (e.g. before-held, after-held, after-loaded) become columns,
// widths become a toggle. Images are embedded as data URIs (no external requests, no network).
//
//   node build-gallery.mjs --dirs <run>/screens[,other/screens] \
//     --out <run>/gallery.html [--title "스켈레톤 전후"] [--cases list,detail]
// <run> = .crew/artifacts/qa/<YYYY-MM-DD>-<scope>
// Exit: 0 gallery written, 2 usage error (missing args, unreadable dir, no matching screenshots).
import fs from "node:fs";
import path from "node:path";
import { list, parseArgs, requireArgs, usageError, writeFile } from "./lib/common.mjs";

const args = parseArgs(process.argv.slice(2), { defaults: { title: "QA 캡처" }, known: ["dirs", "out", "title", "cases"] });
requireArgs(args, ["dirs", "out"]);
const dirs = list(args.dirs);
const only = new Set(list(args.cases));

const shots = [];
for (const dir of dirs) {
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch (error) {
    usageError(`--dirs 디렉터리를 읽을 수 없음: ${dir} (${error.code ?? error.message})`);
  }
  for (const file of entries) {
    const m = file.match(/^(.+?)__(.+)__(\d+)\.png$/);
    if (!m || (only.size && !only.has(m[1]))) continue;
    shots.push({ case: m[1], state: m[2], width: m[3], file: path.join(dir, file) });
  }
}
if (!shots.length) usageError("<case>__<state>__<width>.png 형식의 스크린샷이 없음");

const cases = [...new Set(shots.map(s => s.case))];
const widths = [...new Set(shots.map(s => s.width))].sort((a, b) => b - a);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
let bytes = 0;
const sections = cases.map(c => {
  const states = [...new Set(shots.filter(s => s.case === c).map(s => s.state))].sort();
  const cells = widths.map(w => {
    const figs = states.map(state => {
      const shot = shots.find(s => s.case === c && s.state === state && s.width === w);
      if (!shot) return `<figure><figcaption>${esc(state)}</figcaption><p class="none">캡처 없음</p></figure>`;
      const data = fs.readFileSync(shot.file);
      bytes += data.length;
      return `<figure><figcaption>${esc(state)}</figcaption><button type="button" class="zoom" aria-label="${esc(`${c} ${state} ${w}px 확대`)}"><img loading="lazy" alt="${esc(`${c} ${state} ${w}px`)}" src="data:image/png;base64,${data.toString("base64")}"></button></figure>`;
    });
    return `<div class="row" data-width="${w}" style="grid-template-columns:repeat(${states.length},minmax(0,1fr))">${figs.join("")}</div>`;
  });
  return `<section><h2>${esc(c)}</h2>${cells.join("")}</section>`;
});

const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(args.title)}</title>
<style>
:root{--bg:#f5f6f8;--panel:#fff;--ink:#18202b;--muted:#5b6575;--line:#d9dee6;--accent:#3346c8;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#10151d;--panel:#18202b;--ink:#e5e9f0;--muted:#9aa4b4;--line:#2b3544;--accent:#8e9bff;color-scheme:dark}}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.6 system-ui,-apple-system,"Apple SD Gothic Neo",sans-serif}
header{position:sticky;top:0;background:var(--panel);border-bottom:1px solid var(--line);padding:12px 20px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;z-index:2}
h1{font-size:17px;margin:0 12px 0 0}.meta{color:var(--muted);font-size:12.5px}
.w{border:1px solid var(--line);background:var(--panel);color:var(--ink);padding:4px 12px;border-radius:999px;cursor:pointer}
.w[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:#fff}
main{padding:20px;display:grid;gap:28px}section h2{font-size:15px;margin:0 0 8px}
.row{display:grid;gap:12px}.row[hidden]{display:none}
figure{margin:0;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:8px;min-width:0}
figcaption{font-size:12px;color:var(--muted);margin-bottom:6px}
.zoom{all:unset;cursor:zoom-in;display:block}.zoom:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
img{width:100%;height:auto;display:block;border-radius:4px}.none{color:var(--muted);font-size:12px}
dialog{max-width:96vw;max-height:94vh;padding:0;border:0;background:transparent}dialog img{max-width:96vw;width:auto;max-height:none}
dialog::backdrop{background:rgba(0,0,0,.75)}
</style></head><body>
<header><h1>${esc(args.title)}</h1>
${widths.map((w, i) => `<button type="button" class="w" data-w="${w}" aria-pressed="${i === 0}">${w}px</button>`).join("")}
<span class="meta">${cases.length}개 사례 · ${shots.length}장 · 생성 ${new Date().toISOString()}</span></header>
<main>${sections.join("")}</main>
<dialog id="viewer"><img alt=""></dialog>
<script>
const show=w=>{document.querySelectorAll('.row').forEach(r=>r.hidden=r.dataset.width!==w);document.querySelectorAll('.w').forEach(b=>b.setAttribute('aria-pressed',b.dataset.w===w))};
document.querySelectorAll('.w').forEach(b=>b.addEventListener('click',()=>show(b.dataset.w)));
show(${JSON.stringify(widths[0])});
const v=document.getElementById('viewer');
document.querySelectorAll('.zoom').forEach(b=>b.addEventListener('click',()=>{const i=b.querySelector('img');v.querySelector('img').src=i.src;v.querySelector('img').alt=i.alt;v.showModal()}));
v.addEventListener('click',()=>v.close());
</script></body></html>`;
writeFile(args.out, html);
console.log(`[gallery] ${args.out} — ${cases.length} cases, ${shots.length} images, ${(bytes / 1048576).toFixed(1)} MiB embedded`);
