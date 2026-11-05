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
# 같은 초에 같은 구성을 동시에 돌려도 파일이 섞이지 않게: 이미 있으면 -N 접미사 (bams/single 은 이름이 달라 원래도 충돌 없음)
SUF=""; n=1
if [ "$DRY" != 1 ]; then
  mkdir -p "$HERE/results/raw"
  # mkdir 은 원자적이라 잠금 역할: 동시에 같은 TS+구성으로 시작해도 서로 다른 접미사를 받는다
  until mkdir "$HERE/results/raw/$TS-$CONFIG$SUF" 2>/dev/null; do n=$((n+1)); SUF="-$n"; done
fi
RESULT="$HERE/results/$TS-$CONFIG$SUF.jsonl"; RAW="$HERE/results/raw/$TS-$CONFIG$SUF"
[ "$DRY" = 1 ] || echo "# results -> $RESULT" >&2
# stdout 이 닫혀도(SIGPIPE: 파이프 소비자 종료, 호출 도구 종료 등) 결과 기록은 반드시 파일에 먼저 쓰고 계속 진행한다
trap '' PIPE
SNAP=""; CPID=""; PENDING=0
cleanup() { [ -n "$SNAP" ] && rm -rf "$SNAP"; }; trap cleanup EXIT

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

write_crew_config() { # $1=work dir $2=task id — 프로젝트 초기화 완료 상태만 재현하는 중립 내용 (과제 제약은 prompt.md 에 둔다)
  mkdir -p "$1/.crew"
  cat > "$1/.crew/config.md" <<CFG
# Project Config

## 프로젝트
- name: eval-$2

## 스택
- TypeScript (ESM), bun

## 테스트
- 명령: bun test
- 위치: tests/
CFG
}

q() { printf "'%s'" "${1//\'/\'\\\'\'}"; }  # 로케일과 무관한 단순 single-quote 인용 (dry-run 출력용)

