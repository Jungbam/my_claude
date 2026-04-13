#!/usr/bin/env bash
set -euo pipefail

# ─── sync-cache.sh ───────────────────────────────────────────────────────────
# Source → Cache 단방향 동기화 (rsync 기반)
# 용도: bams-plugin source 디렉토리를 ~/.claude/plugins/cache/ 로 동기화
# ──────────────────────────────────────────────────────────────────────────────

PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"
CACHE_BASE="$HOME/.claude/plugins/cache/my-claude/bams-plugin"

# ─── 플래그 파싱 ─────────────────────────────────────────────────────────────
DRY_RUN=false
VERBOSE=false

usage() {
  cat <<'USAGE'
Usage: sync-cache.sh [OPTIONS]

Source → Cache 단방향 동기화 (rsync 기반)

Options:
  -n, --dry-run    변경사항만 표시, 실제 동기화 안 함
  -v, --verbose    상세 로그 출력
  -h, --help       이 도움말 출력
USAGE
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -n|--dry-run) DRY_RUN=true; shift ;;
    -v|--verbose) VERBOSE=true; shift ;;
    -h|--help)    usage ;;
    *)            echo "Unknown option: $1" >&2; usage ;;
  esac
done

# ─── Source 디렉토리 확인 ────────────────────────────────────────────────────
if [ ! -d "$PLUGIN_DIR" ]; then
  echo "Error: source 디렉토리를 찾을 수 없습니다: $PLUGIN_DIR" >&2
  exit 1
fi

# ─── Cache 버전 디렉토리 자동 감지 ──────────────────────────────────────────
if [ ! -d "$CACHE_BASE" ]; then
  echo "Error: cache base 디렉토리를 찾을 수 없습니다: $CACHE_BASE" >&2
  exit 1
fi

VERSION_DIR=$(ls -d "$CACHE_BASE"/*/ 2>/dev/null | sort -V | tail -1)

if [ -z "$VERSION_DIR" ]; then
  echo "Error: cache 버전 디렉토리가 없습니다: $CACHE_BASE/*/" >&2
  exit 1
fi

# 끝 슬래시 보장
VERSION_DIR="${VERSION_DIR%/}/"

echo "Source:  $PLUGIN_DIR"
echo "Cache:   $VERSION_DIR"
echo ""

# ─── 동기화 대상 정의 ────────────────────────────────────────────────────────
SYNC_DIRS=(
  agents/
  bin/
  commands/
  hooks/
  lib/
  references/
  scripts/
  server/
  skills/
  styles/
  templates/
  tools/
)

SYNC_FILES=(
  SKILL.md
  SKILL.md.tmpl
  package.json
  setup.sh
)

EXCLUDE_ARGS=(
  --exclude='node_modules/'
  --exclude='.DS_Store'
  --exclude='__pycache__/'
  --exclude='.mcp.json'
  --exclude='*.pyc'
)

# ─── rsync 공통 옵션 구성 ────────────────────────────────────────────────────
RSYNC_BASE_OPTS=(--archive --update)

if $DRY_RUN; then
  RSYNC_BASE_OPTS+=(--dry-run)
fi

if $VERBOSE; then
  RSYNC_BASE_OPTS+=(--verbose)
else
  RSYNC_BASE_OPTS+=(--itemize-changes)
fi

# ─── 동기화 실행 ─────────────────────────────────────────────────────────────
CHANGE_COUNT=0

sync_item() {
  local src="$1"
  local dst="$2"
  local is_dir="$3"
  local extra_opts=("${RSYNC_BASE_OPTS[@]}" "${EXCLUDE_ARGS[@]}")

  if $is_dir; then
    extra_opts+=(--delete)
  fi

  local output
  output=$(rsync "${extra_opts[@]}" "$src" "$dst" 2>&1) || true

  if [ -n "$output" ]; then
    echo "$output"
    local lines
    lines=$(echo "$output" | grep -c '^[<>ch.*]' 2>/dev/null || true)
    CHANGE_COUNT=$((CHANGE_COUNT + lines))
  fi
}

# 디렉토리 동기화
for dir in "${SYNC_DIRS[@]}"; do
  src="$PLUGIN_DIR/$dir"
  dst="$VERSION_DIR/$dir"

  if [ -d "$src" ]; then
    sync_item "$src" "$dst" true
  else
    # source에 없는데 cache에 존재하면 삭제
    if [ -d "$dst" ]; then
      echo "Deleting stale cache directory: $dir"
      if ! $DRY_RUN; then
        rm -rf "$dst"
      fi
      CHANGE_COUNT=$((CHANGE_COUNT + 1))
    fi
  fi
done

# 단일 파일 동기화
for file in "${SYNC_FILES[@]}"; do
  src="$PLUGIN_DIR/$file"
  dst="$VERSION_DIR/$file"

  if [ -f "$src" ]; then
    sync_item "$src" "$dst" false
  else
    # source에 없는데 cache에 존재하면 삭제
    if [ -f "$dst" ]; then
      echo "Deleting stale cache file: $file"
      if ! $DRY_RUN; then
        rm -f "$dst"
      fi
      CHANGE_COUNT=$((CHANGE_COUNT + 1))
    fi
  fi
done

# ─── 결과 출력 ────────────────────────────────────────────────────────────────
echo ""
if $DRY_RUN; then
  echo "[dry-run] 동기화 대상: ${CHANGE_COUNT}건 (실제 변경 없음)"
else
  if [ "$CHANGE_COUNT" -eq 0 ]; then
    echo "동기화 완료: 변경 0건 (이미 최신 상태)"
  else
    echo "동기화 완료: ${CHANGE_COUNT}건 변경됨"
  fi
fi
