import { expect, test } from "bun:test";
import { createSession, verifySession } from "../src/session";

test("session roundtrip", () => {
  const store = new Map();
  const s = createSession(store, "u1", 60);
  expect(verifySession(store, s.id)?.userId).toBe("u1");
});

test("unknown session", () => {
  expect(verifySession(new Map(), "nope")).toBeNull();
});
