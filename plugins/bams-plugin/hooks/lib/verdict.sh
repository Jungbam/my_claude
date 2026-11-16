#!/usr/bin/env bash
# verdict.sh — SHA 결합 검증 판정(verdict) 파일 쓰기/조회. 규약 SSOT: references/verdict-protocol.md
#   source 해서 함수로 쓰거나(hooks/verdict-gate.sh), CLI로 실행한다(release-quality-gate·/bams:review·ship·deploy).
#
# CLI:
#   verdict.sh write --verdict PASS|FAIL --judge-agent A --judge-model M --author-agents a,b
#                    [--author-models m1,m2] --evidence "<exit>:<cmd>" [--evidence ...]
#                    [--base REF] [--pipeline SLUG] [--dir REPO]
#       → <repo>/.crew/artifacts/review/verdict-<shortsha>.json 작성, 경로 출력. 거부 시 exit 2
#         (judge ∈ author_agents / PASS인데 evidence 없음·exit≠0 포함 / git 저장소 아님)
#   verdict.sh check [--dir REPO] [--sha SHA]
#       → exit 0=HEAD(또는 SHA)에 맞는 PASS 있음 · 1=맞는 verdict 없음 · 3=맞는 것이 FAIL · 4=판정자=작성자(무효)
#         stdout 1줄: "<status> <파일|-> <match:sha|patch_id|-> <same_family:true|false|unknown>"
#   verdict.sh patch-id [--base REF] [--dir REPO] [--sha SHA]
# 의존: git, jq. bash 3.2 호환. 함수는 실패 시 비0 반환만 하고 출력으로 하네스를 막지 않는다.

# 모델 문자열 → 계열. 같은 계열 판정은 독립성이 약하므로 same_family 로 표시만 한다(차단 아님).
bams_model_family() {
  local m
  m=$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')
  case "$m" in
    '') echo unknown ;;
    *claude*|*opus*|*sonnet*|*haiku*|*fable*) echo claude ;;
    *codex*|*gpt*|o[0-9]*|*openai*) echo openai ;;
    *gemini*) echo google ;;
    *) echo unknown ;;
  esac
}

# 기본 base ref: origin/HEAD → origin/main → origin/master → main → master (첫 번째로 해석되는 것)
bams_default_base() {
  local d="$1" r
  r=$(git -C "$d" symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null)
  [ -n "$r" ] && { echo "$r"; return 0; }
  for r in origin/main origin/master main master; do
    git -C "$d" rev-parse -q --verify "$r^{commit}" >/dev/null 2>&1 && { echo "$r"; return 0; }
  done
  return 1
}

# bams_patch_id <dir> <base> <sha|WORKTREE> — merge-base(base, sha) 대비 diff 의 patch-id(--stable).
#   WORKTREE = HEAD 기준 merge-base 와 작업 트리(추적 파일) 비교. 빈 diff 면 빈 문자열.
bams_patch_id() {
  local d="$1" base="$2" sha="$3" mb
  if [ "$sha" = WORKTREE ]; then
    mb=$(git -C "$d" merge-base "$base" HEAD 2>/dev/null) || return 1
    git -C "$d" diff "$mb" 2>/dev/null | git -C "$d" patch-id --stable 2>/dev/null | awk 'NR==1{print $1}'
  else
    mb=$(git -C "$d" merge-base "$base" "$sha" 2>/dev/null) || return 1
    git -C "$d" diff "$mb" "$sha" 2>/dev/null | git -C "$d" patch-id --stable 2>/dev/null | awk 'NR==1{print $1}'
  fi
}

