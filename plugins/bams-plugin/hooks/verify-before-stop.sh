#!/usr/bin/env bash
# verify-before-stop.sh — SubagentStop: 코드 수정 에이전트가 마지막 코드 편집 이후 검증 명령을
#   한 번도 실행하지 않았거나, 편집 이후 "마지막" 검증 명령이 실패(exit≠0)한 채 종료하면 decision:block으로 1회 되돌린다.
#   종료 상태: tool_use.id ↔ tool_result.tool_use_id 짝의 is_error==true 또는 내용 "Exit code N"(N≠0) = 실패.
#   짝/필드를 못 찾으면(형식 변경·백그라운드 실행) 성공으로 간주(fail-open).
#   종료 코드가 가려진 검증(`|| true`, `; true`, pipefail 없이 `| tail` 등으로 파이프)은 "exit 불명"으로 block.
#   검증 명령은 편집한 파일 종류의 범주와 맞아야 인정한다(.tsx 편집 후 `bash -n /dev/null` 은 검증 아님).
#   프로젝트 검증 스킬(.claude/skills/verify-*)의 drive 스크립트 실행, 그 스킬을 로드(Skill/Read)한 뒤의 curl/browse 는
#   범주와 무관하게 검증으로 인정한다(references/verification-skill-protocol.md).
# 입력(https://code.claude.com/docs/en/hooks#subagentstop-input): stop_hook_active, agent_type
#   (플러그인 에이전트는 "bams-plugin:<name>"), agent_transcript_path, last_assistant_message.
# 통과: stop_hook_active=true / 대상 외 agent_type / 보고 줄 머리에 "검증 불가: <사유>" / 코드 편집 없음.
# transcript JSONL 형식은 비공개 내부 형식 — 파싱 실패·파일 부재 등 모든 오류는 fail-open(exit 0).
set +e

# plugin.json SubagentStop matcher(^bams-plugin:(...)$)와 동일 목록을 유지한다.
TARGET_AGENTS=" frontend-engineering backend-engineering platform-devops data-integration automation-qa "

