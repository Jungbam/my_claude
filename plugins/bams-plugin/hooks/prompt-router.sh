#!/usr/bin/env bash
# prompt-router.sh — UserPromptSubmit: 슬래시 없는 입력을 route-table.json으로 결정적 분류해 후보 커맨드/스킬을
#   additionalContext로 주입한다. LLM 호출 없음, 프롬프트 변경·차단 없음. 최종 판단은 메인 모델.
# 공식 사실(https://code.claude.com/docs/en/hooks#userpromptsubmit): matcher 미지원(모든 프롬프트에서 실행),
#   예약 작업·/loop·백그라운드 서브에이전트 보고·다른 세션 메시지에도 발화, 슬래시 입력은 원문 그대로,
#   붙여넣기는 <pasted_content id="…"> … </pasted_content id="…"> 줄 사이로 온다. 기본 timeout 30초(초과 시 출력 폐기).
# 모드: BAMS_ROUTER=off|suggest|auto (기본 suggest — 실행 없이 추천만. 자동 실행은 BAMS_ROUTER=auto 로만). 표: ${CLAUDE_PLUGIN_ROOT}/references/route-table.json
#   (BAMS_ROUTE_TABLE=<경로>로 대체 — 테스트용). 외부 프로세스: cat 1 + jq 2. 모든 자기 오류는 fail-open(exit 0).
# .crew 판정: 입력 cwd에서 상위로 .crew/config.md 탐색(.git이 있는 디렉터리 또는 $HOME에서 정지) → $CLAUDE_PROJECT_DIR.
set +e

INPUT=$(cat 2>/dev/null)
[ -n "${BAMS_HOOK_TRACE:-}${BAMS_HOOK_CAPTURE_DIR:-}" ] && . "${0%/*}/lib/trace.sh" 2>/dev/null && bams_hook_trace prompt-router "$INPUT"

MODE="${BAMS_ROUTER:-suggest}"
case "$MODE" in off) exit 0 ;; auto|suggest) ;; *) MODE=suggest ;; esac
[ -z "$INPUT" ] && exit 0
command -v jq >/dev/null 2>&1 || exit 0
ROOT="${CLAUDE_PLUGIN_ROOT:-${0%/*}/..}"
TABLE="${BAMS_ROUTE_TABLE:-$ROOT/references/route-table.json}"
[ -f "$TABLE" ] || exit 0

