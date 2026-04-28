#!/usr/bin/env bash
# scripts/verify-retro-guards.sh
# Retro guard regression test
#   Group A - AC1~AC12 (plan_retro범위가드)
#   Group B - B-AC1~B-AC7, B-W1 (plan_보안위임표준화)
#
# Usage:
#   bash scripts/verify-retro-guards.sh          # from repo root
#   Run linter: sc-lint scripts/verify-retro-guards.sh
#
# Exit codes:
#   0 — all checks PASS
#   1 — one or more checks FAIL
#   2 — required input files missing
#
# Environment:
#   BAMS_PLUGIN_ROOT  override plugin path (default: plugins/bams-plugin)

set -euo pipefail

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BAMS_ROOT="${BAMS_PLUGIN_ROOT:-plugins/bams-plugin}"
RETRO_PROTO="${BAMS_ROOT}/references/retro-protocol.md"
PHASE2="${BAMS_ROOT}/commands/bams/retro/phase-2-retro.md"
PHASE4="${BAMS_ROOT}/commands/bams/retro/phase-4-improve.md"
SECURITY="${BAMS_ROOT}/references/delegation-message-security.md"

# ---------------------------------------------------------------------------
# Counters
# ---------------------------------------------------------------------------
FAIL_COUNT=0
PASS_COUNT=0
TOTAL=0

# ---------------------------------------------------------------------------
# check_ge  <name> <file> <pattern> <min>
#   grep -c pattern file, then compare count >= min
# ---------------------------------------------------------------------------
check_ge() {
    local name="$1"
    local file="$2"
    local pattern="$3"
    local min="$4"
    TOTAL=$((TOTAL + 1))
    local count
    count=$(grep -c "${pattern}" "${file}" 2>/dev/null || true)
    if [ "${count}" -ge "${min}" ]; then
        PASS_COUNT=$((PASS_COUNT + 1))
        printf "[PASS] %s  (count=%s)\n" "${name}" "${count}"
    else
        FAIL_COUNT=$((FAIL_COUNT + 1))
        printf "[FAIL] %s  (count=%s, expected ≥%s)\n" "${name}" "${count}" "${min}"
    fi
}

# ---------------------------------------------------------------------------
# check_eq  <name> <file> <pattern> <expected_count>
#   grep -c pattern file, then compare count == expected_count
# ---------------------------------------------------------------------------
check_eq() {
    local name="$1"
    local file="$2"
    local pattern="$3"
    local expected="$4"
    TOTAL=$((TOTAL + 1))
    local count
    count=$(grep -c "${pattern}" "${file}" 2>/dev/null || true)
    if [ "${count}" -eq "${expected}" ]; then
        PASS_COUNT=$((PASS_COUNT + 1))
        printf "[PASS] %s  (count=%s)\n" "${name}" "${count}"
    else
        FAIL_COUNT=$((FAIL_COUNT + 1))
        printf "[FAIL] %s  (count=%s, expected=%s)\n" "${name}" "${count}" "${expected}"
    fi
}

# ---------------------------------------------------------------------------
# check_wc_ge  <name> <file> <min_lines>
#   wc -l comparison
# ---------------------------------------------------------------------------
check_wc_ge() {
    local name="$1"
    local file="$2"
    local min="$3"
    TOTAL=$((TOTAL + 1))
    local lines
    lines=$(wc -l < "${file}" 2>/dev/null || true)
    if [ "${lines}" -ge "${min}" ]; then
        PASS_COUNT=$((PASS_COUNT + 1))
        printf "[PASS] %s  (lines=%s)\n" "${name}" "${lines}"
    else
        FAIL_COUNT=$((FAIL_COUNT + 1))
        printf "[FAIL] %s  (lines=%s, expected ≥%s)\n" "${name}" "${lines}" "${min}"
    fi
}

