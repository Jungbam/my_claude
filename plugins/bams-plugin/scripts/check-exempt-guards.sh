#!/usr/bin/env bash
# check-exempt-guards.sh — exempt 마커 우회 차단 가드 (a)(b)(c)(d) — design-infra §3-4 승격.
# usage: check-exempt-guards.sh          # commands/bams 전체 스캔
#        check-exempt-guards.sh [FILE...]
# 가드:
#   (a) inherits 마커의 대상 §명('위임 원칙')이 _shared_common.md 에 실재
#   (b) exempt 마커 보유 파일은 load-profile-exempt.txt(allowlist) 등재 파일에만 허용
#   (c) _shared_common.md 에 기본 load_profile(L2 fallback) 정의 실재 (inherits 마커 존재 시 강제)
#   (d) [판정 단위=블록] 각 non-department-lead 마커가 속한 spawn 블록(직전 subagent_type
#       앵커 ~ 다음 앵커)의 subagent_type 이 부서장 7인이면 FAIL. 파일 단위 은폐 판정 폐기.
#       (b2 화이트리스트 init.md 예외 / '{dept}' 등 플레이스홀더 앵커는 DYNAMIC WARN, FAIL 아님)
# 판정: 위반 1건이라도 있으면 exit 1. (마커 미존재 시 해당 가드 N/A → PASS)
# 실행 위치: repo 고정(캐시 사본 실행 금지) — scripts/는 repo-fixed 운영 도구(design-infra §2-3).
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
P="$(dirname "$SCRIPT_DIR")"
CMD_DIR="$P/commands/bams"
SHARED="$CMD_DIR/_shared_common.md"
ALLOWLIST="$CMD_DIR/load-profile-exempt.txt"
B2WL="$CMD_DIR/load-profile-b2-whitelist.txt"

INHERIT_SEC='위임 원칙'   # inherits 마커가 상속하는 _shared_common 절명
LEADS7='product-strategy|frontend-engineering|backend-engineering|platform-devops|design-director|qa-strategy|product-analytics'

# 대상 파일
FILES=("$@")
if [ "${#FILES[@]}" -eq 0 ]; then
  while IFS= read -r line; do FILES+=("$line"); done \
    < <(grep -rlE "subagent_type" --include='*.md' "$CMD_DIR" | sort)
fi

# allowlist / b2 화이트리스트 로드 (주석·공백 제거, 상대경로)
load_list(){ [ -f "$1" ] && sed -E 's/#.*$//' "$1" | sed -E 's/[[:space:]]+$//' | grep -v '^[[:space:]]*$'; }
ALLOW="$(load_list "$ALLOWLIST")"
B2LIST="$(load_list "$B2WL")"

RC=0
INHERIT_MARKERS=0

