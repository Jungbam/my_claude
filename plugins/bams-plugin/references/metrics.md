# 파이프라인 계측 (metrics) [L2]

> 온디맨드 문서. 계측 데이터를 읽거나, 회고·하네스 변경의 근거 수치가 필요할 때 Read한다.
> 구성: `hooks/metrics.sh`(자동 기록) + `scripts/metrics-report.sh`(집계). 테스트: `tests/hooks/run-hook-tests.sh` "metrics" 섹션.

## 1. 켜기·끄기·저장 위치

- 기본 on. `BAMS_METRICS=off`(또는 `0`/`false`/`no`)면 아무것도 기록하지 않는다.
- 저장: `${BAMS_METRICS_DIR:-~/.claude/bams-metrics}/events.jsonl` (프로젝트 공통, 1줄 1이벤트). 세션 상태는 같은 디렉터리의 `state/`(2일 지난 파일은 자동 삭제).
- 개인정보: 프롬프트 본문은 저장하지 않는다. 커맨드 인자(`args`)만 앞 80자 저장한다.
- hook은 출력·차단을 하지 않는다. 자기 오류는 모두 무시(fail-open)한다.

## 2. 이벤트

공통 필드: `v`(1), `ts`(UTC 초), `session_id`, `project`(cwd에서 위로 찾은 git 루트 이름), `ev`, `pipeline`·`pipeline_ts`(이 이벤트가 속한 파이프라인의 커맨드·시작 시각, 없으면 null).

| ev | 발생 hook | 추가 필드 |
|----|-----------|-----------|
| `pipeline_start` | UserPromptExpansion(`command_name`이 `…bams:<cmd>`), UserPromptSubmit(`/bams:<cmd> …`), PostToolUse `Skill`(열린 파이프라인이 없을 때만) | `command`, `args`(80자), `source`(expansion/prompt_submit/skill_tool) |
| `human_turn` | UserPromptSubmit — 같은 세션에 열린 파이프라인이 있을 때. 슬래시 입력, `<task-notification>` 등 시스템 태그, 시작 3초 안의 입력은 제외 | — |
| `agent_end` | SubagentStop(async). `agent_type`이 빈 내부 에이전트는 제외 | `agent_type`, `agent_id`, `dur_ms`, `dur_src`(start_pair/transcript), `usage`, `t_first`, `t_last` |
| `pipeline_end` | PostToolUse `Edit`/`Write` — 대상이 `*/.crew/history.md`. 새로 생긴 첫 헤더 줄을 파싱 | `slug`, `command`(slug 앞부분), `status`(원문), `result`(success/concerns/failed/aborted/blocked/other), `date`, `parse` |
| `session_usage` | Stop(async) — 열린(또는 방금 끝난) 파이프라인이 있을 때만. 메인 transcript의 직전 기록 이후 줄만 합산 | `usage` |

- `usage` = `{input, output, cache_read, cache_creation, cache_creation_1h, messages, by_model}`. transcript의 `message.usage`를 `message.id`별로 1번만 센다(content block마다 같은 usage가 반복되기 때문). transcript를 못 읽으면 `null`.
- 같은 입력이 UserPromptExpansion과 UserPromptSubmit에서 모두 오면 `prompt_id`(없으면 10초 안의 같은 커맨드)로 1건만 남긴다.
- 파이프라인은 `pipeline_end`가 기록되면 닫히고, 그 직후 Stop 1회분 usage까지 같은 파이프라인에 붙는다. 12시간이 지나도록 닫히지 않으면 무효로 본다.
- history.md 헤더 형식: `## YYYY-MM-DD | {slug} | {STATUS}` 또는 1줄 `YYYY-MM-DD | {slug} | {command} | {status} | {요약}`.

## 3. 리포트

```bash
bash plugins/bams-plugin/scripts/metrics-report.sh                 # 최근 30일
bash plugins/bams-plugin/scripts/metrics-report.sh --since 7d --project my-app
bash plugins/bams-plugin/scripts/metrics-report.sh --since all --file /path/events.jsonl
```

- 파이프라인 표: 시작, command, 프로젝트, slug, 리드타임(시작→history 기록), 에이전트 수, 총 토큰, 추정 비용, 사람 개입 수, 결과.
- 커맨드별 집계: 건수, 종료 수, 성공률(success+concerns / 종료), 실패 수, 리드타임·토큰·비용 중앙값, 개입 평균.
- 결함 유출 후보: hotfix/debug 파이프라인마다, 시작 전 7일 안에 끝난 같은 프로젝트의 다른 파이프라인을 나열한다(후보일 뿐, 원인 확정 아님).
- 비용: 스크립트 상단 `PRICES`(공식 가격 페이지 기준, 확인일 주석) × 모델별 토큰. 표에 없는 모델은 `*` 표시하고 그 부분은 빠진다. 가격이 바뀌면 `PRICES`만 고친다.

## 4. 한계

- `.crew/history.md`를 Edit/Write가 아닌 Bash(`>>`)로 쓰면 `pipeline_end`가 남지 않는다. 그 경우 리포트에 `미종료`로 보인다.
- 모델이 Skill 도구를 쓰지 않고 커맨드 본문만 따라 진행하면 `pipeline_start`가 없다(시작 없는 `pipeline_end`는 별도 행으로 보인다).
- `claude -p`(비대화형)는 종료 시 async hook을 끊기 때문에 마지막 `agent_end`/`session_usage`가 빠질 수 있다.
- transcript는 비동기로 기록되어 hook 시점에 마지막 메시지가 아직 없을 수 있다. 빠진 메시지는 다음 Stop 증분에 포함된다(서브에이전트는 빠진 채로 남는다).
