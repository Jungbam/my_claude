#!/usr/bin/env bash
umask 077  # Ensure new files (logs, tmp) are created with 0600 permission
# bams-viz-emit.sh — Pipeline/step event emit helper
# Called from pipeline commands (feature, dev, hotfix, etc.)
#
# Usage:
#   bash bams-viz-emit.sh now_ms         (slug 불필요 — 크로스플랫폼 밀리초 epoch, stdout에 정수 출력)
#   bash bams-viz-emit.sh pipeline_start <slug> <type> [command] [arguments]
#   bash bams-viz-emit.sh pipeline_end   <slug> <status> [total] [completed] [failed] [skipped] [duration_ms]
#   bash bams-viz-emit.sh step_start     <slug> <step_number> <step_name> <phase>
#   bash bams-viz-emit.sh step_end       <slug> <step_number> <status> [duration_ms]
#   bash bams-viz-emit.sh agent_start    <slug> <call_id> <agent_type> [model] [description] [prompt_summary]
#   bash bams-viz-emit.sh agent_end      <slug> <call_id> <agent_type> <status> [duration_ms] [result_summary]
#   bash bams-viz-emit.sh work_unit_start <slug> [name]
#   bash bams-viz-emit.sh work_unit_end   <slug> [status]
#   bash bams-viz-emit.sh error          <slug> <message> [step_number] [error_code]
set -uo pipefail

# Unicode/multibyte slug 안전 처리 (한글 slug 지원)
LANG="${LANG:-en_US.UTF-8}"
LC_ALL="${LC_ALL:-en_US.UTF-8}"
export LANG LC_ALL

EVENT_TYPE="${1:-}"

# now_ms: 크로스플랫폼 밀리초 epoch 헬퍼 — slug 불필요, 아래 가드보다 먼저 처리
# (macOS BSD date는 `date +%s%3N`을 지원하지 않아 오염된 문자열을 반환함 — 실측 확인됨)
if [ "$EVENT_TYPE" = "now_ms" ]; then
  if command -v perl >/dev/null 2>&1; then
    perl -MTime::HiRes -e 'printf("%d\n", Time::HiRes::time()*1000)'
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c 'import time; print(int(time.time()*1000))'
  else
    _MS_TEST=$(date +%s%3N 2>/dev/null)
    if printf '%s' "$_MS_TEST" | grep -qE '^[0-9]+$'; then
      printf '%s\n' "$_MS_TEST"          # GNU date — 이미 밀리초
    else
      echo "$(( $(date +%s) * 1000 ))"    # BSD date 최종 폴백 — 초 정밀도만
    fi
  fi
  exit 0
fi

SLUG="${2:-}"

if [ -z "$EVENT_TYPE" ] || [ -z "$SLUG" ]; then
  exit 0
fi

# DQ-3 방지: '-'로 시작하는 리터럴은 slug 위치에서 거절 (옵션 플래그가 실수로 slug로 유입되는 인자 파싱 결함 차단)
case "$SLUG" in
  -*)
    echo "ERROR: slug 위치 인자가 '-'로 시작함 ('$SLUG') — 옵션 리터럴이 slug로 잘못 유입됨. emit 중단." >&2
    exit 1
    ;;
esac

# DQ-2 방지: agent_start/agent_end의 agent_type 인자가 boolean 리터럴이면 실패
if [ "$EVENT_TYPE" = "agent_start" ] || [ "$EVENT_TYPE" = "agent_end" ]; then
  _AT_CHECK="${4:-}"
  case "$_AT_CHECK" in
    true|false|True|False|TRUE|FALSE)
      echo "ERROR: agent_type 인자가 boolean 값('$_AT_CHECK')임 — 인자 순서 오류 의심. emit 중단." >&2
      exit 1
      ;;
  esac
fi

# Global bams root: all projects share ~/.bams/ for cross-project visibility
# Override: BAMS_ROOT env var (same name used in event-store.ts, app.ts, global-root.ts)
BAMS_ROOT="${BAMS_ROOT:-$HOME/.bams}"
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Active work units JSON array file (supports parallel work units)
# Format: [{"slug":"...","name":"...","startedAt":"..."},...]
ACTIVE_WU_FILE="/tmp/bams-active-workunits.json"

# wu_list_read: read the active work units JSON array; returns [] if absent or invalid
wu_list_read() {
  if [ -f "$ACTIVE_WU_FILE" ]; then
    jq -e '.' "$ACTIVE_WU_FILE" 2>/dev/null || echo "[]"
  else
    echo "[]"
  fi
}

# wu_list_write: atomically write the JSON array to the active work units file
wu_list_write() {
  local data="$1"
  printf '%s\n' "$data" > "${ACTIVE_WU_FILE}.tmp" && mv "${ACTIVE_WU_FILE}.tmp" "$ACTIVE_WU_FILE"
}

