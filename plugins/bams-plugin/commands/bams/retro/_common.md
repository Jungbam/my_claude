# Retro: 공통 규칙

> 이 파일은 `/bams:retro` 파이프라인의 공통 규칙을 정의합니다.
> 엔트리포인트(`retro.md`)에서 모든 Phase 실행 전 Read하여 로드합니다.

---

## 공통 규칙 로드

**반드시 `plugins/bams-plugin/commands/bams/_shared_common.md`를 Read하여 공통 규칙을 로드합니다.**

---

## 산출물 경로 상수

모든 Phase에서 다음 경로 상수를 사용합니다:

| 상수 | 경로 | 설명 |
|------|------|------|
| `RETRO_ARTIFACTS_DIR` | `.crew/artifacts/retro/` | retro 산출물 기본 경로 |
| `HISTORY_FILE` | `.crew/history.md` | 파이프라인 완료 이력 (분석 입력 소스) |
| `PIPELINE_ARTIFACTS_DIR` | `.crew/artifacts/` | 대상 파이프라인 산출물(prd/design/review/report) |
| `AGENT_DEFS_DIR` | `plugins/bams-plugin/agents/` | 에이전트 정의 파일 |
| `RETRO_PROTOCOL` | `plugins/bams-plugin/references/retro-protocol.md` | KPT 프레임워크 참조 |

---

## 회고 입력 소스 (정성만)

회고는 정량 이벤트 로그를 사용하지 않습니다. 다음 정성 소스만 입력으로 사용합니다:
- `HISTORY_FILE`(`.crew/history.md`)의 파이프라인 완료 기록
- `PIPELINE_ARTIFACTS_DIR`의 대상 파이프라인 산출물(PRD·설계·리뷰·보고서)
- 회고 실행 시 사용자가 제공하는 관찰·피드백

---

## Phase 게이트 공통 절차

각 Phase 완료 후 pipeline-orchestrator가 다음 순서로 게이트를 확인합니다:

1. 필수 산출물이 `RETRO_ARTIFACTS_DIR/{slug}/` 에 모두 생성되었는가
2. Critical 이슈(에러 상태)가 0건인가

결과:
- **GO**: 모든 항목 통과 → 다음 Phase 진행
- **CONDITIONAL-GO**: 필수 통과, 권장 미충족 → 이슈 기록 후 진행
- **NO-GO**: 필수 미충족 → 재작업 지시 또는 에스컬레이션

---

## 아티팩트 보존 정책

- retro 아티팩트(`.crew/artifacts/retro/{slug}/`)는 **7일** 동안 보존됩니다
- Phase 3(보고) 완료 시 7일 이상 경과한 retro 디렉터리를 자동 삭제합니다
- 에이전트 정의 파일(`agents/*.md`)에 적용된 개선 사항은 영구 보존됩니다
- `.crew/gotchas.md`에 승격된 항목도 영구 보존됩니다
- 보존 기간 변경이 필요하면 이 파일의 정책을 수정하세요
