#!/usr/bin/env bash
# shellcheck disable=SC2088 # transcript_path 가 리터럴 "~/" 로 올 수 있어 직접 확장한다(의도)
# pipeline-completion-guard.sh — Stop: 이 세션에서 열린 /bams:{review,deep-review,ship,deploy} 파이프라인이
#   완료 조건 없이 끝나려 하면 decision:block 으로 파이프라인당 1회 되돌린다.
#   완료 조건(파이프라인 시작 이후, 커맨드 문서 `## Steps` 규약 — references/step-status.md):
#     (1) 공통: 작업 목록 도구(TaskCreate/TaskUpdate 또는 TodoWrite) 호출 — `## Steps` 체크리스트 복사
#     (2) review: <cwd 또는 상위 git 루트>/.crew/artifacts/review/verdict-*.json 중 mtime ≥ 시작 시각인 파일,
#         또는 verdict 단계의 명시적 `skip: <사유>` 줄(작업 목록 항목·시작 이후 assistant 텍스트·최종 메시지)
#     (2) deep-review: verdict 를 쓰지 않으므로 Step 12 의 `— skip: deep-review 게이트 미포함 …` 줄(또는 verdict 파일)
#     (2) ship·deploy(skip 불가): `verdict.sh check`(또는 `"$_VD" check`) Bash 호출 + 최종 메시지의
#         `verdict_exit=<0|1|3|4|unavailable>` 줄
#   skip 줄 인정: 같은 줄에 verdict|판정|release-quality-gate|gate|게이트 가 있고 "skip:" 뒤 사유가 2글자 이상이며
#     `<`로 시작하지 않는다(Steps 원문의 `skip: <사유>` 자리표시자를 그대로 복사한 것은 불인정).
# 파이프라인 상태: hooks/metrics.sh 의 세션 상태 <BAMS_METRICS_DIR>/state/<session_id>.open
#   (ts␟command␟prompt_id␟epoch_s). pipeline_end(history.md 기록) 후에는 .closing 으로 바뀌어 대상이 아니다.
#   BAMS_METRICS=off 면 상태가 없으므로 이 hook 도 아무것도 하지 않는다.
# 모드: BAMS_COMPLETION_GUARD=block(기본)|warn(systemMessage 만, 차단 없음)|off
# 1회 제한: stop_hook_active=true 면 통과. 같은 파이프라인(epoch_s)에 대해 block/warn/ok 판정을
#   <state>/<session_id>.cguard 에 남겨 이후 Stop 은 즉시 통과(다음 턴 반복 차단 없음).
# 성능: 대상 파이프라인이 없으면 프로세스 0개(정규식 + 파일 존재 확인)로 종료. 모든 오류는 fail-open(exit 0).
# 근거(1차 = 세션 상태): metrics.sh 가 PostToolUse(동기)로 <state>/<session_id>.track 에 남긴 기록
#   (epoch_s␟todo|skip|vcheck|vexit|vwrite␟data — 이번 파이프라인 epoch 줄만). 보조 = transcript(읽을 수 있을 때만,
#   비공개 형식이므로 추가 근거로만 쓴다). `claude -p --no-session-persistence` 처럼 transcript 파일이 없어도
#   상태 기록만으로 판정한다 — 두 근거 모두 비어 있으면 "미수행"으로 보고 차단한다(통과 아님).
#   최종 메시지 = 입력 last_assistant_message(비면 transcript 마지막 텍스트) — skip:·verdict_exit= 줄을 여기서 본다.
# 입력(https://code.claude.com/docs/en/hooks#stop-input): session_id, transcript_path, cwd, stop_hook_active,
#   last_assistant_message. 내부 오류(jq 없음·jq 실패·상태 파싱 실패)만 fail-open.
set +e
case "${BAMS_COMPLETION_GUARD:-block}" in
  off|OFF|0|false|no) exit 0 ;;
  warn|WARN) MODE=warn ;;
  *) MODE=block ;;
