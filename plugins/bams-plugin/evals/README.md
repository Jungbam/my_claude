# bams evals — 결과 기반 하네스 평가

합성 저장소 10과제(버그 3·기능 4·리뷰 2·계획 1)를 **bams**(플러그인+슬래시 커맨드)와 **single**(플러그인 없음, 자연어만)로
같은 조건에서 실행하고 숨김 테스트/정답 키/루브릭으로 0~1 채점한다. 과제는 `tasks/<id>/{repo,hidden,solution,prompt.md,task.json,grade.sh}`.

## 실행
```bash
./validate.sh                                  # 무료. grade.sh·구조·dry-run 자체 검증 (claude 호출 없음)
./run.sh --config bams --dry-run               # 명령만 출력
./run.sh --config single --task bug-01-pagination --trials 1 --budget-usd 1
./run.sh --config bams --task all --trials 3 --total-budget-usd 40
./compare.sh results/<A>-single.jsonl results/<B>-bams.jsonl   # outcome 표(점수/시간/비용) + process 표(하네스 과정)
```
결과: `results/<timestamp>-<config>.jsonl` (task, config, trial, score, duration_s, tokens, cost_usd, turns, agent_spawns, skill_calls, tool_calls, cmd_resolved, error + 아래 과정 지표), 원본 stream-json은 `results/raw/`(`--include-hook-events` 포함). 같은 초에 동시 실행해도 `-N` 접미사로 분리. `duration_s`는 측정 불가(중단 중 시계 실패 등)면 `null`.
환경변수: `EVAL_MODEL`, `EVAL_PERMISSION_MODE`(기본 acceptEdits), `EVAL_ALLOWED_TOOLS`, `EVAL_PLUGIN_DIR`, `EVAL_STRICT_MCP=0`.

## 비용 주의
- **실제 `claude -p`를 호출**한다(구독 한도/API 비용 소모). 과제당 `--max-budget-usd`(task.json 기본 2~3달러) + 타임아웃이 상한. 전체 상한은 `--total-budget-usd`.
- bams 구성은 다중 에이전트라 single보다 훨씬 비쌀 수 있다. 처음엔 `--trials 1 --task <1건>`으로 비용을 재고 늘릴 것. 비교는 trials>=3 권장(비결정성).

## 머지 규칙
하네스(agents/commands/hooks/references/skills) 변경 PR은 변경 전·후 `--config bams --task all --trials 3` 결과를 `compare.sh`로 비교해
**전체 평균 점수가 하락하지 않을 때만** 머지한다(과제별 하락이 있으면 사유 기재). 점수 동률이면 시간·비용이 늘지 않았는지 본다.
결과 jsonl은 PR에 첨부. 과제/채점기 수정은 하네스 변경과 별도 PR로 하고 baseline을 다시 측정한다.

## Baseline (v2.8.x) — 정정됨
출처: `results/*2026110[56]-*-{bams,single}.jsonl` (2026-11-05~06). 칸 = 평균 score / 시도당 cost USD (n).

**무효 행(2026-11-18 정정)**: 2026-11-05 15:06(v2.8.1 `bce5e0a`) 이전의 bams 실행(`20261105-140322`·`140851`·`142513`·`144321-bams`)은
프롬프트가 `/bams:<cmd>`였고 `--plugin-dir` 로드 시 실제 등록명은 `/bams-plugin:bams:<cmd>`라 **커맨드가 인식되지 않았다**
(최종 메시지에 "명령이 이 세션에 없다"고 남음, `cmd_resolved` 필드 도입 전이라 행에는 표시 없음). 그래서
- **review·plan의 bams 11-05 행은 무효**다. 특히 review 원점수(0.0·0.5·0.25 등)는 커맨드 미실행 + 당시 채점 입력 문제로, 같은 raw를 최종 메시지만으로 재채점(`regrade-20261105-*-bams`)하면 review 6건 모두 1.0이다 — 이전 표의 "bams는 review-01에서 약하다"는 측정 오류였다.
- bug·feat의 같은 날 bams 행도 같은 실행 묶음이라 같은 문구가 남아 있다(커맨드 미인식 — 사실상 single과 같은 조건). 아래 표의 bug·feat bams 칸은 참고용이며 재측정 대상이다.

