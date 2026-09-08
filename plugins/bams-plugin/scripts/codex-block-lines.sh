#!/usr/bin/env bash
# codex-block-lines.sh — 16 FE/디자인 정의의 codex 위임 블록 줄수 합계 (AC-7b SSOT)
# 경계 규칙: 여는 헤딩 레벨 인식 + 코드 펜스 인식.
#   - 블록 시작 = "codex 추론 위임" 헤딩(^#{2,4}) — 파일당 최대 1개(FE/디자인 16파일).
#   - 블록 종료 = 여는 헤딩과 같거나 상위 레벨(#수 ≤ open_level)의 다음 헤딩, 또는 EOF.
#   - ``` 펜스 내부의 '#' 시작 행은 헤딩으로 계수하지 않음(펜스 토글 추적).
#   - 블록 줄수 = 여는 헤딩 행 ~ 종료 헤딩 직전 행(종료 헤딩 미포함).
# 실행 위치: repo 고정. 캐시 사본 실행 금지 (scripts/는 repo-fixed 운영 도구).
# usage: codex-block-lines.sh [plugin_root]   (기본: 스크립트 상위 = $P)
set -u
P="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
ANCHOR='codex 추론 위임'
TOTAL=0; NFILES=0
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
    printf "%-32s %5d\n" "$(basename "$f")" "$n"
    TOTAL=$((TOTAL + n)); NFILES=$((NFILES + 1))
  fi
done
echo "----"
echo "FILES=$NFILES TOTAL=$TOTAL"
