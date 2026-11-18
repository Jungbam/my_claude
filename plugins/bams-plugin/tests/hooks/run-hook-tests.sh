#!/usr/bin/env bash
# run-hook-tests.sh — hooks/*.sh 에 JSON fixture를 stdin으로 넣어 exit code/출력을 검증한다.
# 사용법: bash plugins/bams-plugin/tests/hooks/run-hook-tests.sh   (exit 0=전부 통과)
# 의존: bash, jq. macOS 기본 bash 3.2 호환.
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
HOOKS="$(cd "$HERE/../../hooks" && pwd)"
FX="$HERE/fixtures"
PASS=0; FAIL=0

# run_case <label> <hook|-> <stdin-file> <want-exit> <want: none|context|deny|block> [env...]
#   hook "-" = 하네스가 디스패치하지 않음(matcher 불일치) → 출력 없음·exit 0
run_case() {
  local label="$1" hook="$2" in="$3" want_exit="$4" want="$5"; shift 5
  local out="" code=0 got
  [ "$hook" = "-" ] || { out=$(env -u BAMS_DELEGATION_GUARD -u CLAUDE_MD_EDIT_ALLOWED -u CLAUDE_MD_STEP3 -u CLAUDE_MD_INIT \
    -u BAMS_HOOK_TRACE -u BAMS_HOOK_CAPTURE_DIR -u BAMS_GUARD_EXTRA_PATHS -u BAMS_VERDICT_GATE -u BAMS_VERDICT_GH -u BAMS_VERDICT_GH_TIMEOUT -u BAMS_COMPLETION_GUARD -u BAMS_METRICS "$@" bash "$HOOKS/$hook" < "$in" 2>/dev/null); code=$?; }
  if [ -z "$out" ]; then got=none
  elif printf '%s' "$out" | jq -e '.hookSpecificOutput.permissionDecision == "deny"' >/dev/null 2>&1; then got=deny
  elif printf '%s' "$out" | jq -e '.decision == "block" and (.reason | length > 0)' >/dev/null 2>&1; then got=block
  elif printf '%s' "$out" | jq -e '(.hookSpecificOutput.additionalContext | length > 0) and (.hookSpecificOutput | has("permissionDecision") | not)' >/dev/null 2>&1; then got=context
  else got="unparsed:$out"
  fi
  if [ "$code" = "$want_exit" ] && [ "$got" = "$want" ]; then
    PASS=$((PASS + 1)); echo "  PASS  $label"
  else
    FAIL=$((FAIL + 1)); echo "  FAIL  $label (exit=$code want=$want_exit, out=$got want=$want)"
  fi
}

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
# stop_input <name> <stop_hook_active> <agent_type> <transcript> <last_message>
stop_input() {
  sed -e "s|__ACTIVE__|$2|" -e "s|__AGENT__|$3|" -e "s|__TRANSCRIPT__|$4|" -e "s|__LAST__|$5|" \
    "$FX/stop-template.json" > "$TMP/$1.json"
  echo "$TMP/$1.json"
}

echo "== delegation-guard.sh =="
run_case "메인 소스 수정 → warn(additionalContext)"         delegation-guard.sh "$FX/pre-main-source.json"     0 context
run_case "--agent 메인(agent_type만, agent_id 없음) → warn" delegation-guard.sh "$FX/pre-main-agent-flag.json" 0 context
run_case "서브에이전트(agent_id) 소스 수정 → 통과"          delegation-guard.sh "$FX/pre-sub-source.json"      0 none
run_case "strict 메인 소스 수정 → deny"                     delegation-guard.sh "$FX/pre-main-source.json"     0 deny BAMS_DELEGATION_GUARD=strict
run_case "strict 서브에이전트 → 통과"                       delegation-guard.sh "$FX/pre-sub-source.json"      0 none BAMS_DELEGATION_GUARD=strict
run_case "off 메인 소스 수정 → 통과"                        delegation-guard.sh "$FX/pre-main-source.json"     0 none BAMS_DELEGATION_GUARD=off
run_case "메인 문서(*.md) → 통과"                           delegation-guard.sh "$FX/pre-main-doc.json"        0 none
run_case "메인 .crew/** → 통과"                             delegation-guard.sh "$FX/pre-main-crew.json"       0 none
run_case "메인 /private/tmp → 통과"                         delegation-guard.sh "$FX/pre-main-tmp.json"        0 none
run_case "메인 scratchpad_dir → 통과"                       delegation-guard.sh "$FX/pre-main-scratch.json"    0 none
run_case "깨진 입력 → fail-open"                            delegation-guard.sh "$FX/broken.json"              0 none
run_case "빈 입력 → fail-open"                              delegation-guard.sh /dev/null                      0 none

# plugin.json SubagentStop matcher 를 공식 문서 규칙대로 평가한다:
#   ""/"*" → 전체 / [A-Za-z0-9_ ,|-]만 → exact 문자열 목록(| 또는 , 구분) / 그 외 → JS RegExp.test(비앵커)
# matcher_hits <matcher> <agent_type> → exit 0=매칭
matcher_hits() {
  local m="$1" v="$2" tok
  case "$m" in ''|'*') return 0 ;; esac
  if printf '%s' "$m" | grep -q '^[A-Za-z0-9_ ,|-]*$'; then
    for tok in $(printf '%s' "$m" | tr ',|' '  '); do [ "$tok" = "$v" ] && return 0; done
    return 1
  fi
  if command -v node >/dev/null 2>&1; then
    node -e 'process.exit(new RegExp(process.argv[1]).test(process.argv[2]) ? 0 : 1)' "$m" "$v"
  else
    [[ $v =~ $m ]]
  fi
}
# matcher_case <label> <matcher> <agent_type> <want: match|nomatch>
matcher_case() {
  local got=nomatch
  matcher_hits "$2" "$3" && got=match
  if [ "$got" = "$4" ]; then PASS=$((PASS + 1)); echo "  PASS  $1"
  else FAIL=$((FAIL + 1)); echo "  FAIL  $1 (matcher='$2' value='$3' got=$got want=$4)"; fi
}
PJ="$HERE/../../.claude-plugin/plugin.json"
SM=$(jq -r '[.hooks.SubagentStop[]? | select(.hooks[]?.command | test("verify-before-stop")) | .matcher][0] // ""' "$PJ" 2>/dev/null)
TA=$(sed -n 's/^TARGET_AGENTS="\(.*\)"$/\1/p' "$HOOKS/verify-before-stop.sh")
# stop_case <label> <stdin-file> <want-exit> <want> — 하네스 경로 에뮬레이션: plugin.json matcher를
#   입력의 agent_type에 평가해 매칭될 때만 스크립트를 실행한다(matcher가 틀리면 block 기대 케이스가 FAIL).
stop_case() {
  local at; at=$(jq -r '.agent_type // ""' "$2" 2>/dev/null)
  if [ -n "$SM" ] && matcher_hits "$SM" "$at"; then run_case "$1" verify-before-stop.sh "$2" "$3" "$4"
  else run_case "$1 [matcher 불일치→미실행]" - "$2" "$3" "$4"; fi
}

echo "== verify-before-stop.sh (plugin.json matcher → 스크립트) =="
FE=bams-plugin:frontend-engineering
stop_case "편집 후 검증 없음 → block" "$(stop_input a false $FE "$FX/transcript-edit-no-verify.jsonl" '완료')"   0 block
stop_case "검증 후 편집(편집 이후 검증 없음) → block" "$(stop_input b false $FE "$FX/transcript-verify-then-edit.jsonl" '완료')" 0 block
stop_case "편집 후 검증 실행 → 통과" "$(stop_input c false $FE "$FX/transcript-edit-then-verify.jsonl" '완료')" 0 none
stop_case "stop_hook_active=true → 통과" "$(stop_input d true  $FE "$FX/transcript-edit-no-verify.jsonl" '완료')"   0 none
stop_case "보고에 '검증 불가' 사유 → 통과" "$(stop_input e false $FE "$FX/transcript-edit-no-verify.jsonl" '검증 불가: CI 전용 시크릿 필요')" 0 none
stop_case "대상 외 에이전트 → 통과" "$(stop_input f false bams-plugin:ux-research "$FX/transcript-edit-no-verify.jsonl" '완료')" 0 none
run_case "스크립트 단독: bare 이름(platform-devops)도 접두사 제거 후 block" verify-before-stop.sh "$(stop_input g false platform-devops "$FX/transcript-edit-no-verify.jsonl" '완료')" 0 block
stop_case "bare 이름(platform-devops) → 미실행" "$(stop_input g2 false platform-devops "$FX/transcript-edit-no-verify.jsonl" '완료')" 0 none
stop_case "문서만 편집 → 통과" "$(stop_input h false $FE "$FX/transcript-docs-only.jsonl" '완료')"        0 none
stop_case "깨진 줄 섞인 transcript → block" "$(stop_input i false $FE "$FX/transcript-garbage-lines.jsonl" '완료')"    0 block
stop_case "transcript 부재 → fail-open" "$(stop_input j false $FE "$TMP/none.jsonl" '완료')"                       0 none
run_case "깨진 입력 → fail-open"            verify-before-stop.sh "$FX/broken.json"                                                           0 none

# 소스 편집 1회 → Bash <cmd> 1회 transcript 를 만들어 VERIFY_RE 판정을 end-to-end로 확인한다.
# edit_then_bash <name> <bash-command> [편집 파일(기본 page.tsx)]
edit_then_bash() {
  local t="$TMP/$1.jsonl"
  jq -cn --arg f "${3:-/repo/src/app/page.tsx}" '{type:"assistant",message:{content:[{type:"tool_use",name:"Edit",input:{file_path:$f,old_string:"a",new_string:"b"}}]}}' > "$t"
  jq -cn --arg c "$2" '{type:"assistant",message:{content:[{type:"tool_use",name:"Bash",input:{command:$c}}]}}' >> "$t"
  echo "$t"
}
echo "== verify-before-stop.sh: 검증 명령 판정 =="
n=0
for cmd in 'ls tests/' 'cd build' 'cat test.log' 'grep -r lint .' 'echo bun test' 'npm install'; do
  n=$((n + 1))
  stop_case "검증 아님: $cmd → block" "$(stop_input nv$n false $FE "$(edit_then_bash nv$n "$cmd")" '완료')" 0 block
done
# "<명령>@<편집 파일>" — 검증 명령은 편집한 파일 범주와 맞아야 인정된다(QA m2)
for cf in 'bun test@/repo/src/app/page.tsx' 'npm run build@/repo/src/app/page.tsx' 'cd app && npx tsc --noEmit@/repo/src/a.ts' \
          'bash scripts/validate-harness.sh@/repo/src/app/page.tsx' 'pytest -q@/repo/app/a.py' 'go test ./...@/repo/main.go' \
          'bash -n hooks/verify-before-stop.sh@/repo/hooks/verify-before-stop.sh' 'python -m py_compile a.py@/repo/a.py' \
          'make test@/repo/src/Main.java' 'shellcheck hooks/x.sh@/repo/hooks/x.sh'; do
  n=$((n + 1)); cmd="${cf%@*}"
  stop_case "검증: $cmd (${cf##*/}) → 통과" "$(stop_input v$n false $FE "$(edit_then_bash v$n "$cmd" "${cf##*@}")" '완료')" 0 none
done
echo "== verify-before-stop.sh: 범주 불일치·무의미 검증·종료 코드 가림 (QA m2) =="
for cf in 'bash -n /dev/null@/repo/src/app/page.tsx' 'shellcheck a.sh@/repo/src/app/page.tsx' 'pytest -q@/repo/src/app/page.tsx' \
          'go test ./...@/repo/a.py' 'curl -fsS localhost:3000@/repo/src/app/page.tsx'; do
  n=$((n + 1)); cmd="${cf%@*}"
  stop_case "검증 아님(범주 불일치·무의미): $cmd (${cf##*/}) → block" "$(stop_input m$n false $FE "$(edit_then_bash m$n "$cmd" "${cf##*@}")" '완료')" 0 block
done
for cmd in 'npm test || true' 'npm test | tail -5' 'bun test 2>&1 | grep -v warn' 'bun test; true' 'npm run build; npm test || :'; do
  n=$((n + 1))
  stop_case "exit 불명(가림): $cmd → block" "$(stop_input m$n false $FE "$(edit_then_bash m$n "$cmd")" '완료')" 0 block
done
for cmd in 'set -o pipefail; npm test | tail -5' 'bun test || exit 1' 'cat x | bun test' 'bun test && echo ok' 'npm test || { echo fail; exit 1; }'; do
  n=$((n + 1))
  stop_case "exit 보존: $cmd → 통과" "$(stop_input m$n false $FE "$(edit_then_bash m$n "$cmd")" '완료')" 0 none
done
mo=$(bash "$HOOKS/verify-before-stop.sh" < "$(stop_input mo false $FE "$(edit_then_bash mo 'npm test | tail -5')" '완료')" 2>/dev/null)
if printf '%s' "$mo" | jq -e '.reason | test("exit 불명")' >/dev/null 2>&1; then PASS=$((PASS + 1)); echo "  PASS  가림 block 사유는 'exit 불명' 명시"
else FAIL=$((FAIL + 1)); echo "  FAIL  가림 block 사유: $mo"; fi
# 프로젝트 검증 스킬(.claude/skills/verify-*) drive 를 검증으로 인정
stop_case "verify 스킬 drive 스크립트 실행 → 통과" "$(stop_input vk1 false $FE "$(edit_then_bash vk1 'bash .claude/skills/verify-web/drive.sh login')" '완료')" 0 none
vk="$TMP/vk2.jsonl"; edit_then_bash vk0 'true' >/dev/null
{ head -1 "$TMP/vk0.jsonl"
  jq -cn '{type:"assistant",message:{content:[{type:"tool_use",id:"s1",name:"Skill",input:{skill:"verify-web"}}]}}'
  jq -cn '{type:"assistant",message:{content:[{type:"tool_use",id:"c1",name:"Bash",input:{command:"curl -fsS http://localhost:3000/login -o .crew/ev/login.html"}}]}}'
  jq -cn '{type:"user",message:{content:[{type:"tool_result",tool_use_id:"c1",is_error:false,content:"ok"}]}}'; } > "$vk"
stop_case "Skill(verify-web) 로드 후 curl drive → 통과" "$(stop_input vk2 false $FE "$vk" '완료')" 0 none

echo "== verify-before-stop.sh: 마지막 검증 명령의 종료 상태 (tool_use.id ↔ tool_result) =="
# vt <name> <spec...> — spec: E(소스 편집) | V:<id>:<0|1|x>(bun test, 결과 is_error 0/1, x=결과 없음) | X:<id>(결과 "Exit code 1", is_error 없음)
vt() {
  local t="$TMP/$1.jsonl" sp id r; shift; : > "$t"
  for sp in "$@"; do
    case "$sp" in
      E) jq -cn '{type:"assistant",message:{content:[{type:"tool_use",id:"te",name:"Edit",input:{file_path:"/repo/src/app/page.tsx",old_string:"a",new_string:"b"}}]}}' >> "$t" ;;
      V:*) id=$(echo "$sp" | cut -d: -f2); r=$(echo "$sp" | cut -d: -f3)
           jq -cn --arg id "$id" '{type:"assistant",message:{content:[{type:"tool_use",id:$id,name:"Bash",input:{command:"bun test"}}]}}' >> "$t"
           [ "$r" = x ] || jq -cn --arg id "$id" --argjson e "$([ "$r" = 1 ] && echo true || echo false)" \
             '{type:"user",message:{content:[{type:"tool_result",tool_use_id:$id,is_error:$e,content:(if $e then "Exit code 1\nFAIL x" else "ok" end)}]}}' >> "$t" ;;
      X:*) id=${sp#X:}
           jq -cn --arg id "$id" '{type:"assistant",message:{content:[{type:"tool_use",id:$id,name:"Bash",input:{command:"npx tsc --noEmit"}}]}}' >> "$t"
           jq -cn --arg id "$id" '{type:"user",message:{content:[{type:"tool_result",tool_use_id:$id,content:[{type:"text",text:"Exit code 2\nerror TS2304"}]}]}}' >> "$t" ;;
    esac
  done
  echo "$t"
}
stop_case "편집 후 마지막 검증 실패(is_error) → block"            "$(stop_input xs1 false $FE "$(vt xs1 E V:t1:1)" '완료')" 0 block
stop_case "편집 후 실패 → 재검증 성공 → 통과"                      "$(stop_input xs2 false $FE "$(vt xs2 E V:t1:1 V:t2:0)" '완료')" 0 none
stop_case "편집 후 성공 → 마지막 재검증 실패 → block"              "$(stop_input xs3 false $FE "$(vt xs3 E V:t1:0 V:t2:1)" '완료')" 0 block
stop_case "content 배열 'Exit code 2'(is_error 없음) → 실패로 block" "$(stop_input xs4 false $FE "$(vt xs4 E X:t1)" '완료')" 0 block
stop_case "검증 결과 줄 없음(형식 불명) → fail-open 통과"           "$(stop_input xs5 false $FE "$(vt xs5 E V:t1:x)" '완료')" 0 none
stop_case "검증 실패 후 편집 → 재검증 없음 → block(기존 규칙)"       "$(stop_input xs6 false $FE "$(vt xs6 V:t1:1 E)" '완료')" 0 block
stop_case "검증 실패여도 '검증 불가: 사유' 보고 → 통과"             "$(stop_input xs7 false $FE "$(vt xs7 E V:t1:1)" '검증 불가: 기존 실패 3건, 이번 변경 무관')" 0 none
stop_case "편집 전 실패 + 편집 후 성공 → 통과"                      "$(stop_input xs8 false $FE "$(vt xs8 V:t0:1 E V:t1:0)" '완료')" 0 none
# QA m3: "검증 불가" 탈출구는 줄 머리 규정 형식만 — 부정문·문장 중간 언급은 불인정
sj() { jq -cn --arg t "$2" --arg l "$3" --arg a "$FE" '{session_id:"s",hook_event_name:"SubagentStop",stop_hook_active:false,agent_type:$a,agent_transcript_path:$t,last_assistant_message:$l}' > "$TMP/$1.json"; echo "$TMP/$1.json"; }
stop_case "실패 + 부정문 '검증할 수 없는 항목은 없음' → block" "$(sj es1 "$(vt es1 E V:t1:1)" '검증할 수 없는 항목은 없음. 모두 통과')" 0 block
stop_case "실패 + 문장 중간 '…는 검증 불가: 아님' → block" "$(sj es2 "$(vt es2 E V:t1:1)" '이번 변경은 검증 불가: 아님, 모두 확인')" 0 block
stop_case "실패 + 'cannot verify'(영문 문장) → block" "$(sj es3 "$(vt es3 E V:t1:1)" 'I cannot verify this but it is fine')" 0 block
stop_case "실패 + 여러 줄 보고의 줄 머리 '- 검증 불가: 사유' → 통과" "$(sj es4 "$(vt es4 E V:t1:1)" $'요약: 수정 완료\n- 검증 불가: 기존 실패 3건, 이번 변경 무관')" 0 none
stop_case "실패 + '검증 불가 사유: …' → 통과" "$(sj es5 "$(vt es5 E V:t1:1)" '검증 불가 사유: CI 전용 시크릿')" 0 none
xo=$(bash "$HOOKS/verify-before-stop.sh" < "$(stop_input xs9 false $FE "$(vt xs9 E V:t1:1)" '완료')" 2>/dev/null)
if printf '%s' "$xo" | jq -e '.reason | test("실패\\(exit≠0\\)")' >/dev/null 2>&1; then PASS=$((PASS + 1)); echo "  PASS  실패 block 사유는 '미실행'과 구분(실패(exit≠0) 명시)"
else FAIL=$((FAIL + 1)); echo "  FAIL  실패 block 사유 문구: $xo"; fi