| task | bams | single |
|------|------|--------|
| bug-01 | 1.00 / 0.26 (5)† | 0.75 / 0.12 (4, tampered_tests 1) |
| bug-02 | 1.00 / 0.33 (4)† | 1.00 / 0.18 (3) |
| bug-03 | 0.80 / 0.24 (5, no_result_event 1)† | 1.00 / 0.20 (3) |
| feat-01..04 | 1.00 / 0.34·0.38·0.44·0.48 (4)† | 1.00 / 0.20·0.16·0.23·0.24 (3) |
| plan-01 | 0.79 / 2.54 (1, 11-06만 유효) | 0.90 / 0.25 (6) |
| review-01 | 0.90 / 0.33 (1, 11-06만 유효) | 0.98 / 0.08 (6) |
| review-02 | 0.90 / 0.42 (1, 11-06만 유효) | 0.63 / 0.09 (6) |

† 11-05 미인식 실행 포함. single 계획·리뷰 n에는 `regrade-*`(최종 메시지만 재채점) 행이 포함된다.

### 2026-11-17 같은 날 비교 (review, trials 3, v2.9.0 작업 브랜치)
`results/20261117-093433-single.jsonl` vs `results/20261117-092829-bams.jsonl` (bams `cmd_resolved` 6/6 true). 칸 = 평균 score / 시도당 cost USD.

| task | single | bams |
|------|--------|------|
| review-01 | 0.767 / $0.254 | 0.967 / $0.521 |
| review-02 | 1.000 / $0.205 | 0.967 / $0.441 |

bams 6건 모두 `agent_spawns=0`·`skill_calls=0`·TodoWrite 0회·verdict 미작성 — 커맨드는 인식됐지만 하네스(5관점 spawn·판정자·verdict)를 전혀
따르지 않고 메인이 직접 리뷰했다. 점수 차는 하네스 효과가 아니라 커맨드 본문의 리뷰 지침 효과로 봐야 하며, 비용은 약 2배다.
outcome 점수만으로는 이 차이가 보이지 않아 아래 "과정 지표"와 `hooks/pipeline-completion-guard.sh`(Stop)를 추가했다.

v2.9.0의 리뷰 근거 규칙은 리뷰 오탐을 겨냥하므로 review-01/02부터 재측정한다(실제 비용 발생 — 사람이 예산 확인 후 실행):
```bash
cd plugins/bams-plugin/evals
cat results/*2026110[56]-*-bams.jsonl > results/baseline-v2.8-bams.jsonl
./run.sh --config bams --task "review-01-session-auth review-02-cache-repo" --trials 3 --total-budget-usd 10
./compare.sh results/baseline-v2.8-bams.jsonl results/<새 ts>-bams.jsonl   # d.score = v2.9.0 - v2.8.x
```

## 구성 차이 (유일한 변수)
- bams: `--plugin-dir <evals 제외 스냅샷>` + 프롬프트 `"/bams-plugin:bams:<cmd> <요청>"`(`--plugin-dir` 로드 시 실측 등록명; `/bams:<cmd>`는 인식 안 됨) + 작업 디렉터리에 중립적인 최소 `.crew/config.md`(과제 제약은 두 구성 공통으로 prompt.md에만 둠).
- single: `--plugin-dir` 없음 + `--settings '{"enabledPlugins":{"bams-plugin@my-claude":false}}'` + 요청 문장만. (공통: `--setting-sources project,local`로 user 설정/플러그인 미로드, `BAMS_ROUTER=off`)

## 결과 해석
- score = 숨김 테스트 통과율(`regress:` 가드 테스트는 분모 제외, 하나라도 깨지면 x0.5). 기존 테스트 파일의 기존 줄을 삭제·수정하면 0(`tampered`; 테스트 추가는 허용), 원본 테스트를 복원해 돌려 실패하면 x0.5.
- 리뷰·계획 채점 입력 = 최종 메시지 + 작업 디렉터리의 새/변경 .md 전부. `cmd_resolved`=false(bams)면 커맨드가 인식 안 된 무효 시도.
  기존 raw 재채점: `./run.sh --regrade-text results/raw/<dir>` (최종 메시지만, `results/regrade-*.jsonl`).