# wu_latest_slug: return the slug of the most recently started active work unit, or ""
wu_latest_slug() {
  local list
  list=$(wu_list_read)
  printf '%s' "$list" | jq -r 'if length > 0 then last.slug else "" end' 2>/dev/null || echo ""
}

# Migrate legacy single-file tracker to JSON array (one-time, backward-compat)
if [ -f /tmp/bams-active-workunit ] && [ ! -f "$ACTIVE_WU_FILE" ]; then
  _LEGACY_SLUG=$(cat /tmp/bams-active-workunit 2>/dev/null | tr -d '[:space:]')
  if [ -n "$_LEGACY_SLUG" ]; then
    wu_list_write "[{\"slug\":\"${_LEGACY_SLUG}\",\"name\":\"${_LEGACY_SLUG}\",\"startedAt\":\"${TS}\"}]"
  fi
  # Keep legacy file in place so other tools that haven't updated yet still work;
  # it will naturally become stale and can be removed once all callers migrate.
fi

# Department mapping from agent_type
dept_map() {
  case "$1" in
    product-strategy|business-analysis|ux-research|project-governance) echo "planning" ;;
    frontend-engineering) echo "engineering-frontend" ;;
    backend-engineering) echo "engineering-backend" ;;
    platform-devops|data-integration) echo "engineering-platform" ;;
    design-director|ui-designer|ux-designer|graphic-designer|motion-designer|\
    design-system-agent|guide-decomposer|guide-recomposer|ui-diff-applier|\
    data-binding-mapper|visual-fidelity-verifier|nextjs-convention-mapper|\
    accessibility-auditor|routing-strategist|ssr-csr-decider) echo "design" ;;
    product-analytics|experimentation|performance-evaluation|business-kpi) echo "evaluation" ;;
    qa-strategy|automation-qa|defect-triage|release-quality-gate) echo "qa" ;;
    pipeline-orchestrator|cross-department-coordinator|executive-reporter|resource-optimizer|hr-agent) echo "management" ;;
    *) echo "general" ;;
  esac
}

# SYNC-SPECIALISTS:START
_DESIGN_SPECIALISTS=("accessibility-auditor" "data-binding-mapper" "guide-decomposer" "guide-recomposer" "nextjs-convention-mapper" "routing-strategist" "ssr-csr-decider" "ui-diff-applier" "visual-fidelity-verifier")
# SYNC-SPECIALISTS:END

# ── DB 이벤트 전송 ──
# 서버 미가동 시에도 || true로 emit.sh 실패 방지
BAMS_SERVER_URL="${BAMS_SERVER_URL:-http://localhost:3099}"

# Fallback JSONL 파일 경로 (한글 slug 포함 멀티바이트 안전 처리)
# printf %s를 사용해 echo -n 의 BSD/GNU 차이를 회피
_events_file() {
  local slug="$1"
  local dir="${BAMS_ROOT}/artifacts/pipeline"
  mkdir -p "$dir" 2>/dev/null || true
  printf '%s/%s-events.jsonl' "$dir" "$slug"
}

_post_event() {
  local payload="$1"
  # 1) 서버 POST 시도 (BAMS_SERVER_URL이 설정된 경우, 실패 무시)
  if [ -n "${BAMS_SERVER_URL:-}" ]; then
    curl -s --max-time 2 -X POST "${BAMS_SERVER_URL}/api/events" \
      -H "Content-Type: application/json" \
      -d "$payload" > /dev/null 2>&1 || true
  fi
  # 2) 항상 file write (이중 기록) — 서버 성공 여부와 무관하게 jsonl 파일 보존
  # 사유: viz dashboard와 retro/회고가 jsonl 파일에 의존하므로,
  # 서버 down 시 데이터 손실 방지 + 한글 slug 등 모든 케이스 일관 처리
  local _file
  _file="$(_events_file "$SLUG")"
  printf '%s\n' "$payload" >> "$_file" 2>/dev/null || true
}

