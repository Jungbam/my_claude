#!/usr/bin/env bash
# check-cache-resolver.sh — 캐시 경로 탐색 회귀 가드 (validate-harness [8]).
#   FAIL A: 커맨드·스킬·에이전트·references·templates·hooks 에 캐시 루트 전체 find 재등장
#           (예: find ~/.claude/plugins/cache -path ".../skills/x/SKILL.md" | head -1)
#           → 고아 버전 폴더(2.5.0 등)를 먼저 집어 구 사본을 로드한다(v2.9.0 이전 실제 결함).
#   FAIL B: `_BAMS=$(sed` 로 시작하는 리졸버 스니펫이 정본과 한 글자라도 다름(drift).
#   FAIL C: 정본 문서(references/plugin-cache-sync.md)에 정본 스니펫 부재.
# 정본: references/plugin-cache-sync.md §런타임 경로 해석.
# usage: check-cache-resolver.sh [FILE...]   # 인자 없으면 플러그인 전체 스캔
# Exit: 0=OK, 1=FAIL. 실행 위치: repo 고정. bash 3.2 / BSD grep 호환.
set -u

P="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSOT="$P/references/plugin-cache-sync.md"
CANON='_BAMS=$(sed -n '"'"'/"bams-plugin@my-claude"/,/"installPath"/s/.*"installPath": *"\([^"]*\)".*/\1/p'"'"' ~/.claude/plugins/installed_plugins.json 2>/dev/null); [ -d "$_BAMS" ] || _BAMS=$(ls -dt ~/.claude/plugins/cache/*/bams-plugin/*/ 2>/dev/null | head -1); _BAMS=${_BAMS%/}'
FIND_RE='find[[:space:]]+("?\$\{?HOME\}?"?|~)/\.claude/plugins/cache'

FILES=("$@")
if [ "${#FILES[@]}" -eq 0 ]; then
  while IFS= read -r f; do FILES+=("$f"); done < <(
    { for d in commands skills references agents templates hooks; do
        [ -d "$P/$d" ] && find "$P/$d" -type f \( -name '*.md' -o -name '*.tmpl' -o -name '*.sh' \)
      done
      for f in "$P/SKILL.md" "$P/SKILL.md.tmpl"; do [ -f "$f" ] && echo "$f"; done
    } | sort)
fi

fails=0; files=0; uses=0
for f in "${FILES[@]}"; do
  [ -f "$f" ] || continue
  files=$((files + 1)); rel="${f#$P/}"
  while IFS=: read -r ln _; do
    echo "  FAIL  $rel:$ln: 캐시 루트 find 금지 — references/plugin-cache-sync.md §런타임 경로 해석 스니펫 사용"
    fails=$((fails + 1))
  done < <(grep -nE "$FIND_RE" "$f" 2>/dev/null)
  while IFS= read -r line; do
    ln=${line%%:*}; body=${line#*:}
    uses=$((uses + 1))
    case "$body" in
      *"$CANON"*) ;;
      *) echo "  FAIL  $rel:$ln: 리졸버 스니펫이 정본과 다름(drift)"; fails=$((fails + 1)) ;;
    esac
  done < <(grep -nF '_BAMS=$(sed' "$f" 2>/dev/null)
done

if [ "$#" -eq 0 ]; then
  grep -qF "$CANON" "$SSOT" 2>/dev/null || { echo "  FAIL  references/plugin-cache-sync.md: 정본 스니펫 부재"; fails=$((fails + 1)); }
fi

echo "check-cache-resolver: files=$files resolver_uses=$uses FAIL=$fails"
[ "$fails" -eq 0 ]
