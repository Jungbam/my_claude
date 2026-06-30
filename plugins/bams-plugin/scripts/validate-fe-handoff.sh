#!/usr/bin/env bash
# validate-fe-handoff.sh — fe-handoff.md 11 필드 정합 검증
# Usage: bash validate-fe-handoff.sh <path>

set -euo pipefail

HANDOFF="${1:?path required}"
if [ ! -f "$HANDOFF" ]; then
  echo "[ERROR] fe-handoff.md not found: $HANDOFF" >&2
  exit 1
fi

REQUIRED_FIELDS=(
  "pipeline_slug" "scenario" "target_path" "component_tree_path"
  "convention_map_path" "binding_map_path" "rendering_strategy_path"
  "tokens_css_path" "fetch_snippets_path" "depth_limit"
)
OPTIONAL_FIELDS=("route_tree_path" "patch_diff_path")

exit_code=0
missing=0
for f in "${REQUIRED_FIELDS[@]}"; do
  if ! grep -qE "^${f}:" "$HANDOFF"; then
    echo "[FAIL] missing required field: $f" >&2
    exit_code=1
    missing=$((missing + 1))
  fi
done

pass=$((${#REQUIRED_FIELDS[@]} - missing))
echo "[INFO] required fields: ${pass}/${#REQUIRED_FIELDS[@]} PASS"

for f in "${OPTIONAL_FIELDS[@]}"; do
  if grep -qE "^${f}:" "$HANDOFF"; then
    echo "[INFO] optional field present: $f"
  fi
done

exit $exit_code
