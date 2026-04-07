---
description: 버그 핫픽스 — 디버깅 → QA → 검증 → 배포 빠른 경로
argument-hint: <버그 설명 또는 에러 메시지>
---

# Bams: Hotfix

버그를 진단하고 수정한 뒤, 검증과 배포까지 빠르게 진행하는 핫픽스 파이프라인입니다.

입력: $ARGUMENTS
$ARGUMENTS가 비어있으면 AskUserQuestion으로 버그 설명 받기.

## 공통 규칙 로드

모든 단계 실행 전 반드시 공통 규칙을 Read합니다:

`commands/bams/hotfix/_common.md`를 Read하여 스킬 로딩, Viz 이벤트 규칙, 위임 원칙, TaskDB 연동 규칙을 로드합니다.

## 현재 상태 판단

Bash로 진행 추적 파일을 확인합니다:

```bash
_TRACKING=$(ls .crew/artifacts/pipeline/*hotfix*-tracking.md 2>/dev/null | head -1)
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
