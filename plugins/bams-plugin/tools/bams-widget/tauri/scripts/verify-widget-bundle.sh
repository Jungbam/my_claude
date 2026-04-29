#!/usr/bin/env bash
# verify-widget-bundle.sh
# bams-widget 빌드 산출물 존재 여부를 빠르게 점검
#
# 사용법:
#   bash scripts/verify-widget-bundle.sh          # 점검만
#   bash scripts/verify-widget-bundle.sh --strict  # 점검 + assets 파일 수 최소 확인
#
# CI/preflight에서 사용 가능:
#   bash scripts/verify-widget-bundle.sh && echo "OK" || exit 1
#
# 종료 코드:
#   0 — 모든 필수 파일 존재
#   1 — 하나 이상의 필수 파일 누락

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TAURI_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

STRICT_MODE=false
for arg in "$@"; do
  case "$arg" in
    --strict) STRICT_MODE=true ;;
  esac
done

PASS=0
FAIL=0

check() {
  local label="$1"
  local path="$2"
  if [[ -e "$path" ]]; then
    echo "  [PASS] $label"
    ((PASS++)) || true
  else
    echo "  [FAIL] $label — 없음: $path"
    ((FAIL++)) || true
  fi
}

echo "[verify-widget-bundle] 빌드 산출물 점검 시작"
echo "  대상: $TAURI_ROOT/dist/"
echo ""

# ── 필수 파일 점검 ─────────────────────────────────────────────

check "dist/index.html"  "$TAURI_ROOT/dist/index.html"
check "dist/assets/ 디렉터리" "$TAURI_ROOT/dist/assets"

# ── assets 파일 점검 (strict 모드) ────────────────────────────

if [[ "$STRICT_MODE" == "true" ]]; then
  ASSET_COUNT=$(find "$TAURI_ROOT/dist/assets" -type f 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$ASSET_COUNT" -ge 2 ]]; then
    echo "  [PASS] dist/assets/ 파일 수: $ASSET_COUNT (최소 2개 이상)"
    ((PASS++)) || true
  else
    echo "  [FAIL] dist/assets/ 파일 수 부족: $ASSET_COUNT (최소 2개 필요)"
    ((FAIL++)) || true
  fi

  # JS 번들 확인
  JS_COUNT=$(find "$TAURI_ROOT/dist/assets" -name "*.js" -type f 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$JS_COUNT" -ge 1 ]]; then
    echo "  [PASS] dist/assets/*.js: $JS_COUNT 개"
    ((PASS++)) || true
  else
    echo "  [FAIL] dist/assets/*.js 없음 — Vite 빌드 불완전"
    ((FAIL++)) || true
  fi

  # CSS 번들 확인
  CSS_COUNT=$(find "$TAURI_ROOT/dist/assets" -name "*.css" -type f 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$CSS_COUNT" -ge 1 ]]; then
    echo "  [PASS] dist/assets/*.css: $CSS_COUNT 개"
    ((PASS++)) || true
  else
    echo "  [FAIL] dist/assets/*.css 없음 — Tailwind/CSS 빌드 불완전"
    ((FAIL++)) || true
  fi
fi

# ── 결과 요약 ──────────────────────────────────────────────────

echo ""
echo "[verify-widget-bundle] 결과: PASS $PASS / FAIL $FAIL"

if [[ "$FAIL" -gt 0 ]]; then
  echo ""
  echo "[verify-widget-bundle] [ACTION] 빌드 산출물 누락. 다음 명령을 실행하세요:"
  echo "  cd $(dirname "$TAURI_ROOT")/tauri && bunx vite build"
  echo "  또는: bash scripts/start-widget.sh --build-only"
  exit 1
fi

echo "[verify-widget-bundle] 모든 점검 통과. 앱 실행 준비 완료."
