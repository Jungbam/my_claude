# Retro: Phase 3 — 보고

> 이 파일은 `/bams:retro`의 Phase 3(보고)를 실행합니다.
> 공통 규칙은 `_common.md`를 참조합니다.

## 입력 컨텍스트
- slug: {엔트리포인트에서 결정된 retro slug}
- TARGET_SCOPE: {recent5 / all / slug:{값} / since_{N}d}
- 전체 Phase 산출물:
  - `.crew/artifacts/retro/{slug}/phase2-kpt-consolidated.md`
  - `.crew/artifacts/retro/{slug}/phase2-kpt-{부서명}.md` (참여 부서장별)
  - `.crew/artifacts/retro/{slug}/phase4-improvements-summary.md`
  - `.crew/artifacts/retro/{slug}/phase4-improvement-{에이전트명}.md` (개선 대상별)

---

## Step 1: 종합 보고서

**2단 위임 — 루프 A**: orchestrator 조언 → 메인이 product-analytics 직접 spawn.

**Step 1a: Advisor 호출** — Task tool, subagent_type: **"bams-plugin:pipeline-orchestrator"**, 조언자 모드. 컨텍스트: `.crew/artifacts/retro/{slug}/` 전체 Phase 1-2 산출물, retro-protocol.md. Advisor Response: 보고서 섹션 검증, 신호등 임계값, 1페이지 요약 포맷 재확인. spawn 지시 금지.

**Step 1b: 메인이 product-analytics 직접 spawn**

서브에이전트 실행 (Task tool, subagent_type: **"bams-plugin:product-analytics"**):

> **Phase 3 — 종합 보고서 생성**
>
> **위임 메시지:**
> ```
> task_description: "회고/개선 전체 결과를 종합 보고서로 작성하라 (정성 기반)"
> input_artifacts: [Phase 1-2 전체 산출물 목록]
> expected_output:
>   - path: .crew/artifacts/retro/{slug}/phase5-retro-report.md  (종합 보고서)
>   - path: .crew/artifacts/retro/{slug}/phase5-retro-summary.md  (1페이지 요약)
> quality_criteria:
>   - 보고서 구성 섹션 모두 포함 (아래 명시)
>   - 신호등 체계 (Green/Yellow/Red) 사용
>   - KPT 건수 명시 (Keep N, Problem N, Try N)
>   - 개선 실행 결과 명시 (승인 N건 / 적용 N건 / 보류 N건)
> ```
>
> **보고서 구성 (`phase5-retro-report.md`):**
> 1. **요약 대시보드** — 신호등 체계 (Green: 이상 없음 / Yellow: 권장 조치 / Red: 즉시 조치)
>    - 분석 파이프라인 수 (history.md 기준)
>    - 회고 핵심 신호 (반복 Problem, 우선 개선 영역)
>    - 개선 적용 현황 (승인/적용/보류)
> 2. **분석 대상 파이프라인 목록** — slug, 실행 일시, 완료 상태 (history.md 기준)
> 3. **부서별 회고 결과** — 부서별 KPT 핵심 코멘트 (정성)
> 4. **KPT 종합** — Keep N건 핵심 항목 / Problem N건 우선순위 순 / Try N건 실행 계획
> 5. **개선 실행 결과** — 적용된 변경 사항 목록 + diff 요약 / 보류된 개선안 경로
> 6. **다음 retro 권장 사항** — 다음 실행 권장 시점, 우선 점검 에이전트, 미해결 액션 아이템
>
> **1페이지 요약 (`phase5-retro-summary.md`):**
> - 회고 요약 (KPT 핵심 3줄 — Keep 1줄, Problem 1줄, Try 1줄)
> - 부서별 회고 핵심 코멘트 (축약)
> - 개선 실행 결과 (승인/적용/보류 건수)
> - 다음 파이프라인 권장 사항 (2줄 이내)
>
> **tracking 파일 기록 (retro-protocol.md §6-2 형식):**
> `.crew/artifacts/retro/{slug}/` 내 tracking.yml에 아래 형식으로 기록합니다:
> ```yaml
> retro:
>   conducted_at: {ISO timestamp}
>   scope: {TARGET_SCOPE}
>   pipelines_analyzed: {N}
>   keep_count: {N}
>   problem_count: {N}
>   try_count: {N}
>   action_items:
>     - description: "..."
>       assignee: "{에이전트명}"
>       target: "다음 파이프라인"
>       status: pending
>   lessons_saved: [{에이전트 목록}]
>   gotchas_promoted: {N}
>   learnings_updated: {N}
> ```
>
> **기대 산출물**:
> - `.crew/artifacts/retro/{slug}/phase5-retro-report.md`
> - `.crew/artifacts/retro/{slug}/phase5-retro-summary.md`
> - tracking 파일 retro 섹션 기록

---

## 최종 요약 제시

phase5-retro-summary.md 내용을 Read하여 대화창에 직접 출력합니다.

출력 형식:

```
## /bams:retro 완료 — {slug}

### 분석 결과
- 분석 파이프라인: {N}개 (history.md 기준)
- 반복 Problem / 우선 개선 영역: {핵심 요약}

### KPT 핵심
- Keep: {핵심 항목 1줄}
- Problem: {핵심 항목 1줄}
- Try: {핵심 항목 1줄}

### 개선 실행
- 승인: {N}건 / 적용 완료: {N}건 / 보류: {N}건

### 산출물 경로
- 종합 보고서: .crew/artifacts/retro/{slug}/phase5-retro-report.md
- 1페이지 요약: .crew/artifacts/retro/{slug}/phase5-retro-summary.md
```

---

## Step 2: 오래된 retro 아티팩트 정리

7일 이상 경과한 retro 아티팩트를 자동 삭제합니다.

Bash로 다음을 실행합니다:
```bash
echo "[retro] 7일 이상 된 retro 아티팩트 정리 시작..."
RETRO_DIR=".crew/artifacts/retro"
if [ -d "$RETRO_DIR" ]; then
  CLEANED=0
  for d in "$RETRO_DIR"/*/; do
    [ ! -d "$d" ] && continue
    # 디렉터리 내 가장 최근 파일의 수정 시간 확인
    LATEST=$(find "$d" -type f -newer "$d" -o -type f 2>/dev/null | head -1)
    if [ -z "$LATEST" ]; then
      LATEST=$(find "$d" -type f 2>/dev/null | head -1)
    fi
    if [ -n "$LATEST" ]; then
      # 7일(604800초) 이상 경과했는지 확인
      FILE_AGE=$(( $(date +%s) - $(stat -f %m "$LATEST" 2>/dev/null || stat -c %Y "$LATEST" 2>/dev/null || echo 0) ))
      if [ "$FILE_AGE" -gt 604800 ]; then
        echo "[retro] 삭제: $(basename "$d") ($(( FILE_AGE / 86400 ))일 경과)"
        rm -rf "$d"
        CLEANED=$((CLEANED + 1))
      fi
    fi
  done
  echo "[retro] 정리 완료: ${CLEANED}개 디렉터리 삭제"
else
  echo "[retro] retro 아티팩트 디렉터리 없음 — 스킵"
fi
```

---

## 마무리

회고 완료 시 `.crew/history.md`에 완료 1줄을 기록합니다 (`_shared_common.md` §파이프라인 완료 기록). 산출물 경로에 phase5-retro-report.md·phase5-retro-summary.md를 포함합니다.
