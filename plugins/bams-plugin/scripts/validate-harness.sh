#!/usr/bin/env bash
# validate-harness.sh — 하네스 정적 검증 (agents frontmatter / plugin.json hooks·agents / 크기 예산).
# 사용법: bash plugins/bams-plugin/scripts/validate-harness.sh [--quiet]
#   --quiet: FAIL/WARN 줄과 요약만 출력. Exit: 0=FAIL 없음(WARN 허용), 1=FAIL 있음.
# FAIL: model/effort 허용값 이외(gpt 명 등), name≠파일명, description 부재·1024자 초과,
#       plugin.json hook 스크립트 부재·비실행·상대경로, plugin.json agents ↔ agents/*.md 불일치,
#       SubagentStart/Stop matcher가 플러그인 에이전트를 '^<plugin>:(...)$' 없이 지목하거나 없는 이름 나열.
# WARN: 에이전트 본문 10,000자 초과(plugin-dev 가이드), SKILL.md 500줄 초과(skill-creator 가이드),
#       references/*.md 300줄 초과인데 목차 없음.
# macOS 기본 bash 3.2 / BSD awk 호환. timeout·GNU 전용 옵션 사용 금지.
set -u

PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PJ="$PLUGIN_DIR/.claude-plugin/plugin.json"
QUIET=0; [ "${1:-}" = "--quiet" ] && QUIET=1
FAILS=0; WARNS=0
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
fail() { FAILS=$((FAILS + 1)); echo "  FAIL  $*"; }
warn() { WARNS=$((WARNS + 1)); echo "  WARN  $*"; }
info() { [ "$QUIET" -eq 1 ] || echo "$*"; }
# 파이프(서브셸)에서 모은 결과 파일을 출력하고 FAIL/WARN 카운트에 합산
flush() {
  [ -s "$1" ] || { rm -f "$1"; return 0; }
  cat "$1"
  FAILS=$((FAILS + $(grep -c '^  FAIL' "$1"))); WARNS=$((WARNS + $(grep -c '^  WARN' "$1")))
  rm -f "$1"
}

MODEL_RE='^(claude-(opus|sonnet|haiku|fable)-[A-Za-z0-9.-]+|inherit|opus|sonnet|haiku)$'
EFFORT_RE='^(low|medium|high|xhigh|max)$'
AGENT_BODY_MAX=10000; DESC_MAX=1024; SKILL_LINES_MAX=500; REF_LINES_TOC=300

# 문자 수(UTF-8). UTF-8 로캘이 없으면 바이트 수로 대체(과대 측정 쪽으로 보수적).
UTF8_LC=""
for lc in C.UTF-8 en_US.UTF-8 C.utf8 en_US.utf8; do
  n=$(printf '가' | LC_ALL=$lc wc -m 2>/dev/null | tr -d ' ')
  [ "$n" = "1" ] && { UTF8_LC=$lc; break; }
done
chars() { if [ -n "$UTF8_LC" ]; then LC_ALL=$UTF8_LC wc -m | tr -d ' '; else wc -c | tr -d ' '; fi; }

# frontmatter 본문(--- 사이). 첫 줄이 ---가 아니면 빈 출력.
frontmatter() { awk 'NR==1{ if ($0 !~ /^---[[:space:]]*$/) exit; f=1; next } /^---[[:space:]]*$/{exit} f' "$1"; }
# frontmatter 이후 본문. frontmatter가 없으면 파일 전체.
body() { awk 'NR==1 && /^---[[:space:]]*$/{f=1; next} f==1 && /^---[[:space:]]*$/{f=2; next} f!=1' "$1"; }
# fm_value <key> : 단일 줄 값 또는 블록 스칼라(|, >)의 들여쓴 후속 줄을 공백으로 연결. 따옴표 제거.
fm_value() {
  awk -v k="$1" '
    found && /^[[:space:]]+/ { sub(/^[[:space:]]+/, ""); v = v (v=="" ? "" : " ") $0; next }
    found { exit }
    $0 ~ "^" k ":" { found=1; v=$0; sub("^" k ":[[:space:]]*", "", v);
                     if (v ~ /^[|>][-+]?[[:space:]]*$/) v=""; else { print v; done=1; exit } }
    END { if (found && !done && v != "") print v }' | sed -e 's/[[:space:]]*$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"
}

info ""
info "=== BAMS Harness Validation ==="