echo "== plugin.json SubagentStop matcher ($(command -v node >/dev/null 2>&1 && echo node RegExp || echo bash ERE)) =="
if [ -z "$SM" ]; then
  FAIL=$((FAIL + 1)); echo "  FAIL  plugin.json 에 verify-before-stop SubagentStop matcher 없음"
else
  for a in $TA; do
    matcher_case "bams-plugin:$a → 매칭" "$SM" "bams-plugin:$a" match
  done
  matcher_case "bare frontend-engineering → 불일치"        "$SM" "frontend-engineering"               nomatch
  matcher_case "bams-plugin:qa-strategy → 불일치"          "$SM" "bams-plugin:qa-strategy"            nomatch
  matcher_case "bams-plugin:frontend-engineering-x → 불일치" "$SM" "bams-plugin:frontend-engineering-x" nomatch
  matcher_case "other-plugin:frontend-engineering → 불일치" "$SM" "other-plugin:frontend-engineering"  nomatch
fi
# 회귀 기준: 이전 exact-list matcher는 plugin-scoped agent_type에 매칭되지 않았다(hook 미실행 원인)
matcher_case "구 matcher(exact 목록)는 bams-plugin:frontend-engineering 불일치" \
  "frontend-engineering|backend-engineering|platform-devops|data-integration|automation-qa" "bams-plugin:frontend-engineering" nomatch

# 실하네스 캡처본(tests/hooks/SMOKE.md)의 agent_type·tool_name으로 matcher를 평가 — 문서 해석과의 공통 모드 오류 차단
echo "== 실하네스 캡처 fixture (captured-*.json) =="
PM=$(jq -r '[.hooks.PreToolUse[]?.matcher][0] // ""' "$PJ" 2>/dev/null); ncap=0
for c in "$FX"/captured-*.json; do
  [ -f "$c" ] || continue; ncap=$((ncap + 1))
  case "$(jq -r '.hook_event_name // ""' "$c" 2>/dev/null)" in
    SubagentStop) at=$(jq -r '.agent_type // ""' "$c"); w=nomatch; case " $TA " in *" ${at##*:} "*) w=match ;; esac
                  matcher_case "${c##*/}: SubagentStop '$at' → $w" "$SM" "$at" "$w" ;;
    PreToolUse)   matcher_case "${c##*/}: PreToolUse tool_name → match" "$PM" "$(jq -r '.tool_name // ""' "$c")" match ;;
  esac
done
[ "$ncap" -gt 0 ] || echo "  SKIP  captured-*.json 없음 — SMOKE.md 미실행(실하네스 입력 미검증)"

