# Feature: Phase 1.5 — Git 체크포인트

> 이 파일은 `/bams:feature`의 Phase 1.5를 실행합니다.
> 공통 규칙은 `_common.md`를 참조합니다 (엔트리포인트에서 이미 로드됨).

## 입력 컨텍스트

- slug: {엔트리포인트에서 결정된 slug}
- 이전 Phase 산출물:
  - PRD: `.crew/artifacts/prd/{slug}-prd.md`
  - 기술 설계: `.crew/artifacts/design/{slug}-design.md`

---

## Git 체크포인트 선택

**AskUserQuestion**으로 체크포인트 방식을 선택받습니다:

Question: "구현 시작 전 코드를 어떻게 보존할까요?"
Header: "Git"
Options:
- **Feature branch** - "새 브랜치를 생성하여 작업 (예: bams/{slug})"
- **Stash** - "현재 변경사항을 stash하고 현재 브랜치에서 작업"
- **스킵** - "체크포인트 없이 바로 진행"

---

## Phase 1.5 게이트 조건

- [ ] Git 체크포인트 방식 선택 완료 (또는 스킵)

Phase 1.5 완료 → 엔트리포인트가 Phase 2 (구현)를 라우팅합니다.
