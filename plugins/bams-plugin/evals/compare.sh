#!/usr/bin/env bash
# 두 결과 jsonl 비교: compare.sh <결과A.jsonl> <결과B.jsonl>
# 과제별 평균 점수/시간/비용/토큰(시도 수 n)과 전체 합계, B-A 차이를 표로 출력.
set -eu
[ $# -eq 2 ] || { echo "usage: compare.sh <A.jsonl> <B.jsonl>" >&2; exit 2; }
jq -rn --slurpfile a "$1" --slurpfile b "$2" --arg la "$(basename "$1" .jsonl)" --arg lb "$(basename "$2" .jsonl)" '
  def avg: if length == 0 then null else (add / length) end;
  def agg(rows): { n: (rows|length), score: (rows|map(.score)|avg), dur: (rows|map(.duration_s)|avg),
                   cost: (rows|map(.cost_usd)|avg), tok: (rows|map(.tokens)|avg), err: (rows|map(select(.error != ""))|length) };
  def f(x; d): if x == null then "-" else (x * pow(10; d) | round / pow(10; d) | tostring) end;
  def delta(x; y; d): if x == null or y == null then "-" else ((y - x) * pow(10; d) | round / pow(10; d)) as $v | (if $v > 0 then "+" else "" end) + ($v|tostring) end;
  ($a | map(.task)) + ($b | map(.task)) | unique as $tasks
  | ( ["task","n(A/B)","score A","score B","d.score","dur_s A","dur_s B","d.dur","cost A","cost B","d.cost","errs A/B"],
      ( $tasks[] as $t
        | agg($a|map(select(.task == $t))) as $x | agg($b|map(select(.task == $t))) as $y
        | [$t, "\($x.n)/\($y.n)", f($x.score;3), f($y.score;3), delta($x.score;$y.score;3),
           f($x.dur;0), f($y.dur;0), delta($x.dur;$y.dur;0), f($x.cost;3), f($y.cost;3), delta($x.cost;$y.cost;3),
           "\($x.err)/\($y.err)"] ),
      ( agg($a) as $x | agg($b) as $y
        | ["ALL(mean)", "\($x.n)/\($y.n)", f($x.score;3), f($y.score;3), delta($x.score;$y.score;3),
           f($x.dur;0), f($y.dur;0), delta($x.dur;$y.dur;0), f($x.cost;3), f($y.cost;3), delta($x.cost;$y.cost;3),
           "\($x.err)/\($y.err)"] ),
      ( ["TOTAL cost", "-", "-", "-", "-", "-", "-", "-", f($a|map(.cost_usd)|add;2), f($b|map(.cost_usd)|add;2), "-", "-"] )
    ) | @tsv' | column -t -s $'\t'
echo "A=$(basename "$1")  B=$(basename "$2")   (d.* = B - A; score: 0~1 높을수록 좋음, dur/cost 낮을수록 좋음)"
