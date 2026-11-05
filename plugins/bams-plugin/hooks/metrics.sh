#!/usr/bin/env bash
# metrics.sh — bams 파이프라인 성과 자동 계측. 기본 on(BAMS_METRICS=off|0|false|no 로 끔). stdout 출력 없음·차단 없음·전부 fail-open.
# 저장: ${BAMS_METRICS_DIR:-$HOME/.claude/bams-metrics}/events.jsonl (1줄 JSON), 세션 상태: <dir>/state/
# 입력 필드 근거(공식): https://code.claude.com/docs/en/hooks — UserPromptExpansion(command_name/command_args/prompt),
#   UserPromptSubmit(prompt), PostToolUse(tool_name/tool_input/tool_response), SubagentStart(agent_id/agent_type),
#   SubagentStop(agent_id/agent_type/agent_transcript_path/stop_hook_active), Stop(transcript_path), 공통(session_id/prompt_id/cwd).
# 이벤트(스키마: references/metrics.md):
#   pipeline_start  UserPromptExpansion(command_name …bams:<cmd>) · UserPromptSubmit("/bams:<cmd> …") · PostToolUse Skill
#                   (열린 파이프라인 없을 때만). 같은 prompt_id 또는 10초 내 같은 커맨드는 중복 제거. args 앞 80자만 저장
#   human_turn      UserPromptSubmit — 같은 session에 열린 파이프라인이 있을 때. 슬래시·<태그> 시스템 입력 제외. 본문 미저장
#   agent_end       SubagentStop — SubagentStart 짝(state/a_<agent_id>)으로 dur_ms, agent transcript usage 합(message.id 중복 제거)
#   pipeline_end    PostToolUse Edit|Write — */.crew/history.md 에 새로 생긴 첫 헤더 줄의 slug·status
#   session_usage   Stop — 열린(또는 방금 끝난) 파이프라인이 있을 때만, 메인 transcript 증분(줄 offset) usage
# 성능: 대상이 아님이 확실한 입력(Stop·PostToolUse·일반 프롬프트)은 jq 없이 종료. 그 외 jq 1회(+transcript 파싱 1회).
set +e
case "${BAMS_METRICS:-on}" in off|OFF|0|false|no) exit 0 ;; esac
INPUT=$(cat 2>/dev/null)
[ -n "${BAMS_HOOK_TRACE:-}${BAMS_HOOK_CAPTURE_DIR:-}" ] && . "${0%/*}/lib/trace.sh" 2>/dev/null && bams_hook_trace metrics "$INPUT"
[ -z "$INPUT" ] && exit 0
DIR="${BAMS_METRICS_DIR:-$HOME/.claude/bams-metrics}"; ST="$DIR/state"; OUT="$DIR/events.jsonl"
US=$'\x1f'

# ── 빠른 종료(프로세스 0개): 이벤트명·session_id를 정규식으로만 본다 ──
re='"hook_event_name"[[:space:]]*:[[:space:]]*"([A-Za-z]+)"'; EV=""; [[ $INPUT =~ $re ]] && EV="${BASH_REMATCH[1]}"
re='"session_id"[[:space:]]*:[[:space:]]*"([A-Za-z0-9_.-]+)"'; SID=""; [[ $INPUT =~ $re ]] && SID="${BASH_REMATCH[1]}"
case "$EV" in
  Stop) [ -n "$SID" ] && { [ -f "$ST/$SID.open" ] || [ -f "$ST/$SID.closing" ]; } || exit 0 ;;
  PostToolUse) case "$INPUT" in *'.crew/history.md'*|*'bams:'*) ;; *) exit 0 ;; esac ;;
  UserPromptSubmit) case "$INPUT" in *'bams:'*) ;; *) [ -n "$SID" ] && [ ! -f "$ST/$SID.open" ] && exit 0 ;; esac ;;
esac
command -v jq >/dev/null 2>&1 || exit 0
mkdir -p "$ST" 2>/dev/null || exit 0