- 리뷰: 심어진 결함 4개 재현율 - 무해 변경을 문제라 한 오탐 건당 0.1. 계획: 키워드 루브릭(19항목) — 형식 충족도를 보는 거친 척도이며 품질 판단은 사람이 샘플 확인.
- `agent_spawns`(Agent/Task 호출 수)·`skill_calls`가 0이면 bams 구성이라도 파이프라인 없이 직접 처리한 것이다 — 점수 해석 시 함께 볼 것.
- `compare.sh`는 `cmd_resolved == false` 또는 `error`가 비어 있지 않은 행(timeout, budget 초과, 중단 등)을 **평균에서 뺀다**(`excl A/B` 열에 수 표시). `error`가 없거나 `null`인 `regrade-*` 행은 정상 행이다. `duration_s` 음수(이전 러너의 중단 기록 오류)·`null`은 시간 평균에서 빠진다.

## 과정 지표 (process metrics — outcome score와 별도)
`lib/process_metrics.sh <raw> [work]`가 시도마다 stream-json과 **정리 전 작업 디렉터리**에서 계산해 결과 행에 넣는다(`--regrade-text`도 raw로 계산, 작업 디렉터리가 없어 `verdict_written=null`).

| 필드 | 뜻 |
|------|----|
| `todo_used` | 메인 세션이 TodoWrite(또는 TaskCreate/TaskUpdate)를 호출했는가 — 커맨드 `## Steps` 체크리스트 복사 |
| `steps_copied` | 첫 TodoWrite의 항목 수(없으면 TaskCreate 수). 커맨드 Steps 항목 수와 비교(`0. Steps 등록`·`10-1` 같은 하위 번호 포함: review 15·deep-review 14·ship/deploy 11) |
| `skips_with_reason` / `skips_without_reason` | 마지막 TodoWrite 항목 + TaskCreate/TaskUpdate의 subject·description + 최종 메시지 줄의 `skip: <사유>`(사유 2글자 이상) / 사유 없는 `skip:` 수. Steps 원문 자리표시자 `skip: <사유>`는 세지 않음 |
| `verdict_written` | 작업 디렉터리에 `.crew/artifacts/review/verdict-*.json`이 생겼는가 |
| `verdict_judge_spawned` | Agent/Task 호출 중 `subagent_type`에 `release-quality-gate` 포함 |
| `agent_spawns` | Agent/Task 호출 수(기존) |
| `completion_guard_blocks` | Stop hook `pipeline-completion-guard` block 횟수 — `--include-hook-events`의 `{"type":"system","subtype":"hook_response","hook_event":"Stop","stdout"/"output":…}`에서 stdout/output의 `decision:"block"`+completion-guard reason, 또는 주입된 `[bams completion-guard]` 피드백 중 큰 값. 스트림에 안 보이면 0. guard는 transcript가 없는 `-p --no-session-persistence` 실행에서도 metrics 세션 상태(`.track`)로 판정한다 |
| `process_score` | 0~1, (todo_used, verdict_written, verdict_judge_spawned, 무사유 skip 없음) 동일 가중 평균. "무사유 skip 없음"은 todo_used일 때만 1. `verdict_written=null`이면 나머지 3개 평균 |

- `process_score`는 **`score`에 섞지 않는다**. 머지 규칙(아래)은 여전히 outcome `score` 기준이고, process 표는 "하네스를 실제로 따랐는가"를 따로 본다.
- verdict 두 항목은 review 계열 과제를 위한 것이다. bug/feat/plan 과제의 낮은 process_score는 그 커맨드에 verdict 단계가 없어서일 수 있으니 과제별로 읽는다.
- single 구성은 플러그인이 없어 보통 0에 가깝다(기준선). 허용 도구는 두 구성이 같다(`run.sh` 기본 `ALLOWED`에 TodoWrite·TaskCreate·TaskUpdate·ToolSearch 포함) — single도 작업 목록 등록 경로를 쓸 수 있다.
- 한계: eval 리뷰 과제는 `change.diff`를 적용하지 않은 작업 트리에서 리뷰하므로, 거기서 쓴 verdict는 변경이 빠진 커밋에 결합된다(`references/verdict-protocol.md` §남는 한계). `verdict_written`은 "판정 단계를 수행했는가"만 뜻한다.
- 한계: 에이전트가 Bash로 evals 경로를 읽을 수 있음(bams 구성은 스냅샷에서 evals 제외, 작업 사본에는 hidden/solution 없음). 합성 소과제라 큰 저장소 성능을 대변하지 않음.
