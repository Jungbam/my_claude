# Design Import: Phase 2 — 결과 검증

> dry-run 산출물 검토 + 실 적용 동의 + AC5 검증

## 2-A. AC5 — dry-run 검증 (DRY_RUN=true인 경우)

```bash
_CHANGED=$(git diff --name-only HEAD 2>/dev/null | grep "^src/app/")
if [ -n "$_CHANGED" ]; then
  echo "[FAIL] AC5 위반: dry-run 모드에서 src/app/ 변경 감지됨!"
  echo "$_CHANGED"
  # 롤백
  git checkout -- src/app/ 2>/dev/null
  # .crew/history.md에 실패로 기록 후 종료
fi
echo "[PASS] AC5: dry-run 모드 — src/app/ 변경 0건 확인"
```

DRY_RUN=false(실제 적용 모드)인 경우 이 검증은 skip.

## 2-B. 산출물 요약 표시

DRY_RUN=true 이면 사용자에게 산출물 목록과 verdict 표시:

```
## Dry-run 결과 요약
- pipeline_slug: {slug}
- scenario:      {SCENARIO}
- verdict:       {VERDICT}
- 생성 산출물:   {ARTIFACTS_LIST}
- 미결 항목:     {ISSUES_LIST}

산출물 경로: .crew/artifacts/design/{slug}/
```

## 2-C. 실 적용 동의 (DRY_RUN=true → 실적용 여부 확인 — OQ3=(c))

DRY_RUN=true 이면 AskUserQuestion:

```
AskUserQuestion(
  question: "dry-run 결과를 확인했습니다. 이제 실제로 적용할까요?",
  header: "실 적용 확인",
  options: [
    "적용 — design-director 를 --no-dry-run으로 재실행",
    "종료 — 산출물만 보관, src/app/** 변경 없이 파이프라인 종료",
    "수정 필요 — 시나리오 또는 가이드를 변경하여 재시작"
  ]
)
```

- "적용" 선택 시: DRY_RUN=false 로 `commands/bams/design-import/phase-1-delegate.md` 재실행
- "종료" 선택 시: `.crew/history.md`에 완료로 기록 후 종료 (변경 없이)
- "수정 필요" 선택 시: `.crew/history.md`에 보류로 기록 + 재시작 안내 출력

## 2-D. 실 적용 완료 검증 (DRY_RUN=false 또는 재실행 후)

S1 검증:

```bash
_TARGET_DIR="./{TARGET}"
if [ ! -d "${_TARGET_DIR}" ]; then
  echo "[WARN] 대상 디렉터리 미생성: ${_TARGET_DIR}"
fi
ls "${_TARGET_DIR}"/*.tsx 2>/dev/null | head -5
```

S2 검증:

```bash
git diff --stat HEAD -- src/app/ 2>/dev/null | head -10
```

S3 검증:

```bash
cat ".crew/artifacts/design/{slug}/fidelity/verdict.json" 2>/dev/null | head -20
```

## 2-D-bis. F5 자동 트리거 (DRY_RUN=false, 실 적용 완료 후)

DRY_RUN=false이고 2-D 검증 PASS 후, baseline triplet으로 F5(visual-fidelity-verifier) 자동 트리거:

