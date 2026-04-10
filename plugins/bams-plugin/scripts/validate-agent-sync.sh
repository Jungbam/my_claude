#!/usr/bin/env bash
# validate-agent-sync.sh — 에이전트 13 checks 동기화 검증
# 사용법: bash plugins/bams-plugin/scripts/validate-agent-sync.sh
# Exit code: 0=정합, 1=불일치

set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ERRORS=0
TMPDIR_VALIDATE=$(mktemp -d)
trap 'rm -rf "$TMPDIR_VALIDATE"' EXIT

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo "=== BAMS Agent Sync Validation ==="
echo ""

# ─────────────────────────────────────────────
# 1. Canonical source: agents/*.md
# ─────────────────────────────────────────────
CANONICAL="$TMPDIR_VALIDATE/canonical.txt"
ls "$PLUGIN_DIR"/agents/*.md 2>/dev/null \
  | xargs -n1 basename \
  | sed 's/\.md$//' \
  | sort > "$CANONICAL"

CANONICAL_COUNT=$(wc -l < "$CANONICAL" | tr -d ' ')
echo -e "${BOLD}Canonical source: agents/ ($CANONICAL_COUNT agents)${NC}"
echo ""

# Helper: compare a source list against canonical
# Usage: compare_source <check_number> <label> <source_file>
compare_source() {
  local num="$1" label="$2" src="$3"
  local src_count missing extra

  sort -o "$src" "$src"
  src_count=$(wc -l < "$src" | tr -d ' ')

  missing=$(comm -23 "$CANONICAL" "$src")
  extra=$(comm -13 "$CANONICAL" "$src")

  if [[ -z "$missing" && -z "$extra" ]]; then
    echo -e "  [${num}/13] ${label} ... ${GREEN}OK${NC} (${src_count}/${CANONICAL_COUNT})"
  else
    if [[ -n "$missing" ]]; then
      local missing_list
      missing_list=$(echo "$missing" | tr '\n' ', ' | sed 's/,$//')
      echo -e "  [${num}/13] ${label} ... ${RED}MISSING${NC}: ${missing_list}"
      ERRORS=$((ERRORS + 1))
    fi
    if [[ -n "$extra" ]]; then
      local extra_list
      extra_list=$(echo "$extra" | tr '\n' ', ' | sed 's/,$//')
      echo -e "  [${num}/13] ${label} ... ${YELLOW}EXTRA${NC}: ${extra_list}"
      ERRORS=$((ERRORS + 1))
    fi
  fi
}

# ─────────────────────────────────────────────
# 2. plugin.json
# ─────────────────────────────────────────────
PLUGIN_JSON="$PLUGIN_DIR/.claude-plugin/plugin.json"
SRC_PLUGIN="$TMPDIR_VALIDATE/plugin.txt"
if [[ -f "$PLUGIN_JSON" ]]; then
  jq -r '.agents[]' "$PLUGIN_JSON" \
    | sed 's|.*/||; s/\.md$//' \
    | sort > "$SRC_PLUGIN"
  compare_source "1" "plugin.json" "$SRC_PLUGIN"
else
  echo -e "  [1/13] plugin.json ... ${RED}FILE NOT FOUND${NC}"
  ERRORS=$((ERRORS + 1))
fi

