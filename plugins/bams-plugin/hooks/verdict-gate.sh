#!/usr/bin/env bash
# verdict-gate.sh — PreToolUse(Bash): 머지·base 브랜치 push·프로덕션 배포 명령 직전에, 대상 커밋(sha 또는 patch-id)에
#   맞는 PASS verdict(.crew/artifacts/review/verdict-*.json, 판정자≠구현자)가 있는지 확인한다. 규약: references/verdict-protocol.md
# 수준: BAMS_VERDICT_GATE=off|warn|strict (기본 warn). warn=additionalContext 안내, strict=deny.
# 대상(보수적 — 명령 위치에 올 때만): gh pr merge · git push <remote> <base 브랜치로 가는 refspec>|--all|--mirror
#   (refspec 없으면 현재 브랜치가 base 일 때만) · vercel … --prod · netlify deploy … --prod · fly|flyctl deploy.
#   --dry-run/-n·--delete/-d·--help 는 제외. base = main·master·origin/HEAD 가 가리키는 브랜치.
# 적용 범위: 대상 저장소 최상위에 .crew/ 가 있을 때만(bams 워크스페이스). 그 외·자기 오류는 모두 fail-open(exit 0).
# gh pr merge 대상: 인자가 있거나 현재 브랜치가 base 면 `gh pr view --json headRefOid`(BAMS_VERDICT_GH=off 로 끔), 아니면 HEAD.
set +e

INPUT=$(cat 2>/dev/null)
[ -n "${BAMS_HOOK_TRACE:-}${BAMS_HOOK_CAPTURE_DIR:-}" ] && . "$(dirname "$0")/lib/trace.sh" 2>/dev/null && bams_hook_trace verdict-gate "$INPUT"

LEVEL="${BAMS_VERDICT_GATE:-warn}"
case "$LEVEL" in off|OFF|0|false|no) exit 0 ;; warn|strict) ;; *) LEVEL=warn ;; esac
# 빠른 종료(프로세스 0개): 대상 키워드가 아예 없으면 jq 도 띄우지 않는다
case "$INPUT" in *push*|*merge*|*deploy*|*--prod*) ;; *) exit 0 ;; esac

is_base() { case " $BASES " in *" $1 "*) return 0 ;; esac; return 1; }

