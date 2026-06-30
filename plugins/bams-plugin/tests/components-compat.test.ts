import { test, expect } from "bun:test";
import v10 from "./fixtures/components-v1.0.json";
import v11 from "./fixtures/components-v1.1.json";

test("v1.1 reads v1.0 specialists without loss", () => {
  const v10Names = new Set(v10.specialists.map((s: any) => s.name));
  const v11Names = new Set(v11.specialists.map((s: any) => s.name));
  for (const name of v10Names) {
    expect(v11Names.has(name)).toBe(true);
  }
});

test("v1.1 preserves v1.0 phase mapping", () => {
  const v10Map = Object.fromEntries(v10.specialists.map((s: any) => [s.name, s.phase]));
  for (const s of v11.specialists as any[]) {
    if (v10Map[s.name]) expect(s.phase).toBe(v10Map[s.name]);
  }
});

test("v1.0 schema version is 1.0", () => {
  expect(v10.version).toBe("1.0");
});

test("v1.1 schema version is 1.1", () => {
  expect(v11.version).toBe("1.1");
});
