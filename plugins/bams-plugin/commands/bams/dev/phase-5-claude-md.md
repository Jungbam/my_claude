# Dev: Phase 5 — CLAUDE.md 상태 업데이트

> 이 파일은 `/bams:dev`의 Phase 5를 실행합니다.
> 공통 규칙은 `_common.md`를 참조합니다.

## 입력 컨텍스트
- slug: {엔트리포인트에서 결정된 slug}
- 이전 Phase 산출물: `.crew/board.md`, 이번 실행에서 생성된 아티팩트 경로 목록

---

## Phase 5: CLAUDE.md 상태 업데이트

Bash로 다음을 실행합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_start "{slug}" 10 "CLAUDE.md 상태 업데이트" "Phase 5: 상태 업데이트"
```

### Step 10. CLAUDE.md 업데이트

`CLAUDE.md`의 `## Bams 현재 상태` 섹션을 업데이트합니다 (없으면 파일 끝에 추가, 있으면 Edit으로 교체). `.crew/board.md`를 읽어 다음을 포함:
- 마지막 업데이트 타임스탬프
- 진행 중인 작업
- 활성 스프린트 정보
- 이번 실행에서 생성된 아티팩트 경로
- 다음에 실행 가능한 태스크/명령 제안

Step 10 완료 시, Bash로 다음을 실행합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" 10 "done" {duration_ms}
```

### Viz 이벤트: pipeline_end

파이프라인 종료 시, Bash로 다음을 실행합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" pipeline_end "{slug}" "{status}" {total} {completed} {failed} {skipped}
```
(`{status}`는 `completed` / `paused` / `failed` 중 하나, `{total}`은 10)

### completion-protocol 참조

파이프라인 완료 후 후속 처리가 필요한 경우 `.crew/references/completion-protocol.md`를 참조합니다.
