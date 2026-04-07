# Feature: Phase 4 — 배포

> 이 파일은 `/bams:feature`의 Phase 4를 실행합니다.
> 공통 규칙은 `_common.md`를 참조합니다 (엔트리포인트에서 이미 로드됨).

## 입력 컨텍스트
- slug: {엔트리포인트에서 결정된 slug}
- 이전 Phase 산출물:
  - `.crew/artifacts/review/{slug}-review.md`
  - `.crew/artifacts/qa/{slug}-qa.md`
  - `.crew/artifacts/performance/{slug}-performance.md`
  - `.crew/artifacts/security/{slug}-security.md`
  - Phase 3 게이트 판단: GO / CONDITIONAL-GO

---

**스킬 미설치 시**: Step 9 `skipped` (수동 PR 생성 안내) → Phase 5로.

---

### Step 9. Ship (executive-reporter 보고 + bams ship 스킬)

Bash로 다음을 실행합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_start "{slug}" 9 "Ship" "Phase 4: 배포"
```

pipeline-orchestrator에게 Ship을 지시합니다.

Bash로 agent_start를 emit합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_start "{slug}" "pipeline-orchestrator-9-$(date -u +%Y%m%d)" "pipeline-orchestrator" "sonnet" "Step 9: Ship 위임"
```

서브에이전트 실행 (Task tool, subagent_type: **"bams-plugin:pipeline-orchestrator"**, model: **"sonnet"**):

> **Phase 4 배포 실행 — Ship**
>
> **위임 메시지:**
> ```
> phase: 4
> slug: {slug}
> pipeline_type: feature
> context:
>   all_artifacts: .crew/artifacts/
>   config: .crew/config.md
> ```
>
> **수행할 작업:**
> 1. executive-reporter에게 배포 전 상태 보고 요청:
>    - 전체 Phase 진행 상황 요약
>    - 잔여 리스크 항목 정리
>    - Ship 준비 상태 판단
>
> 2. `_SHIP_SKILL` 실행: 베이스 머지 → 테스트 → 리뷰 → 버전범프 → CHANGELOG → PR 생성
>
> **기대 산출물**: PR 번호, Ship 결과 보고

orchestrator 반환 후, Bash로 agent_end를 emit합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_end "{slug}" "pipeline-orchestrator-9-$(date -u +%Y%m%d)" "pipeline-orchestrator" "success" {duration_ms} "Step 9 완료: Ship 완료"
```

AskUserQuestion — "PR 생성됨. 즉시 배포?"
- **나중에 (Recommended)**
- **배포** — Step 10 실행.

Step 9 완료 시, Bash로 다음을 실행합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" 9 "{status}" {duration_ms}
```

---

### Step 10. Land & Deploy (선택)

Bash로 다음을 실행합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_start "{slug}" 10 "Land & Deploy" "Phase 4: 배포"
```

배포 전 체크리스트 확인: (1) PR 머지 완료, (2) CI 통과, (3) Step 4-8 검증 통과.
모두 통과 시 `_DEPLOY_SKILL` 실행.

Step 10 완료 시, Bash로 다음을 실행합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" 10 "{status}" {duration_ms}
```