echo "== validate-harness: TARGET_AGENTS↔matcher drift fixture =="
drop=${TA# }; drop=${drop%% *}; keep=$(printf '%s\n' $TA | grep -vx "$drop" | paste -sd'|' -)
jq --arg m "^$(jq -r .name "$PJ"):($keep)\$" \
  '(.hooks.SubagentStop[] | select(any(.hooks[]?; .command | test("verify-before-stop"))) | .matcher) = $m' "$PJ" > "$TMP/pj-drift.json"
dout=$(BAMS_HARNESS_PJ="$TMP/pj-drift.json" BAMS_CREW_DIR="$TMP/no-crew" bash "$HERE/../../scripts/validate-harness.sh" --quiet 2>&1); dcode=$?
if [ "$dcode" = 1 ] && printf '%s' "$dout" | grep -q "FAIL  TARGET_AGENTS↔matcher drift: $drop\$"; then
  PASS=$((PASS + 1)); echo "  PASS  matcher에서 '$drop' 제거 → validate-harness FAIL"
else FAIL=$((FAIL + 1)); echo "  FAIL  drift 미검출 (exit=$dcode): $(printf '%s' "$dout" | grep FAIL | head -3)"; fi

echo "== opt-in trace/capture (BAMS_HOOK_TRACE / BAMS_HOOK_CAPTURE_DIR) =="
run_case "trace+capture 켜도 CLAUDE.md 편집 → exit 2" claude-md-guard.sh "$FX/pre-main-claude-md.json" 2 none \
  BAMS_HOOK_TRACE="$TMP/trace.log" BAMS_HOOK_CAPTURE_DIR="$TMP/cap"
run_case "trace 경로 쓰기 불가 → fail-open(warn 유지)" delegation-guard.sh "$FX/pre-main-source.json" 0 context \
  BAMS_HOOK_TRACE=/nonexistent-dir/trace.log
if grep -q "	claude-md-guard	PreToolUse	-	Edit$" "$TMP/trace.log" 2>/dev/null \
   && jq -e --slurpfile o "$FX/pre-main-claude-md.json" '. == $o[0]' "$TMP"/cap/claude-md-guard-*.json >/dev/null 2>&1; then
  PASS=$((PASS + 1)); echo "  PASS  trace 줄(event·tool) 기록 + 원본 stdin 캡처 일치"
else FAIL=$((FAIL + 1)); echo "  FAIL  trace/capture 미생성: $(cat "$TMP/trace.log" 2>/dev/null)"; fi

echo "== claude-md-guard.sh =="
run_case "CLAUDE.md 편집 → exit 2"          claude-md-guard.sh "$FX/pre-main-claude-md.json" 2 none
run_case "CLAUDE.md + 예외 env → 통과"      claude-md-guard.sh "$FX/pre-main-claude-md.json" 0 none CLAUDE_MD_EDIT_ALLOWED=1
run_case "일반 파일 → 통과"                 claude-md-guard.sh "$FX/pre-main-source.json"    0 none
run_case "깨진 입력 → fail-open"            claude-md-guard.sh "$FX/broken.json"             0 none

echo "== delegation-guard.sh: BAMS_GUARD_EXTRA_PATHS (opt-in) =="
jq -cn '{hook_event_name:"PreToolUse",tool_name:"Edit",tool_input:{file_path:"/repo/plugins/x/agents/foo.md",old_string:"a",new_string:"b"}}' > "$TMP/pre-agent-md.json"
XP='*/agents/*.md:*/commands/*.md'
run_case "에이전트 .md, 추가 경로 미설정 → 통과"   delegation-guard.sh "$TMP/pre-agent-md.json"       0 none
run_case "에이전트 .md + 추가 경로 → warn"          delegation-guard.sh "$TMP/pre-agent-md.json"       0 context BAMS_GUARD_EXTRA_PATHS="$XP"
run_case "에이전트 .md + 추가 경로 + strict → deny" delegation-guard.sh "$TMP/pre-agent-md.json"       0 deny BAMS_GUARD_EXTRA_PATHS="$XP" BAMS_DELEGATION_GUARD=strict
run_case "추가 경로 불일치 문서 → 통과"             delegation-guard.sh "$FX/pre-main-doc.json"        0 none BAMS_GUARD_EXTRA_PATHS="$XP"
run_case "추가 경로 + 서브에이전트 → 통과"          delegation-guard.sh "$FX/pre-sub-source.json"      0 none BAMS_GUARD_EXTRA_PATHS="$XP"
if BAMS_GUARD_EXTRA_PATHS="$XP" bash "$HOOKS/delegation-guard.sh" < "$TMP/pre-agent-md.json" 2>/dev/null | grep -q '추천: hr-agent'; then
  PASS=$((PASS + 1)); echo "  PASS  추가 경로 매칭 → 추천 hr-agent"
else FAIL=$((FAIL + 1)); echo "  FAIL  추가 경로 매칭인데 추천 hr-agent 아님"; fi

echo "== prompt-router.sh (UserPromptSubmit) =="
PROOT="$(cd "$HERE/../.." && pwd)"
mkdir -p "$TMP/proj-crew/.crew" "$TMP/proj-nocrew"; : > "$TMP/proj-crew/.crew/config.md"
# router_out <prompt> [env...] → additionalContext (없으면 빈 문자열). 기본: 입력 cwd=/x(.crew 없음),
#   CLAUDE_PROJECT_DIR=.crew 있는 프로젝트. 셸 변수 RCWD로 입력 cwd를 바꾼다.
router_out() {
  local p="$1"; shift
  jq -cn --arg p "$p" --arg c "${RCWD:-/x}" '{session_id:"t",cwd:$c,permission_mode:"default",hook_event_name:"UserPromptSubmit",prompt:$p}' \
    | env -u BAMS_ROUTER -u BAMS_ROUTE_TABLE -u BAMS_HOOK_TRACE -u BAMS_HOOK_CAPTURE_DIR \
        CLAUDE_PLUGIN_ROOT="$PROOT" CLAUDE_PROJECT_DIR="$TMP/proj-crew" "$@" bash "$HOOKS/prompt-router.sh" 2>/dev/null \
    | jq -r '.hookSpecificOutput | select(.hookEventName == "UserPromptSubmit") | .additionalContext // empty' 2>/dev/null
}
# route_case <label> <prompt> <want: none | "<target> <high|med>"> [env...]
route_case() {
  local label="$1" p="$2" want="$3"; shift 3
  local ctx got
  ctx=$(router_out "$p" "$@")
  if [ -z "$ctx" ]; then got=none
  else got=$(printf '%s\n' "$ctx" | sed -n '1s/^\[bams router\] 후보: \([^ ]*\) (\([a-z]*\),.*/\1 \2/p'); [ -n "$got" ] || got="unparsed"
  fi
  if [ "$got" = "$want" ]; then PASS=$((PASS + 1)); echo "  PASS  $label"
  else FAIL=$((FAIL + 1)); echo "  FAIL  $label (got='$got' want='$want')"; fi
}
# ctx_case <label> <prompt> <want: has|lacks> <고정 문자열> [env...]
ctx_case() {
  local label="$1" p="$2" mode="$3" s="$4"; shift 4
  local ctx ok=1
  ctx=$(router_out "$p" "$@")
  if printf '%s' "$ctx" | grep -qF -- "$s"; then [ "$mode" = has ] || ok=0; else [ "$mode" = lacks ] || ok=0; fi
  [ -n "$ctx" ] || ok=0
  if [ "$ok" = 1 ]; then PASS=$((PASS + 1)); echo "  PASS  $label"
  else FAIL=$((FAIL + 1)); echo "  FAIL  $label ($mode '$s'; ctx='$(printf '%s' "$ctx" | head -1)')"; fi
}
route_case "버그 1건(한) → hotfix high"        "로그인 페이지에서 500 에러 나는 거 고쳐줘"                "/bams-plugin:bams:hotfix high"
route_case "버그 1건(영) → hotfix high"        "Fix the crash on the checkout page when cart is empty"   "/bams-plugin:bams:hotfix high"
route_case "버그 다건 → dev high"              "결제 화면에서 버그 3개 있는데 한꺼번에 고쳐줘"            "/bams-plugin:bams:dev high"
route_case "신규 기능(한) → feature high"      "알림 설정 기능 새로 만들어줘"                             "/bams-plugin:bams:feature high"
route_case "신규 기능(영) → feature high"      "Implement a new feature for exporting CSV reports"       "/bams-plugin:bams:feature high"
route_case "계획만 → plan high"                "결제 플로우 PRD랑 설계 문서만 작성해줘, 구현 없이"        "/bams-plugin:bams:plan high"
route_case "리뷰(게이트) → review high"        "이 브랜치 코드 리뷰 해줘"                                 "/bams-plugin:bams:review high"
route_case "심층 리뷰 → deep-review high"      "codex 세컨드 오피니언 포함해서 심층 리뷰 해줘"            "/bams-plugin:bams:deep-review high"
route_case "배포 → deploy high"                "프로덕션에 배포해줘 이제"                                 "/bams-plugin:bams:deploy high"
route_case "성능 → performance high"           "메인 페이지 로딩이 너무 느려 성능 개선해줘"               "/bams-plugin:bams:performance high"
route_case "보안 → security high"              "보안 취약점 점검해줘 OWASP 기준으로"                      "/bams-plugin:bams:security high"
route_case "코드 질문(한) → q high"            "useAuth 훅은 어디서 정의되고 어떻게 동작해?"              "/bams-plugin:bams:q high"
route_case "코드 질문(영) → q high"            "How does the session refresh logic work in this codebase?" "/bams-plugin:bams:q high"
route_case "디자인 가이드 → design-import"     "HTML 디자인 가이드를 Next.js로 이식해줘"                  "/bams-plugin:bams:design-import high"
route_case "CI 프리플라이트 → verify high"     "빌드랑 린트 타입체크 돌려서 확인해줘"                     "/bams-plugin:bams:verify high"
route_case "회고 → retro high"                 "이번 파이프라인 회고 진행해줘"                            "/bams-plugin:bams:retro high"
route_case "브라우저 QA → qa high"             "브라우저로 사이트 QA 돌려줘"                              "/bams-plugin:bams:qa high"
route_case "PR 생성(짧은 명령) → ship high"    "PR 만들어줘"                                              "/bams-plugin:bams:ship high"
route_case "스킬: 브랜치 최신화 → git-sync"    "main 브랜치 최신화해줘 rebase로"                          "bams-plugin:git-sync high"
route_case "스킬: 커밋 되돌리기 → git-rollback" "마지막 커밋 되돌려줘"                                    "bams-plugin:git-rollback high"
route_case "스킬: 원인 분석 → investigate"     "왜 이 테스트가 계속 실패하는지 원인 분석해줘"             "bams-plugin:investigate high"
route_case "스킬: 연구노트 → research-note"    "연구노트 작성해줘 오늘 작업 내용으로"                     "bams-plugin:research-note high"
route_case "모호: 성능 단어만 → med"           "요즘 좀 느려진 것 같은데 최적화 여지 있어?"               "/bams-plugin:bams:performance med"
route_case "잡담 → 출력 없음"                  "오늘 날씨 어때? 그냥 궁금해서"                            none
route_case "짧은 응답(응) → 없음"              "응"                                                       none
route_case "선택 응답(2번으로 진행해) → 없음"  "2번으로 진행해"                                           none
route_case "긍정 응답 + 짧은 꼬리 → 없음"      "네 그렇게 해주세요"                                       none
route_case "커맨드 자체 질문 → 없음"           "hotfix랑 dev 커맨드 차이가 뭐야?"                         none
route_case "슬래시 입력 → 없음"                "/bams:hotfix 로그인 500 에러 고쳐줘"                      none
route_case "task-notification → 없음"         "$(printf '<task-notification>\n<task-id>a1</task-id>\n<result>로그인 버그 고쳐줘 배포해줘</result>\n</task-notification>')" none
route_case "다른 세션 메시지 → 없음"           "$(printf '<cross-session-message from="api-worker">\n결제 버그 3개 고쳐줘\n</cross-session-message>')" none
route_case "팀원 메시지 → 없음"                "$(printf '<teammate-message teammate_id="x">\n코드 리뷰 해줘 지금\n</teammate-message>')" none
route_case "붙여넣기 블록만 + 짧은 본문 → 없음" "$(printf '<pasted_content id="p1">\nTypeError: x is undefined — 버그 고쳐줘, 배포해줘\n</pasted_content id="p1">\n이거 봐')" none
route_case "붙여넣기 내부 단어 무시 → 본문 기준" "$(printf '<pasted_content id="p1">\n코드 리뷰 해줘. PR 만들어줘. 프로덕션에 배포해줘\n</pasted_content id="p1">\n위 로그 보고 로그인 에러 고쳐줘')" "/bams-plugin:bams:hotfix high"
route_case "BAMS_ROUTER=off → 없음"            "로그인 페이지에서 500 에러 나는 거 고쳐줘"                none BAMS_ROUTER=off
route_case "route-table 부재 → fail-open"      "로그인 페이지에서 500 에러 나는 거 고쳐줘"                none BAMS_ROUTE_TABLE=/nonexistent.json
ctx_case "suggest 모드 → 추천만"              "로그인 페이지에서 500 에러 나는 거 고쳐줘" has "행동(suggest)" BAMS_ROUTER=suggest
ctx_case "기본(미설정) 모드 = suggest"         "로그인 페이지에서 500 에러 나는 거 고쳐줘" has "| 모드: suggest"
ctx_case "기본 모드 → Skill 실행 지시 없음"    "로그인 페이지에서 500 에러 나는 거 고쳐줘" lacks "Skill tool로 실행"
ctx_case "알 수 없는 값 → suggest 로 폴백"     "로그인 페이지에서 500 에러 나는 거 고쳐줘" has "행동(suggest)" BAMS_ROUTER=bogus
ctx_case "auto 는 명시할 때만 → 실행 지시"     "로그인 페이지에서 500 에러 나는 거 고쳐줘" has "행동(high)" BAMS_ROUTER=auto
ctx_case ".crew 있음 → init 체인 없음"         "로그인 페이지에서 500 에러 나는 거 고쳐줘" lacks "bams:init"
ctx_case ".crew 없음 → init 체인"              "로그인 페이지에서 500 에러 나는 거 고쳐줘" has "체인: /bams-plugin:bams:init → /bams-plugin:bams:hotfix" CLAUDE_PROJECT_DIR="$TMP/proj-nocrew"
ctx_case ".crew 없음 + 질문(q) → init 없음"    "useAuth 훅은 어디서 정의되고 어떻게 동작해?" lacks "bams:init" CLAUDE_PROJECT_DIR="$TMP/proj-nocrew"
ctx_case ".crew 없음 + 스킬 → init 없음"       "main 브랜치 최신화해줘 rebase로"          lacks "bams:init" CLAUDE_PROJECT_DIR="$TMP/proj-nocrew"
# 리뷰 M1: 명사 단독·문서 산출 의도는 high 금지 (재현 입력 15건) + m1 4건
for p in "여행 계획 짜줘" "새 기능 출시 공지문 써줘" "the array stride is wrong here" "what does the weekly cron job do" \
         "취약점 관련 기사 요약해줘" "KPT 템플릿 만들어줘" "we need to lock down the scope first" "핫픽스 절차 문서로 정리해줘" \
         "codex 모델 가격이 얼마야" "feature freeze 언제부터야" "연구노트 양식 보여줘" "헤드리스 브라우저가 뭐야" \
         "벤치마크 결과를 표로 만들어줘" "회고 결과 html로 정리해줘" "write the new feature announcement draft" \
         "테스트 통과하게 고쳐줘" "에러 메시지 문구 수정해줘" "lint 에러 고쳐줘"; do
  route_case "M1/m1 오탐 방지: $p → 없음" "$p" none
done
route_case "m1: review this PR and fix bugs → review/dev 경합 med" "review this PR and fix bugs" "/bams-plugin:bams:review med"
route_case "정상: 로그인 버그 고쳐줘 → hotfix high"   "로그인 버그 고쳐줘"         "/bams-plugin:bams:hotfix high"
route_case "정상: 결제 기능 새로 만들어줘 → feature"   "결제 기능 새로 만들어줘"    "/bams-plugin:bams:feature high"
route_case "정상: 이 PR 리뷰해줘 → review high"        "이 PR 리뷰해줘"             "/bams-plugin:bams:review high"
route_case "정상: 이 함수 어디서 호출돼? → q high"     "이 함수 어디서 호출돼?"     "/bams-plugin:bams:q high"
route_case "정상: main 최신으로 맞춰줘 → git-sync"     "main 최신으로 맞춰줘"       "bams-plugin:git-sync high"
route_case "정상: 브랜치 최신화해줘 → git-sync"        "브랜치 최신화해줘"          "bams-plugin:git-sync high"
route_case "정상: 변경사항 stash 해줘 → git-stash"     "변경사항 stash 해줘"        "bams-plugin:git-stash high"
route_case "체인에 /bams:init 포함 → 항상 med"         "로그인 버그 고쳐줘"         "/bams-plugin:bams:hotfix med" CLAUDE_PROJECT_DIR="$TMP/proj-nocrew"
ctx_case "init 체인 med → init 후 실행 선택 질문(auto)" "로그인 버그 고쳐줘" has '"/bams-plugin:bams:init 후 /bams-plugin:bams:hotfix"' CLAUDE_PROJECT_DIR="$TMP/proj-nocrew" BAMS_ROUTER=auto
# 리뷰 M2: 입력 cwd 기준 상위 탐색(.git·$HOME 정지) → CLAUDE_PROJECT_DIR
W="$TMP/ws"; mkdir -p "$W/app/.git" "$W/app/.crew" "$W/app/src/pages" "$W/app/vendor/sub/.git" "$W/other/.git"; : > "$W/app/.crew/config.md"
RCWD="$W/app/src/pages" route_case "M2-A: 하위 디렉터리 시작(.crew는 repo 루트) → init 없이 high" "로그인 버그 고쳐줘" "/bams-plugin:bams:hotfix high" CLAUDE_PROJECT_DIR="$TMP/proj-nocrew"
RCWD="$W/app/src/pages" ctx_case  "M2-A: .crew 위치 1줄 안내" "로그인 버그 고쳐줘" has ".crew 위치: $W/app " CLAUDE_PROJECT_DIR="$TMP/proj-nocrew"
RCWD="$W/app/vendor/sub" ctx_case "M2-B: 중첩 .git 경계에서 정지 → init 체인" "로그인 버그 고쳐줘" has "체인: /bams-plugin:bams:init → /bams-plugin:bams:hotfix" CLAUDE_PROJECT_DIR="$TMP/proj-nocrew"
RCWD="$W/other" route_case "M2-C: cwd에 .crew 없음 → CLAUDE_PROJECT_DIR(.crew 있음) 폴백" "로그인 버그 고쳐줘" "/bams-plugin:bams:hotfix high"
RCWD="$W/app" ctx_case "M2: cwd가 곧 .crew 루트 → 위치 줄 없음" "로그인 버그 고쳐줘" lacks ".crew 위치" CLAUDE_PROJECT_DIR="$TMP/proj-nocrew"
ctx_case "계획+구현 → plan→dev 체인"           "결제 플로우 계획 세우고 구현까지 해줘"    has "체인: /bams-plugin:bams:plan → /bams-plugin:bams:dev"
ctx_case "high → Skill 이름 안내(auto)"        "로그인 페이지에서 500 에러 나는 거 고쳐줘" has 'bams-plugin:bams:hotfix(args=' BAMS_ROUTER=auto
# 실제 등록 이름: 공식 "plugin skills are namespaced as /plugin-name:skill-name" — 짧은 /bams:<cmd> 는 출력 금지
ctx_case "suggest 추천 = 전체 이름"            "로그인 페이지에서 500 에러 나는 거 고쳐줘" has '추천: /bams-plugin:bams:hotfix"'
ctx_case "auto 고지 = 전체 이름"               "로그인 페이지에서 500 에러 나는 거 고쳐줘" has '"→ /bams-plugin:bams:hotfix 로 진행' BAMS_ROUTER=auto
ctx_case "auto 스킬 실행 = bams-plugin:<skill>" "main 브랜치 최신화해줘 rebase로"         has 'Skill tool로 실행: bams-plugin:git-sync(args=' BAMS_ROUTER=auto
ctx_case "auto 체인 Skill 이름 = / 없는 전체 이름" "결제 플로우 계획 세우고 구현까지 해줘" has '실행: bams-plugin:bams:plan(args=사용자 요청 원문) → bams-plugin:bams:dev.' BAMS_ROUTER=auto
ctx_case "init 체인 Skill 이름(auto, med)"     "로그인 버그 고쳐줘" has '"/bams-plugin:bams:init 후 /bams-plugin:bams:hotfix"' CLAUDE_PROJECT_DIR="$TMP/proj-nocrew" BAMS_ROUTER=auto
for m in suggest auto; do for pd in "$TMP/proj-crew" "$TMP/proj-nocrew"; do
  for p in "로그인 페이지에서 500 에러 나는 거 고쳐줘" "결제 플로우 계획 세우고 구현까지 해줘" "review this PR and fix bugs" "마지막 커밋 되돌려줘"; do
    ctx_case "짧은 /bams: 이름 미출력($m, ${pd##*/}): $p" "$p" lacks "/bams:" BAMS_ROUTER=$m CLAUDE_PROJECT_DIR="$pd"
  done
done; done
for bad in "$FX/broken.json" /dev/null; do
  out=$(CLAUDE_PLUGIN_ROOT="$PROOT" bash "$HOOKS/prompt-router.sh" < "$bad" 2>/dev/null); code=$?
  if [ "$code" = 0 ] && [ -z "$out" ]; then PASS=$((PASS + 1)); echo "  PASS  ${bad##*/} 입력 → fail-open"
  else FAIL=$((FAIL + 1)); echo "  FAIL  ${bad##*/} 입력 (exit=$code out=$out)"; fi
done
nl=$(router_out "codex 세컨드 오피니언 포함해서 심층 리뷰 해줘" | wc -l | tr -d ' ')
if [ "$nl" -ge 1 ] && [ "$nl" -le 5 ]; then PASS=$((PASS + 1)); echo "  PASS  additionalContext ${nl}줄 ≤ 5"
else FAIL=$((FAIL + 1)); echo "  FAIL  additionalContext ${nl}줄 (1~5 기대)"; fi
# 실행 시간: 10회 평균. ms 시계 = bash5 EPOCHREALTIME → perl Time::HiRes → macOS date +%s(초 해상도, 10회 합산으로 보정)
now_ms() {
  if [ -n "${EPOCHREALTIME:-}" ]; then local e="${EPOCHREALTIME/[.,]/}"; echo "${e%???}"
  else perl -MTime::HiRes=time -e 'printf "%d\n", time*1000' 2>/dev/null || echo "$(( $(date +%s) * 1000 ))"; fi
}
jq -cn '{hook_event_name:"UserPromptSubmit",prompt:"로그인 페이지에서 500 에러 나는 거 고쳐줘 그리고 원인도 알려줘"}' > "$TMP/ups.json"
t0=$(now_ms)
i=0; while [ $i -lt 10 ]; do CLAUDE_PLUGIN_ROOT="$PROOT" bash "$HOOKS/prompt-router.sh" < "$TMP/ups.json" >/dev/null 2>&1; i=$((i + 1)); done
t1=$(now_ms); avg=$(( (t1 - t0) / 10 ))
if [ "$avg" -le 500 ]; then PASS=$((PASS + 1)); echo "  PASS  1회 평균 ${avg}ms ≤ 500ms (10회)"
else FAIL=$((FAIL + 1)); echo "  FAIL  1회 평균 ${avg}ms > 500ms"; fi

echo "== validate-harness: keep-list / route-table fixture =="
printf '%s\t%s\n' '이 문구는 없다 ZZZ' 'agents/platform-devops.md' > "$TMP/kl-bad.txt"
kout=$(BAMS_KEEP_LIST="$TMP/kl-bad.txt" BAMS_CREW_DIR="$TMP/no-crew" bash "$HERE/../../scripts/validate-harness.sh" --quiet 2>&1); kcode=$?
if [ "$kcode" = 1 ] && printf '%s' "$kout" | grep -q "keep-list: 'agents/platform-devops.md' 에 '이 문구는 없다 ZZZ' 0건"; then
  PASS=$((PASS + 1)); echo "  PASS  keep-list 패턴 0건 → FAIL"
else FAIL=$((FAIL + 1)); echo "  FAIL  keep-list 0건 미검출 (exit=$kcode)"; fi
jq '.routes[0].target = "/bams-plugin:bams:nope" | .routes[1].patterns.high += ["(unclosed"]' "$PROOT/references/route-table.json" > "$TMP/rt-bad.json"
rout=$(BAMS_ROUTE_TABLE="$TMP/rt-bad.json" BAMS_CREW_DIR="$TMP/no-crew" bash "$HERE/../../scripts/validate-harness.sh" --quiet 2>&1); rcode=$?
if [ "$rcode" = 1 ] && printf '%s' "$rout" | grep -q "target '/bams-plugin:bams:nope': commands/bams/nope.md 없음" && printf '%s' "$rout" | grep -q '정규식 컴파일 실패: (unclosed'; then
  PASS=$((PASS + 1)); echo "  PASS  route-table 없는 target·깨진 정규식 → FAIL"
else FAIL=$((FAIL + 1)); echo "  FAIL  route-table 위반 미검출 (exit=$rcode): $(printf '%s' "$rout" | grep FAIL | head -3)"; fi
# 실제 등록 이름 규칙: 짧은 /bams:<cmd>·접두사 없는 스킬·다른 플러그인 접두사·스킬에 :bams: 없는 커맨드 → FAIL
jq '.routes[0].target = "/bams:hotfix" | .routes[1].chain = ["/bams-plugin:bams:plan", "/bams:dev"] | (.routes[] | select(.id == "git-sync") | .target) = "git-sync"
    | (.routes[] | select(.id == "codex") | .target) = "other-plugin:codex" | (.routes[] | select(.id == "verify") | .target) = "/bams-plugin:verify"' \
  "$PROOT/references/route-table.json" > "$TMP/rt-short.json"
rout=$(BAMS_ROUTE_TABLE="$TMP/rt-short.json" BAMS_CREW_DIR="$TMP/no-crew" bash "$HERE/../../scripts/validate-harness.sh" --quiet 2>&1); rcode=$?
rn=0; for t in "/bams:hotfix" "/bams:dev" "git-sync" "other-plugin:codex" "/bams-plugin:verify"; do
  printf '%s' "$rout" | grep -qF "FAIL  route-table target '$t': 실제 등록 이름 아님" && rn=$((rn + 1))
done
if [ "$rcode" = 1 ] && [ "$rn" = 5 ]; then PASS=$((PASS + 1)); echo "  PASS  route-table 짧은/잘못된 이름 5종(target·chain) → FAIL"
else FAIL=$((FAIL + 1)); echo "  FAIL  route-table 이름 규칙 미검출 ${rn}/5 (exit=$rcode): $(printf '%s' "$rout" | grep FAIL | head -3)"; fi
jq '.name = "renamed-plugin"' "$PJ" > "$TMP/pj-renamed.json"
rout=$(BAMS_HARNESS_PJ="$TMP/pj-renamed.json" BAMS_CREW_DIR="$TMP/no-crew" bash "$HERE/../../scripts/validate-harness.sh" --quiet 2>&1)
if printf '%s' "$rout" | grep -qF "route-table plugin 'bams-plugin' ≠ plugin.json name 'renamed-plugin'" \
   && printf '%s' "$rout" | grep -qF "FAIL  route-table target '/bams-plugin:bams:hotfix': 실제 등록 이름 아님"; then
  PASS=$((PASS + 1)); echo "  PASS  플러그인 이름은 plugin.json name 기준(이름 변경 시 target FAIL)"
else FAIL=$((FAIL + 1)); echo "  FAIL  plugin.json name 기준 검사 아님: $(printf '%s' "$rout" | grep 'route-table' | head -2)"; fi

echo "== sync-cache.sh --prune-stale (리뷰 M3, 가짜 HOME) =="
FH="$TMP/fakehome"; CB="$FH/.claude/plugins/cache/my-claude/bams-plugin"; SV=$(jq -r .version "$PJ")
mkdir -p "$CB/0.0.1" "$CB/0.0.2" "$CB/0.0.3" "$CB/$SV"; : > "$CB/0.0.2/.orphaned_at"; : > "$CB/$SV/.orphaned_at"
jq -n --arg p "$CB/0.0.1" '{plugins:{"bams-plugin@my-claude":[{installPath:$p}]}}' > "$FH/.claude/plugins/installed_plugins.json"
sout=$(HOME="$FH" bash "$HERE/../../sync-cache.sh" --prune-stale 2>&1); left=$(cd "$CB" && ls | paste -sd' ' -)
if [ "$left" = "0.0.1 0.0.3 $SV" ] && printf '%s' "$sout" | grep -qF "INFO: installPath 폴더 = 0.0.1" && printf '%s' "$sout" | grep -qF "source plugin.json version = $SV" && ! printf '%s' "$sout" | grep -q "^WARN"; then
  PASS=$((PASS + 1)); echo "  PASS  .orphaned_at 폴더만 삭제, installPath·현재 버전·관리 중 폴더 보존 + installPath/version INFO(WARN 아님)"
else FAIL=$((FAIL + 1)); echo "  FAIL  prune 결과: [$left] (기대: 0.0.1 0.0.3 $SV)"; fi
if printf '%s' "$sout" | grep -qF "실행 중인 Claude Code 세션은 재시작해야 반영됨"; then PASS=$((PASS + 1)); echo "  PASS  sync-cache 종료 메시지: 세션 재시작 필요 안내(QA m11)"
else FAIL=$((FAIL + 1)); echo "  FAIL  sync-cache 종료 메시지에 재시작 안내 없음"; fi

echo "== 런타임 캐시 리졸버 스니펫 (plugin-cache-sync.md §런타임 경로 해석, QA m5) =="
RS=$(grep -m1 -F '_BAMS=$( { jq -r' "$HERE/../../references/plugin-cache-sync.md")
touch "$CB/0.0.3"   # installPath(0.0.1)보다 최신 mtime 폴더가 있어도 installPath 우선
r1=$(HOME="$FH" bash -c "$RS; echo \"\$_BAMS\"")
mv "$FH/.claude/plugins/installed_plugins.json" "$FH/.claude/plugins/ip.bak"; touch "$CB/0.0.3"
r2=$(HOME="$FH" bash -c "$RS; echo \"\$_BAMS\"")
mv "$FH/.claude/plugins/ip.bak" "$FH/.claude/plugins/installed_plugins.json"
if [ "$r1" = "$CB/0.0.1" ] && [ "$r2" = "$CB/0.0.3" ]; then PASS=$((PASS + 1)); echo "  PASS  installPath 우선, 없으면 mtime 최신 폴더"
else FAIL=$((FAIL + 1)); echo "  FAIL  리졸버: installPath=[$r1] (기대 $CB/0.0.1), fallback=[$r2] (기대 $CB/0.0.3)"; fi
# QA 가짜 HOME 케이스: rcv <label> <want(빈 값=설치 없음)> <prelude> [shells]
RH="$TMP/rhome"; RB="$RH/.claude/plugins/cache/my-claude/bams-plugin"; RJ="$RH/.claude/plugins/installed_plugins.json"
rsetup() { rm -rf "$RH"; mkdir -p "$RB/2.1.0" "$RB/2.5.0" "$RH/.claude/plugins/cache/other/other-plugin/1.0"
  touch -t 202601010000 "$RB/2.1.0"; : > "$RB/2.5.0/.orphaned_at"; touch "$RB/2.5.0"; }
RSH="bash"; command -v zsh >/dev/null 2>&1 && RSH="bash zsh"
rcv() {
  local label="$1" want="$2" pre="$3" sh out err ok=1 detail=""
  for sh in ${4:-$RSH}; do
    out=$(HOME="$RH" "$sh" -c "$pre $RS; echo \"R=[\$_BAMS]\"" 2>"$TMP/rcv.err"); err=$(cat "$TMP/rcv.err")
    if [ "$out" != "R=[$want]" ] || [ -n "$err" ]; then ok=0; detail="$detail $sh:${out}${err:+ stderr=$err}"; fi
  done
  if [ $ok = 1 ]; then PASS=$((PASS + 1)); echo "  PASS  리졸버: $label (${4:-$RSH})"
  else FAIL=$((FAIL + 1)); echo "  FAIL  리졸버: $label — 기대 [$want]:$detail"; fi
}
rsetup; printf '{"version":2,"plugins":{"other-plugin@other":[{"scope":"user","installPath":"%s"}],"bams-plugin@my-claude":[{"scope":"user","installPath":"%s"}]}}' \
  "$RH/.claude/plugins/cache/other/other-plugin/1.0" "$RB/2.1.0" > "$RJ"
rcv "1줄 minify JSON + 다른 플러그인 먼저 → bams installPath" "$RB/2.1.0" ""
rsetup; jq -n --arg a "$RB/2.5.0" --arg b "$RB/2.1.0" '{plugins:{"bams-plugin@my-claude":[{scope:"project",installPath:$a},{scope:"user",installPath:$b}]}}' > "$RJ"
rcv "project+user 2항목 → scope=user 우선" "$RB/2.1.0" ""
mkdir -p "$TMP/nojq"; for c in ls sh head cat; do _cp=$(command -v $c) && ln -sf "$_cp" "$TMP/nojq/$c"; done
rcv "jq 없음 → .orphaned_at 없는 최신 폴더(오류 출력 없음)" "$RB/2.1.0" "PATH=$TMP/nojq;"
rsetup; mkdir -p "$RB/3.0.0"; jq -n --arg a "$RB/3.0.0" --arg b "$RB/9.9.9" '{plugins:{"bams-plugin@my-claude":[{scope:"project",installPath:$a},{scope:"user",installPath:$b}]}}' > "$RJ"
rcv "user installPath 폴더 없음 → 존재하는 project 항목" "$RB/3.0.0" ""
rsetup; jq -n --arg a "$RB/2.5.0" '{plugins:{"bams-plugin@my-claude":[{scope:"user",installPath:$a}]}}' > "$RJ"
rcv "installPath 가 .orphaned_at 고아 폴더 → 고아 아닌 폴더" "$RB/2.1.0" ""
rsetup; jq -n --arg b "$RB/2.1.0" '{plugins:{"bams-plugin@my-claude":{installPath:$b}}}' > "$RJ"
rcv "구형 객체 형식 항목" "$RB/2.1.0" ""
rsetup; rcv "JSON 없음 → 최신(2.5.0)은 고아라 건너뛰고 2.1.0" "$RB/2.1.0" ""
rsetup; echo '{"plugins": {' > "$RJ"; rcv "깨진 JSON → 고아 아닌 폴더" "$RB/2.1.0" ""
rsetup; rcv "set -euo pipefail + JSON 없음 → 중단 없이 해석" "$RB/2.1.0" "set -euo pipefail;"
rm -rf "$RH"; mkdir -p "$RH"; rcv "설치 없음 → 빈 값, stderr 노이즈 없음(zsh no matches found 없음)" "" ""
rcv "설치 없음 + set -euo pipefail → 빈 값으로 계속" "" "set -euo pipefail;"
printf '%s\n' '_S=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/skills/ship/SKILL.md" 2>/dev/null | head -1)' > "$TMP/cr-bad.md"
if ! bash "$HERE/../../scripts/check-cache-resolver.sh" "$TMP/cr-bad.md" >/dev/null 2>&1 && bash "$HERE/../../scripts/check-cache-resolver.sh" >/dev/null 2>&1; then
  PASS=$((PASS + 1)); echo "  PASS  check-cache-resolver: 캐시 루트 find|head -1 재등장 → FAIL, 현 저장소 → OK"
else FAIL=$((FAIL + 1)); echo "  FAIL  check-cache-resolver 판정 오류"; fi

echo "== verdict-gate.sh (PreToolUse Bash — SHA 결합 verdict) =="
VR="$TMP/vrepo"; VL="$HOOKS/lib/verdict.sh"
vgit() { git -C "$VR" -c user.email=t@t -c user.name=t -c commit.gpgsign=false "$@"; }
mkdir -p "$VR" && git -C "$VR" init -q && vgit checkout -q -b main && echo a > "$VR/a.txt" && vgit add a.txt && vgit commit -qm base \
  && vgit checkout -q -b feat && echo b >> "$VR/a.txt" && vgit commit -qam change && mkdir -p "$VR/.crew"
# vin <name> <command> [cwd] → PreToolUse Bash 입력 파일
vin() { jq -cn --arg c "$2" --arg d "${3:-$VR}" '{session_id:"v",hook_event_name:"PreToolUse",tool_name:"Bash",cwd:$d,tool_input:{command:$c}}' > "$TMP/$1.json"; echo "$TMP/$1.json"; }
VS="BAMS_VERDICT_GATE=strict"; VG="BAMS_VERDICT_GH=off"
run_case "verdict 없음 + gh pr merge (기본 warn) → context"          verdict-gate.sh "$(vin g1 'gh pr merge --squash')" 0 context $VG
run_case "verdict 없음 + gh pr merge (strict) → deny"                verdict-gate.sh "$(vin g2 'gh pr merge --squash')" 0 deny $VS $VG
run_case "BAMS_VERDICT_GATE=off → 통과"                               verdict-gate.sh "$(vin g3 'gh pr merge')" 0 none BAMS_VERDICT_GATE=off $VG
run_case "git push origin feat(base 아님) → 대상 아님"                verdict-gate.sh "$(vin g4 'git push -u origin feat')" 0 none $VS $VG
run_case "git push origin HEAD:main → strict deny"                    verdict-gate.sh "$(vin g5 'git push origin HEAD:main')" 0 deny $VS $VG
run_case "git push --dry-run origin main → 대상 아님"                 verdict-gate.sh "$(vin g6 'git push --dry-run origin main')" 0 none $VS $VG
run_case "echo/grep 인자 속 'git push origin main' → 대상 아님"       verdict-gate.sh "$(vin g7 'echo git push origin main; grep -r "gh pr merge" .')" 0 none $VS $VG
run_case "npx vercel deploy --prod → strict deny"                     verdict-gate.sh "$(vin g8 'npx vercel deploy --prod')" 0 deny $VS $VG
run_case "vercel(프리뷰, --prod 없음) → 대상 아님"                    verdict-gate.sh "$(vin g9 'vercel deploy')" 0 none $VS $VG
run_case ".crew 없는 저장소 → 대상 아님(fail-open)"                   verdict-gate.sh "$(vin g10 'gh pr merge' "$TMP")" 0 none $VS $VG
run_case "Bash 아닌 tool → 통과"                                       verdict-gate.sh "$FX/pre-main-source.json" 0 none $VS $VG
run_case "깨진 입력 → fail-open"                                       verdict-gate.sh "$FX/broken.json" 0 none $VS $VG
vw=$(cd "$VR" && bash "$VL" write --verdict PASS --judge-agent bams-plugin:frontend-engineering --judge-model claude-opus-5-5 \
     --author-agents frontend-engineering --evidence "0:bun test" --base main 2>&1); vc=$?
if [ "$vc" = 2 ] && [ -z "$(ls "$VR/.crew/artifacts/review" 2>/dev/null)" ]; then PASS=$((PASS + 1)); echo "  PASS  write: 판정자 = 구현자 → 거부(exit 2, 파일 없음)"
else FAIL=$((FAIL + 1)); echo "  FAIL  판정자=구현자 거부 안 됨 (exit=$vc): $vw"; fi
vw=$(cd "$VR" && bash "$VL" write --verdict PASS --judge-agent release-quality-gate --judge-model claude-sonnet-5-5 \
     --author-agents frontend-engineering --evidence "0:bun test" --evidence "1:npx tsc --noEmit" --base main 2>&1); vc=$?
if [ "$vc" = 2 ]; then PASS=$((PASS + 1)); echo "  PASS  write: PASS 인데 exit≠0 evidence → 거부"
else FAIL=$((FAIL + 1)); echo "  FAIL  exit≠0 evidence PASS 허용 (exit=$vc): $vw"; fi
vf=$(cd "$VR" && bash "$VL" write --verdict PASS --judge-agent release-quality-gate --judge-model claude-sonnet-5-5 \
     --author-agents bams-plugin:frontend-engineering --author-models claude-opus-5-5 --evidence "0:bun test" --base main 2>/dev/null)
if [ -f "$vf" ] && jq -e --arg h "$(vgit rev-parse HEAD)" '.sha == $h and .verdict == "PASS" and (.patch_id | length) == 40 and .base == "main"
     and .judge.agent == "release-quality-gate" and .judge.family == "claude" and .author_agents == ["frontend-engineering"]
     and .same_family == true and .evidence == [{cmd: "bun test", exit_code: 0}] and .dirty == false' "$vf" >/dev/null; then
  PASS=$((PASS + 1)); echo "  PASS  write: verdict-<shortsha>.json 스키마(sha·patch_id·judge·author·evidence·same_family)"
else FAIL=$((FAIL + 1)); echo "  FAIL  verdict 파일 스키마: $vf $(cat "$vf" 2>/dev/null | head -c 300)"; fi
run_case "PASS verdict(sha 일치) + gh pr merge (strict) → 통과"       verdict-gate.sh "$(vin g11 'gh pr merge --squash')" 0 none $VS $VG
run_case "PASS verdict + cd <repo> && git push origin feat:main → 통과" verdict-gate.sh "$(vin g12 "cd $VR && git push origin feat:main" "$TMP")" 0 none $VS $VG
vgit commit -q --amend -m "change (reworded)"
run_case "amend(내용 동일, sha 변경) → patch-id 일치로 통과"          verdict-gate.sh "$(vin g13 'gh pr merge')" 0 none $VS $VG
echo c >> "$VR/a.txt"; vgit commit -qam more
run_case "내용 추가 커밋(sha·patch-id 불일치) → strict deny"          verdict-gate.sh "$(vin g14 'gh pr merge')" 0 deny $VS $VG
echo d >> "$VR/a.txt"
(cd "$VR" && bash "$VL" write --verdict FAIL --judge-agent qa-strategy --judge-model gpt-6.1-codex --author-agents backend-engineering \
   --author-models claude-opus-5-5 --evidence "1:bun test" --base main >/dev/null 2>&1)
vgit commit -qam wip
run_case "미커밋 기준 FAIL verdict → 커밋 후 patch-id 일치 → strict deny" verdict-gate.sh "$(vin g15 'gh pr merge')" 0 deny $VS $VG
vo=$(BAMS_VERDICT_GATE=warn BAMS_VERDICT_GH=off bash "$HOOKS/verdict-gate.sh" < "$TMP/g15.json" 2>/dev/null)
if printf '%s' "$vo" | jq -e '.hookSpecificOutput.additionalContext | test("FAIL 이다")' >/dev/null 2>&1; then PASS=$((PASS + 1)); echo "  PASS  FAIL verdict 일치 → warn 문구는 'FAIL' 명시"
else FAIL=$((FAIL + 1)); echo "  FAIL  FAIL verdict warn 문구: $vo"; fi
if jq -e '.same_family == false and .judge.family == "openai" and .dirty == true' "$VR"/.crew/artifacts/review/verdict-*.json 2>/dev/null | grep -q true; then
  PASS=$((PASS + 1)); echo "  PASS  다른 계열 판정자(Codex/GPT) → same_family=false, 미커밋 판정 dirty=true"
else FAIL=$((FAIL + 1)); echo "  FAIL  same_family/dirty 기록"; fi
vc=0; (cd "$VR" && bash "$VL" check >/dev/null 2>&1) || vc=$?
if [ "$vc" = 3 ]; then PASS=$((PASS + 1)); echo "  PASS  verdict.sh check → FAIL 일치 exit 3"; else FAIL=$((FAIL + 1)); echo "  FAIL  check exit=$vc (기대 3)"; fi
if jq -e '[.hooks.PreToolUse[]? | select(.matcher == "Bash") | .hooks[]?.command | select(test("hooks/verdict-gate\\.sh"))] | length == 1' "$PJ" >/dev/null 2>&1; then
  PASS=$((PASS + 1)); echo "  PASS  plugin.json PreToolUse(Bash) → verdict-gate.sh 1회 등록"
else FAIL=$((FAIL + 1)); echo "  FAIL  plugin.json 에 verdict-gate.sh(Bash matcher) 등록 없음/중복"; fi
vgp=$(vin gp 'ls -la src'); vt0=$(now_ms); i=0; while [ $i -lt 10 ]; do bash "$HOOKS/verdict-gate.sh" < "$vgp" >/dev/null 2>&1; i=$((i + 1)); done; vt1=$(now_ms)
if [ $(( (vt1 - vt0) / 10 )) -le 50 ]; then PASS=$((PASS + 1)); echo "  PASS  대상 아닌 Bash 평균 $(( (vt1 - vt0) / 10 ))ms ≤ 50ms(jq 0회)"
else FAIL=$((FAIL + 1)); echo "  FAIL  대상 아닌 Bash 평균 $(( (vt1 - vt0) / 10 ))ms > 50ms"; fi

echo "== verdict-gate.sh: PR head 확인 불가 → HEAD 폴백 금지 (QA M1) + gh timeout (QA m13) =="
VR2="$TMP/vrepo2"
v2git() { git -C "$VR2" -c user.email=t@t -c user.name=t -c commit.gpgsign=false "$@"; }
mkdir -p "$VR2/.crew" && git -C "$VR2" init -q && v2git checkout -q -b main && echo a > "$VR2/a.txt" && echo b0 > "$VR2/.crew/board.md" \
  && v2git add a.txt .crew/board.md && v2git commit -qm base && v2git checkout -q -b feat && echo b >> "$VR2/a.txt" && v2git commit -qam change
v2w() { (cd "$VR2" && bash "$VL" write "$@" 2>/dev/null); }
v2w --verdict PASS --judge-agent release-quality-gate --judge-model claude-sonnet-5-5 --author-agents frontend-engineering \
  --evidence "0:bun test" --base main >/dev/null
v2in() { jq -cn --arg c "$2" --arg d "${3:-$VR2}" '{session_id:"v",hook_event_name:"PreToolUse",tool_name:"Bash",cwd:$d,tool_input:{command:$c}}' > "$TMP/$1.json"; echo "$TMP/$1.json"; }
run_case "PASS 있는 feat 에서 gh pr merge 999 + GH off → strict deny(HEAD 폴백 없음)" verdict-gate.sh "$(v2in m1a 'gh pr merge 999')" 0 deny $VS $VG
run_case "같은 상황 기본 warn → 안내(context)"                                     verdict-gate.sh "$(v2in m1b 'gh pr merge 999')" 0 context $VG
GHB="$TMP/ghbin"; mkdir -p "$GHB/fail" "$GHB/ok" "$GHB/slow"
printf '#!/bin/sh\nexit 1\n' > "$GHB/fail/gh"
printf '#!/bin/sh\necho %s\n' "$(v2git rev-parse HEAD)" > "$GHB/ok/gh"
printf '#!/bin/sh\nexec sleep 30\n' > "$GHB/slow/gh"; chmod +x "$GHB"/*/gh
run_case "gh pr view 실패(존재하지 않는 PR) → strict deny"           verdict-gate.sh "$(v2in m1c 'gh pr merge 99999')" 0 deny $VS "PATH=$GHB/fail:$PATH"
run_case "gh pr view 가 PASS 커밋 sha 반환 → 통과"                 verdict-gate.sh "$(v2in m1d 'gh pr merge 12 --squash')" 0 none $VS "PATH=$GHB/ok:$PATH"
run_case "인자 없는 gh pr merge(feature 브랜치) → HEAD 대조 통과" verdict-gate.sh "$(v2in m1e 'gh pr merge --squash')" 0 none $VS $VG
run_case "gh api graphql mergePullRequest → 대상 미확인 strict deny" verdict-gate.sh "$(v2in m1f 'gh api graphql -f query="mutation{mergePullRequest(input:{pullRequestId:\"x\"}){clientMutationId}}"')" 0 deny $VS $VG
t0=$(now_ms)
run_case "gh 응답 없음(sleep 30) + BAMS_VERDICT_GH_TIMEOUT=1 → strict deny" verdict-gate.sh "$(v2in m13 'gh pr merge 7')" 0 deny $VS "PATH=$GHB/slow:$PATH" BAMS_VERDICT_GH_TIMEOUT=1
t1=$(now_ms)
if [ $((t1 - t0)) -lt 8000 ]; then PASS=$((PASS + 1)); echo "  PASS  gh 호출 timeout 적용: $((t1 - t0))ms < 8000ms"
else FAIL=$((FAIL + 1)); echo "  FAIL  gh 호출이 timeout 없이 대기: $((t1 - t0))ms"; fi

echo "== verdict.sh: .crew/ 는 patch-id·dirty 에서 제외 (QA M2) =="
echo b1 > "$VR2/.crew/board.md"; v2git commit -qam "board update"
run_case ".crew/board.md 만 커밋 → patch-id 일치로 strict 통과"  verdict-gate.sh "$(v2in m2a 'gh pr merge --squash')" 0 none $VS $VG
vc=0; (cd "$VR2" && bash "$VL" check >/dev/null 2>&1) || vc=$?
if [ "$vc" = 0 ]; then PASS=$((PASS + 1)); echo "  PASS  verdict.sh check: .crew 커밋 후에도 exit 0"; else FAIL=$((FAIL + 1)); echo "  FAIL  .crew 커밋 후 check exit=$vc (기대 0)"; fi
echo b2 > "$VR2/.crew/board.md"   # 추적 중인 .crew 파일 수정(미커밋) 상태로 write
vf2=$(v2w --verdict PASS --judge-agent qa-strategy --judge-model claude-sonnet-5-5 --author-agents frontend-engineering --evidence "0:bun test" --base main)
if [ -f "$vf2" ] && jq -e '.dirty == false' "$vf2" >/dev/null 2>&1; then PASS=$((PASS + 1)); echo "  PASS  .crew 만 수정된 작업 트리 → dirty=false 기록"
else FAIL=$((FAIL + 1)); echo "  FAIL  .crew 수정이 dirty 로 기록: $(jq -c '{dirty}' "$vf2" 2>/dev/null)"; fi
v2git checkout -q -- .crew/board.md

echo "== verdict.sh: 판정자·증거 검증 강화 + written_by (QA M3) =="
vx() { local label="$1" want="$2"; shift 2; local c=0; (cd "$VR2" && bash "$VL" write "$@" >/dev/null 2>&1) || c=$?
  if [ "$c" = "$want" ]; then PASS=$((PASS + 1)); echo "  PASS  write: $label → exit $want"; else FAIL=$((FAIL + 1)); echo "  FAIL  write: $label exit=$c (기대 $want)"; fi; }
vx "판정자 대소문자만 다름(Frontend-Engineering)" 2 --verdict PASS --judge-agent Frontend-Engineering --author-agents frontend-engineering --evidence "0:bun test"
vx "판정자 공백·밑줄 변형( frontend_engineering )" 2 --verdict PASS --judge-agent ' frontend_engineering ' --author-agents 'bams-plugin:frontend-engineering' --evidence "0:bun test"
vx "evidence 명령 토큰 없음(0:i promise)" 2 --verdict PASS --judge-agent release-quality-gate --author-agents frontend-engineering --evidence "0:i promise"
vx "evidence 자리표시자(0:<cmd>)" 2 --verdict PASS --judge-agent release-quality-gate --author-agents frontend-engineering --evidence "0:<cmd>"
vx "evidence 콜론 없음(bun test)" 2 --verdict PASS --judge-agent release-quality-gate --author-agents frontend-engineering --evidence "bun test"
vx "정상: cd app && npx tsc --noEmit" 0 --verdict PASS --judge-agent release-quality-gate --author-agents frontend-engineering --evidence "0:cd app && npx tsc --noEmit"
vlast=$(ls -t "$VR2"/.crew/artifacts/review/verdict-*.json | head -1)
if jq -e '.v == 2 and (.written_by | startswith("bams-plugin/hooks/lib/verdict.sh@")) and .attestation == "self-reported"' "$vlast" >/dev/null 2>&1; then
  PASS=$((PASS + 1)); echo "  PASS  written_by(도구@버전)·attestation=self-reported 기록"
else FAIL=$((FAIL + 1)); echo "  FAIL  written_by 기록: $(jq -c '{v,written_by,attestation}' "$vlast" 2>/dev/null)"; fi
# 손으로 쓴 JSON — check 도 같은 규칙을 다시 적용한다
echo c >> "$VR2/a.txt"; v2git commit -qam hand1; H1=$(v2git rev-parse HEAD)
jq -n --arg s "$H1" '{v:1,sha:$s,verdict:"PASS",judge:{agent:"release-quality-gate"},author_agents:["frontend-engineering"],evidence:[],dirty:false}' > "$VR2/.crew/artifacts/review/verdict-hand1.json"
vo=$(cd "$VR2" && bash "$VL" check 2>/dev/null); vc=$?
if [ "$vc" = 4 ] && [ "${vo%% *}" = invalid_evidence ]; then PASS=$((PASS + 1)); echo "  PASS  check: 손으로 쓴 PASS + evidence [] → exit 4 invalid_evidence"
else FAIL=$((FAIL + 1)); echo "  FAIL  check: evidence [] PASS exit=$vc out=$vo"; fi
run_case "evidence 없는 수기 PASS → strict deny"                   verdict-gate.sh "$(v2in m3a 'gh pr merge')" 0 deny $VS $VG
vo=$(BAMS_VERDICT_GATE=warn BAMS_VERDICT_GH=off bash "$HOOKS/verdict-gate.sh" < "$TMP/m3a.json" 2>/dev/null)
if printf '%s' "$vo" | jq -e '.hookSpecificOutput.additionalContext | test("evidence")' >/dev/null 2>&1; then PASS=$((PASS + 1)); echo "  PASS  invalid_evidence warn 문구는 evidence 결함 명시"
else FAIL=$((FAIL + 1)); echo "  FAIL  invalid_evidence 문구: $vo"; fi
jq -n --arg s "$H1" '{v:1,sha:$s,verdict:"PASS",judge:{agent:"release-quality-gate"},author_agents:["frontend-engineering"],evidence:[{cmd:"bun test",exit_code:1}],dirty:false}' > "$VR2/.crew/artifacts/review/verdict-hand2.json"
vc=0; (cd "$VR2" && bash "$VL" check >/dev/null 2>&1) || vc=$?
if [ "$vc" = 4 ]; then PASS=$((PASS + 1)); echo "  PASS  check: 수기 PASS + exit≠0 evidence → exit 4"; else FAIL=$((FAIL + 1)); echo "  FAIL  exit≠0 수기 PASS check exit=$vc"; fi
jq -n --arg s "$H1" '{v:1,sha:$s,verdict:"PASS",judge:{agent:"Frontend-Engineering "},author_agents:["bams-plugin:frontend_engineering"],evidence:[{cmd:"bun test",exit_code:0}],dirty:false}' > "$VR2/.crew/artifacts/review/verdict-hand3.json"
vo=$(cd "$VR2" && bash "$VL" check 2>/dev/null); vc=$?
if [ "$vc" = 4 ] && [ "${vo%% *}" = invalid ]; then PASS=$((PASS + 1)); echo "  PASS  check: 수기 PASS 판정자 대소문자·밑줄 변형 = 구현자 → exit 4 invalid"
else FAIL=$((FAIL + 1)); echo "  FAIL  check: 판정자 정규화 exit=$vc out=$vo"; fi

echo "== verdict.sh: 덮어쓰지 않고 이력 보존 (QA m4) =="
echo d >> "$VR2/a.txt"; v2git commit -qam m4; S4=$(v2git rev-parse --short=12 HEAD)
v2w --verdict PASS --judge-agent release-quality-gate --author-agents frontend-engineering --evidence "0:bun test" >/dev/null
echo e >> "$VR2/a.txt"   # 미커밋 변경
v2w --verdict FAIL --judge-agent release-quality-gate --author-agents frontend-engineering --evidence "1:bun test" >/dev/null
n4=0; for _vf in "$VR2"/.crew/artifacts/review/verdict-"$S4"*.json; do [ -e "$_vf" ] && n4=$((n4 + 1)); done
if [ -f "$VR2/.crew/artifacts/review/verdict-$S4.json" ] && [ "$n4" = 2 ] && jq -e '.verdict == "PASS"' "$VR2/.crew/artifacts/review/verdict-$S4.json" >/dev/null; then
  PASS=$((PASS + 1)); echo "  PASS  dirty FAIL 은 verdict-$S4-<ts>.json 새 파일, 커밋 기준 PASS 파일 보존"
else FAIL=$((FAIL + 1)); echo "  FAIL  verdict 파일 이력: $(ls "$VR2"/.crew/artifacts/review/ | tr '\n' ' ')"; fi
v2git checkout -q -- a.txt
vc=0; (cd "$VR2" && bash "$VL" check >/dev/null 2>&1) || vc=$?
if [ "$vc" = 0 ]; then PASS=$((PASS + 1)); echo "  PASS  작업 트리 복구 후 check → 커밋 기준 PASS(exit 0)"; else FAIL=$((FAIL + 1)); echo "  FAIL  복구 후 check exit=$vc (기대 0 — PASS 소실)"; fi
sleep 1; v2w --verdict FAIL --judge-agent qa-strategy --author-agents frontend-engineering --evidence "1:bun test" >/dev/null
vc=0; (cd "$VR2" && bash "$VL" check >/dev/null 2>&1) || vc=$?
n4=0; for _vf in "$VR2"/.crew/artifacts/review/verdict-"$S4"*.json; do [ -e "$_vf" ] && n4=$((n4 + 1)); done
if [ "$vc" = 3 ] && [ "$n4" = 3 ]; then PASS=$((PASS + 1)); echo "  PASS  같은 커밋의 더 새 FAIL → check exit 3(최신 판정 우선), 파일 3개 보존"
else FAIL=$((FAIL + 1)); echo "  FAIL  최신 FAIL 우선: exit=$vc files=$n4"; fi

echo "== verdict-gate.sh: 명령 정규화 — 우회 차단 (QA m1) =="
VR3="$TMP/vrepo3"
mkdir -p "$VR3/.crew" && git -C "$VR3" init -q && git -C "$VR3" -c user.email=t@t -c user.name=t -c commit.gpgsign=false checkout -q -b main \
  && echo a > "$VR3/a" && git -C "$VR3" add a && git -C "$VR3" -c user.email=t@t -c user.name=t -c commit.gpgsign=false commit -qm b \
  && git -C "$VR3" checkout -q -b feat
n=0
while IFS= read -r c; do
  [ -n "$c" ] || continue; n=$((n + 1))
  run_case "대상: $c → strict deny" verdict-gate.sh "$(v2in nb$n "$c" "$VR3")" 0 deny $VS $VG
done <<'CMDS'
git push origin "main"
git push origin 'HEAD:main'
bash -c "git push origin main"
sh -lc 'git push origin main'
env FOO=1 git push origin main
command git push origin main
/usr/bin/git push origin main
git --no-pager push origin main
git -c push.default=current -C . push origin +main
sudo -u me git push origin refs/heads/main
timeout 30 git push origin main
eval "git push origin main"
\git push origin @:main
gh -R o/r pr merge 1
gh --repo=o/r pr merge 1
gh api -X PUT repos/o/r/pulls/12/merge
gh api --method=PUT /repos/o/r/pulls/12/merge -f merge_method=squash
CMDS
run_case "대상: sh -c 'cd <repo> && git push origin main'(다른 cwd) → strict deny" verdict-gate.sh "$(v2in nbcd "sh -c 'cd $VR3 && git push origin main'" "$TMP")" 0 deny $VS $VG
git -C "$VR3" config branch.feat.remote origin; git -C "$VR3" config branch.feat.merge refs/heads/main; git -C "$VR3" config push.default upstream
git -C "$VR3" update-ref refs/remotes/origin/main HEAD; git -C "$VR3" config remote.origin.url /nonexistent
git -C "$VR3" config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'
run_case "대상: push.default=upstream(feat→origin/main) 인자 없는 git push → strict deny" verdict-gate.sh "$(v2in nbup 'git push' "$VR3")" 0 deny $VS $VG
git -C "$VR3" config --unset push.default; git -C "$VR3" config branch.feat.merge refs/heads/feat
while IFS= read -r c; do
  [ -n "$c" ] || continue; n=$((n + 1))
  run_case "오탐 없음: $c → 통과" verdict-gate.sh "$(v2in nf$n "$c" "$VR3")" 0 none $VS $VG
done <<'CMDS'
git push -u origin feat
git push origin HEAD
git push origin "feat"
git commit -m "wip; git push origin main"
git commit -m 'release: gh pr merge && vercel --prod'
echo "git push origin main"
git log --grep="merge" --oneline
gh api repos/o/r/pulls/12/merge
gh pr view 12 --json mergeable
git push --dry-run origin main
git push origin --delete main
npm run deploy -- --prod-like
bun test 2>&1 | tail -5
git push origin feat 2>&1 | tail -3
CMDS

echo "== 커맨드 문서 verdict 확인 블록: 자기완결·도구 부재 구분 (QA m6) =="
for f in ship.md deploy.md review.md hotfix/step-5-deploy.md feature/phase-4-deploy.md; do
  blk=$(awk '/^if \[ -z "\$_VD" \]/ { print prev; print; exit } { prev = $0 }' "$HERE/../../commands/bams/$f")
  nl=$(printf '%s\n' "$blk" | grep -c .)
  mkdir -p "$TMP/emptycwd"; o1=$(cd "$TMP/emptycwd" && HOME="$TMP/nohome" bash -c "$blk" 2>/dev/null | tail -1)
  mkdir -p "$TMP/vdhome/.claude/plugins/cache/my-claude/bams-plugin/9.9.9/hooks"
  ln -sfn "$HOOKS/lib" "$TMP/vdhome/.claude/plugins/cache/my-claude/bams-plugin/9.9.9/hooks/lib"
  o2=$(cd "$VR3" && HOME="$TMP/vdhome" bash -c "$blk" 2>/dev/null | tail -1)
  if [ "$nl" = 2 ] && [ "${o1%% *}" = "verdict_exit=unavailable" ] && [ "$o2" = "verdict_exit=1" ]; then
    PASS=$((PASS + 1)); echo "  PASS  $f: 한 블록(리졸버+check) — 도구 없음=unavailable, verdict 없음=1"
  else FAIL=$((FAIL + 1)); echo "  FAIL  $f: lines=$nl 도구없음=[$o1] verdict없음=[$o2]"; fi
done

echo "== metrics.sh (계측 → events.jsonl) =="
MD="$TMP/metrics"; MW="$TMP/mw"; MFX="$FX/metrics"; MBAD=0
mkdir -p "$MW/proj/.git" "$MW/proj/sub" "$MW/proj/.crew"
cp "$MFX/transcript-main-head.jsonl" "$MW/main.jsonl"; cp "$MFX/transcript-agent.jsonl" "$MW/agent-ag-1.jsonl"
# mrun <fixture> [env...] — __D__ 를 작업 디렉터리로 치환해 stdin 으로 넣는다. stdout 출력·exit≠0 은 위반(MBAD)
mrun() {
  local f="$1" out code; shift
  sed "s|__D__|$MW|g" "$MFX/$f" > "$TMP/mfx.json"
  out=$(env -u BAMS_METRICS -u BAMS_HOOK_TRACE -u BAMS_HOOK_CAPTURE_DIR BAMS_METRICS_DIR="$MD" "$@" bash "$HOOKS/metrics.sh" < "$TMP/mfx.json" 2>&1); code=$?
  [ "$code" = 0 ] && [ -z "$out" ] || { MBAD=$((MBAD + 1)); echo "    (위반: $f exit=$code out=$out)"; }
}
# mcheck <label> <jq 조건: 입력 = events.jsonl 전체 배열>
mcheck() {
  if jq -se "$2" "$MD/events.jsonl" >/dev/null 2>&1; then PASS=$((PASS + 1)); echo "  PASS  $1"
  else FAIL=$((FAIL + 1)); echo "  FAIL  $1 — 조건: $2"; fi
}
# 파이프라인 시작 시각을 <초> 만큼 과거로 — 시작 직후 3초 내 입력 무시 규칙을 우회
age_state() { local f="$MD/state/$1.open" a b c e; IFS=$'\x1f' read -r a b c e < "$f"; printf '%s\x1f%s\x1f%s\x1f%s\n' "$a" "$b" "$c" "$((e - $2))" > "$f"; }
ev_of() { printf 'map(select(.ev == "%s"))' "$1"; }

mrun upe-dev.json
mcheck "UserPromptExpansion → pipeline_start(dev, git 루트 이름, source=expansion)" \
  "$(ev_of pipeline_start) | length == 1 and (.[0] | .command == \"dev\" and .project == \"proj\" and .source == \"expansion\" and .pipeline == \"dev\" and .pipeline_ts == .ts and .session_id == \"m-sess-1\")"
mcheck "args 앞 80자만 저장" "$(ev_of pipeline_start) | .[0].args | length == 80"
mrun ups-slash-dev-same-prompt.json
mcheck "같은 prompt_id 의 UserPromptSubmit 슬래시 → 중복 기록 없음" "$(ev_of pipeline_start) | length == 1"
mrun ups-human.json
mcheck "시작 직후(3초 내) 입력 → human_turn 아님" "$(ev_of human_turn) | length == 0"
age_state m-sess-1 60
mrun ups-human.json
mrun ups-task-notification.json; mrun ups-other-slash.json
mcheck "파이프라인 중 사람 입력 1건만 human_turn(task-notification·/compact 제외)" \
  "$(ev_of human_turn) | length == 1 and .[0].pipeline == \"dev\" and .[0].pipeline_ts != null"
if grep -q 'SECRET-PROMPT-BODY\|비밀 메모: 0123456789012345678901234567890123456789012345678901234567890' "$MD/events.jsonl"; then
  FAIL=$((FAIL + 1)); echo "  FAIL  프롬프트 본문/80자 초과 args 가 저장됨"
else PASS=$((PASS + 1)); echo "  PASS  프롬프트 본문 미저장(args 80자 외 없음)"; fi
mrun sub-start.json
mrun sub-stop.json
mcheck "SubagentStop → agent_end usage 합(message.id 중복 제거·깨진 줄·<synthetic> 무시)" \
  "$(ev_of agent_end) | map(select(.agent_id == \"ag-1\")) | length == 1 and (.[0] | .agent_type == \"bams-plugin:backend-engineering\" and .pipeline == \"dev\"
     and .usage.input == 15 and .usage.output == 150 and .usage.cache_read == 3000 and .usage.cache_creation == 500 and .usage.messages == 2
     and (.usage.by_model | keys) == [\"claude-haiku-5-5\", \"claude-opus-5-5\"])"
mcheck "SubagentStart 짝 → dur_ms(start_pair) + transcript 첫/끝 시각" \
  "$(ev_of agent_end) | .[0] | (.dur_ms | type) == \"number\" and .dur_ms >= 0 and .dur_src == \"start_pair\" and .t_first == \"2026-11-05T01:00:00.000Z\" and .t_last == \"2026-11-05T01:02:00.000Z\""
mrun sub-stop-no-transcript.json
mcheck "transcript 부재 → agent_end 기록, usage=null·dur_ms=null" \
  "$(ev_of agent_end) | map(select(.agent_id == \"ag-9\")) | length == 1 and .[0].usage == null and .[0].dur_ms == null"
mrun sub-stop-internal.json
mcheck "agent_type 빈 내부 에이전트(SubagentStop) → 기록 안 함" "$(ev_of agent_end) | length == 2"
cat "$MFX/transcript-main-tail.jsonl" >> "$MW/main.jsonl"
mrun stop.json; mrun stop.json
mcheck "Stop → session_usage = 시작 이후 증분만(중복 id 1회), 새 줄 없으면 미기록" \
  "$(ev_of session_usage) | length == 1 and (.[0].usage | .input == 4 and .output == 320 and .cache_read == 82000 and .cache_creation == 2000 and .cache_creation_1h == 2000 and .messages == 2)"
mrun post-edit-other.json
mcheck "history.md 아닌 Edit → 기록 없음" "$(ev_of pipeline_end) | length == 0"
mrun post-history-edit.json; mrun post-history-edit.json
mcheck "history.md Edit → pipeline_end(새 헤더 slug·status·result), 같은 블록 재편집은 1회" \
  "$(ev_of pipeline_end) | length == 1 and (.[0] | .slug == \"dev_결제버그묶음\" and .status == \"DONE_WITH_CONCERNS\" and .result == \"concerns\" and .command == \"dev\" and .pipeline == \"dev\" and .project == \"proj\" and .parse == \"diff\")"
mcheck "pipeline_end.dur_ms(시작→기록, age 60초) · agent_spawns(열린 파이프라인 중 SubagentStart 1회)" \
  "$(ev_of pipeline_end) | .[0] | (.dur_ms | type) == \"number\" and .dur_ms >= 60000 and .dur_ms < 120000 and .agent_spawns == 1"
age_state_closing() { [ -f "$MD/state/m-sess-1.closing" ]; }
if age_state_closing; then PASS=$((PASS + 1)); echo "  PASS  pipeline_end → 세션 상태 closing(마지막 Stop usage 대기)"
else FAIL=$((FAIL + 1)); echo "  FAIL  pipeline_end 후 closing 상태 없음"; fi
mrun ups-human.json
mcheck "파이프라인 종료 후 입력 → human_turn 아님" "$(ev_of human_turn) | length == 1"
jq -cn '{type:"assistant",timestamp:"2026-11-05T01:05:00.000Z",message:{id:"msg_m3",model:"claude-opus-5-5",usage:{input_tokens:2,output_tokens:7}}}' >> "$MW/main.jsonl"
mrun stop.json; mrun stop.json
mcheck "종료 직후 Stop 1회 usage 기록 후 상태 정리" "$(ev_of session_usage) | length == 2 and .[1].usage.output == 7 and .[1].pipeline == \"dev\""
if [ ! -e "$MD/state/m-sess-1.closing" ] && [ ! -e "$MD/state/m-sess-1.open" ]; then PASS=$((PASS + 1)); echo "  PASS  세션 상태 파일 정리됨"
else FAIL=$((FAIL + 1)); echo "  FAIL  세션 상태 파일 잔존"; fi
mrun ups-slash-hotfix.json
mcheck "UserPromptSubmit '/bams:hotfix …' → pipeline_start(source=prompt_submit)" \
  "$(ev_of pipeline_start) | map(select(.session_id == \"m-sess-2\")) | length == 1 and .[0].command == \"hotfix\" and .[0].source == \"prompt_submit\" and .[0].args == \"로그인 500 에러\""
mrun post-history-write.json
mcheck "history.md Write(originalFile 대비) → 1줄 형식 새 행 파싱(실패=failed)" \
  "$(ev_of pipeline_end) | map(select(.session_id == \"m-sess-2\")) | length == 1 and (.[0] | .slug == \"hotfix_로그인500\" and .command == \"hotfix\" and .status == \"실패\" and .result == \"failed\" and .pipeline == \"hotfix\")"
mcheck "spawn 없는 파이프라인 → agent_spawns 0" \
  "$(ev_of pipeline_end) | map(select(.session_id == \"m-sess-2\")) | .[0] | .agent_spawns == 0 and (.dur_ms | type) == \"number\""
mrun post-history-noopen.json
mcheck "열린 파이프라인 없이 history 기록 → pipeline_end(dur_ms·agent_spawns = null)" \
  "$(ev_of pipeline_end) | map(select(.session_id == \"m-sess-8\")) | length == 1 and (.[0] | .slug == \"plan_알림설정\" and .result == \"success\" and .dur_ms == null and .agent_spawns == null and .pipeline == null)"
mrun post-skill-hotfix.json; mrun post-skill-nested.json; mrun post-skill-engine.json
mcheck "Skill tool bams:hotfix → pipeline_start(skill_tool), 열린 파이프라인 안 Skill·엔진 스킬은 무시" \
  "$(ev_of pipeline_start) | map(select(.session_id == \"m-sess-3\")) | length == 1 and .[0].command == \"hotfix\" and .[0].source == \"skill_tool\""
# 실제 등록 이름(/bams-plugin:bams:<cmd>, Skill bams-plugin:bams:<cmd>)과 짧은 이름(bams:<cmd>) 모두 pipeline_start, 일반 스킬은 무시
mrun ups-slash-full-dev.json
mcheck "UserPromptSubmit '/bams-plugin:bams:dev …'(전체 이름) → pipeline_start(dev, prompt_submit)" \
  "$(ev_of pipeline_start) | map(select(.session_id == \"m-sess-4\")) | length == 1 and .[0].command == \"dev\" and .[0].source == \"prompt_submit\" and .[0].args == \"결제 버그 묶음\""
mrun post-skill-short-qa.json; mrun upe-short-verify.json
mcheck "짧은 이름 Skill 'bams:qa'·Expansion 'bams:verify' → pipeline_start" \
  "($(ev_of pipeline_start) | map(select(.session_id == \"m-sess-5\")) | length == 1 and .[0].command == \"qa\" and .[0].source == \"skill_tool\")
   and ($(ev_of pipeline_start) | map(select(.session_id == \"m-sess-6\")) | length == 1 and .[0].command == \"verify\" and .[0].source == \"expansion\")"
mrun post-skill-plain.json; mrun ups-slash-plain-skill.json
mcheck "일반 스킬 bams-plugin:git-sync(Skill·슬래시) → pipeline_start 없음" \
  "$(ev_of pipeline_start) | map(select(.session_id == \"m-sess-7\")) | length == 0"
mcheck "모든 줄 공통 필드 + 자리표시자 잔존 0" \
  'all(.[]; .v == 1 and (.ts | test("Z$")) and (.ev | type) == "string" and (.project | type) == "string") and ([.[] | tostring | select(test("__(PROJ|PCMD|PTS|DUR|PDUR|SPAWN)__"))] | length == 0)'
n0=$(wc -l < "$MD/events.jsonl")
mrun upe-dev.json BAMS_METRICS_DIR="$TMP/moff" BAMS_METRICS=off
if [ ! -e "$TMP/moff" ]; then PASS=$((PASS + 1)); echo "  PASS  BAMS_METRICS=off → 디렉터리·기록 없음"
else FAIL=$((FAIL + 1)); echo "  FAIL  BAMS_METRICS=off 인데 기록됨"; fi
for bad in "$FX/broken.json" /dev/null; do
  out=$(BAMS_METRICS_DIR="$MD" bash "$HOOKS/metrics.sh" < "$bad" 2>&1); code=$?
  if [ "$code" = 0 ] && [ -z "$out" ]; then PASS=$((PASS + 1)); echo "  PASS  ${bad##*/} 입력 → fail-open"
  else FAIL=$((FAIL + 1)); echo "  FAIL  ${bad##*/} 입력 (exit=$code out=$out)"; fi
