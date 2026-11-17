#!/usr/bin/env bash
# verdict-gate.sh — PreToolUse(Bash): 머지·base 브랜치 push·프로덕션 배포 명령 직전에, 대상 커밋(sha 또는 patch-id)에
#   맞는 PASS verdict(.crew/artifacts/review/verdict-*.json, 판정자≠구현자)가 있는지 확인한다. 규약: references/verdict-protocol.md
# 수준: BAMS_VERDICT_GATE=off|warn|strict (기본 warn). warn=additionalContext 안내, strict=deny.
# 대상(명령 위치에 올 때만): gh pr merge · gh api …/pulls/<N>/merge(PUT/POST)·graphql mergePullRequest
#   · git push <remote> <base 브랜치로 가는 refspec>|--all|--mirror (refspec 없으면 @{push} 대상, 없으면 현재 브랜치)
#   · vercel … --prod · netlify deploy … --prod · fly|flyctl deploy. --dry-run/-n·--delete/-d·--help 는 제외.
#   base = main·master·origin/HEAD 가 가리키는 브랜치.
# 정규화(우회 방지): 따옴표·역슬래시 제거(셸 규칙대로 토큰화, 따옴표 안 구분자는 분리하지 않음), VAR=val·env·command·
#   sudo·nice·timeout·nohup·exec 접두, /usr/bin/git 같은 절대경로, git 전역 옵션(--no-pager, -C dir, -c k=v, --git-dir,
#   --work-tree 등), bash|sh|zsh -c "<내부 명령>"·eval(재귀 3단), gh -R/--repo, refspec(HEAD:main, +main, refs/heads/main).
# 적용 범위: 대상 저장소 최상위에 .crew/ 가 있을 때만(bams 워크스페이스). 그 외·자기 오류는 모두 fail-open(exit 0).
# gh pr merge 대상: 인자(PR 번호·브랜치·URL)나 -R 이 있거나 현재 브랜치가 base 면
#   `gh pr view --json headRefOid`(BAMS_VERDICT_GH=off 로 끔, BAMS_VERDICT_GH_TIMEOUT 초 제한 기본 5) — 실패하면
#   "대상 미확인"(warn 안내 / strict deny). 현재 브랜치 HEAD 로 대신 대조하지 않는다. 인자 없이 feature 브랜치에서면 HEAD.
set +e

INPUT=$(cat 2>/dev/null)
[ -n "${BAMS_HOOK_TRACE:-}${BAMS_HOOK_CAPTURE_DIR:-}" ] && . "$(dirname "$0")/lib/trace.sh" 2>/dev/null && bams_hook_trace verdict-gate "$INPUT"

LEVEL="${BAMS_VERDICT_GATE:-warn}"
case "$LEVEL" in off|OFF|0|false|no) exit 0 ;; warn|strict) ;; *) LEVEL=warn ;; esac
# 빠른 종료(프로세스 0개): 대상 키워드가 아예 없으면 jq 도 띄우지 않는다
case "$INPUT" in *push*|*merge*|*Merge*|*deploy*|*--prod*) ;; *) exit 0 ;; esac

US=$'\x1f'; RS=$'\x1e'
# 셸 규칙 근사 토큰화: 따옴표('…', "…")·역슬래시 처리, 따옴표 밖의 ; & | ( ) ` $( 줄바꿈에서 세그먼트 분리.
#   출력: 토큰은 \x1f, 세그먼트는 \x1e 로 끝난다. >&·2>&1 의 & 는 구분자가 아니다. 줄 머리 # 주석은 버린다.
AWK_SPLIT='
function flush() { if (tok != "" || has) { seg = (ntok ? seg US : "") tok; ntok++ } tok = ""; has = 0 }
function endseg() { flush(); if (ntok) { gsub(/\n/, " ", seg); printf "%s%s", seg, RSEP } seg = ""; ntok = 0 }
BEGIN { US = sprintf("%c", 31); RSEP = sprintf("%c", 30) }
{ s = (NR > 1) ? s "\n" $0 : $0 }
END {
  n = length(s); q = ""; tok = ""; has = 0; seg = ""; ntok = 0
  for (i = 1; i <= n; i++) {
    c = substr(s, i, 1)
    if (q == "\047") { if (c == "\047") q = ""; else tok = tok c; continue }
    if (q == "\"") {
      if (c == "\\" && i < n) { d = substr(s, i + 1, 1); if (d == "\"" || d == "\\" || d == "$" || d == "`") { tok = tok d; i++; continue } if (d == "\n") { i++; continue } }
      if (c == "\"") { q = ""; continue }
      tok = tok c; continue
    }
    if (c == "\\") { if (i < n) { i++; d = substr(s, i, 1); if (d != "\n") { tok = tok d; has = 1 } } continue }
    if (c == "\047" || c == "\"") { q = c; has = 1; continue }
    if (c == "#" && tok == "" && !has) { while (i < n && substr(s, i + 1, 1) != "\n") i++; continue }
    if (c == " " || c == "\t") { flush(); continue }
    if (c == "&") { p = substr(s, i - 1, 1); if (p == ">" || p == "<" || substr(s, i + 1, 1) == ">") { tok = tok c; continue } }
    if (c == "$" && substr(s, i + 1, 1) == "(") { endseg(); i++; continue }
    if (c == "\n" || c == ";" || c == "&" || c == "|" || c == "(" || c == ")" || c == "`") { endseg(); continue }
    tok = tok c
  }
  endseg()
}'

