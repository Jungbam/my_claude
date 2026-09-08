# Feature: Phase 5 — 마무리

> 이 파일은 `/bams:feature`의 Phase 5 및 Phase 5.5를 실행합니다.
> 공통 규칙은 `_common.md`를 참조합니다 (엔트리포인트에서 이미 로드됨).

## 입력 컨텍스트
- slug: {엔트리포인트에서 결정된 slug}
- 이전 Phase 산출물:
  - PR 번호 (Step 10 결과)
  - 배포 결과 (Step 11 결과, 선택)
  - `.crew/artifacts/` 전체

---

### Step 12. 문서 갱신 (기획부장 위임) — Ship 직후 시작

**최적화**: 문서 갱신은 Deploy(Step 11)와 독립적이므로, **Step 10(Ship) 완료 직후 백그라운드로 시작**합니다.
Step 11(Deploy) 선택 시 문서 갱신과 배포가 병렬로 진행됩니다.

**스킬 미설치 시**: Step 12 `skipped`.

**루프 A — 단일 부서장 직접 spawn (문서 갱신은 product-strategy 단일 책임).**

Task tool, subagent_type: **"bams-plugin:product-strategy"** — 메인이 직접 호출:

> **Phase 5 Step 12 — 문서 갱신**
>
> ```
> task_description: "Ship된 피처에 맞춰 프로젝트 문서를 갱신하라"
> input_artifacts:
>   - .crew/artifacts/prd/{slug}-prd.md
>   - .crew/artifacts/design/{slug}-design.md
> expected_output:
>   type: documentation_update
>   paths: [README.md, CHANGELOG.md, ARCHITECTURE.md]
> quality_criteria:
>   - README.md 피처 반영
>   - CHANGELOG.md 엔트리 추가
>   - 아키텍처 문서 변경 반영 (해당 시)
> ```
>
> 기획부장은 `_DOCRELEASE_SKILL`을 활용하여 문서를 갱신합니다. 내부에서 specialist를 최대 1회 추가 spawn 가능(harness 깊이 2 한도).
>
> **기대 산출물**: 갱신된 문서 파일 목록

---

### Step 13. 스프린트 종료 (project-governance 위임)

**루프 A — 단일 부서장 직접 spawn (스프린트 종료는 product-strategy 단일 책임, 내부에서 project-governance specialist 호출).**

Task tool, subagent_type: **"bams-plugin:product-strategy"** — 메인이 직접 호출:

> **Phase 5 Step 13 — 스프린트 종료**
>
> ```
> task_description: "이 피처의 스프린트를 종료하라"
> input_artifacts:
>   - .crew/board.md
> expected_output:
>   type: sprint_closure
>   paths: [.crew/board.md]
> quality_criteria:
>   - 모든 태스크가 Done으로 이동
>   - 스프린트 통계 기록
> ```
>
> 기획부장은 project-governance specialist를 최대 1회 추가 spawn 가능(harness 깊이 2 한도). `.crew/board.md`에서 이 feature의 모든 태스크 완료 시 `/bams:sprint close` 제안.
>
> **기대 산출물**: 스프린트 종료 결과, 업데이트된 board.md

---

### Step 14. 자동 강제 회고 (참여 부서장들 KPT)

**이 단계는 건너뛸 수 없습니다. 자동으로 강제 실행됩니다.**

**루프 B — Advisor 조언 후 메인이 참여 부서장들 병렬 직접 spawn.** 이 단계는 스킵할 수 없습니다.

### Step 14-a. pipeline-orchestrator 조언 요청 (Advisor)

Task tool, subagent_type: **"bams-plugin:pipeline-orchestrator"** — **조언자 모드**:

> **Phase 5 Step 14 Advisor 호출 — 자동 강제 회고 라우팅 권고**
>
> **컨텍스트:**
> ```
> phase: 5-retro
> slug: {slug}
> pipeline_type: feature
> all_artifacts: .crew/artifacts/
> board: .crew/board.md
> history: .crew/history.md
> review_report: .crew/artifacts/review/{slug}-review.md
> evaluation_report: .crew/artifacts/evaluation/{slug}-eval.md
> qa_report: .crew/artifacts/qa/{slug}-qa.md
> performance_report: .crew/artifacts/performance/{slug}-performance.md
> security_report: .crew/artifacts/security/{slug}-security.md
> ```
>
> **요청:** retro-protocol.md에 따라, 메인이 병렬 spawn할 참여 부서장 목록(KPT 제출: 기획부장/개발부장/QA부장/평가부장 중 해당자)과 각각의 위임 메시지 템플릿, 합의 도출/피드백 반영/board+history 업데이트 절차를 Advisor Response로 반환하세요. 직접 spawn 금지(harness 깊이 2 제약).

반환 후 Advisor Response 파싱 + CHAIN_VIOLATION 체크.

### Step 14-b. 메인이 참여 부서장들 병렬 직접 spawn (단일 메시지 복수 Task)