done
printf '{"hook_event_name":"UserPromptExpansion","session_id":"x","command_name":"bams:dev","command_args":' > "$TMP/trunc.json"
mrun upe-dev.json BAMS_METRICS_DIR=/nonexistent-root/metrics
out=$(BAMS_METRICS_DIR="$MD" bash "$HOOKS/metrics.sh" < "$TMP/trunc.json" 2>&1); code=$?
if [ "$code" = 0 ] && [ -z "$out" ] && [ "$(wc -l < "$MD/events.jsonl")" = "$n0" ]; then PASS=$((PASS + 1)); echo "  PASS  잘린 JSON·쓰기 불가 디렉터리 → fail-open, 기록 없음"
else FAIL=$((FAIL + 1)); echo "  FAIL  잘린 JSON/쓰기 불가 처리 (exit=$code out=$out)"; fi
if [ "$MBAD" = 0 ]; then PASS=$((PASS + 1)); echo "  PASS  모든 실행 exit 0·stdout 없음(컨텍스트 주입 없음)"
else FAIL=$((FAIL + 1)); echo "  FAIL  exit≠0 또는 stdout 출력 ${MBAD}건"; fi

echo "== metrics.sh: plugin.json 등록 =="
for e in UserPromptExpansion UserPromptSubmit PostToolUse SubagentStart SubagentStop Stop; do
  if jq -e --arg e "$e" '[.hooks[$e][]?.hooks[]?.command | select(test("hooks/metrics\\.sh"))] | length == 1' "$PJ" >/dev/null 2>&1; then
    PASS=$((PASS + 1)); echo "  PASS  $e → metrics.sh 1회 등록"
  else FAIL=$((FAIL + 1)); echo "  FAIL  $e 에 metrics.sh 등록 없음/중복"; fi