# ─────────────────────────────────────────────
# 3. jojikdo.json (agent_id normalization)
#    pattern: foo_bar_agent → foo-bar
#    special: data_integration_engineering_agent → data-integration
# ─────────────────────────────────────────────
JOJIKDO="$PLUGIN_DIR/references/jojikdo.json"
SRC_JOJIKDO="$TMPDIR_VALIDATE/jojikdo.txt"
SRC_JOJIKDO_RAW="$TMPDIR_VALIDATE/jojikdo_raw.txt"
if [[ -f "$JOJIKDO" ]]; then
  # Extract raw agent_ids
  jq -r '.. | .agent_id? // empty' "$JOJIKDO" \
    | sort -u > "$SRC_JOJIKDO_RAW"

  # Normalize: remove _agent suffix, replace _ with -, handle special cases
  # Strategy: try to match against canonical names after normalization
  while IFS= read -r aid; do
    # Remove _agent suffix
    slug="${aid%_agent}"
    # Replace underscores with hyphens
    slug="${slug//_/-}"
    # Known mapping exceptions
    case "$slug" in
      data-integration-engineering) slug="data-integration" ;;
    esac
    # If slug doesn't exist in canonical but slug-agent does, use that
    if ! grep -qx "$slug" "$CANONICAL" 2>/dev/null; then
      if grep -qx "${slug}-agent" "$CANONICAL" 2>/dev/null; then
        slug="${slug}-agent"
      fi
    fi
    echo "$slug"
  done < "$SRC_JOJIKDO_RAW" | sort > "$SRC_JOJIKDO"

  # Check for naming mismatches (normalized matches but raw doesn't follow convention)
  WARNINGS=""
  while IFS= read -r aid; do
    slug="${aid%_agent}"
    slug="${slug//_/-}"
    expected_raw="${slug//-/_}_agent"
    case "$slug" in
      data-integration-engineering) continue ;;  # known exception
    esac
    if [[ "$aid" != "$expected_raw" ]]; then
      WARNINGS="${WARNINGS}${aid} vs expected ${expected_raw}, "
    fi
  done < "$SRC_JOJIKDO_RAW"

  if [[ -n "$WARNINGS" ]]; then
    echo -e "  [2/13] jojikdo.json ... ${YELLOW}WARN${NC}: naming mismatch (${WARNINGS%, })"
  fi
  compare_source "2" "jojikdo.json" "$SRC_JOJIKDO"
else
  echo -e "  [2/13] jojikdo.json ... ${RED}FILE NOT FOUND${NC}"
  ERRORS=$((ERRORS + 1))
fi

# ─────────────────────────────────────────────
# 4. dept_map in bams-viz-emit.sh
# ─────────────────────────────────────────────
VIZ_EMIT="$PLUGIN_DIR/hooks/bams-viz-emit.sh"
SRC_DEPT="$TMPDIR_VALIDATE/dept_map.txt"
if [[ -f "$VIZ_EMIT" ]]; then
  # Extract agent names from case patterns in dept_map function
  # Lines look like:    product-strategy|business-analysis|...) echo "planning" ;;
  sed -n '/^dept_map()/,/^}/p' "$VIZ_EMIT" \
    | grep -E 'echo "[a-z][a-z-]+"' \
    | sed 's/).*//' \
    | tr '|' '\n' \
    | sed 's/^[[:space:]]*//' \
    | grep -E '^[a-z]+(-[a-z]+)*$' \
    | sort > "$SRC_DEPT"
  compare_source "3" "dept_map (bams-viz-emit.sh)" "$SRC_DEPT"
else
  echo -e "  [3/13] dept_map ... ${RED}FILE NOT FOUND${NC}"
  ERRORS=$((ERRORS + 1))
fi

# ─────────────────────────────────────────────
# 5. delegation-protocol.md
# ─────────────────────────────────────────────
DELEG="$PLUGIN_DIR/references/delegation-protocol.md"
SRC_DELEG="$TMPDIR_VALIDATE/delegation.txt"
if [[ -f "$DELEG" ]]; then
  # Extract agent slugs: match known slug patterns from canonical list
  # Use canonical as reference to grep for mentions
  > "$SRC_DELEG"
  while IFS= read -r agent; do
    if grep -qF "$agent" "$DELEG"; then
      echo "$agent" >> "$SRC_DELEG"
    fi
  done < "$CANONICAL"
  sort -o "$SRC_DELEG" "$SRC_DELEG"
  compare_source "4" "delegation-protocol.md" "$SRC_DELEG"