# 검증 명령으로 인정하는 Bash 패턴 (대소문자 무시, bash 3.2 [[ =~ ]] ERE).
# 검증 도구가 "명령 위치"에 있어야 인정한다 — 줄 시작 또는 ; & | ( ` 뒤, 또는 @tsv가 줄바꿈을
# 바꾼 리터럴 \n 뒤(앞 공백·VAR=val 접두 허용). `ls tests/`, `cd build`, `cat test.log`,
# `grep -r lint .` 처럼 인자에만 등장하는 단어는 검증으로 보지 않는다.
# 범주(편집한 파일 종류와 맞아야 검증으로 인정): ts(.ts/.tsx/.js/…/css) · py · go · rs · sh · any(범주 무관).
#   편집 파일이 위 범주 밖(.java·.sql·Dockerfile 등)이면 어떤 검증 명령이든 인정한다.
#   `bash -n /dev/null`처럼 대상 파일 없는 구문 검사는 인정하지 않는다(/dev/null 은 판정 전에 지운다).
_CP='(^|[;&|(`]|\\n)[[:space:]]*([[:alpha:]_][[:alnum:]_]*=[^[:space:]]*[[:space:]]+)*'
_END='([[:space:]]|$|[;&|)`])'
_V_PM='(npm|pnpm|yarn|bun)[[:space:]]+(run[[:space:]]+)?(test|build|lint|typecheck|type-check|check)([^[:alnum:]_]|$)'
_V_NPX='(npx|bunx|pnpm[[:space:]]+(exec|dlx)|yarn[[:space:]]+(exec|dlx))[[:space:]]+(-[^[:space:]]+[[:space:]]+)*(tsc|vitest|jest|eslint|playwright|biome)'"$_END"
_V_TSBARE='(\./node_modules/\.bin/)?(tsc|vitest|jest|eslint|biome)'"$_END"
_V_NODECHK='(node[[:space:]]+--check|deno[[:space:]]+(test|check|lint))[[:space:]]+[^[:space:];&|]'
_V_PYBARE='((uv|poetry)[[:space:]]+run[[:space:]]+)?(pytest|mypy|ruff|tox|nox)'"$_END"
_V_PY='python3?[[:space:]]+-m[[:space:]]+(pytest|py_compile|mypy|ruff)'"$_END"
_V_GO='go[[:space:]]+(test|vet|build)'"$_END"
_V_CARGO='cargo[[:space:]]+(test|build|check|clippy)'"$_END"
_V_SHCHK='(shellcheck|bats)'"$_END"
_V_SYNTAX='(bash|sh|zsh)[[:space:]]+-n[[:space:]]+[^[:space:];&|]'
_V_MAKE='make[[:space:]]+([^;&|[:space:]]+[[:space:]]+)*(test|check|lint|build)'"$_END"
_V_SHSCRIPT='(bash|sh|zsh)[[:space:]]+([^;&|]*[[:space:]])?[^[:space:];&|]*(validate|test)[^[:space:];&|]*\.sh'"$_END"
_V_DIRECT='\.{0,2}/[^[:space:];&|]*(validate|test)[^[:space:];&|]*\.sh'"$_END"
_V_SKILL='((bash|sh|zsh|node|bun|python3?)[[:space:]]+)?[^[:space:];&|]*\.claude/skills/verify-[^[:space:];&|]*'   # 프로젝트 검증 스킬 drive
_V_DRIVE='(curl|browse|"?\$B"?|"?\$\{B\}"?)'"$_END"                                                         # 검증 스킬 로드 이후 drive
RE_TS="${_CP}(${_V_PM}|${_V_NPX}|${_V_TSBARE}|${_V_NODECHK})"
RE_PY="${_CP}(${_V_PYBARE}|${_V_PY})"
RE_GO="${_CP}${_V_GO}"
RE_RS="${_CP}${_V_CARGO}"
RE_SH="${_CP}(${_V_SHCHK}|${_V_SYNTAX})"
RE_ANY="${_CP}(${_V_MAKE}|${_V_SHSCRIPT}|${_V_DIRECT}|${_V_SKILL})"
RE_DRIVE="${_CP}${_V_DRIVE}"
VERIFY_RE="${_CP}(${_V_PM}|${_V_NPX}|${_V_TSBARE}|${_V_NODECHK}|${_V_PYBARE}|${_V_PY}|${_V_GO}|${_V_CARGO}|${_V_SHCHK}|${_V_SYNTAX}|${_V_MAKE}|${_V_SHSCRIPT}|${_V_DIRECT}|${_V_SKILL})"
MASK_RE="${_CP}(${VERIFY_RE#"$_CP"}|${_V_DRIVE})"   # exit 불명 판정용(검증 스킬 drive 포함)
# "검증 불가" 탈출구: 줄 머리의 규정 형식만 인정(`검증 불가: <사유>` / `검증 불가 사유: <사유>`, 목록 기호·굵게 허용).
#   "검증할 수 없는 항목은 없음" 같은 부정문·문장 중간 언급은 인정하지 않는다. @tsv 의 리터럴 \n 도 줄 경계로 본다.
ESCAPE_RE='(^|'$'\n''|\\n)[[:space:]]*([-*>][[:space:]]*)?(\*\*)?검증 ?불가( ?사유)?(\*\*)?[[:space:]]*:'

INPUT=$(cat 2>/dev/null)
[ -n "${BAMS_HOOK_TRACE:-}${BAMS_HOOK_CAPTURE_DIR:-}" ] && . "$(dirname "$0")/lib/trace.sh" 2>/dev/null && bams_hook_trace verify-before-stop "$INPUT"

# exit_masked <cmd> → 0 이면 마지막 검증 명령 뒤에서 종료 코드가 덮인다(exit 불명).
#   마지막 검증 일치 위치 이후의 꼬리만 본다: `|| <exit N·false 아님>`, `; true`·`; :`·`; exit 0`,
#   pipefail·PIPESTATUS 없이 단일 `|` 파이프(뒤 명령의 종료 코드가 남는다).
exit_masked() {
  local rest="$1" rem="" m after p
  while [[ $rest =~ $MASK_RE ]]; do
    m="${BASH_REMATCH[0]}"; [ -n "$m" ] || break
    rest="${rest#*"$m"}"
    case "${m: -1}" in ';'|'&'|'|'|')') rest="${m: -1}$rest" ;; esac   # 끝 경계 문자가 구분자면 꼬리에 되돌린다
    rem="$rest"
  done
  rem="${rem//\\n/;}"
  case "$rem" in
    *"||"*)
      after="${rem#*||}"
      [[ $after =~ ^[[:space:]]*(\{[[:space:]]*)?([^}]*[\;\&][[:space:]]*)?(exit[[:space:]]+([1-9]|\"?\$\?)|false|return[[:space:]]+[1-9]) ]] || return 0 ;;
  esac
  [[ $rem =~ \;[[:space:]]*(true|:|exit[[:space:]]+0)([[:space:]]|\;|$) ]] && return 0
  case "$1" in
    *pipefail*|*PIPESTATUS*) ;;
    *) p="${rem//||/}"; case "$p" in *"|"*) return 0 ;; esac ;;
  esac
  return 1
}