done
MPM=$(jq -r '[.hooks.PostToolUse[]? | select(any(.hooks[]?; .command | test("metrics"))) | .matcher // ""][0]' "$PJ")
for t in Edit Write Skill Bash TodoWrite TaskCreate TaskUpdate; do matcher_case "PostToolUse matcher '$MPM' → $t" "$MPM" "$t" match; done
for t in Read NotebookEdit ToolSearch TaskList; do matcher_case "PostToolUse matcher '$MPM' ↛ $t" "$MPM" "$t" nomatch; done
# 순서 보장(경합 방지): completion guard 가 Stop 에서 읽는 .track 은 PostToolUse metrics 가 쓴다 — 동기여야
#   도구 결과가 모델에 돌아가기 전에 기록이 끝나 최종 응답 뒤 Stop 이 항상 본다(async 면 Stop 과 경합).
if jq -e '[.hooks.PostToolUse[]?.hooks[]? | select(.command | test("hooks/metrics\\.sh"))] | length == 1 and all(.[]; (.async // false) == false)' "$PJ" >/dev/null 2>&1; then
  PASS=$((PASS + 1)); echo "  PASS  PostToolUse metrics = 동기(.track 기록이 Stop 보다 먼저 끝남)"
else FAIL=$((FAIL + 1)); echo "  FAIL  PostToolUse metrics 가 async — Stop guard 와 경합"; fi
MSM=$(jq -r '[.hooks.SubagentStop[]? | select(any(.hooks[]?; .command | test("metrics"))) | .matcher // ""][0]' "$PJ")
for a in bams-plugin:qa-strategy Explore general-purpose; do matcher_case "SubagentStop(metrics) 전체 매칭 → $a" "$MSM" "$a" match; done
if jq -e '[(.hooks.SubagentStop, .hooks.Stop)[]?.hooks[]? | select(.command | test("metrics")) | .async] == [true, true]' "$PJ" >/dev/null; then
  PASS=$((PASS + 1)); echo "  PASS  SubagentStop·Stop metrics = async(transcript 파싱이 종료를 막지 않음)"
