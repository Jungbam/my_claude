# 경량 경로 프로토콜 (`--minimal`) — SSOT

> F-R9. `dev` / `feature` / `hotfix` 3개 커맨드가 본 파일을 Pattern A(전체 참조)로 공유합니다.
> review / deep-review / plan은 이미 경량이거나 축약 대상이 없어 본 프로토콜 대상에서 제외합니다.

## 1. 발동 조건

두 트랙 중 하나로 발동합니다. 둘 다 없으면 기존 full 사이클 그대로 진행합니다.

- **(a) 명시적 플래그**: 사용자가 `$ARGUMENTS`에 `--minimal`을 포함 — 즉시 축약 실행.
- **(b) 자동 규모 감지**: preflight 직후 `git diff --stat` 기준 변경 파일 ≤ 2 **AND** 변경 라인 합 ≤ 30(0 초과) — "권장" 안내 후 사용자 승인 시에만 적용.

## 2. 플래그 인식 스키마

```
argument-hint: <설명 또는 태스크 ID> [--minimal]
```

```bash
_MINIMAL_FLAG=0
case "$ARGUMENTS" in
  *"--minimal"*) _MINIMAL_FLAG=1 ;;
esac
_ARGUMENTS_CLEAN="$(echo "$ARGUMENTS" | sed 's/[[:space:]]*--minimal[[:space:]]*/ /g' | xargs)"
```

tracking 파일에 판정 결과를 기록합니다:

```markdown
minimal_mode: true|false
minimal_reason: user_flag | auto_suggested_accepted | disabled
```

## 3. 자동 규모 감지 스니펫

`_MINIMAL_FLAG=0`일 때만 실행. preflight("코드 최신화") 다음, 사전 조건 이전에 배치합니다.

```bash
if [ "$_MINIMAL_FLAG" -eq 0 ] && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  _DIFF_STAT=$(git diff --stat 2>/dev/null | tail -1)
  _DIFF_FILES=$(echo "$_DIFF_STAT" | grep -oE '[0-9]+ file' | grep -oE '[0-9]+' | head -1)
  _DIFF_LINES=$(echo "$_DIFF_STAT" | grep -oE '[0-9]+ insertion|[0-9]+ deletion' | grep -oE '[0-9]+' | paste -sd+ - | bc 2>/dev/null || echo 0)
  _DIFF_FILES=${_DIFF_FILES:-0}; _DIFF_LINES=${_DIFF_LINES:-0}
  if [ "$_DIFF_FILES" -le 2 ] && [ "$_DIFF_LINES" -le 30 ] && [ "$_DIFF_LINES" -gt 0 ]; then
    echo "변경 규모 감지: ${_DIFF_FILES}파일 / ±${_DIFF_LINES}줄 → --minimal 경량 경로를 권장합니다."
    echo "적용하시겠습니까? (Y/n, 기본 n — 미응답 시 full 사이클 진행)"
    # AskUserQuestion으로 응답 수신 → minimal_mode를 tracking에 확정
  fi
fi
```

## 4. 스팸 방지

- 자동 제안은 **파이프라인당 최대 1회**.
- 사용자가 n으로 응답하면 세션 내(같은 tracking 파일 기준) 재제안하지 않습니다.
- preflight에서 판정이 tracking 파일에 확정되면 이후 재개(resume) 시 재질문하지 않습니다.

## 5. 축약 대상 3단 (공통)

1. orchestrator Advisor 생략 — 루프 A 강제(메인이 부서장 직접 spawn).
2. 검증 최소셋 — build + lint만 실행, 성능/보안/QA는 스킵.
3. 회고 축약 — KPT full 대신 1줄 학습 노트만 memory에 기록.

## 6. 커맨드별 축약 규칙

### dev

| Phase | 기본 | `--minimal` |
|-------|------|--------------|
| Phase 0 | resource-optimizer 조언 | 스킵 |
| Phase 1 | product-strategy → BA/UX/PG | product-strategy 단일 spawn 또는 스킵(태스크 ID 인자) |
| Phase 2 | Advisor → 부서장 spawn | Advisor 스킵, 직접 spawn |
| Phase 2.5 | qa-strategy → automation-qa | 스킵 |
| Phase 3 | qa-strategy + product-analytics | qa-strategy만 |
| Phase 3.5 | project-governance QG | verify(build+lint) 대체 |
| Phase 4 | executive-reporter + 자동 회고 | 1줄 학습 노트 |

### feature

| Phase | 기본 | `--minimal` |
|-------|------|--------------|
| Phase 0 | resource-optimizer | 스킵 |
| Phase 1 | product-strategy → BA/UX/PG | product-strategy 단일 spawn |
| Phase 2 | 부서장 병렬(Advisor) | Advisor 스킵, 직접 spawn |
| Phase 3 | 5관점 리뷰 + QA + 성능 + 보안 | review만 |
| Phase 4 | Ship + Deploy | Ship만(Deploy는 사용자 선택) |
| Phase 5 | 문서 + 회고 강제 | 1줄 학습 노트 |

### hotfix

- Step 1(진단+수정): 축약 없음(핵심 로직).
- Step 2(QA): 기존 회귀 테스트만, 신규 자동화 추가 스킵.
- Step 3-4(CI/CD+출시 준비): CI 유지, 리뷰는 diff self-check로 축약.
- Step 5(배포): 사용자 선택.
- Finalization: 1줄 학습 노트.

## 7. 사용자 안내 문구 (자동 제안 시)

```
─────────────────────────────────────────────
경량 경로 제안 (F-R9)
─────────────────────────────────────────────
변경 규모: 파일 {N} / 라인 ±{M}
반증 사례: plan_T3(+1줄), plan_T2(+0줄)에서 풀 사이클 오버헤드 실증

권장: /bams:{command} $ARGUMENTS --minimal
축약: orchestrator Advisor 생략 + 검증 최소셋 + 회고 축약

Y — --minimal 경로로 진행
n — 기본 풀 사이클로 진행 (기본값)

응답:
```
