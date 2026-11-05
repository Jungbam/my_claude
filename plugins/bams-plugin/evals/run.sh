#!/usr/bin/env bash
# bams eval 러너. 같은 과제를 bams(플러그인 로드+슬래시 커맨드) / single(플러그인 없음, 자연어만)로 실행하고 채점한다.
#   run.sh --config bams|single [--task <id>|all] [--trials N] [--budget-usd X] [--timeout-s S]
#          [--total-budget-usd X] [--model M] [--keep] [--dry-run]
# 실제 claude -p 를 호출하므로 비용이 든다. --dry-run 은 명령만 출력한다.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "$HERE/.." && pwd)"
CONFIG=""; TASK="all"; TRIALS=1; BUDGET=""; TMO=""; TOTAL_CAP=""; MODEL="${EVAL_MODEL:-}"; KEEP=0; DRY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --config) CONFIG="$2"; shift 2;;
    --task) TASK="$2"; shift 2;;
    --trials) TRIALS="$2"; shift 2;;
    --budget-usd) BUDGET="$2"; shift 2;;
    --timeout-s) TMO="$2"; shift 2;;
    --total-budget-usd) TOTAL_CAP="$2"; shift 2;;
    --model) MODEL="$2"; shift 2;;
    --keep) KEEP=1; shift;;
    --dry-run) DRY=1; shift;;
    -h|--help) sed -n 2,6p "$0"; exit 0;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done
case "$CONFIG" in bams|single) ;; *) echo "--config bams|single 필요" >&2; exit 2;; esac
command -v jq >/dev/null || { echo "jq 필요" >&2; exit 2; }
[ "$DRY" = 1 ] || command -v claude >/dev/null || { echo "claude CLI 필요" >&2; exit 2; }

if [ "$TASK" = all ]; then TASKS=$(cd "$HERE/tasks" && ls -d */ | tr -d /); else TASKS="$TASK"; fi
for t in $TASKS; do [ -f "$HERE/tasks/$t/task.json" ] || { echo "no such task: $t" >&2; exit 2; }; done

TS="$(date +%Y%m%d-%H%M%S)"
RESULT="$HERE/results/$TS-$CONFIG.jsonl"; RAW="$HERE/results/raw/$TS-$CONFIG"
SNAP=""; cleanup() { [ -n "$SNAP" ] && rm -rf "$SNAP"; }; trap cleanup EXIT

# 허용 도구: 비대화 실행에서 승인 프롬프트가 없으므로 명시. 권한 모드는 acceptEdits (EVAL_PERMISSION_MODE로 변경 가능)
ALLOWED="${EVAL_ALLOWED_TOOLS:-Bash,Read,Edit,Write,Glob,Grep,Agent,Task,Skill,TodoWrite,NotebookEdit}"
PERM="${EVAL_PERMISSION_MODE:-acceptEdits}"

# bams 구성: 작업 트리의 플러그인을 evals/ 등을 뺀 스냅샷으로 로드 (숨김 테스트·정답 유출 방지 + 실험 중 변경 격리)
if [ "$CONFIG" = bams ]; then
  if [ -n "${EVAL_PLUGIN_DIR:-}" ]; then PLUGIN_DIR="$EVAL_PLUGIN_DIR"
  else
    SNAP="$(mktemp -d "${TMPDIR:-/tmp}/bams-eval-plugin-XXXXXX")"
    rsync -a --exclude evals --exclude .git --exclude node_modules --exclude .crew --exclude .DS_Store "$PLUGIN_ROOT/" "$SNAP/"
    PLUGIN_DIR="$SNAP"
  fi
fi

