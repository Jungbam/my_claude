#!/usr/bin/env bash
# claude 호출 없이 기존 raw(stream-json)에서 리뷰·계획 과제만 "최종 메시지"로 재채점한다 (작업 디렉터리 파일은 없으므로 최종 메시지만 사용).
#   regrade_text.sh results/raw/<dir> [...]   ->  results/regrade-<dir>.jsonl  (stdout에도 출력)
# 필드: task, config, trial, score(재채점), orig_score(기존 results/<dir>.jsonl 의 값), detail, found, false_pos
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
[ $# -ge 1 ] || { echo "usage: regrade_text.sh <results/raw/dir>..." >&2; exit 2; }
for d in "$@"; do
  d="${d%/}"; [ -d "$d" ] || { echo "no such dir: $d" >&2; continue; }
  name="$(basename "$d")"; cfg="${name##*-}"; out="$HERE/results/regrade-$name.jsonl"; : > "$out"
  tmpw="$(mktemp -d "${TMPDIR:-/tmp}/eval-regrade-XXXXXX")"
  for raw in "$d"/*.jsonl; do
    b="$(basename "$raw" .jsonl)"; trial="${b##*-}"; task="${b%-*}"
    [ -f "$HERE/tasks/$task/task.json" ] || continue
    case "$(jq -r .type "$HERE/tasks/$task/task.json")" in review|plan) ;; *) continue;; esac
    ff="$tmpw/$task.final.txt"
    jq -cR 'fromjson? | select(type=="object" and .type=="result") | .result // ""' "$raw" | tail -1 | jq -r . > "$ff" 2>/dev/null
    old="null"; [ -f "$HERE/results/$name.jsonl" ] && old="$(jq -s -c --arg t "$task" --argjson n "$trial" '[.[]|select(.task==$t and .trial==$n)|.score][0] // null' "$HERE/results/$name.jsonl")"
    mkdir -p "$tmpw/empty"
    g="$(EVAL_FINAL_MESSAGE_FILE="$ff" "$HERE/tasks/$task/grade.sh" "$tmpw/empty")"
    jq -nc --argjson g "$g" --arg config "$cfg" --argjson trial "$trial" --argjson old "$old" \
      '{task:$g.task,config:$config,trial:$trial,score:$g.score,orig_score:$old,detail:$g.detail,found:($g.found // $g.met // []),false_pos:($g.false_pos // []),sources:($g.sources // [])}' | tee -a "$out"
  done
  rm -rf "$tmpw"
  echo "# regraded -> $out" >&2
done
