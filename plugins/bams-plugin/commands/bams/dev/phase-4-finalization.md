# Dev: Phase 4 — 마무리 + 회고 (Step 10)

> 이 파일은 `/bams:dev`의 Phase 4를 실행합니다.
> 공통 규칙은 `_common.md`를 참조합니다.

## 입력 컨텍스트
- slug: {엔트리포인트에서 결정된 slug}
- 이전 Phase 산출물:
  - `.crew/artifacts/prd/{slug}-prd.md`
  - `.crew/artifacts/review/{slug}-review.md`
  - `.crew/artifacts/evaluation/{slug}-eval.md`
  - `.crew/artifacts/qg/{slug}-qg-{final_iteration}.md`
  - `.crew/board.md`

---

## Phase 4: 마무리 + 회고

### Step 10a. 마무리 (메인 직접 — 보드/히스토리 정리)

메인이 직접 다음을 수행합니다:

1. 보드 업데이트 (`completion-protocol.md` Step 4.6 아카이브 규칙 준수):
   - 완료된 모든 태스크를 `.crew/board-archive.md`의 `## Done ({slug} — YYYY-MM-DD)` 섹션으로 이관(형식 그대로). board.md에는 활성 섹션만 남기고 Done은 최근 1개 파이프라인분만 유지.
   - board.md의 `> Last updated:` 갱신
2. **히스토리 기록 (파이프라인 완료 표준)**: `.crew/history.md`에 1줄 기록을 추가합니다 (기존 형식):
   ```
   ## {YYYY-MM-DD} | {slug} | {COMPLETED|FAILED}
   - type: dev
   - status: {completed|failed}
   - 산출물: PRD, 설계, 리뷰, 평가, QG 결과
   - 요약: {한 줄 요약}
   ```
3. README.md에 영향을 줄 수 있는 변경이 있는지 판단하고 필요 시 업데이트

### Step 10b. 자동 회고 (루프 B — Advisor + 참여 부서장들 KPT 수집)

**루프 B — orchestrator 조언으로 회고 참여자 라우팅, 메인이 참여 부서장들을 병렬 직접 spawn.**

### Step 10b-a. pipeline-orchestrator 조언 요청 (retro-protocol 라우팅)

Task tool, subagent_type: **"bams-plugin:pipeline-orchestrator"** — **조언자 모드**:

> **Phase 4 Step 10b Advisor 호출 — 회고 참여자 라우팅 권고**
>
> **컨텍스트:**
> ```
> phase: 4-retro
> slug: {slug}
> pipeline_type: dev
> all_artifacts: .crew/artifacts/
> board: .crew/board.md
> history: .crew/history.md
> ```
>
> **요청:** retro-protocol.md에 따라 이 파이프라인에 **실제로 참여한 부서장 목록**을 식별하고, 각 부서장별 KPT 수집 위임 메시지 템플릿, 회고 결과 병합 절차를 Advisor Response로 반환하세요. 직접 spawn 금지(harness 깊이 2 제약).

반환 후 Advisor Response 파싱 + CHAIN_VIOLATION 체크.

### Step 10b-b. 메인이 참여 부서장들 병렬 직접 spawn

Advisor가 권고한 참여 부서장 목록에 대해, **단일 메시지에 복수 Task tool 호출**로 병렬 spawn합니다.

Task tool, subagent_type: **"bams-plugin:{참여-부서장}"** (Advisor 권고 목록의 각 부서장에 대해 병렬로) — KPT 제출:
> 이 파이프라인에서 **Keep(유지)/Problem(문제)/Try(시도)** 항목을 제출하세요. 참여한 Phase/Step, 발생한 이슈, 개선 제안을 포함합니다.

메인이 수집된 KPT를 종합하여:
- Problem 우선순위 정렬, 액션 아이템 확정, 교차 검증
- 에이전트 교훈 저장, gotchas 승격 검사, Pipeline Learnings 갱신, 프로세스 개선 제안
- 회고 결과를 tracking 파일에 기록

### 최종 요약 제시

최종 요약 제시: 피처명, 생성/수정 파일 목록, 테스트 파일 목록, 리뷰 이슈 요약, QG 결과, 회고 KPT 요약, 아티팩트 경로, 완료 태스크 수.