Advisor가 권고한 부서장들에 대해, **단일 메시지에 복수 Task tool 호출**로 병렬 spawn하여 KPT를 수집합니다 (해당자만):
- `bams-plugin:product-strategy` (Phase 1 참여)
- `bams-plugin:frontend-engineering` 또는 `bams-plugin:backend-engineering` 또는 `bams-plugin:platform-devops` (Phase 2 참여)
- `bams-plugin:qa-strategy` (Phase 3 참여)
- `bams-plugin:product-analytics` (Phase 3 참여, 해당 시)

> **Step 14 — KPT 제출**
> ```
> task_description: "이 파이프라인에 대한 KPT(Keep/Problem/Try)를 제출하라"
> input_artifacts:
>   - .crew/artifacts/
> expected_output:
>   type: retro_kpt
> quality_criteria:
>   - Keep: 잘 된 점
>   - Problem: 문제점
>   - Try: 다음에 시도할 개선
> ```

### Step 14-c. 메인이 합의 도출 + 피드백 반영 + 보드/히스토리 업데이트

메인 세션에서 retro-protocol.md 절차에 따라 직접 수행:

1. 합의 도출: 수집된 KPT를 종합하여 Problem 우선순위 정렬, 액션 아이템 확정, 교차 검증
2. 피드백 반영: 에이전트 교훈 저장, gotchas 승격 검사, Pipeline Learnings 갱신, 프로세스 개선 제안
3. 보드 및 히스토리 업데이트 (`completion-protocol.md` Step 4.6 아카이브 규칙 준수):
   - 완료된 모든 태스크를 `.crew/board-archive.md`의 `## Done ({slug} — YYYY-MM-DD)` 섹션으로 이관(형식 그대로). board.md에는 활성 섹션만 남기고 Done은 최근 1개 파이프라인분만 유지.
   - **히스토리 기록 (파이프라인 완료 표준)**: `.crew/history.md`에 1줄 기록을 추가합니다 (기존 형식):
     ```
     ## {YYYY-MM-DD} | {slug} | {COMPLETED|FAILED}
     - type: feature
     - status: {completed|failed}
     - 산출물: PRD, 설계, 리뷰, QA, 성능, 보안, PR 번호
     - 요약: {한 줄 요약}
     ```
   - board.md의 `> Last updated:` 갱신
4. 회고 결과를 tracking 파일에 기록

**기대 산출물**: 회고 결과 (KPT 요약, 액션 아이템, 피드백 반영 내역), 업데이트된 board.md/history.md

---

## Phase 5.5: 상태 기록 위임

> **CLAUDE.md 자동 편집 금지** — 상태 기록은 `.crew/board.md`(태스크) / `.crew/history.md`(파이프라인 히스토리) / `.crew/artifacts/`(산출물)에 위임. 본 파이프라인은 CLAUDE.md를 수정하지 않는다.

---

## 롤백 시스템

### 롤백 포인트 기록
각 Phase 완료 시 tracking 파일에 롤백 정보를 자동 기록합니다:
- **Phase 2 완료**: `commit_before` (구현 시작 전 커밋 해시), `branch`, `files_created`
- **Phase 4 완료**: `pr_number`, `version_bump` (있는 경우)

### 롤백 실행
AskUserQuestion에서 "롤백" 선택 시:
1. **Phase 4 롤백**: PR 닫기 → 버전 범프 리버트 → CHANGELOG 리버트
2. **Phase 2 롤백**: `git reset --soft {commit_before}` → 변경사항 스태시 저장
3. 트래킹 파일에 `status: rolled_back` 기록

---

## 마무리

### 최종 요약 제시

피처명, 생성/수정 파일 목록, 테스트 파일 목록, 리뷰 이슈 요약, QA 결과, 성능 수치, 보안 스캔 결과, 회고 KPT 요약, 아티팩트 경로, 완료 태스크 수, PR 번호 (있는 경우).

### 파이프라인 완료 판별

파이프라인 완료는 위 Step 14-c에서 `.crew/history.md`에 1줄 기록되었습니다 (완료 판별 기준 = history.md 기록 유무). `{total}`은 15 (Step 0~14).

Step 14에서 이미 자동 강제 회고(KPT 수집 + 합의 도출 + 피드백 반영)를 수행했으므로, completion-protocol Step 4.95의 `/bams:retro` 제안 시 중복 실행하지 않는다.

**`references/completion-protocol.md` 참조.** 표준 프로토콜을 따릅니다.

이 파이프라인의 Learnings 카테고리:
1. `pattern:` — 새로 도입한 패턴/라이브러리
2. `convention:` — 리뷰(Step 5)에서 발견된 코드 컨벤션
3. `vulnerable:` — 보안 감사(Step 8)/리뷰에서 반복 지적된 영역
4. `perf-baseline:` — 벤치마크(Step 7) 수치
5. `deploy:` — Ship/Deploy 결과 요약