# classify <segment> <dir> → ACTION/TARGET_REF/PR_ARG 설정(대상 아니면 ACTION 빈 값)
ACTION=""; TARGET_REF=""; PR_ARG=""; GIT_DIR_OPT=""
classify() {
  local seg="$1" d="$2" rest tok skip=0 remote="" src dst cur all=0
  local re_env='^([[:alpha:]_][[:alnum:]_]*=[^[:space:]]*[[:space:]]+)+'
  [[ $seg =~ $re_env ]] && seg="${seg:${#BASH_REMATCH[0]}}"
  local re_gh='^gh[[:space:]]+pr[[:space:]]+merge([[:space:]]|$)'
  if [[ $seg =~ $re_gh ]]; then
    rest="${seg#*merge}"
    case " $rest " in *" --help "*|*" -h "*) return ;; esac
    local toks=(); read -ra toks <<< "$rest"   # read -a 는 glob 확장을 하지 않는다
    for tok in ${toks[@]+"${toks[@]}"}; do
      [ "$skip" = 1 ] && { skip=0; continue; }
      case "$tok" in
        -b|--body|-F|--body-file|-t|--subject|-A|--author-email|--match-head-commit|-R|--repo) skip=1 ;;
        -*) ;;
        *) [ -z "$PR_ARG" ] && PR_ARG="$tok" ;;
      esac
    done
    ACTION="gh pr merge${PR_ARG:+ $PR_ARG}"; TARGET_REF="PR"; return
  fi
  local re_git='^git(([[:space:]]+-C[[:space:]]+([^[:space:]]+))|([[:space:]]+-c[[:space:]]+[^[:space:]]+))*[[:space:]]+push([[:space:]]|$)'
  if [[ $seg =~ $re_git ]]; then
    [ -n "${BASH_REMATCH[3]}" ] && GIT_DIR_OPT="${BASH_REMATCH[3]}"
    rest="${seg#*push}"
    local refs=() toks=(); read -ra toks <<< "$rest"
    for tok in ${toks[@]+"${toks[@]}"}; do
      [ "$skip" = 1 ] && { skip=0; continue; }
      case "$tok" in
        --dry-run|-n|--delete|-d|--help|-h) return ;;
        --all|--mirror|--branches) all=1 ;;
        -o|--push-option|--repo|--receive-pack|--exec) skip=1 ;;
        -*) ;;
        *) if [ -z "$remote" ]; then remote="$tok"; else refs+=("$tok"); fi ;;
      esac
    done
    cur=$(git -C "${GIT_DIR_OPT:-$d}" symbolic-ref -q --short HEAD 2>/dev/null)
    if [ "$all" = 1 ]; then ACTION="git push --all/--mirror"; TARGET_REF="HEAD"; return; fi
    if [ "${#refs[@]}" = 0 ]; then
      [ -n "$cur" ] && is_base "$cur" && { ACTION="git push ($cur)"; TARGET_REF="HEAD"; }
      return
    fi
    for tok in "${refs[@]}"; do
      tok="${tok#+}"
      case "$tok" in *:*) src="${tok%%:*}"; dst="${tok#*:}" ;; *) src="$tok"; dst="$tok" ;; esac
      [ -z "$src" ] && continue                 # ":branch" = 원격 브랜치 삭제
      [ "$dst" = HEAD ] && dst="$cur"
      dst="${dst#refs/heads/}"
      if is_base "$dst"; then ACTION="git push $remote $tok"; TARGET_REF="$src"; return; fi
    done
    return
  fi
  local re_vc='^((npx|bunx|pnpm[[:space:]]+dlx|yarn[[:space:]]+dlx)[[:space:]]+)?vercel([[:space:]]|$)'
  local re_nl='^((npx|bunx)[[:space:]]+)?netlify[[:space:]]+deploy([[:space:]]|$)'
  local re_prod='[[:space:]]--prod(uction)?[[:space:]=]' re_fly='^(fly|flyctl)[[:space:]]+deploy([[:space:]]|$)'
  if [[ $seg =~ $re_vc ]] && [[ " $seg " =~ $re_prod ]]; then
    ACTION="vercel --prod"; TARGET_REF="HEAD"; return
  fi
  if [[ $seg =~ $re_nl ]] && [[ " $seg " =~ $re_prod ]]; then
    ACTION="netlify deploy --prod"; TARGET_REF="HEAD"; return
  fi
  if [[ $seg =~ $re_fly ]]; then
    ACTION="fly deploy"; TARGET_REF="HEAD"; return
  fi
}

