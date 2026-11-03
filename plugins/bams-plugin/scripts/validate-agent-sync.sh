#!/usr/bin/env bash
# validate-agent-sync.sh — 에이전트 13 checks 동기화 검증 (11 + [12] repo↔cache diff + [13] validate-harness.sh)
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
# Canonical source: agents/*.md
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
    echo -e "  [${num}/12] ${label} ... ${GREEN}OK${NC} (${src_count}/${CANONICAL_COUNT})"
  else
    if [[ -n "$missing" ]]; then
      local missing_list
      missing_list=$(echo "$missing" | tr '\n' ', ' | sed 's/,$//')
      echo -e "  [${num}/12] ${label} ... ${RED}MISSING${NC}: ${missing_list}"
      ERRORS=$((ERRORS + 1))
    fi
    if [[ -n "$extra" ]]; then
      local extra_list
      extra_list=$(echo "$extra" | tr '\n' ', ' | sed 's/,$//')
      echo -e "  [${num}/12] ${label} ... ${YELLOW}EXTRA${NC}: ${extra_list}"
      ERRORS=$((ERRORS + 1))
    fi
  fi
}

# ─────────────────────────────────────────────
# 1. plugin.json
# ─────────────────────────────────────────────
PLUGIN_JSON="$PLUGIN_DIR/.claude-plugin/plugin.json"
SRC_PLUGIN="$TMPDIR_VALIDATE/plugin.txt"
if [[ -f "$PLUGIN_JSON" ]]; then
  jq -r '.agents[]' "$PLUGIN_JSON" \
    | sed 's|.*/||; s/\.md$//' \
    | sort > "$SRC_PLUGIN"
  compare_source "1" "plugin.json" "$SRC_PLUGIN"
else
  echo -e "  [1/12] plugin.json ... ${RED}FILE NOT FOUND${NC}"
  ERRORS=$((ERRORS + 1))
fi

# ─────────────────────────────────────────────
# 2. jojikdo.json (agent_id normalization)
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
    echo -e "  [2/12] jojikdo.json ... ${YELLOW}WARN${NC}: naming mismatch (${WARNINGS%, })"
  fi
  compare_source "2" "jojikdo.json" "$SRC_JOJIKDO"
else
  echo -e "  [2/12] jojikdo.json ... ${RED}FILE NOT FOUND${NC}"
  ERRORS=$((ERRORS + 1))
fi

# ─────────────────────────────────────────────
# 3. delegation-protocol.md
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
  compare_source "3" "delegation-protocol.md" "$SRC_DELEG"
else
  echo -e "  [3/12] delegation-protocol.md ... ${RED}FILE NOT FOUND${NC}"
  ERRORS=$((ERRORS + 1))
fi

# ─────────────────────────────────────────────
# 4. init.md CLAUDE.md section (Step 11 agent list)
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
  compare_source "4" "init.md CLAUDE.md" "$SRC_INIT"
else
  echo -e "  [4/12] init.md ... ${RED}FILE NOT FOUND${NC}"
  ERRORS=$((ERRORS + 1))
fi

