// Tiny fixture app for selftest.mjs (127.0.0.1 only, no external requests): a detail page and API,
// a streamed Suspense-style reveal ($RC, as Next.js App Router inlines it) and deliberate UI /
// accessibility defects the qa-audit scripts must detect. All names and values are generic.
import http from "node:http";

const ITEMS = [{ id: "a1", name: "Alpha", count: 12, holding: 3, total: 1200 }];

// Cache-bypass header used by selftest (measure-api --nocache-header x-qa-nocache).
// The fixture honours it by reporting x-cache: BYPASS instead of HIT.
export const NOCACHE_HEADER = "x-qa-nocache";

// UI defects for inspect-computed-style.mjs: page-title stays 48px on mobile (role mismatch), text-label is 13px,
// low-contrast paragraph, token background class that resolves to transparent. The header links are small
// touch targets on mobile.
function detail(item) {
  return `<main style="max-width:900px;margin:0 auto;padding:16px;font-family:sans-serif">
  <h1 class="page-title" style="font-size:48px;line-height:1.18;font-weight:600">${item.name}</h1>
  <p class="text-label" style="font-size:13px">Summary</p>
  <div data-qa-section="summary">
    <p>Count: <span data-qa-field="item.count">${item.count}</span></p>
    <p>Holding: <span data-qa-field="item.holding">${item.holding}</span></p>
    <p>Total: <span data-qa-field="item.total">${item.total}</span></p>
    <p style="color:#777;background:#888">low contrast text</p>
    <div class="bg-surface-ghost">phantom token background</div>
  </div></main>`;
}

// Accessibility defects for audit-a11y.mjs (the shared page template also lacks <html lang>).
const A11Y_PAGE = `<style>@keyframes spin{to{transform:rotate(360deg)}}</style>
<div style="position:fixed;top:0;left:0;right:0;height:60px;background:#fff;z-index:10;border-bottom:1px solid #ccc">sticky bar</div>
<a id="covered" href="/about" style="position:absolute;top:20px;left:300px">covered link</a>
<main style="padding:80px 16px 16px">
  <h1>Accessibility fixture</h1>
  <h3>Skipped level</h3>
  <img src="/logo.png" width="20" height="20" style="background:#ccc">
  <button type="button"><svg width="16" height="16"><path d="M0 0h16v16H0z"/></svg></button>
  <button type="button" aria-label="Close panel"><svg width="16" height="16"><path d="M0 0h16v16H0z"/></svg></button>
  <button type="button" class="nofocus" style="outline:none">No ring</button>
  <input placeholder="Search">
  <table><tr><td>Total</td><td>1.2K</td></tr></table>
  <div aria-hidden="true"><a href="/about">hidden link</a></div>
  <span tabindex="3">jump</span>
  <p>Holding: <span data-qa-field="item.holding">—</span></p>
  <div class="spin" style="width:10px;height:10px;background:#333;animation:spin 1s linear infinite"></div>
  <div style="height:20px;width:260px;overflow:hidden;font-size:16px;line-height:normal">Fits before spacing</div>
  <div style="width:600px;height:10px;background:#eee"></div>
  <div class="animate-pulse" style="width:50px;height:10px;background:#ddd"></div>
  <div role="status" aria-busy="true">Loading more</div>
  <input aria-label="Trap" onkeydown="if(event.key==='Tab'){event.preventDefault()}">
</main>`;

