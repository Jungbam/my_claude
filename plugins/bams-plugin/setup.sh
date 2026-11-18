#!/usr/bin/env bash
set -e

if ! command -v bun >/dev/null 2>&1; then
  echo "Error: bun이 필요합니다. curl -fsSL https://bun.sh/install | bash" >&2
  exit 1
fi

PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"

cd "$PLUGIN_DIR"
bun install

# QA 감사 스크립트(skills/qa-audit/scripts)는 node 18+로 실행 — 없거나 낮으면 경고만
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 18 ] 2>/dev/null; then
  echo "Warning: QA 감사 스크립트에는 node 18 이상이 필요합니다 (현재: $(node -v 2>/dev/null || echo '없음')). 나머지 설치는 계속합니다." >&2
fi

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
echo "QA 감사 도구 확인: (cd \"$PLUGIN_DIR\" && node skills/qa-audit/scripts/doctor.mjs && bun run qa-audit:selftest)"