else FAIL=$((FAIL + 1)); echo "  FAIL  SubagentStop/Stop metrics async 아님"; fi

echo "== metrics.sh: 실행 시간 (10회 평균) =="
# mtime <label> <fixture> <상한ms> [env...]
mtime() {
  local label="$1" f="$2" lim="$3" t0 t1 avg i=0; shift 3
  sed "s|__D__|$MW|g" "$MFX/$f" > "$TMP/mt.json"
  t0=$(now_ms)
  while [ $i -lt 10 ]; do env BAMS_METRICS_DIR="$TMP/mtime" "$@" bash "$HOOKS/metrics.sh" < "$TMP/mt.json" >/dev/null 2>&1; i=$((i + 1)); done
  t1=$(now_ms); avg=$(( (t1 - t0) / 10 ))
  if [ "$avg" -le "$lim" ]; then PASS=$((PASS + 1)); echo "  PASS  $label 평균 ${avg}ms ≤ ${lim}ms"
  else FAIL=$((FAIL + 1)); echo "  FAIL  $label 평균 ${avg}ms > ${lim}ms"; fi
}
mtime "Stop(파이프라인 없음, jq 0회)"           stop.json            50
mtime "PostToolUse 일반 Edit(jq 0회)"           post-edit-other.json 50
mtime "PostToolUse 일반 Bash(jq 0회)"           post-bash-other.json 50
mtime "UserPromptSubmit 일반 입력(jq 0회)"      ups-human.json       50
mtime "UserPromptExpansion 시작(jq 1회)"        upe-dev.json         100
mtime "SubagentStop transcript 파싱(jq 2회)"    sub-stop.json        100