BASES="main master"
load_bases() {  # load_bases <dir> → BASES
  local oh
  BASES="main master"
  oh=$(git -C "$1" symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null); [ -n "$oh" ] && BASES="$BASES ${oh#origin/}"
}
is_base() { case " $BASES " in *" $1 "*) return 0 ;; esac; return 1; }

# 결과 전역: ACTION(대상 설명, 빈 값=대상 아님) TARGET_REF(PR|PR_UNKNOWN|<rev>) PR_ARG GH_REPO GIT_DIR_OPT ACT_DIR
ACTION=""; TARGET_REF=""; PR_ARG=""; GH_REPO=""; GIT_DIR_OPT=""; ACT_DIR=""; FOUND=0

# classify_git_push <dir> <tokens after "push"...>
classify_git_push() {
  local d="$1"; shift
  local tok skip=0 remote="" src dst cur all=0 nopt=0 refs=() gd="${GIT_DIR_OPT:-$d}" up
  for tok in "$@"; do
    [ "$skip" = 1 ] && { skip=0; continue; }
    if [ "$nopt" = 0 ]; then
      case "$tok" in
        --) nopt=1; continue ;;
        --dry-run|-n|--delete|-d|--help|-h) return ;;
        --all|--mirror|--branches) all=1; continue ;;
        -o|--push-option|--repo|--receive-pack|--exec) skip=1; continue ;;
        -*) continue ;;
      esac
    fi
    if [ -z "$remote" ]; then remote="$tok"; else refs+=("$tok"); fi
  done
  load_bases "$gd"
  cur=$(git -C "$gd" symbolic-ref -q --short HEAD 2>/dev/null)
  if [ "$all" = 1 ]; then ACTION="git push --all/--mirror"; TARGET_REF="HEAD"; return; fi
  if [ "${#refs[@]}" = 0 ]; then
    # refspec 없음: push.default·upstream 이 정하는 대상(@{push}) — 없으면 현재 브랜치 이름
    up=$(git -C "$gd" rev-parse -q --abbrev-ref --symbolic-full-name '@{push}' 2>/dev/null)
    if [ -n "$up" ] && [ "$up" != '@{push}' ]; then dst="${up#*/}"; else dst="$cur"; fi
    [ -n "$dst" ] && is_base "$dst" && { ACTION="git push${remote:+ $remote} (→ $dst)"; TARGET_REF="HEAD"; }
    return
  fi
  for tok in "${refs[@]}"; do
    tok="${tok#+}"
    case "$tok" in *:*) src="${tok%%:*}"; dst="${tok#*:}" ;; *) src="$tok"; dst="$tok" ;; esac
    [ -z "$src" ] && continue                 # ":branch" = 원격 브랜치 삭제
    case "$src" in @) src=HEAD ;; esac
    case "$dst" in HEAD|@) dst="$cur" ;; esac
    dst="${dst#refs/heads/}"
    if is_base "$dst"; then ACTION="git push $remote $tok"; TARGET_REF="$src"; return; fi
  done
}