# ── jq 1회: 1줄째 meta(US 구분: kind sidkey cwd epoch_s epoch_ms ts x1 x2 x3), 2줄째 이벤트 JSON(자리표시자 포함) ──
RES=$(printf '%s' "$INPUT" | jq -r '
  def clean: tostring | gsub("[[:cntrl:]]+"; " ") | gsub("^\\s+|\\s+$"; "");
  def a80: clean | .[0:80];
  def bcmd: tostring | [match("(?:^|[/:])bams:([a-z][a-z0-9-]*)$")] | if length > 0 then .[0].captures[0].string else null end;
  def key: tostring | gsub("[^A-Za-z0-9_.-]"; "_");
  def cls: ascii_upcase | if test("FAIL|실패") then "failed" elif test("CONCERN") then "concerns"
    elif test("COMPLETED|^DONE|완료|SUCCESS|PASS") then "success" elif test("중단|ABORT|CANCEL") then "aborted"
    elif test("BLOCK") then "blocked" else "other" end;
  def hdr: [ capture("^##\\s*(?<d>[0-9]{4}-[0-9]{2}-[0-9]{2})\\s*\\|\\s*(?<slug>[^|]+?)\\s*\\|\\s*(?<st>[^|]+?)\\s*$"),
             capture("^\\s*(?:#+\\s*|-\\s*)?(?<d>[0-9]{4}-[0-9]{2}-[0-9]{2})\\s*\\|\\s*(?<slug>[^|\\s]+)\\s*\\|\\s*(?<cmd>[^|]+?)\\s*\\|\\s*(?<st>[^|]+?)\\s*(?:\\||$)") ]
           | .[0] // empty;
  now as $n | ($n | floor) as $s | ($n * 1000 | floor) as $ms | ($s | todate) as $ts
  | (.hook_event_name // "") as $ev | (.session_id // "" | tostring) as $sid | (.cwd // "" | tostring) as $cwd
  | {v: 1, ts: $ts, session_id: $sid, project: "__PROJ__", pipeline: "__PCMD__", pipeline_ts: "__PTS__"} as $base
  | def out($k; $x1; $x2; $x3; $o):
      ([$k, ($sid | key), $cwd, ($s | tostring), ($ms | tostring), $ts, ($x1 // "" | tostring), ($x2 // "" | tostring), ($x3 // "" | tostring)]
       | map(gsub("[[:cntrl:]]"; " ")) | join("\u001f")), ($o | tojson);
    def start($c; $a; $src): out("start"; $c; .prompt_id; .transcript_path;
      $base + {ev: "pipeline_start", command: $c, args: ($a | a80), source: $src, pipeline: $c, pipeline_ts: $ts});
  if $ev == "UserPromptExpansion" then
    ((.command_name // "") | bcmd) as $c | if $c == null then empty else start($c; (.command_args // ""); "expansion") end
  elif $ev == "UserPromptSubmit" then
    ((.prompt // "") | if type == "string" then gsub("^\\s+|\\s+$"; "") else "" end) as $p
    | ([$p | capture("^/(?<n>[A-Za-z0-9_:-]+)(?:\\s+(?<a>[\\s\\S]*))?$")] | .[0]) as $sl
    | ([$p | capture("<command-name>/?(?<n>[^<]+)</command-name>")] | .[0]) as $tg
    | if $sl != null or $tg != null then
        (($sl.n // $tg.n) | bcmd) as $c
        | if $c == null then empty
          else start($c; (if $sl != null then ($sl.a // "") else ([$p | capture("<command-args>(?<a>[\\s\\S]*?)</command-args>")] | .[0].a // "") end); "prompt_submit") end
      elif $p == "" or ($p | test("^<(?!pasted_content)[A-Za-z][A-Za-z0-9_-]*[\\s>/]"))
           or ($p | test("<task-notification>|<cross-session-message[\\s>]|<teammate-message[\\s>]")) then empty
      else out("turn"; ""; .prompt_id; ""; $base + {ev: "human_turn"}) end
  elif $ev == "PostToolUse" then
    (.tool_name // "") as $tn
    | if $tn == "Skill" then
        ((.tool_input.skill // .tool_input.command // "") | bcmd) as $c
        | if $c == null then empty else start($c; (.tool_input.args // ""); "skill_tool") end
      elif ($tn == "Edit" or $tn == "Write" or $tn == "MultiEdit") then
        (.tool_input.file_path // "" | tostring) as $fp
        | if ($fp | test("/\\.crew/history\\.md$") | not) then empty else
          (if $tn == "Write" then (.tool_input.content // "")
           else (.tool_input.new_string // ([.tool_input.edits[]?.new_string] | join("\n"))) end | tostring) as $new
          | (if $tn == "Write" then (.tool_response.originalFile? // null)
             else (.tool_input.old_string // ([.tool_input.edits[]?.old_string] | join("\n"))) end) as $old
          | (if $old == null then [] else ($old | tostring | split("\n")) end) as $ol
          | [$new | split("\n")[] | select(. as $l | any($ol[]; . == $l) | not) | hdr] as $hs
          | if ($hs | length) == 0 then empty else
            $hs[0] as $h | ($h.st | gsub("[*`]"; "") | clean | .[0:40]) as $st | ($fp | sub("/\\.crew/history\\.md$"; "")) as $pd
            | out("end"; "\($h.slug)|\($st)"; $pd; ($pd | key);
                $base + {ev: "pipeline_end", slug: ($h.slug | clean), command: ($h.cmd // ($h.slug | split("_")[0]) | clean),
                         status: $st, result: ($st | cls), date: $h.d,
                         parse: (if $tn == "Write" and $old == null then "write_head" else "diff" end)})
          end
        end
      else empty end
  elif $ev == "SubagentStart" then
    (.agent_id // "" | tostring) as $aid | if $aid == "" then empty else out("astart"; ($aid | key); ""; ""; {}) end
  elif $ev == "SubagentStop" then
    (.agent_id // "" | tostring) as $aid | (.agent_type // "" | tostring) as $at
    | if $aid == "" or $at == "" then empty else
        out("astop"; ($aid | key); (.agent_transcript_path // ""); "";
            $base + {ev: "agent_end", agent_type: $at, agent_id: $aid, dur_ms: "__DUR__", usage: null,
                     stop_hook_active: (.stop_hook_active // false)})
      end
  elif $ev == "Stop" then out("stop"; ""; (.transcript_path // ""); ""; $base + {ev: "session_usage", usage: null})
  else empty end' 2>/dev/null) || exit 0
[ -z "$RES" ] && exit 0
case "$RES" in *$'\n'*) ;; *) exit 0 ;; esac
META=${RES%%$'\n'*}; LINE=${RES#*$'\n'}
IFS="$US" read -r KIND SK CWD NOWS NOWMS TS X1 X2 X3 <<EOF
$META
EOF
case "$NOWS" in ''|*[!0-9]*) exit 0 ;; esac
[ -n "$SK" ] || exit 0

# cwd(또는 지정 디렉터리)에서 상위로 .git 을 찾아 그 이름, 없으면 디렉터리 이름 — 프로세스 0개
proj_of() {
  local d="${1%/}" s="${1%/}"
  while [ -n "$d" ]; do
    [ -e "$d/.git" ] && { printf '%s' "${d##*/}"; return 0; }
    d="${d%/*}"
  done
  s="${s##*/}"; printf '%s' "${s:-unknown}"
}
jstr() { local v="$1"; v=${v//\\/\\\\}; v=${v//\"/\\\"}; printf '"%s"' "$v"; }
# read_state <file> → OTS OCMD OPID OEP (12시간 지난 상태는 무효화)
OTS=""; OCMD=""; OPID=""; OEP=""
read_state() {
  [ -f "$1" ] || return 1
  IFS="$US" read -r OTS OCMD OPID OEP < "$1"
  case "$OEP" in ''|*[!0-9]*) OCMD=""; return 1 ;; esac
  if [ $((NOWS - OEP)) -gt 43200 ]; then rm -f "$1" 2>/dev/null; OCMD=""; return 1; fi
  [ -n "$OCMD" ]
}
# fill <project-dir> <pipeline-cmd> <pipeline-ts> — 자리표시자 치환
fill() {
  local p c t
  p=$(jstr "$(proj_of "$1")")
  if [ -n "$2" ]; then c=$(jstr "$2"); t=$(jstr "$3"); else c=null; t=null; fi
  LINE=${LINE/'"__PROJ__"'/"$p"}; LINE=${LINE/'"__PCMD__"'/"$c"}; LINE=${LINE/'"__PTS__"'/"$t"}
}
emit() { [ -n "$LINE" ] && printf '%s\n' "$LINE" >> "$OUT" 2>/dev/null; return 0; }
OPEN="$ST/$SK.open"; CLOSING="$ST/$SK.closing"; LINES="$ST/$SK.lines"
D="${CWD:-$PWD}"

case "$KIND" in
  start)
    if read_state "$OPEN"; then
      [ -n "$X2" ] && [ "$X2" = "$OPID" ] && exit 0
      [ "$X1" = "$OCMD" ] && [ $((NOWS - OEP)) -lt 10 ] && exit 0
      case "$LINE" in *'"source":"skill_tool"'*) exit 0 ;; esac   # 파이프라인 안의 Skill 호출 = 중첩
    fi
    fill "$D" "" ""; emit
    printf '%s\n' "$TS$US$X1$US$X2$US$NOWS" > "$OPEN" 2>/dev/null
    rm -f "$CLOSING" 2>/dev/null
    TP="$X3"; case "$TP" in '~/'*) TP="$HOME/${TP#\~/}" ;; esac
    if [ -n "$TP" ] && [ -r "$TP" ]; then n=$(wc -l < "$TP" 2>/dev/null); echo $((${n:-0} + 0)) > "$LINES" 2>/dev/null
    else rm -f "$LINES" 2>/dev/null; fi
    find "$ST" -type f -mtime +2 -delete 2>/dev/null
    ;;
  turn)
    read_state "$OPEN" || exit 0
    [ -n "$X2" ] && [ "$X2" = "$OPID" ] && exit 0
    [ $((NOWS - OEP)) -lt 3 ] && exit 0
    fill "$D" "$OCMD" "$OTS"; emit
    ;;
  end)
    HK="$ST/h_$X3"; LAST=""
    [ -f "$HK" ] && IFS= read -r LAST < "$HK"
    [ "$LAST" = "$X1" ] && exit 0
    if read_state "$OPEN"; then fill "$X2" "$OCMD" "$OTS"; else fill "$X2" "" ""; fi
    emit
    printf '%s\n' "$X1" > "$HK" 2>/dev/null
    [ -n "$OCMD" ] && mv -f "$OPEN" "$CLOSING" 2>/dev/null   # Stop 1회분 usage를 더 받은 뒤 닫는다
    ;;
  astart)
    printf '%s\n' "$NOWMS" > "$ST/a_$X1" 2>/dev/null
    ;;
  astop)
    DUR=null; S0=""
    [ -f "$ST/a_$X1" ] && IFS= read -r S0 < "$ST/a_$X1"
    case "$S0" in ''|*[!0-9]*) ;; *) [ "$NOWMS" -ge "$S0" ] 2>/dev/null && DUR=$((NOWMS - S0)) ;; esac
    LINE=${LINE/'"__DUR__"'/"$DUR"}
    if read_state "$OPEN" || read_state "$CLOSING"; then fill "$D" "$OCMD" "$OTS"; else fill "$D" "" ""; fi
    TP="$X2"; case "$TP" in '~/'*) TP="$HOME/${TP#\~/}" ;; esac
    if [ -n "$TP" ] && [ -r "$TP" ]; then
      R=$(jq -Rnc --argjson b "$LINE" '
        def uof: {input: (.input_tokens // 0), output: (.output_tokens // 0), cache_read: (.cache_read_input_tokens // 0),
                  cache_creation: (.cache_creation_input_tokens // 0), cache_creation_1h: (.cache_creation.ephemeral_1h_input_tokens? // 0)};
        def addu: reduce .[] as $x ({input: 0, output: 0, cache_read: 0, cache_creation: 0, cache_creation_1h: 0};
                    reduce ($x | to_entries[]) as $e (.; .[$e.key] += ($e.value | numbers // 0)));
        def tsec: try (sub("\\.[0-9]+Z$"; "Z") | fromdate) catch null;
        [inputs | fromjson? | objects] as $rows
        | (reduce ($rows[] | select((.message | type) == "object") | select((.message.usage | type) == "object")
                   | select((.message.model // "") != "<synthetic>")) as $m
             ({}; .[($m.message.id // $m.uuid // "?") | tostring] = {model: ($m.message.model // "unknown"), u: ($m.message.usage | uof)})) as $byid
        | [$byid[]] as $L | [$rows[] | .timestamp? | strings] as $tss
        | $b + {usage: (if ($L | length) == 0 then null else
                   (($L | map(.u) | addu) + {messages: ($L | length),
                     by_model: ($L | group_by(.model) | map({key: .[0].model, value: (map(.u) | addu)}) | from_entries)}) end),
                t_first: ($tss | first), t_last: ($tss | last)}
        | if .dur_ms == null and .t_first != null and .t_last != null
             and ((.t_first | tsec) != null) and ((.t_last | tsec) != null)
          then .dur_ms = (((.t_last | tsec) - (.t_first | tsec)) * 1000) | .dur_src = "transcript"
          elif .dur_ms != null then .dur_src = "start_pair" else . end' < "$TP" 2>/dev/null)
      [ -n "$R" ] && LINE="$R"
    fi
    emit
    ;;
  stop)
    STATEF="$OPEN"; read_state "$OPEN" || { STATEF="$CLOSING"; read_state "$CLOSING"; } || exit 0
    TP="$X2"; case "$TP" in '~/'*) TP="$HOME/${TP#\~/}" ;; esac
    if [ -n "$TP" ] && [ -r "$TP" ]; then
      OFF=0; [ -f "$LINES" ] && IFS= read -r OFF < "$LINES"; case "$OFF" in ''|*[!0-9]*) OFF=0 ;; esac
      TOT=$(wc -l < "$TP" 2>/dev/null); TOT=$((${TOT:-0} + 0))
      if [ "$TOT" -gt "$OFF" ]; then
        fill "$D" "$OCMD" "$OTS"
        R=$(tail -n +$((OFF + 1)) "$TP" 2>/dev/null | head -n $((TOT - OFF)) | jq -Rnc --argjson b "$LINE" '
          def uof: {input: (.input_tokens // 0), output: (.output_tokens // 0), cache_read: (.cache_read_input_tokens // 0),
                    cache_creation: (.cache_creation_input_tokens // 0), cache_creation_1h: (.cache_creation.ephemeral_1h_input_tokens? // 0)};
          def addu: reduce .[] as $x ({input: 0, output: 0, cache_read: 0, cache_creation: 0, cache_creation_1h: 0};
                      reduce ($x | to_entries[]) as $e (.; .[$e.key] += ($e.value | numbers // 0)));
          (reduce (inputs | fromjson? | objects | select((.message | type) == "object") | select((.message.usage | type) == "object")
                   | select((.message.model // "") != "<synthetic>")) as $m
             ({}; .[($m.message.id // $m.uuid // "?") | tostring] = {model: ($m.message.model // "unknown"), u: ($m.message.usage | uof)})) as $byid
          | [$byid[]] as $L
          | if ($L | length) == 0 then empty else
            $b + {usage: (($L | map(.u) | addu) + {messages: ($L | length),
                    by_model: ($L | group_by(.model) | map({key: .[0].model, value: (map(.u) | addu)}) | from_entries)})} end' 2>/dev/null)
        [ -n "$R" ] && { LINE="$R"; emit; }
        echo "$TOT" > "$LINES" 2>/dev/null
      fi
    fi
    [ "$STATEF" = "$CLOSING" ] && rm -f "$CLOSING" "$LINES" 2>/dev/null
    ;;
esac
exit 0
