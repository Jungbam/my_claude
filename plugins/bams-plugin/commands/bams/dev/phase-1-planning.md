# Dev: Phase 1 — 기획 (PRD + 기술 설계 + 태스크 분해)

> `plugins/bams-plugin/commands/bams/_shared/phase-1-planning.md`를 Read하여 Delta로 치환 실행합니다. 기존 계획 없을 때만 실행.

입력: slug(엔트리포인트) · feature_description($ARGUMENTS) · `.crew/config.md` · `.crew/board.md`

## Delta 파라미터

| 파라미터 | 값 |
|----------|-----|
| `{PIPELINE_TYPE}` | dev |
| `{STEP_1}` / `{STEP_2}` | 1 / 2 |
| `{STEP_2_LABEL}` | 기술 설계 + 태스크 분해 |
| `{STEP_2_EXTRA}` | (없음) → 저장 절차는 별도 Step `{STEP_SAVE}`로 실행 |
| `{STEP_SAVE}` | 3 (별도 step, 아티팩트 저장) |
| `{STEP_HANDOFF}` / `{HANDOFF_ID_SUFFIX}` | 4 / `4` (별도 step, 숫자 기반 call_id) |
| `{HANDOFF_EXTRA_QUESTION}` | (없음) → 기본 진행/중단 문구만 |
| `{GATE_CHECKLIST_ITEMS}` | PRD·설계·태스크분해·사용자승인·핸드오프GO |
| `{NEXT_FILE_PATH}` | `dev/phase-1-5-git.md` |

Phase 1 완료 → `{NEXT_FILE_PATH}`를 Read합니다.