# crew_root <dir> → .crew/config.md를 가진 가장 가까운 상위 디렉터리(.git 경계·$HOME 포함 검사 후 정지)
crew_root() {
  local d="${1%/}"
  while [ -n "$d" ]; do
    [ -f "$d/.crew/config.md" ] && { printf '%s' "$d"; return 0; }
    { [ -e "$d/.git" ] || [ "$d" = "$HOME" ]; } && return 1
    d="${d%/*}"
  done
  return 1
}
CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)
case "$CWD" in /*) ;; *) CWD="$PWD" ;; esac
CREW_DIR=$(crew_root "$CWD")
if [ -z "$CREW_DIR" ] && [ -n "${CLAUDE_PROJECT_DIR:-}" ] && [ -f "$CLAUDE_PROJECT_DIR/.crew/config.md" ]; then
  CREW_DIR="${CLAUDE_PROJECT_DIR%/}"
fi

printf '%s' "$INPUT" | jq -c --slurpfile T "$TABLE" --arg mode "$MODE" --arg crewdir "$CREW_DIR" --arg cwd "${CWD%/}" '
  def ok($re): try test($re; "i") catch false;
  def hit($re): try (match($re; "i") | .string | gsub("\\s+"; " ") | .[0:30]) catch empty;
  def trim: gsub("^\\s+|\\s+$"; "");
  $T[0] as $tab
  | ((.prompt // "") | if type == "string" then trim else "" end) as $raw
  | if $raw == "" or ($raw | test("^[/!]"))
       or ($raw | test("^<(?!pasted_content)[A-Za-z][A-Za-z0-9_-]*[\\s>/]"))
       or ($raw | test("<task-notification>|<cross-session-message[\\s>]|<teammate-message[\\s>]"))
    then empty else
  ($raw | gsub("<pasted_content[^>\\n]*>[\\s\\S]*?</pasted_content[^>\\n]*>"; " ")
        | gsub("<pasted_content[^>\\n]*>[\\s\\S]*$"; " ") | trim) as $body
  | if ($body | length) < ($tab.skip.min_chars // 8)
       or any(($tab.skip.patterns // [])[]; . as $p | $body | ok($p))
    then empty else
  $body[0:($tab.skip.max_scan_chars // 1500)] as $t
  | ($crewdir != "") as $crew
  | any(($tab.global_negative // [])[]; . as $p | $t | ok($p)) as $doc
  | [ $tab.routes[] | . as $r
      | select(($doc | not) or ($r.doc_ok // false))
      | select(all(($r.negative // [])[]; . as $p | ($t | ok($p)) | not))
      | [($r.patterns.high // [])[] as $p | $t | hit($p)] as $hh
      | [($r.patterns.med // [])[] as $p | $t | hit($p)] as $mm
      | { r: $r, h: ($hh | length), ev: ($hh + $mm),
          score: (3 * ($hh | length) + ($mm | length) + (if ($hh | length) > 0 then ($r.priority // 0) else 0 end)) }
      | select(.score >= 2) ]
  | sort_by(-.score)
  | reduce .[] as $x ([]; if any(.[]; .r.target == $x.r.target) then . else . + [$x] end)
  | .[0:3] as $c
  | if ($c | length) == 0 then empty else
  $c[0] as $b
  | def disp: if startswith("/") then . else "\($tab.plugin):\(.)" end;
    def skill: if startswith("/bams:") then "\($tab.plugin):bams:\(.[6:])" else "\($tab.plugin):\(.)" end;
  (($b.r.chain // [$b.r.target]) | if $b.r.needs_crew and ($crew | not) then ["/bams:init"] + . else . end) as $chain
  | ($chain[0] == "/bams:init" and $b.r.target != "/bams:init") as $initchain
  | (if $b.h == 0 or $initchain then "med"
     elif any($c[1:][]; .h > 0 and .h >= $b.h) then "med"
     else "high" end) as $conf
  | ($b.ev | reduce .[] as $e ([]; if index([$e]) then . else . + [$e] end) | .[0:3] | map("\"\(.)\"") | join(", ")) as $why
  | ($b.r.target | disp) as $top
  | [ "[bams router] 후보: \($top) (\($conf), 근거: \($why))"
      + (if ($chain | length) > 1 then " | 체인: \($chain | map(disp) | join(" → "))" else "" end)
      + " | 모드: \($mode)",
      (if ($c | length) > 1 then
         "대안: " + ([$c[1:][] | "\(.r.target | disp) (\(if .h > 0 then "high" else "med" end))"] | join(", "))
         + (if ($crew | not) and any($c[1:][]; .r.needs_crew) then " — .crew/config.md 없음: 파이프라인을 고르면 /bams:init 먼저" else "" end)
       else empty end),
      (if $crew and $crewdir != $cwd then ".crew 위치: \($crewdir) (cwd \($cwd) 기준 상위/프로젝트 루트 — 하위에 새 .crew를 만들지 말 것)" else empty end),
      (if $mode == "suggest" then
         "행동(suggest): 실행하지 말고 일반 응답 끝에 \"추천: \($top)\" 한 줄만 덧붙인다."
       elif $conf == "high" then
         "행동(high): 첫 줄에 \"→ \($chain | map(disp) | join(" → ")) 로 진행 (원치 않으면 말씀해 주세요)\" 한 줄 고지 후 Skill tool로 실행: "
         + ([$chain | to_entries[] | (.value | skill)
              + (if .value == "/bams:init" then "(인자 없음)"
                 elif .key == (if $chain[0] == "/bams:init" then 1 else 0 end) then "(args=사용자 요청 원문)" else "" end)]
            | join(" → "))
         + (if ($chain | length) > 1 then ". 앞 단계가 끝나면 다음 단계를 이어서 실행." else "." end)
       elif $initchain then
         "행동(med): .crew/config.md 없음 — 바로 실행하지 말고 AskUserQuestion으로 \"/bams:init 후 \($chain[1:] | map(disp) | join(" → "))\"\(if ($c | length) > 1 then "·위 대안" else "" end)·\"일반 응답\" 중 하나를 고르게 한 뒤 고른 순서대로 Skill 실행(init은 인자 없음)."
       else
         "행동(med): 바로 실행하지 말고 AskUserQuestion으로 위 후보 2~3개와 \"일반 응답\" 중 하나를 고르게 한 뒤 고른 Skill을 실행."
       end),
      "무시: 진행 중 파이프라인·직전 질문에 대한 답변/후속 지시, 커맨드 자체에 대한 질문, 잡담으로 보이면 이 힌트를 무시하고 일반 응답. 사용자가 거부하면 재제안하지 않는다."
    ] | join("\n")
  | {hookSpecificOutput: {hookEventName: "UserPromptSubmit", additionalContext: .}}
  end end end
' 2>/dev/null
exit 0
