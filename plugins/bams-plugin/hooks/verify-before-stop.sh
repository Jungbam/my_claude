#!/usr/bin/env bash
# verify-before-stop.sh — SubagentStop: 코드 수정 에이전트가 마지막 코드 편집 이후 검증 명령을
#   한 번도 실행하지 않고 종료하면 decision:block으로 1회 되돌린다.
# 입력(https://code.claude.com/docs/en/hooks#subagentstop-input): stop_hook_active, agent_type
#   (플러그인 에이전트는 "bams-plugin:<name>"), agent_transcript_path, last_assistant_message.
# 통과: stop_hook_active=true / 대상 외 agent_type / 보고에 "검증 불가" 사유 / 코드 편집 없음.
# transcript JSONL 형식은 비공개 내부 형식 — 파싱 실패·파일 부재 등 모든 오류는 fail-open(exit 0).
set +e

TARGET_AGENTS=" frontend-engineering backend-engineering platform-devops data-integration automation-qa "
# 검증 명령으로 인정하는 Bash 패턴 (대소문자 무시)
VERIFY_RE='(^|[^[:alnum:]_])(tests?|tsc|typecheck|type-check|build|lint|vitest|jest|pytest|cargo|mypy|ruff|eslint|biome|shellcheck|playwright|validate[[:alnum:]_-]*)([^[:alnum:]_]|$)|go (test|vet|build)|(bash|sh|zsh) -n |node --check|py_compile|make( |$)'
ESCAPE_RE='검증 ?불가|검증할 수 없|검증하지 못|unable to verify|could not verify|cannot verify'

main() {
  command -v jq >/dev/null 2>&1 || return 0
  local input active agent last transcript
  input=$(cat 2>/dev/null)
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