build_args() { # 전역 ARGS 배열 구성. $1=최종 프롬프트 $2=budget
  ARGS=(-p "$1" --output-format stream-json --verbose --permission-mode "$PERM" --allowedTools "$ALLOWED"
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

# 실행 후 처리(파싱 -> 채점 -> 기록). 정상 종료·타임아웃·시그널 중단 모두 같은 경로로 기록한다.
# 입력 전역: R_task R_trial R_work R_raw R_err R_start R_rc R_tmo R_note
finish_run() {
  local dur result evs tools errmsg="" cost=0 turns=0 toks=0 outtoks=0 tc=0 ag=0 sk=0
  dur=$(( $(date +%s) - R_start ))
  evs="$(jq -cR 'fromjson? | select(type=="object")' "$R_raw" 2>/dev/null)"
  result="$(printf '%s\n' "$evs" | jq -c 'select(.type=="result")' 2>/dev/null | tail -1)"
  # 도구 호출 집계 (tool_use id 기준 중복 제거). Agent/Task = 서브에이전트 spawn, Skill = 스킬 호출
  tools="$(printf '%s\n' "$evs" | jq -s -c '[.[] | select(.type=="assistant") | .message.content[]? | select(type=="object" and .type=="tool_use")] | unique_by(.id)
      | {tc: length, ag: (map(select(.name=="Agent" or .name=="Task")) | length), sk: (map(select(.name=="Skill")) | length)}' 2>/dev/null)"
  if [ -n "$tools" ]; then tc=$(jq -r .tc <<<"$tools"); ag=$(jq -r .ag <<<"$tools"); sk=$(jq -r .sk <<<"$tools"); fi
  if [ -n "$result" ]; then
    cost=$(jq -r '.total_cost_usd // 0' <<<"$result")
    turns=$(jq -r '.num_turns // 0' <<<"$result")
    toks=$(jq -r '[.usage.input_tokens, .usage.output_tokens, .usage.cache_creation_input_tokens, .usage.cache_read_input_tokens] | map(. // 0) | add' <<<"$result")
    outtoks=$(jq -r '.usage.output_tokens // 0' <<<"$result")
    if [ "$(jq -r '.is_error // false' <<<"$result")" = true ] || [ "$(jq -r '.subtype // "success"' <<<"$result")" != success ]; then
      errmsg="$(jq -r '"\(.subtype // "error"): \((.result // "") | .[0:160])"' <<<"$result")"
    fi
  else
    errmsg="no_result_event rc=$R_rc: $(head -c 160 "$R_err" 2>/dev/null | tr '\n' ' ')"
  fi
  [ "$R_rc" = 142 ] && errmsg="timeout(${R_tmo}s)"
  [ -n "$R_note" ] && errmsg="${errmsg:+$errmsg; }$R_note"

  local g score=0 tampered=false passed=0 total=0
  if g="$("$HERE/tasks/$R_task/grade.sh" "$R_work" 2>>"$R_err")" && jq -e . >/dev/null 2>&1 <<<"$g"; then
    score=$(jq -r .score <<<"$g"); tampered=$(jq -r '.tampered // false' <<<"$g")
    passed=$(jq -r '.passed // 0' <<<"$g"); total=$(jq -r '.total // 0' <<<"$g")
    [ "$tampered" = true ] && errmsg="${errmsg:+$errmsg; }tampered_tests"
  else
    errmsg="${errmsg:+$errmsg; }grade_failed"
  fi

  local rec
  rec="$(jq -nc --arg task "$R_task" --arg config "$CONFIG" --argjson trial "$R_trial" --argjson score "$score" \
    --argjson dur "$dur" --argjson tokens "$toks" --argjson out_tokens "$outtoks" --argjson cost "$cost" \
    --argjson turns "$turns" --argjson tool_calls "$tc" --argjson agent_spawns "$ag" --argjson skill_calls "$sk" \
    --arg error "$errmsg" --argjson tampered "$tampered" --argjson passed "$passed" --argjson total "$total" \
    '{task:$task,config:$config,trial:$trial,score:$score,duration_s:$dur,tokens:$tokens,out_tokens:$out_tokens,cost_usd:$cost,turns:$turns,agent_spawns:$agent_spawns,skill_calls:$skill_calls,tool_calls:$tool_calls,error:$error,tampered:$tampered,passed:$passed,total:$total}')"
  # 파일에 먼저 기록(O_APPEND 한 줄), 그 다음 stdout 은 실패해도 무시
  printf '%s\n' "$rec" >> "$RESULT"
  printf '%s\n' "$rec" 2>/dev/null || true
  TOTAL_COST=$(awk -v a="$TOTAL_COST" -v b="$cost" 'BEGIN{print a+b}')
  PENDING=0
  if [ "$KEEP" = 1 ]; then echo "kept: $R_work" >&2 2>/dev/null || true; else rm -rf "$R_work"; fi
}

on_signal() { # INT/TERM/HUP: 실행 중이던 시도가 있으면 중단 사유와 함께 채점·기록하고 종료
  if [ -n "$CPID" ]; then pkill -TERM -P "$CPID" 2>/dev/null; kill -TERM "$CPID" 2>/dev/null; wait "$CPID" 2>/dev/null; fi
  if [ "$PENDING" = 1 ]; then R_rc=143; R_note="interrupted"; finish_run; fi
  exit 130
}
trap on_signal INT TERM HUP

run_one() { # $1=task $2=trial
  local task="$1" trial="$2" tdir="$HERE/tasks/$1"
  local cmd budget prompt full
  cmd=$(jq -r .command "$tdir/task.json")
  budget="${BUDGET:-$(jq -r .budget_usd "$tdir/task.json")}"
  R_tmo="${TMO:-$(jq -r .timeout_s "$tdir/task.json")}"
  prompt="$(cat "$tdir/prompt.md")"
  if [ "$CONFIG" = bams ]; then full="$cmd $prompt"; else full="$prompt"; fi

  R_task="$task"; R_trial="$trial"; R_note=""; R_rc=0
  R_work="$(mktemp -d "${TMPDIR:-/tmp}/bams-eval-$task-XXXXXX")"
  cp -R "$tdir/repo/." "$R_work/"
  [ "$CONFIG" = bams ] && write_crew_config "$R_work" "$task"
  ( cd "$R_work" && git init -q && git add -A && git -c user.name=eval -c user.email=eval@local commit -qm "initial" ) >/dev/null 2>&1

  build_args "$full" "$budget"
  if [ "$DRY" = 1 ]; then
    echo "--- [$CONFIG] $task trial=$trial  (work=$R_work, timeout=${R_tmo}s)"
    printf '(cd %s && BAMS_ROUTER=off perl -e %s %s claude' "$(q "$R_work")" "$(q 'alarm shift; exec @ARGV')" "$R_tmo"
    for a in "${ARGS[@]}"; do printf ' %s' "$(q "$a")"; done; printf ')\n'
    printf 'tasks/%s/grade.sh %s\n' "$task" "$(q "$R_work")"
    rm -rf "$R_work"; return 0
  fi

  R_raw="$RAW/$task-$trial.jsonl"; R_err="$RAW/$task-$trial.err"
  R_start=$(date +%s); PENDING=1
  # BAMS_ROUTER=off: 슬래시를 이미 명시했거나(bams) 플러그인이 없으므로(single) 라우터 개입을 막아 구성 차이만 남긴다
  ( cd "$R_work" && BAMS_ROUTER=off perl -e 'alarm shift; exec @ARGV' "$R_tmo" claude "${ARGS[@]}" ) > "$R_raw" 2> "$R_err" < /dev/null &
  CPID=$!
  wait "$CPID"; R_rc=$?; CPID=""
  finish_run
}

for task in $TASKS; do
  for ((trial=1; trial<=TRIALS; trial++)); do
    if [ "$DRY" != 1 ] && [ -n "$TOTAL_CAP" ] && awk -v a="$TOTAL_COST" -v c="$TOTAL_CAP" 'BEGIN{exit !(a>=c)}'; then
      echo "total budget cap reached (\$$TOTAL_COST >= \$$TOTAL_CAP): stopping before $task trial $trial" >&2; exit 0
    fi
    run_one "$task" "$trial"
  done
done
[ "$DRY" = 1 ] || echo "# total cost: \$$TOTAL_COST" >&2 2>/dev/null || true
