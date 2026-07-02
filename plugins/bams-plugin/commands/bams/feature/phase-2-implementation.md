# Feature: Phase 2 — 구현 (개발부장 위임)

> `plugins/bams-plugin/commands/bams/_shared/phase-2-implementation.md`를 Read하여 Delta로 치환 실행합니다.

입력: slug · PRD · 설계 · board.md 태스크. config.md 기술스택 + gotchas를 개발 에이전트에 전달.

## Delta 파라미터

| 파라미터 | 값 |
|----------|-----|
| `{PIPELINE_TYPE}` | feature |
| `{STEP_N}` | 4 (멀티에이전트 개발) |
| `{DESIGN_DIRECTOR_MODE}` | `sequential-mandatory` — UI/UX 태스크 있으면 design-director 선행 spawn 강제, 산출물 확보 후 FE 구현 |
| `{CHANGE_CONFIRM_GATE}` | (없음) — `git diff --stat` 표시만 수행 |
| `{STEP_N_HANDOFF}` | 있음 → 구현→검증 핸드오프 실행. "구현까지만" 선택 시 `status: paused_at_step_4` |
| `{GATE_CHECKLIST_ITEMS}` | 배치구현·빌드·타입체크·린트·In Review 이동·핸드오프GO |
| `{NEXT_ROUTING}` | 엔트리포인트가 Phase 3 라우팅 |

Phase 2 완료 → `{NEXT_ROUTING}`.
