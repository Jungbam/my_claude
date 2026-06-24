# Design Import: Phase 0 — Preflight

> 인자 검증 + codex 인증 확인 + 가이드 격리 + 시나리오 유효성 검사

## step_start emit

```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1)
[ -n "$_EMIT" ] && bash "$_EMIT" step_start "{slug}" 0 "Preflight" "Phase 0: 검증"
```

## §Interactive — Phase 0-I (인자 전체 미지정 진입점)

$ARGUMENTS 가 완전히 비어 있으면 이 섹션을 따른다 (OQ10=(a)).

4회 AskUserQuestion 순서:

  1. 가이드 경로:
     AskUserQuestion("가이드 파일 또는 디렉터리 경로를 입력하세요")
     → Bash로 경로 존재 확인:
       - 존재: GUIDE_PATH 변수 설정
       - 미존재: "[ERROR] 경로를 찾을 수 없습니다" 출력 후 재입력 요청 (최대 3회)

  2. 시나리오:
     AskUserQuestion(
       question: "어떤 시나리오로 진행할까요?",
       header: "시나리오 선택",
       options: [
         "S1 — 신규 페이지 이식 (src/app/ 에 새 페이지 생성)",
         "S2 — 기존 페이지 부분 교체 (기존 파일에 UI 레이어 패치)",
         "S3 — 충실도 단독 검증 (변경 없음, verdict.json만 생성)"
       ]
     )
     → 선택 결과를 SCENARIO 변수 (s1/s2/s3) 로 저장

  3. 대상 지정:
     S1/S2: AskUserQuestion("대상 App Router 경로 (예: src/app/dashboard)")
     S3:    AskUserQuestion("검증 대상 URL (예: http://localhost:3000/dashboard)")
     → TARGET 변수에 저장

  4. dry-run 여부 (OQ3=(c)):
     AskUserQuestion(
       question: "먼저 dry-run으로 결과를 검토할까요?",
       header: "실행 모드",
       options: [
         "Dry-run — 산출물만 생성, src/app/** 변경 없음",
         "바로 적용 — src/app/** 즉시 변경"
       ]
     )
     → 1번 선택: DRY_RUN=true / 2번 선택: DRY_RUN=false

4건 요약 표시:
```
가이드 경로: {GUIDE_PATH}
시나리오:   {SCENARIO} ({설명})
대상:       {TARGET}
실행 모드:  {DRY_RUN=true → "Dry-run" | false → "즉시 적용"}
```

사용자 최종 확인 후 아래 Preflight 체크리스트 진행.

---

## Preflight 체크리스트

### P1. 가이드 경로 검증 (AC3)

```bash
if [ ! -e "${GUIDE_PATH}" ]; then
  echo "[ERROR] 경로를 찾을 수 없습니다: ${GUIDE_PATH}"
  # step_end status="fail" + pipeline_end status="failed" emit 후 종료
fi
# 절대 경로 정규화
GUIDE_PATH_ABS=$(realpath "${GUIDE_PATH}")
```

실패 시 즉시 step_end status="fail" + pipeline_end status="failed" emit.

### P2. 시나리오 유효성 검사 (AC3.b — OQ6=(a))

```bash
case "${SCENARIO}" in
  s1|s2|s3) ;;  # 유효
  "")
    # AskUserQuestion으로 시나리오 선택 (강제 — OQ6=(a))
    ;;
  *)
    echo "[ERROR] 유효하지 않은 시나리오: ${SCENARIO}. s1, s2, s3 중 하나를 지정하세요."
    # pipeline_end status="failed" emit 후 종료
    ;;
esac
```

SCENARIO 가 빈 경우 AskUserQuestion:

```
AskUserQuestion(
  question: "시나리오를 선택하세요 (미선택 시 파이프라인 중단)",
  header: "시나리오 선택",
  options: [
    "s1 — 신규 페이지 이식",
    "s2 — 기존 페이지 부분 교체",
    "s3 — 충실도 단독 검증만"
  ]
)
```

### P3. codex 사전 체크 (AC8 — OQ7=(b))

S3는 skip. S1/S2는 _common.md §3 의 codex_available 함수로 확인.
실패 시 OQ7=(b) 처리 (안내 + 30초 대기 × 3회, 3회 실패 시 pipeline_end status="failed" emit 후 종료).

### P4. 가이드 파일 격리 (F2 — OQ4=(a)) (AC9)

_common.md §4 의 isolate_guide 함수 호출:

```bash
isolate_guide "${GUIDE_PATH_ABS}"
GUIDE_INPUT_DIR=".crew/artifacts/design/${slug}/guide-input"
```

### P5. SR-1 시크릿 스캔 + eval 패턴 검사 (AC9)

```bash
# 시크릿 스캔
_SECRETS=$(grep -rE 'API_KEY|SECRET|PASSWORD|token' "${GUIDE_INPUT_DIR}" 2>/dev/null | grep -v "\.git")
if [ -n "$_SECRETS" ]; then
  echo "[WARN] SR-1: 시크릿 패턴 감지됨 — 해당 파일을 제외하고 진행합니다."
  _SECRET_FILES=$(echo "$_SECRETS" | cut -d: -f1 | sort -u)
  mkdir -p ".crew/artifacts/design/${slug}/ui-diff"
  echo "## SR-1 시크릿 감지 파일" >> ".crew/artifacts/design/${slug}/ui-diff/conflict-report.md"
  echo "$_SECRET_FILES" >> ".crew/artifacts/design/${slug}/ui-diff/conflict-report.md"
  echo "$_SECRET_FILES" | xargs rm -f
fi

# eval / dynamic import 패턴 감지
_RISKY=$(grep -rE 'eval\(|import\(|require\(' "${GUIDE_INPUT_DIR}" 2>/dev/null)
if [ -n "$_RISKY" ]; then
  echo "[WARN] SR-1: eval/dynamic import 패턴 감지 — 해당 행을 코드가 아닌 텍스트로 처리합니다"
  TREAT_AS_TEXT=true
fi
```

### P6. 줄 수 체크

_common.md §5 의 줄 수 체크 실행.

### P7. TARGET 기본값 설정

S3이고 TARGET이 비어 있으면:
  AskUserQuestion("검증 대상 URL을 입력하세요 (예: http://localhost:3000/dashboard)")

S1/S2이고 TARGET이 비어 있으면:
  AskUserQuestion("대상 App Router 경로를 입력하세요 (예: src/app/dashboard)")

### P8. DRY_RUN 확인 (OQ3=(c))

DRY_RUN=interactive 이면:

```
AskUserQuestion(
  question: "먼저 dry-run으로 결과를 검토할까요?",
  header: "실행 모드",
  options: [
    "Dry-run — 산출물만 생성, src/app/** 변경 없음",
    "바로 적용 — src/app/** 즉시 변경"
  ]
)
```

선택 결과를 DRY_RUN 변수에 저장 (true/false).

## step_end emit

```bash
[ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" 0 "done" {duration_ms}
```

Phase 1.5 (Git 체크포인트)로 진행.
`commands/bams/dev/phase-1-5-git.md` 를 Read하여 지시를 따른다.