else
  echo -e "  [4/13] delegation-protocol.md ... ${RED}FILE NOT FOUND${NC}"
  ERRORS=$((ERRORS + 1))
fi

# ─────────────────────────────────────────────
# 6. init.md CLAUDE.md section (Step 11 agent list)
# ─────────────────────────────────────────────
INIT_MD="$PLUGIN_DIR/commands/bams/init.md"
SRC_INIT="$TMPDIR_VALIDATE/init.txt"
if [[ -f "$INIT_MD" ]]; then
  # Extract agent slugs from the CLAUDE.md section (Step 11)
  # The section lists agents in lines like: - 기획: product-strategy, business-analysis, ...
  # Search between Step 11 marker and next ## Step
  > "$SRC_INIT"
  while IFS= read -r agent; do
    # Search in the Step 11 section specifically (lines 336-415 approx)
    if sed -n '/^## Step 11/,/^## Step [0-9]/p' "$INIT_MD" | grep -qF "$agent"; then
      echo "$agent" >> "$SRC_INIT"
    fi
  done < "$CANONICAL"
  sort -o "$SRC_INIT" "$SRC_INIT"
  compare_source "5" "init.md CLAUDE.md" "$SRC_INIT"
else
  echo -e "  [5/13] init.md ... ${RED}FILE NOT FOUND${NC}"
  ERRORS=$((ERRORS + 1))
fi

# ─────────────────────────────────────────────
# 7. best-practices/*.md
# ─────────────────────────────────────────────
BP_DIR="$PLUGIN_DIR/references/best-practices"
SRC_BP="$TMPDIR_VALIDATE/best_practices.txt"
if [[ -d "$BP_DIR" ]]; then
  ls "$BP_DIR"/*.md 2>/dev/null \
    | xargs -n1 basename \
    | sed 's/\.md$//' \
    | sort > "$SRC_BP"
  compare_source "6" "best-practices/" "$SRC_BP"
else
  echo -e "  [6/13] best-practices/ ... ${RED}DIRECTORY NOT FOUND${NC}"
  ERRORS=$((ERRORS + 1))
fi

# ─────────────────────────────────────────────
# Bonus: verify all departments in dept_map are covered
# ─────────────────────────────────────────────
if [[ -f "$VIZ_EMIT" ]]; then
  DEPTS=$(sed -n '/^dept_map()/,/^}/p' "$VIZ_EMIT" \
    | grep 'echo "' \
    | sed 's/.*echo "//; s/".*//' \
    | sort -u \
    | grep -v general)
  DEPT_COUNT=$(echo "$DEPTS" | wc -l | tr -d ' ')
  echo -e "  [7/13] dept_map departments ... ${GREEN}OK${NC} (${DEPT_COUNT} departments: $(echo "$DEPTS" | tr '\n' ', ' | sed 's/,$//'))"
fi