# ---------------------------------------------------------------------------
# check_pipe_ge  <name> <pipeline_command_string> <min>
#   Run an arbitrary pipeline string (no eval — passed as single arg to bash -c).
#   Use sparingly; only when grep+pipe is unavoidable.
# ---------------------------------------------------------------------------
check_pipe_ge() {
    local name="$1"
    local pipeline="$2"
    local min="$3"
    TOTAL=$((TOTAL + 1))
    local count
    count=$(bash -c "${pipeline}" 2>/dev/null || true)
    # Ensure count is numeric
    count=$(printf '%s' "${count}" | tr -d '[:space:]')
    if [ -z "${count}" ]; then count=0; fi
    if [ "${count}" -ge "${min}" ]; then
        PASS_COUNT=$((PASS_COUNT + 1))
        printf "[PASS] %s  (count=%s)\n" "${name}" "${count}"
    else
        FAIL_COUNT=$((FAIL_COUNT + 1))
        printf "[FAIL] %s  (count=%s, expected ≥%s)\n" "${name}" "${count}" "${min}"
    fi
}


check_sum_ge() {
    local name="$1"
    local actual="$2"
    local min="$3"
    TOTAL=$((TOTAL + 1))
    if [ "${actual}" -ge "${min}" ]; then
        PASS_COUNT=$((PASS_COUNT + 1))
        printf "[PASS] %s  (sum=%s)\n" "${name}" "${actual}"
    else
        FAIL_COUNT=$((FAIL_COUNT + 1))
        printf "[FAIL] %s  (sum=%s, expected ≥%s)\n" "${name}" "${actual}" "${min}"
    fi
}

# ---------------------------------------------------------------------------
# check_files_exist: abort early if required files are missing
# ---------------------------------------------------------------------------
check_files_exist() {
    local ok=1
    for f in "${RETRO_PROTO}" "${PHASE2}" "${PHASE4}" "${SECURITY}"; do
        if [ ! -f "${f}" ]; then
            printf "[ERROR] Required file not found: %s\n" "${f}" >&2
            ok=0
        fi
    done
    if [ "${ok}" -eq 0 ]; then
        printf "\nAborted: missing input files. Run from repo root or set BAMS_PLUGIN_ROOT.\n" >&2
        exit 2
    fi
}

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------
printf "=== Retro Guard Regression Test ===\n"
printf "Plugin root : %s\n" "${BAMS_ROOT}"
printf "Date        : %s\n\n" "$(date '+%Y-%m-%d %H:%M:%S')"

check_files_exist

# ---------------------------------------------------------------------------
# Group A - plan_retro범위가드 (AC1~AC12)
# ---------------------------------------------------------------------------
printf "=== Group A: plan_retro AC1~AC12 ===\n"

# AC1: retro-protocol.md "일반화 가능성" ≥1
check_ge \
    "AC1: retro-protocol.md '일반화 가능성' ≥1" \
    "${RETRO_PROTO}" \
    "일반화 가능성" \
    1

# AC2: retro-protocol.md §3-1 분류 문장 3종
check_ge \
    "AC2a: retro-protocol.md '단일 프로젝트 한정' ≥1" \
    "${RETRO_PROTO}" \
    "단일 프로젝트 한정" \
    1

check_ge \
    "AC2b: retro-protocol.md '.crew/gotchas.md' ≥1" \
    "${RETRO_PROTO}" \
    ".crew/gotchas.md" \
    1

check_ge \
    "AC2c: retro-protocol.md '프로젝트 차원 액션' ≥1" \
    "${RETRO_PROTO}" \
    "프로젝트 차원 액션" \
    1

# AC3: phase-4-improve.md "### 일반화 가능성" ≥1
check_ge \
    "AC3: phase-4-improve.md '### 일반화 가능성' ≥1" \
    "${PHASE4}" \
    "### 일반화 가능성" \
    1

# AC4: "다중 프로젝트 재현 가능" AND "단일 프로젝트 한정" 모두 ≥1
check_ge \
    "AC4a: phase-4-improve.md '다중 프로젝트 재현 가능' ≥1" \
    "${PHASE4}" \
    "다중 프로젝트 재현 가능" \
    1

check_ge \
    "AC4b: phase-4-improve.md '단일 프로젝트 한정' ≥1" \
    "${PHASE4}" \
    "단일 프로젝트 한정" \
    1