# classify <dir> <tokens...> — 접두(env·sudo 등)는 호출 전에 제거된 상태
classify() {
  local d="$1"; shift
  local c="${1##*/}" j tok skip pos=() method="" fields=0 ep="" prod=0
  case "$c" in
    git)
      shift
      while [ $# -gt 0 ]; do
        case "$1" in
          -C) [ $# -ge 2 ] || return; case "$2" in /*|"~"*) GIT_DIR_OPT="$2" ;; *) GIT_DIR_OPT="${GIT_DIR_OPT:+$GIT_DIR_OPT/}$2" ;; esac; shift 2 ;;
          -c|--namespace|--exec-path|--config-env|--super-prefix) shift 2 ;;
          --work-tree) GIT_DIR_OPT="$2"; shift 2 ;;
          --work-tree=*) GIT_DIR_OPT="${1#*=}"; shift ;;
          --git-dir) GIT_DIR_OPT="${2%/.git}"; shift 2 ;;
          --git-dir=*) j="${1#*=}"; GIT_DIR_OPT="${j%/.git}"; shift ;;
          -*) shift ;;
          *) break ;;
        esac
      done
      [ "${1:-}" = push ] || return
      shift
      if [ -n "$GIT_DIR_OPT" ]; then
        case "$GIT_DIR_OPT" in "~"*) GIT_DIR_OPT="$HOME${GIT_DIR_OPT#\~}" ;; /*) ;; *) GIT_DIR_OPT="$d/$GIT_DIR_OPT" ;; esac
      fi
      classify_git_push "$d" "$@"
      return ;;
    gh)
      shift; skip=0
      for tok in "$@"; do
        case "$tok" in *mergePullRequest*) [ "${pos[0]:-}" = api ] && { ACTION="gh api graphql mergePullRequest"; TARGET_REF=PR_UNKNOWN; return; } ;; esac
        if [ "$skip" = 1 ]; then skip=0; continue; fi
        if [ "$skip" = R ]; then skip=0; GH_REPO="$tok"; continue; fi
        if [ "$skip" = X ]; then skip=0; method="$tok"; continue; fi
        case "$tok" in
          --help|-h) return ;;
          -R|--repo) skip=R ;;
          --repo=*) GH_REPO="${tok#*=}" ;;
          -X|--method) skip=X ;;
          --method=*) method="${tok#*=}" ;;
          -X*) method="${tok#-X}" ;;
          -f|-F|--field|--raw-field|--input) fields=1; skip=1 ;;
          --field=*|--raw-field=*|--input=*) fields=1 ;;
          -b|--body|--body-file|-t|--subject|-A|--author-email|--match-head-commit|-H|--header|-q|--jq|--template|--hostname|-p|--preview|--cache) skip=1 ;;
          -*) ;;
          *) pos+=("$tok") ;;
        esac
      done
      if [ "${pos[0]:-}" = pr ] && [ "${pos[1]:-}" = merge ]; then
        PR_ARG="${pos[2]:-}"; ACTION="gh pr merge${PR_ARG:+ $PR_ARG}${GH_REPO:+ -R $GH_REPO}"; TARGET_REF="PR"; return
      fi
      if [ "${pos[0]:-}" = api ]; then
        ep="${pos[1]:-}"
        [ -z "$method" ] && [ "$fields" = 1 ] && method=POST
        method=$(printf '%s' "$method" | tr '[:lower:]' '[:upper:]')
        case "$method" in PUT|POST) ;; *) return ;; esac
        local re_ep='(^|/)repos/([^/]+/[^/]+)/pulls/([0-9]+)/merge/?$' re_ep2='(^|/)pulls/([0-9]+)/merge/?$'
        if [[ $ep =~ $re_ep ]]; then GH_REPO="${BASH_REMATCH[2]}"; PR_ARG="${BASH_REMATCH[3]}"
        elif [[ $ep =~ $re_ep2 ]]; then PR_ARG="${BASH_REMATCH[2]}"
        else return; fi
        ACTION="gh api $method …/pulls/$PR_ARG/merge"; TARGET_REF="PR"; return
      fi
      return ;;
  esac
  # npx/bunx/pnpm dlx/yarn dlx 실행기 제거
  case "$c" in
    npx|bunx) shift; while [ $# -gt 0 ]; do case "$1" in -p|--package) shift 2 ;; -*) shift ;; *) break ;; esac; done; c="${1##*/}" ;;
    pnpm|yarn) case "${2:-}" in dlx|exec) shift 2; c="${1##*/}" ;; esac ;;
  esac
  [ $# -gt 0 ] || return
  for tok in "$@"; do case "$tok" in --prod|--prod=*|--production|--production=*) prod=1 ;; esac; done
  case "$c" in
    vercel) [ "$prod" = 1 ] && { ACTION="vercel --prod"; TARGET_REF="HEAD"; } ;;
    netlify) [ "${2:-}" = deploy ] && [ "$prod" = 1 ] && { ACTION="netlify deploy --prod"; TARGET_REF="HEAD"; } ;;
    fly|flyctl) [ "${2:-}" = deploy ] && { ACTION="fly deploy"; TARGET_REF="HEAD"; } ;;
  esac
}