```bash
if [ "$DRY_RUN" = "false" ]; then
  # baseline triplet
  _BASELINE_GUIDE=".crew/artifacts/design/${slug}/guide-input/"
  _BASELINE_RECOMPOSE=".crew/artifacts/design/${slug}/guide-recomposition/preview.html"

  # TARGET (src/app/dashboard) → dev 서버 URL 변환
  _TARGET_RELATIVE="${TARGET#src/app}"           # /dashboard
  _TARGET_RELATIVE="${_TARGET_RELATIVE%/}"        # trailing slash 제거
  _DEV_PORT="${DEV_PORT:-3000}"                   # 환경 변수 또는 기본값
  _IMPL_TARGET_URL="http://localhost:${_DEV_PORT}${_TARGET_RELATIVE:-/}"

  echo "[INFO] F5 visual-fidelity-verifier 자동 트리거"
  echo "  baseline: $_BASELINE_GUIDE"
  echo "  recompose: $_BASELINE_RECOMPOSE"
  echo "  target URL: $_IMPL_TARGET_URL"

  # Task tool 호출 (메인이 직접 spawn — Phase F의 일부로 처리)
  # subagent_type: "bams-plugin:visual-fidelity-verifier"
  # model: "gpt-5.3-codex"
  # prompt:
  #   task_description: "DRY_RUN=false 실 적용 완료 후 baseline triplet 픽셀 diff"
  #   input_artifacts:
  #     - guide_url: file://${_BASELINE_GUIDE}/index.html
  #     - recompose_url: file://${_BASELINE_RECOMPOSE}
  #     - target_url: ${_IMPL_TARGET_URL}
  #   verdict 출력: .crew/artifacts/design/{slug}/fidelity/verdict.json
  #     - guide_vs_impl_diff (≤5% PASS, ≤20% CONDITIONAL)
  #     - recompose_vs_impl_diff (참고용)

  # F5 완료 후 verdict 파싱

  # H-D3: verdict.json 저장 전 디렉터리 보장 (cat redirect 실패 방지)
  mkdir -p ".crew/artifacts/design/${slug}/fidelity"

  # ENV_FAIL 분기 (F5 H-E1 적용 — 환경 미충족 시 자동 PASS 차단)
  _F5_VERDICT=$(jq -r '.verdict // "MISSING"' ".crew/artifacts/design/${slug}/fidelity/verdict.json" 2>/dev/null)
  if [ "$_F5_VERDICT" = "ENV_FAIL" ]; then
    echo "[FAIL] F5 환경 미충족 — .crew/history.md에 실패로 기록 후 종료"
    exit 1
  fi
fi
```

**verdict.json 신규 필드** (visual-fidelity-verifier가 출력):
- `guide_vs_impl_diff`: 원본 가이드 vs 구현 픽셀 diff (≤5% PASS, ≤20% CONDITIONAL)
- `recompose_vs_impl_diff`: F2 재조립 vs 구현 (참고용)
- `verdict`: PASS / CONDITIONAL / FAIL / ENV_FAIL
- `skipped`: (선택) 파이프라인 중 사용자가 스킵한 항목 배열 — 각 `{step, reason, regression_test_skipped?, ts}`. 별도 jsonl 로그 파일을 두지 않고 이 필드에 흡수한다(2-E 참조).

## 2-E. 회귀 테스트 (S2 한정)

S2이고 DRY_RUN=false이면:

```
AskUserQuestion(
  question: "S2 기존 페이지 회귀 테스트를 qa-strategy에 위임할까요?",
  header: "회귀 테스트 결정",
  options: [
    "회귀 테스트 실행 (Recommended)",
    "스킵 — 위험 인지 확인 (regression_test_skipped: true 기록)"
  ]
)
```

- "회귀 테스트 실행 (Recommended)" 선택 시: qa-strategy 에 회귀 테스트 위임
  - qa-strategy 에 S2 conflict-report.md + 변경 파일 목록 전달
- "스킵 — 위험 인지 확인 (regression_test_skipped: true 기록)" 선택 시:
  - 별도 jsonl을 만들지 않고, 기존 verdict 산출물(`.crew/artifacts/design/${slug}/fidelity/verdict.json`)의 `skipped` 배열에 항목을 흡수한다(없으면 배열 생성):
    ```bash
    _V=".crew/artifacts/design/${slug}/fidelity/verdict.json"
    mkdir -p ".crew/artifacts/design/${slug}/fidelity"
    [ -s "$_V" ] || echo '{}' > "$_V"
    _TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    jq --arg ts "$_TS" '.skipped = ((.skipped // []) + [{"step":"2-E","reason":"user_skip","regression_test_skipped":true,"ts":$ts}])' "$_V" > "$_V.tmp" && mv "$_V.tmp" "$_V"
    ```
  - 수동 확인 권고 후 계속 진행

Phase 4 (마무리 + 회고) 진행:
`commands/bams/dev/phase-4-finalization.md` 를 Read하여 지시를 따른다. (OQ2=(a))
pipeline_type = "design-import" 를 phase-4-finalization 에 전달하여 회고 카테고리 분리.