# AC5: "plugin agent 수정 대상" 제외 문장 ≥1
check_ge \
    "AC5: phase-4-improve.md 'plugin agent 수정 대상' ≥1" \
    "${PHASE4}" \
    "plugin agent 수정 대상" \
    1

# AC6: ".crew/gotchas.md 후보" 옵션 ≥1
check_ge \
    "AC6: phase-4-improve.md '.crew/gotchas.md 후보' ≥1" \
    "${PHASE4}" \
    ".crew/gotchas.md 후보" \
    1

# AC7: phase-4-improve.md "일반화 가능성" ≥1 (Step 8 본문 포함)
check_ge \
    "AC7: phase-4-improve.md '일반화 가능성' ≥1 (Step 8 포함)" \
    "${PHASE4}" \
    "일반화 가능성" \
    1

# AC8: NF1 호환성 안내 ("분류 미상" 처리) ≥1 — 회귀 호환성 대리 확인
#       실제 기존 파일 dry-run은 별도 수행 권장
check_ge \
    "AC8: phase-4-improve.md '분류 미상' ≥1 [NF1 호환성, 회귀 dry-run은 별도 수행]" \
    "${PHASE4}" \
    "분류 미상" \
    1

# AC9: phase-2-retro.md "일반화 가능성" ≥1
check_ge \
    "AC9: phase-2-retro.md '일반화 가능성' ≥1" \
    "${PHASE2}" \
    "일반화 가능성" \
    1

# AC10: agents/*.md 변경 0건 — git diff 의존, grep 검증 불가
#        CI에서: git diff HEAD -- plugins/bams-plugin/agents/*.md (빈 출력이면 PASS)
printf "[SKIP] AC10: agents/*.md diff 0건 — git diff 의존, CI에서 별도 확인 필요\n"

# AC11: phase-4-improve.md "Step 8-2" ≥1
check_ge \
    "AC11: phase-4-improve.md 'Step 8-2' ≥1 (Step 8-2 신설 확인)" \
    "${PHASE4}" \
    "Step 8-2" \
    1

# AC12: 3개 파일 합산 — iOS/safari/chrome/edge/firefox 구체 키워드 = 0
#        macOS BSD grep: -E 사용, -P 미지원
_kw_retro=$(grep -icE "(iOS|safari|chrome|edge|firefox)[0-9]?" "${RETRO_PROTO}" 2>/dev/null || true)
_kw_p2=$(grep -icE "(iOS|safari|chrome|edge|firefox)[0-9]?" "${PHASE2}" 2>/dev/null || true)
_kw_p4=$(grep -icE "(iOS|safari|chrome|edge|firefox)[0-9]?" "${PHASE4}" 2>/dev/null || true)
_kw_total=$(( ${_kw_retro:-0} + ${_kw_p2:-0} + ${_kw_p4:-0} ))
TOTAL=$((TOTAL + 1))
if [ "${_kw_total}" -eq 0 ]; then
    PASS_COUNT=$((PASS_COUNT + 1))
    printf "[PASS] AC12: 브라우저/OS 구체 키워드 0건 (retro=%s, phase-2=%s, phase-4=%s)\n" \
        "${_kw_retro:-0}" "${_kw_p2:-0}" "${_kw_p4:-0}"
else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    printf "[FAIL] AC12: 브라우저/OS 구체 키워드 %d건 검출 (expected: 0)\n" "${_kw_total}"
fi

# ---------------------------------------------------------------------------
# Group B - plan_보안위임표준화 (B-AC1~B-AC7, B-W1)
# ---------------------------------------------------------------------------
printf "\n=== Group B: plan_보안위임표준화 B-AC1~B-AC7 B-W1 ===\n"

# B-AC1: delegation-message-security.md 줄 수 ≥100
check_wc_ge \
    "B-AC1: delegation-message-security.md ≥100줄" \
    "${SECURITY}" \
    100

# B-AC2: delegation-message-security.md "agent_generated_content" ≥1
check_ge \
    "B-AC2: delegation-message-security.md 'agent_generated_content' ≥1" \
    "${SECURITY}" \
    "agent_generated_content" \
    1

