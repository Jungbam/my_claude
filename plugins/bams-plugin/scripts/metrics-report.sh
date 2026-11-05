#!/usr/bin/env bash
# metrics-report.sh — hooks/metrics.sh 가 쌓은 events.jsonl → 파이프라인별 표 + 커맨드별 집계 + 결함 유출 후보.
# 사용법: bash plugins/bams-plugin/scripts/metrics-report.sh [--since 30d|12h|all] [--project <이름>] [--file <events.jsonl>]
#   기본 파일: ${BAMS_METRICS_DIR:-$HOME/.claude/bams-metrics}/events.jsonl. 기준 시각 고정(테스트용): BAMS_METRICS_NOW=<epoch초>
#   의존: bash, jq. 깨진 줄은 건너뛴다. 이벤트 스키마: references/metrics.md
set -u

# ── 단가표 ($ / 1M tokens). 출처: Claude 공식 가격 페이지 https://platform.claude.com/docs/en/about-claude/pricing
#    (2026-11-05 확인, 표준 global 라우팅·Batch 아님). 열: 모델ID 접두사, input, 5m cache write, 1h cache write, cache read, output.
#    긴 접두사가 먼저 매칭된다. 표에 없는 모델은 비용 미산정(토큰만, 표에 '*' 표시).
#    주의: Haiku 5.5는 100k 토큰 이하 프롬프트 단가로 계산(초과 구간 0.50/0.625/1/0.05/2.50 미반영). US-only(inference_geo) 1.1배 미반영.
PRICES='claude-fable-5-1	10	12.5	20	0.25	50
claude-mythos-5-1	10	12.5	20	0.25	50
claude-fable-5	10	12.5	20	1	50
claude-mythos-5	10	12.5	20	1	50
claude-opus-5-5	4	5	8	0.20	20
claude-opus-5	5	6.25	10	0.50	25
claude-opus-4-8	5	6.25	10	0.50	25
claude-opus-4-7	5	6.25	10	0.50	25
claude-opus-4-6	5	6.25	10	0.50	25
claude-opus-4-5	5	6.25	10	0.50	25
claude-opus-4-1	15	18.75	30	1.50	75
claude-opus-4	15	18.75	30	1.50	75
claude-sonnet-5-5	2	2.5	4	0.10	10
claude-sonnet-5	2	2.5	4	0.20	10
claude-sonnet-4-6	3	3.75	6	0.30	15
claude-sonnet-4-5	3	3.75	6	0.30	15
claude-sonnet-4	3	3.75	6	0.30	15
claude-haiku-5-5	0.10	0.125	0.20	0.01	0.50
claude-haiku-4-5	1	1.25	2	0.10	5'

SINCE=30d; PROJECT=""; FILE="${BAMS_METRICS_DIR:-$HOME/.claude/bams-metrics}/events.jsonl"
while [ $# -gt 0 ]; do
  case "$1" in
    --since) SINCE="${2:-}"; shift 2 ;;
    --since=*) SINCE="${1#*=}"; shift ;;
    --project) PROJECT="${2:-}"; shift 2 ;;
    --project=*) PROJECT="${1#*=}"; shift ;;
    --file) FILE="${2:-}"; shift 2 ;;
    --file=*) FILE="${1#*=}"; shift ;;
    -h|--help) sed -n '2,5p' "$0"; exit 0 ;;
    *) echo "알 수 없는 인자: $1" >&2; exit 2 ;;
  esac
done
command -v jq >/dev/null 2>&1 || { echo "jq 필요" >&2; exit 2; }
NOW="${BAMS_METRICS_NOW:-$(date +%s)}"
case "$SINCE" in
  all) CUT=0 ;;
  *[0-9]d) CUT=$((NOW - ${SINCE%d} * 86400)) ;;
  *[0-9]h) CUT=$((NOW - ${SINCE%h} * 3600)) ;;
  *) echo "--since 형식: <N>d | <N>h | all" >&2; exit 2 ;;
esac
if [ ! -s "$FILE" ]; then echo "이벤트 없음: $FILE (BAMS_METRICS=off 였거나 아직 파이프라인 실행 전)"; exit 0; fi

