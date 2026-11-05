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
    -u BAMS_HOOK_TRACE -u BAMS_HOOK_CAPTURE_DIR -u BAMS_GUARD_EXTRA_PATHS "$@" bash "$HOOKS/$hook" < "$in" 2>/dev/null); code=$?; }
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
  stop_case "검증 아님: $cmd → block" "$(stop_input nv$n false $FE "$(edit_then_bash nv$n "$cmd")" '완료')" 0 block
done
for cmd in 'bun test' 'npm run build' 'cd app && npx tsc --noEmit' 'bash scripts/validate-harness.sh' 'pytest -q' \
           'go test ./...' 'bash -n hooks/verify-before-stop.sh' 'python -m py_compile a.py'; do
  n=$((n + 1))
  stop_case "검증: $cmd → 통과" "$(stop_input v$n false $FE "$(edit_then_bash v$n "$cmd")" '완료')" 0 none
done

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
if [ "$left" = "0.0.1 0.0.3 $SV" ] && printf '%s' "$sout" | grep -q "cache 폴더명(0.0.1) ≠ plugin.json version($SV)"; then
  PASS=$((PASS + 1)); echo "  PASS  .orphaned_at 폴더만 삭제, installPath·현재 버전·관리 중 폴더 보존 + 버전 WARN"
else FAIL=$((FAIL + 1)); echo "  FAIL  prune 결과: [$left] (기대: 0.0.1 0.0.3 $SV)"; fi

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
  'all(.[]; .v == 1 and (.ts | test("Z$")) and (.ev | type) == "string" and (.project | type) == "string") and ([.[] | tostring | select(test("__(PROJ|PCMD|PTS|DUR)__"))] | length == 0)'
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
for t in Edit Write Skill; do matcher_case "PostToolUse matcher '$MPM' → $t" "$MPM" "$t" match; done
for t in Bash Read NotebookEdit; do matcher_case "PostToolUse matcher '$MPM' ↛ $t" "$MPM" "$t" nomatch; done
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
mtime "UserPromptSubmit 일반 입력(jq 0회)"      ups-human.json       50
mtime "UserPromptExpansion 시작(jq 1회)"        upe-dev.json         100
mtime "SubagentStop transcript 파싱(jq 2회)"    sub-stop.json        100

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
bash "$RPT" --since 3x --file "$MFX/events-sample.jsonl" >/dev/null 2>&1; rcode=$?
if [ "$rcode" = 2 ]; then PASS=$((PASS + 1)); echo "  PASS  잘못된 --since → exit 2"; else FAIL=$((FAIL + 1)); echo "  FAIL  잘못된 --since exit=$rcode"; fi

echo ""
echo "hook tests: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
