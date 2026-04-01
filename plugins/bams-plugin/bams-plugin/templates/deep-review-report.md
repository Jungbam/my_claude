---
pipeline: deep-review
started_at: {ISO_TIMESTAMP}
completed_at:
status: in_progress
target: {REVIEW_TARGET}
gstack: {true/false}
context_loaded:
  previous_reviews: {COUNT}
  unresolved_issues: {COUNT}
  learnings_conventions: {MATCHING_CONVENTIONS}
---

## Steps

| Step | 이름 | 상태 | 완료시각 | 이슈 수 |
|------|------|------|----------|---------|
| 1 | Crew 5관점 | pending | | |
| 2 | gstack 구조적 | pending | | |
| 3 | Codex 세컨드 | pending | | |

## Previous Unresolved Issues

| 이슈 ID | 파일:라인 | 설명 | 이번 상태 |
|----------|-----------|------|-----------|
| {ID} | {FILE:LINE} | {DESCRIPTION} | resolved/persists |

## 통합 리포트

### 요약

| 리뷰 시스템 | Critical | Major | Minor | 총계 |
|-------------|----------|-------|-------|------|
| Crew 5관점 | {N} | {N} | {N} | {N} |
| gstack 구조적 | {N} | {N} | {N} | {N} |
| Codex | PASS/FAIL | — | — | — |
| **통합** | **{N}** | **{N}** | **{N}** | **{N}** |

### 공통 발견 (높은 신뢰도)

여러 리뷰 시스템에서 동시에 발견된 이슈:

| ID | 파일:라인 | 카테고리 | 심각도 | 설명 |
|----|-----------|----------|--------|------|
| {ID} | {FILE:LINE} | {CAT} | {SEV} | {DESC} |

### 리뷰별 고유 발견

#### Crew 전용
| ID | 에이전트 | 파일:라인 | 심각도 | 설명 |
|----|----------|-----------|--------|------|

#### gstack 전용
| ID | 파일:라인 | 심각도 | 설명 |
|----|-----------|--------|------|

#### Codex 전용
| 판정 | 설명 |
|------|------|

## Execution Log

- [{TIME}] Step 1: Crew — Critical {N}, Major {N}, Minor {N}
- [{TIME}] Step 2: gstack — Critical {N}, Major {N} (or skipped)
- [{TIME}] Step 3: Codex — {PASS/FAIL} (or skipped)
- [{TIME}] 중복 제거: {N}개 → {N}개
- [{TIME}] 이전 미해결: {N}개 중 {N}개 resolved
