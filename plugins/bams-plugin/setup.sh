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

# --- Cache 동기화 ---
SYNC_SCRIPT="$PLUGIN_DIR/sync-cache.sh"
if [ -f "$SYNC_SCRIPT" ]; then
  echo "Source → Cache 동기화 실행 중..."
  chmod +x "$SYNC_SCRIPT"
  bash "$SYNC_SCRIPT"
else
  echo "Warning: sync-cache.sh를 찾을 수 없습니다. 캐시 동기화를 건너뜁니다." >&2
fi

echo "gstack-plugin setup 완료"