echo "== pipeline-completion-guard.sh (Stop — review/deep-review/ship/deploy 완료 조건) =="
# 상태는 metrics.sh 와 같은 형식(<dir>/state/<sid>.open = ts␟cmd␟prompt_id␟epoch_s). 파이프라인 시작 = 지금-100초.
CG="$TMP/cg"; CGM="$CG/metrics"; CGR="$CG/repo"
mkdir -p "$CGM/state" "$CGR/.git" "$CGR/sub" "$CGR/.crew/artifacts/review"
CG_EP=$(( $(date +%s) - 100 ))
cg_iso() { jq -rn --argjson e "$1" '$e | todate | sub("Z$"; ".000Z")'; }
CG_AFTER=$(cg_iso $((CG_EP + 10))); CG_BEFORE=$(cg_iso $((CG_EP - 50)))
# cg_state <sid> <cmd> [epoch]  — 열린 파이프라인 상태(+ 이전 판정 marker 제거)
cg_state() {
  printf '%s\037%s\037%s\037%s\n' "$(jq -rn --argjson e "${3:-$CG_EP}" '$e | todate')" "$2" "p-$1" "${3:-$CG_EP}" > "$CGM/state/$1.open"
  rm -f "$CGM/state/$1.cguard" "$CGM/state/$1.closing"
}
# cg_tx <name> <spec...> — transcript. T=시작 후 TodoWrite(3항목) · TB=시작 전 TodoWrite · TK=TaskCreate
#   TS:<text>=시작 후 TodoWrite(항목 1개 내용 text) · VC=`bash "$_VD" check` · VS=`bash .../verdict.sh check --dir .`
#   X:<text>=시작 후 assistant 텍스트 · G=무관한 Bash
cg_tx() {
  local t="$TMP/cg-$1.jsonl" s; shift; : > "$t"
  for s in "$@"; do
    case "$s" in
      T)  jq -cn --arg ts "$CG_AFTER" '{type:"assistant",timestamp:$ts,message:{content:[{type:"tool_use",id:"t1",name:"TodoWrite",input:{todos:[{content:"1. diff 수집",status:"in_progress"},{content:"2. 5관점 리뷰",status:"pending"},{content:"3. verdict 기록",status:"pending"}]}}]}}' ;;
      TB) jq -cn --arg ts "$CG_BEFORE" '{type:"assistant",timestamp:$ts,message:{content:[{type:"tool_use",id:"t0",name:"TodoWrite",input:{todos:[{content:"이전 작업",status:"completed"}]}}]}}' ;;
      TK) jq -cn --arg ts "$CG_AFTER" '{type:"assistant",timestamp:$ts,message:{content:[{type:"tool_use",id:"t2",name:"TaskCreate",input:{subject:"1. diff 수집"}}]}}' ;;
      TS:*) jq -cn --arg ts "$CG_AFTER" --arg c "${s#TS:}" '{type:"assistant",timestamp:$ts,message:{content:[{type:"tool_use",id:"t3",name:"TodoWrite",input:{todos:[{content:$c,status:"completed"}]}}]}}' ;;
      VC) jq -cn --arg ts "$CG_AFTER" '{type:"assistant",timestamp:$ts,message:{content:[{type:"tool_use",id:"b1",name:"Bash",input:{command:"_VD=\"$_BAMS/hooks/lib/verdict.sh\"\nif [ -z \"$_VD\" ]; then echo unavailable; else bash \"$_VD\" check; echo \"verdict_exit=$?\"; fi"}}]}}' ;;
      VS) jq -cn --arg ts "$CG_AFTER" '{type:"assistant",timestamp:$ts,message:{content:[{type:"tool_use",id:"b2",name:"Bash",input:{command:"bash /x/hooks/lib/verdict.sh check --dir ."}}]}}' ;;
      X:*) jq -cn --arg ts "$CG_AFTER" --arg x "${s#X:}" '{type:"assistant",timestamp:$ts,message:{content:[{type:"text",text:$x}]}}' ;;
      G)  jq -cn --arg ts "$CG_AFTER" '{type:"assistant",timestamp:$ts,message:{content:[{type:"tool_use",id:"b3",name:"Bash",input:{command:"cat change.diff | grep verdict"}}]}}' ;;
    esac >> "$t"
  done
  echo "$t"
}
# cg_in <name> <sid> <transcript> [active=false] [last=완료] [cwd=$CGR]
cg_in() {
  jq -cn --arg s "$2" --arg t "$3" --argjson a "${4:-false}" --arg l "${5:-리뷰 완료}" --arg c "${6:-$CGR}" \
    '{session_id:$s,transcript_path:$t,cwd:$c,permission_mode:"default",hook_event_name:"Stop",stop_hook_active:$a,last_assistant_message:$l}' > "$TMP/cg-in-$1.json"
  echo "$TMP/cg-in-$1.json"
}
cg_run() { local l="$1" i="$2" w="$3"; shift 3; run_case "$l" pipeline-completion-guard.sh "$i" 0 "$w" BAMS_METRICS_DIR="$CGM" "$@"; }
# cg_reason <input> <has|lacks> <고정 문자열> — block reason 내용 확인(marker 영향 없게 상태 재설정은 호출 측)
cg_reason() {
  local o ok=0
  o=$(env -u BAMS_COMPLETION_GUARD -u BAMS_METRICS BAMS_METRICS_DIR="$CGM" bash "$HOOKS/pipeline-completion-guard.sh" < "$1" 2>/dev/null | jq -r '.reason // .systemMessage // ""' 2>/dev/null)
  printf '%s' "$o" | grep -qF -- "$3" && ok=1
  if { [ "$2" = has ] && [ $ok = 1 ]; } || { [ "$2" = lacks ] && [ $ok = 0 ]; }; then PASS=$((PASS + 1)); echo "  PASS  $4"
  else FAIL=$((FAIL + 1)); echo "  FAIL  $4 ($2 '$3' / reason: ${o:0:200})"; fi
}
rm -f "$CGR"/.crew/artifacts/review/verdict-*.json
cg_run "파이프라인 없음 → 통과" "$(cg_in n0 cg-none "$(cg_tx empty)")" none
cg_state cg-dev dev
cg_run "열린 파이프라인이 대상 외(dev) → 통과" "$(cg_in n1 cg-dev "$(cg_tx empty)")" none
cg_state cg-r1 review
cg_run "review: TodoWrite·verdict 없음 → block" "$(cg_in r1 cg-r1 "$(cg_tx g G)")" block
cg_run "같은 파이프라인 두 번째 Stop(다음 턴) → 통과(파이프라인당 1회)" "$(cg_in r1b cg-r1 "$(cg_tx g G)")" none
cg_state cg-r1 review
cg_reason "$(cg_in r1c cg-r1 "$(cg_tx g G)")" has "작업 목록 도구(TaskCreate/TaskUpdate, 없으면 ToolSearch \`select:TaskCreate,TaskUpdate\`로 로드 / TodoWrite) 미사용" "block 사유: 작업 목록 누락 + 복구 방법(TaskCreate·ToolSearch 로드)"
cg_state cg-r1 review
cg_reason "$(cg_in r1d cg-r1 "$(cg_tx g G)")" has "verdict.sh' write --verdict" "block 사유: verdict 누락 + verdict.sh write 절대 경로"
cg_state cg-r2 review
cg_run "review: stop_hook_active=true → 통과" "$(cg_in r2 cg-r2 "$(cg_tx g G)" true)" none
cg_state cg-r3 review
cg_run "review: TodoWrite만(verdict 없음) → block" "$(cg_in r3 cg-r3 "$(cg_tx t T)")" block
cg_state cg-r3 review
cg_reason "$(cg_in r3b cg-r3 "$(cg_tx t T)")" lacks "작업 목록 도구" "TodoWrite 있으면 사유에 작업 목록 누락 없음"
touch -t 202001010000 "$CGR/.crew/artifacts/review/verdict-old.json"
cg_state cg-r4 review
cg_run "review: TodoWrite + 시작 전 verdict 파일만 → block" "$(cg_in r4 cg-r4 "$(cg_tx t T)")" block
echo '{}' > "$CGR/.crew/artifacts/review/verdict-abc123.json"
cg_state cg-r5 review
cg_run "review: TodoWrite + 시작 이후 verdict 파일 → 통과" "$(cg_in r5 cg-r5 "$(cg_tx t T)")" none
if grep -q " ok$" "$CGM/state/cg-r5.cguard" 2>/dev/null; then PASS=$((PASS + 1)); echo "  PASS  충족 → marker ok(이후 Stop 은 transcript 미파싱)"
else FAIL=$((FAIL + 1)); echo "  FAIL  충족 후 marker ok 없음"; fi
cg_state cg-r6 deep-review
cg_run "deep-review: 하위 cwd → git 루트의 verdict 파일 인정" "$(cg_in r6 cg-r6 "$(cg_tx t T)" false 완료 "$CGR/sub")" none
rm -f "$CGR/.crew/artifacts/review/verdict-abc123.json"
cg_state cg-r7 review
cg_run "review: TodoWrite + 최종 메시지 'skip: verdict — 사유' → 통과" "$(cg_in r7 cg-r7 "$(cg_tx t T)" false $'리뷰 결과\n- skip: verdict — 리뷰 대상 커밋 없음(diff 파일만)')" none
cg_state cg-r8 review
cg_run "review: 'skip:' 사유 없음 → block" "$(cg_in r8 cg-r8 "$(cg_tx t T)" false $'- verdict skip:')" block
cg_state cg-r9 review
cg_run "review: verdict 언급 없는 skip → block" "$(cg_in r9 cg-r9 "$(cg_tx t T)" false $'- skip: 회고 생략(경량 리뷰)')" block
cg_state cg-r10 review
cg_run "review: TodoWrite 항목 'skip: 판정 — 사유' → 통과" "$(cg_in r10 cg-r10 "$(cg_tx ts 'TS:5. 판정 기록 — skip: 커밋 없는 diff 리뷰')")" none
cg_state cg-r11 review
cg_run "review: 시작 전 TodoWrite + 시작 후 verdict skip → block(todo 누락)" "$(cg_in r11 cg-r11 "$(cg_tx tb TB X:'skip: verdict — 사유 있음')")" block
cg_state cg-r12 review
cg_run "review: 시작 전 TodoWrite 만 + verdict skip 없음 → block" "$(cg_in r12 cg-r12 "$(cg_tx tb2 TB)")" block
cg_state cg-r13 review
cg_run "review: TaskCreate(새 todo 도구) + skip → 통과" "$(cg_in r13 cg-r13 "$(cg_tx tk TK)" false 'skip: verdict — 판정자 미연결')" none
cg_state cg-r14 review
cg_run "review: Steps 원문 자리표시자 '— skip: <사유>' 그대로 복사 → block" "$(cg_in r14 cg-r14 "$(cg_tx r14 'TS:13. verdict 파일 확인 — `.crew/artifacts/review/verdict-*.json` 생성(`verdict.sh check`), 못 남기면 `— skip: <사유>`')")" block
cg_state cg-d1 deep-review
cg_run "deep-review: TodoWrite + Step 12 '— skip: deep-review 게이트 미포함' → 통과" "$(cg_in d1 cg-d1 "$(cg_tx d1 'TS:12. verdict 파일 — 게이트 미포함이므로 기본 `— skip: deep-review 게이트 미포함 (판정은 /bams:review·/bams:ship)`')")" none
cg_state cg-d2 deep-review
cg_run "deep-review: TodoWrite 만(Step 12 skip 줄 없음) → block" "$(cg_in d2 cg-d2 "$(cg_tx d2 T)")" block
cg_state cg-d2 deep-review
cg_reason "$(cg_in d2b cg-d2 "$(cg_tx d2 T)")" has "deep-review 게이트 미포함" "deep-review block 사유: Step 12 skip 표기 안내"
cg_state cg-s1 ship
cg_run "ship: TodoWrite + \$_VD check + 최종 'verdict_exit=0' → 통과" "$(cg_in s1 cg-s1 "$(cg_tx s1 T VC)" false $'PR 생성 완료\nverdict_exit=0')" none
cg_state cg-s1b ship
cg_run "ship: check 실행했지만 최종 메시지에 verdict_exit 줄 없음 → block" "$(cg_in s1b cg-s1b "$(cg_tx s1b T VC)")" block
cg_state cg-s1c ship
cg_run "ship: check 없이 'skip: verdict — 사유' → block(skip 불가)" "$(cg_in s1c cg-s1c "$(cg_tx s1c T)" false $'- skip: verdict — gh 없음\nverdict_exit=unavailable')" block
cg_state cg-s1d ship
cg_run "ship: 자리표시자 'verdict_exit=<n>' → block" "$(cg_in s1d cg-s1d "$(cg_tx s1d T VC)" false 'verdict_exit=<n>')" block
cg_state cg-s2 ship
cg_run "ship: TodoWrite만(check 없음) → block" "$(cg_in s2 cg-s2 "$(cg_tx s2 T G)")" block
cg_state cg-s2 ship
cg_reason "$(cg_in s2b cg-s2 "$(cg_tx s2 T G)")" has "verdict 확인 미실행" "ship block 사유: verdict check 누락"
cg_state cg-s3 deploy
cg_run "deploy: TodoWrite + verdict.sh check --dir + 'verdict_exit=unavailable' → 통과" "$(cg_in s3 cg-s3 "$(cg_tx s3 T VS)" false '- verdict_exit=unavailable (도구 없음) → 배포 중단')" none
cg_state cg-s4 ship
cg_run "ship: TodoWrite만(check·verdict_exit 없음) → block" "$(cg_in s4 cg-s4 "$(cg_tx s4 T)")" block
cg_state cg-c1 review; mv "$CGM/state/cg-c1.open" "$CGM/state/cg-c1.closing"
cg_run "pipeline_end 후(closing) → 통과" "$(cg_in c1 cg-c1 "$(cg_tx g G)")" none
cg_state cg-c2 review $((CG_EP - 50000))
cg_run "12시간 지난 상태 → 통과" "$(cg_in c2 cg-c2 "$(cg_tx g G)")" none
cg_state cg-c3 review
cg_run "transcript 파일 없음(--no-session-persistence) + 기록 없음 → block(통과 아님)" "$(cg_in c3 cg-c3 "$TMP/none.jsonl")" block
cg_run "BAMS_COMPLETION_GUARD=off → 통과" "$(cg_in c4 cg-c3 "$(cg_tx g G)")" none BAMS_COMPLETION_GUARD=off
cg_run "BAMS_METRICS=off(상태 없음 취급) → 통과" "$(cg_in c5 cg-c3 "$(cg_tx g G)")" none BAMS_METRICS=off
cg_state cg-c3 review
wo=$(env BAMS_METRICS_DIR="$CGM" BAMS_COMPLETION_GUARD=warn bash "$HOOKS/pipeline-completion-guard.sh" < "$(cg_in c6 cg-c3 "$(cg_tx g G)")" 2>/dev/null)
if printf '%s' "$wo" | jq -e '(.systemMessage | test("completion-guard")) and (has("decision") | not)' >/dev/null 2>&1; then PASS=$((PASS + 1)); echo "  PASS  warn → systemMessage 만(차단 없음)"
else FAIL=$((FAIL + 1)); echo "  FAIL  warn 출력: $wo"; fi
cg_run "warn 1회 후 같은 파이프라인 → 통과" "$(cg_in c7 cg-c3 "$(cg_tx g G)")" none
cg_state cg-c3 review $((CG_EP + 5))
cg_run "같은 세션의 새 파이프라인(시작 시각 다름) → 다시 판정(block)" "$(cg_in c8 cg-c3 "$(cg_tx g G)")" block
jq -cn '{session_id:"cg-c9",hook_event_name:"SubagentStop",stop_hook_active:false}' > "$TMP/cg-sub.json"; cg_state cg-c9 review
cg_run "Stop 아닌 이벤트(SubagentStop) → 통과" "$TMP/cg-sub.json" none
cg_run "깨진 입력 → fail-open" "$FX/broken.json" none
cg_run "빈 입력 → fail-open" /dev/null none
# metrics.sh 가 실제로 쓴 상태로 end-to-end: /bams-plugin:bams:review 확장 → Stop → block
CGE="$TMP/cg-e2e"; mkdir -p "$CGE/proj/.git"; : > "$CGE/main.jsonl"
jq -cn --arg d "$CGE" '{session_id:"cg-e2e",prompt_id:"p-e",transcript_path:"\($d)/main.jsonl",cwd:"\($d)/proj",hook_event_name:"UserPromptExpansion",expansion_type:"slash_command",command_name:"bams-plugin:bams:review",command_args:"리뷰"}' > "$TMP/cg-upe.json"
env -u BAMS_METRICS BAMS_METRICS_DIR="$CGE/m" bash "$HOOKS/metrics.sh" < "$TMP/cg-upe.json" >/dev/null 2>&1
jq -cn --arg d "$CGE" '{session_id:"cg-e2e",transcript_path:"\($d)/main.jsonl",cwd:"\($d)/proj",hook_event_name:"Stop",stop_hook_active:false,last_assistant_message:"끝"}' > "$TMP/cg-e2e-stop.json"
run_case "metrics.sh 상태(review 시작) → Stop block (end-to-end)" pipeline-completion-guard.sh "$TMP/cg-e2e-stop.json" 0 block BAMS_METRICS_DIR="$CGE/m"
if jq -e '[.hooks.Stop[]?.hooks[]? | select(.command | test("hooks/pipeline-completion-guard\\.sh")) | select((.async // false) == false)] | length == 1' "$PJ" >/dev/null 2>&1; then
  PASS=$((PASS + 1)); echo "  PASS  plugin.json Stop → pipeline-completion-guard.sh 1회 등록(동기 — block 이 유효)"
else FAIL=$((FAIL + 1)); echo "  FAIL  plugin.json Stop 에 pipeline-completion-guard.sh 등록 없음/중복/async"; fi
# 실행 시간: 대상 파이프라인 없음(프로세스 0개) / 이미 판정된 파이프라인(marker) — 10회 평균 ≤ 50ms
cg_time() {
  local label="$1" in="$2" t0 t1 avg i=0
  t0=$(now_ms)
  while [ $i -lt 10 ]; do BAMS_METRICS_DIR="$CGM" bash "$HOOKS/pipeline-completion-guard.sh" < "$in" >/dev/null 2>&1; i=$((i + 1)); done
  t1=$(now_ms); avg=$(( (t1 - t0) / 10 ))
  if [ "$avg" -le 50 ]; then PASS=$((PASS + 1)); echo "  PASS  $label 평균 ${avg}ms ≤ 50ms"
  else FAIL=$((FAIL + 1)); echo "  FAIL  $label 평균 ${avg}ms > 50ms"; fi
}
cg_time "no-op(열린 파이프라인 없음)" "$(cg_in t0 cg-none "$(cg_tx g G)")"
cg_time "no-op(판정 끝난 파이프라인)" "$(cg_in t1 cg-r5 "$(cg_tx t T)")"