# scan <command-string> <cwd> <depth> — 세그먼트마다 접두 제거 → cd 추적 → sh -c/eval 재귀 → classify
scan() {
  local cmd="$1" d="$2" depth="$3" seg i n c t T
  [ "$depth" -gt 3 ] && return 0
  while IFS= read -r -d "$RS" seg; do
    [ "$FOUND" = 1 ] && return 0
    T=(); IFS="$US" read -r -a T <<< "$seg"
    n=${#T[@]}; i=0
    while [ $i -lt $n ]; do
      c="${T[$i]}"
      case "$c" in
        '{'|'}'|'!'|if|then|do|else|elif|while|until|time|exec|nohup|command|builtin) i=$((i + 1)) ;;
        env) i=$((i + 1))
             while [ $i -lt $n ]; do case "${T[$i]}" in -u|--unset|-C|--chdir) i=$((i + 2)) ;; -*|*=*) i=$((i + 1)) ;; *) break ;; esac; done ;;
        sudo|doas) i=$((i + 1))
             while [ $i -lt $n ]; do case "${T[$i]}" in -u|-g|-h|-p|-C|-D|-r|-t|-U|-T) i=$((i + 2)) ;; -*) i=$((i + 1)) ;; *) break ;; esac; done ;;
        nice) i=$((i + 1)); while [ $i -lt $n ]; do case "${T[$i]}" in -n) i=$((i + 2)) ;; -*) i=$((i + 1)) ;; *) break ;; esac; done ;;
        timeout|gtimeout) i=$((i + 1))
             while [ $i -lt $n ]; do case "${T[$i]}" in -s|-k|--signal|--kill-after) i=$((i + 2)) ;; -*) i=$((i + 1)) ;; *) break ;; esac; done
             i=$((i + 1)) ;;
        *)
          if [[ $c =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then i=$((i + 1)); else break; fi ;;
      esac
    done
    [ $i -lt $n ] || continue
    c="${T[$i]##*/}"
    case "$c" in
      cd)
        t="${T[$((i + 1))]:-$HOME}"
        case "$t" in "~"*) t="$HOME${t#\~}" ;; /*) ;; *) t="$d/$t" ;; esac
        [ -d "$t" ] && d="$t"
        continue ;;
      bash|sh|zsh|dash|ksh)
        local j=$((i + 1)) script=""
        while [ $j -lt $n ]; do
          case "${T[$j]}" in
            -o|+o|-O|+O) j=$((j + 2)) ;;
            --*) j=$((j + 1)) ;;
            -*c*) script="${T[$((j + 1))]:-}"; break ;;
            -*|+*) j=$((j + 1)) ;;
            *) break ;;
          esac
        done
        [ -n "$script" ] && scan "$script" "$d" $((depth + 1))
        continue ;;
      eval)
        [ $((i + 1)) -lt $n ] && scan "${T[*]:$((i + 1))}" "$d" $((depth + 1))
        continue ;;
    esac
    ACTION=""; TARGET_REF=""; PR_ARG=""; GH_REPO=""; GIT_DIR_OPT=""
    classify "$d" "${T[@]:$i}"
    if [ -n "$ACTION" ]; then FOUND=1; ACT_DIR="${GIT_DIR_OPT:-$d}"; return 0; fi
  done < <(printf '%s' "$cmd" | awk "$AWK_SPLIT" 2>/dev/null)
  return 0
}

main() {
  command -v jq >/dev/null 2>&1 || return 0
  command -v git >/dev/null 2>&1 || return 0
  local cmd cwd top
  cmd=$(printf '%s' "$INPUT" | jq -r 'select(.tool_name == "Bash") | .tool_input.command // ""' 2>/dev/null) || return 0
  [ -n "$cmd" ] || return 0
  cwd=$(printf '%s' "$INPUT" | jq -r '.cwd // ""' 2>/dev/null)
  [ -n "$cwd" ] || cwd="$PWD"
  scan "$cmd" "$cwd" 0
  [ "$FOUND" = 1 ] || return 0
  top=$(git -C "$ACT_DIR" rev-parse --show-toplevel 2>/dev/null) || return 0
  load_bases "$top"
  gate "$top"
  return 0
}

out() {  # out <msg> <deny?>
  if [ "$LEVEL" = strict ] && [ "$2" = deny ]; then
    jq -cn --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  else
    jq -cn --arg c "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$c}}'
  fi
}

# with_timeout <sec> <cmd...> — coreutils timeout/gtimeout, 없으면 perl alarm(macOS 기본), 그것도 없으면 그대로 실행
with_timeout() {
  local s="$1"; shift
  if command -v timeout >/dev/null 2>&1; then timeout "$s" "$@"
  elif command -v gtimeout >/dev/null 2>&1; then gtimeout "$s" "$@"
  elif command -v perl >/dev/null 2>&1; then perl -e 'alarm shift @ARGV; exec @ARGV or exit 127' "$s" "$@"
  else "$@"; fi
}

gate() {
  local top="$1" sha="" cur res code file by short hint st unknown=""
  [ -d "$top/.crew" ] || return 0
  . "$(dirname "$0")/lib/verdict.sh" 2>/dev/null || return 0
  hint="판정 방법: /bams:review(릴리스 게이트) 또는 release-quality-gate 가 hooks/lib/verdict.sh write 로 verdict 를 남긴다(구현 에이전트 ≠ 판정자). 규약: references/verdict-protocol.md. 수준 변경: BAMS_VERDICT_GATE=off|warn|strict."
  if [ "$TARGET_REF" = PR_UNKNOWN ]; then
    unknown="graphql mergePullRequest 는 대상 PR 을 해석하지 않는다"
  elif [ "$TARGET_REF" = PR ]; then
    cur=$(git -C "$top" symbolic-ref -q --short HEAD 2>/dev/null)
    if [ -z "$PR_ARG" ] && [ -z "$GH_REPO" ] && [ -n "$cur" ] && ! is_base "$cur"; then
      sha=$(git -C "$top" rev-parse -q --verify HEAD 2>/dev/null)   # 인자 없는 gh pr merge = 현재 브랜치의 PR
    else
      if [ "${BAMS_VERDICT_GH:-on}" = off ]; then unknown="BAMS_VERDICT_GH=off"
      elif ! command -v gh >/dev/null 2>&1; then unknown="gh 없음"
      else
        sha=$(cd "$top" && export GH_PROMPT_DISABLED=1 && with_timeout "${BAMS_VERDICT_GH_TIMEOUT:-5}" \
              gh pr view ${PR_ARG:+"$PR_ARG"} ${GH_REPO:+-R "$GH_REPO"} --json headRefOid -q .headRefOid 2>/dev/null)
        case "$sha" in *[!0-9a-f]*|'') sha=""; unknown="gh pr view 실패·시간 초과(${BAMS_VERDICT_GH_TIMEOUT:-5}s)" ;; esac
      fi
    fi
  else
    sha=$(git -C "$top" rev-parse -q --verify "${TARGET_REF:-HEAD}^{commit}" 2>/dev/null) || return 0
  fi
  if [ -n "$unknown" ] || [ -z "$sha" ]; then
    out "[bams verdict-gate] ${ACTION}: 대상 커밋을 확인하지 못했다(${unknown:-대상 미확인}). 현재 브랜치 HEAD 로 대신 대조하지 않는다 — PR head 를 확인한 뒤 \`verdict.sh check --sha <PR head sha>\` 로 PASS verdict 를 확인하라(gh pr view <N> --json headRefOid). ${hint}" deny
    return 0
  fi
  short="${sha:0:12}"
  res=$(bams_verdict_check "$top" "$sha" 2>/dev/null); code=$?
  # "<status> <file…> <match> <same_family>" — 파일 경로에 공백이 있어도 앞·뒤 토큰으로 분리
  st="${res%% *}"; file="${res#* }"; file="${file% *}"; by="${file##* }"; file="${file% *}"
  case "$code" in
    0) return 0 ;;
    3) out "[bams verdict-gate] ${ACTION}: 대상 커밋 ${short} 의 verdict 가 FAIL 이다(${file##*/}, ${by} 일치). 실패 원인을 고치고 재판정하기 전에는 진행하지 마라. ${hint}" deny ;;
    4) if [ "$st" = invalid_evidence ]; then
         out "[bams verdict-gate] ${ACTION}: 대상 커밋 ${short} 의 PASS verdict(${file##*/})는 evidence 가 비었거나 exit≠0·실행 명령 형식이 아니어서 무효다. 판정자가 검증 명령을 직접 실행하고 다시 기록해야 한다. ${hint}" deny
       else
         out "[bams verdict-gate] ${ACTION}: 대상 커밋 ${short} 의 verdict(${file##*/})는 판정자가 구현자 목록에 있어 무효다. 구현하지 않은 에이전트가 다시 판정해야 한다. ${hint}" deny
       fi ;;
    *) out "[bams verdict-gate] ${ACTION}: 대상 커밋 ${short} 에 맞는 PASS verdict 가 없다(sha·patch-id 모두 불일치 또는 .crew/artifacts/review/verdict-*.json 없음). ${hint}" deny ;;
  esac
  return 0
}

main
exit 0