main() {
  command -v jq >/dev/null 2>&1 || return 0
  local input="$INPUT" active agent last transcript
  [ -z "$input" ] && return 0
  active=$(printf '%s' "$input" | jq -r '.stop_hook_active // false' 2>/dev/null) || return 0
  [ "$active" = "true" ] && return 0

  agent=$(printf '%s' "$input" | jq -r '.agent_type // ""' 2>/dev/null) || return 0
  agent="${agent##*:}"
  [ -z "$agent" ] && return 0
  case "$TARGET_AGENTS" in *" $agent "*) ;; *) return 0 ;; esac

  shopt -s nocasematch
  last=$(printf '%s' "$input" | jq -r '.last_assistant_message // ""' 2>/dev/null)
  [[ $last =~ $ESCAPE_RE ]] && return 0   # 줄 머리 "검증 불가: <사유>"만

  transcript=$(printf '%s' "$input" | jq -r '.agent_transcript_path // ""' 2>/dev/null)
  # shellcheck disable=SC2088 # 문서 예시처럼 리터럴 "~/" 경로가 올 수 있어 직접 확장한다
  case "$transcript" in "~/"*) transcript="$HOME/${transcript#\~/}" ;; esac
  [ -n "$transcript" ] && [ -r "$transcript" ] || return 0

  . "$(dirname "$0")/lib/source-path.sh" 2>/dev/null || return 0

  # 순서대로 평탄화(\x1f 구분 — 빈 필드 보존): tool_use → "U name id arg", tool_result → "R - id 0|1"(1=실패).
  # 필드마다 @tsv 이스케이프(줄바꿈→리터럴 \n)라 한 항목 = 한 줄. 깨진 줄은 fromjson? 로 건너뛴다.
  local uses
  uses=$(jq -rR 'fromjson? | select(.type=="assistant" or .type=="user") | .type as $t | .message.content[]?
      | select(type=="object")
      | if $t == "assistant" and .type == "tool_use" then
          ["U", .name, (.id // ""), ((.input.file_path // .input.notebook_path // .input.command // .input.message // .input.skill // "") | tostring)]
        elif $t == "user" and .type == "tool_result" then
          ["R", "-", (.tool_use_id // ""),
           (if .is_error == true then "1"
            elif ((.content | if type == "array" then (map(.text? // "") | join("\n")) else tostring end) | test("^Exit code [1-9]")) then "1"
            else "0" end)]
        else empty end
      | map(tostring | [.] | @tsv) | join("\u001f")' \
      "$transcript" 2>/dev/null) || return 0
  [ -z "$uses" ] && return 0

  # 1차: 편집한 소스 파일의 범주 모음
  local kind name id arg cats=" " ext
  while IFS=$'\x1f' read -r kind name id arg; do
    [ "$kind" = U ] || continue
    case "$name" in Edit|Write|MultiEdit|NotebookEdit) ;; *) continue ;; esac
    bams_is_source_path "$arg" || continue
    ext="${arg##*/}"; case "$ext" in *.*) ext="${ext##*.}" ;; *) ext="" ;; esac
    case "$ext" in
      ts|tsx|js|jsx|mjs|cjs|mts|cts|vue|svelte|css|scss|sass|less) cats="$cats ts " ;;
      py) cats="$cats py " ;;
      go) cats="$cats go " ;;
      rs) cats="$cats rs " ;;
      sh|bash|zsh) cats="$cats sh " ;;
      *) cats="$cats other " ;;
    esac
  done <<EOF
