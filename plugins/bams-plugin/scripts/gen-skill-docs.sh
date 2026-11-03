#!/usr/bin/env bash
# gen-skill-docs.sh — SKILL.md.tmpl → SKILL.md 생성기.
#
# 대상: skills/**/*.md.tmpl(SKILL.md.tmpl, references/*.md.tmpl), 플러그인 루트 SKILL.md.tmpl → 같은 경로의 .md
#       (tmpl 없는 .md는 손대지 않음)
# 규칙: 줄 단독 플레이스홀더 `{{NAME}}`(앞 들여쓰기 허용)를 skills/_shared/NAME.md 내용으로 치환한다.
#       들여쓰기는 치환된 각 줄에 그대로 붙는다. AUTO-GENERATED 헤더 2줄을 frontmatter 직후(없으면 맨 앞)에 넣는다.
#       --check는 본문의 `${CLAUDE_SKILL_DIR}/<path>.md` 참조가 실제 파일인지도 검사한다.
#       줄 중간의 `{{NAME}}`, 없는/빈 _shared 파일은 오류(exit 2).
# 사용: bash scripts/gen-skill-docs.sh           # 생성(변경된 파일만 기록)
#       bash scripts/gen-skill-docs.sh --check   # 생성 결과와 현재 SKILL.md가 다르면 exit 1
# 의존: bash 3.2 + POSIX awk/cmp/mktemp (macOS 기본, GNU/mawk 호환)
set -eu

PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SHARED_DIR="$PLUGIN_DIR/skills/_shared"
MODE=write
case "${1:-}" in
  --check) MODE=check ;;
  "") ;;
  *) echo "usage: $0 [--check]" >&2; exit 2 ;;
esac

render() { # $1=tmpl path, $2=display name
  awk -v shared="$SHARED_DIR" -v src="$2" -v tname="${1##*/}" '
    BEGIN { fm = 0; bad = 0 }
    NR == 1 && $0 != "---" {
      fm = 2
      print "<!-- AUTO-GENERATED from " tname " — do not edit directly -->"
      print "<!-- Regenerate: bash scripts/gen-skill-docs.sh -->"
    }
    fm < 2 && $0 == "---" {
      fm++; print
      if (fm == 2) {
        print "<!-- AUTO-GENERATED from " tname " — do not edit directly -->"
        print "<!-- Regenerate: bash scripts/gen-skill-docs.sh -->"
      }
      next
    }
    fm < 2 { print; next }
    /^[ \t]*[{][{][A-Z_]+[}][}][ \t]*$/ {
      ind = $0; sub(/[^ \t].*$/, "", ind)
      name = $0; gsub(/[ \t{}]/, "", name)
      f = shared "/" name ".md"; n = 0
      while ((r = (getline l < f)) > 0) { n++; if (l == "") print ""; else print ind l }
      close(f)
      if (n == 0) { printf "gen-skill-docs: %s: placeholder {{%s}} has no source (%s)\n", src, name, f > "/dev/stderr"; bad = 1 }
      next
    }
    /[{][{][A-Z_]+[}][}]/ { printf "gen-skill-docs: %s:%d: inline placeholder not supported\n", src, NR > "/dev/stderr"; bad = 1 }
    { print }
    END { if (bad) exit 2 }
  ' "$1"
}

TMP=$(mktemp "${TMPDIR:-/tmp}/gen-skill-docs.XXXXXX")
trap 'rm -f "$TMP"' EXIT

check_refs() { # $1=generated file, $2=its skill dir, $3=display name — ${CLAUDE_SKILL_DIR}/x.md 참조 존재 확인
  grep -o '\${CLAUDE_SKILL_DIR}/[A-Za-z0-9_./-]*\.md' "$1" 2>/dev/null | sort -u | while IFS= read -r ref; do
    [ -f "$2/${ref#\$\{CLAUDE_SKILL_DIR\}/}" ] || echo "BROKEN $3 -> $ref"
  done
}

stale=0; changed=0; total=0; broken=0
TMPLS=$( { find "$PLUGIN_DIR/skills" -name '*.md.tmpl' -type f; [ -f "$PLUGIN_DIR/SKILL.md.tmpl" ] && echo "$PLUGIN_DIR/SKILL.md.tmpl"; } | sort)
for tmpl in $TMPLS; do
  out="${tmpl%.tmpl}"; rel="${out#$PLUGIN_DIR/}"
  total=$((total + 1))
  render "$tmpl" "$rel" > "$TMP"
  case "$rel" in
    skills/*/references/*) sdir="${out%/references/*}" ;;
    skills/*) sdir="${out%/*}" ;;
    *) sdir="" ;;
  esac
  if [ "$MODE" = check ] && [ -n "$sdir" ]; then
    b=$(check_refs "$TMP" "$sdir" "$rel")
    [ -n "$b" ] && { echo "$b"; broken=$((broken + $(printf '%s\n' "$b" | wc -l))); }
  fi
  if cmp -s "$TMP" "$out" 2>/dev/null; then continue; fi
  if [ "$MODE" = check ]; then
    echo "STALE  $rel (run: bash scripts/gen-skill-docs.sh)"; stale=$((stale + 1))
  else
    cp "$TMP" "$out"; echo "updated  $rel"; changed=$((changed + 1))
  fi
done

if [ "$MODE" = check ]; then
  [ "$stale" -eq 0 ] && [ "$broken" -eq 0 ] && echo "gen-skill-docs --check: OK ($total templates)" && exit 0
  echo "gen-skill-docs --check: $stale/$total stale, $broken broken reference(s)" >&2; exit 1
fi
echo "gen-skill-docs: $changed/$total updated"
