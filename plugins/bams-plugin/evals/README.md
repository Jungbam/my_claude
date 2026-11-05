# bams evals — 결과 기반 하네스 평가

합성 저장소 10과제(버그 3·기능 4·리뷰 2·계획 1)를 **bams**(플러그인+슬래시 커맨드)와 **single**(플러그인 없음, 자연어만)로
같은 조건에서 실행하고 숨김 테스트/정답 키/루브릭으로 0~1 채점한다. 과제는 `tasks/<id>/{repo,hidden,solution,prompt.md,task.json,grade.sh}`.

## 실행
```bash
./validate.sh                                  # 무료. grade.sh·구조·dry-run 자체 검증 (claude 호출 없음)
./run.sh --config bams --dry-run               # 명령만 출력
./run.sh --config single --task bug-01-pagination --trials 1 --budget-usd 1
./run.sh --config bams --task all --trials 3 --total-budget-usd 40
./compare.sh results/<A>-single.jsonl results/<B>-bams.jsonl   # 과제별·전체 점수/시간/비용 표
```
결과: `results/<timestamp>-<config>.jsonl` (task, config, trial, score, duration_s, tokens, cost_usd, turns, error), 원본 JSON은 `results/raw/`.
환경변수: `EVAL_MODEL`, `EVAL_PERMISSION_MODE`(기본 acceptEdits), `EVAL_ALLOWED_TOOLS`, `EVAL_PLUGIN_DIR`, `EVAL_STRICT_MCP=0`.

## 비용 주의
- **실제 `claude -p`를 호출**한다(구독 한도/API 비용 소모). 과제당 `--max-budget-usd`(task.json 기본 2~3달러) + 타임아웃이 상한. 전체 상한은 `--total-budget-usd`.
- bams 구성은 다중 에이전트라 single보다 훨씬 비쌀 수 있다. 처음엔 `--trials 1 --task <1건>`으로 비용을 재고 늘릴 것. 비교는 trials>=3 권장(비결정성).

## 머지 규칙
하네스(agents/commands/hooks/references/skills) 변경 PR은 변경 전·후 `--config bams --task all --trials 3` 결과를 `compare.sh`로 비교해
**전체 평균 점수가 하락하지 않을 때만** 머지한다(과제별 하락이 있으면 사유 기재). 점수 동률이면 시간·비용이 늘지 않았는지 본다.
결과 jsonl은 PR에 첨부. 과제/채점기 수정은 하네스 변경과 별도 PR로 하고 baseline을 다시 측정한다.

## 구성 차이 (유일한 변수)
- bams: `--plugin-dir <evals 제외 스냅샷>` + 프롬프트 `"/bams:<cmd> <요청>"` + 작업 디렉터리에 최소 `.crew/config.md`.
- single: `--plugin-dir` 없음 + `--settings '{"enabledPlugins":{"bams-plugin@my-claude":false}}'` + 요청 문장만. (공통: `--setting-sources project,local`로 user 설정/플러그인 미로드, `BAMS_ROUTER=off`)

## 결과 해석
- score = 숨김 테스트 통과율(`regress:` 가드 테스트는 분모 제외, 하나라도 깨지면 x0.5). 기존 테스트 파일 변조/삭제 시 0(`tampered`).
- 리뷰: 심어진 결함 4개 재현율 - 무해 변경을 문제라 한 오탐 건당 0.1. 계획: 키워드 루브릭(19항목) — 형식 충족도를 보는 거친 척도이며 품질 판단은 사람이 샘플 확인.
- `error` 비어있지 않은 시도(timeout, budget 초과 등)는 score 0으로 집계되므로 error 열도 함께 볼 것.
- 한계: 에이전트가 Bash로 evals 경로를 읽을 수 있음(bams 구성은 스냅샷에서 evals 제외, 작업 사본에는 hidden/solution 없음). 합성 소과제라 큰 저장소 성능을 대변하지 않음.
