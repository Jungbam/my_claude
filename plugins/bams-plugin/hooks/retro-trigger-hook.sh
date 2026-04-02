#!/usr/bin/env bash
# retro-trigger-hook.sh — PostToolUse hook: pipeline_end 감지 후 retro-pending 마커 생성
# Agent 도구 완료 후 pipeline-orchestrator가 "회고를 시작하라" 메시지를 포함했는지 감지하고,
# .crew/artifacts/retro/{slug}-retro-pending.json 마커를 생성한다.
# 다음 파이프라인의 Pre-flight에서 이 마커를 확인하여 미완료 회고를 알린다.
#
# Performance target: < 50ms. Fail-open: always exit 0.
set -uo pipefail

# Read stdin
INPUT=$(cat 2>/dev/null || true)
[ -z "$INPUT" ] && exit 0

# Fast-path: Agent 도구가 아니면 즉시 종료
printf '%s' "$INPUT" | grep -q '"Agent"' || exit 0
TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // .tool // ""' 2>/dev/null)
if [ "$TOOL_NAME" != "Agent" ]; then
  exit 0
fi

# Resolve project root
BAMS_ROOT="${BAMS_CREW_DIR:-}"
if [ -z "$BAMS_ROOT" ]; then
  BAMS_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || true
fi
if [ -z "$BAMS_ROOT" ]; then
  BAMS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fi

# Active pipeline 감지
PIPELINE_DIR="${BAMS_ROOT}/.crew/artifacts/pipeline"
PIPELINE_SLUG=""
PIPELINE_EVENTS=""
PIPELINE_TYPE=""
PIPELINE_START_TS=""

if [ -d "$PIPELINE_DIR" ]; then
  LOCK_FILE=$(ls -t "$PIPELINE_DIR"/*.lock 2>/dev/null | head -1)
  if [ -n "${LOCK_FILE:-}" ]; then
    PIPELINE_SLUG=$(basename "$LOCK_FILE" .lock)
    PIPELINE_EVENTS="$PIPELINE_DIR/${PIPELINE_SLUG}-events.jsonl"
  fi
fi

# Pipeline이 없으면 종료
[ -z "$PIPELINE_SLUG" ] && exit 0

# pipeline_end 이벤트가 존재하는지 확인
PIPELINE_END_EXISTS="false"
if [ -f "$PIPELINE_EVENTS" ]; then
  grep -q '"pipeline_end"' "$PIPELINE_EVENTS" 2>/dev/null && PIPELINE_END_EXISTS="true"
fi
[ "$PIPELINE_END_EXISTS" = "false" ] && exit 0

# pipeline_end 이벤트에서 메타데이터 추출
PIPELINE_STATUS=$(grep '"pipeline_end"' "$PIPELINE_EVENTS" 2>/dev/null | tail -1 | jq -r '.status // "completed"' 2>/dev/null || echo "completed")

# pipeline_start에서 타입과 시작 시각 추출
if [ -f "$PIPELINE_EVENTS" ]; then
  PIPELINE_TYPE=$(grep '"pipeline_start"' "$PIPELINE_EVENTS" 2>/dev/null | tail -1 | jq -r '.pipeline_type // "unknown"' 2>/dev/null || echo "unknown")
  PIPELINE_START_TS=$(grep '"pipeline_start"' "$PIPELINE_EVENTS" 2>/dev/null | tail -1 | jq -r '.ts // ""' 2>/dev/null || echo "")
fi

PIPELINE_END_TS=$(grep '"pipeline_end"' "$PIPELINE_EVENTS" 2>/dev/null | tail -1 | jq -r '.ts // ""' 2>/dev/null || echo "")

# retro 마커가 이미 존재하면 중복 생성 방지
RETRO_DIR="${BAMS_ROOT}/.crew/artifacts/retro"
MARKER_FILE="${RETRO_DIR}/${PIPELINE_SLUG}-retro-pending.json"
DONE_FILE="${RETRO_DIR}/${PIPELINE_SLUG}-retro-done.json"

[ -f "$MARKER_FILE" ] && exit 0
[ -f "$DONE_FILE" ] && exit 0

mkdir -p "$RETRO_DIR" 2>/dev/null || true

NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# 마커 파일 생성
MARKER_JSON=$(jq -cn \
  --arg slug "$PIPELINE_SLUG" \
  --arg pipeline_type "$PIPELINE_TYPE" \
  --arg status "$PIPELINE_STATUS" \
  --arg pipeline_start_ts "$PIPELINE_START_TS" \
  --arg pipeline_end_ts "$PIPELINE_END_TS" \
  --arg marker_created_at "$NOW" \
  '{
    schema_version: "1.0",
    slug: $slug,
    pipeline_type: $pipeline_type,
    status: $status,
    pipeline_start_ts: $pipeline_start_ts,
    pipeline_end_ts: $pipeline_end_ts,
    marker_created_at: $marker_created_at,
    retro_status: "pending",
    note: "회고가 아직 수행되지 않았습니다. 다음 파이프라인 Pre-flight에서 이 마커를 확인하세요."
  }') 2>/dev/null

if [ -n "${MARKER_JSON:-}" ]; then
  printf '%s\n' "$MARKER_JSON" > "$MARKER_FILE" 2>/dev/null || true
fi

exit 0
