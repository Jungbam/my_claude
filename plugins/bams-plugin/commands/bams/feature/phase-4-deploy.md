# Feature: Phase 4 — 배포

> 이 파일은 `/bams:feature`의 Phase 4를 실행합니다.
> 공통 규칙은 `_common.md`를 참조합니다 (엔트리포인트에서 이미 로드됨).

## 입력 컨텍스트
- slug: {엔트리포인트에서 결정된 slug}
- 이전 Phase 산출물:
  - `.crew/artifacts/review/{slug}-review.md`
  - `.crew/artifacts/qa/{slug}-qa.md`
  - `.crew/artifacts/performance/{slug}-performance.md`
  - `.crew/artifacts/security/{slug}-security.md`
  - Phase 3 게이트 판단: GO / CONDITIONAL-GO

---

**스킬 미설치 시**: Step 10 `skipped` (수동 PR 생성 안내) → Phase 5로.

---

### Step 10. Ship (배포 전 상태 판단 + bams ship 스킬)

**루프 B — Advisor 조언 후 메인이 배포 전 상태를 직접 판단하고 platform-devops로 Ship을 실행.**

### Step 10-a. pipeline-orchestrator 조언 요청 (Advisor)

Task tool, subagent_type: **"bams-plugin:pipeline-orchestrator"** — **조언자 모드**:
<!-- load_profile:exempt non-department-lead spawn -->

> **Phase 4 Step 10 Advisor 호출 — Ship 라우팅 권고**
>
> **컨텍스트:**
> ```
> phase: 4
> slug: {slug}
> pipeline_type: feature
> all_artifacts: .crew/artifacts/
> config: .crew/config.md
> ```
>
> **요청:** 메인이 spawn할 부서장(platform-devops — `_SHIP_SKILL` 실행)의 위임 메시지 템플릿, Ship 게이트 기준(잔여 리스크, Critical 이슈 유무)을 Advisor Response로 반환하세요. 직접 spawn 금지(harness 깊이 2 제약).

반환 후 Advisor Response 파싱 + CHAIN_VIOLATION 체크.

### Step 10-b. 메인이 배포 전 상태 직접 판단

메인이 `.crew/artifacts/` 전체 산출물을 종합하여 배포 전 상태를 판단합니다:
- 전체 Phase 진행 상황 요약
- 잔여 리스크 항목 정리
- Ship 준비 상태 판단 (GO/HOLD)

### Step 10-c. 메인이 platform-devops 직접 spawn (Ship 실행)

GO 판정 시 진행. HOLD이면 사용자에게 보고 후 해결.

Task tool, subagent_type: **"bams-plugin:platform-devops"** — 메인이 직접 호출:
<!-- load_profile:exempt inherits _shared_common §위임 원칙 -->

> **Phase 4 Step 10 — Ship 실행 (`_SHIP_SKILL`)**
>
> ```
> task_description: "_SHIP_SKILL을 실행하여 PR을 생성하라"
> input_artifacts:
>   - .crew/artifacts/
> expected_output:
>   type: pr_created
> quality_criteria:
>   - 베이스 머지 → 테스트 → 리뷰 → 버전범프 → CHANGELOG → PR 생성 완료
>   - PR 번호 반환
> ```
>
> **기대 산출물**: PR 번호, Ship 결과 보고

AskUserQuestion — "PR 생성됨. 즉시 배포?"
- **나중에 (Recommended)**
- **배포** — Step 11 실행.

---

### Step 11. Land & Deploy (선택)

배포 전 체크리스트 확인: (1) PR 머지 완료, (2) CI 통과, (3) Step 5-9 검증 통과.
모두 통과 시 `_DEPLOY_SKILL` 실행.