write_crew_config() { # $1=work dir $2=task id — 프로젝트 초기화 완료 상태의 최소 .crew/config.md
  mkdir -p "$1/.crew"
  cat > "$1/.crew/config.md" <<CFG
# Project Config

## 프로젝트
- name: eval-$2
- 설명: bams eval 합성 저장소 (초기화 완료 상태)

## 스택
- TypeScript (ESM), bun

## 테스트
- 명령: bun test
- 위치: tests/*.test.ts (기존 테스트는 수정하지 않는다)

## 컨벤션
- 의존성 추가 없이 bun 내장 기능만 사용
CFG
}

q() { printf "'%s'" "${1//\'/\'\\\'\'}"; }  # 로케일과 무관한 단순 single-quote 인용 (dry-run 출력용)

build_args() { # 전역 ARGS 배열 구성. $1=최종 프롬프트 $2=budget
  ARGS=(-p "$1" --output-format json --permission-mode "$PERM" --allowedTools "$ALLOWED"
        --max-budget-usd "$2" --no-session-persistence --setting-sources project,local)
  [ -n "$MODEL" ] && ARGS+=(--model "$MODEL")
  # 사용자 MCP 커넥터가 양쪽 컨텍스트/비용에 섞이지 않게 차단 (EVAL_STRICT_MCP=0 으로 해제)
  [ "${EVAL_STRICT_MCP:-1}" = 1 ] && ARGS+=(--strict-mcp-config)
  if [ "$CONFIG" = bams ]; then
    ARGS+=(--plugin-dir "$PLUGIN_DIR")
  else
    # user 설정을 읽지 않아 enabledPlugins 자체가 비어 있고, 혹시 모를 프로젝트 수준 활성화도 --settings(우선순위 높음)로 끈다
    ARGS+=(--settings '{"enabledPlugins":{"bams-plugin@my-claude":false}}')
  fi
}

TOTAL_COST=0
run_one() { # $1=task $2=trial
  local task="$1" trial="$2" tdir="$HERE/tasks/$1"
  local cmd budget tmo prompt full work start rc raw err dur
  cmd=$(jq -r .command "$tdir/task.json")
  budget="${BUDGET:-$(jq -r .budget_usd "$tdir/task.json")}"
  tmo="${TMO:-$(jq -r .timeout_s "$tdir/task.json")}"
  prompt="$(cat "$tdir/prompt.md")"
  if [ "$CONFIG" = bams ]; then full="$cmd $prompt"; else full="$prompt"; fi

  work="$(mktemp -d "${TMPDIR:-/tmp}/bams-eval-$task-XXXXXX")"
  cp -R "$tdir/repo/." "$work/"
  [ "$CONFIG" = bams ] && write_crew_config "$work" "$task"
  ( cd "$work" && git init -q && git add -A && git -c user.name=eval -c user.email=eval@local commit -qm "initial" ) >/dev/null 2>&1

  build_args "$full" "$budget"
  if [ "$DRY" = 1 ]; then
    echo "--- [$CONFIG] $task trial=$trial  (work=$work, timeout=${tmo}s)"
    printf '(cd %s && BAMS_ROUTER=off perl -e %s %s claude' "$(q "$work")" "$(q 'alarm shift; exec @ARGV')" "$tmo"
    for a in "${ARGS[@]}"; do printf ' %s' "$(q "$a")"; done; printf ')\n'
    printf 'tasks/%s/grade.sh %s\n' "$task" "$(q "$work")"
    rm -rf "$work"; return 0
  fi

  mkdir -p "$RAW"; raw="$RAW/$task-$trial.json"; err="$RAW/$task-$trial.err"
  start=$(date +%s)
  # BAMS_ROUTER=off: 슬래시를 이미 명시했거나(bams) 플러그인이 없으므로(single) 라우터 개입을 막아 구성 차이만 남긴다
  ( cd "$work" && BAMS_ROUTER=off perl -e 'alarm shift; exec @ARGV' "$tmo" claude "${ARGS[@]}" ) > "$raw" 2> "$err" < /dev/null
  rc=$?
  dur=$(( $(date +%s) - start ))

  local errmsg="" cost=0 turns=0 toks=0 outtoks=0
  if jq -e . "$raw" >/dev/null 2>&1; then
    cost=$(jq -r '.total_cost_usd // 0' "$raw")
    turns=$(jq -r '.num_turns // 0' "$raw")
    toks=$(jq -r '[.usage.input_tokens, .usage.output_tokens, .usage.cache_creation_input_tokens, .usage.cache_read_input_tokens] | map(. // 0) | add' "$raw")
    outtoks=$(jq -r '.usage.output_tokens // 0' "$raw")
    if [ "$(jq -r '.is_error // false' "$raw")" = true ] || [ "$(jq -r '.subtype // "success"' "$raw")" != success ]; then
      errmsg="$(jq -r '"\(.subtype // "error"): \((.result // "") | .[0:160])"' "$raw")"
    fi
  else
    [ "$rc" = 142 ] && errmsg="timeout(${tmo}s)" || errmsg="no_json rc=$rc: $(head -c 160 "$err" | tr '\n' ' ')"
  fi
  [ "$rc" = 142 ] && errmsg="timeout(${tmo}s)"

  local g score=0 tampered=false passed=0 total=0
  if g="$("$tdir/grade.sh" "$work" 2>>"$err")" && echo "$g" | jq -e . >/dev/null 2>&1; then
    score=$(echo "$g" | jq -r .score); tampered=$(echo "$g" | jq -r '.tampered // false')
    passed=$(echo "$g" | jq -r '.passed // 0'); total=$(echo "$g" | jq -r '.total // 0')
    [ "$tampered" = true ] && errmsg="${errmsg:+$errmsg; }tampered_tests"
  else
    errmsg="${errmsg:+$errmsg; }grade_failed"
  fi

  jq -nc --arg task "$task" --arg config "$CONFIG" --argjson trial "$trial" --argjson score "$score" \
    --argjson dur "$dur" --argjson tokens "$toks" --argjson out_tokens "$outtoks" --argjson cost "$cost" \
    --argjson turns "$turns" --arg error "$errmsg" --argjson tampered "$tampered" \
    --argjson passed "$passed" --argjson total "$total" \
    '{task:$task,config:$config,trial:$trial,score:$score,duration_s:$dur,tokens:$tokens,out_tokens:$out_tokens,cost_usd:$cost,turns:$turns,error:$error,tampered:$tampered,passed:$passed,total:$total}' \
    | tee -a "$RESULT"
  TOTAL_COST=$(awk -v a="$TOTAL_COST" -v b="$cost" 'BEGIN{print a+b}')
  [ "$KEEP" = 1 ] && echo "kept: $work" >&2 || rm -rf "$work"
}

[ "$DRY" = 1 ] || { mkdir -p "$HERE/results"; echo "# results -> $RESULT" >&2; }
for task in $TASKS; do
  for ((trial=1; trial<=TRIALS; trial++)); do
    if [ "$DRY" != 1 ] && [ -n "$TOTAL_CAP" ] && awk -v a="$TOTAL_COST" -v c="$TOTAL_CAP" 'BEGIN{exit !(a>=c)}'; then
      echo "total budget cap reached (\$$TOTAL_COST >= \$$TOTAL_CAP): stopping before $task trial $trial" >&2; exit 0
    fi
    run_one "$task" "$trial"
  done
done
[ "$DRY" = 1 ] || echo "# total cost: \$$TOTAL_COST" >&2
