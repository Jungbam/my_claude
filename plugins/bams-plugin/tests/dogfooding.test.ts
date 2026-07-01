import { test, expect } from "bun:test";
import { $ } from "bun";
import { existsSync } from "fs";
import { join } from "path";

test("dogfooding: sample-guide.zip → 3 산출물 생성", async () => {
  // NOTE: 실제 design-import 커맨드는 Claude Code harness에서만 spawn 가능
  // 여기서는 fixture 파일 존재 + zip 무결성만 검증
  const fixture = join(__dirname, "dogfooding/sample-guide.zip");
  expect(existsSync(fixture)).toBe(true);

  // zip 무결성 (unzip -t)
  const result = await $`unzip -t ${fixture}`.quiet();
  expect(result.exitCode).toBe(0);

  // zip 내 index.jsx + tokens.css 존재 확인
  const list = await $`unzip -l ${fixture}`.text();
  expect(list).toContain("index.jsx");
  expect(list).toContain("tokens.css");
});

test("dogfooding: fixture size < 100KB", async () => {
  const fixture = join(__dirname, "dogfooding/sample-guide.zip");
  const stat = await $`stat -f%z ${fixture}`.text();
  const size = parseInt(stat.trim(), 10);
  expect(size).toBeLessThan(100_000);
});
