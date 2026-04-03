---
description: 풀 피처 개발 사이클 — 기획 → 구현 → 검증 → 배포 → 마무리
argument-hint: <기능 설명 또는 기존 slug>
---

# Bams: Feature

총괄팀 중심 위임 구조의 풀 피처 생명주기를 관리합니다. 6개 Phase, 최대 13단계.
커맨드는 pipeline-orchestrator에게 Phase 단위 지시를 내리고, orchestrator가 부서장에게, 부서장이 에이전트에게 위임하는 3단 구조입니다.

```
feature.md → pipeline-orchestrator
               → [Phase 0] resource-optimizer (전략)
               → [Phase 1] product-strategy(기획부장) → BA, UX, PG
               → [Phase 1→2 핸드오프] cross-department-coordinator
               → [Phase 2] 개발부장 → FE, BE, devops, data-integration
               → [Phase 3 Step 4] qa-strategy(QA부장) → automation-qa (5관점 코드 리뷰)
               → [Phase 3 Step 5-7] qa-strategy(QA부장) + product-analytics(평가부장) (병렬)
               → [Phase 3 Step 8] platform-devops (CI/CD)
               → [Phase 4] executive-reporter (보고) + Ship/Deploy
               → [Phase 5 Step 11] product-strategy(기획부장) → 문서 갱신
               → [Phase 5 Step 12] project-governance → 스프린트 종료
               → [Phase 5 Step 13] executive-reporter + 부서장들 (자동 강제 회고)
```

입력: $ARGUMENTS

$ARGUMENTS가 비어있으면, 사용자에게 무엇을 개발할지 물어보고 중단합니다.

## 코드 최신화

Bash로 `git rev-parse --is-inside-work-tree 2>/dev/null`를 실행하여 git 저장소인지 확인합니다.

**git 저장소인 경우**: Bash로 `git branch --show-current`를 실행하여 현재 브랜치를 확인한 뒤, `git pull origin {현재 브랜치}`를 실행하여 원격 저장소의 최신 코드를 가져옵니다. 충돌이 발생하면 사용자에게 알리고 중단합니다.

**git 저장소가 아닌 경우**: 이 단계를 스킵합니다.

## 사전 조건

Glob으로 `.crew/config.md`가 존재하는지 확인합니다. 없으면:
- 출력: "프로젝트가 초기화되지 않았습니다. `/bams:init`을 실행하여 설정하세요."
- 여기서 중단.

`.crew/config.md`와 `.crew/board.md`를 읽습니다.

## 공통 규칙 로드

이 파이프라인의 공통 규칙을 Read합니다:
`plugins/bams-plugin/commands/bams/feature/_common.md`

## 작업 범위 결정

추가 스캔 (병렬):
- **`.crew/artifacts/prd/`** — 기존 PRD 확인. 인자가 기존 slug와 일치하면 해당 PRD 로딩.
- **`.crew/artifacts/design/`** — 기존 기술설계 문서 확인.

**$ARGUMENTS가 기존 slug와 일치하고 PRD/설계 문서가 존재하는 경우:**
- 기존 아티팩트 로딩
- 해당 피처의 태스크가 board.md에 있으면 Phase 2 (구현)로 진행
- 없으면 Phase 1 (기획)로 진행

**$ARGUMENTS가 새로운 피처 설명인 경우:**
- slug를 생성합니다
- Phase 0 (파이프라인 초기화)으로 진행

## Phase 라우팅

현재 상태와 $ARGUMENTS에 따라 해당 Phase 파일을 Read하여 지시를 따릅니다:

| Phase | 파일 | 설명 |
|-------|------|------|
| Phase 0 | `plugins/bams-plugin/commands/bams/feature/phase-0-init.md` | 파이프라인 초기화 |
| Phase 1 | `plugins/bams-plugin/commands/bams/feature/phase-1-planning.md` | 기획 (PRD + 설계 + 태스크 분해) |
| Phase 1.5 | `plugins/bams-plugin/commands/bams/feature/phase-1-5-git.md` | Git 체크포인트 |
| Phase 2 | `plugins/bams-plugin/commands/bams/feature/phase-2-implementation.md` | 멀티에이전트 구현 |
| Phase 3 | `plugins/bams-plugin/commands/bams/feature/phase-3-verification.md` | 검증 (5관점 리뷰 + QA + 성능 + 보안) |
| Phase 4 | `plugins/bams-plugin/commands/bams/feature/phase-4-deploy.md` | 배포 (Ship + Deploy) |
| Phase 5 | `plugins/bams-plugin/commands/bams/feature/phase-5-finalization.md` | 마무리 (문서 + 회고) |

새 피처 → Phase 0부터. 기존 slug에 PRD 있고 태스크 있으면 → Phase 2부터.