# B-AC3: phase-4-improve.md Step 7a "agent_generated_content" ≥1
check_ge \
    "B-AC3: phase-4-improve.md 'agent_generated_content' ≥1 (Step 7a 구분자)" \
    "${PHASE4}" \
    "agent_generated_content" \
    1

# B-AC4: phase-4-improve.md `^[\d,\s]+$` 정규식 패턴 ≥2 (Step 8 + Step 8-2)
# 파일 내 리터럴 표기: `^[\d,\s]+$`  — 백틱 안에 \d, \s 포함
# grep 패턴: \[\\d  →  파일 내 [\d 문자열 검색
check_ge \
    "B-AC4: phase-4-improve.md '^[\\d,\\s]+\$' 정규식 ≥2 (Step 8 + Step 8-2)" \
    "${PHASE4}" \
    "\[\\\\d,\\\\s\]" \
    2

# B-AC5: phase-4-improve.md ^[AC]$ or ^[ABC]$ 패턴 ≥2
check_ge \
    "B-AC5: phase-4-improve.md '[AC]' 입력 검증 패턴 ≥2" \
    "${PHASE4}" \
    "\[AC\]" \
    2

# B-AC6: phase-4-improve.md "분류 미상" 맥락에 "카운트에서 제외" ≥1
# -A2: 매칭 라인 포함 이후 2줄 출력
check_pipe_ge \
    "B-AC6: phase-4-improve.md '분류 미상' 맥락에 '카운트에서 제외' ≥1" \
    "grep -A2 '분류 미상' '${PHASE4}' | grep -c '카운트에서 제외'" \
    1

# B-AC7: phase-4-improve.md + phase-2-retro.md "delegation-message-security" 합산 ≥2
_ref_p4=$(grep -c "delegation-message-security" "${PHASE4}" 2>/dev/null || true)
_ref_p2=$(grep -c "delegation-message-security" "${PHASE2}" 2>/dev/null || true)
_ref_total=$(( ${_ref_p4:-0} + ${_ref_p2:-0} ))
check_sum_ge \
    "B-AC7: delegation-message-security cross-ref 합산 ≥2 (phase-4=${_ref_p4:-0}, phase-2=${_ref_p2:-0})" \
    "${_ref_total}" \
    2

# B-W1: delegation-message-security.md "3회" = 0건 (재질문 1회 통일)
check_eq \
    "B-W1: delegation-message-security.md '3회' = 0건 (재질문 1회 통일)" \
    "${SECURITY}" \
    "3회" \
    0

# ---------------------------------------------------------------------------
# Group C - plan_SR적용검증 (SR-1/2/3/5 적용 검증)
# (부모 plan: plan_SR적용검증, OQ1=B 채택 — 기존 wrapper에 통합)
# 자동 감지: 인자 없으면 가장 최근 plan/dev spec.md 자동 감지 (OQ2=B)
# SR-4 SKIP: 위임 메시지 휘발성으로 직접 grep 불가, 다음 retro mock 위임 (OQ3=B)
# ---------------------------------------------------------------------------
printf "\n─────────────────────────────────────────────\n"
printf "Group C: SR Application Verification (SR-1/2/3/5)\n"
printf "─────────────────────────────────────────────\n"