// Defect-free page for the false-positive checks (audit-a11y, inspect-computed-style): lang, title, skip link
// first, one main/h1, labelled field, table headers, AA contrast, 48px touch targets, visible focus ring,
// role classes matching selftest's profile-browser.json. No internal "/" links, so measure-web query-warm
// has no leave link here (-> unverified).
const CLEAN_PAGE = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Clean fixture</title>
<style>
body{margin:0;background:#fff;color:#111;font:16px/1.5 sans-serif}
.skip,button,input{display:inline-block;box-sizing:border-box;min-height:48px;min-width:48px;padding:12px;font:inherit}
.skip{color:#0b4f9c}
button{color:#fff;background:#0b4f9c;border:0}
input{color:#111;background:#fff;border:1px solid #555}
:focus-visible{outline:3px solid #b3261e;outline-offset:2px}
main{max-width:600px;margin:0 auto;padding:16px}
.page-title{font-size:48px;line-height:1.2;font-weight:600;margin:0 0 16px}
.text-label{font-size:0.75rem;font-weight:600;color:#333}
@media (max-width:600px){.page-title{font-size:32px}}
</style></head><body>
<a class="skip" href="#main">Skip to content</a>
<main id="main">
  <h1 class="page-title">Clean page</h1>
  <p class="text-label">Summary</p>
  <p>Count: <span data-qa-field="item.count">12</span></p>
  <table><caption>Totals</caption><tr><th scope="col">Item</th><th scope="col">Total</th></tr><tr><td>Alpha</td><td>1200</td></tr></table>
  <label for="q">Search</label> <input id="q" type="text">
  <button type="button">Apply</button>
</main></body></html>`;

const page = (body, streamed) => `<!DOCTYPE html><html><head><meta charset="utf-8"><title>fixture</title></head><body style="margin:0;background:#fff;color:#111">
<header><a href="/" style="display:inline-block;padding:4px">Home</a> <a href="/about">About</a></header>
${streamed ? `<div id="B:0" role="status" aria-busy="true"><main style="max-width:900px;margin:0 auto;padding:16px"><h1 class="page-title" style="font-size:48px">&nbsp;</h1><div style="height:200px;background:#eee"></div></main></div>
<div hidden id="S:0">${body}</div>
<script>$RC=function(b,s){var t=document.getElementById(b),n=document.getElementById(s);t.replaceWith.apply(t,Array.from(n.childNodes));n.remove()};</script>
<script>$RC("B:0","S:0")</script>` : body}
</body></html>`;

// server.stats.requests counts every request (guard checks assert it does not move).
// /api/hang accepts the request and never answers (measure-api --timeout-ms check); close with
// server.closeAllConnections() before server.close().
export function start(port = 0) {
  const stats = { requests: 0 };
  const server = http.createServer((req, res) => {
    stats.requests++;
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/api/hang") return;
    if (url.pathname === "/api/auth") {
      res.writeHead(401, { "content-type": "application/json" });
      return res.end('{"error":"unauthorized"}');
    }
    if (url.pathname === "/api/redirect") {
      res.writeHead(302, { location: "/api/detail/a1" });
      return res.end();
    }
    if (url.pathname === "/clean") {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(CLEAN_PAGE);
    }
    const bypass = Boolean(req.headers[NOCACHE_HEADER]);
    const send = (status, type, body) => {
      res.writeHead(status, {
        "content-type": type,
        "server-timing": 'db;dur=12;desc="n=1", app;dur=3',
        "x-cache": bypass ? "BYPASS" : "HIT",
      });
      res.end(body);
    };
    if (url.pathname.startsWith("/api/detail/")) {
      const item = ITEMS.find(x => x.id === url.pathname.split("/").pop());
      if (!item) return send(404, "application/json", "{}");
      return send(200, "application/json", JSON.stringify({ item }));
    }
    if (url.pathname.startsWith("/detail/")) {
      const item = ITEMS.find(x => x.id === url.pathname.split("/").pop());
      if (!item) return send(404, "text/html", page("<main><h1>Not found</h1></main>"));
      return send(200, "text/html", page(detail(item), true));
    }
    if (url.pathname === "/a11y") return send(200, "text/html", page(A11Y_PAGE));
    if (url.pathname === "/about") return send(200, "text/html", page("<main><h1>About</h1></main>"));
    if (url.pathname === "/") return send(200, "text/html", page('<main><h1>Home</h1><a href="/detail/a1">Alpha</a></main>'));
    send(404, "text/plain", "not found");
  });
  server.stats = stats;
  return new Promise(resolve => server.listen(port, "127.0.0.1", () => resolve(server)));
}
