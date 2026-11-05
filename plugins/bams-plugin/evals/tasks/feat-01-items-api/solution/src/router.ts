import type { Req, Res } from "./types";
import type { Store } from "./store";

const NOT_FOUND: Res = { status: 404, body: { error: "not_found" } };
const NOT_ALLOWED: Res = { status: 405, body: { error: "method_not_allowed" } };

function create(body: unknown, store: Store): Res {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const fields: string[] = [];
  if (name.length === 0 || name.length > 50) fields.push("name");
  if (typeof b.price !== "number" || !Number.isFinite(b.price) || b.price < 0) fields.push("price");
  if (fields.length) return { status: 400, body: { error: "validation", fields } };
  if (store.list().some((i) => i.name.toLowerCase() === name.toLowerCase())) {
    return { status: 409, body: { error: "duplicate" } };
  }
  return { status: 201, body: store.insert({ name, price: b.price as number }) };
}

export function handle(req: Req, store: Store): Res {
  const { method, path } = req;
  if (path === "/health") return method === "GET" ? { status: 200, body: { ok: true } } : NOT_ALLOWED;
  if (path === "/items") {
    if (method === "GET") return { status: 200, body: store.list() };
    if (method === "POST") return create(req.body, store);
    return NOT_ALLOWED;
  }
  const m = /^\/items\/([^/]+)$/.exec(path);
  if (m) {
    if (method !== "GET") return NOT_ALLOWED;
    const item = store.get(m[1]);
    return item ? { status: 200, body: item } : NOT_FOUND;
  }
  return NOT_FOUND;
}