for f in "${FILES[@]}"; do
  rel="${f#$CMD_DIR/}"
  # grep -c 는 0매치 시 "0"을 stdout에 찍고 exit 1 → '|| true'로 상태만 흡수(이중 출력 방지)
  has_inherit=$(grep -c 'load_profile:exempt inherits' "$f" 2>/dev/null || true); has_inherit=${has_inherit:-0}
  has_nonlead=$(grep -c 'load_profile:exempt non-department-lead' "$f" 2>/dev/null || true); has_nonlead=${has_nonlead:-0}
  has_any=$(grep -c 'load_profile:exempt' "$f" 2>/dev/null || true); has_any=${has_any:-0}

  # ---- (b) allowlist 대조: exempt 마커 보유 파일은 반드시 allowlist 등재 ----
  if [ "$has_any" -gt 0 ]; then
    if printf '%s\n' "$ALLOW" | grep -Fxq "$rel"; then :; else
      echo "GUARD-b FAIL: $rel — exempt 마커 보유하나 allowlist(load-profile-exempt.txt) 미등재"
      RC=1
    fi
  fi

  # ---- (a) inherits §명 실재 ----
  if [ "$has_inherit" -gt 0 ]; then
    INHERIT_MARKERS=$((INHERIT_MARKERS+has_inherit))
    # 마커에서 § 뒤 절명 추출
    secs=$(grep -oE 'inherits _shared_common §[^ ]+([^-]*)' "$f" | sed -E 's/.*§//; s/ *-->.*//; s/[[:space:]]+$//')
    while IFS= read -r sec; do
      [ -z "$sec" ] && continue
      if grep -qF "$sec" "$SHARED" 2>/dev/null; then :; else
        echo "GUARD-a FAIL: $rel — inherits 대상 §'$sec' 이 _shared_common.md 에 부재"
        RC=1
      fi
    done <<< "$secs"
  fi

  # ---- (d) non-department-lead 마커 검증 (블록 단위) ----
  # allowlist 등재는 (b)에서 처리. 여기선 각 마커가 속한 spawn 블록의 앵커가 부서장인지 대조.
  # awk: 파일을 위→아래로 훑으며 최근 subagent_type 앵커의 agent 명을 cur 에 유지하고,
  #      non-lead 마커를 만나면 cur 을 판정(LEAD/DYN/NOANCHOR/OK)한다.
  if [ "$has_nonlead" -gt 0 ]; then
    while IFS="$(printf '\t')" read -r verdict agent; do
      [ -z "$verdict" ] && continue
      case "$verdict" in
        LEAD)
          if printf '%s\n' "$B2LIST" | grep -Fxq "$rel"; then
            echo "GUARD-d N/A: $rel — non-department-lead 마커가 부서장 spawn(bams-plugin:$agent) 블록에 부착되나 b2 화이트리스트(init-time) 예외"
          else
            echo "GUARD-d FAIL: $rel — non-department-lead 마커가 부서장 7인 spawn(bams-plugin:$agent) 블록에 부착됨"
            RC=1
          fi ;;
        DYN)
          echo "GUARD-d WARN: $rel — 플레이스홀더 앵커(bams-plugin:$agent) → DYNAMIC(inherits 권장)" ;;
        NOANCHOR)
          echo "GUARD-d WARN: $rel — non-department-lead 마커의 선행 subagent_type 앵커 부재" ;;
        *) : ;;  # OK: 비-부서장 앵커 블록 → 정상
      esac
    done < <(awk -v leads="$LEADS7" '
      function agentname(line,   s) {
        if (match(line, /bams-plugin:[^"`*[:space:]]+/)) {
          s=substr(line,RSTART,RLENGTH); sub(/^bams-plugin:/,"",s); return s
        }
        return ""
      }
      BEGIN { n=split(leads,L,"|"); for(i=1;i<=n;i++) isLead[L[i]]=1 }
      /subagent_type/ && /bams-plugin:/ { a=agentname($0); if(a!="") cur=a }
      /load_profile:exempt non-department-lead/ {
        if (cur=="")            { print "NOANCHOR\t"; next }
        if (index(cur,"{")>0)   { print "DYN\t" cur;  next }
        if (cur in isLead)      { print "LEAD\t" cur; next }
        print "OK\t" cur
      }
    ' "$f")
  fi
done

# ---- (c) SSOT 기본 정의 실재 (inherits 마커가 하나라도 존재할 때만 강제) ----
if [ "$INHERIT_MARKERS" -gt 0 ]; then
  # _shared_common.md 의 §위임 원칙 이후에 기본 load_profile 정의(L2 fallback) 실재 확인
  if grep -qE 'load_profile' "$SHARED" 2>/dev/null && grep -qF "$INHERIT_SEC" "$SHARED" 2>/dev/null; then
    echo "GUARD-c OK: _shared_common.md §$INHERIT_SEC 에 기본 load_profile 정의 실재"
  else
    echo "GUARD-c FAIL: _shared_common.md 에 기본 load_profile(L2 fallback) 정의 부재 — exempt 상속 무효"
    RC=1
  fi
else
  echo "GUARD-c N/A: inherits exempt 마커 0건 → SSOT 기본 정의 강제 미적용"
fi

echo "---- exempt-guards: inherit_markers=$INHERIT_MARKERS · $([ "$RC" -eq 0 ] && echo PASS || echo FAIL) (exit $RC) ----"
exit "$RC"
