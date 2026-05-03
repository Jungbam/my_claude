#!/usr/bin/env bash
# skill-improvement-hook.sh — 회고에서 도출된 교훈을 에이전트 .md 파일에 기록
#
# 사용법:
#   bash hooks/skill-improvement-hook.sh <agent_type> <lesson_type> <lesson_text>
#
#   agent_type   : 에이전트 이름 (예: frontend-engineering)
#   lesson_type  : keep | problem | try
#   lesson_text  : 교훈 내용 (인용부호 포함하여 전달)
#
# 예시:
#   bash hooks/skill-improvement-hook.sh frontend-engineering keep "병렬 에이전트 실행 시 파일 범위 사전 분리가 효과적"
#
# 동작:
#   1. 에이전트의 .md 파일을 찾는다
#   2. "## 학습된 교훈" 섹션이 없으면 파일 끝에 추가한다
#   3. lesson_type에 맞는 하위 섹션에 날짜 + 교훈을 기록한다
#   4. 하위 섹션당 최대 10개를 유지한다 (오래된 것 제거)
#
# Exit codes: 0 (성공 또는 무시), 1 (인자 오류)
set -uo pipefail

AGENT_TYPE="${1:-}"
LESSON_TYPE="${2:-}"
LESSON_TEXT="${3:-}"

# 인자 검증
if [ -z "$AGENT_TYPE" ] || [ -z "$LESSON_TYPE" ] || [ -z "$LESSON_TEXT" ]; then
  printf 'Usage: %s <agent_type> <lesson_type> <lesson_text>\n' "$0" >&2
  printf '  lesson_type: keep | problem | try\n' >&2
  exit 1
fi

case "$LESSON_TYPE" in
  keep|problem|try) ;;
  *)
    printf 'Error: lesson_type must be keep, problem, or try (got: %s)\n' "$LESSON_TYPE" >&2
    exit 1
    ;;
esac

# Resolve project root
BAMS_ROOT="${BAMS_CREW_DIR:-}"
if [ -z "$BAMS_ROOT" ]; then
  BAMS_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || true
fi
if [ -z "$BAMS_ROOT" ]; then
  BAMS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fi

# 에이전트 .md 파일 탐색 (plugin agents/ 디렉토리 기준)
PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
AGENT_FILE="${PLUGIN_DIR}/agents/${AGENT_TYPE}.md"

if [ ! -f "$AGENT_FILE" ]; then
  printf 'Error: Agent file not found: %s\n' "$AGENT_FILE" >&2
  exit 1
fi

TODAY=$(date -u +%Y-%m-%d)

# lesson_type에 따른 한국어 섹션 제목
case "$LESSON_TYPE" in
  keep)    SECTION_TITLE="### Keep (유지할 것)" ;;
  problem) SECTION_TITLE="### Problem (문제점)" ;;
  try)     SECTION_TITLE="### Try (시도할 것)" ;;
esac

# 새 교훈 항목 (날짜 + 텍스트)
NEW_LESSON="- [${TODAY}] ${LESSON_TEXT}"

# 파일 내용 읽기
FILE_CONTENT=$(cat "$AGENT_FILE")

# "## 학습된 교훈" 섹션 존재 여부 확인
if ! printf '%s' "$FILE_CONTENT" | grep -q '^## 학습된 교훈'; then
  # 섹션이 없으면 파일 끝에 전체 구조 추가
  printf '\n## 학습된 교훈\n\n### Keep (유지할 것)\n\n### Problem (문제점)\n\n### Try (시도할 것)\n' >> "$AGENT_FILE"
fi

# 해당 하위 섹션에 교훈 추가 (awk 사용)
# 전략: 섹션 헤더 다음 줄에 새 항목을 삽입하고, 최대 10개 유지
UPDATED_CONTENT=$(awk -v section="$SECTION_TITLE" -v new_lesson="$NEW_LESSON" '
BEGIN {
  found_section = 0
  inserted = 0
  lesson_count = 0
  in_target_section = 0
  max_lessons = 10
  # 교훈 버퍼 (최신 교훈 우선 유지)
  delete lessons
}
{
  # 목표 섹션 감지
  if ($0 == section) {
    in_target_section = 1
    print $0
    # 새 교훈을 섹션 직후에 삽입
    print new_lesson
    inserted = 1
    lesson_count = 1
    next
  }

  # 목표 섹션 내부: 다른 섹션(### 또는 ##)을 만나면 섹션 종료
  if (in_target_section) {
    if ($0 ~ /^###/ || $0 ~ /^##/) {
      in_target_section = 0
      print $0
      next
    }
    # 빈 줄은 그냥 출력
    if ($0 == "") {
      print $0
      next
    }
    # 교훈 항목(-로 시작)
    if ($0 ~ /^-/) {
      lesson_count++
      # 최대 개수 초과 시 오래된 항목(먼저 나온 것) 건너뜀
      # 이미 new_lesson을 삽입했으므로 max는 max_lessons - 1개
      if (lesson_count <= max_lessons) {
        print $0
      }
      # 초과 항목은 출력하지 않음 (드롭)
      next
    }
    print $0
    next
  }

  print $0
}
' "$AGENT_FILE" 2>/dev/null)

if [ -n "$UPDATED_CONTENT" ]; then
  printf '%s\n' "$UPDATED_CONTENT" > "$AGENT_FILE"
  printf 'Lesson recorded: [%s] %s -> %s\n' "$LESSON_TYPE" "$AGENT_TYPE" "$LESSON_TEXT"
else
  printf 'Warning: awk processing produced empty output, skipping write\n' >&2
fi

exit 0
