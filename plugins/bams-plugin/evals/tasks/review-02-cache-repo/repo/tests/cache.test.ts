import { expect, test } from "bun:test";
import { TtlCache } from "../src/cache";

test("expires after ttl", () => {
  let t = 0;
  const c = new TtlCache<string>(100, () => t);
  c.set("k", "v");
  expect(c.get("k")).toBe("v");
  t = 100;
  expect(c.get("k")).toBeUndefined();
});
