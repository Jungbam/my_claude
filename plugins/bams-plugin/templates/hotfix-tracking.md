---
pipeline: hotfix
slug: {SLUG}
description: {BUG_DESCRIPTION}
started_at: {ISO_TIMESTAMP}
completed_at:
status: in_progress
gstack: {true/false}
context_loaded:
  config: {true/false}
  related_tasks: {TASK-NNN or null}
  related_reviews: {REVIEW_FILE or null}
  learnings_hints: {MATCHING_VULNERABLE_AREAS}
---

## Steps

| Step | 이름 | 상태 | 완료시각 | 산출물 |
|------|------|------|----------|--------|
| 1 | 버그 진단+수정 | pending | | |
| 2 | QA 검증 | pending | | |
| 3 | CI/CD 프리플라이트 | pending | | |
| 4 | Ship | pending | | |
| 5 | 배포 | pending | | |

## Root Cause Analysis

- **증상**: {사용자가 보고한 증상}
- **근본 원인**: {진단 결과}
- **영향 범위**: {영향받는 파일/기능}
- **수정 방법**: {적용한 수정}
- **유사 패턴**: {코드베이스에 같은 패턴이 있는 다른 위치}

## Modified Files

| 파일 | 변경 유형 | 설명 |
|------|-----------|------|
| {PATH} | fix/test/refactor | {한줄 설명} |

## Regression Tests

| 테스트 파일 | 커버 범위 | 상태 |
|-------------|-----------|------|
| {PATH} | {테스트 대상} | committed/deferred |

## Execution Log

- [{TIME}] Step 1: 근본 원인 — {요약}. 수정 파일 {N}개, 회귀 테스트 {N}개
- [{TIME}] Step 2: {QA 결과 or skipped}
- [{TIME}] Step 3: verify {PASS/FAIL}
- [{TIME}] Step 4: {PR URL or skipped}
- [{TIME}] Step 5: {deploy 결과 or skipped}
