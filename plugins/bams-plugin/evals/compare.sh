#!/usr/bin/env bash
# 두 결과 jsonl 비교: compare.sh <결과A.jsonl> <결과B.jsonl>
# 1) outcome 표: 과제별 평균 점수/시간/비용/spawn/skill/cmdOK(시도 수 n)와 전체 평균·총비용, B-A 차이.
# 2) process 표: 과제별 하네스 과정 지표(process_score·todo·steps·skip·verdict·judge·guard block). score 와 섞지 않는다.
# 무효 행 제외: cmd_resolved == false(커맨드 미인식) 또는 error 가 비어 있지 않은 행. error 가 없거나 null 인 행
#   (regrade-*.jsonl 재채점 행)은 정상 행이다. 평균은 숫자 값만 쓰고 duration_s 음수(중단 기록 오류)는 버린다.
#   제외 수는 excl 열에 A/B 로 표시한다. 과정 지표가 없는 행(이전 결과)은 그 지표 평균에서 빠진다("-").
set -eu
[ $# -eq 2 ] || { echo "usage: compare.sh <A.jsonl> <B.jsonl>" >&2; exit 2; }
for f in "$1" "$2"; do [ -r "$f" ] || { echo "no such file: $f" >&2; exit 2; }; done
# shellcheck disable=SC2016 # jq 프로그램($a·$b 는 jq 변수)
PROG='
  def valid: (.cmd_resolved != false) and (((.error // "") | tostring) == "");
  def avg: if length == 0 then null else (add / length) end;
  def nums(f): map(f | numbers);
  def ratio(f): map(f | booleans) | if length == 0 then null else ((map(select(.)) | length) / length) end;
  def agg(all): (all | map(select(valid))) as $rows | {
      n: ($rows | length), excl: ((all | length) - ($rows | length)),
      score: ($rows | nums(.score) | avg), dur: ($rows | nums(.duration_s) | map(select(. >= 0)) | avg),
      cost: ($rows | nums(.cost_usd) | avg), cost_sum: ($rows | nums(.cost_usd) | add),
      spawn: ($rows | nums(.agent_spawns) | avg), skill: ($rows | nums(.skill_calls) | avg),
      cmd: ($rows | ratio(.cmd_resolved)),
      proc: ($rows | nums(.process_score) | avg), todo: ($rows | ratio(.todo_used)), steps: ($rows | nums(.steps_copied) | avg),
      swr: ($rows | nums(.skips_with_reason) | avg), swo: ($rows | nums(.skips_without_reason) | avg),
      verdict: ($rows | ratio(.verdict_written)), judge: ($rows | ratio(.verdict_judge_spawned)),
      guard: ($rows | nums(.completion_guard_blocks) | avg) };
  def f(x; d): if x == null then "-" else (x * pow(10; d) | round / pow(10; d) | tostring) end;
  def pair(x; y; d): "\(f(x; d))/\(f(y; d))";
  def delta(x; y; d): if x == null or y == null then "-" else ((y - x) * pow(10; d) | round / pow(10; d)) as $v | (if $v > 0 then "+" else "" end) + ($v|tostring) end;
  (($a | map(.task)) + ($b | map(.task)) | unique) as $tasks
  | [($tasks[] as $t | [$t, agg($a | map(select(.task == $t))), agg($b | map(select(.task == $t)))]),
     ["ALL(mean)", agg($a), agg($b)]] as $R
  | if $mode == "outcome" then
      ( ["task","n(A/B)","excl A/B","score A","score B","d.score","dur_s A","dur_s B","d.dur","cost A","cost B","d.cost","spawn A/B","skill A/B","cmdOK A/B"],
        ( $R[] | .[1] as $x | .[2] as $y
          | [.[0], "\($x.n)/\($y.n)", "\($x.excl)/\($y.excl)", f($x.score;3), f($y.score;3), delta($x.score;$y.score;3),
             f($x.dur;0), f($y.dur;0), delta($x.dur;$y.dur;0), f($x.cost;3), f($y.cost;3), delta($x.cost;$y.cost;3),
             pair($x.spawn;$y.spawn;1), pair($x.skill;$y.skill;1), pair($x.cmd;$y.cmd;2)] ),
        ( $R[-1] | ["TOTAL cost", "-", "-", "-", "-", "-", "-", "-", "-", f(.[1].cost_sum;2), f(.[2].cost_sum;2), "-", "-", "-", "-"] )
      ) | @tsv
    else
      ( ["task","n(A/B)","proc A","proc B","d.proc","todo A/B","steps A/B","skip+r A/B","skip-r A/B","verdict A/B","judge A/B","spawn A/B","guardBlk A/B"],
        ( $R[] | .[1] as $x | .[2] as $y
          | [.[0], "\($x.n)/\($y.n)", f($x.proc;3), f($y.proc;3), delta($x.proc;$y.proc;3), pair($x.todo;$y.todo;2),
             pair($x.steps;$y.steps;1), pair($x.swr;$y.swr;1), pair($x.swo;$y.swo;1), pair($x.verdict;$y.verdict;2),
             pair($x.judge;$y.judge;2), pair($x.spawn;$y.spawn;1), pair($x.guard;$y.guard;1)] )
      ) | @tsv
    end'
run() { jq -rn --slurpfile a "$1" --slurpfile b "$2" --arg mode "$3" "$PROG" | column -t -s $'\t'; }
echo "## outcome"
run "$1" "$2" outcome
echo
echo "## process (하네스 과정 — score 와 별도)"
run "$1" "$2" process
echo
echo "A=$(basename "$1")  B=$(basename "$2")   d.* = B - A. excl = 제외한 무효 행(cmd_resolved=false 또는 error). spawn=Agent/Task 호출 평균, skill=Skill 호출 평균, cmdOK=커맨드 인식 비율(bams만)"
echo "score: 0~1 높을수록 좋음, dur/cost 낮을수록 좋음. proc=process_score(todo·verdict·judge·무사유 skip 0 동일 가중), todo/verdict/judge=비율, steps=첫 TodoWrite 항목 수, skip±r=사유 있는/없는 skip 줄 평균, guardBlk=completion-guard block 평균"
