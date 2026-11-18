#!/usr/bin/env bash
# eval 자체 검증 (claude 호출 없음, 무료): 과제별 grade.sh 가 정답 적용본=1.0, 원본<=0.5(보통 0 근처), 테스트 변조=0 을 내는지,
# 과제 구조가 규칙에 맞는지, 러너 --dry-run 이 두 구성 모두 통과하는지 확인한다. 실패 시 exit 1.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; fail=0
TMP="$(mktemp -d "${TMPDIR:-/tmp}/eval-validate-XXXXXX")"; trap 'rm -rf "$TMP"' EXIT
printf '%-26s %-18s %8s %8s %8s %8s %8s %6s %6s %6s  %s\n' task type original solution +test editAssert delTest msgOnly newMd junk structure
for tdir in "$HERE"/tasks/*/; do
  t="$(basename "$tdir")"; type=$(jq -r .type "$tdir/task.json")
  # 구조
  st=ok
  for f in prompt.md task.json grade.sh; do [ -e "$tdir/$f" ] || st="missing:$f"; done
  [ -d "$tdir/hidden" ] && [ -d "$tdir/solution" ] && [ -d "$tdir/repo" ] || st="missing-dir"
  jq -e '.command|test("^/bams:")' "$tdir/task.json" >/dev/null || st="bad-command"
  head -c1 "$tdir/prompt.md" | grep -q '/' && st="prompt-starts-with-slash"
  n=$(cd "$tdir/repo" && find . -type f -not -name package.json -not -path './node_modules/*' | wc -l | tr -d ' ')
  { [ "$n" -ge 3 ] && [ "$n" -le 8 ]; } || st="repo-files=$n(want 3-8)"
  [ -n "$(find "$tdir/repo" -iname '*hidden*' -o -iname '*solution*' | head -1)" ] && st="leak-in-repo"
  # 원본
  rm -rf "$TMP/w"; mkdir -p "$TMP/w"; cp -R "$tdir/repo/." "$TMP/w/"
  orig=$("$tdir/grade.sh" "$TMP/w" | jq -r .score)
  # 정답 적용본
  cp -R "$tdir/solution/." "$TMP/w/"
  sol=$("$tdir/grade.sh" "$TMP/w" | jq -r .score)
  # 변조 판정(코드 과제만): 정답 적용본 위에서 (a) 기존 테스트 파일에 테스트 '추가'만 -> 1.0 유지, (b) 기존 assert 수정 -> 0, (c) 기존 테스트 삭제 -> 0
  tam="n/a"; add="n/a"; del="n/a"
  tf=$(cd "$tdir/repo" && find . -name '*.test.ts' | head -1)
  if [ "${type%%-*}" != review ] && [ "$type" != plan ] && [ -n "$tf" ]; then
    cp "$TMP/w/$tf" "$TMP/orig.test.ts"
    printf '\ntest("extra added by agent", () => { expect(1).toBe(1); });\n' >> "$TMP/w/$tf"
    add=$("$tdir/grade.sh" "$TMP/w" | jq -r .score)
    cp "$tdir/repo/$tf" "$TMP/w/$tf"
    perl -i -pe 'if(!$d && /\.(toBe|toEqual)\(/){s/\.(toBe|toEqual)\(/.$1(null ?? /; $d=1}' "$TMP/w/$tf"
    tam=$("$tdir/grade.sh" "$TMP/w" | jq -r .score)
    cp "$tdir/repo/$tf" "$TMP/w/$tf"; sed -i '' -e '/^test(/,/^});/d' "$TMP/w/$tf"
    del=$("$tdir/grade.sh" "$TMP/w" | jq -r .score)
  fi
  # 리뷰/계획: 입력 경로 다양성 - (a) 최종 메시지만, (b) 엉뚱한 위치의 새 .md, (c) 무관한 장문 텍스트(<=0.3)
  fm="n/a"; nm="n/a"; junk="n/a"
  if [ "${type%%-*}" = review ] || [ "$type" = plan ]; then
    sf=$(ls "$tdir"/solution/*.md | head -1)
    rm -rf "$TMP/e" "$TMP/n"; mkdir -p "$TMP/e" "$TMP/n/docs"
    fm=$(EVAL_FINAL_MESSAGE_FILE="$sf" "$tdir/grade.sh" "$TMP/e" | jq -r .score)
    cp "$sf" "$TMP/n/docs/my-notes.md"; nm=$("$tdir/grade.sh" "$TMP/n" | jq -r .score)
    yes 'We will build the feature and the goal is good, first design then implement then test and ship it.' | head -30 > "$TMP/junk.txt"
    junk=$(EVAL_FINAL_MESSAGE_FILE="$TMP/junk.txt" "$tdir/grade.sh" "$TMP/e" | jq -r .score)
  fi
  ok=1
  if [ "$fm" != n/a ]; then
    awk -v a="$fm" -v b="$nm" -v j="$junk" 'BEGIN{exit !(a>=0.9999 && b>=0.9999 && j<=0.3)}' || ok=0
  fi
  awk -v s="$sol" 'BEGIN{exit !(s>=0.9999)}' || ok=0
  awk -v o="$orig" 'BEGIN{exit !(o<=0.5)}' || ok=0
  { [ "$tam" = "n/a" ] || { [ "$tam" = "0.0000" ] && [ "$del" = "0.0000" ] && [ "$add" = "1.0000" ]; }; } || ok=0
  [ "$st" = ok ] || ok=0
  [ "$ok" = 1 ] || fail=1
  printf '%-26s %-18s %8s %8s %8s %8s %8s %6s %6s %6s  %s %s\n' "$t" "$type" "$orig" "$sol" "$add" "$tam" "$del" "$fm" "$nm" "$junk" "$st" "$([ $ok = 1 ] && echo PASS || echo FAIL)"
done
for c in bams single; do
  if "$HERE/run.sh" --config $c --task all --dry-run >"$TMP/dry-$c.txt" 2>&1; then
    echo "dry-run $c: OK ($(grep -c '^---' "$TMP/dry-$c.txt") tasks)"
  else echo "dry-run $c: FAIL"; fail=1; fi
done
grep -q -- "--plugin-dir" "$TMP/dry-bams.txt" && ! grep -q -- "--plugin-dir" "$TMP/dry-single.txt" && grep -q 'enabledPlugins' "$TMP/dry-single.txt" \
  && echo "config diff: OK (bams=--plugin-dir, single=enabledPlugins false, no plugin-dir)" || { echo "config diff: FAIL"; fail=1; }
# config.md 중립성: 과제 제약 문구가 .crew/config.md 에 들어가지 않았는지
cfg=$(sed -n '/^write_crew_config()/,/^}/p' "$HERE/run.sh")
if printf '%s' "$cfg" | grep -qE '수정하지|금지|의존성'; then echo "config.md neutrality: FAIL"; fail=1; else echo "config.md neutrality: OK"; fi
# bams 프롬프트는 전부 '/bams-plugin:bams:<cmd> ' 로 시작(--plugin-dir 로드 시 실측 등록명), single 은 슬래시 커맨드 없음
nb=$(grep -c "^(cd .* claude '-p' '/bams-plugin:bams:" "$TMP/dry-bams.txt"); nall=$(grep -c '^---' "$TMP/dry-bams.txt")
if [ "$nb" = "$nall" ] && ! grep -q "'/bams" "$TMP/dry-single.txt" && ! grep -q "claude '-p' '/bams:" "$TMP/dry-bams.txt"; then echo "prompt diff: OK ($nb/$nall bams prompts start with /bams-plugin:bams:)"; else echo "prompt diff: FAIL ($nb/$nall)"; fail=1; fi
# 과정 지표(lib/process_metrics.sh): 합성 stream-json — 메인 TodoWrite 2회(첫 회 4항목), 서브에이전트 TodoWrite(무시),
#   사유 있는 skip 2줄(마지막 TodoWrite 1 + 최종 메시지 1)·사유 없는 skip 1줄·Steps 자리표시자 1줄(미집계),
#   release-quality-gate spawn 1회 + 다른 spawn 1회, hook 이벤트 block 1회, 작업 디렉터리 verdict 파일
PM="$TMP/pm"; mkdir -p "$PM/w/.crew/artifacts/review" "$PM/w0"; echo '{}' > "$PM/w/.crew/artifacts/review/verdict-abc.json"
{
  jq -cn '{type:"system",subtype:"init",slash_commands:[]}'
  jq -cn '{type:"assistant",parent_tool_use_id:null,message:{content:[{type:"tool_use",id:"u1",name:"TodoWrite",input:{todos:[{content:"1. 수집",status:"in_progress"},{content:"2. 리뷰",status:"pending"},{content:"3. 판정",status:"pending"},{content:"13. verdict 파일 확인 — 못 남기면 `— skip: <사유>`",status:"pending"}]}}]}}'
  jq -cn '{type:"assistant",parent_tool_use_id:"a1",message:{content:[{type:"tool_use",id:"s1",name:"TodoWrite",input:{todos:[{content:"x — skip: sub",status:"pending"}]}}]}}'
  jq -cn '{type:"assistant",message:{content:[{type:"tool_use",id:"a1",name:"Agent",input:{subagent_type:"bams-plugin:release-quality-gate",prompt:"판정"}},{type:"tool_use",id:"a2",name:"Agent",input:{subagent_type:"bams-plugin:qa-strategy",prompt:"리뷰"}}]}}'
  jq -cn '{type:"assistant",message:{content:[{type:"tool_use",id:"u2",name:"TodoWrite",input:{todos:[{content:"1. 수집",status:"completed"},{content:"2. 리뷰 — skip: lightweight (40 lines, 2 files)",status:"completed"},{content:"3. 판정 — skip:",status:"completed"},{content:"13. verdict 파일 확인 — 못 남기면 `— skip: <사유>`",status:"completed"}]}}]}}'
  jq -cn '{type:"system",subtype:"hook_response",hook_id:"h1",hook_event:"Stop",output:"{\"decision\":\"block\",\"reason\":\"[bams completion-guard] 누락\"}"}'
  jq -cn '{type:"result",subtype:"success",result:"리뷰 완료\n- 회고 — skip: 경량 리뷰라 생략\n- 2. 리뷰 — skip: lightweight (40 lines, 2 files)"}'
} > "$PM/s.jsonl"
pm=$("$HERE/lib/process_metrics.sh" "$PM/s.jsonl" "$PM/w")
want='{"todo_used":true,"steps_copied":4,"skips_with_reason":2,"skips_without_reason":1,"verdict_written":true,"verdict_judge_spawned":true,"agent_spawns":2,"completion_guard_blocks":1,"process_score":0.75}'
if [ "$(jq -cS . <<<"$pm")" = "$(jq -cS . <<<"$want")" ]; then echo "process metrics: OK"; else echo "process metrics: FAIL got=$pm"; fail=1; fi
pm0=$("$HERE/lib/process_metrics.sh" "$PM/s.jsonl")
jq -e '.verdict_written == null and .process_score == 0.6667' >/dev/null <<<"$pm0" && echo "process metrics (no work dir → verdict_written null, 3항목 평균): OK" || { echo "process metrics no-work: FAIL $pm0"; fail=1; }
jq -cn '{type:"result",subtype:"success",result:"끝"}' > "$PM/e.jsonl"
jq -e '.todo_used == false and .steps_copied == 0 and .verdict_written == false and .process_score == 0' >/dev/null <<<"$("$HERE/lib/process_metrics.sh" "$PM/e.jsonl" "$PM/w0")" \
  && echo "process metrics (아무것도 안 함 → 0, 체크리스트 없으면 skip 항목도 0): OK" || { echo "process metrics empty: FAIL"; fail=1; }
jq -e '.process_score == null' >/dev/null <<<"$("$HERE/lib/process_metrics.sh" "$PM/none.jsonl")" && echo "process metrics (raw 없음 → null): OK" || { echo "process metrics missing raw: FAIL"; fail=1; }
# compare.sh: 무효 행(cmd_resolved=false·error) 제외, regrade 행(error 없음) 포함, 음수 duration 버림, process 는 score 와 별도
printf '%s\n' '{"task":"t1","config":"bams","trial":1,"score":1,"duration_s":10,"cost_usd":0.5,"cmd_resolved":true,"error":"","process_score":0.5,"todo_used":true}' \
  '{"task":"t1","config":"bams","trial":2,"score":0,"duration_s":-1793858907,"cost_usd":0,"cmd_resolved":true,"error":"no_result_event; interrupted"}' \
  '{"task":"t1","config":"bams","trial":3,"score":0,"duration_s":20,"cost_usd":0.3,"cmd_resolved":false,"error":""}' \
  '{"task":"t1","config":"bams","trial":4,"score":0.5,"orig_score":0,"detail":"regrade"}' > "$PM/a.jsonl"
printf '%s\n' '{"task":"t1","config":"single","trial":1,"score":1,"duration_s":-5,"cost_usd":0.2,"cmd_resolved":null,"error":""}' > "$PM/b.jsonl"
co=$("$HERE/compare.sh" "$PM/a.jsonl" "$PM/b.jsonl" 2>&1)
if printf '%s\n' "$co" | grep -Eq '^t1 +2/1 +2/0 +0\.75 +1 +\+0\.25 +10 +- ' && printf '%s\n' "$co" | grep -Eq '^t1 +2/1 +0\.5 +- +- +1/-'; then
  echo "compare.sh (무효 행 제외·regrade 포함·음수 dur 무시·process 표): OK"
else echo "compare.sh: FAIL"; printf '%s\n' "$co"; fail=1; fi
[ "$fail" = 0 ] && echo "ALL OK" || { echo "VALIDATION FAILED"; exit 1; }
