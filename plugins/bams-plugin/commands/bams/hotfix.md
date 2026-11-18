---
description: 버그 1건 핫픽스 — 재현 → 수정 → 검증 → 배포 (다건이면 `/bams:dev`)
argument-hint: <버그 설명 또는 에러 메시지> [--minimal]
---

# Bams: Hotfix

버그를 진단하고 수정한 뒤, 검증과 배포까지 빠르게 진행하는 핫픽스 파이프라인입니다.

입력: $ARGUMENTS
$ARGUMENTS가 비어있으면 AskUserQuestion으로 버그 설명 받기.

## Steps

> 첫 동작으로 아래 목록을 **원문 그대로** 작업 목록 도구에 등록한다 — `TaskCreate` 항목당 1회(스키마가 없으면 먼저 `ToolSearch` `select:TaskCreate,TaskUpdate`로 로드) 또는 `TodoWrite`(있는 버전). 진행은 `TaskUpdate`/`TodoWrite`로 갱신하고, 건너뛴 step은 지우지 않고 subject/항목 끝에 `— skip: <사유>`를 붙인다 (SSOT: `references/step-status.md` §Steps 체크리스트 규약).

0. Steps 등록 — 이 목록 전체를 작업 목록 도구(TaskCreate/TodoWrite)에 원문 그대로 등록 (첫 동작, skip 불가)
1. Pre-flight + 파이프라인 타입 검증 (`hotfix/preflight.md`)
1-1. Linear 이슈 In Progress 전환 — issue-ops `linear-close-issues` start (요청에 Linear 식별자 없으면 skip)
2. Step 1 버그 재현 + 진단 + 수정 (`hotfix/step-1-diagnose.md`)
3. Step 2 QA 검증 — 브라우저 재현 (`hotfix/step-2-qa.md`, 선택)
4. Step 3 CI/CD 프리플라이트 `/bams:verify` (`hotfix/step-3-4-cicd.md`)
4-1. Linear 이슈 종료 — issue-ops `linear-close-issues` close (식별자 없으면 skip)
5. Step 4 출시 준비 검토 — release-quality-gate (`hotfix/step-3-4-cicd.md`)
6. Step 5 배포 (`hotfix/step-5-deploy.md`, 선택)
7. 개선점 수집 + 자동 회고 (`hotfix/step-finalization.md`)
8. `.crew/history.md` 1줄 기록 + 결과 보고 (skip 목록 포함)

## 경량 경로 (`--minimal`)

`$ARGUMENTS`에 `--minimal`이 포함되어 있는지, 또는 자동 규모 감지 제안을 사용자가 수락했는지에 따라 `--minimal` 축약 모드 여부가 결정됩니다.

**`references/lightweight-path-protocol.md` 참조.** 플래그 인식 + 자동 규모 감지(`git diff --stat` ≤2파일/±30줄) + 스팸 방지(파이프라인당 1회) + 축약 규칙을 표준 프로토콜대로 따릅니다.

차이점: 본 파이프라인 축약 규칙은 SSOT §"hotfix" 목록 적용 (Step 1 진단+수정은 축약 없음).

## Linear 연동 (식별자가 있을 때만)

요청에 Linear 식별자(`BE-123` 형태, `linear.app/…/issue/…` 링크)가 있을 때만 실행한다. 없으면 두 항목 모두 `— skip: Linear 식별자 없음`. 규약 `references/linear-protocol.md` §6·§7. 게이트·파이프라인 상태에는 영향이 없고, 실패는 pending으로 보고만 한다.

**착수 (체크리스트 1-1)** — Pre-flight 직후, Step 1 진단 spawn 전:

Task tool, subagent_type: **"bams-plugin:issue-ops"** — 메인이 직접 호출:
> load_profile: { level: L2, refs: [{doc: config}] }
> mode: start · input: {$ARGUMENTS 원문} · pipeline: {slug} · commit: {git rev-parse HEAD}

`skipped (completed)`(이미 닫힌 이슈)가 오면 다시 고칠지 AskUserQuestion으로 확인한다. 확인된 식별자는 이후 부서장 위임 메시지에 `linear_issues: [..]`로 붙인다.

**종료 (체크리스트 4-1)** — Step 3 `/bams:verify` 통과 직후:

Task tool, subagent_type: **"bams-plugin:issue-ops"** — 메인이 직접 호출:
> load_profile: { level: L2, refs: [{doc: config}] }
> mode: close · input: {착수 때 확인된 식별자} · pipeline: {slug} · flags: --verify "{이번 파이프라인에서 통과한 테스트 명령}"

issue-ops는 수정 커밋·직접 재실행한 검증·머지를 모두 확인할 때만 Done으로 옮긴다. 커밋 전이면 In Progress + `awaiting commit`, PR이 열려 있으면 In Review로 두고, 이후 `/bams:ship`·`/bams:deploy`의 sweep이나 `/bams:issues close`가 마무리한다. 최종 보고에 식별자별 결과를 붙인다.

## 공통 규칙 로드

모든 단계 실행 전 반드시 공통 규칙을 Read합니다:

`commands/bams/hotfix/_common.md`를 Read하여 스킬 로딩, 위임 원칙을 로드합니다.

## 현재 상태 판단

Bash로 진행 추적 파일을 확인합니다:

```bash
_TRACKING=$(ls .crew/artifacts/hotfix/*hotfix*-tracking.md 2>/dev/null | head -1)
if [ -n "$_TRACKING" ]; then
  echo "=== 기존 진행 상태 ==="
  grep -E "current_step:|status:" "$_TRACKING" | head -5
fi
```

기존 추적 파일이 있으면 중단 지점부터 재개합니다.

## Step 라우팅

현재 상태 확인 후, 해당 단계의 서브파일을 Read하여 지시를 따릅니다:

| 단계 | 서브파일 |
|------|---------|
| Pre-flight (최초 시작) | `commands/bams/hotfix/preflight.md` |
| Step 1: 버그 진단 + 수정 | `commands/bams/hotfix/step-1-diagnose.md` |
| Step 2: QA 검증 | `commands/bams/hotfix/step-2-qa.md` |
| Step 3-4: CI/CD + 출시 준비 | `commands/bams/hotfix/step-3-4-cicd.md` |
| Step 5: 배포 | `commands/bams/hotfix/step-5-deploy.md` |
| Finalization: 개선점 + 회고 | `commands/bams/hotfix/step-finalization.md` |

최초 실행이면 `commands/bams/hotfix/preflight.md`를 Read하여 Pre-flight부터 시작합니다.
재개이면 추적 파일의 `current_step` 값에 해당하는 서브파일을 Read하여 계속합니다.

Read한 서브파일의 지시를 따릅니다.
