# Hotfix: Step 3-4 — CI/CD 프리플라이트 + 출시 준비 검토

> 이 파일은 `/bams:hotfix`의 Step 3-4를 실행합니다.
> 공통 규칙은 `_common.md`를 참조합니다 (엔트리포인트에서 이미 로드됨).

## 입력 컨텍스트

- slug: {엔트리포인트에서 결정된 slug}
- fix_artifacts: `.crew/artifacts/hotfix/{slug}-triage.md` (Step 1 산출물)
- _SHIP_SKILL: 공통 규칙에서 로드된 Ship 스킬 경로

---

## Step 3-4: CI/CD 프리플라이트 + 출시 준비 검토 (오버랩)

Bash로 다음을 실행합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_start "{slug}" 3 "CI/CD 프리플라이트" "Phase 3: 배포 준비"
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_start "{slug}" 4 "출시 준비 검토" "Phase 3: 배포 준비"
```

### Step 3 — CI/CD 프리플라이트

Bash로 agent_start를 emit합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_start "{slug}" "pipeline-orchestrator-3-$(date -u +%Y%m%d)" "pipeline-orchestrator" "sonnet" "Step 3: CI/CD 프리플라이트 위임"
```

pipeline-orchestrator에게 CI/CD 검증을 지시합니다. orchestrator는 개발부장에게 `/bams:verify` 실행을 위임합니다. FAIL 시 자동 수정(최대 2회) / 수동 / 무시.

orchestrator 반환 후, Bash로 agent_end를 emit합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_end "{slug}" "pipeline-orchestrator-3-$(date -u +%Y%m%d)" "pipeline-orchestrator" "success" {duration_ms} "Step 3 완료: CI/CD 검증 완료"
```

### Step 4 — 출시 준비 검토 (Step 3 PASS 시)

**스킬 미설치 시**: "수동 PR 생성" 안내 후 `skipped`.

Bash로 agent_start를 emit합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_start "{slug}" "pipeline-orchestrator-4-$(date -u +%Y%m%d)" "pipeline-orchestrator" "sonnet" "Step 4: 출시 준비 검토 위임"
```

pipeline-orchestrator에게 출시 준비 검토를 지시합니다. orchestrator는 qa-strategy(QA부장)에게 release-quality-gate 실행을 위임합니다.

**최적화**: verify PASS 판정이 나오면 release-quality-gate는 verify 결과를 기다리지 않고 즉시 코드 리뷰 기반 검토를 시작합니다. verify 결과는 RQG에 후속 전달됩니다.

orchestrator 반환 후, Bash로 agent_end를 emit합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_end "{slug}" "pipeline-orchestrator-4-$(date -u +%Y%m%d)" "pipeline-orchestrator" "success" {duration_ms} "Step 4 완료: 출시 준비 검토 완료"
```

AskUserQuestion — "PR을 생성할까요?"
- **Ship (Recommended)** — `_SHIP_SKILL` 실행
- **나중에** — `status: paused_at_step_4` 기록 후 종료.

Step 3-4 완료 시, Bash로 다음을 실행합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" 3 "{status}" {duration_ms}
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" 4 "{status}" {duration_ms}
```

---

## Step 3-4 게이트 조건

- [ ] CI/CD 프리플라이트 PASS (또는 수동 무시)
- [ ] release-quality-gate 완료 (또는 skipped)
- [ ] PR 생성 완료 (또는 paused_at_step_4)

Step 3-4 완료 → 엔트리포인트가 Step 5를 라우팅합니다.
