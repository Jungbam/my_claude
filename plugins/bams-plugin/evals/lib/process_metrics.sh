#!/usr/bin/env bash
# process_metrics.sh <raw stream-json> [work dir] — 하네스 "과정" 지표 1줄 JSON (outcome score 와 별도).
#   todo_used              메인 세션(parent_tool_use_id 없음)이 TodoWrite/TaskCreate/TaskUpdate 를 호출했는가
#   steps_copied           첫 TodoWrite 의 todos 개수(TodoWrite 없으면 TaskCreate 호출 수) — `## Steps` 복사 규모
#   skips_with_reason      마지막 TodoWrite 항목 + TaskCreate/TaskUpdate 의 subject·description·activeForm + 최종 메시지 줄 중
#                          "skip: <사유>"(사유 2글자 이상) 줄 수
#                          (앞 목록 기호·체크박스를 지운 같은 줄은 1회)
#   skips_without_reason   "skip:" 뒤가 비었거나 1글자인 줄 수. Steps 원문 자리표시자 "skip: <사유>" 는 어느 쪽도 아님
#   verdict_written        <work>/.crew/artifacts/review/verdict-*.json 존재(work dir 없으면 null — 재채점 등)
#   verdict_judge_spawned  Agent/Task 호출 중 subagent_type 에 release-quality-gate 포함
#   agent_spawns           Agent/Task 호출 수(tool_use id 중복 제거, run.sh 의 기존 정의와 같음)
#   completion_guard_blocks Stop hook(pipeline-completion-guard) block 횟수 — --include-hook-events 의 hook_response
#                          ({"type":"system","subtype":"hook_response","hook_event":"Stop","stdout"|"output":"{\"decision\":\"block\",…}"})
#                          의 stdout/output 을 JSON 으로 읽어 decision=="block" 이고 reason 에 completion-guard(JSON 이 아니면 문자열
#                          "decision":"block" + completion-guard), 또는 주입된 "[bams completion-guard]" 피드백 메시지 중 큰 값
#   process_score          (todo_used, verdict_written, verdict_judge_spawned, 무사유 skip 없음) 동일 가중 평균.
#                          "무사유 skip 없음" = todo_used 이고 skips_without_reason==0 (체크리스트가 없으면 0 — 빈 실행이 점수를 받지 않게).
#                          verdict_written=null 이면 나머지 3개 평균. score(결과)와 섞지 않는다.
# 파싱 실패 시 모든 값 null 인 객체를 출력하고 exit 0.
set -u
RAW="${1:-}"; WORK="${2:-}"
NULLOBJ='{"todo_used":null,"steps_copied":null,"skips_with_reason":null,"skips_without_reason":null,"verdict_written":null,"verdict_judge_spawned":null,"agent_spawns":null,"completion_guard_blocks":null,"process_score":null}'
if [ -z "$RAW" ] || [ ! -r "$RAW" ] || ! command -v jq >/dev/null 2>&1; then echo "$NULLOBJ"; exit 0; fi
VW=null
if [ -n "$WORK" ] && [ -d "$WORK" ]; then
  VW=false
  for f in "$WORK"/.crew/artifacts/review/verdict-*.json; do [ -f "$f" ] && { VW=true; break; }; done
fi
out=$(jq -cR 'fromjson? | select(type == "object")' "$RAW" 2>/dev/null | jq -s -c --argjson vw "$VW" '
  def main: (.parent_tool_use_id // null) == null;
  def skipre: "(^|[^A-Za-z])skip\\s*:";
  def reason_ok: test("(^|[^A-Za-z])skip\\s*:\\s*(?!<)\\S\\S"; "i");
  def placeholder: test("(^|[^A-Za-z])skip\\s*:\\s*<"; "i");
  ([.[] | select(.type == "assistant") | . as $m | .message.content[]? | select(type == "object" and .type == "tool_use")
     | . + {main: ($m | main)}] | unique_by(.id)) as $u
  | [$u[] | select(.main and (.name == "TodoWrite" or .name == "TaskCreate" or .name == "TaskUpdate"))] as $todo
  | [$todo[] | select(.name == "TodoWrite")] as $tw
  | ([.[] | select(.type == "result")] | last // {} | (.result // "") | tostring) as $final
  | ([$todo[] | select(.name == "TaskCreate" or .name == "TaskUpdate") | .input | (.subject // ""), (.description // ""), (.activeForm // "")
      | tostring | splits("\\r?\\n")]) as $tasklines
  | (([$tw | last // empty | .input.todos[]? | (.content // ""), (.activeForm // "") | tostring]
      + $tasklines + [$final | splits("\\r?\\n")]) | map(select(test(skipre; "i")) | gsub("^[\\s>*-]+(\\[[ xX]\\]\\s*)?|\\s+$"; "")) | unique) as $sk
  | ($sk | map(select(reason_ok)) | length) as $swr
  | ($sk | map(select((reason_ok | not) and (placeholder | not))) | length) as $swo
  | ([$u[] | select((.name == "Agent" or .name == "Task") and ((.input.subagent_type // "") | tostring | test("release-quality-gate")))] | length > 0) as $judge
  | ([.[] | select(.type == "system" and ((.subtype // "") | tostring | test("hook_response|hook_result"; "i")))
       | select(((.hook_event // .hook_event_name // .event // "") | tostring) == "Stop")
       | select([(.stdout // empty), (.output // empty)] | map(tostring) | any(
           (fromjson? // null) as $j
           | if ($j | type) == "object" then ($j.decision == "block" and (($j.reason // "") | tostring | test("completion-guard")))
             else (test("\"decision\"\\s*:\\s*\"block\"") and test("completion-guard")) end))
       | (.hook_id // .uuid // tostring)] | unique | length) as $hb
  | ([.[] | select(.type == "user") | .message.content
       | if type == "array" then (map(.text? // (.content? | if type == "string" then . else "" end) // "") | join("\n")) else tostring end
       | select(test("\\[bams completion-guard\\]"))] | length) as $ub
  | ($todo | length > 0) as $tu
  | ([$tu, $vw, $judge, ($tu and $swo == 0)] | map(select(. != null)) | map(if . then 1 else 0 end)) as $parts
  | {todo_used: $tu,
     steps_copied: (if ($tw | length) > 0 then ($tw[0].input.todos // [] | length) else ([$todo[] | select(.name == "TaskCreate")] | length) end),
     skips_with_reason: $swr, skips_without_reason: $swo, verdict_written: $vw, verdict_judge_spawned: $judge,
     agent_spawns: ([$u[] | select(.name == "Agent" or .name == "Task")] | length),
     completion_guard_blocks: ([$hb, $ub] | max),
     process_score: (($parts | add) / ($parts | length) * 10000 | round / 10000)}' 2>/dev/null)
if [ -n "$out" ] && printf '%s' "$out" | jq -e 'type == "object"' >/dev/null 2>&1; then echo "$out"; else echo "$NULLOBJ"; fi
exit 0
