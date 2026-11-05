#!/usr/bin/env bash
# 코드 과제 채점: grade_code.sh <task_dir> <work_dir>
# - work_dir 사본에 hidden/*.test.ts 를 복사해 bun test 실행 (원본 work_dir은 건드리지 않음)
# - 변조 판정: repo/ 의 기존 테스트 파일에서 원본 줄이 하나라도 삭제·수정되면(추가만이면 허용) score=0, tampered=true
# - 추가 안전망: 원본 테스트 파일을 작업 사본에 복원해 실행, 실패하면 점수 x0.5 (visible_failed)
# stdout: JSON 한 줄 {task,score,passed,total,tampered,detail}
set -u
TASK="$(cd "$1" && pwd)"; WORK="$(cd "$2" && pwd)"; ID="$(basename "$TASK")"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/eval-grade-XXXXXX")"; trap 'rm -rf "$TMP"' EXIT

(cd "$WORK" && tar --exclude=node_modules --exclude=.git -cf - .) | tar -xf - -C "$TMP"

# 1) 기존 테스트 변조 검사
tampered=false; tamper_files=""
while IFS= read -r f; do
  [ -z "$f" ] && continue
  if ! python3 -I "$(dirname "$0")/is_subseq.py" "$TASK/repo/$f" "$WORK/$f"; then tampered=true; tamper_files="$tamper_files $f"; fi
done < <(cd "$TASK/repo" && find . -name '*.test.ts' -not -path './node_modules/*' | sed 's|^\./||' | sort)

# 1b) 원본 테스트 복원 후 실행 (에이전트가 테스트를 무력화했더라도 원본 기준 회귀를 잡는다)
vfail=0; vfiles=()
while IFS= read -r f; do
  [ -z "$f" ] && continue
  mkdir -p "$TMP/$(dirname "$f")"; cp "$TASK/repo/$f" "$TMP/$f"; vfiles+=("./$f")
done < <(cd "$TASK/repo" && find . -name '*.test.ts' -not -path './node_modules/*' | sed 's|^\./||' | sort)
if [ "${#vfiles[@]}" -gt 0 ]; then
  vout="$(cd "$TMP" && perl -e 'alarm 120; exec @ARGV' bun test "${vfiles[@]}" 2>&1)"; vrc=$?
  [ "$vrc" -ne 0 ] && vfail=1
fi

# 2) 숨김 테스트 실행
mkdir -p "$TMP/__hidden__"
cp "$TASK"/hidden/*.test.ts "$TMP/__hidden__/"
total=$(cat "$TASK"/hidden/*.test.ts | grep -cE '^\s*(test|it)\(')
out="$(cd "$TMP" && perl -e 'alarm 120; exec @ARGV' bun test ./__hidden__ 2>&1)"
passed=$(printf '%s\n' "$out" | sed -nE 's/^[[:space:]]*([0-9]+) pass.*/\1/p' | tail -1)
passed=${passed:-0}
[ "$total" -gt 0 ] || total=1
[ "$passed" -gt "$total" ] && passed=$total
# 'regress:' 접두 테스트는 회귀 가드: 점수 분모에서 제외하고, 하나라도 실패하면 점수 x0.5
guards=$(cat "$TASK"/hidden/*.test.ts | grep -cE "^\s*(test|it)\((\"|'|\`)regress:")
gfail=$(printf '%s\n' "$out" | grep -cE '^\(fail\) regress:')
[ "$gfail" -gt "$guards" ] && gfail=$guards
f2p_total=$((total - guards)); f2p_pass=$((passed - (guards - gfail)))
[ "$f2p_pass" -lt 0 ] && f2p_pass=0
if [ "$f2p_total" -gt 0 ]; then
  score=$(awk -v p="$f2p_pass" -v t="$f2p_total" -v g="$gfail" 'BEGIN{s=p/t; if(g>0)s*=0.5; printf "%.4f", s}')
else score="1.0000"; fi
detail="hidden pass ${f2p_pass}/${f2p_total}; guards failed ${gfail}/${guards}"
if [ "$vfail" = 1 ]; then score=$(awk -v s="$score" 'BEGIN{printf "%.4f", s*0.5}'); detail="visible_failed(x0.5); $detail"; fi
if [ "$tampered" = true ]; then score="0.0000"; detail="TAMPERED:${tamper_files}; $detail"; fi

jq -nc --arg task "$ID" --argjson score "$score" --argjson passed "$passed" --argjson total "$total" \
  --argjson tampered "$tampered" --arg detail "$detail" \
  '{task:$task,score:$score,passed:$passed,total:$total,tampered:$tampered,detail:$detail}'
