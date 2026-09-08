# Dev: Phase 5 — 상태 기록 위임 (Step 11)

> 이 파일은 `/bams:dev`의 Phase 5를 실행합니다.
> 공통 규칙은 `_common.md`를 참조합니다.

## 입력 컨텍스트
- slug: {엔트리포인트에서 결정된 slug}
- 이전 Phase 산출물: `.crew/board.md`, 이번 실행에서 생성된 아티팩트 경로 목록

---

## Phase 5: 상태 기록 위임

### Step 11. 상태 기록 위임

> **CLAUDE.md 자동 편집 금지** — 상태 기록은 `.crew/board.md`(태스크) / `.crew/history.md`(파이프라인 히스토리) / `.crew/artifacts/`(산출물)에 위임. 본 파이프라인은 CLAUDE.md를 수정하지 않는다.

파이프라인 완료는 Phase 4에서 `.crew/history.md`에 1줄 기록되었습니다 (완료 판별 기준 = history.md 기록 유무).

### completion-protocol 참조

파이프라인 완료 후 후속 처리가 필요한 경우 `references/completion-protocol.md`를 참조합니다.

### 다음 단계 안내 + 회고 중복 방지

마무리 후 반드시 다음 단계를 사용자에게 출력합니다:
- **정상 완료**: "다음: `/bams:ship {slug}`"
- **실패 잔존**(QG iteration>3로 미해결 이슈 존재): "다음: `/bams:hotfix {slug}`"

completion-protocol Step 4.95 중복 방지: Phase 4의 내장 회고(Step 10b)가 이미 수행되었으므로, Step 4.95에서 `/bams:retro` 제안 시 "내장 회고 완료됨"을 명시하고 중복 실행하지 않는다 (사용자가 별도 심층 회고를 원할 때만 실행).
