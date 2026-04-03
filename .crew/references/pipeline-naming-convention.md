# 파이프라인 네이밍 규칙

> 작성일: 2026-04-03
> 최종 수정: 2026-04-03 (slug immutability 원칙 적용 — _상태 suffix 제거)
> 적용 범위: `.crew/artifacts/pipeline/`, `.crew/artifacts/prd/`, `.crew/artifacts/design/`, `board.md` 태스크 ID

## 1. Slug 형식

```
{command}_{한글요약}
```

### 구성요소

| 구성요소 | 규칙 | 예시 |
|----------|------|------|
| `command` | 파이프라인 명령어 소문자 | `feature`, `hotfix`, `dev`, `debug` |
| `한글요약` | 공백 없이 작업 내용 요약 (10자 이내 권장) | `파이프라인네이밍규칙정립`, `빌드에러수정` |

### 구분자
- 구성요소 사이: `_` (언더스코어)
- 한글요약 내부: 공백 없이 연속 작성 (붙여쓰기)

### 핵심 원칙: Slug는 불변(Immutable)

**slug는 파이프라인 수명 동안 절대 변경하지 않습니다.**

- 파이프라인 시작 시 slug를 결정하고 종료까지 동일한 slug를 사용합니다.
- 상태(`진행중` / `완료`)를 slug에 포함하지 않습니다.
- 상태는 이벤트 파일 내 이벤트로 자동 판별됩니다:
  - `pipeline_end` 이벤트 없음 → 진행 중
  - `pipeline_end` 이벤트 있음 → 완료 (status 필드 기준)

**slug를 변경하면 안 되는 이유:**
emit.sh는 slug를 파일명으로 직접 사용합니다. slug가 변경되면 별도 JSONL 파일이 생성되어
하나의 파이프라인이 여러 항목으로 분리되어 viz에 표시됩니다.

## 2. 파이프라인 명령어 목록

| 명령어 | 사용 상황 |
|--------|----------|
| `feature` | 신규 기능 개발 (`/bams:feature`) |
| `hotfix` | 긴급 버그 수정 (`/bams:hotfix`) |
| `dev` | 일반 개발 작업 (`/bams:dev`) |
| `debug` | 버그 분류 및 수정 (`/bams:debug`) |

## 3. 파일명 규칙

### 이벤트 파일 (`~/.bams/artifacts/pipeline/`)
```
{slug}-events.jsonl
```
예: `feature_파이프라인네이밍규칙정립-events.jsonl`

모든 이벤트(pipeline_start, step_start, agent_start, agent_end, step_end, pipeline_end)가
**하나의 파일**에 기록됩니다.

### PRD 파일 (`.crew/artifacts/prd/`)
```
{slug}-prd.md
```
예: `feature_파이프라인네이밍규칙정립-prd.md`

### 설계 문서 (`.crew/artifacts/design/`)
```
{slug}-design.md
```
예: `feature_파이프라인네이밍규칙정립-design.md`

### 리뷰 문서 (`.crew/artifacts/review/`)
```
{slug}-review.md
```
예: `feature_파이프라인네이밍규칙정립-review.md`

### 핫픽스 문서 (`.crew/artifacts/hotfix/`)
```
{slug}-triage.md
```
예: `hotfix_빌드에러수정-triage.md`

## 4. board.md 태스크 ID 규칙

태스크 ID는 slug 기반 접두사를 사용합니다:

```
{COMMAND}-{NNNN}: {제목}
```

예:
- `FEATURE-0001: 파이프라인 네이밍 규칙 정립`
- `HOTFIX-0001: 빌드 에러 수정`
- `DEV-0001: DB 연동 구현`

## 5. 상태 판별 방식

파이프라인 상태는 slug나 파일명이 아닌 **이벤트 내용**으로 판별합니다.

| 판별 기준 | 상태 |
|----------|------|
| 이벤트 파일에 `pipeline_end` 없음 | 진행 중 (running) |
| `pipeline_end` 있고 status=completed | 완료 |
| `pipeline_end` 있고 status=failed | 실패 |

viz(`parser.ts` `buildPipeline()`)는 이 방식으로 이미 동작합니다.

## 6. 적용 예시

| 작업 | Slug | 이벤트 파일 |
|------|------|------------|
| 파이프라인 네이밍 규칙 정립 | `feature_파이프라인네이밍규칙정립` | `feature_파이프라인네이밍규칙정립-events.jsonl` |
| viz 빌드 에러 수정 | `hotfix_viz빌드에러수정` | `hotfix_viz빌드에러수정-events.jsonl` |
| DB 연동 구현 | `dev_DB연동구현` | `dev_DB연동구현-events.jsonl` |
| 조직도 간격 수정 | `hotfix_조직도간격수정` | `hotfix_조직도간격수정-events.jsonl` |

## 7. bams-viz-emit.sh 연동

`bams-viz-emit.sh` 호출 시 slug 파라미터에 위 형식을 그대로 사용합니다:

```bash
# 파이프라인 시작
bash "$_EMIT" pipeline_start "feature_파이프라인네이밍규칙정립" "feature" "/bams:feature" "..."

# 파이프라인 종료 — 동일한 slug 사용
bash "$_EMIT" pipeline_end "feature_파이프라인네이밍규칙정립" "completed" ...
```

이벤트 파일은 `~/.bams/artifacts/pipeline/{slug}-events.jsonl`에 자동 기록됩니다.

## 8. orchestrator slug 사용 규칙

pipeline-orchestrator가 agent_start/agent_end 이벤트를 emit할 때:

```bash
# 올바른 사용: 커맨드에서 전달받은 slug를 그대로 사용
bash "$_EMIT" agent_start "{커맨드_전달_slug}" "{call_id}" ...

# 금지: 자체 slug 생성 금지
bash "$_EMIT" agent_start "hotfix-enforce-pipeline-delegation-triage" ...  # WRONG
```

상세: `.crew/references/viz-agent-protocol.md` 참조
