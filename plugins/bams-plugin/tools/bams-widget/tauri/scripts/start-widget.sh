#!/usr/bin/env bash
# start-widget.sh
# bams-widget 안전 실행 래퍼
#
# 사용법:
#   bash scripts/start-widget.sh            # dist 점검 후 tauri dev 실행 (권장)
#   bash scripts/start-widget.sh --prod     # dist 빌드 후 debug 바이너리 직접 실행
#   bash scripts/start-widget.sh --build-only  # dist 빌드만 수행, 실행하지 않음
#
# 동작:
#   1. dist/index.html 존재 여부 점검
#   2. 없으면 자동으로 vite build 실행
#   3. 빌드 완료 후 tauri dev 또는 debug 바이너리 실행

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TAURI_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_INDEX="$TAURI_ROOT/dist/index.html"

# ── 플래그 파싱 ────────────────────────────────────────────────

PROD_MODE=false
BUILD_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --prod)       PROD_MODE=true ;;
    --build-only) BUILD_ONLY=true ;;
    --help|-h)
      echo "사용법: bash scripts/start-widget.sh [--prod] [--build-only]"
      echo ""
      echo "  (없음)        dist 점검 후 bun run tauri dev 실행 (개발 모드, HMR 지원)"
      echo "  --prod        dist 빌드 후 debug 바이너리 직접 실행"
      echo "  --build-only  dist 빌드만 수행 (실행하지 않음)"
      echo ""
      echo "트러블슈팅:"
      echo "  빈 화면 → dist/index.html 부재가 원인일 가능성 높음"
      echo "  이 스크립트를 실행하면 자동으로 빌드 후 재기동합니다"
      exit 0
      ;;
  esac
done

# ── dist 점검 ─────────────────────────────────────────────────

if [[ ! -f "$DIST_INDEX" ]]; then
  echo "[start-widget] dist/index.html 없음 — 프론트엔드 빌드를 실행합니다..."
  echo ""
  cd "$TAURI_ROOT"
  bunx vite build
  echo ""
  echo "[start-widget] 빌드 완료 → dist/index.html 생성됨"
else
  echo "[start-widget] dist/index.html 확인 완료 ($(ls -lh "$DIST_INDEX" | awk '{print $5}'))"
fi

# ── 빌드만 옵션 ───────────────────────────────────────────────

if [[ "$BUILD_ONLY" == "true" ]]; then
  echo "[start-widget] --build-only 플래그: 실행 단계 생략"
  echo "[start-widget] 재기동하려면: bash scripts/start-widget.sh"
  exit 0
fi

# ── 실행 ──────────────────────────────────────────────────────

cd "$TAURI_ROOT"

if [[ "$PROD_MODE" == "true" ]]; then
  BINARY="$TAURI_ROOT/src-tauri/target/debug/bams-widget"
  if [[ ! -f "$BINARY" ]]; then
    echo "[start-widget] [ERROR] debug 바이너리 없음: $BINARY" >&2
    echo "[start-widget] 먼저 'bunx tauri build --debug' 또는 'bun run tauri dev'를 실행하세요." >&2
    exit 1
  fi
  echo "[start-widget] debug 바이너리 직접 실행: $BINARY"
  exec "$BINARY"
else
  echo "[start-widget] tauri dev 실행 (개발 모드 — HMR + beforeDevCommand 자동 실행)"
  echo "[start-widget] 종료: Ctrl+C"
  echo ""
  exec bunx tauri dev
fi
