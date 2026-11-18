---
description: 멀티에이전트 풀 개발 (기획 → 구현 → 테스트 → 리뷰 → QG). 다건 버그 묶음 처리 가능
argument-hint: <피처 설명 또는 태스크 ID> [--minimal]
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
         [Phase 4] 마무리(보드/히스토리 정리) + 자동 회고
```

> harness 깊이 2 제약: orchestrator는 부서장을 직접 spawn할 수 없고 Advisor Response만 반환합니다. 메인이 그 권고를 파싱하여 직접 부서장을 호출합니다.

입력: $ARGUMENTS

$ARGUMENTS가 비어있으면, 사용자에게 무엇을 개발할지 물어보고 중단합니다.

## Steps

> 첫 동작으로 아래 목록을 **원문 그대로** 작업 목록 도구에 등록한다 — `TaskCreate` 항목당 1회(스키마가 없으면 먼저 `ToolSearch` `select:TaskCreate,TaskUpdate`로 로드) 또는 `TodoWrite`(있는 버전). 진행은 `TaskUpdate`/`TodoWrite`로 갱신하고, 건너뛴 step은 지우지 않고 subject/항목 끝에 `— skip: <사유>`를 붙인다 (SSOT: `references/step-status.md` §Steps 체크리스트 규약).

0. Steps 등록 — 이 목록 전체를 작업 목록 도구(TaskCreate/TodoWrite)에 원문 그대로 등록 (첫 동작, skip 불가)
1. 코드 최신화 + 사전 조건 + 공통 규칙 로드 + 작업 범위 결정
1-1. Linear 이슈 In Progress 전환 — issue-ops `linear-close-issues` start (요청에 Linear 식별자 없으면 skip)
2. Phase 0 파이프라인 초기화 (dev-hotfix면 `mode-hotfix-init.md` 포함)
3. Phase 1 기획 (dev-hotfix 모드면 skip)
4. Phase 1.5 Git 체크포인트
5. Phase 2 구현 — 부서장 병렬 spawn
6. Phase 2.5 테스트 코드 생성
7. Phase 3 검증 — 리뷰 + 성과 평가
8. Phase 3.5 Quality Gate (최대 3회)
8-1. Linear 이슈 종료 — issue-ops `linear-close-issues` close (식별자 없거나 QG 미통과면 skip)
9. Phase 4 마무리 + 자동 회고
10. Phase 5 상태 기록 + `.crew/history.md` 1줄 + 최종 요약 (skip 목록 포함)

## 코드 최신화

**`references/preflight-protocol.md` §배치 0(코드 최신화) 참조.** 표준 프로토콜을 따릅니다.

차이점: 없음.

## 경량 경로 (`--minimal`)

`$ARGUMENTS`에 `--minimal`이 포함되어 있는지, 또는 자동 규모 감지 제안을 사용자가 수락했는지에 따라 `--minimal` 축약 모드 여부가 결정됩니다.

**`references/lightweight-path-protocol.md` 참조.** 플래그 인식 + 자동 규모 감지(`git diff --stat` ≤2파일/±30줄) + 스팸 방지(파이프라인당 1회) + 축약 규칙을 표준 프로토콜대로 따릅니다.

차이점: 본 파이프라인 축약 규칙은 SSOT §"dev" 표 적용.

## 사전 조건

Glob으로 `.crew/config.md`가 존재하는지 확인합니다. 없으면:
- 출력: "프로젝트가 초기화되지 않았습니다. `/bams:init`을 실행하여 설정하세요."
- 여기서 중단.

`.crew/config.md`와 `.crew/board.md`(활성 섹션만 — Backlog/In Progress/In Review)를 읽습니다.

**공통 규칙 로드**: 반드시 `plugins/bams-plugin/commands/bams/dev/_common.md`를 Read합니다.

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

**$ARGUMENTS가 멀티이슈 hotfix 목록인 경우 (dev-hotfix 모드):**
- 입력에 2건 이상의 버그/이슈가 포함된 경우 (줄바꿈 구분, 번호 목록, retro Problem 참조 등)
- 또는 hotfix에서 "배치 dev" 전환으로 진입한 경우
- pipeline_type을 `dev-hotfix`로 설정
- Phase 0(초기화) 실행 후 `plugins/bams-plugin/commands/bams/dev/mode-hotfix-init.md`를 Read
- Phase 1(기획) 생략 → Phase 1.5(Git) → Phase 2(구현)으로 진행

## Linear 연동 (식별자가 있을 때만)

요청에 Linear 식별자(`BE-123` 형태, `linear.app/…/issue/…` 링크)가 있을 때만 실행한다. 없으면 두 항목 모두 `— skip: Linear 식별자 없음`. 규약 `references/linear-protocol.md` §6·§7. 게이트·파이프라인 상태에는 영향이 없고, 실패는 pending으로 보고만 한다.

**착수 (체크리스트 1-1)** — 작업 범위 결정 직후, Phase 0 전:

Task tool, subagent_type: **"bams-plugin:issue-ops"** — 메인이 직접 호출:
> load_profile: { level: L2, refs: [{doc: config}] }
> mode: start · input: {$ARGUMENTS 원문} · pipeline: {slug} · commit: {git rev-parse HEAD}

`skipped (completed)`(이미 닫힌 이슈)가 오면 다시 고칠지 AskUserQuestion으로 확인한다. 확인된 식별자는 이후 부서장 위임 메시지에 `linear_issues: [..]`로 붙인다.

**종료 (체크리스트 8-1)** — Phase 3.5 Quality Gate PASS 직후:

Task tool, subagent_type: **"bams-plugin:issue-ops"** — 메인이 직접 호출:
> load_profile: { level: L2, refs: [{doc: config}] }
> mode: close · input: {착수 때 확인된 식별자} · pipeline: {slug} · flags: --verify "{이번 파이프라인에서 통과한 테스트 명령}"

issue-ops는 수정 커밋·직접 재실행한 검증·머지를 모두 확인할 때만 Done으로 옮긴다. 커밋 전이면 In Progress + `awaiting commit`, PR이 열려 있으면 In Review로 두고, 이후 `/bams:ship`·`/bams:deploy`의 sweep이나 `/bams:issues close`가 마무리한다. 최종 보고에 식별자별 결과를 붙인다.

## Phase 라우팅

현재 상태 또는 $ARGUMENTS 분석 결과에 따라 해당 서브파일을 Read하여 지시를 따릅니다:

| Phase | 서브파일 경로 |
|-------|-------------|
| Phase 0 (초기화) | `plugins/bams-plugin/commands/bams/dev/phase-0-init.md` |
| Phase 0.8~0.95 (dev-hotfix 초기화) | `plugins/bams-plugin/commands/bams/dev/mode-hotfix-init.md` |
| Phase 1 (기획) | `plugins/bams-plugin/commands/bams/dev/phase-1-planning.md` |
| Phase 1.5 (Git) | `plugins/bams-plugin/commands/bams/dev/phase-1-5-git.md` |
| Phase 2 (구현) | `plugins/bams-plugin/commands/bams/dev/phase-2-implementation.md` |
| Phase 2.5 (테스트) | `plugins/bams-plugin/commands/bams/dev/phase-2-5-test.md` |
| Phase 3 (검증) | `plugins/bams-plugin/commands/bams/dev/phase-3-verification.md` |
| Phase 3.5 (QG) | `plugins/bams-plugin/commands/bams/dev/phase-3-5-quality-gate.md` |
| Phase 4 (마무리) | `plugins/bams-plugin/commands/bams/dev/phase-4-finalization.md` |
| Phase 5 (상태 기록 위임) | `plugins/bams-plugin/commands/bams/dev/phase-5-claude-md.md` |

해당 서브파일을 Read한 뒤, 그 파일의 지시를 따릅니다.
