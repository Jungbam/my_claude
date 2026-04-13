# Dev: Phase 1.5 — Git 체크포인트

> 이 파일은 `/bams:dev`의 Phase 1.5를 실행합니다.
> 공통 규칙은 `_common.md`를 참조합니다.

## 입력 컨텍스트
- slug: {엔트리포인트에서 결정된 slug}
- 이전 Phase 산출물: 없음 (구현 시작 직전 체크포인트)

---

## Phase 1.5: Git 체크포인트

Bash로 step_start를 emit합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_start "{slug}" 5 "Git 체크포인트" "Phase 1.5: Git"
```

**AskUserQuestion**으로 체크포인트 방식을 선택받습니다:

Question: "구현 시작 전 코드를 어떻게 보존할까요?"
Header: "Git"
Options:
- **Feature branch** - "새 브랜치를 생성하여 작업 (예: bams/{slug})"
- **Stash** - "현재 변경사항을 stash하고 현재 브랜치에서 작업"
- **스킵** - "체크포인트 없이 바로 진행"

선택 결과에 따라:
- **Feature branch 선택 시**: Bash로 `git checkout -b bams/{slug}` 실행
- **Stash 선택 시**: Bash로 `git stash push -m "bams/{slug} 작업 전 체크포인트"` 실행
- **스킵 선택 시**: 바로 Phase 2로 진행

완료 후 step_end를 emit합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" 5 "{status}" {duration_ms}
```

Phase 2 (구현)로 진행합니다.
