#!/usr/bin/env bash
# verify-before-stop.sh — SubagentStop: 코드 수정 에이전트가 마지막 코드 편집 이후 검증 명령을
#   한 번도 실행하지 않았거나, 편집 이후 "마지막" 검증 명령이 실패(exit≠0)한 채 종료하면 decision:block으로 1회 되돌린다.
#   종료 상태: tool_use.id ↔ tool_result.tool_use_id 짝의 is_error==true 또는 내용 "Exit code N"(N≠0) = 실패.
#   짝/필드를 못 찾으면(형식 변경·백그라운드 실행) 성공으로 간주(fail-open).
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

  # 순서대로 평탄화(\x1f 구분 — 빈 필드 보존): tool_use → "U name id arg", tool_result → "R - id 0|1"(1=실패).
  # 필드마다 @tsv 이스케이프(줄바꿈→리터럴 \n)라 한 항목 = 한 줄. 깨진 줄은 fromjson? 로 건너뛴다.
  local uses
  uses=$(jq -rR 'fromjson? | select(.type=="assistant" or .type=="user") | .type as $t | .message.content[]?
      | select(type=="object")
      | if $t == "assistant" and .type == "tool_use" then
          ["U", .name, (.id // ""), ((.input.file_path // .input.notebook_path // .input.command // .input.message // "") | tostring)]
        elif $t == "user" and .type == "tool_result" then
          ["R", "-", (.tool_use_id // ""),
           (if .is_error == true then "1"
            elif ((.content | if type == "array" then (map(.text? // "") | join("\n")) else tostring end) | test("^Exit code [1-9]")) then "1"
            else "0" end)]
        else empty end
      | map(tostring | [.] | @tsv) | join("\u001f")' \
      "$transcript" 2>/dev/null) || return 0
  [ -z "$uses" ] && return 0

  local i=0 last_edit=0 last_verify=0 edited="" kind name id arg vid="" vcmd="" vfail=0
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
      Bash)
        if [[ $arg =~ $VERIFY_RE ]]; then last_verify=$i; vid="$id"; vcmd="$arg"; vfail=0; fi ;;
      SubagentHandback)
        [[ $arg =~ $ESCAPE_RE ]] && return 0 ;;
    esac
  done <<EOF
$uses
EOF

  [ "$last_edit" -gt 0 ] || return 0
  if [ "$last_verify" -gt "$last_edit" ]; then
    [ "$vfail" = "1" ] || return 0
    jq -cn --arg r "[bams verify-before-stop] 마지막 코드 편집(${edited}) 이후 마지막 검증 명령이 실패(exit≠0)했다: ${vcmd:0:160}. 실패를 고친 뒤 재검증해 통과시키거나, 이번 변경과 무관한 기존 실패 등으로 통과시킬 수 없으면 보고에 '검증 불가: <사유>'로 명시하라." \
      '{decision:"block",reason:$r}'
    return 0
  fi

  jq -cn --arg r "[bams verify-before-stop] 마지막 코드 편집(${edited}) 이후 검증 명령이 실행되지 않았다. 변경을 검증하는 명령(test/tsc/lint/build 등)을 실행하거나, 실행할 수 없으면 그 이유를 보고에 '검증 불가: <사유>'로 명시하라." \
    '{decision:"block",reason:$r}'
  return 0
}

main
exit 0
