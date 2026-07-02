---
description: 배포 — 출시 검증 + Land & Deploy
argument-hint:
---

# Bams: Deploy

배포 워크플로우를 실행합니다. 출시 준비 검증 후 배포를 진행합니다.

## Pre-flight

**공통 규칙 로드**: 반드시 `plugins/bams-plugin/commands/bams/_shared_common.md`를 Read합니다.

### Viz 이벤트: pipeline_start

사전 조건 확인 후, Bash로 다음을 실행합니다:

```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1)
[ -n "$_EMIT" ] && bash "$_EMIT" recover "{slug}"
[ -n "$_EMIT" ] && bash "$_EMIT" pipeline_start "{slug}" "deploy" "/bams:deploy" "{arguments}"
```

bams-plugin 스킬 로딩:

```bash
_DEPLOY_SKILL=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/skills/land-and-deploy/SKILL.md" 2>/dev/null | head -1)
```

스킬 파일이 없으면 에러 메시지 후 중단.

## Step 1-2: 배포 전 검증 + 인프라 점검 (병렬 실행)

Bash로 step_start + 2개의 agent_start를 일괄 emit:
```bash
[ -n "$_EMIT" ] && bash "$_EMIT" step_start "{slug}" 1 "배포 전 검증" "Deploy"
[ -n "$_EMIT" ] && bash "$_EMIT" step_start "{slug}" 2 "인프라 점검" "Deploy"
[ -n "$_EMIT" ] && bash "$_EMIT" agent_start "{slug}" "release-quality-gate-1-$(date -u +%Y%m%d)" "release-quality-gate" "claude-fable-5" "Step 1: 배포 전 체크리스트"
[ -n "$_EMIT" ] && bash "$_EMIT" agent_start "{slug}" "platform-devops-2-$(date -u +%Y%m%d)" "platform-devops" "claude-opus-4-8" "Step 2: 배포 대상 환경 점검"
```

**두 에이전트를 동시에 실행합니다:**

**Step 1 — release-quality-gate 에이전트:**
배포 전 체크리스트를 확인합니다.
- PR 머지 완료 여부
- CI 파이프라인 통과 여부
- 모든 검증 단계 통과 여부

**Step 2 — platform-devops 에이전트:**
배포 대상 환경을 점검합니다.
- 배포 대상 환경 상태
- 롤백 계획 확인
- 모니터링 준비 상태

**두 결과를 모두 수집한 후**, 어느 하나라도 FAIL이면 배포를 중단합니다.

**`references/issue-severity.md` §Release Gate 임계값 참조.**

차이점: 본 파이프라인 N값 = **0** (deploy override — 배포 직전은 Major도 0. SSOT §파이프라인별 Override 확인).

Bash로 2개의 agent_end + step_end를 일괄 emit:
```bash
[ -n "$_EMIT" ] && bash "$_EMIT" agent_end "{slug}" "release-quality-gate-1-$(date -u +%Y%m%d)" "release-quality-gate" "{success|error}" "$(( $([ -n "$_EMIT" ] && bash "$_EMIT" now_ms || echo 0) - {agent_start_ms} ))" "배포 전 체크리스트 완료"
[ -n "$_EMIT" ] && bash "$_EMIT" agent_end "{slug}" "platform-devops-2-$(date -u +%Y%m%d)" "platform-devops" "{success|error}" "$(( $([ -n "$_EMIT" ] && bash "$_EMIT" now_ms || echo 0) - {agent_start_ms} ))" "인프라 점검 완료"
[ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" 1 "{done|fail}" "$(( $([ -n "$_EMIT" ] && bash "$_EMIT" now_ms || echo 0) - {step_start_ms} ))"
[ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" 2 "{done|fail}" "$(( $([ -n "$_EMIT" ] && bash "$_EMIT" now_ms || echo 0) - {step_start_ms} ))"
```

## Step 3: 배포 실행

Bash로 step_start emit:
```bash
[ -n "$_EMIT" ] && bash "$_EMIT" step_start "{slug}" 3 "배포 실행" "Deploy"
```

`_DEPLOY_SKILL`의 지시에 따라 Land & Deploy를 실행합니다.

Bash로 step_end emit:
```bash
[ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" 3 "{done|fail}" "$(( $([ -n "$_EMIT" ] && bash "$_EMIT" now_ms || echo 0) - {step_start_ms} ))"
```

## Step 4: 배포 후 확인

Bash로 step_start emit:
```bash
[ -n "$_EMIT" ] && bash "$_EMIT" step_start "{slug}" 4 "배포 후 확인" "Deploy"
```

- 배포 상태 모니터링
- 헬스체크 결과 확인
- 이상 징후 시 롤백 옵션 제공

Bash로 step_end emit:
```bash
[ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" 4 "{done|fail}" "$(( $([ -n "$_EMIT" ] && bash "$_EMIT" now_ms || echo 0) - {step_start_ms} ))"
```

### Viz 이벤트: pipeline_end

파이프라인 종료 시, Bash로 다음을 실행합니다:
```bash
[ -n "$_EMIT" ] && bash "$_EMIT" pipeline_end "{slug}" "{status}" {total} {completed} {failed} {skipped}
```
(`{status}`는 `completed` / `paused` / `failed` 중 하나, `{total}`은 4. `{completed}`/`{failed}`는 리터럴 숫자로 직접 기입한다 — 셸 변수는 Bash 호출 간 비영속이므로 대화 컨텍스트에서 추적한 값을 그대로 써넣는다.)
