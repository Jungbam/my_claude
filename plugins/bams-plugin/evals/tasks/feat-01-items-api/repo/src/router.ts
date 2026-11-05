import type { Req, Res } from "./types";
import type { Store } from "./store";

const NOT_FOUND: Res = { status: 404, body: { error: "not_found" } };

export function handle(req: Req, store: Store): Res {
  if (req.method === "GET" && req.path === "/health") {
    return { status: 200, body: { ok: true } };
  }
  if (req.method === "GET" && req.path === "/items") {
    return { status: 200, body: store.list() };
  }
  return NOT_FOUND;
}
