#!/usr/bin/env bash
# spawn-load.sh — 에이전트 1회 spawn당 사전 로드 줄수 계측 (NSM/AC SSOT)
# usage: spawn-load.sh <plugin_root> <crew_root> [agent_slug...]
# 실행 위치: repo 고정. 캐시 사본(~/.claude/plugins/cache/...) 실행 금지 —
#           scripts/는 repo-fixed 운영 도구이며 런타임 미로드(design-infra §2-3).
set -u
P="${1:?plugin root}"; C="${2:?crew root}"; shift 2
AGENTS=("$@")
[ ${#AGENTS[@]} -eq 0 ] && AGENTS=($(ls "$P/agents"/*.md | xargs -n1 basename | sed 's/\.md$//'))
L(){ [ -f "$1" ] && wc -l < "$1" | tr -d ' ' || echo 0; }
printf "%-28s %6s %6s %6s %6s %6s %6s %6s %6s\n" agent def rules bp layout stack crew mem TOTAL
for a in "${AGENTS[@]}"; do
  d="$P/agents/$a.md"; def=$(L "$d")
  r=0; grep -q "agent-rules/" "$d" && r=$(L "$P/references/agent-rules/$a-rules.md")
  bp=0; grep -q "Best Practice 참조" "$d" && bp=$(L "$P/references/best-practices/$a.md")
  [ "$bp" = 0 ] && [ -f "$P/references/agent-rules/$a-rules.md" ] \
    && grep -q "Best Practice 참조" "$P/references/agent-rules/$a-rules.md" \
    && bp=$(L "$P/references/best-practices/$a.md")
  ly=0; grep -q "design-artifact-layout" "$d" && ly=$(L "$P/references/design-artifact-layout.md")
  st=0; grep -q "stack-profile" "$d" && st=$(L "$P/references/stack-profile.md")
  cw=0
  grep -q "\.crew/config.md" "$d" && cw=$((cw+$(L "$C/config.md")))
  grep -q "gotchas.md" "$d"       && cw=$((cw+$(L "$C/gotchas.md")))
  mm=$(L "$P/references/agent-memory.md"); mm=$((mm+$(L "$C/memory/$a/MEMORY.md")))
  t=$((def+r+bp+ly+st+cw+mm))
  printf "%-28s %6s %6s %6s %6s %6s %6s %6s %6s\n" "$a" "$def" "$r" "$bp" "$ly" "$st" "$cw" "$mm" "$t"
done