case "$EVENT_TYPE" in
  pipeline_start)
    _PARENT="${6:-}"
    _WU_ARG="${7:-}"
    # Prefer explicitly passed WU slug ($7); fall back to most recently started active work unit
    if [ -n "$_WU_ARG" ]; then
      ACTIVE_WU="$_WU_ARG"
    else
      ACTIVE_WU=$(wu_latest_slug)
    fi
    _PS_EVT=$(jq -cn --arg slug "$SLUG" --arg ptype "${3:-unknown}" --arg cmd "${4:-}" --arg args "${5:-}" --arg parent "$_PARENT" --arg wu "$ACTIVE_WU" --arg ts "$TS" \
      '{type:"pipeline_start",pipeline_slug:$slug,pipeline_type:$ptype,command:$cmd,arguments:$args,ts:$ts}
       + (if $parent != "" then {parent_pipeline_slug:$parent} else {} end)
       + (if $wu != "" then {work_unit_slug:$wu} else {} end)')
    _post_event "$_PS_EVT"
    # Record pipeline link in work unit file
    if [ -n "$ACTIVE_WU" ]; then
      _WU_EVT=$(jq -cn --arg wu "$ACTIVE_WU" --arg slug "$SLUG" --arg ptype "${3:-unknown}" --arg ts "$TS" \
        '{type:"pipeline_linked",work_unit_slug:$wu,pipeline_slug:$slug,pipeline_type:$ptype,ts:$ts}')
      _post_event "$_WU_EVT"
    fi
    ;;
  pipeline_end)
    # Auto-calculate step counts from event file if not explicitly provided
    _P_STATUS="${3:-completed}"
    _P_TOTAL="${4:-0}"
    _P_COMPLETED="${5:-0}"
    _P_FAILED="${6:-0}"
    _P_SKIPPED="${7:-0}"
    # duration_ms (8번째 인자) — now_ms 실측값이면 숫자, 미전달/placeholder면 0으로 안전 폴백
    _P_DUR="${8:-}"
    _P_DUR_MEASURED="false"
    if printf '%s' "$_P_DUR" | grep -qE '^[0-9]+$'; then
      _P_DUR_MEASURED="true"
    else
      _P_DUR="0"
    fi
    _PE_EVT=$(jq -cn --arg slug "$SLUG" --arg status "$_P_STATUS" --argjson total "$_P_TOTAL" --argjson completed "$_P_COMPLETED" --argjson failed "$_P_FAILED" --argjson skipped "$_P_SKIPPED" --argjson dur "$_P_DUR" --argjson measured "$_P_DUR_MEASURED" --arg ts "$TS" \
      '{type:"pipeline_end",pipeline_slug:$slug,status:$status,total_steps:$total,completed_steps:$completed,failed_steps:$failed,skipped_steps:$skipped,duration_ms:$dur,duration_ms_measured:$measured,ts:$ts}')
    _post_event "$_PE_EVT"
    ;;
  step_start)
    _SS_EVT=$(jq -cn --arg slug "$SLUG" --argjson num "${3:-0}" --arg name "${4:-}" --arg phase "${5:-}" --arg ts "$TS" \
      '{type:"step_start",pipeline_slug:$slug,step_number:$num,step_name:$name,phase:$phase,ts:$ts}')
    _post_event "$_SS_EVT"
    ;;
  step_end)
    _SE_EVT=$(jq -cn --arg slug "$SLUG" --argjson num "${3:-0}" --arg status "${4:-done}" --argjson dur "${5:-0}" --arg ts "$TS" \
      '{type:"step_end",pipeline_slug:$slug,step_number:$num,status:$status,duration_ms:$dur,ts:$ts}')
    _post_event "$_SE_EVT"
    ;;
  agent_start)
    CALL_ID="${3:-}"
    AGENT_TYPE="${4:-general-purpose}"
    DEPT=$(dept_map "$AGENT_TYPE")
    TRACE_ID="${SLUG}-$(date -u +%Y%m%dT%H%M%SZ)"
    STEP_NUM="null"
    EVENT=$(jq -cn \
      --arg type "agent_start" \
      --arg call_id "$CALL_ID" \
      --arg trace_id "$TRACE_ID" \
      --arg agent_type "$AGENT_TYPE" \
      --arg department "$DEPT" \
      --arg model "${5:-}" \
      --arg description "${6:-}" \
      --arg prompt_summary "$(printf '%s' "${7:-}" | cut -c1-300)" \
      --arg input "$(printf '%s' "${7:-}" | cut -c1-1000)" \
      --argjson step_number "$STEP_NUM" \
      --arg ts "$TS" \
      --arg pipeline_slug "$SLUG" \
      '{type:$type, call_id:$call_id, trace_id:$trace_id, agent_type:$agent_type, department:$department, model:$model, description:$description, prompt_summary:$prompt_summary, input:$input, ts:$ts}
       + (if $step_number != null then {step_number:$step_number} else {} end)
       + (if $pipeline_slug != "" then {pipeline_slug:$pipeline_slug} else {} end)')
    _post_event "$EVENT"
    ;;
  agent_end)
    CALL_ID="${3:-}"
    AGENT_TYPE="${4:-general-purpose}"
    A_STATUS="${5:-success}"
    IS_ERR="false"
    [ "$A_STATUS" = "error" ] && IS_ERR="true"
    # DQ-1 방지: 동일 call_id에 대한 중복 agent_end emit 감지 시 warn (fe agent_end 중복 emit 재발 방지)
    if [ -n "$CALL_ID" ]; then
      _DUP_FILE="$(_events_file "$SLUG")"
      if [ -f "$_DUP_FILE" ] && grep -q "\"type\":\"agent_end\".*\"call_id\":\"${CALL_ID}\"" "$_DUP_FILE" 2>/dev/null; then
        echo "WARN: call_id '${CALL_ID}'에 대한 agent_end가 이미 emit됨 — 중복 emit 감지 (DQ-1 패턴)" >&2
      fi
    fi
    EVENT=$(jq -cn \
      --arg type "agent_end" \
      --arg call_id "$CALL_ID" \
      --arg agent_type "$AGENT_TYPE" \
      --argjson is_error "$IS_ERR" \
      --arg status "$A_STATUS" \
      --argjson duration_ms "${6:-null}" \
      --arg result_summary "$(printf '%s' "${7:-}" | cut -c1-300)" \
      --arg output "$(printf '%s' "${7:-}" | cut -c1-1000)" \
      --argjson token_usage "null" \
      --arg ts "$TS" \
      --arg pipeline_slug "$SLUG" \
      '{type:$type, call_id:$call_id, agent_type:$agent_type, is_error:$is_error, status:$status, duration_ms:$duration_ms, result_summary:$result_summary, output:$output, token_usage:$token_usage, ts:$ts}
       + (if $pipeline_slug != "" then {pipeline_slug:$pipeline_slug} else {} end)')
    _post_event "$EVENT"
    ;;
  recover)
    # Scan DB for unmatched start events and emit interrupted end events.
    # Usage: bash bams-viz-emit.sh recover <slug>
    # NOTE: Recovery now queries DB via API. Emit interrupted events to DB only.
    RECOVER_TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    # Emit a recover marker event to DB so the server can handle cleanup
    _R_RECOVER=$(jq -cn \
      --arg slug "$SLUG" \
      --arg ts "$RECOVER_TS" \
      '{type:"recover",pipeline_slug:$slug,ts:$ts}')
    _post_event "$_R_RECOVER"
    ;;
  work_unit_start)
    WU_NAME="${3:-$SLUG}"
    _WUS_EVT=$(jq -cn --arg slug "$SLUG" --arg name "$WU_NAME" --arg ts "$TS" \
      '{type:"work_unit_start",work_unit_slug:$slug,work_unit_name:$name,ts:$ts}')
    _post_event "$_WUS_EVT"
    # Append to active work units JSON array (parallel support)
    _CURRENT_LIST=$(wu_list_read)
    # Remove any existing entry with the same slug (idempotent re-start)
    _UPDATED=$(printf '%s' "$_CURRENT_LIST" | jq --arg s "$SLUG" '[.[] | select(.slug != $s)]')
    # Append new entry
    _UPDATED=$(printf '%s' "$_UPDATED" | jq --arg s "$SLUG" --arg n "$WU_NAME" --arg t "$TS" \
      '. + [{"slug":$s,"name":$n,"startedAt":$t}]')
    wu_list_write "$_UPDATED"
    # Also update legacy single-file tracker for backward compatibility
    echo "$SLUG" > /tmp/bams-active-workunit
    ;;
  work_unit_end)
    _WUE_EVT=$(jq -cn --arg slug "$SLUG" --arg status "${3:-completed}" --arg ts "$TS" \
      '{type:"work_unit_end",work_unit_slug:$slug,status:$status,ts:$ts}')
    _post_event "$_WUE_EVT"
    # Remove only this slug from the active work units JSON array
    _CURRENT_LIST=$(wu_list_read)
    _UPDATED=$(printf '%s' "$_CURRENT_LIST" | jq --arg s "$SLUG" '[.[] | select(.slug != $s)]')
    wu_list_write "$_UPDATED"
    # Update legacy single-file tracker: if the removed slug was the active one,
    # set it to the most recently started remaining work unit (or remove entirely)
    if [ -f /tmp/bams-active-workunit ]; then
      _LEGACY=$(cat /tmp/bams-active-workunit 2>/dev/null | tr -d '[:space:]')
      if [ "$_LEGACY" = "$SLUG" ]; then
        _NEXT=$(printf '%s' "$_UPDATED" | jq -r 'if length > 0 then last.slug else "" end' 2>/dev/null || echo "")
        if [ -n "$_NEXT" ]; then
          echo "$_NEXT" > /tmp/bams-active-workunit
        else
          rm -f /tmp/bams-active-workunit
        fi
      fi
    fi
    ;;
  error)
    _ERR_EVT=$(jq -cn --arg slug "$SLUG" --arg msg "${3:-}" --argjson num "${4:-0}" --arg code "${5:-unknown}" --arg ts "$TS" \
      '{type:"error",pipeline_slug:$slug,message:$msg,step_number:$num,error_code:$code,ts:$ts}')
    _post_event "$_ERR_EVT"
    ;;
esac

exit 0
