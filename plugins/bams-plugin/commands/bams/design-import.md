---
description: 외부 디자인 가이드(JSX/HTML/ZIP)를 격리·검증·이식하는 전용 커맨드 — 9개 specialist(F1~F9) 파이프라인의 명시적 진입점
argument-hint: [<가이드 경로>] [--scenario s1|s2|s3] [--target <대상>] [--dry-run] [--no-dry-run] [--skip-verify]
---

# Bams: Design Import

외부에서 수신한 디자인 가이드(React JSX / HTML / ZIP)를 격리하여
design-director(F1~F9 파이프라인)에 위임하고, 결과를 검증합니다.

입력: $ARGUMENTS

## 공통 규칙 로드

`commands/bams/design-import/_common.md` 를 Read하여
슬래시 커맨드 공통 규칙(viz emit, 위임 원칙, codex 사전 체크, TaskDB 연동)을 로드합니다.

`commands/bams/design-import/_common.md` 에 정의된 파싱 규칙에 따라
$ARGUMENTS를 파싱합니다:

  GUIDE_PATH   ← 첫 번째 위치 인자 (비어 있으면 interactive fallback)
  SCENARIO     ← --scenario s1|s2|s3 (미지정 → AskUserQuestion)
  TARGET       ← --target <경로 또는 URL> (미지정 → AskUserQuestion, S3는 URL)
  DRY_RUN      ← --dry-run=true | --no-dry-run=false | 미지정=interactive
  SKIP_VERIFY  ← --skip-verify (Phase 2 verify 건너뜀, 내부 테스트용)

$ARGUMENTS가 완전히 비어 있으면 → OQ10=(a): 인터랙티브 prompt 전체(Phase 0-I) 진입.

## 사전 조건 확인

Bash로 `.crew/config.md` 존재 여부 확인:
- 없으면 "/bams:init 을 먼저 실행하세요" 출력 후 중단.
- 있으면 `.crew/config.md` 와 `.crew/board.md` Read.

## Work Unit 선택 (pipeline_start 전)

`commands/bams/_shared_common.md` §Work Unit 선택 절차를 따른다.
SELECTED_WU_SLUG 확정 후 pipeline_start emit.

## Viz 이벤트: pipeline_start

```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1)
[ -n "$_EMIT" ] && bash "$_EMIT" recover "{slug}"
[ -n "$_EMIT" ] && bash "$_EMIT" pipeline_start "{slug}" "design-import" "/bams:design-import" "{arguments}" "" "${SELECTED_WU_SLUG:-}"
```

pipeline_type = **"design-import"** (OQ8=(b): 텍스트 라벨로만 구분, 색상 매핑은 별도 plan)

## Phase 라우팅 표

| Phase | 서브파일 경로 |
|-------|-------------|
| Phase 0-I (인터랙티브 — 인자 전체 미지정) | `commands/bams/design-import/phase-0-preflight.md` §Interactive |
| Phase 0 (프리플라이트 — 인자 있음) | `commands/bams/design-import/phase-0-preflight.md` |
| Phase 1 (design-director 위임) | `commands/bams/design-import/phase-1-delegate.md` |
| Phase 1.5 (Git 체크포인트) | `commands/bams/dev/phase-1-5-git.md` 명시적 Read 재사용 |
| Phase 2 (결과 검증) | `commands/bams/design-import/phase-2-verify.md` |
| Phase 4 (마무리 + 회고) | `commands/bams/dev/phase-4-finalization.md` 명시적 Read 재사용 |

> dev/phase-1-5-git.md 와 dev/phase-4-finalization.md 는 **복제 금지** — 해당 경로를 Read하여 지시를 따른다. (OQ2=(a) / OQ9=(a))

## 인터랙티브 Fallback 의사코드 (Phase 0-I)

모든 인자가 비어 있을 때 다음 순서로 AskUserQuestion 4회:

  1. 가이드 경로:
     AskUserQuestion("가이드 파일 또는 디렉터리 경로를 입력하세요")
     → 미존재 시 재입력 요청 (경로 검증 루프)

  2. 시나리오 선택:
     AskUserQuestion(
       question: "어떤 시나리오로 진행할까요?",
       header: "시나리오 선택",
       options: [
         "S1 — 신규 페이지 이식 (src/app/ 에 새 페이지 생성)",
         "S2 — 기존 페이지 부분 교체 (기존 파일에 UI 레이어 패치)",
         "S3 — 충실도 단독 검증 (변경 없음, verdict.json만 생성)"
       ]
     )

  3. 대상 지정 (S1/S2면 경로, S3면 URL):
     S1/S2: AskUserQuestion("대상 App Router 경로 (예: src/app/dashboard)")
     S3:    AskUserQuestion("대상 URL (예: http://localhost:3000/dashboard)")

  4. dry-run 여부 (OQ3=(c)):
     AskUserQuestion(
       question: "먼저 dry-run으로 결과를 검토할까요?",
       header: "실행 모드",
       options: [
         "Dry-run — 산출물 확인 후 실제 적용 여부를 결정",
         "바로 적용 — src/app/** 를 즉시 변경"
       ]
     )

위 4건 요약 표시 → 사용자 최종 확인 후 Phase 0 (프리플라이트) 진입.

## 실행 흐름

Phase 0-I 또는 인자 파싱 완료 후:

1. phase-0-preflight.md 를 Read → 지시 따름 (격리, 시크릿 스캔, codex 체크)
2. 완료 시 `commands/bams/dev/phase-1-5-git.md` 를 Read → 브랜치 생성 또는 stash
3. phase-1-delegate.md 를 Read → design-director spawn + 모니터링
4. --skip-verify 미지정 시 phase-2-verify.md 를 Read → dry-run 결과 또는 실적용 확인
5. `commands/bams/dev/phase-4-finalization.md` 를 Read → 커밋 + 집계 + 회고

pipeline_end 는 Phase 4(finalization) 실행 마지막에 emit (G-C 준수):

```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1)
[ -n "$_EMIT" ] && bash "$_EMIT" pipeline_end "{slug}" "completed" 4 4 0 0 {duration_ms}
```
