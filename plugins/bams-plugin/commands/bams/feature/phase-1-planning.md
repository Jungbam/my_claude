# Feature: Phase 1 — 기획 (기획부장 위임)

> `plugins/bams-plugin/commands/bams/_shared/phase-1-planning.md`를 Read하여 Delta로 치환 실행합니다.

입력: slug · feature_description($ARGUMENTS) · Phase 0 실행계획. PRD/설계 기존 존재 시 해당 Step 스킵.

## Delta 파라미터

| 파라미터 | 값 |
|----------|-----|
| `{PIPELINE_TYPE}` | feature |
| `{STEP_1}` / `{STEP_2}` | 1 / 2 |
| `{STEP_2_LABEL}` | 기술 설계 + 태스크 분해 + 스프린트 |
| `{STEP_2_EXTRA}` | Step `{STEP_2}`-c: 3개 부서장 완료 후 project-governance 직접 spawn(스프린트 설정+board.md+TaskDB 등록). 완료 후 "저장 절차" 생략(겸함), 곧장 핸드오프로 진행 |
| `{STEP_SAVE}` | (없음) — Step 2 흐름에 포함 |
| `{STEP_HANDOFF}` / `{HANDOFF_ID_SUFFIX}` | (없음, Step 2에 통합) / `handoff1` |
| `{HANDOFF_EXTRA_QUESTION}` | "기획까지만" 옵션 → `status: paused_at_step_2` 기록 후 종료 |
| `{GATE_CHECKLIST_ITEMS}` | PRD·설계·태스크분해·스프린트설정·핸드오프GO |
| `{NEXT_FILE_PATH}` | (없음 — 엔트리포인트가 Phase 1.5 라우팅) |

Phase 1 완료 → 엔트리포인트가 Phase 1.5(Git 체크포인트)를 라우팅합니다.
