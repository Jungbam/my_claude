#!/bin/bash
# Strategic Compact Suggester
# Runs on PreToolUse or periodically to suggest manual compaction at logical intervals
#
# Why manual over auto-compact:
# - Auto-compact happens at arbitrary points, often mid-task
# - Strategic compacting preserves context through logical phases
# - Compact after exploration, before execution
# - Compact after completing a milestone, before starting next
#
# Hook config (in ~/.claude/settings.json):
# {
#   "hooks": {
#     "PreToolUse": [{
#       "matcher": "Edit|Write",
#       "hooks": [{
#         "type": "command",
#         "command": "~/.claude/skills/strategic-compact/suggest-compact.sh"
#       }]
#     }]
#   }
# }
#
# Criteria for suggesting compact:
# - Session has been running for extended period
# - Large number of tool calls made
# - Transitioning from research/exploration to implementation
# - Plan has been finalized

# Track tool call count (increment in a temp file)
# Use CLAUDE_SESSION_ID for session-specific counter (not $$ which changes per invocation)
SESSION_ID="${CLAUDE_SESSION_ID:-${PPID:-default}}"
COUNTER_FILE="/tmp/claude-tool-count-${SESSION_ID}"
THRESHOLD=${COMPACT_THRESHOLD:-50}

# Initialize or increment counter
if [ -f "$COUNTER_FILE" ]; then
  count=$(cat "$COUNTER_FILE")
  count=$((count + 1))
  echo "$count" > "$COUNTER_FILE"
else
  echo "1" > "$COUNTER_FILE"
  count=1
fi

# Suggest compact after threshold tool calls
if [ "$count" -eq "$THRESHOLD" ]; then
  echo "[StrategicCompact] $THRESHOLD tool calls reached - consider /compact if transitioning phases" >&2
fi

# Suggest at regular intervals after threshold
if [ "$count" -gt "$THRESHOLD" ] && [ $((count % 25)) -eq 0 ]; then
  echo "[StrategicCompact] $count tool calls - good checkpoint for /compact if context is stale" >&2
fi

# Heavy edit-session detection (safety-net for completion-protocol Step 4.9)
# Suggest /compact after a large number of Edit/Write tool calls in one session
HEAVY_EDIT_THRESHOLD=${COMPACT_EDIT_THRESHOLD:-30}
if [ "$count" -gt 0 ] && [ $((count % HEAVY_EDIT_THRESHOLD)) -eq 0 ]; then
  echo "[StrategicCompact] $count Edit/Write-level tool calls — context is likely saturated. Consider /compact before the next milestone." >&2
fi
