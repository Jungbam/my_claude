#!/usr/bin/env bash
# run-hook-tests.sh — hooks/*.sh 에 JSON fixture를 stdin으로 넣어 exit code/출력을 검증한다.
# 사용법: bash plugins/bams-plugin/tests/hooks/run-hook-tests.sh   (exit 0=전부 통과)
# 의존: bash, jq. macOS 기본 bash 3.2 호환.
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
HOOKS="$(cd "$HERE/../../hooks" && pwd)"
FX="$HERE/fixtures"
PASS=0; FAIL=0

# run_case <label> <hook> <stdin-file> <want-exit> <want: none|context|deny|block> [env...]
run_case() {
  local label="$1" hook="$2" in="$3" want_exit="$4" want="$5"; shift 5
  local out code got
  out=$(env -u BAMS_DELEGATION_GUARD -u CLAUDE_MD_EDIT_ALLOWED -u CLAUDE_MD_STEP3 -u CLAUDE_MD_INIT "$@" \
    bash "$HOOKS/$hook" < "$in" 2>/dev/null); code=$?
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

echo "== verify-before-stop.sh =="
FE=bams-plugin:frontend-engineering
run_case "편집 후 검증 없음 → block"        verify-before-stop.sh "$(stop_input a false $FE "$FX/transcript-edit-no-verify.jsonl" '완료')"   0 block
run_case "검증 후 편집(편집 이후 검증 없음) → block" verify-before-stop.sh "$(stop_input b false $FE "$FX/transcript-verify-then-edit.jsonl" '완료')" 0 block
run_case "편집 후 검증 실행 → 통과"         verify-before-stop.sh "$(stop_input c false $FE "$FX/transcript-edit-then-verify.jsonl" '완료')" 0 none
run_case "stop_hook_active=true → 통과"     verify-before-stop.sh "$(stop_input d true  $FE "$FX/transcript-edit-no-verify.jsonl" '완료')"   0 none
run_case "보고에 '검증 불가' 사유 → 통과"   verify-before-stop.sh "$(stop_input e false $FE "$FX/transcript-edit-no-verify.jsonl" '검증 불가: CI 전용 시크릿 필요')" 0 none
run_case "대상 외 에이전트 → 통과"          verify-before-stop.sh "$(stop_input f false bams-plugin:ux-research "$FX/transcript-edit-no-verify.jsonl" '완료')" 0 none
run_case "bare 이름(platform-devops) → block" verify-before-stop.sh "$(stop_input g false platform-devops "$FX/transcript-edit-no-verify.jsonl" '완료')" 0 block
run_case "문서만 편집 → 통과"               verify-before-stop.sh "$(stop_input h false $FE "$FX/transcript-docs-only.jsonl" '완료')"        0 none
run_case "깨진 줄 섞인 transcript → block"  verify-before-stop.sh "$(stop_input i false $FE "$FX/transcript-garbage-lines.jsonl" '완료')"    0 block
run_case "transcript 부재 → fail-open"      verify-before-stop.sh "$(stop_input j false $FE "$TMP/none.jsonl" '완료')"                       0 none
run_case "깨진 입력 → fail-open"            verify-before-stop.sh "$FX/broken.json"                                                           0 none

# 소스 편집 1회 → Bash <cmd> 1회 transcript 를 만들어 VERIFY_RE 판정을 end-to-end로 확인한다.
# edit_then_bash <name> <bash-command>
edit_then_bash() {
  local t="$TMP/$1.jsonl"
  jq -cn '{type:"assistant",message:{content:[{type:"tool_use",name:"Edit",input:{file_path:"/repo/src/app/page.tsx",old_string:"a",new_string:"b"}}]}}' > "$t"
  jq -cn --arg c "$2" '{type:"assistant",message:{content:[{type:"tool_use",name:"Bash",input:{command:$c}}]}}' >> "$t"
  echo "$t"
}
echo "== verify-before-stop.sh: 검증 명령 판정 =="
n=0
for cmd in 'ls tests/' 'cd build' 'cat test.log' 'grep -r lint .' 'echo bun test' 'npm install'; do
  n=$((n + 1))
  run_case "검증 아님: $cmd → block" verify-before-stop.sh "$(stop_input nv$n false $FE "$(edit_then_bash nv$n "$cmd")" '완료')" 0 block
done
for cmd in 'bun test' 'npm run build' 'cd app && npx tsc --noEmit' 'bash scripts/validate-harness.sh' 'pytest -q' \
           'go test ./...' 'bash -n hooks/verify-before-stop.sh' 'python -m py_compile a.py'; do
  n=$((n + 1))
  run_case "검증: $cmd → 통과" verify-before-stop.sh "$(stop_input v$n false $FE "$(edit_then_bash v$n "$cmd")" '완료')" 0 none
done

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
echo "== plugin.json SubagentStop matcher ($(command -v node >/dev/null 2>&1 && echo node RegExp || echo bash ERE)) =="
PJ="$HERE/../../.claude-plugin/plugin.json"
SM=$(jq -r '[.hooks.SubagentStop[]? | select(.hooks[]?.command | test("verify-before-stop")) | .matcher][0] // ""' "$PJ" 2>/dev/null)
if [ -z "$SM" ]; then
  FAIL=$((FAIL + 1)); echo "  FAIL  plugin.json 에 verify-before-stop SubagentStop matcher 없음"
else
  for a in frontend-engineering backend-engineering platform-devops data-integration automation-qa; do
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

echo "== claude-md-guard.sh =="
run_case "CLAUDE.md 편집 → exit 2"          claude-md-guard.sh "$FX/pre-main-claude-md.json" 2 none
run_case "CLAUDE.md + 예외 env → 통과"      claude-md-guard.sh "$FX/pre-main-claude-md.json" 0 none CLAUDE_MD_EDIT_ALLOWED=1
run_case "일반 파일 → 통과"                 claude-md-guard.sh "$FX/pre-main-source.json"    0 none
run_case "깨진 입력 → fail-open"            claude-md-guard.sh "$FX/broken.json"             0 none

echo ""
echo "hook tests: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
