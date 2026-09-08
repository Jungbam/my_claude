#!/usr/bin/env bash
# check-heavy-exempt.sh — guard-b2: heavy-lead(design-director·product-strategy) spawn 블록에
#   exempt 마커 금지(반드시 값 주입) — 최대 로드원 감축 강제. design-infra §3-4(b2) 승격.
# usage: check-heavy-exempt.sh          # commands/bams 전체 스캔
#        check-heavy-exempt.sh [FILE...]
# 예외: b2 화이트리스트(load-profile-b2-whitelist.txt, init-time 분석 spawn = init.md)
# 판정: heavy-lead 블록 내 load_profile:exempt 발견 시 exit 1. (화이트리스트 파일 예외)
# same-line marker 정책(rev1 Major 2 fix): heavy 앵커 줄(subagent_type)에 exempt 마커가
#   같은 줄에 병기된 경우도 검출(next 전 검사) — check-load-profile.sh AC-16b와 동일 로직.
# 실행 위치: repo 고정(캐시 사본 실행 금지) — scripts/는 repo-fixed 운영 도구(design-infra §2-3).
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
P="$(dirname "$SCRIPT_DIR")"
CMD_DIR="$P/commands/bams"
B2WL="$CMD_DIR/load-profile-b2-whitelist.txt"

HEAVY='design-director|product-strategy'

FILES=("$@")
if [ "${#FILES[@]}" -eq 0 ]; then
  while IFS= read -r line; do FILES+=("$line"); done \
    < <(grep -rlE "subagent_type" --include='*.md' "$CMD_DIR" | sort)
fi

load_list(){ [ -f "$1" ] && sed -E 's/#.*$//' "$1" | sed -E 's/[[:space:]]+$//' | grep -v '^[[:space:]]*$'; }
B2LIST="$(load_list "$B2WL")"

RC=0
for f in "${FILES[@]}"; do
  rel="${f#$CMD_DIR/}"
  # heavy-lead 블록(앵커 ~ 다음 앵커) 내 exempt 마커 존재 검출
  viol=$(awk -v H="$HEAVY" '
    /subagent_type/ && /bams-plugin:/ {
      inh = ($0 ~ ("bams-plugin:(" H ")")) ? 1 : 0;
      if(inh && $0 ~ /load_profile:exempt/){ v++ }   # same-line marker(앵커 줄 병기) 검출
      next }
    { if(inh && $0 ~ /load_profile:exempt/){ v++ } }
    END{ print v+0 }' "$f")
  if [ "${viol:-0}" -gt 0 ]; then
    if printf '%s\n' "$B2LIST" | grep -Fxq "$rel"; then
      echo "b2 N/A: $rel — heavy-lead exempt 이나 b2 화이트리스트(init-time) 예외"
    else
      echo "b2 FAIL: $rel — heavy-lead(design-director/product-strategy) 블록에 exempt 마커 ${viol}건 (값 주입 필수)"
      RC=1
    fi
  fi
done

echo "---- heavy-exempt(b2): $([ "$RC" -eq 0 ] && echo PASS || echo FAIL) (exit $RC) ----"
exit "$RC"
