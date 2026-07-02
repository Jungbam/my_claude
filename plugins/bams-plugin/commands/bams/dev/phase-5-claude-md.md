# Dev: Phase 5 — CLAUDE.md 상태 업데이트 (Step 11)

> 이 파일은 `/bams:dev`의 Phase 5를 실행합니다.
> 공통 규칙은 `_common.md`를 참조합니다.

## 입력 컨텍스트
- slug: {엔트리포인트에서 결정된 slug}
- 이전 Phase 산출물: `.crew/board.md`, 이번 실행에서 생성된 아티팩트 경로 목록

---

## Phase 5: CLAUDE.md 상태 업데이트

Bash로 다음을 실행합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_start "{slug}" 11 "CLAUDE.md 상태 업데이트" "Phase 5: 상태 업데이트"
```

### Step 11. CLAUDE.md 업데이트

`CLAUDE.md`의 `## Bams 현재 상태` 섹션을 업데이트합니다 (없으면 파일 끝에 추가, 있으면 Edit으로 교체). `.crew/board.md`를 읽어 다음을 포함:
- 마지막 업데이트 타임스탬프
- 진행 중인 작업
- 활성 스프린트 정보
- 이번 실행에서 생성된 아티팩트 경로
- 다음에 실행 가능한 태스크/명령 제안

Step 11 완료 시, Bash로 다음을 실행합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" 11 "done" {duration_ms}
```

### Viz 이벤트: pipeline_end

파이프라인 종료 시, Bash로 다음을 실행합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" pipeline_end "{slug}" "{status}" {total} {completed} {failed} {skipped}
```
(`{status}`는 `completed` / `paused` / `failed` 중 하나, `{total}`은 12)

**카운터 규칙**: 셸 변수는 Bash 호출 간 유지되지 않으므로 카운터 변수를 사용하지 않는다. `{total}=12`이며 `{completed}/{failed}/{skipped}`는 이 대화에서 실제 완료/실패/스킵된 step 수를 세어 **리터럴 숫자로 직접 기입**한다.

### completion-protocol 참조

파이프라인 완료 후 후속 처리가 필요한 경우 `references/completion-protocol.md`를 참조합니다.

### 다음 단계 안내 + 회고 중복 방지

pipeline_end emit 후 반드시 다음 단계를 사용자에게 출력합니다:
- **정상 완료**(status=completed): "다음: `/bams:ship {slug}`"
- **실패 잔존**(status=failed 또는 QG iteration>3로 미해결 이슈 존재): "다음: `/bams:hotfix {slug}`"

completion-protocol Step 4.95 중복 방지: Phase 4의 내장 회고(Step 10b)가 이미 수행되었으므로, Step 4.95에서 `/bams:retro` 제안 시 "내장 회고 완료됨"을 명시하고 중복 실행하지 않는다 (사용자가 별도 심층 회고를 원할 때만 실행).
