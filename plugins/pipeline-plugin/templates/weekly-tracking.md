---
pipeline: weekly
started_at: {ISO_TIMESTAMP}
completed_at:
status: in_progress
gstack: {true/false}
week_of: {YYYY-MM-DD}
context_loaded:
  active_sprint: {SPRINT_NAME or null}
  pipelines_this_week: {COUNT}
  previous_weekly: {FILE_PATH or null}
---

## This Week Summary

### 파이프라인 실행 현황

| 파이프라인 | 실행 수 | 완료 | 진행중 | 실패 |
|-----------|---------|------|--------|------|
| feature | {N} | {N} | {N} | {N} |
| hotfix | {N} | {N} | {N} | {N} |
| deep-review | {N} | {N} | {N} | {N} |
| security | {N} | {N} | {N} | {N} |
| performance | {N} | {N} | {N} | {N} |

### 스프린트 현황

| 지표 | 값 |
|------|-----|
| 스프린트 | {NAME} |
| 완료율 | {N}% |
| 완료 태스크 | {N}/{TOTAL} |
| 블록 태스크 | {N} |
| 새로 추가 | {N} |

### 지난주 대비

| 지표 | 지난주 | 이번주 | 변화 |
|------|--------|--------|------|
| feature 완료 | {N} | {N} | {+/-N} |
| hotfix 발생 | {N} | {N} | {+/-N} |
| 리뷰 이슈 | {N} | {N} | {+/-N} |
| 스프린트 완료율 | {N}% | {N}% | {+/-N}% |

## Steps

| Step | 이름 | 상태 | 완료시각 | 비고 |
|------|------|------|----------|------|
| 1 | 스프린트 현황 | pending | | |
| 2 | 스프린트 종료 | pending | | |
| 3 | 회고 | pending | | |
| 4 | 다음 스프린트 | pending | | |

## Execution Log

- [{TIME}] Step 1: 스프린트 {NAME} — 완료율 {N}%, 블록 {N}개
- [{TIME}] Step 2: {종료/계속}
- [{TIME}] Step 3: 회고 — {핵심 인사이트} (or skipped)
- [{TIME}] Step 4: {다음 스프린트 계획/나중에}