esac
case "${BAMS_METRICS:-on}" in off|OFF|0|false|no) exit 0 ;; esac
INPUT=$(cat 2>/dev/null)
# shellcheck disable=SC1091 # 런타임 경로(플러그인 설치 위치)
[ -n "${BAMS_HOOK_TRACE:-}${BAMS_HOOK_CAPTURE_DIR:-}" ] && . "${0%/*}/lib/trace.sh" 2>/dev/null && bams_hook_trace pipeline-completion-guard "$INPUT"
[ -z "$INPUT" ] && exit 0

# ── 빠른 종료(프로세스 0개) ──
re='"hook_event_name"[[:space:]]*:[[:space:]]*"([A-Za-z]+)"'
[[ $INPUT =~ $re ]] && [ "${BASH_REMATCH[1]}" != Stop ] && exit 0
re='"session_id"[[:space:]]*:[[:space:]]*"([A-Za-z0-9_.-]+)"'; SID=""; [[ $INPUT =~ $re ]] && SID="${BASH_REMATCH[1]}"
[ -n "$SID" ] || exit 0
ST="${BAMS_METRICS_DIR:-$HOME/.claude/bams-metrics}/state"; OPEN="$ST/$SID.open"
[ -f "$OPEN" ] || exit 0
re='"stop_hook_active"[[:space:]]*:[[:space:]]*true'; [[ $INPUT =~ $re ]] && exit 0
US=$'\x1f'; OTS=""; OCMD=""; OEP=""
IFS="$US" read -r OTS OCMD _ OEP < "$OPEN" 2>/dev/null
case "$OCMD" in review|deep-review|ship|deploy) ;; *) exit 0 ;; esac
case "$OEP" in ''|*[!0-9]*) exit 0 ;; esac
MARK="$ST/$SID.cguard"; M=""
[ -f "$MARK" ] && IFS= read -r M < "$MARK"
[ "${M%% *}" = "$OEP" ] && exit 0
NOW=$(date +%s 2>/dev/null); case "$NOW" in ''|*[!0-9]*) exit 0 ;; esac
[ $((NOW - OEP)) -gt 43200 ] && exit 0   # metrics.sh 와 같은 12시간 만료
command -v jq >/dev/null 2>&1 || exit 0

mark() { printf '%s %s\n' "$OEP" "$1" > "$MARK" 2>/dev/null; return 0; }

# ── 입력: transcript_path·cwd (jq 1회) ──
META=$(printf '%s' "$INPUT" | jq -r '[(.transcript_path // "" | tostring), (.cwd // "" | tostring)] | map(gsub("[\t\n]"; " ")) | @tsv' 2>/dev/null) || exit 0
TP="${META%%$'\t'*}"; CWD="${META#*$'\t'}"
case "$TP" in '~/'*) TP="$HOME/${TP#\~/}" ;; esac
[ -n "$TP" ] && [ -r "$TP" ] || TP=""   # transcript 없음(--no-session-persistence 등) → 상태 기록만으로 판정
[ -n "$CWD" ] || CWD="$PWD"
TRKS=""; [ -r "$ST/$SID.track" ] && TRKS=$(< "$ST/$SID.track")

