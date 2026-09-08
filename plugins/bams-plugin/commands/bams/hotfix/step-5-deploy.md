# Hotfix: Step 5 — 배포

> 이 파일은 `/bams:hotfix`의 Step 5를 실행합니다.
> 공통 규칙은 `_common.md`를 참조합니다 (엔트리포인트에서 이미 로드됨).

## 입력 컨텍스트

- slug: {엔트리포인트에서 결정된 slug}
- _DEPLOY_SKILL: 공통 규칙에서 로드된 Deploy 스킬 경로

---

## Step 5: 배포 (bams deploy 스킬, 선택)

**루프 A — 단일 부서장 직접 spawn (배포 환경 점검은 platform-devops 단일 책임).**

Task tool, subagent_type: **"bams-plugin:platform-devops"** — 메인이 직접 호출:
<!-- load_profile:exempt inherits _shared_common §위임 원칙 -->

> **Hotfix Step 5 — 배포 환경 점검**
>
> ```
> task_description: "핫픽스 배포 환경을 점검하라"
> input_artifacts:
>   - .crew/config.md
> expected_output:
>   type: deploy_precheck
> quality_criteria:
>   - 배포 환경 상태 확인
>   - 롤백 준비 확인
>   - 즉시 배포 가능 여부 판정
> constraints:
>   urgency: critical
> ```

AskUserQuestion — "즉시 배포할까요?"
- **나중에 (Recommended)**
- **배포** — `_DEPLOY_SKILL` 실행

---

## Step 5 게이트 조건

- [ ] 배포 환경 점검 완료
- [ ] 배포 실행 완료 (또는 나중에 처리)

Step 5 완료 → 엔트리포인트가 Finalization을 라우팅합니다.