# bams_verdict_check <repo-dir> [sha] → 위 check 와 같은 exit/1줄 출력
bams_verdict_check() {
  local d="$1" sha="${2:-}" vdir files f rows
  command -v jq >/dev/null 2>&1 || return 1
  [ -n "$sha" ] || sha=$(git -C "$d" rev-parse -q --verify HEAD 2>/dev/null) || return 1
  vdir="$d/.crew/artifacts/review"
  [ -d "$vdir" ] || { echo "none - - unknown"; return 1; }
  # 최신 20개만(mtime 역순) — 오래된 판정이 많아도 hook 시간을 묶는다
  files=$(ls -t "$vdir"/verdict-*.json 2>/dev/null | head -20)
  [ -n "$files" ] || { echo "none - - unknown"; return 1; }

  # 행(\x1f 구분 — 빈 필드 보존): sha patch_id verdict base valid(judge∉authors) same_family dirty file
  #   dirty=true(미커밋 작업 트리 기준 판정)는 sha 가 내용을 대표하지 않으므로 patch-id 로만 매칭한다
  rows=$(printf '%s\n' "$files" | while IFS= read -r f; do
    jq -r --arg f "$f" 'select(type == "object") |
      [(.sha // ""), (.patch_id // ""), (.verdict // "" | ascii_upcase), (.base // ""),
       ((.judge.agent // "" | tostring | sub("^.*:"; "")) as $j
        | if $j != "" and ([(.author_agents // [])[] | tostring | sub("^.*:"; "")] | index($j)) == null then "1" else "0" end),
       (if .same_family == null then "unknown" else (.same_family | tostring) end), (.dirty // false | tostring), $f] | map(tostring | gsub("[\u001f\n\t]"; " ")) | join("\u001f")' "$f" 2>/dev/null
  done)
  [ -n "$rows" ] || { echo "none - - unknown"; return 1; }

  local r_sha r_pid r_v r_base r_ok r_sf r_dirty r_f hit="" hit_by="" hit_v="" hit_ok="" hit_sf="" pid bases="" b cur_pid
  # 1) sha 정확 일치(최신 우선)
  while IFS=$'\x1f' read -r r_sha r_pid r_v r_base r_ok r_sf r_dirty r_f; do
    [ "$r_sha" = "$sha" ] && [ "$r_dirty" != true ] || continue
    hit="$r_f"; hit_by=sha; hit_v="$r_v"; hit_ok="$r_ok"; hit_sf="$r_sf"; break
  done <<EOF
$rows
EOF
  # 2) patch-id 일치 — base 별로 1회만 계산(rebase·squash 로 sha 가 바뀌어도 내용이 같으면 유효)
  if [ -z "$hit" ]; then
    while IFS=$'\x1f' read -r r_sha r_pid r_v r_base r_ok r_sf r_dirty r_f; do
      [ -n "$r_pid" ] && [ -n "$r_base" ] || continue
      cur_pid=""
      case "$bases" in
        *"|$r_base="*) b=${bases#*"|$r_base="}; cur_pid=${b%%|*} ;;
        *) cur_pid=$(bams_patch_id "$d" "$r_base" "$sha"); bases="$bases|$r_base=$cur_pid|" ;;
      esac
      [ -n "$cur_pid" ] && [ "$cur_pid" = "$r_pid" ] || continue
      hit="$r_f"; hit_by=patch_id; hit_v="$r_v"; hit_ok="$r_ok"; hit_sf="$r_sf"; break
    done <<EOF
$rows
EOF
  fi
  [ -n "$hit" ] || { echo "none - - unknown"; return 1; }
  if [ "$hit_ok" != "1" ]; then echo "invalid $hit $hit_by $hit_sf"; return 4; fi
  if [ "$hit_v" = "PASS" ]; then echo "pass $hit $hit_by $hit_sf"; return 0; fi
  echo "fail $hit $hit_by $hit_sf"; return 3
}

# bams_verdict_write — CLI write 구현. 인자는 CLI 와 동일.
bams_verdict_write() {
  local verdict="" jagent="" jmodel="" authors="" amodels="" base="" pipeline="" d="." ev=() a
  while [ $# -gt 0 ]; do
    case "$1" in
      --verdict) verdict=$(printf '%s' "$2" | tr '[:lower:]' '[:upper:]'); shift 2 ;;
      --judge-agent) jagent="${2##*:}"; shift 2 ;;
      --judge-model) jmodel="$2"; shift 2 ;;
      --author-agents) authors="$2"; shift 2 ;;
      --author-models) amodels="$2"; shift 2 ;;
      --evidence) ev+=("$2"); shift 2 ;;
      --base) base="$2"; shift 2 ;;
      --pipeline) pipeline="$2"; shift 2 ;;
      --dir) d="$2"; shift 2 ;;
      *) echo "verdict.sh write: 알 수 없는 인자 $1" >&2; return 2 ;;
    esac
  done
  command -v jq >/dev/null 2>&1 || { echo "verdict.sh: jq 필요" >&2; return 2; }
  d=$(git -C "$d" rev-parse --show-toplevel 2>/dev/null) || { echo "verdict.sh: git 저장소 아님" >&2; return 2; }
  case "$verdict" in PASS|FAIL) ;; *) echo "verdict.sh: --verdict PASS|FAIL 필요" >&2; return 2 ;; esac
  [ -n "$jagent" ] || { echo "verdict.sh: --judge-agent 필요" >&2; return 2; }
  [ -n "$authors" ] || { echo "verdict.sh: --author-agents 필요(구현 에이전트 목록, 없으면 'main')" >&2; return 2; }

  # 판정자 ≠ 작성자 (bams-plugin: 접두사 무시)
  local IFS_OLD="$IFS" au=() x
  IFS=','; for x in $authors; do x="${x## }"; x="${x%% }"; [ -n "$x" ] && au+=("${x##*:}"); done; IFS="$IFS_OLD"
  for x in "${au[@]}"; do
    [ "$x" = "$jagent" ] && { echo "verdict.sh: 판정자($jagent)가 구현자 목록에 있다 — 다른 에이전트가 판정해야 한다" >&2; return 2; }
  done

  # evidence: "<exit>:<cmd>"
  local evj="[]" code cmd bad=0
  for a in ${ev[@]+"${ev[@]}"}; do
    code="${a%%:*}"; cmd="${a#*:}"
    case "$code" in ''|*[!0-9]*) echo "verdict.sh: --evidence 형식 '<exit>:<cmd>' 위반: $a" >&2; return 2 ;; esac
    [ "$code" = 0 ] || bad=1
    evj=$(jq -c --arg c "$cmd" --argjson e "$code" '. + [{cmd: $c, exit_code: $e}]' <<<"$evj")
  done
  if [ "$verdict" = PASS ]; then
    [ "$evj" = "[]" ] && { echo "verdict.sh: PASS 는 --evidence 1개 이상 필요(명령+exit code)" >&2; return 2; }
    [ "$bad" = 1 ] && { echo "verdict.sh: PASS 인데 exit≠0 evidence 가 있다 — FAIL 로 기록하거나 재검증하라" >&2; return 2; }
  fi

  local sha short tree dirty=false untracked target pid ts jfam sf="unknown" fams="" f m
  sha=$(git -C "$d" rev-parse HEAD 2>/dev/null) || { echo "verdict.sh: HEAD 없음" >&2; return 2; }
  short=$(git -C "$d" rev-parse --short=12 HEAD)
  tree=$(git -C "$d" rev-parse 'HEAD^{tree}')
  [ -n "$base" ] || base=$(bams_default_base "$d") || base=""
  [ -n "$(git -C "$d" status --porcelain --untracked-files=no 2>/dev/null)" ] && dirty=true
  untracked=$(git -C "$d" ls-files --others --exclude-standard 2>/dev/null | grep -vc '^\.crew/')
  target="$sha"; [ "$dirty" = true ] && target=WORKTREE
  pid=""; [ -n "$base" ] && pid=$(bams_patch_id "$d" "$base" "$target")
  ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  jfam=$(bams_model_family "$jmodel")
  IFS=','; for m in $amodels; do f=$(bams_model_family "$m"); fams="$fams $f"; done; IFS="$IFS_OLD"
  if [ "$jfam" = unknown ] || [ -z "$fams" ] || case "$fams" in *unknown*) true ;; *) false ;; esac; then sf=unknown
  elif case " $fams " in *" $jfam "*) true ;; *) false ;; esac; then sf=true
  else sf=false; fi

  local out="$d/.crew/artifacts/review/verdict-$short.json"
  mkdir -p "${out%/*}" || return 2
  jq -n --arg sha "$sha" --arg short "$short" --arg tree "$tree" --arg base "$base" --arg pid "$pid" \
    --argjson dirty "$dirty" --argjson untracked "${untracked:-0}" --arg verdict "$verdict" \
    --arg jagent "$jagent" --arg jmodel "$jmodel" --arg jfam "$jfam" --arg authors "$authors" --arg amodels "$amodels" \
    --arg sf "$sf" --argjson ev "$evj" --arg pipeline "$pipeline" --arg ts "$ts" '
    def csv: split(",") | map(gsub("^\\s+|\\s+$"; "") | sub("^.*:"; "")) | map(select(. != ""));
    {v: 1, sha: $sha, short_sha: $short, tree: $tree, base: (if $base == "" then null else $base end),
     patch_id: (if $pid == "" then null else $pid end), dirty: $dirty, untracked: $untracked,
     verdict: $verdict,
     judge: {agent: $jagent, model: (if $jmodel == "" then null else $jmodel end), family: $jfam},
     author_agents: ($authors | csv), author_models: ($amodels | split(",") | map(gsub("^\\s+|\\s+$"; "")) | map(select(. != ""))),
     same_family: (if $sf == "unknown" then "unknown" else ($sf == "true") end),
     evidence: $ev, pipeline: (if $pipeline == "" then null else $pipeline end), created_at: $ts}' > "$out" || return 2
  echo "$out"
  [ "$sf" = true ] && echo "verdict.sh: same-family — 판정 모델($jmodel)이 구현 모델과 같은 계열. 다른 계열(Codex 등) 판정 권장" >&2
  [ "$dirty" = true ] && echo "verdict.sh: 미커밋 변경 기준 판정 — 커밋 후 patch-id 로 매칭된다(추적 파일만, 새 파일 ${untracked:-0}개는 미포함)" >&2
  return 0
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  sub="${1:-}"; [ $# -gt 0 ] && shift
  case "$sub" in
    write) bams_verdict_write "$@"; exit $? ;;
    check)
      _d="."; _s=""
      while [ $# -gt 0 ]; do case "$1" in --dir) _d="$2"; shift 2 ;; --sha) _s="$2"; shift 2 ;; *) shift ;; esac; done
      _d=$(git -C "$_d" rev-parse --show-toplevel 2>/dev/null) || { echo "none - - unknown"; exit 1; }
      bams_verdict_check "$_d" "$_s"; exit $? ;;
    patch-id)
      _d="."; _b=""; _s=HEAD
      while [ $# -gt 0 ]; do case "$1" in --dir) _d="$2"; shift 2 ;; --base) _b="$2"; shift 2 ;; --sha) _s="$2"; shift 2 ;; *) shift ;; esac; done
      [ -n "$_b" ] || _b=$(bams_default_base "$_d") || exit 1
      bams_patch_id "$_d" "$_b" "$_s"; exit $? ;;
    *) sed -n '2,16p' "$0"; exit 2 ;;
  esac
fi
