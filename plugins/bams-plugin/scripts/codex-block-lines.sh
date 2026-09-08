#!/usr/bin/env bash
# codex-block-lines.sh — 16 FE/디자인 정의의 codex 위임 블록 줄수 합계 (AC-7b SSOT)
# 경계 규칙: 여는 헤딩 레벨 인식 + 코드 펜스 인식.
#   - 블록 시작 = "codex 추론 위임" 헤딩(^#{2,4}) — 파일당 최대 1개(FE/디자인 16파일).
#   - 블록 종료 = 여는 헤딩과 같거나 상위 레벨(#수 ≤ open_level)의 다음 헤딩, 또는 EOF.
#   - ``` 펜스 내부의 '#' 시작 행은 헤딩으로 계수하지 않음(펜스 토글 추적).
#   - 블록 줄수 = 여는 헤딩 행 ~ 종료 헤딩 직전 행(종료 헤딩 미포함).
# §8.4 리터럴 보존 검증 (블록 보유 파일 각각):
#   (a) "codex 추론 위임" 헤딩 정확히 1개.
#   (b) "codex sandbox:" 줄 정확히 1개.
#   (c) 그 sandbox 값(첫 백틱쌍)이 read-only|workspace-write 중 하나.
#   (d) 블록 줄수 ≤ 9.
#   위반 시 파일명·항목을 출력하고 exit 1. 위반 0이면 exit 0.
# 실행 위치: repo 고정. 캐시 사본 실행 금지 (scripts/는 repo-fixed 운영 도구).
# usage: codex-block-lines.sh [plugin_root]   (기본: 스크립트 상위 = $P)
set -u
P="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
ANCHOR='codex 추론 위임'
TOTAL=0; NFILES=0
VIOL=0; VIOL_MSGS=""
for f in "$P"/agents/*.md; do
  n=$(awk -v anchor="$ANCHOR" '
    BEGIN{ infence=0; inblock=0; openlvl=0; c=0 }
    {
      line=$0
      # 코드 펜스 토글 (``` 또는 ~~~ 로 시작)
      if (line ~ /^[[:space:]]*(```|~~~)/) {
        if (inblock) c++
        infence = !infence
        next
      }
      # 헤딩 판정 (펜스 밖 + ^#+공백)
      is_head=0; lvl=0
      if (!infence && line ~ /^#+[[:space:]]/) {
        is_head=1
        h=line; sub(/[^#].*/,"",h); lvl=length(h)
      }
      if (inblock) {
        # 종료: 여는 헤딩과 같거나 상위 레벨 헤딩
        if (is_head && lvl <= openlvl) {
          inblock=0
          # 종료 헤딩 자체가 새 codex 앵커일 수 있으나 파일당 1블록 가정 — 재시작 안 함
        } else {
          c++
          next
        }
      }
      # 블록 시작 감지
      if (!inblock && is_head && index(line, anchor) > 0) {
        inblock=1; openlvl=lvl; c++; next
      }
    }
    END{ print c }
  ' "$f")
  if [ "${n:-0}" -gt 0 ]; then
    bn="$(basename "$f")"
    printf "%-32s %5d\n" "$bn" "$n"
    TOTAL=$((TOTAL + n)); NFILES=$((NFILES + 1))
    # ── §8.4 리터럴 보존 검증 (블록 보유 파일만) ──
    # (a) 헤딩 정확히 1개 (펜스 밖, ^#{2,4} + anchor)
    hc=$(awk -v anchor="$ANCHOR" '
      BEGIN{ infence=0; c=0 }
      {
        if ($0 ~ /^[[:space:]]*(```|~~~)/) { infence = !infence; next }
        if (!infence && $0 ~ /^#{2,4}[[:space:]]/ && index($0, anchor) > 0) c++
      }
      END{ print c }
    ' "$f")
    if [ "${hc:-0}" -ne 1 ]; then
      VIOL=$((VIOL + 1)); VIOL_MSGS="${VIOL_MSGS}${bn}: HEADING count=${hc} (expected 1)\n"
    fi
    # (b) sandbox 줄 정확히 1개
    sc=$(grep -c 'codex sandbox:' "$f")
    if [ "${sc:-0}" -ne 1 ]; then
      VIOL=$((VIOL + 1)); VIOL_MSGS="${VIOL_MSGS}${bn}: SANDBOX line count=${sc} (expected 1)\n"
    fi
    # (c) sandbox 값(첫 백틱쌍) ∈ {read-only, workspace-write}
    if [ "${sc:-0}" -ge 1 ]; then
      sv=$(grep 'codex sandbox:' "$f" | head -1 | sed -E 's/.*codex sandbox:[^`]*`([^`]*)`.*/\1/')
      case "$sv" in
        read-only|workspace-write) ;;
        *) VIOL=$((VIOL + 1)); VIOL_MSGS="${VIOL_MSGS}${bn}: SANDBOX value=\"${sv}\" (expected read-only|workspace-write)\n" ;;
      esac
    fi
    # (d) 블록 줄수 ≤ 9
    if [ "${n:-0}" -gt 9 ]; then
      VIOL=$((VIOL + 1)); VIOL_MSGS="${VIOL_MSGS}${bn}: BLOCK lines=${n} (>9)\n"
    fi
  fi
done
echo "----"
echo "FILES=$NFILES TOTAL=$TOTAL"
if [ "$VIOL" -gt 0 ]; then
  echo "---- §8.4 VIOLATIONS ($VIOL) ----"
  printf "%b" "$VIOL_MSGS"
  exit 1
fi
exit 0
