#!/usr/bin/env bash
# trace.sh — hook 실발화 증거용 opt-in 추적 (source 전용, 기본 off). 절차: tests/hooks/SMOKE.md
#   BAMS_HOOK_TRACE=1|<절대경로>  → ${TMPDIR:-/tmp}/bams-hook-trace.log(또는 그 경로)에
#                                  "epoch<TAB>hook<TAB>hook_event_name<TAB>agent_type<TAB>tool_name" 1줄
#   BAMS_HOOK_CAPTURE_DIR=<dir>  → 원본 stdin JSON을 <dir>/<hook>-<epoch>-<pid>.json 으로 저장
# 모든 오류 무시(fail-open). bash 3.2 호환.
bams_hook_trace() {
  local hook="$1" input="$2" now log f=""
  now=$(date +%s 2>/dev/null)
  if [ -n "${BAMS_HOOK_TRACE:-}" ]; then
    case "$BAMS_HOOK_TRACE" in /*) log="$BAMS_HOOK_TRACE" ;; *) log="${TMPDIR:-/tmp}/bams-hook-trace.log" ;; esac
    command -v jq >/dev/null 2>&1 && f=$(printf '%s' "$input" \
      | jq -r '[.hook_event_name // "-", .agent_type // "-", .tool_name // "-"] | @tsv' 2>/dev/null)
    [ -n "$f" ] || f=$(printf -- '-\t-\t-')
    printf '%s\t%s\t%s\n' "$now" "$hook" "$f" >> "$log" 2>/dev/null
  fi
  if [ -n "${BAMS_HOOK_CAPTURE_DIR:-}" ] && [ -n "$input" ]; then
    mkdir -p "$BAMS_HOOK_CAPTURE_DIR" 2>/dev/null \
      && printf '%s\n' "$input" > "$BAMS_HOOK_CAPTURE_DIR/$hook-$now-$$.json" 2>/dev/null
  fi
  return 0
}