$uses
EOF

  # 2차: 순서대로 — 편집 이후 "마지막" 인정 검증 명령의 결과만 본다
  local i=0 last_edit=0 last_verify=0 edited="" vid="" vcmd="" vfail=0 vskill=0 a ok
  while IFS=$'\x1f' read -r kind name id arg; do
    if [ "$kind" = "R" ]; then
      # 편집 이후 마지막 검증 명령의 결과만 본다(이전 검증의 실패는 이후 재검증 성공으로 덮인다)
      [ -n "$vid" ] && [ "$id" = "$vid" ] && vfail="$arg"
      continue
    fi
    i=$((i + 1))
    case "$name" in
      Edit|Write|MultiEdit|NotebookEdit)
        if bams_is_source_path "$arg"; then last_edit=$i; edited="$arg"; fi ;;
      Skill)
        case "$arg" in *verify-*) vskill=1 ;; esac ;;
      Read)
        case "$arg" in *.claude/skills/verify-*) vskill=1 ;; esac ;;
      Bash)
        a="${arg//\/dev\/null/}"; ok=0
        if [[ $a =~ $RE_ANY ]]; then ok=1
        elif [ "$vskill" = 1 ] && [[ $a =~ $RE_DRIVE ]]; then ok=1
        elif [[ $a =~ $VERIFY_RE ]]; then
          case "$cats" in *" other "*|" ") ok=1 ;; esac
          case "$cats" in *" ts "*) [[ $a =~ $RE_TS ]] && ok=1 ;; esac
          case "$cats" in *" py "*) [[ $a =~ $RE_PY ]] && ok=1 ;; esac
          case "$cats" in *" go "*) [[ $a =~ $RE_GO ]] && ok=1 ;; esac
          case "$cats" in *" rs "*) [[ $a =~ $RE_RS ]] && ok=1 ;; esac
          case "$cats" in *" sh "*) [[ $a =~ $RE_SH ]] && ok=1 ;; esac
        fi
        if [ "$ok" = 1 ]; then last_verify=$i; vid="$id"; vcmd="$arg"; vfail=0; fi
        case "$arg" in *.claude/skills/verify-*) vskill=1 ;; esac ;;
      SubagentHandback)
        [[ $arg =~ $ESCAPE_RE ]] && return 0 ;;
    esac
  done <<EOF
$uses
EOF

  [ "$last_edit" -gt 0 ] || return 0
  local kinds
  kinds=$(printf '%s' "${cats// other /}" | tr -s ' ' | sed 's/^ //; s/ $//')
  if [ "$last_verify" -gt "$last_edit" ]; then
    if [ "$vfail" = "1" ]; then
      jq -cn --arg r "[bams verify-before-stop] 마지막 코드 편집(${edited}) 이후 마지막 검증 명령이 실패(exit≠0)했다: ${vcmd:0:160}. 실패를 고친 뒤 재검증해 통과시키거나, 이번 변경과 무관한 기존 실패 등으로 통과시킬 수 없으면 보고 줄 머리에 '검증 불가: <사유>'로 명시하라." \
        '{decision:"block",reason:$r}'
      return 0
    fi
    exit_masked "$vcmd" || return 0
    jq -cn --arg r "[bams verify-before-stop] 마지막 코드 편집(${edited}) 이후 마지막 검증 명령의 종료 코드를 알 수 없다(exit 불명 — '|| true'·'; true'·pipefail 없는 '| tail/head/grep' 등이 실패를 가린다): ${vcmd:0:160}. 종료 코드가 드러나게 다시 실행하라(파이프 없이, 또는 'set -o pipefail;' 접두). 실행할 수 없으면 보고 줄 머리에 '검증 불가: <사유>'로 명시하라." \
      '{decision:"block",reason:$r}'
    return 0
  fi

  jq -cn --arg r "[bams verify-before-stop] 마지막 코드 편집(${edited}) 이후 검증 명령이 실행되지 않았다${kinds:+ (편집 파일 범주: ${kinds} — 그 범주의 검증만 인정: ts=test/tsc/lint/build·vitest·jest, py=pytest/ruff/mypy, go=go test/vet/build, sh=shellcheck/bats/bash -n <파일>, 공통=make test·*test*.sh·.claude/skills/verify-*)}. 변경을 검증하는 명령을 실행하거나, 실행할 수 없으면 그 이유를 보고 줄 머리에 '검증 불가: <사유>'로 명시하라." \
    '{decision:"block",reason:$r}'
  return 0
}

main
exit 0