jq -Rnr --argjson cut "$CUT" --arg project "$PROJECT" --arg prices "$PRICES" --arg since "$SINCE" --arg file "$FILE" '
  def tsec: try (sub("\\.[0-9]+Z$"; "Z") | fromdate) catch null;
  def tok: if . == null then 0 else ((.input // 0) + (.output // 0) + (.cache_read // 0) + (.cache_creation // 0)) end;
  def plist: [$prices | split("\n")[] | select(length > 0) | split("\t")
              | {p: .[0], in: (.[1] | tonumber), w5: (.[2] | tonumber), w1: (.[3] | tonumber), r: (.[4] | tonumber), out: (.[5] | tonumber)}]
             | sort_by(-(.p | length));
  plist as $P
  # usage(by_model 포함) → {cost, partial}
  | def cost: if . == null then {cost: 0, partial: false} else
      ((.by_model // {"unknown": .}) | to_entries | map(.key as $m | .value as $u
        | ([$P[] | select(. as $x | $m | startswith($x.p))] | .[0]) as $pr
        | if $pr == null then {cost: 0, partial: (($u | tok) > 0)} else
            {cost: ((($u.input // 0) * $pr.in + ((($u.cache_creation // 0) - ($u.cache_creation_1h // 0)) * $pr.w5)
                     + (($u.cache_creation_1h // 0) * $pr.w1) + (($u.cache_read // 0) * $pr.r) + (($u.output // 0) * $pr.out)) / 1000000),
             partial: false} end)
       | {cost: (map(.cost) | add // 0), partial: any(.[]; .partial)}) end;
    def addu: reduce .[] as $x ({input: 0, output: 0, cache_read: 0, cache_creation: 0, cache_creation_1h: 0, by_model: {}};
      if $x == null then . else
        .input += ($x.input // 0) | .output += ($x.output // 0) | .cache_read += ($x.cache_read // 0)
        | .cache_creation += ($x.cache_creation // 0) | .cache_creation_1h += ($x.cache_creation_1h // 0)
        | reduce (($x.by_model // {}) | to_entries[]) as $e (.; .by_model[$e.key] = ((.by_model[$e.key] // {}) as $o
            | reduce ($e.value | to_entries[]) as $f ($o; .[$f.key] = ((.[$f.key] // 0) + ($f.value // 0))))) end);
    def dur: if . == null then "-" else (. | floor) as $s
      | if $s < 60 then "\($s)s" elif $s < 3600 then "\($s / 60 | floor)m"
        else "\($s / 3600 | floor)h\(($s % 3600) / 60 | floor | tostring | if length < 2 then "0" + . else . end)m" end end;
    def ktok: if . == null then "-" elif . >= 1000000 then "\(. / 100000 | floor / 10)M"
      elif . >= 1000 then "\(. / 100 | floor / 10)k" else tostring end;
    def usd: "$" + ((. * 100 | round) / 100 | tostring | if test("\\.") then (if test("\\.[0-9]$") then . + "0" else . end) else . + ".00" end);
    def median: sort | length as $n | if $n == 0 then null elif $n % 2 == 1 then .[($n - 1) / 2] else (.[$n / 2 - 1] + .[$n / 2]) / 2 end;
    def ok: . == "success" or . == "concerns";
    def leaky: . == "hotfix" or . == "debug";

  [inputs | fromjson? | objects | select((.ev | type) == "string")] as $all
  | [$all[] | (.ts | tsec) as $t | select($t != null and $t >= $cut) | select($project == "" or .project == $project) | . + {t: $t}] as $E
  | ($E | map(select(.pipeline_ts != null)) | group_by("\(.session_id)|\(.pipeline_ts)")
        | map({key: "\(.[0].session_id)|\(.[0].pipeline_ts)", value: .}) | from_entries) as $byk
  | [ $E[] | select(.ev == "pipeline_start") | . as $s | "\(.session_id)|\(.pipeline_ts)" as $k | ($byk[$k] // []) as $g
      | ([$g[] | select(.ev == "pipeline_end")] | last) as $end
      | ([$g[] | select(.ev == "agent_end")] | group_by(.agent_id) | map(last)) as $ag
      | ([$ag[].usage] + [$g[] | select(.ev == "session_usage") | .usage] | addu) as $u
      | {k: $k, start: $s.t, end: ($end.t // null), command: $s.command, project: $s.project, slug: ($end.slug // null),
         lead: (if $end then $end.t - $s.t else null end), agents: ($ag | length),
         agents_nousage: ([$ag[] | select(.usage == null)] | length),
         tokens: ($u | tok), usage: $u, human: ([$g[] | select(.ev == "human_turn")] | length),
         status: ($end.status // "미종료"), result: ($end.result // "open")} ] as $started
  | ($started | map(.k)) as $ks
  | [ $E[] | select(.ev == "pipeline_end") | select(.pipeline_ts == null or (("\(.session_id)|\(.pipeline_ts)") as $k | $ks | index([$k]) | not))
      | {k: "orphan|\(.session_id)|\(.ts)", start: null, end: .t, command: .command, project: .project, slug: .slug, lead: null,
         agents: null, agents_nousage: 0, tokens: null, usage: null, human: null, status: .status, result: .result} ] as $orph
  | ($started + $orph | sort_by(.start // .end)) as $rows
  | ($rows | map(. + (.usage | cost))) as $rows
  # 결함 유출 후보: hotfix/debug 시작 직전 7일 안에 끝난(없으면 시작한) 같은 프로젝트의 다른 파이프라인
  | [ $rows[] | select(.command | leaky) | . as $h | ($h.start // $h.end) as $ht
      | { fix: $h, cands: [ $rows[] | select(.k != $h.k and .project == $h.project and ((.command | leaky) | not))
                              | ((.end // .start) as $ct | select($ct != null and $ct <= $ht and ($ht - $ct) <= 604800)) ] }
      | select(.cands | length > 0) ] as $leaks
  | (["# bams 파이프라인 계측 리포트",
      "",
      "- 기간: \($since)\(if $project != "" then " · 프로젝트: \($project)" else "" end) · 이벤트 \($E | length)건 · 파일: \($file)",
      "- 성공 = COMPLETED/DONE·완료(success) + DONE_WITH_CONCERNS(concerns). 토큰 = input+output+cache_read+cache_creation(서브에이전트 + 메인 세션 증분)",
      "- 비용 = 공식 단가표 추정(스크립트 상단 PRICES). `*` = 단가표에 없는 모델 토큰 포함(그 부분 미산정)",
      "",
      "## 파이프라인 (\($rows | length)건)",
      ""]
     + (if ($rows | length) == 0 then ["(해당 기간 파이프라인 없음)"] else
        ["| 시작(UTC) | command | 프로젝트 | slug | 리드타임 | 에이전트 | 토큰 | 추정 비용 | 사람 개입 | 결과 |",
         "|---|---|---|---|---|---|---|---|---|---|"]
        + [ $rows[] | "| \(if .start then (.start | todate | .[0:16] | sub("T"; " ")) else "(시작 미기록)" end) | \(.command) | \(.project // "-") | \(.slug // "-") | \(.lead | dur) | \(if .agents == null then "-" else "\(.agents)\(if .agents_nousage > 0 then " (usage 없음 \(.agents_nousage))" else "" end)" end) | \(.tokens | ktok) | \(if .tokens == null then "-" else (.cost | usd) + (if .partial then "*" else "" end) end) | \(.human // "-") | \(.status) |" ] end)
     + ["", "## 커맨드별 집계", ""]
     + (if ($rows | length) == 0 then ["(없음)"] else
        ["| command | 건수 | 종료 | 성공률 | 실패 | 중앙값 리드타임 | 중앙값 토큰 | 중앙값 비용 | 사람 개입(평균) |",
         "|---|---|---|---|---|---|---|---|---|"]
        + [ $rows | group_by(.command)[] | . as $g | ([$g[] | select(.result != "open")]) as $ended
            | ([$g[] | select(.start != null)]) as $st
            | "| \($g[0].command) | \($g | length) | \($ended | length) | \(if ($ended | length) == 0 then "-" else "\(([$ended[] | select(.result | ok)] | length) * 100 / ($ended | length) | round)%" end) | \([$ended[] | select(.result == "failed")] | length) | \([$g[] | .lead | numbers] | median | dur) | \([$st[] | .tokens | numbers] | median | ktok) | \([$st[] | .cost | numbers] | median | if . == null then "-" else usd end) | \(if ($st | length) == 0 then "-" else ([$st[] | .human // 0] | add / length * 10 | round / 10 | tostring) end) |" ] end)
     + ["", "## 결함 유출 후보 (hotfix/debug 시작 전 7일 안의 같은 프로젝트 파이프라인)", ""]
     + (if ($leaks | length) == 0 then ["(없음)"] else
        [ $leaks[] | "- \(.fix.command) \(.fix.slug // "") (\((.fix.start // .fix.end) | todate | .[0:10]), \(.fix.project)) ← 후보: "
            + ([.cands[] | "\(.command) \(.slug // "(slug 미기록)") [\(.status)]"] | join(", ")) ] end)
    )[]
' "$FILE"