# SR 검증 대상 slug 식별 (OQ2=B: 인자 옵션, 기본 자동 감지)
SR_TARGET_SLUG="${1:-}"
if [ -z "$SR_TARGET_SLUG" ]; then
    # shellcheck disable=SC2012  # ls -t needed for mtime sort; filenames are controlled paths
    SR_TARGET_SPEC=$(ls -t .crew/artifacts/design/*-spec.md 2>/dev/null | head -1)
    if [ -n "$SR_TARGET_SPEC" ]; then
        SR_TARGET_SLUG=$(basename "$SR_TARGET_SPEC" -spec.md)
        printf "[INFO] Group C: 인자 미입력 — 자동 감지된 slug: %s\n" "$SR_TARGET_SLUG" >&2
    else
        printf "[WARN] Group C: spec.md 미발견, SR 검증 SKIP\n" >&2
        SR_TARGET_SLUG=""
    fi
fi

if [ -n "$SR_TARGET_SLUG" ]; then
    SR_SPEC_PATH=".crew/artifacts/design/${SR_TARGET_SLUG}-spec.md"
    SR_PRD_PATH=".crew/artifacts/prd/${SR_TARGET_SLUG}-prd.md"
    SR_REVIEW_PATH=".crew/artifacts/review/${SR_TARGET_SLUG}-review.md"

    # spec.md 우선 검증 대상, 없으면 prd.md fallback (OQ2=B)
    SR_INPUT_DOC=""
    [ -f "$SR_SPEC_PATH" ] && SR_INPUT_DOC="$SR_SPEC_PATH"
    [ -z "$SR_INPUT_DOC" ] && [ -f "$SR_PRD_PATH" ] && SR_INPUT_DOC="$SR_PRD_PATH"

    if [ -n "$SR_INPUT_DOC" ]; then
        printf "[Group C] 검증 대상 문서: %s\n" "$SR_INPUT_DOC"
        SR_DOC_BASENAME=$(basename "$SR_INPUT_DOC")
        # SR-1: cross-reference 의무
        check_ge "C-AC1: SR-1 cross-reference (${SR_DOC_BASENAME})" \
            "$SR_INPUT_DOC" "cross-reference\|SSOT" 1
        # SR-2: Glossary 섹션 의무
        check_ge "C-AC2: SR-2 Glossary 섹션 (${SR_DOC_BASENAME})" \
            "$SR_INPUT_DOC" "^## .*\(Glossary\|용어 정의\)" 1
        # SR-3: 분기 합류점 명시 의무
        check_ge "C-AC3: SR-3 분기 합류점 (${SR_DOC_BASENAME})" \
            "$SR_INPUT_DOC" "다음 이동" 1
        # SR-5: 셸 스크립트 추출 의무 (review.md AC grep ≥3 시 verify-{slug}.sh 존재)
        if [ -f "$SR_REVIEW_PATH" ]; then
            AC_GREP_COUNT=$(grep -cE "^.*grep " "$SR_REVIEW_PATH" 2>/dev/null || true)
            if [ "${AC_GREP_COUNT:-0}" -ge 3 ]; then
                TOTAL=$((TOTAL + 1))
                if [ -f "scripts/verify-${SR_TARGET_SLUG}.sh" ]; then
                    PASS_COUNT=$((PASS_COUNT + 1))
                    printf "[PASS] C-AC5: SR-5 셸 스크립트 추출 (verify-%s.sh)\n" "$SR_TARGET_SLUG"
                else
                    FAIL_COUNT=$((FAIL_COUNT + 1))
                    printf "[FAIL] C-AC5: SR-5 셸 스크립트 추출 (verify-%s.sh 미존재)\n" "$SR_TARGET_SLUG"
                fi
            else
                printf "[SKIP] C-AC5: review.md AC grep <3 (실제: %s) — SR-5 미적용, 검증 면제\n" "${AC_GREP_COUNT:-0}"
            fi
        else
            printf "[SKIP] C-AC5: %s 미존재 — SR-5 검증 면제\n" "$SR_REVIEW_PATH"
        fi
    else
        printf "[SKIP] Group C: spec/prd 미발견 (%s) — SR-1/2/3 검증 면제\n" "$SR_TARGET_SLUG"
    fi

    # SR-4 SKIP (OQ3=B 채택)
    printf "[SKIP] C-AC4: SR-4 (위임 메시지 구분자) — 위임 메시지 휘발성, 다음 retro mock 위임 (OQ3=B)\n"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
printf "\n=== Retro Guard Regression Test 결과 ===\n"
printf "PASS  : %d\n" "${PASS_COUNT}"
printf "FAIL  : %d\n" "${FAIL_COUNT}"
printf "SKIP  : 1+ (AC10 — git diff 의존; C-AC4 — SR-4 위임 메시지 휘발성; C-AC5 — review.md 조건부)\n"
printf "TOTAL : %d (+ conditional skips)\n" "${TOTAL}"

if [ "${FAIL_COUNT}" -eq 0 ]; then
    printf "\nAll checks PASSED. exit 0\n"
    exit 0
else
    printf "\n%d check(s) FAILED. exit 1\n" "${FAIL_COUNT}"
    exit 1
fi