# ─────────────────────────────────────────────
# 8. frontmatter `department:` field (FAIL)
# ─────────────────────────────────────────────
MISSING_DEPT=""
for f in "$PLUGIN_DIR"/agents/*.md; do
  if ! sed -n '/^---$/,/^---$/p' "$f" | grep -q "^department:"; then
    MISSING_DEPT="${MISSING_DEPT}$(basename "$f" .md), "
  fi
done
if [[ -z "$MISSING_DEPT" ]]; then
  echo -e "  [8/13] frontmatter department: ... ${GREEN}OK${NC} (${CANONICAL_COUNT}/${CANONICAL_COUNT})"
else
  echo -e "  [8/13] frontmatter department: ... ${RED}MISSING${NC}: ${MISSING_DEPT%, }"
  ERRORS=$((ERRORS + 1))
fi

# ─────────────────────────────────────────────
# 9. frontmatter `disallowedTools:` field (WARN)
# ─────────────────────────────────────────────
MISSING_DT=""
for f in "$PLUGIN_DIR"/agents/*.md; do
  if ! sed -n '/^---$/,/^---$/p' "$f" | grep -q "^disallowedTools:"; then
    MISSING_DT="${MISSING_DT}$(basename "$f" .md), "
  fi
done
if [[ -z "$MISSING_DT" ]]; then
  echo -e "  [9/13] frontmatter disallowedTools: ... ${GREEN}OK${NC} (${CANONICAL_COUNT}/${CANONICAL_COUNT})"
else
  echo -e "  [9/13] frontmatter disallowedTools: ... ${YELLOW}WARN${NC}: ${MISSING_DT%, }"
fi

# ─────────────────────────────────────────────
# 10. pipeline-naming-convention.md 존재 (WARN)
# ─────────────────────────────────────────────
PNC="$PLUGIN_DIR/references/pipeline-naming-convention.md"
if [[ -f "$PNC" ]]; then
  echo -e "  [10/13] pipeline-naming-convention.md ... ${GREEN}OK${NC}"
else
  echo -e "  [10/13] pipeline-naming-convention.md ... ${YELLOW}WARN${NC}: not found"
fi

# ─────────────────────────────────────────────
# 11. jojikdo.json data_integration in engineering-platform (INFO)
#     data-integration은 engineering-platform 부서 소속 (platform-devops 부서장 하위)
# ─────────────────────────────────────────────
if [[ -f "$JOJIKDO" ]] && grep -q "data_integration_engineering_agent" "$JOJIKDO"; then
  # Verify data_integration is under engineering-platform department
  _DI_DEPT=$(jq -r '.departments[] | select(.agents[]?.agent_id == "data_integration_engineering_agent") | .department_id' "$JOJIKDO" 2>/dev/null)
  if [[ "$_DI_DEPT" == "engineering-platform" ]]; then
    echo -e "  [11/13] jojikdo data_integration department ... ${GREEN}OK${NC} (engineering-platform 소속, department_lead: platform_devops_agent)"
  else
    echo -e "  [11/13] jojikdo data_integration department ... ${YELLOW}WARN${NC}: expected engineering-platform, got ${_DI_DEPT:-unknown}"
  fi
else
  echo -e "  [11/13] jojikdo data_integration special case ... ${YELLOW}INFO${NC}: special case key not found"
fi

# ─────────────────────────────────────────────
# 12. Policy-Code drift: agent-tool-policy.md "구현 전담 에이전트" 목록 ==
#     실제 disallowedTools: [] 보유 에이전트 집합 (FAIL)
# ─────────────────────────────────────────────
POLICY="$PLUGIN_DIR/references/agent-tool-policy.md"
ACTUAL_IMPL="$TMPDIR_VALIDATE/impl_actual.txt"
POLICY_IMPL="$TMPDIR_VALIDATE/impl_policy.txt"

if [[ -f "$POLICY" ]]; then
  # 실제: frontmatter에 `disallowedTools: []` 를 선언한 에이전트 목록
  > "$ACTUAL_IMPL"
  for f in "$PLUGIN_DIR"/agents/*.md; do
    if sed -n '/^---$/,/^---$/p' "$f" | grep -qE '^disallowedTools:[[:space:]]*\[\][[:space:]]*$'; then
      basename "$f" .md >> "$ACTUAL_IMPL"
    fi
  done
  sort -o "$ACTUAL_IMPL" "$ACTUAL_IMPL"

  # policy: "구현 전담 에이전트 (`disallowedTools: [])" 섹션의 bullet 목록 파싱
  # 섹션 헤더: ^## 구현 전담 에이전트 ... 다음 ^## 헤더 이전까지
  # bullet 형식: - **agent-name**: 설명
  sed -n '/^## 구현 전담 에이전트/,/^## /p' "$POLICY" \
    | grep -E '^- \*\*[a-z][a-z0-9-]*\*\*' \
    | sed -E 's/^- \*\*([a-z0-9-]+)\*\*.*/\1/' \
    | sort -u > "$POLICY_IMPL"

  ACTUAL_COUNT=$(wc -l < "$ACTUAL_IMPL" | tr -d ' ')
  POLICY_COUNT=$(wc -l < "$POLICY_IMPL" | tr -d ' ')

  MISSING_IN_POLICY=$(comm -23 "$ACTUAL_IMPL" "$POLICY_IMPL")
  MISSING_IN_CODE=$(comm -13 "$ACTUAL_IMPL" "$POLICY_IMPL")

  if [[ -z "$MISSING_IN_POLICY" && -z "$MISSING_IN_CODE" ]]; then
    echo -e "  [12/13] policy-code drift (agent-tool-policy) ... ${GREEN}OK${NC} (${ACTUAL_COUNT}=${POLICY_COUNT})"
  else
    if [[ -n "$MISSING_IN_POLICY" ]]; then
      ml=$(echo "$MISSING_IN_POLICY" | tr '\n' ', ' | sed 's/,$//')
      echo -e "  [12/13] policy-code drift ... ${RED}MISSING IN POLICY${NC}: ${ml}"
      ERRORS=$((ERRORS + 1))
    fi
    if [[ -n "$MISSING_IN_CODE" ]]; then
      el=$(echo "$MISSING_IN_CODE" | tr '\n' ', ' | sed 's/,$//')
      echo -e "  [12/13] policy-code drift ... ${RED}MISSING IN CODE${NC}: ${el}"
      ERRORS=$((ERRORS + 1))
    fi
  fi