# ─────────────────────────────────────────────
# 5. best-practices/*.md
# ─────────────────────────────────────────────
BP_DIR="$PLUGIN_DIR/references/best-practices"
SRC_BP="$TMPDIR_VALIDATE/best_practices.txt"
if [[ -d "$BP_DIR" ]]; then
  ls "$BP_DIR"/*.md 2>/dev/null \
    | xargs -n1 basename \
    | sed 's/\.md$//' \
    | sort > "$SRC_BP"
  compare_source "5" "best-practices/" "$SRC_BP"
else
  echo -e "  [5/12] best-practices/ ... ${RED}DIRECTORY NOT FOUND${NC}"
  ERRORS=$((ERRORS + 1))
fi

# ─────────────────────────────────────────────
# [5b/12] best-practice 콘텐츠 검증 (Wave 1 6 파일 한정)
# ─────────────────────────────────────────────
_BP_WAVE1=(guide-decomposer guide-recomposer data-binding-mapper accessibility-auditor routing-strategist ssr-csr-decider)
_BP_WAVE1_FAIL=0
for slug in "${_BP_WAVE1[@]}"; do
  bp="$BP_DIR/${slug}.md"
  if [ -f "$bp" ]; then
    # placeholder 패턴 감지 (실제 미작성 패턴만 — 파일명/변수명 내 용어 제외)
    if grep -qE '\(추후 작성\)|^> Placeholder|TODO: |^\(TODO\)' "$bp"; then
      echo -e "  [5b/12] best-practice 콘텐츠 ... ${RED}FAIL${NC}: ${slug} placeholder 잔존"
      ERRORS=$((ERRORS + 1))
      _BP_WAVE1_FAIL=$((_BP_WAVE1_FAIL + 1))
      continue
    fi
    # 줄수 >= 30 (50 목표지만 안전 margin)
    _LINES=$(wc -l < "$bp" | tr -d ' ')
    if [ "$_LINES" -lt 30 ]; then
      echo -e "  [5b/12] best-practice 줄수 ... ${RED}FAIL${NC}: ${slug} ${_LINES}줄 < 30"
      ERRORS=$((ERRORS + 1))
      _BP_WAVE1_FAIL=$((_BP_WAVE1_FAIL + 1))
    fi
  fi
done
if [ "$_BP_WAVE1_FAIL" -eq 0 ]; then
  echo -e "  [5b/12] best-practice 콘텐츠 (Wave 1 6) ... ${GREEN}OK${NC}"
fi

# ─────────────────────────────────────────────
# 6. frontmatter `department:` field (FAIL)
# ─────────────────────────────────────────────
MISSING_DEPT=""
for f in "$PLUGIN_DIR"/agents/*.md; do
  if ! awk '/^---$/{c++; if(c==2) exit} c>=1' "$f" | grep -q "^department:"; then
    MISSING_DEPT="${MISSING_DEPT}$(basename "$f" .md), "
  fi
done
if [[ -z "$MISSING_DEPT" ]]; then
  echo -e "  [6/12] frontmatter department: ... ${GREEN}OK${NC} (${CANONICAL_COUNT}/${CANONICAL_COUNT})"
else
  echo -e "  [6/12] frontmatter department: ... ${RED}MISSING${NC}: ${MISSING_DEPT%, }"
  ERRORS=$((ERRORS + 1))
fi

# ─────────────────────────────────────────────
# 7. frontmatter `disallowedTools:` field (WARN)
# ─────────────────────────────────────────────
MISSING_DT=""
for f in "$PLUGIN_DIR"/agents/*.md; do
  if ! awk '/^---$/{c++; if(c==2) exit} c>=1' "$f" | grep -q "^disallowedTools:"; then
    MISSING_DT="${MISSING_DT}$(basename "$f" .md), "
  fi
done
if [[ -z "$MISSING_DT" ]]; then
  echo -e "  [7/12] frontmatter disallowedTools: ... ${GREEN}OK${NC} (${CANONICAL_COUNT}/${CANONICAL_COUNT})"
else
  echo -e "  [7/12] frontmatter disallowedTools: ... ${YELLOW}WARN${NC}: ${MISSING_DT%, }"
fi

# ─────────────────────────────────────────────
# 8. pipeline-naming-convention.md 존재 (WARN)
# ─────────────────────────────────────────────
PNC="$PLUGIN_DIR/references/pipeline-naming-convention.md"
if [[ -f "$PNC" ]]; then
  echo -e "  [8/12] pipeline-naming-convention.md ... ${GREEN}OK${NC}"
else
  echo -e "  [8/12] pipeline-naming-convention.md ... ${YELLOW}WARN${NC}: not found"
fi

# ─────────────────────────────────────────────
# 9. jojikdo.json data_integration in engineering-platform (INFO)
#     data-integration은 engineering-platform 부서 소속 (platform-devops 부서장 하위)
# ─────────────────────────────────────────────
if [[ -f "$JOJIKDO" ]] && grep -q "data_integration_engineering_agent" "$JOJIKDO"; then
  # Verify data_integration is under engineering-platform department
  _DI_DEPT=$(jq -r '.departments[] | select(.agents[]?.agent_id == "data_integration_engineering_agent") | .department_id' "$JOJIKDO" 2>/dev/null)
  if [[ "$_DI_DEPT" == "engineering-platform" ]]; then
    echo -e "  [9/12] jojikdo data_integration department ... ${GREEN}OK${NC} (engineering-platform 소속, department_lead: platform_devops_agent)"
  else
    echo -e "  [9/12] jojikdo data_integration department ... ${YELLOW}WARN${NC}: expected engineering-platform, got ${_DI_DEPT:-unknown}"
  fi
else
  echo -e "  [9/12] jojikdo data_integration special case ... ${YELLOW}INFO${NC}: special case key not found"
fi

# ─────────────────────────────────────────────
# 10. Policy-Code drift: agent-tool-policy.md "구현 전담 에이전트" 목록 ==
#     실제 disallowedTools: [] 보유 에이전트 집합 (FAIL)
# ─────────────────────────────────────────────
POLICY="$PLUGIN_DIR/references/agent-tool-policy.md"
ACTUAL_IMPL="$TMPDIR_VALIDATE/impl_actual.txt"
POLICY_IMPL="$TMPDIR_VALIDATE/impl_policy.txt"

if [[ -f "$POLICY" ]]; then
  # 실제: frontmatter에 `disallowedTools: []` 를 선언한 에이전트 목록
  > "$ACTUAL_IMPL"
  for f in "$PLUGIN_DIR"/agents/*.md; do
    if awk '/^---$/{c++; if(c==2) exit} c>=1' "$f" | grep -qE '^disallowedTools:[[:space:]]*\[\][[:space:]]*$'; then
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
    echo -e "  [10/12] policy-code drift (agent-tool-policy) ... ${GREEN}OK${NC} (${ACTUAL_COUNT}=${POLICY_COUNT})"
  else
    if [[ -n "$MISSING_IN_POLICY" ]]; then
      ml=$(echo "$MISSING_IN_POLICY" | tr '\n' ', ' | sed 's/,$//')
      echo -e "  [10/12] policy-code drift ... ${RED}MISSING IN POLICY${NC}: ${ml}"
      ERRORS=$((ERRORS + 1))
    fi
    if [[ -n "$MISSING_IN_CODE" ]]; then
      el=$(echo "$MISSING_IN_CODE" | tr '\n' ', ' | sed 's/,$//')
      echo -e "  [10/12] policy-code drift ... ${RED}MISSING IN CODE${NC}: ${el}"
      ERRORS=$((ERRORS + 1))
    fi
  fi
else
  echo -e "  [10/12] policy-code drift ... ${RED}FILE NOT FOUND${NC}: agent-tool-policy.md"
  ERRORS=$((ERRORS + 1))
fi

# ─────────────────────────────────────────────
# 11. specialist-roster SSOT consistency (WARN only)
#     sync-specialists.ts dry-run → 0 drifts = OK
# ─────────────────────────────────────────────
if command -v bun >/dev/null 2>&1; then
  SYNC_RESULT=$(bun run "$PLUGIN_DIR/scripts/sync-specialists.ts" 2>&1 | tail -1 || true)
  if echo "$SYNC_RESULT" | grep -q "Dry-run: 0 drifts"; then
    echo -e "  [11/12] specialist-roster SSOT ... ${GREEN}OK${NC}"
  else
    echo -e "  [11/12] specialist-roster SSOT ... ${YELLOW}WARN${NC}: drifts detected (run sync-specialists.ts --apply or insert markers)"
  fi
else
  echo -e "  [11/12] specialist-roster SSOT ... ${YELLOW}SKIP${NC}: bun not installed"
fi

# ─────────────────────────────────────────────
# 12. repo ↔ plugin-cache diff (agents / references / commands / scripts + sync-cache.sh) (FAIL)
#     캐시 경로는 resolve-cache.sh(installed_plugins.json installPath SSOT)로 확정.
#     scripts/ 포함(M8 fix): scripts는 repo-fixed 실행이 원칙이나, 캐시 사본이 stale하면
#       캐시 경로로 오실행 시 검증 도구가 낡은 채 통과할 위험이 있어 동기 대상에 포함한다.
#     sync-cache.sh(plugin 루트 파일)는 디렉터리가 아니므로 개별 파일 diff로 검사.
#     commands/bams/*.txt(allowlist류)는 commands 디렉터리 재귀 diff에 이미 포함됨.
#     CACHE_ROOT 해석 실패 시 SKIP이 아니라 ERRORS++ (E-2b ADJ-2 — R-2 무력화 방지).
# ─────────────────────────────────────────────
CACHE_ROOT="$("$PLUGIN_DIR/scripts/resolve-cache.sh")" || {
  echo -e "  [12/12] repo↔cache diff ... ${RED}FAIL${NC}: 캐시 경로 확정 실패(installPath 후보≠1)"
  ERRORS=$((ERRORS + 1)); CACHE_ROOT=""
}
if [[ -n "$CACHE_ROOT" ]]; then
  _DIFF_FAIL=0
  for sub in agents references commands scripts; do   # scripts 포함(M8) — commands 재귀에 *.txt 포함
    if [[ -d "$PLUGIN_DIR/$sub" && -d "$CACHE_ROOT/$sub" ]]; then
      d=$(diff -rq "$PLUGIN_DIR/$sub" "$CACHE_ROOT/$sub" 2>&1) || true   # diff exit1(차이)로 set -e 중단 방지
      [[ -n "$d" ]] && { echo -e "  [12/12] repo↔cache ($sub) ... ${RED}MISMATCH${NC}"; \
        echo "$d" | sed 's/^/        /' | head -20; ERRORS=$((ERRORS+1)); _DIFF_FAIL=$((_DIFF_FAIL+1)); }
    else
      echo -e "  [12/12] repo↔cache ($sub) ... ${YELLOW}WARN${NC}: 한쪽 디렉터리 부재"
    fi
  done
  # sync-cache.sh — plugin 루트 개별 파일 (디렉터리 아님)
  if [[ -f "$PLUGIN_DIR/sync-cache.sh" && -f "$CACHE_ROOT/sync-cache.sh" ]]; then
    d=$(diff -q "$PLUGIN_DIR/sync-cache.sh" "$CACHE_ROOT/sync-cache.sh" 2>&1) || true
    [[ -n "$d" ]] && { echo -e "  [12/12] repo↔cache (sync-cache.sh) ... ${RED}MISMATCH${NC}"; \
      echo "$d" | sed 's/^/        /' | head -5; ERRORS=$((ERRORS+1)); _DIFF_FAIL=$((_DIFF_FAIL+1)); }
  elif [[ -f "$PLUGIN_DIR/sync-cache.sh" ]]; then
    echo -e "  [12/12] repo↔cache (sync-cache.sh) ... ${YELLOW}WARN${NC}: 캐시에 sync-cache.sh 부재"
  fi
  [[ "$_DIFF_FAIL" -eq 0 ]] && echo -e "  [12/12] repo↔cache diff ... ${GREEN}OK${NC} (${CACHE_ROOT##*/bams-plugin/})"
fi

# ─────────────────────────────────────────────
# 13. validate-harness.sh (frontmatter 허용값 / plugin.json hooks·agents / 크기 예산)
#     FAIL → ERRORS++, WARN만 있으면 통과.
# ─────────────────────────────────────────────
_VH_RC=0
_VH_OUT=$(bash "$PLUGIN_DIR/scripts/validate-harness.sh" --quiet 2>&1) || _VH_RC=$?
_VH_SUM=$(echo "$_VH_OUT" | grep '^=== validate-harness' | sed 's/^=== //; s/ ===$//')
if [[ "$_VH_RC" -eq 0 ]]; then
  echo -e "  [13] harness static checks ... ${GREEN}OK${NC} (${_VH_SUM:-no summary})"
else
  echo -e "  [13] harness static checks ... ${RED}FAIL${NC} (${_VH_SUM:-exit $_VH_RC})"
  echo "$_VH_OUT" | grep '^  FAIL' | sed 's/^/      /' || true
  ERRORS=$((ERRORS + 1))
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
