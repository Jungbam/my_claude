#!/usr/bin/env bash
# source-path.sh — delegation-guard / verify-before-stop 공용 판정 함수 (source 전용).
# bash 3.2 호환, 외부 프로세스 없음.

# 소스 코드 경로면 0. 문서(*.md), .crew/**, 스크래치(/tmp, /private/tmp, $2=scratchpad_dir)는 1.
bams_is_source_path() {
  local p="$1" scratch="${2:-}" base ext
  [ -z "$p" ] && return 1
  case "$p" in
    /tmp/*|/private/tmp/*) return 1 ;;
    */.crew/*|.crew/*) return 1 ;;
    *.md|*.MD|*.mdx) return 1 ;;
  esac
  if [ -n "$scratch" ]; then
    case "$p" in "$scratch"/*) return 1 ;; esac
  fi
  case "$p" in */prisma/*|prisma/*) return 0 ;; esac
  base="${p##*/}"
  case "$base" in Dockerfile|*.dockerfile) return 0 ;; esac
  case "$base" in *.*) ext="${base##*.}" ;; *) return 1 ;; esac
  case "$ext" in
    ts|tsx|js|jsx|mjs|cjs|mts|cts|vue|svelte|py|go|rs|java|kt|kts|swift|rb|php|c|cc|cpp|h|hpp|cs|\
    css|scss|sass|less|sql|prisma|sh|bash|zsh) return 0 ;;
  esac
  return 1
}

# 경로 → 추천 부서장 (CLAUDE.md §2 라우팅 표 축약).
bams_route_for_path() {
  case "$1" in
    */src/app/api/*|*.server.ts|*/prisma/*|prisma/*|*.prisma) echo "backend-engineering" ;;
    *.tsx|*.jsx|*.css|*.scss|*.sass|*.less|*/src/app/*|*/src/components/*) echo "frontend-engineering" ;;
    *Dockerfile|*.dockerfile|*/.github/*|*.sql|*.sh|*.bash|*/scripts/etl/*) echo "platform-devops" ;;
    *) echo "도메인 부서장(frontend-engineering/backend-engineering/platform-devops)" ;;
  esac
}
