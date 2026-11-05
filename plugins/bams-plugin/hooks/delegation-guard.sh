#!/usr/bin/env bash
# delegation-guard.sh — PreToolUse(Edit|Write|NotebookEdit): 메인 대화의 소스 직접 수정에 개입 (CLAUDE.md §1).
# 메인/서브 판별: 공통 입력 필드 agent_id — 서브에이전트·in-process teammate 안에서만 존재
#   (https://code.claude.com/docs/en/hooks#common-input-fields). agent_type은 --agent 세션의 메인에도 있어 판별에 쓰지 않는다.
# 수준: BAMS_DELEGATION_GUARD=off|warn|strict (기본 warn). warn=additionalContext 안내, strict=deny.
# opt-in: BAMS_GUARD_EXTRA_PATHS(콜론 구분 glob)에 맞는 경로는 *.md라도 소스로 취급, 추천 hr-agent.
# 감사 로그 없음. 모든 자기 오류는 fail-open(exit 0).
set +e

INPUT=$(cat 2>/dev/null)
[ -n "${BAMS_HOOK_TRACE:-}${BAMS_HOOK_CAPTURE_DIR:-}" ] && . "$(dirname "$0")/lib/trace.sh" 2>/dev/null && bams_hook_trace delegation-guard "$INPUT"

# BAMS_GUARD_EXTRA_PATHS=콜론 구분 glob(예 */agents/*.md:*/commands/*.md) 중 하나에 맞으면 0. set -f로 cwd 글롭 확장 방지.
extra_path() {
  local p="$1" pat IFS=:
  [ -n "${BAMS_GUARD_EXTRA_PATHS:-}" ] || return 1
  set -f
  for pat in $BAMS_GUARD_EXTRA_PATHS; do
    [ -n "$pat" ] || continue
    # shellcheck disable=SC2254  # 의도적 glob 매칭
    case "$p" in $pat) set +f; return 0 ;; esac
  done
  set +f
  return 1
}

main() {
  local level="${BAMS_DELEGATION_GUARD:-warn}"
  case "$level" in off) return 0 ;; warn|strict) ;; *) level=warn ;; esac
  command -v jq >/dev/null 2>&1 || return 0

  local input="$INPUT" agent_id file_path scratch
  [ -z "$input" ] && return 0
  agent_id=$(printf '%s' "$input" | jq -r '.agent_id // ""' 2>/dev/null) || return 0
  [ -n "$agent_id" ] && return 0   # 서브에이전트 내 수정 → 통과
  file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.notebook_path // ""' 2>/dev/null) || return 0
  scratch=$(printf '%s' "$input" | jq -r '.scratchpad_dir // ""' 2>/dev/null)
  [ -z "$file_path" ] && return 0

  local route msg
  if extra_path "$file_path"; then
    route="hr-agent"   # opt-in 추가 경로(에이전트·커맨드 정의 등)는 .md라도 소스로 취급
  else
    . "$(dirname "$0")/lib/source-path.sh" 2>/dev/null || return 0
    bams_is_source_path "$file_path" "$scratch" || return 0
    route=$(bams_route_for_path "$file_path")
  fi
  msg="[bams delegation-guard] 메인 대화가 소스 파일을 직접 수정하려 한다: ${file_path}. CLAUDE.md §1: 코드 수정은 부서장에게 위임하라(Agent tool, subagent_type 지정) — 추천: ${route}. 라우팅: *.tsx·src/app/**·*.css→frontend-engineering | src/app/api/**·*.server.ts·prisma/**→backend-engineering | Dockerfile·.github/**·*.sql·*.sh→platform-devops."

  if [ "$level" = "strict" ]; then
    jq -cn --arg r "$msg" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  else
    jq -cn --arg c "$msg" '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$c}}'
  fi
  return 0
}

main
exit 0