# ── 1. agents/*.md frontmatter + 본문 크기 ─────────────────────────
info "[1] agents frontmatter / body size"
for f in "$PLUGIN_DIR"/agents/*.md; do
  [ -f "$f" ] || continue
  base=$(basename "$f" .md)
  fm=$(frontmatter "$f")
  if [ -z "$fm" ]; then fail "agents/$base.md: frontmatter 없음"; continue; fi
  name=$(printf '%s\n' "$fm" | fm_value name)
  model=$(printf '%s\n' "$fm" | fm_value model)
  effort=$(printf '%s\n' "$fm" | fm_value effort)
  desc=$(printf '%s\n' "$fm" | fm_value description)
  [ "$name" = "$base" ] || fail "agents/$base.md: name '$name' ≠ 파일명 '$base'"
  if [ -n "$model" ] && ! printf '%s' "$model" | grep -Eq "$MODEL_RE"; then
    fail "agents/$base.md: model '$model' 허용값 아님 (claude-(opus|sonnet|haiku|fable)-* | inherit|opus|sonnet|haiku)"
  fi
  if [ -n "$effort" ] && ! printf '%s' "$effort" | grep -Eq "$EFFORT_RE"; then
    fail "agents/$base.md: effort '$effort' 허용값 아님 (low|medium|high|xhigh|max)"
  fi
  if [ -z "$desc" ]; then
    fail "agents/$base.md: description 없음"
  else
    dn=$(printf '%s' "$desc" | chars)
    [ "$dn" -le "$DESC_MAX" ] || fail "agents/$base.md: description ${dn}자 > ${DESC_MAX}"
  fi
  bn=$(body "$f" | chars)
  [ "$bn" -le "$AGENT_BODY_MAX" ] || warn "agents/$base.md: 본문 ${bn}자 > ${AGENT_BODY_MAX}"
done

# ── 2. plugin.json: agents 목록 ↔ agents/*.md, hook 스크립트 ────────
info "[2] plugin.json agents / hooks"
if ! command -v jq >/dev/null 2>&1; then
  fail "jq 미설치 — plugin.json 검증 불가"
elif ! jq -e . "$PJ" >/dev/null 2>&1; then
  fail ".claude-plugin/plugin.json 파싱 실패"
else
  if [ "$(jq -r '.agents | type' "$PJ")" = "array" ]; then
    jq -r '.agents[]' "$PJ" | sed -e 's|^\./agents/||' -e 's|\.md$||' | sort > "$T/declared"
    for f in "$PLUGIN_DIR"/agents/*.md; do [ -f "$f" ] && basename "$f" .md; done | sort > "$T/actual"
    comm -23 "$T/declared" "$T/actual" | while read -r a; do echo "  FAIL  plugin.json agents: '$a' 선언됐으나 agents/$a.md 없음"; done > "$T/d1"
    comm -13 "$T/declared" "$T/actual" | while read -r a; do echo "  FAIL  plugin.json agents: agents/$a.md 가 목록에 없음"; done >> "$T/d1"
    flush "$T/d1"
  fi
  # hooks: plugin.json 인라인 객체 또는 경로 문자열(hooks.json) 둘 다 지원
  htype=$(jq -r '.hooks | type' "$PJ")
  hsrc=""
  if [ "$htype" = "object" ]; then hsrc="$PJ"; hq='.hooks'
  elif [ "$htype" = "string" ]; then hsrc="$PLUGIN_DIR/$(jq -r '.hooks' "$PJ")"; hq='.hooks // .'
  fi
  if [ -f "$PLUGIN_DIR/hooks/hooks.json" ] && [ "$htype" != "string" ]; then
    warn "hooks/hooks.json 존재 — plugin.json hooks와 이중 정의 여부 확인"
  fi
  if [ -n "$hsrc" ]; then
    if [ ! -f "$hsrc" ]; then fail "hooks 설정 파일 부재: ${hsrc#$PLUGIN_DIR/}"
    else
      jq -r "$hq | .. | objects | select(.type? == \"command\") | .command" "$hsrc" 2>/dev/null | while IFS= read -r cmd; do
        case "$cmd" in
          *'${CLAUDE_PLUGIN_ROOT}'*)
            rel=$(printf '%s' "$cmd" | sed -n 's|.*\${CLAUDE_PLUGIN_ROOT}/\([^" ]*\).*|\1|p')
            p="$PLUGIN_DIR/$rel"
            if [ ! -f "$p" ]; then echo "  FAIL  hook 스크립트 부재: $rel"
            elif [ ! -x "$p" ]; then echo "  FAIL  hook 스크립트 실행권한 없음: $rel"
            fi ;;
          *./hooks/*|*' hooks/'*)
            echo "  FAIL  hook 상대경로(cwd 기준이라 설치 환경에서 미실행): $cmd — \${CLAUDE_PLUGIN_ROOT} 사용" ;;
        esac
      done > "$T/hooks"
      flush "$T/hooks"

      # SubagentStart/SubagentStop matcher ↔ plugin-scoped agent_type ("<plugin>:<agent>").
      # 공식 문서: 글자·숫자·_·-·공백·,·| 만으로 된 matcher는 exact string 목록 비교 → 플러그인
      # 에이전트에는 절대 매칭되지 않는다. 앵커 정규식 ^<plugin>:(a|b)$ 형태여야 한다.
      info "[2b] SubagentStart/SubagentStop matcher"
      pname=$(jq -r '.name // ""' "$PJ")
      for f in "$PLUGIN_DIR"/agents/*.md; do [ -f "$f" ] && basename "$f" .md; done > "$T/agent_names"
      jq -r "$hq | to_entries[]? | select(.key == \"SubagentStart\" or .key == \"SubagentStop\")
             | .key as \$e | .value[]? | [\$e, (.matcher // \"\")] | @tsv" "$hsrc" 2>/dev/null \
      | while IFS=$'\t' read -r ev m; do
          case "$m" in ''|'*') continue ;; esac
          if printf '%s' "$m" | grep -q "^\\^$pname:"; then
            # ^<plugin>:(a|b|c)$ → 나열된 이름이 agents/*.md 에 존재하는지
            case "$m" in *'$') ;; *) echo "  FAIL  $ev matcher '$m': 끝 앵커 \$ 없음 — 더 긴 이름에도 매칭됨" ;; esac
            names=$(printf '%s' "$m" | sed -e "s|^\\^$pname:||" -e 's|\$$||' -e 's|^(\(.*\))$|\1|')
            if printf '%s' "$names" | grep -q '[^A-Za-z0-9_|-]'; then
              echo "  WARN  $ev matcher '$m': 단순 이름 목록이 아니라 에이전트 존재 검사 생략"
            else
              printf '%s\n' "$names" | tr '|' '\n' | while IFS= read -r n; do
                [ -z "$n" ] && continue
                grep -qx -- "$n" "$T/agent_names" || echo "  FAIL  $ev matcher: '$n' 에 해당하는 agents/$n.md 없음"
              done
            fi
          else
            # 접두사 없음: 플러그인 에이전트 이름을 담고 있으면 절대 매칭 불가
            hit=$(printf '%s' "$m" | tr -c 'A-Za-z0-9_-' '\n' | grep -vx '' | grep -xF -f "$T/agent_names" | head -1)
            if [ -n "$hit" ]; then
              if printf '%s' "$m" | grep -q '^[A-Za-z0-9_ ,|-]*$'; then
                why="exact-match 문자 집합만 사용 — agent_type '$pname:$hit' 에 절대 매칭 안 됨"
              else
                why="'^$pname:' 앵커 접두사 없음 — 비앵커 부분 매칭(다른 플러그인·이름 오매칭) 또는 매칭 실패"
              fi
              echo "  FAIL  $ev matcher '$m': $why. '^$pname:(...)\$' 형태 사용"
            fi
          fi
        done > "$T/matcher"
      flush "$T/matcher"
    fi
  fi
fi

# ── 3. skills/**/SKILL.md 줄 수 ───────────────────────────────────
info "[3] SKILL.md size"
find "$PLUGIN_DIR/skills" -name SKILL.md -type f 2>/dev/null | sort | while IFS= read -r s; do
  n=$(wc -l < "$s" | tr -d ' ')
  [ "$n" -le "$SKILL_LINES_MAX" ] || echo "  WARN  ${s#$PLUGIN_DIR/}: ${n}줄 > ${SKILL_LINES_MAX}"
done > "$T/size"
flush "$T/size"

# ── 4. references/**/*.md 300줄 초과 + 목차 없음 ──────────────────
info "[4] references TOC"
find "$PLUGIN_DIR/references" -name '*.md' -type f 2>/dev/null | sort | while IFS= read -r r; do
  n=$(wc -l < "$r" | tr -d ' ')
  [ "$n" -gt "$REF_LINES_TOC" ] || continue
  grep -Eiq '^#{1,6}[[:space:]]*(목차|table of contents|contents|toc)([[:space:]]|$)|<!--[[:space:]]*toc' "$r" \
    || echo "  WARN  ${r#$PLUGIN_DIR/}: ${n}줄 > ${REF_LINES_TOC}, 목차 없음"
done > "$T/toc"
flush "$T/toc"

echo ""
echo "=== validate-harness: FAIL=$FAILS WARN=$WARNS ==="
[ "$FAILS" -eq 0 ]
