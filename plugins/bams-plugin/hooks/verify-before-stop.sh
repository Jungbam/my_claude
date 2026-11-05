#!/usr/bin/env bash
# verify-before-stop.sh — SubagentStop: 코드 수정 에이전트가 마지막 코드 편집 이후 검증 명령을
#   한 번도 실행하지 않고 종료하면 decision:block으로 1회 되돌린다.
# 입력(https://code.claude.com/docs/en/hooks#subagentstop-input): stop_hook_active, agent_type
#   (플러그인 에이전트는 "bams-plugin:<name>"), agent_transcript_path, last_assistant_message.
# 통과: stop_hook_active=true / 대상 외 agent_type / 보고에 "검증 불가" 사유 / 코드 편집 없음.
# transcript JSONL 형식은 비공개 내부 형식 — 파싱 실패·파일 부재 등 모든 오류는 fail-open(exit 0).
set +e

# plugin.json SubagentStop matcher(^bams-plugin:(...)$)와 동일 목록을 유지한다.
TARGET_AGENTS=" frontend-engineering backend-engineering platform-devops data-integration automation-qa "

# 검증 명령으로 인정하는 Bash 패턴 (대소문자 무시, bash 3.2 [[ =~ ]] ERE).
# 검증 도구가 "명령 위치"에 있어야 인정한다 — 줄 시작 또는 ; & | ( ` 뒤, 또는 @tsv가 줄바꿈을
# 바꾼 리터럴 \n 뒤(앞 공백·VAR=val 접두 허용). `ls tests/`, `cd build`, `cat test.log`,
# `grep -r lint .` 처럼 인자에만 등장하는 단어는 검증으로 보지 않는다.
_CP='(^|[;&|(`]|\\n)[[:space:]]*([[:alpha:]_][[:alnum:]_]*=[^[:space:]]*[[:space:]]+)*'
_END='([[:space:]]|$|[;&|)`])'
_V_PM='(npm|pnpm|yarn|bun)[[:space:]]+(run[[:space:]]+)?(test|build|lint|typecheck|type-check|check)([^[:alnum:]_]|$)'
_V_NPX='(npx|bunx|pnpm[[:space:]]+(exec|dlx)|yarn[[:space:]]+(exec|dlx))[[:space:]]+(-[^[:space:]]+[[:space:]]+)*(tsc|vitest|jest|eslint|playwright|biome)'"$_END"
_V_BARE='((uv|poetry)[[:space:]]+run[[:space:]]+)?(\./node_modules/\.bin/)?(tsc|vitest|jest|pytest|mypy|ruff|eslint|shellcheck)'"$_END"
_V_GO='go[[:space:]]+(test|vet|build)'"$_END"
_V_CARGO='cargo[[:space:]]+(test|build|check|clippy)'"$_END"
_V_MAKE='make[[:space:]]+([^;&|[:space:]]+[[:space:]]+)*(test|check|lint|build)'"$_END"
_V_SHSCRIPT='(bash|sh|zsh)[[:space:]]+([^;&|]*[[:space:]])?[^[:space:];&|]*(validate|test)[^[:space:];&|]*\.sh'"$_END"
_V_DIRECT='\.{0,2}/[^[:space:];&|]*(validate|test)[^[:space:];&|]*\.sh'"$_END"
_V_SYNTAX='((bash|sh|zsh)[[:space:]]+-n|node[[:space:]]+--check)'"$_END"
_V_PY='python3?[[:space:]]+-m[[:space:]]+(pytest|py_compile|mypy)'"$_END"
VERIFY_RE="${_CP}(${_V_PM}|${_V_NPX}|${_V_BARE}|${_V_GO}|${_V_CARGO}|${_V_MAKE}|${_V_SHSCRIPT}|${_V_DIRECT}|${_V_SYNTAX}|${_V_PY})"
ESCAPE_RE='검증 ?불가|검증할 수 없|검증하지 못|unable to verify|could not verify|cannot verify'

INPUT=$(cat 2>/dev/null)
[ -n "${BAMS_HOOK_TRACE:-}${BAMS_HOOK_CAPTURE_DIR:-}" ] && . "$(dirname "$0")/lib/trace.sh" 2>/dev/null && bams_hook_trace verify-before-stop "$INPUT"

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
  [[ $last =~ $ESCAPE_RE ]] && return 0

  transcript=$(printf '%s' "$input" | jq -r '.agent_transcript_path // ""' 2>/dev/null)
  # shellcheck disable=SC2088 # 문서 예시처럼 리터럴 "~/" 경로가 올 수 있어 직접 확장한다
  case "$transcript" in "~/"*) transcript="$HOME/${transcript#\~/}" ;; esac
  [ -n "$transcript" ] && [ -r "$transcript" ] || return 0

  . "$(dirname "$0")/lib/source-path.sh" 2>/dev/null || return 0

  # tool_use를 순서대로 "name<TAB>arg" 로 평탄화. 깨진 줄은 fromjson? 로 건너뛴다.
  local uses
  uses=$(jq -rR 'fromjson? | select(.type=="assistant") | .message.content[]?
      | select(type=="object" and .type=="tool_use")
      | [.name, ((.input.file_path // .input.notebook_path // .input.command // .input.message // "") | tostring)] | @tsv' \
      "$transcript" 2>/dev/null) || return 0
  [ -z "$uses" ] && return 0

  local i=0 last_edit=0 last_verify=0 edited="" name arg
  while IFS=$'\t' read -r name arg; do
    i=$((i + 1))
    case "$name" in
      Edit|Write|MultiEdit|NotebookEdit)
        if bams_is_source_path "$arg"; then last_edit=$i; edited="$arg"; fi ;;
      Bash)
        [[ $arg =~ $VERIFY_RE ]] && last_verify=$i ;;
      SubagentHandback)
        [[ $arg =~ $ESCAPE_RE ]] && return 0 ;;
    esac
  done <<EOF
$uses
EOF

  [ "$last_edit" -gt 0 ] || return 0
  [ "$last_verify" -gt "$last_edit" ] && return 0

  jq -cn --arg r "[bams verify-before-stop] 마지막 코드 편집(${edited}) 이후 검증 명령이 실행되지 않았다. 변경을 검증하는 명령(test/tsc/lint/build 등)을 실행하거나, 실행할 수 없으면 그 이유를 보고에 '검증 불가: <사유>'로 명시하라." \
    '{decision:"block",reason:$r}'
  return 0
}

main
exit 0