echo "== completion guard: 세션 상태(.track) 근거 — transcript 없는 실행(claude -p --no-session-persistence) =="
# 도구 호출은 metrics.sh PostToolUse 로 실제 기록하고(하네스와 같은 순서: PostToolUse → … → Stop), Stop 입력의
#   transcript_path 는 존재하지 않는 파일로 둔다. 근거 = .track + last_assistant_message 뿐.
NOTX="$TMP/no-such-transcript.jsonl"
# cg_post <sid> <tool_name> <tool_input JSON> [tool_response JSON] [agent_id] — metrics.sh 로 PostToolUse 기록
cg_post() {
  local r="${4:-}"; [ -n "$r" ] || r='{}'
  jq -cn --arg s "$1" --arg t "$2" --argjson i "$3" --argjson r "$r" --arg a "${5:-}" --arg c "$CGR" \
    '{session_id:$s,transcript_path:"/nonexistent/x.jsonl",cwd:$c,hook_event_name:"PostToolUse",tool_name:$t,tool_input:$i,tool_response:$r,tool_use_id:"toolu_x"}
     + (if $a != "" then {agent_id:$a, agent_type:"bams-plugin:release-quality-gate"} else {} end)' > "$TMP/cg-post.json"
  env -u BAMS_METRICS BAMS_METRICS_DIR="$CGM" bash "$HOOKS/metrics.sh" < "$TMP/cg-post.json" >/dev/null 2>&1
}
TC1='{"subject":"0. Steps 등록","description":"Steps 체크리스트 등록"}'
VCMD='_VD="$_BAMS/hooks/lib/verdict.sh"; [ -e "$_VD" ] || _VD=""
if [ -z "$_VD" ]; then echo "verdict_exit=unavailable"; else bash "$_VD" check; echo "verdict_exit=$?"; fi'
rm -f "$CGR"/.crew/artifacts/review/verdict-*.json
cg_state cg-n1 review; rm -f "$CGM/state/cg-n1.track"
cg_run "review: transcript 없음 + 작업 목록 기록 없음 → block" "$(cg_in n1 cg-n1 "$NOTX")" block
cg_state cg-n1 review
cg_reason "$(cg_in n1b cg-n1 "$NOTX")" has "(근거: none)" "근거 없음 → 사유에 '근거: none' 표기"
cg_state cg-n2 review; rm -f "$CGM/state/cg-n2.track"
cg_post cg-n2 TaskCreate "$TC1"
if [ -f "$CGM/state/cg-n2.track" ] && grep -q "todo.TaskCreate" "$CGM/state/cg-n2.track"; then PASS=$((PASS + 1)); echo "  PASS  metrics.sh PostToolUse TaskCreate → .track 에 todo 기록"
else FAIL=$((FAIL + 1)); echo "  FAIL  TaskCreate 기록 없음"; fi
cg_run "review: transcript 없음 + TaskCreate 기록만(verdict 없음) → block" "$(cg_in n2 cg-n2 "$NOTX")" block
cg_state cg-n2 review
cg_reason "$(cg_in n2b cg-n2 "$NOTX")" lacks "작업 목록 도구" "TaskCreate 기록 → 사유에 작업 목록 누락 없음(verdict 만)"
echo '{}' > "$CGR/.crew/artifacts/review/verdict-n3.json"
cg_state cg-n3 review; rm -f "$CGM/state/cg-n3.track"; cg_post cg-n3 TaskCreate "$TC1"
cg_run "review: transcript 없음 + TaskCreate 기록 + 시작 이후 verdict 파일 → 통과" "$(cg_in n3 cg-n3 "$NOTX")" none
rm -f "$CGR"/.crew/artifacts/review/verdict-*.json
cg_state cg-n4 review; rm -f "$CGM/state/cg-n4.track"; cg_post cg-n4 TaskCreate "$TC1"
cg_post cg-n4 TaskUpdate '{"taskId":"13","status":"completed","subject":"13. verdict 파일 확인 — skip: 판정자 미연결(오프라인)"}'
cg_run "review: TaskUpdate 항목 'skip: <사유>'(verdict) 기록 → 통과" "$(cg_in n4 cg-n4 "$NOTX")" none
cg_state cg-n5 review; rm -f "$CGM/state/cg-n5.track"; cg_post cg-n5 TaskCreate "$TC1"
cg_post cg-n5 TaskCreate '{"subject":"13. verdict 파일 확인 — 못 남기면 `— skip: <사유>`"}'
cg_run "review: 기록된 skip 이 Steps 자리표시자 그대로 → block" "$(cg_in n5 cg-n5 "$NOTX")" block
VOUT="$TMP/vout"; mkdir -p "$VOUT/.crew/artifacts/review"; echo '{}' > "$VOUT/.crew/artifacts/review/verdict-sub123.json"
cg_state cg-n6 review; rm -f "$CGM/state/cg-n6.track"; cg_post cg-n6 TaskCreate "$TC1"
cg_post cg-n6 Bash "$(jq -cn --arg d "$VOUT" '{command:"bash /p/hooks/lib/verdict.sh write --verdict PASS --dir \($d)"}')" \
  "$(jq -cn --arg d "$VOUT" '{stdout:"\($d)/.crew/artifacts/review/verdict-sub123.json",stderr:""}')" ag-judge
cg_run "review: 판정자 서브에이전트의 verdict.sh write(다른 --dir) 기록 경로 → 통과" "$(cg_in n6 cg-n6 "$NOTX")" none
cg_state cg-n7 review; rm -f "$CGM/state/cg-n7.track"; cg_post cg-n7 TaskCreate "$TC1" '{}' ag-sub
cg_run "review: 서브에이전트(agent_id)의 TaskCreate 는 메인 작업 목록 아님 → block" "$(cg_in n7 cg-n7 "$NOTX" false $'- skip: verdict — 판정자 미연결')" block
cg_state cg-n8 review $((CG_EP - 30)); rm -f "$CGM/state/cg-n8.track"; cg_post cg-n8 TaskCreate "$TC1"
cg_state cg-n8 review
cg_run "review: 이전 파이프라인(epoch 다름)의 기록은 무시 → block" "$(cg_in n8 cg-n8 "$NOTX" false $'- skip: verdict — 사유')" block
cg_state cg-n9 ship; rm -f "$CGM/state/cg-n9.track"; cg_post cg-n9 TaskCreate "$TC1"
cg_post cg-n9 Bash "$(jq -cn --arg c "$VCMD" '{command:$c}')" '{"stdout":"none - - unknown\nverdict_exit=1","stderr":""}'
if grep -q "vexit.1$" "$CGM/state/cg-n9.track" 2>/dev/null; then PASS=$((PASS + 1)); echo "  PASS  metrics.sh Bash \"\$_VD\" check → .track 에 vcheck + vexit=1"
else FAIL=$((FAIL + 1)); echo "  FAIL  verdict check 기록 없음: $(cat "$CGM/state/cg-n9.track" 2>/dev/null)"; fi
cg_run "ship: transcript 없음 + TaskCreate·verdict check 기록 + 최종 'verdict_exit=1' → 통과" "$(cg_in n9 cg-n9 "$NOTX" false $'NO-GO — verdict 없음\nverdict_exit=1')" none
cg_state cg-n10 ship; rm -f "$CGM/state/cg-n10.track"; cg_post cg-n10 TaskCreate "$TC1"
cg_post cg-n10 Bash "$(jq -cn --arg c "$VCMD" '{command:$c}')" '{"stdout":"verdict_exit=3","stderr":""}'
cg_reason "$(cg_in n10 cg-n10 "$NOTX" false 'PR 생성 보류')" has "마지막 check 출력: verdict_exit=3" "ship: check 기록 있으나 최종 메시지 줄 없음 → block + 마지막 값 안내"
cg_state cg-n11 ship; rm -f "$CGM/state/cg-n11.track"; cg_post cg-n11 TaskCreate "$TC1"
cg_post cg-n11 Bash "$(jq -cn --arg c "$VCMD" '{command:$c}')" '{"stdout":"verdict_exit=0","stderr":""}' ag-sub
cg_run "ship: check 를 서브에이전트만 실행(메인 아님) → block" "$(cg_in n11 cg-n11 "$NOTX" false 'verdict_exit=0')" block
cg_state cg-n12 ship; rm -f "$CGM/state/cg-n12.track"; cg_post cg-n12 TaskCreate "$TC1"
cg_post cg-n12 Bash '{"command":"grep -rn verdict references/ | head"}' '{"stdout":"verdict_exit=0","stderr":""}'
cg_run "ship: verdict 를 언급만 하는 Bash(check 아님) → block" "$(cg_in n12 cg-n12 "$NOTX" false 'verdict_exit=0')" block
# 열린 파이프라인이 없으면 PostToolUse 는 아무것도 남기지 않는다(.track 미생성)
rm -f "$CGM/state/cg-none.track"; cg_post cg-none TaskCreate "$TC1"
if [ ! -e "$CGM/state/cg-none.track" ]; then PASS=$((PASS + 1)); echo "  PASS  열린 파이프라인 없음 → TaskCreate 기록 안 함"
else FAIL=$((FAIL + 1)); echo "  FAIL  열린 파이프라인 없이 .track 생성"; fi
# 하네스 순서 end-to-end(전부 metrics.sh 가 기록): Expansion(review) → PostToolUse TaskCreate → 판정자 write → Stop(transcript 없음)
CGE2="$TMP/cg-e2e2"; mkdir -p "$CGE2/proj/.git" "$CGE2/proj/.crew/artifacts/review"
e2() { env -u BAMS_METRICS BAMS_METRICS_DIR="$CGE2/m" bash "$HOOKS/metrics.sh" >/dev/null 2>&1; }
jq -cn --arg d "$CGE2" '{session_id:"cg-e2",prompt_id:"p-e2",cwd:"\($d)/proj",hook_event_name:"UserPromptExpansion",expansion_type:"slash_command",command_name:"bams-plugin:bams:review",command_args:"리뷰"}' | e2
jq -cn --arg d "$CGE2" '{session_id:"cg-e2",cwd:"\($d)/proj",hook_event_name:"Stop",stop_hook_active:false,transcript_path:"\($d)/gone.jsonl",last_assistant_message:"리뷰 완료"}' > "$TMP/cg-e2-stop.json"
cp "$TMP/cg-e2-stop.json" "$TMP/cg-e2-stop0.json"
run_case "e2e: review 시작 직후 Stop(기록 없음, transcript 없음) → block" pipeline-completion-guard.sh "$TMP/cg-e2-stop0.json" 0 block BAMS_METRICS_DIR="$CGE2/m"
jq -cn --arg d "$CGE2" '{session_id:"cg-e2",prompt_id:"p-e3",cwd:"\($d)/proj",hook_event_name:"UserPromptExpansion",expansion_type:"slash_command",command_name:"bams-plugin:bams:review",command_args:"다시"}' > "$TMP/cg-e2-upe.json"
sleep 1; e2 < "$TMP/cg-e2-upe.json"   # 새 파이프라인(새 epoch) — 같은 커맨드 10초 중복 제거를 피하려 prompt_id 다르게
OEP2=$(IFS=$'\x1f' read -r _ _ _ e < "$CGE2/m/state/cg-e2.open"; echo "$e"); printf '%s\x1f%s\x1f%s\x1f%s\n' "x" review p-e3 "$((OEP2 - 20))" > "$CGE2/m/state/cg-e2.open"
jq -cn --arg d "$CGE2" '{session_id:"cg-e2",cwd:"\($d)/proj",hook_event_name:"PostToolUse",tool_name:"TaskCreate",tool_input:{subject:"0. Steps 등록"},tool_response:{}}' | e2
echo '{}' > "$CGE2/proj/.crew/artifacts/review/verdict-e2.json"
jq -cn --arg d "$CGE2" '{session_id:"cg-e2",cwd:"\($d)/proj",hook_event_name:"PostToolUse",agent_id:"ag-j",agent_type:"bams-plugin:release-quality-gate",tool_name:"Bash",tool_input:{command:"bash \"$_VD\" write --verdict PASS"},tool_response:{stdout:"\($d)/proj/.crew/artifacts/review/verdict-e2.json"}}' | e2
run_case "e2e: TaskCreate·verdict write 기록 후 Stop(transcript 없음) → 통과" pipeline-completion-guard.sh "$TMP/cg-e2-stop.json" 0 none BAMS_METRICS_DIR="$CGE2/m"

echo "== metrics-report.sh =="
RPT="$HERE/../../scripts/metrics-report.sh"; RNOW=$(jq -n '"2026-10-25T00:00:00Z" | fromdate')
rout=$(BAMS_METRICS_NOW="$RNOW" bash "$RPT" --file "$MFX/events-sample.jsonl" 2>&1); rcode=$?
# rcase <label> <has|lacks> <고정 문자열> (대상: $rout)
rcase() {
  local ok=0; printf '%s' "$rout" | grep -qF -- "$3" && ok=1
  if { [ "$2" = has ] && [ $ok = 1 ]; } || { [ "$2" = lacks ] && [ $ok = 0 ]; }; then PASS=$((PASS + 1)); echo "  PASS  $1"
  else FAIL=$((FAIL + 1)); echo "  FAIL  $1 ($2 '$3')"; fi
}
rcase "exit 0 + 30일 창(9월 이벤트 제외)·깨진 줄 무시" has "## 파이프라인 (4건)"; [ "$rcode" = 0 ] || { FAIL=$((FAIL + 1)); echo "  FAIL  report exit=$rcode"; }
rcase "dev 행: 리드타임·에이전트(agent_id 중복 제거)·토큰·비용·개입·결과" has \
  '| 2026-10-20 01:00 | dev | shop | dev_결제버그 | 1h05m | 2 (usage 없음 1) | 1M | $2.80 | 2 | COMPLETED |'
rcase "단가표 없는 모델 → 비용 '*' 표시" has '| 2026-10-22 03:00 | hotfix | shop | hotfix_결제500 | 45m | 1 | 2k | $0.00* | 0 | FAILED |'
rcase "시작 없는 pipeline_end → 별도 행" has '| (시작 미기록) | plan | blog | plan_댓글설계 | - | - | - | - | - | 완료 |'
rcase "커맨드별 집계: 성공률·실패" has '| hotfix | 1 | 1 | 0% | 1 | 45m | 2k |'
rcase "커맨드별 집계: 중앙값" has '| dev | 1 | 1 | 100% | 0 | 1h05m | 1M | $2.80 | 2 |'
rcase "결함 유출 후보: hotfix 직전 7일 같은 프로젝트" has '- hotfix hotfix_결제500 (2026-10-22, shop) ← 후보: dev dev_결제버그 [COMPLETED]'
rout=$(BAMS_METRICS_NOW="$RNOW" bash "$RPT" --file "$MFX/events-sample.jsonl" --project blog 2>&1)
rcase "--project blog → 2건, shop 없음" has "## 파이프라인 (2건)"; rcase "--project 필터" lacks "| shop |"
rout=$(BAMS_METRICS_NOW="$RNOW" bash "$RPT" --file "$MFX/events-sample.jsonl" --since 1d 2>&1)
rcase "--since 1d → 0건" has "(해당 기간 파이프라인 없음)"
rout=$(bash "$RPT" --file "$MD/events.jsonl" --since all 2>&1)
rcase "hook 이 쓴 events → 리포트 end-to-end(dev)" has "| dev | proj | dev_결제버그묶음 | "
rcase "hook 이 쓴 events → 리포트 end-to-end(hotfix 실패)" has "| hotfix | proj | hotfix_로그인500 | "
rout=$(bash "$RPT" --file "$TMP/none.jsonl" 2>&1); rcode=$?
[ "$rcode" = 0 ] && rcase "events 파일 없음 → 안내 후 exit 0" has "이벤트 없음" || { FAIL=$((FAIL + 1)); echo "  FAIL  파일 없음 exit=$rcode"; }
# QA m14: agent_end 없으면 pipeline_end.agent_spawns, 리드타임은 dur_ms 우선
printf '%s\n' '{"v":1,"ts":"2026-11-10T00:00:00Z","session_id":"s1","project":"p","pipeline":"hotfix","pipeline_ts":"2026-11-10T00:00:00Z","ev":"pipeline_start","command":"hotfix"}' \
  '{"v":1,"ts":"2026-11-10T00:00:05Z","session_id":"s1","project":"p","pipeline":"hotfix","pipeline_ts":"2026-11-10T00:00:00Z","ev":"pipeline_end","slug":"hotfix_x","command":"hotfix","status":"완료","result":"success","dur_ms":125000,"agent_spawns":3}' \
  '{"v":1,"ts":"2026-11-11T00:00:00Z","session_id":"s2","project":"p","pipeline":null,"pipeline_ts":null,"ev":"pipeline_end","slug":"plan_y","command":"plan","status":"완료","result":"success","dur_ms":61000,"agent_spawns":2}' > "$TMP/ev-m14.jsonl"
rout=$(bash "$RPT" --file "$TMP/ev-m14.jsonl" --since all 2>&1)
rcase "agent_end 없음 → pipeline_end.agent_spawns(3)·리드타임 dur_ms(2m)" has '| 2026-11-10 00:00 | hotfix | p | hotfix_x | 2m | 3 | 0 | $0.00 | 0 | 완료 |'
rcase "시작 없는 pipeline_end 도 dur_ms·agent_spawns 반영" has '| (시작 미기록) | plan | p | plan_y | 1m | 2 | - | - | - | 완료 |'
bash "$RPT" --since 3x --file "$MFX/events-sample.jsonl" >/dev/null 2>&1; rcode=$?
if [ "$rcode" = 2 ]; then PASS=$((PASS + 1)); echo "  PASS  잘못된 --since → exit 2"; else FAIL=$((FAIL + 1)); echo "  FAIL  잘못된 --since exit=$rcode"; fi

echo ""
echo "hook tests: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
