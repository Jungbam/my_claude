#!/usr/bin/env bash
# claude-md-guard.sh — PreToolUse hook: CLAUDE.md 자동 편집 기계적 차단 (TASK-139, G-CLAUDE)
# Edit/Write/NotebookEdit 대상이 CLAUDE.md면 deny. 예외 env 세팅 시 통과.
# Fail-open: 파싱 실패/스크립트 오류 시 exit 0 (정상 편집 blocking 방지).
# Performance target: < 50ms.
set +e

INPUT=$(cat 2>/dev/null)
[ -z "$INPUT" ] && exit 0

# file_path 추출 (jq 우선, 실패 시 grep/sed fallback)
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
if [ -z "$FILE_PATH" ]; then
  FILE_PATH=$(printf '%s' "$INPUT" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*:[[:space:]]*"\(.*\)"/\1/')
fi

# file_path 없으면 판단 불가 → 통과 (fail-open)
[ -z "$FILE_PATH" ] && exit 0

# basename이 CLAUDE.md가 아니면 hook 무관 → 통과
BASE=$(basename "$FILE_PATH" 2>/dev/null)
[ "$BASE" != "CLAUDE.md" ] && exit 0

# 예외 조건: env 세팅 시 통과
[ "${CLAUDE_MD_EDIT_ALLOWED:-}" = "1" ] && exit 0  # E3 사용자 명시 지시
[ "${CLAUDE_MD_STEP3:-}" = "1" ] && exit 0          # E2 completion-protocol Step 3
[ "${CLAUDE_MD_INIT:-}" = "1" ] && exit 0           # E1 init 컨텍스트

# 모든 예외 false → deny
printf '%s\n' '{"decision":"deny","reason":"CLAUDE.md 자동 편집 금지 (G-CLAUDE hook). 상태 기록은 .crew/board.md / .crew/history.md / .crew/artifacts/로. 예외: CLAUDE_MD_EDIT_ALLOWED=1 env 세팅 또는 /bams:init."}'
exit 2
