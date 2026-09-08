# Hotfix: Step 2 — QA 검증

> 이 파일은 `/bams:hotfix`의 Step 2를 실행합니다.
> 공통 규칙은 `_common.md`를 참조합니다 (엔트리포인트에서 이미 로드됨).

## 입력 컨텍스트

- slug: {엔트리포인트에서 결정된 slug}
- fix_artifacts: `.crew/artifacts/hotfix/{slug}-triage.md` (Step 1 산출물)
- _QA_SKILL: 공통 규칙에서 로드된 QA 스킬 경로

---

## Step 2: QA 검증 (bams browse 스킬, 선택)

**스킬 미설치 시**: `skipped` 기록.

**루프 A — 단일 부서장 직접 spawn (QA 검증은 qa-strategy 단일 책임).**

Task tool, subagent_type: **"bams-plugin:qa-strategy"** — 메인이 직접 호출:

> **Hotfix Step 2 — 핫픽스 회귀 테스트**
>
> ```
> task_description: "핫픽스 회귀 테스트 계획을 수립하고 automation-qa로 실행하라"
> input_artifacts:
>   - .crew/artifacts/hotfix/{slug}-triage.md
> expected_output:
>   type: qa_test_plan
> quality_criteria:
>   - 수정된 영역 회귀 테스트 포함
>   - 관련 사이드 이펙트 체크 포함
> constraints:
>   urgency: critical
>   scope: regression_only
> ```
>
> QA부장은 automation-qa specialist를 최대 1회 추가 spawn 가능(harness 깊이 2 한도)하여 테스트를 실행합니다.

반환 후 결과를 확인합니다:
- **성공 시**: 다음 단계로 진행
- **에러 시**: 사용자에게 에러를 보고하고 AskUserQuestion으로 계속/중단 확인. 중단 선택 시 파이프라인 종료.

AskUserQuestion — "브라우저 QA 테스트를 진행할까요?"
- **건너뛰기 (Recommended)**
- **QA 진행** — URL 입력 후 `_QA_SKILL` 실행

---

## Step 2 게이트 조건

- [ ] 회귀 테스트 계획 수립 완료
- [ ] automation-qa 실행 완료 (또는 skipped)
- [ ] 브라우저 QA 완료 (또는 건너뜀)
- [ ] QA 이슈 없음 또는 해결 완료

Step 2 완료 → 엔트리포인트가 Step 3-4를 라우팅합니다.
