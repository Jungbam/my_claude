---
pipeline: feature
slug: {{SLUG}}
project: {{PROJECT_NAME}}
description: {DESCRIPTION}
started_at: {{TIMESTAMP}}
completed_at:
status: in_progress
gstack: {true/false}
branch: {{BRANCH}}
tech_stack: {{TECH_STACK}}
current_phase: 1
current_step: 1
context_loaded:
  config: {true/false}
  board: {true/false}
  existing_prd: {SLUG or null}
  existing_design: {SLUG or null}
  previous_reviews: {COUNT}
  learnings_count: {COUNT}
---

## Steps

| Step | Phase | 이름 | 상태 | 완료시각 | 산출물 |
|------|-------|------|------|----------|--------|
| 1 | 기획 | PRD+설계+태스크 | pending | | |
| 2 | 기획 | 스프린트 설정 | pending | | |
| 3 | 구현 | 멀티에이전트 개발 | pending | | |
| 4 | 검증 | 5관점 코드 리뷰 | pending | | |
| 5 | 검증 | 브라우저 QA | pending | | |
| 6 | 검증 | 성능 베이스라인 | pending | | |
| 7 | 검증 | 보안 감사 | pending | | |
| 8 | 검증 | CI/CD 프리플라이트 | pending | | |
| 9 | 배포 | Ship | pending | | |
| 10 | 배포 | Land & Deploy | pending | | |
| 11 | 마무리 | 문서 갱신 | pending | | |
| 12 | 마무리 | 스프린트 종료 | pending | | |
| 13 | 마무리 | 회고 | pending | | |

## Context Summary

### 프로젝트 메타
- 기술스택: {FROM_CONFIG}
- 관련 기존 아티팩트: {PRD/DESIGN if any}
- 코드 구조: {KEY_DIRECTORIES}

### Learnings 컨텍스트
- 관련 패턴: {MATCHING_PATTERNS from learnings}
- 주의 영역: {VULNERABLE_AREAS from learnings}
- 이전 컨벤션: {CONVENTIONS from learnings}

## Execution Log

### Phase 1: 기획
- [{TIME}] Step 1: {결과 요약}
- [{TIME}] Step 2: {결과 요약}

### Phase 2: 구현
- [{TIME}] Step 3: {구현된 파일 N개, 리뷰 라운드 N회}

### Phase 3: 검증
- [{TIME}] Step 4: {Critical N, Major N, Minor N}
- [{TIME}] Step 5: {QA 결과 or skipped}
- [{TIME}] Step 6: {벤치마크 결과 or skipped}
- [{TIME}] Step 7: {보안 결과 or skipped}
- [{TIME}] Step 8: {verify PASS/FAIL}

### Phase 4: 배포
- [{TIME}] Step 9: {PR URL or skipped}
- [{TIME}] Step 10: {deploy 결과 or skipped}

### Phase 5: 마무리
- [{TIME}] Step 11-13: {결과 요약}

## Artifacts

| 유형 | 경로 |
|------|------|
| PRD | .crew/artifacts/prd/{SLUG}-prd.md |
| 설계 | .crew/artifacts/design/{SLUG}-design.md |
| 리뷰 | .crew/artifacts/review/review-{TIMESTAMP}.md |
| 파이프라인 | .crew/artifacts/pipeline/feature-{SLUG}-{TIMESTAMP}.md |
