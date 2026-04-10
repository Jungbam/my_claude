---
description: 멀티에이전트 풀 개발 파이프라인 (기획 -> 구현 -> 테스트 -> 리뷰 -> QG)
argument-hint: <피처 설명 또는 태스크 ID>
---

# Bams Dev

완전한 개발 파이프라인을 **2단 위임 + orchestrator 조언자 모드**로 실행합니다.
커맨드(메인)가 각 Phase에서 pipeline-orchestrator를 조언자로 1회 호출하여 Advisor Response(부서장 라우팅/게이트 조건)를 받고, 메인이 권고된 부서장을 Task tool로 **직접 spawn**합니다. (`_shared_common.md` §위임 원칙 및 부록 루프 B 참조)

```
dev.md (메인) ─ advise ─▶ pipeline-orchestrator (Advisor)
     │
     └─ spawn(직접) ─▶ 부서장 ─▶ (선택) specialist
         [Phase 0] resource-optimizer (전략, 직접 spawn 루프 A)
         [Phase 1] product-strategy(기획부장) → BA/UX/PG
         [Phase 1→2] cross-department-coordinator (핸드오프 조율)
         [Phase 2] FE/BE/devops/data-integration 부서장 (병렬 직접 spawn)
         [Phase 2.5] qa-strategy(QA부장) → automation-qa
         [Phase 3] qa-strategy + product-analytics (병렬)
         [Phase 3.5] project-governance (QG)
         [Phase 4] executive-reporter + 자동 회고
```

> harness 깊이 2 제약: orchestrator는 부서장을 직접 spawn할 수 없고 Advisor Response만 반환합니다. 메인이 그 권고를 파싱하여 직접 부서장을 호출합니다.

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

**공통 규칙 로드**: 반드시 `plugins/bams-plugin/commands/bams/dev/_common.md`를 Read합니다.

### Viz 이벤트: pipeline_start

사전 조건 확인 후, Bash로 다음을 실행합니다:

```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" pipeline_start "{slug}" "dev" "/bams:dev" "{arguments}"
```

## 작업 범위 결정

**$ARGUMENTS가 태스크 ID인 경우 (예: "TASK-001"):**
- `.crew/board.md`에서 해당 태스크 찾기
- 의존성이 모두 `## Done` 섹션에 있는지 확인
- 의존성이 충족되지 않으면 블로킹 태스크 목록을 표시하고 중단
- 이 단일 태스크로 Phase 2 (구현)로 진행

**$ARGUMENTS가 board.md에 태스크가 있는 피처 slug인 경우:**
- 해당 피처의 모든 태스크 수집 (`**Feature**: [slug]` 매칭)
- 해당 태스크들로 Phase 2 (구현)로 진행

**$ARGUMENTS가 새로운 피처 설명인 경우:**
- slug를 생성합니다
- Glob으로 기존 PRD와 설계 문서 검색
- **아티팩트가 존재하면**: "기존 계획 발견" 알림, Phase 2로 진행
- **아티팩트가 없으면** -> Phase 0 (파이프라인 초기화)으로 진행

## Phase 라우팅

현재 상태 또는 $ARGUMENTS 분석 결과에 따라 해당 서브파일을 Read하여 지시를 따릅니다:

| Phase | 서브파일 경로 |
|-------|-------------|
| Phase 0 (초기화) | `plugins/bams-plugin/commands/bams/dev/phase-0-init.md` |
| Phase 1 (기획) | `plugins/bams-plugin/commands/bams/dev/phase-1-planning.md` |
| Phase 1.5 (Git) | `plugins/bams-plugin/commands/bams/dev/phase-1-5-git.md` |
| Phase 2 (구현) | `plugins/bams-plugin/commands/bams/dev/phase-2-implementation.md` |
| Phase 2.5 (테스트) | `plugins/bams-plugin/commands/bams/dev/phase-2-5-test.md` |
| Phase 3 (검증) | `plugins/bams-plugin/commands/bams/dev/phase-3-verification.md` |
| Phase 3.5 (QG) | `plugins/bams-plugin/commands/bams/dev/phase-3-5-quality-gate.md` |
| Phase 4 (마무리) | `plugins/bams-plugin/commands/bams/dev/phase-4-finalization.md` |
| Phase 5 (CLAUDE.md) | `plugins/bams-plugin/commands/bams/dev/phase-5-claude-md.md` |

해당 서브파일을 Read한 뒤, 그 파일의 지시를 따릅니다.
