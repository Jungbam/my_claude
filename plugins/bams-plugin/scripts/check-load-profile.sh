#!/usr/bin/env bash
# check-load-profile.sh — AC-16a(발행 누락 0, 전체경로 comm) + AC-16b(호출 지점당 발행, 블록경계 파서)
# usage:
#   check-load-profile.sh [FILE...]      # 파일 목록 지정 시 그 집합만 검사
#   check-load-profile.sh                # 무인자 → commands/bams 전체(subagent_type 보유 .md)
#   check-load-profile.sh --enum [FILE...]  # AC-16d 보조: doc: 값이 enum 8종 부분집합인지 검사
# 출력: AC-16a missing_files / AC-16b total_none·bad_rows. 둘 중 ≠0이면 exit 1.
# 실행 위치: repo 고정. 캐시 사본(~/.claude/plugins/cache/...) 실행 금지 —
#           scripts/는 repo-fixed 운영 도구이며 런타임 미로드(design-infra §2-3).
# 근거: design-infra §3-3 블록경계 validator 승격 · spec §3-2 AC-16a/b · §8-보강 AC-16d.
# same-line marker 정책(rev1 Major 1 fix): 앵커 줄(subagent_type)에 load_profile: 값 또는
#   :exempt 마커가 같은 줄에 병기된 경우도 검사 대상에 포함(next 전 계수). 같은 줄 형식은
#   허용하며 값/마커 1개로 계수(profile 또는 exempt 1). 앵커 이후 줄의 마커와 동일 취급.
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
P="$(dirname "$SCRIPT_DIR")"          # plugin root (scripts/ 의 부모)
CMD_DIR="$P/commands/bams"

# 부서장(load_profile 도메인 spawn) 8종 — design-infra §3-2/§3-3 LEADS 리터럴 승격.
# (org-chart 7 부서장 + hr-agent: 후자도 도메인 위성 문서를 로드하므로 블록 계수 대상)
LEADS='product-strategy|frontend-engineering|backend-engineering|platform-devops|design-director|qa-strategy|product-analytics|hr-agent'
# AC-16d enum 8종 (spec §8-보강 R-5b)
ENUM='config gotchas stack-profile best-practices agent-rules design-artifact-layout design-artifact-templates codex-delegation'

# ---- 옵션 파싱 (DQ-3 방어: '-'로 시작하는 리터럴은 slug/파일 위치인자로 거절) ----
ENUM_MODE=0
FILES=()
for arg in "$@"; do
  case "$arg" in
    --enum) ENUM_MODE=1 ;;
    -*)     echo "ERROR: 알 수 없는 옵션/거절된 리터럴: '$arg'" >&2; exit 2 ;;
    *)      FILES+=("$arg") ;;
  esac
done

# 무인자(파일 미지정) → commands/bams 전체 subagent_type 보유 .md 전체 경로
if [ "${#FILES[@]}" -eq 0 ]; then
  while IFS= read -r line; do FILES+=("$line"); done \
    < <(grep -rlE "subagent_type" --include='*.md' "$CMD_DIR" | sort)
fi
[ "${#FILES[@]}" -eq 0 ] && { echo "ERROR: 대상 파일 0 (commands/bams 부재?)" >&2; exit 2; }

RC=0

# ============ AC-16d 보조 (enum 부분집합 검사) ============
if [ "$ENUM_MODE" -eq 1 ]; then
  USED=$(grep -rhoE "doc:[[:space:]]*[a-z-]+" "${FILES[@]}" 2>/dev/null \
          | sed -E 's/doc:[[:space:]]*//' | sort -u)
  ENUM_SORTED=$(printf '%s\n' $ENUM | sort -u)
  OFFENDERS=$(comm -23 <(printf '%s\n' "$USED" | grep -v '^$') <(printf '%s\n' "$ENUM_SORTED"))
  N_OFF=$(printf '%s\n' "$OFFENDERS" | grep -c .)
  echo "==== AC-16d enum 부분집합 검사 ===="
  echo "used doc: 값 = $(printf '%s' "$USED" | tr '\n' ' ' | sed 's/ $//')"
  echo "enum 외(offenders) = $N_OFF"
  [ "$N_OFF" -gt 0 ] && { printf '%s\n' "$OFFENDERS" | sed 's/^/  offender: /'; RC=1; }
  echo "---- AC-16d offenders=$N_OFF (기대 0) ----"
  exit "$RC"
fi

# ============ AC-16a — 발행 누락 0 (전체 경로 comm) ============
# 인자 파일 집합 자체를 분모로 comm (basename 축약 금지 — 전체 경로)
HAVE_SPAWN=$(printf '%s\n' "${FILES[@]}" | sort -u)
HAVE_LP=$(grep -rlE "load_profile" --include='*.md' "${FILES[@]}" 2>/dev/null | sort -u)
MISSING=$(comm -23 <(printf '%s\n' "$HAVE_SPAWN") <(printf '%s\n' "$HAVE_LP" | grep -v '^$'))
N_MISS=$(printf '%s\n' "$MISSING" | grep -c .)
echo "==== AC-16a 발행 누락 (전체경로 comm) ===="
echo "분모(subagent_type 파일)=${#FILES[@]} / load_profile 보유=$(printf '%s\n' "$HAVE_LP" | grep -c .)"
echo "---- AC-16a missing_files=$N_MISS (기대 0) ----"
[ "$N_MISS" -gt 0 ] && RC=1

# ============ AC-16b — 호출 지점당 발행 (블록경계 파서, 리드 블록만) ============
echo "==== AC-16b 블록경계 파서 (리드 spawn 블록) ===="
TOTAL_NONE=0; ROWS_BAD=0
for f in "${FILES[@]}"; do
  read -r sp pr ex no < <(awk -v L="$LEADS" '
    function flush(){ if(inb){ sp++; if(hasP)pr++; else if(hasE)ex++; else no++ } }
    /subagent_type/ && /bams-plugin:/ {
      if($0 ~ ("bams-plugin:(" L ")")){ flush(); inb=1; hasP=0; hasE=0;
        if($0 ~ /load_profile:exempt/) hasE=1; else if($0 ~ /load_profile:/) hasP=1;  # same-line marker(앵커 줄 병기) 계수
        next }
      else { flush(); inb=0; next } }
    { if(inb){ if($0 ~ /load_profile:exempt/) hasE=1; else if($0 ~ /load_profile:/) hasP=1 } }
    END{ flush(); printf "%d %d %d %d\n", sp+0, pr+0, ex+0, no+0 }' "$f")
  [ "${sp:-0}" -eq 0 ] && continue
  ok=$(( pr + ex == sp ? 1 : 0 ))
  printf "%-42s spawn=%s profile=%s exempt=%s none=%s  %s\n" \
    "${f#$CMD_DIR/}" "$sp" "$pr" "$ex" "$no" "$([ "$ok" -eq 1 ] && echo PASS || echo FAIL)"
  TOTAL_NONE=$((TOTAL_NONE+no)); [ "$ok" -eq 0 ] && ROWS_BAD=$((ROWS_BAD+1))
done
echo "---- AC-16b total_none=$TOTAL_NONE (기대 0) / bad_rows=$ROWS_BAD (기대 0) ----"
{ [ "$TOTAL_NONE" -ne 0 ] || [ "$ROWS_BAD" -ne 0 ]; } && RC=1

echo "==== 종합 exit=$RC (AC-16a missing=$N_MISS · AC-16b none=$TOTAL_NONE bad=$ROWS_BAD) ===="
exit "$RC"
