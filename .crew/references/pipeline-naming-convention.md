# 파이프라인 네이밍 규칙

> 작성일: 2026-04-03
> 적용 범위: `.crew/artifacts/pipeline/`, `.crew/artifacts/prd/`, `.crew/artifacts/design/`, `board.md` 태스크 ID

## 1. Slug 형식

```
{command}_{한글요약}_{상태}
```

### 구성요소

| 구성요소 | 규칙 | 예시 |
|----------|------|------|
| `command` | 파이프라인 명령어 소문자 | `feature`, `hotfix`, `dev`, `debug` |
| `한글요약` | 공백 없이 작업 내용 요약 (10자 이내 권장) | `파이프라인네이밍규칙정립`, `빌드에러수정` |
| `상태` | `진행중` 또는 `완료` | `진행중`, `완료` |

### 구분자
- 구성요소 사이: `_` (언더스코어)
- 한글요약 내부: 공백 없이 연속 작성 (붙여쓰기)

## 2. 파이프라인 명령어 목록

| 명령어 | 사용 상황 |
|--------|----------|
| `feature` | 신규 기능 개발 (`/bams:feature`) |
| `hotfix` | 긴급 버그 수정 (`/bams:hotfix`) |
| `dev` | 일반 개발 작업 (`/bams:dev`) |
| `debug` | 버그 분류 및 수정 (`/bams:debug`) |

## 3. 파일명 규칙

### 이벤트 파일 (`.crew/artifacts/pipeline/`)
```
{slug}-events.jsonl
```
예: `feature_파이프라인네이밍규칙정립_진행중-events.jsonl`

### PRD 파일 (`.crew/artifacts/prd/`)
```
{slug}-prd.md
```
예: `feature_파이프라인네이밍규칙정립_진행중-prd.md`

### 설계 문서 (`.crew/artifacts/design/`)
```
{slug}-design.md
```
예: `feature_파이프라인네이밍규칙정립_진행중-design.md`

### 리뷰 문서 (`.crew/artifacts/review/`)
```
{slug}-review.md
```
예: `feature_파이프라인네이밍규칙정립_진행중-review.md`

### 핫픽스 문서 (`.crew/artifacts/hotfix/`)
```
{slug}-triage.md
```
예: `hotfix_빌드에러수정_완료-triage.md`

## 4. board.md 태스크 ID 규칙

태스크 ID는 slug 기반 접두사를 사용합니다:

```
{COMMAND}-{NNNN}: {제목}
```

예:
- `FEATURE-0001: 파이프라인 네이밍 규칙 정립`
- `HOTFIX-0001: 빌드 에러 수정`
- `DEV-0001: DB 연동 구현`

## 5. 상태 전환

파이프라인 완료 시 파일명의 `진행중`을 `완료`로 변경합니다.

예:
- 시작: `feature_파이프라인네이밍규칙정립_진행중-events.jsonl`
- 완료: `feature_파이프라인네이밍규칙정립_완료-events.jsonl`

## 6. 적용 예시

| 작업 | Slug | 이벤트 파일 |
|------|------|------------|
| 파이프라인 네이밍 규칙 정립 | `feature_파이프라인네이밍규칙정립_완료` | `feature_파이프라인네이밍규칙정립_완료-events.jsonl` |
| viz 빌드 에러 수정 | `hotfix_viz빌드에러수정_완료` | `hotfix_viz빌드에러수정_완료-events.jsonl` |
| DB 연동 구현 | `dev_DB연동구현_완료` | `dev_DB연동구현_완료-events.jsonl` |
| 조직도 간격 수정 | `hotfix_조직도간격수정_완료` | `hotfix_조직도간격수정_완료-events.jsonl` |

## 7. bams-viz-emit.sh 연동

`bams-viz-emit.sh` 호출 시 slug 파라미터에 위 형식을 그대로 사용합니다:

```bash
bash "$_EMIT" pipeline_start "feature_파이프라인네이밍규칙정립_진행중" ...
```

이벤트 파일은 `.crew/artifacts/pipeline/{slug}-events.jsonl`에 자동 기록됩니다.
