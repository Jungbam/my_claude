#!/usr/bin/env bash
set -e

if ! command -v bun >/dev/null 2>&1; then
  echo "Error: bun이 필요합니다. curl -fsSL https://bun.sh/install | bash" >&2
  exit 1
fi

PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"

cd "$PLUGIN_DIR"
bun install

# browse 바이너리 빌드
mkdir -p "$PLUGIN_DIR/skills/browse/bin"
bun build --compile "$PLUGIN_DIR/skills/browse/src/cli.ts" \
  --outfile "$PLUGIN_DIR/skills/browse/bin/browse"
bun build --compile "$PLUGIN_DIR/skills/browse/src/find-browse.ts" \
  --outfile "$PLUGIN_DIR/skills/browse/bin/find-browse"

# Playwright 브라우저 설치
bunx playwright install chromium 2>/dev/null || true

echo "gstack-plugin setup 완료"
