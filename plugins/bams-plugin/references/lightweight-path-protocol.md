# 경량 경로 프로토콜 (`--minimal`) — SSOT

> F-R9. `dev` / `feature` / `hotfix` 3개 커맨드가 §1~§7(`--minimal`)을 Pattern A(전체 참조)로 공유합니다.
> `review` / `deep-review`는 §1~§7 대상이 아니고, 자체 경량 경로(메인 단독 리뷰)를 **§8**에서 정의합니다. plan은 축약 대상이 없어 제외합니다.

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
| Phase 4 | product-analytics + 자동 회고 | 1줄 학습 노트 |

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

## 8. review / deep-review 경량 경로 (메인 단독 리뷰) — SSOT

> 배경(2026-11-17 eval review-01/02 ×3 + baseline 전수): 작은 diff에서 메인이 5관점 spawn·TodoWrite·verdict를 모두 건너뛰고 혼자 리뷰했다. 단독 리뷰 자체는 작은 diff에 합리적이므로 **허용하되 명시적 경로로 만들고**, 생략할 수 없는 것(Steps 기록·재현 증거·독립 판정자·verdict)을 고정한다.

### 8-1. 발동 조건 (전부 충족 → 경량, 질문 없이 적용)

| 조건 | 기준 |
|------|------|
| 변경 파일 수 | **≤ 5** |
| 변경 라인 수 | **≤ 300** (추가 + 삭제, 0 초과) |
| aspect | `ASPECT_LIST == ["code"]` (code 외 aspect는 부서장 spawn이 필요하므로 full) |
| 모드 | 정리/제거 모드 아님 |
| 플래그 | `$ARGUMENTS`에 `--full` 없음 (`--full`이면 규모와 무관하게 full) |

하나라도 어긋나면 **full 경로 의무** — 메인 단독 리뷰 금지. 근거: ≤ 5파일·≤ 300줄은 메인이 diff 전체와 주변 코드를 한 컨텍스트에서 읽고 재현 명령까지 돌릴 수 있는 규모이고, 그 이상은 5관점 병렬의 커버리지 이득이 spawn 비용보다 크다. §1~§7의 `--minimal` 자동 감지(≤ 2파일·≤ 30줄)는 구현 파이프라인 전체 축약용이라 별개 기준이다.

### 8-2. 측정 (리뷰 범위 결정 직후 1회)

리뷰 대상 diff를 그대로 파이프로 넣는다(`git diff` · `git diff --cached` · `git diff main...HEAD` · `cat <파일>.diff` 중 실제 리뷰 대상).

```bash
<리뷰 대상 diff 명령> | awk '/^\+\+\+ /{f++; next} /^--- /{next} /^[+-]/{l++} END{printf "review_size files=%d lines=%d\n", f, l}'
```

diff가 아닌 파일/디렉토리 리뷰는 대상 파일 수와 `wc -l` 합계를 같은 기준에 쓴다. 결과(`review_size files=<m> lines=<n>`)와 경량/full 결정을 Steps의 "경로 판정" 항목과 리포트 상단에 적는다.

### 8-3. 경량 경로에서 바뀌는 것

| 항목 | full | 경량 |
|------|------|------|
| orchestrator 조언 (review Phase 2-a) | spawn | `— skip: lightweight (<n> lines, <m> files)` |
| 5관점 리뷰 (review Phase 2-b / deep-review Step 1) | qa-strategy spawn | `— skip: lightweight (…)` → 메인이 5관점(정확성·보안·성능·품질·테스트)을 직접 리뷰 |
| 지적 검증 (review Phase 3 defect-triage) | 지적 1건당 1 spawn | `— skip: lightweight (…)` → §8-4 판정자가 겸함 (deep-review는 defect-triage 묶음 1 spawn) |
| 구조적 리뷰·Codex (deep-review Step 2·3) | 사용자 선택 | 변화 없음 (사용자 선택) |

### 8-4. 경량에서도 생략 불가

1. **Steps → TodoWrite**: 커맨드 `## Steps`를 원문 복사하고, 건너뛴 spawn step은 위 skip 문구로 남긴다(`references/step-status.md` §Steps 체크리스트 규약 7).
2. **재현 증거**: 메인 지적은 `references/multi-perspective-review.md` §지적 검증 필터 1~2를 그대로 따른다 — 지적 형식, confidence 80 미만 미보고, Major 이상은 재현 증거(실행한 명령+출력 / 실패 테스트 / 입력값+`file:line` 체인), 증거 등급(`references/issue-severity.md` §증거 등급). 메인은 실제로 명령을 실행해 증거를 만든다.
3. **독립 판정자 1 spawn** — skip 불가:
   - `review`: `bams-plugin:release-quality-gate` 1회. 메인 지적의 독립 검증(§지적 검증 필터 4·5) + 위험 지점 1곳 직접 확인 + 릴리스 게이트 판정(`issue-severity.md` §Release Gate, N=2) + PASS/FAIL이면 `hooks/lib/verdict.sh write`(`references/verdict-protocol.md` §3). 위임 메시지 템플릿은 `commands/bams/review.md` Phase 4 (경량).
   - `deep-review`: `bams-plugin:defect-triage` 묶음 1회(지적 0건이어도 위험 지점 1곳 확인). 게이트 미포함이므로 verdict는 쓰지 않는다.
   - **모델 분리**: 판정자 spawn에는 메인·구현자와 다른 `model`을 지정한다(opus → `"sonnet"`, sonnet → `"opus"`). Codex가 연결돼 있으면 Codex 판정 우선(`verdict-protocol.md` §3).
4. **완료 산출물**: `review`는 이번 세션의 `.crew/artifacts/review/verdict-*.json`(또는 허용 사유의 `skip:`), `deep-review`는 기본 `— skip: deep-review 게이트 미포함`. 정의: `references/step-status.md` §완료 조건 마커.
5. **리포트 표기**: 리포트·결과 제시에 `경로: lightweight (<n> lines, <m> files) — 판정자 <agent/model>`을 남긴다.
