# Dev: Phase 2 — 구현 (Step 6)

> `plugins/bams-plugin/commands/bams/_shared/phase-2-implementation.md`를 Read하여 Delta로 치환 실행합니다.

입력: slug · `.crew/artifacts/prd/{slug}-prd.md` · `.crew/artifacts/design/{slug}-design.md` · `.crew/board.md` · Phase 0 모델 전략

## Delta 파라미터

| 파라미터 | 값 |
|----------|-----|
| `{PIPELINE_TYPE}` | dev |
| `{STEP_N}` | 6 (멀티에이전트 구현) |
| `{DESIGN_DIRECTOR_MODE}` | `parallel-optional` — 부서장 병렬 spawn 후 FE 태스크 있을 때만 design-director 병렬 추가 호출(비용 최적화) |
| `{CHANGE_CONFIRM_GATE}` | 있음 — 배치 완료마다 AskUserQuestion(적용/되돌리기/부분 되돌리기) |
| `{STEP_N_HANDOFF}` | (없음) → `phase-2-5-test.md`가 검증 이어받음, 여기서 즉시 step_end emit |
| `{GATE_CHECKLIST_ITEMS}` | 배치구현·빌드·타입체크·린트·In Review 이동 |
| `{NEXT_ROUTING}` | `dev/phase-2-5-test.md`를 Read |

Phase 2 완료 → `{NEXT_ROUTING}`.