main() {
  command -v jq >/dev/null 2>&1 || return 0
  command -v git >/dev/null 2>&1 || return 0
  local cmd cwd
  cmd=$(printf '%s' "$INPUT" | jq -r 'select(.tool_name == "Bash") | .tool_input.command // ""' 2>/dev/null) || return 0
  [ -n "$cmd" ] || return 0
  cwd=$(printf '%s' "$INPUT" | jq -r '.cwd // ""' 2>/dev/null)
  [ -n "$cwd" ] || cwd="$PWD"

  # 세그먼트 분리(; && || | 줄바꿈). 따옴표 안의 구분자는 고려하지 않는다 — 오탐 시 warn 안내뿐(strict 는 opt-in)
  local s="$cmd" seg d="$cwd" top RE_CD='^cd[[:space:]]+([^[:space:]]+)[[:space:]]*$'
  s=${s//&&/$'\n'}; s=${s//||/$'\n'}; s=${s//;/$'\n'}; s=${s//|/$'\n'}; s=${s//(/$'\n'}; s=${s//)/$'\n'}
  while IFS= read -r seg; do
    seg="${seg#"${seg%%[![:space:]]*}"}"
    [ -n "$seg" ] || continue
    if [[ $seg =~ $RE_CD ]]; then
      local t="${BASH_REMATCH[1]}"; t="${t%\"}"; t="${t#\"}"; t="${t%\'}"; t="${t#\'}"
      case "$t" in "~"*) t="$HOME${t#\~}" ;; /*) ;; *) t="$d/$t" ;; esac
      [ -d "$t" ] && d="$t"
      continue
    fi
    top=$(git -C "$d" rev-parse --show-toplevel 2>/dev/null) || continue
    BASES="main master"
    local oh; oh=$(git -C "$top" symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null); [ -n "$oh" ] && BASES="$BASES ${oh#origin/}"
    ACTION=""; TARGET_REF=""; PR_ARG=""; GIT_DIR_OPT=""
    classify "$seg" "$d"
    [ -n "$ACTION" ] || continue
    if [ -n "$GIT_DIR_OPT" ]; then
      case "$GIT_DIR_OPT" in /*) ;; *) GIT_DIR_OPT="$d/$GIT_DIR_OPT" ;; esac
      top=$(git -C "$GIT_DIR_OPT" rev-parse --show-toplevel 2>/dev/null) || continue
    fi
    gate "$top"
    return 0
  done <<EOF
$s
EOF
  return 0
}

out() {  # out <msg> <deny?>
  if [ "$LEVEL" = strict ] && [ "$2" = deny ]; then
    jq -cn --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  else
    jq -cn --arg c "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$c}}'
  fi
}

gate() {
  local top="$1" sha="" cur res code file by short hint
  [ -d "$top/.crew" ] || return 0
  . "$(dirname "$0")/lib/verdict.sh" 2>/dev/null || return 0
  if [ "$TARGET_REF" = PR ]; then
    cur=$(git -C "$top" symbolic-ref -q --short HEAD 2>/dev/null)
    if { [ -n "$PR_ARG" ] || is_base "$cur"; } && [ "${BAMS_VERDICT_GH:-on}" != off ] && command -v gh >/dev/null 2>&1; then
      sha=$(cd "$top" && GH_PROMPT_DISABLED=1 gh pr view ${PR_ARG:+"$PR_ARG"} --json headRefOid -q .headRefOid 2>/dev/null)
    fi
    if [ -z "$sha" ]; then
      if [ -n "$cur" ] && ! is_base "$cur"; then sha=$(git -C "$top" rev-parse -q --verify HEAD 2>/dev/null)
      else
        out "[bams verdict-gate] ${ACTION}: PR head 커밋을 확인하지 못해 verdict 를 대조하지 못했다(fail-open). 머지 전 PR 브랜치에서 \`verdict.sh check\` 로 PASS verdict 를 확인하라." allow
        return 0
      fi
    fi
  else
    sha=$(git -C "$top" rev-parse -q --verify "${TARGET_REF:-HEAD}^{commit}" 2>/dev/null) || return 0
  fi
  [ -n "$sha" ] || return 0
  short="${sha:0:12}"
  res=$(bams_verdict_check "$top" "$sha" 2>/dev/null); code=$?
  # "<status> <file…> <match> <same_family>" — 파일 경로에 공백이 있어도 앞·뒤 토큰으로 분리
  file="${res#* }"; file="${file% *}"; by="${file##* }"; file="${file% *}"
  hint="판정 방법: /bams:review(릴리스 게이트) 또는 release-quality-gate 가 hooks/lib/verdict.sh write 로 verdict 를 남긴다(구현 에이전트 ≠ 판정자). 규약: references/verdict-protocol.md. 수준 변경: BAMS_VERDICT_GATE=off|warn|strict."
  case "$code" in
    0) return 0 ;;
    3) out "[bams verdict-gate] ${ACTION}: 대상 커밋 ${short} 의 verdict 가 FAIL 이다(${file##*/}, ${by} 일치). 실패 원인을 고치고 재판정하기 전에는 진행하지 마라. ${hint}" deny ;;
    4) out "[bams verdict-gate] ${ACTION}: 대상 커밋 ${short} 의 verdict(${file##*/})는 판정자가 구현자 목록에 있어 무효다. 구현하지 않은 에이전트가 다시 판정해야 한다. ${hint}" deny ;;
    *) out "[bams verdict-gate] ${ACTION}: 대상 커밋 ${short} 에 맞는 PASS verdict 가 없다(sha·patch-id 모두 불일치 또는 .crew/artifacts/review/verdict-*.json 없음). ${hint}" deny ;;
  esac
  return 0
}

main
exit 0
