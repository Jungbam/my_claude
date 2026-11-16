---
description: 배포 — 출시 검증 + Land & Deploy
argument-hint:
---

# Bams: Deploy

배포 워크플로우를 실행합니다. 출시 준비 검증 후 배포를 진행합니다.

## Pre-flight

**공통 규칙 로드**: 반드시 `plugins/bams-plugin/commands/bams/_shared_common.md`를 Read합니다.

bams-plugin 스킬 로딩:

```bash
_BAMS=$(sed -n '/"bams-plugin@my-claude"/,/"installPath"/s/.*"installPath": *"\([^"]*\)".*/\1/p' ~/.claude/plugins/installed_plugins.json 2>/dev/null); [ -d "$_BAMS" ] || _BAMS=$(ls -dt ~/.claude/plugins/cache/*/bams-plugin/*/ 2>/dev/null | head -1); _BAMS=${_BAMS%/}; _DEPLOY_SKILL="$_BAMS/skills/land-and-deploy/SKILL.md"; [ -e "$_DEPLOY_SKILL" ] || _DEPLOY_SKILL=""
```

스킬 파일이 없으면 에러 메시지 후 중단.

### Verdict 확인 (SHA 결합 판정)

```bash
_BAMS=$(sed -n '/"bams-plugin@my-claude"/,/"installPath"/s/.*"installPath": *"\([^"]*\)".*/\1/p' ~/.claude/plugins/installed_plugins.json 2>/dev/null); [ -d "$_BAMS" ] || _BAMS=$(ls -dt ~/.claude/plugins/cache/*/bams-plugin/*/ 2>/dev/null | head -1); _BAMS=${_BAMS%/}; _VD="$_BAMS/hooks/lib/verdict.sh"; [ -e "$_VD" ] || _VD=""; [ -z "$_VD" ] && _VD=$(find . -path "*/bams-plugin/hooks/lib/verdict.sh" 2>/dev/null | head -1)
[ -n "$_VD" ] && bash "$_VD" check; echo "verdict_exit=$?"
```

규약: `references/verdict-protocol.md` §4. 배포할 커밋에 맞는 PASS verdict가 있어야 Step 3 진행 — 머지 전이면 PR 브랜치에서 그대로 실행(HEAD = PR head), 이미 머지된 뒤 시작했다면 `bash "$_VD" check --sha <PR head sha>`(`gh pr view <N> --json headRefOid`)로 확인한다(머지 후 base HEAD는 sha·patch-id가 PR과 달라 매칭되지 않는다). exit 3(FAIL) = 중단·실패 기록. exit 1·4 = Step 1의 release-quality-gate가 판정·기록(구현자와 다른 `model`, Codex 우선)한 뒤 재확인, 그래도 exit≠0이면 배포 중단(deploy N=0). MCP 배포 도구(ezar-infra 등)·배포 스크립트는 `hooks/verdict-gate.sh`가 보지 못하므로 이 확인이 유일한 게이트다.

### ezar-infra MCP 경로 판별

ezar 서비스는 ezar-infra MCP(Bitbucket Pipelines + ArgoCD)로 배포 상태를 확인한다. 도구 맵·안전 규칙 SSOT:

```bash
_BAMS=$(sed -n '/"bams-plugin@my-claude"/,/"installPath"/s/.*"installPath": *"\([^"]*\)".*/\1/p' ~/.claude/plugins/installed_plugins.json 2>/dev/null); [ -d "$_BAMS" ] || _BAMS=$(ls -dt ~/.claude/plugins/cache/*/bams-plugin/*/ 2>/dev/null | head -1); _BAMS=${_BAMS%/}; _EZ_REF="$_BAMS/references/ezar-infra-deploy.md"; [ -e "$_EZ_REF" ] || _EZ_REF=""; [ -z "$_EZ_REF" ] && _EZ_REF=$(find . -path "*/bams-plugin/references/ezar-infra-deploy.md" 2>/dev/null | head -1)
```

1. `ToolSearch("+ezar-infra")`로 `mcp__ezar-infra__*` 스키마 로드 → `common_whoami` 성공 확인.
2. `git remote get-url origin`의 repo 이름을 `common_service_list`에서 매칭 → `dev_service_catalog`로 체인 확인 (서비스명 추측 금지, 후보 복수면 사용자 선택).
3. 둘 다 성공 → `EZAR_MODE=on` (서비스명·env 기록, `_EZ_REF` Read). 하나라도 실패 → `EZAR_MODE=off`, 아래 기존 플로우 그대로.

**안전 규칙 (EZAR_MODE=on)**: mutating 도구(`dev_build_trigger`/`dev_restart`/`dev_rollback`/`common_operation_cancel`)는 사용자 명시 확인 없이 호출 금지 · `dev_approval_decide`는 preview를 사용자에게 보여주고 OK 받은 뒤에만 `confirm_code` · 시크릿 값 취급 금지(`dev_secret_set` 링크만 전달).

## Step 1-2: 배포 전 검증 + 인프라 점검 (병렬 실행)

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

**EZAR_MODE=on**: 두 에이전트 위임 메시지에 서비스명·env·`_EZ_REF` 경로를 포함한다. release-quality-gate는 `dev_pr_list`(PR 상태)·`dev_build_status`(최근 빌드), platform-devops는 `dev_deploy_status`(Synced/Healthy, 배포 tag vs 최신 빌드 tag)·`dev_deploy_history`(롤백 후보 tag 확보)로 점검한다. 모두 read 도구만 사용.

**두 결과를 모두 수집한 후**, 어느 하나라도 FAIL이면 배포를 중단합니다. 둘 다 통과해도 `bash "$_VD" check`가 exit 0이 아니면 중단합니다(release-quality-gate는 PASS/FAIL 판정 시 verdict 파일을 남긴다 — `agents/release-quality-gate.md` RQG-VERDICT).

**`references/issue-severity.md` §Release Gate 임계값 참조.**

차이점: 본 파이프라인 N값 = **0** (deploy override — 배포 직전은 Major도 0. SSOT §파이프라인별 Override 확인).

## Step 3: 배포 실행

`_DEPLOY_SKILL`의 지시에 따라 Land & Deploy를 실행합니다.

**EZAR_MODE=on**: 배포 = PR 머지(readiness gate 확인 후). 머지 후 30초 간격으로 `dev_build_status`(`build-deploy-<env>` 성공) → `dev_deploy_status`(ArgoCD Synced + Healthy, 배포 image tag == 최신 빌드 tag)까지 폴링, 20분 초과 시 사용자에게 계속 여부 확인. `dev_build_trigger`는 사용자가 재배포를 명시 요청하고 확인한 경우에만.

## Step 4: 배포 후 확인

- 배포 상태 모니터링
- 헬스체크 결과 확인
- 이상 징후 시 롤백 옵션 제공

**EZAR_MODE=on**: `dev_deploy_status` + `dev_pods`(Running/Ready, 재시작 급증 없음)로 검증한다. 실패 시 `dev_analyze_deploy_failure`(+`dev_pod_logs`/`dev_build_log`)로 원인을 보고한다. 롤백은 **사용자에게 먼저 묻고** 승인 시 `dev_rollback`(`to_tag`는 `dev_deploy_history`의 `image_tag`) — prod는 승인 Operation이 생성되므로 `common_operation_get`으로 추적하며 Slack/UI 승인 대기를 안내한다.

## 마무리

완료 시 `.crew/history.md`에 1줄 기록합니다:
`YYYY-MM-DD | {slug} | deploy | {완료|실패} | {한 줄 요약}`