# ── 근거 합산(jq 1회): 상태 기록(이번 epoch) + transcript 후보 줄(있으면, grep 으로 줄임) + 최종 메시지 ──
R=$({ [ -n "$TP" ] && grep -E 'TodoWrite|TaskCreate|TaskUpdate|verdict|_VD|[Ss][Kk][Ii][Pp]' "$TP" 2>/dev/null; } | jq -rnR \
  --arg ots "${OTS:0:19}" --arg ep "$OEP" --arg st "$TRKS" --argjson in "$INPUT" '
  def after: ((.timestamp // "") | tostring) as $t | ($t == "" or $ots == "" or $t[0:19] >= $ots);
  def vskip: test("(^|[^A-Za-z])skip\\s*:\\s*(?!<)\\S\\S"; "i") and test("verdict|판정|release-quality-gate|gate|게이트"; "i");
  def lines_vskip: [splits("\\r?\\n")] | any(vskip);
  def w: if . == "" then "-" else gsub("\\s"; "_") end;
  [$st | splits("\n") | split("\u001f") | select(length >= 2 and .[0] == $ep) | {k: .[1], d: (.[2:] | join(" "))}] as $r
  | [inputs | fromjson? | objects | select(.type == "assistant") | select(after) | .message.content[]? | select(type == "object")] as $c
  | [$c[] | select(.type == "tool_use")] as $u
  | [$u[] | select(.name == "TodoWrite" or .name == "TaskCreate" or .name == "TaskUpdate")] as $todo
  | [$c[] | select(.type == "text") | (.text // "" | tostring)] as $txt
  | (($in.last_assistant_message // "") | tostring) as $lm
  | (if $lm != "" then $lm else ($txt | last // "") end) as $final
  | ([$r[] | select(.k == "todo")] | length) as $stodo
  | (($r | any(.k == "vcheck"))
     or ([$u[] | select(.name == "Bash") | (.input.command // "" | tostring)
          | select(test("(verdict\\.sh|\\$\\{?_?VD\\}?)[\"'"'"']?\\s+check(\\s|$|[;&|])|bams_verdict_check"))] | length > 0)) as $vc
  | (([$r[] | select(.k == "skip") | .d] + [$todo[] | .input | [.. | strings] | .[]] + $txt + [$lm]) | any(lines_vskip)) as $vs
  | ($final | test("verdict_exit=(0|1|3|4|unavailable)([^0-9A-Za-z_]|$)")) as $ve
  | ([$r[] | select(.k == "vexit") | .d] | last // "") as $lastve
  | ([$r[] | select(.k == "vwrite") | .d | select(. != "")] | last // "") as $vwp
  | (if ($r | length) > 0 and ($c | length) > 0 then "state+transcript" elif ($r | length) > 0 then "state"
     elif ($c | length) > 0 then "transcript" else "none" end) as $src
  | "\(($stodo + ($todo | length)) > 0) \($vc) \($vs) \($ve) \($src) \($lastve | w) \($vwp | w)"' 2>/dev/null) || exit 0
case "$R" in "true "*|"false "*) ;; *) exit 0 ;; esac
read -r TODO VCHECK VSKIP VEXIT SRC LASTVE VWP <<EOF
$R
EOF
[ "$LASTVE" = - ] && LASTVE=""; [ "$VWP" = - ] && VWP=""

# review·deep-review: cwd → 상위(.git 또는 $HOME 에서 멈춤) 의 .crew/artifacts/review 최신 verdict 파일 mtime ≥ 시작
mtime_of() {
  local m
  m=$(stat -f %m "$1" 2>/dev/null); case "$m" in ''|*[!0-9]*) m=$(stat -c %Y "$1" 2>/dev/null) ;; esac
  case "$m" in ''|*[!0-9]*) return 1 ;; esac
  printf '%s' "$m"
}
VROOT=""
verdict_file_ok() {
  local d="${CWD%/}" newest m
  while [ -n "$d" ]; do
    if [ -d "$d/.crew/artifacts/review" ]; then
      [ -n "$VROOT" ] || VROOT="$d"
      # shellcheck disable=SC2012 # 파일명은 verdict.sh 가 만든 verdict-<sha>[-<ts>].json 뿐
      newest=$(ls -t "$d"/.crew/artifacts/review/verdict-*.json 2>/dev/null | head -1)
      if [ -n "$newest" ]; then
        m=$(mtime_of "$newest") && [ "$m" -ge "$OEP" ] && return 0
      fi
    fi
    [ -e "$d/.git" ] && { [ -n "$VROOT" ] || VROOT="$d"; break; }
    [ "$d" = "$HOME" ] && break
    d="${d%/*}"
  done
  return 1
}

# 기록된 `verdict.sh write` 출력 경로(서브에이전트가 다른 --dir 로 쓴 경우 포함) — 파일이 있고 시작 이후일 때만
recorded_verdict_ok() {
  local m
  [ -n "$VWP" ] && [ -f "$VWP" ] || return 1
  m=$(mtime_of "$VWP") && [ "$m" -ge "$OEP" ]
}

MISS=""; N=0
VD="$(cd "${0%/*}/lib" 2>/dev/null && pwd)/verdict.sh"
if [ "$TODO" != true ]; then
  N=$((N + 1))
  MISS="$MISS ($N) 작업 목록 도구(TaskCreate/TaskUpdate, 없으면 ToolSearch \`select:TaskCreate,TaskUpdate\`로 로드 / TodoWrite) 미사용 — 커맨드 문서의 '## Steps' 체크리스트를 그대로 등록하고 단계마다 상태를 갱신하라(건너뛴 단계는 항목에 'skip: <사유>')."
fi
case "$OCMD" in
  review)
    if [ "$VSKIP" != true ] && ! verdict_file_ok && ! recorded_verdict_ok; then
      N=$((N + 1))
      MISS="$MISS ($N) verdict 파일 없음 — 시작 이후 ${VROOT:-$CWD}/.crew/artifacts/review/verdict-*.json 이 생기지 않았다. Phase 4 판정자(Agent subagent_type=bams-plugin:release-quality-gate)가 bash '$VD' write --verdict PASS|FAIL --judge-agent release-quality-gate --author-agents <구현 에이전트 목록|main> --evidence '<exit>:<실행한 명령>' 으로 기록하게 한 뒤 Step 13(verdict.sh check)을 실행하라. 판정·기록을 할 수 없으면 작업 목록 Step 13 항목(또는 최종 메시지)에 '— skip: <실제 사유>'를 남겨라."
    fi ;;
  deep-review)
    if [ "$VSKIP" != true ] && ! verdict_file_ok && ! recorded_verdict_ok; then
      N=$((N + 1))
      MISS="$MISS ($N) Step 12(verdict) 표기 없음 — deep-review 는 게이트를 포함하지 않으므로 작업 목록 Step 12 항목을 '— skip: deep-review 게이트 미포함 (판정은 /bams:review·/bams:ship)'으로 남겨라."
    fi ;;
  ship|deploy)
    if [ "$VCHECK" != true ]; then
      N=$((N + 1))
      MISS="$MISS ($N) verdict 확인 미실행 — 커맨드 문서의 'Verdict 확인' 블록(리졸버 + bash \"\$_VD\" check)을 한 번의 Bash 호출로 실행하라(직접 실행: bash '$VD' check). 이 단계는 skip 할 수 없다."
    fi
    if [ "$VEXIT" != true ]; then
      N=$((N + 1))
      MISS="$MISS ($N) 최종 메시지에 verdict 결과 줄 없음 — 마지막 확인 결과를 'verdict_exit=<0|1|3|4|unavailable>' 형식 1줄로 최종 메시지에 적어라(skip 불가)."
      [ -n "$LASTVE" ] && MISS="$MISS (마지막 check 출력: verdict_exit=$LASTVE)"
    fi ;;
esac

if [ "$N" = 0 ]; then mark ok; exit 0; fi
REASON="[bams completion-guard] /bams:$OCMD 파이프라인(시작 $OTS)이 완료 조건을 채우지 않고 끝나려 한다(근거: $SRC). 누락 ${N}건:$MISS 누락 항목을 처리한 뒤 마무리하라. 이 차단은 파이프라인당 1회다(BAMS_COMPLETION_GUARD=warn|off 로 조정)."
if [ "$MODE" = warn ]; then
  mark warned
  jq -cn --arg r "$REASON" '{systemMessage: $r}'
else
  mark blocked
  jq -cn --arg r "$REASON" '{decision: "block", reason: $r}'
fi
exit 0
