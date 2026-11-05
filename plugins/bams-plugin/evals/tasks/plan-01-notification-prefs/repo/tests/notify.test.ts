import { expect, test } from "bun:test";
import { notify } from "../src/notify";
import { outbox } from "../src/mailer";

test("notify sends mail", () => {
  notify({ id: "1", email: "a@x.io", timezone: "UTC" }, "digest", "Hi", "body");
  expect(outbox.at(-1)?.subject).toBe("[digest] Hi");
});
