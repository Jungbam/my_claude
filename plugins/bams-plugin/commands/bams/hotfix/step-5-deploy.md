# Hotfix: Step 5 — 배포

> 이 파일은 `/bams:hotfix`의 Step 5를 실행합니다.
> 공통 규칙은 `_common.md`를 참조합니다 (엔트리포인트에서 이미 로드됨).

## 입력 컨텍스트

- slug: {엔트리포인트에서 결정된 slug}
- _DEPLOY_SKILL: 공통 규칙에서 로드된 Deploy 스킬 경로

---

## Step 5: 배포 (bams deploy 스킬, 선택)

Bash로 다음을 실행합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_start "{slug}" 5 "배포" "Phase 4: 배포"
```

Bash로 agent_start를 emit합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_start "{slug}" "pipeline-orchestrator-5-$(date -u +%Y%m%d)" "pipeline-orchestrator" "sonnet" "Step 5: 배포 환경 점검 위임"
```

pipeline-orchestrator에게 배포 환경 점검을 지시합니다. orchestrator는 개발부장을 통해 `platform-devops` 에이전트로 배포 환경을 점검합니다.

orchestrator 반환 후, Bash로 agent_end를 emit합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_end "{slug}" "pipeline-orchestrator-5-$(date -u +%Y%m%d)" "pipeline-orchestrator" "success" {duration_ms} "Step 5 완료: 배포 환경 점검 완료"
```

AskUserQuestion — "즉시 배포할까요?"
- **나중에 (Recommended)**
- **배포** — `_DEPLOY_SKILL` 실행

Step 5 완료 시, Bash로 다음을 실행합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" 5 "{status}" {duration_ms}
```

---

## Step 5 게이트 조건

- [ ] 배포 환경 점검 완료
- [ ] 배포 실행 완료 (또는 나중에 처리)

Step 5 완료 → 엔트리포인트가 Finalization을 라우팅합니다.