else
  echo -e "  [12/13] policy-code drift ... ${RED}FILE NOT FOUND${NC}: agent-tool-policy.md"
  ERRORS=$((ERRORS + 1))
fi

# ─────────────────────────────────────────────
# 13. Sidecar binary staleness check (WARN)
#     server/src/app.ts mtime vs sidecar binary mtime
# ─────────────────────────────────────────────
SERVER_SRC="$PLUGIN_DIR/server/src/app.ts"
SIDECAR_BIN="$PLUGIN_DIR/tools/bams-widget/tauri/src-tauri/binaries/bams-server-aarch64-apple-darwin"
if [[ -f "$SERVER_SRC" && -f "$SIDECAR_BIN" ]]; then
  if [[ "$(uname)" == "Darwin" ]]; then
    SRC_MTIME=$(stat -f %m "$SERVER_SRC")
    BIN_MTIME=$(stat -f %m "$SIDECAR_BIN")
  else
    SRC_MTIME=$(stat -c %Y "$SERVER_SRC")
    BIN_MTIME=$(stat -c %Y "$SIDECAR_BIN")
  fi
  if [[ "$BIN_MTIME" -lt "$SRC_MTIME" ]]; then
    echo -e "  [13/13] sidecar binary staleness ... ${YELLOW}WARN${NC}: sidecar binary is older than server source — rebuild recommended"
  else
    echo -e "  [13/13] sidecar binary staleness ... ${GREEN}OK${NC}"
  fi
elif [[ ! -f "$SERVER_SRC" ]]; then
  echo -e "  [13/13] sidecar binary staleness ... ${YELLOW}WARN${NC}: server source not found (${SERVER_SRC})"
elif [[ ! -f "$SIDECAR_BIN" ]]; then
  echo -e "  [13/13] sidecar binary staleness ... ${YELLOW}WARN${NC}: sidecar binary not found (skipped)"
fi

# ─────────────────────────────────────────────
# Result
# ─────────────────────────────────────────────
echo ""
if [[ "$ERRORS" -eq 0 ]]; then
  echo -e "=== Result: ${GREEN}All sources in sync${NC} ==="
  exit 0
else
  echo -e "=== Result: ${RED}${ERRORS} issue(s) found${NC} ==="
  exit 1
fi
