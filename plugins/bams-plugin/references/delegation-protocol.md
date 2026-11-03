# 위임 프로토콜 (2단 위임 + Orchestrator 조언자 모드)

**커맨드(메인) → 부서장 → (선택적) 도메인 specialist** 2단 위임의 메시지 형식, 보고 계약, 라우팅, 에스컬레이션을 정한다. harness는 서브에이전트의 중첩 spawn을 지원하지 않으므로 pipeline-orchestrator는 spawn하지 않는 **조언자**다(CLAUDE.md §1).

## 1. 위임 구조

```
메인(커맨드) ─① orchestrator 조언(선택) ─② 부서장 spawn(깊이 1) ─③ specialist 1회 spawn(깊이 2, 선택)
```

- 기획부장: **product-strategy** — specialist: business-analysis, ux-research, project-governance
- 개발부장: **frontend-engineering**, **backend-engineering** (직접 구현)
- 인프라부장: **platform-devops** — specialist: data-integration
- 디자인부장: **design-director** — specialist: ui-designer, ux-designer, graphic-designer, motion-designer, design-system-agent, guide-decomposer, guide-recomposer, ui-diff-applier, data-binding-mapper, visual-fidelity-verifier, nextjs-convention-mapper, accessibility-auditor, routing-strategist, ssr-csr-decider

<!-- SYNC-SPECIALISTS:START -->
디자인부 specialist 9종 (design-director 산하):
- accessibility-auditor
- data-binding-mapper
- guide-decomposer
- guide-recomposer
- nextjs-convention-mapper
- routing-strategist
- ssr-csr-decider
- ui-diff-applier
- visual-fidelity-verifier
<!-- SYNC-SPECIALISTS:END -->
- QA부장: **qa-strategy** — specialist: automation-qa, defect-triage, release-quality-gate
- 평가부장: **product-analytics** — specialist: experimentation, performance-evaluation, business-kpi
- 경영지원(독립): **resource-optimizer**, **hr-agent**, **cross-department-coordinator**, **git-ops-agent**(git skill 저비용 실행)
- 조언자(Task 비호출): **pipeline-orchestrator**

## 1-A. pipeline-orchestrator 조언자 모드

메인이 호출하면 (1) Phase 실행 계획 (2) 게이트 Go/No-Go (3) 부서장 라우팅 (4) 롤백/회고 권고를 반환한다. spawn은 메인이 한다. 상세: `agents/pipeline-orchestrator.md` §"조언자 모드"·§"출력 형식".

## 2. 메시지 형식

### 2-1. 메인 → orchestrator (조언 요청)

필수 `phase`, `slug`, `pipeline_type`, `context`(PRD·설계·산출물 **경로**), 선택 `constraints`(스킵 단계·사용자 지시).

### 2-2. 메인 → 부서장 (spawn)

| 항목 | 필수 | 설명 |
|------|------|------|
| `task_description` | O | 수행할 작업 |
| `input_artifacts` | O | 입력 산출물 **경로** 목록 |
| `context_package` | 조건부(aspect 통합 리뷰 시 O) | Phase 1에서 1회 수집한 파일+내용(diff) 패키지 또는 임시 파일 경로 1줄(포맷 SSOT: `multi-perspective-review.md` §컨텍스트 패키징 포맷). 첨부 시 부서장은 같은 파일을 재Read하지 않는다 |
| `expected_output` | O | 산출물 형식·경로 + 보고 파일 경로(§2-5) |
| `quality_criteria` | O | 품질 기준(테스트·린트 통과 등) |
| `constraints` | - | 수정 가능 파일 범위, 금지 패턴 |
| `gotchas` | - | 관련 gotcha ID 발췌 |
| `load_profile` | 조건부(spawn 발행 커맨드는 항상) | 사전 로드 L1 문서 목록. 스키마 §2-2-a |

- spawn 프롬프트는 이 작업 하나만 기술한다. **이전 Phase 요약·누적 이력을 붙이지 말고** 산출물 경로를 넘긴다 — 붙인 텍스트는 메인 컨텍스트에 남아 매 턴 재독된다.

### 2-2-a. load_profile 스키마

스키마 원문(SSOT)은 이 소절에만 둔다(NFR-7). 검증 규칙:

- **V1** doc는 enum 8종 외 자유 경로 금지.
- **V2** `ids`=gotchas 전용, `agent`=best-practices·agent-rules 전용, `block`=best-practices 전용.
- **V3** 부서장은 수신 프로파일을 재판정 없이 상속: specialist 전용 문서 append만, remove·재정렬 금지.
- **V4** `level` 기본 L2. `refs` 부재/공백 → 전 항목 L2(정의 파일 stub 자기 트리거, 기능 손실 없음).
- **V5** `level: L2` 위임에서도 정의 파일 stub 분기 조건이 참이면 L2 Read 정상.

```yaml
load_profile:
  level: L2                 # 전역 기본값(L1|L2)
  refs:                     # 사전 로드 지시 목록. 공백/부재 → 전 항목 L2(V4)
    - {doc: config,                 section: "§아키텍처,§컨벤션"}
    - {doc: gotchas,                ids: "G-A,G-C"}
    - {doc: stack-profile,          level: L1}                          # per-ref override
    - {doc: best-practices,         agent: frontend-engineering, block: "핸드오프"}
    - {doc: agent-rules,            agent: product-strategy,     section: "P-S2"}
    - {doc: design-artifact-layout, section: "§경계 마커"}
  inherit: true             # 기본 true(V3). false일 때만 미상속
# doc enum 8종: config·gotchas·stack-profile·best-practices·agent-rules·design-artifact-layout·design-artifact-templates·codex-delegation
```

### 2-3. 부서장 → specialist (선택, 깊이 2)

필수 `sub_task`, `input_artifacts`, `quality_criteria`; 선택 `reference`, `load_profile`(V3 상속, 깊이 2·위임 1회 한도 불변). harness가 spawn을 막으면 직접 수행하거나 메인에 재라우팅을 요청한다.

- 부서장은 자기 작업을 검증받으려고 리뷰어·검증자를 spawn하지 않는다(검증은 메인 게이트 몫). specialist는 어떤 하위 spawn도 하지 않는다.

### 2-4. specialist → 부서장 (보고)

§2-5와 같은 계약을 쓴다.

### 2-5. 보고 계약 (부서장 → 메인)

상세는 보고 파일에 쓰고, 최종 메시지는 아래만 15줄 이내로 반환한다.

```yaml
status: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED
changed_files: [경로, ...]
verification: "{실행한 명령} → {결과 한 줄}"   # 실행 불가면 사유
concerns: [...]                                # 없으면 생략
report: .crew/artifacts/{report|review|design}/{slug}-{agent}.md
```

| status | 의미 | 메인 행동 |
|--------|------|-----------|
| `DONE` | 완료·검증 통과 | §2-6 확인 후 게이트 |
| `DONE_WITH_CONCERNS` | 완료했으나 정확성·범위 의문 | concerns 판정 → 진행 또는 재작업 |
| `NEEDS_CONTEXT` | 정보 부족 | 필요한 정보를 보강해 같은 부서장 재spawn |
| `BLOCKED` | 수행 불가 | §5 에스컬레이션 |

- NEEDS_CONTEXT·BLOCKED는 막힌 지점·시도한 것·필요한 도움을 최종 메시지 본문에 쓴다. 확신 없는 결과를 DONE으로 내지 않는다.
- 보고 파일: 품질 기준별 충족 여부, 실행한 명령과 출력, 결정 근거, 후속 권고.
- 구 스키마 호환: `quality_status` PASS/CONDITIONAL/FAIL은 각각 DONE/DONE_WITH_CONCERNS/BLOCKED로 읽는다. 커맨드 고유 확장 상태(design-import `PENDING_FE`)는 해당 커맨드 규약을 따른다.

### 2-6. 보고 검증 (메인, 게이트 전 필수)

- **부서장 보고는 미검증 주장으로 취급한다.** 게이트 전에 `git diff --stat`이 `changed_files`와 일치하는지 보고, `verification` 명령을 재실행하거나 그 출력을 직접 확인한다. 보고에 적힌 설계 근거("의도적으로 단순화" 등)는 지적의 심각도를 낮추지 않는다.
- 상태 변경 주장(갱신·반영·저장·삭제)은 실재 근거(mtime, grep, row count, diff)를 동반해야 한다. 근거가 없으면 DONE이 아니라 미확인으로 에스컬레이션한다.
- 상태 변경을 수반하는 하위 작업은 background로 위임하지 않는다(foreground로 완료 대기 후 검증).

### 2-7. dead-code 제거 위임 표준 문구

dead-code 제거 위임 시 `task_description` 또는 `constraints`에 포함한다:

- **"제거로 참조 카운트가 0이 되는 cross-file 심볼/파일을 1단계 이상 폐포(closure)로 추적해 함께 정리하고, 완료 전 `grep -rn <removed_symbol>`로 잔여 참조 0을 재확인한다. 폐포가 2단계 이상으로 확장되면 추가 제거는 실행하지 말고 보고만 한다."**
- 문자열 리터럴 자산 참조(`src`/`srcSet`/`<picture>`/`url()`)와 `import type` 배럴 소비처는 정적 스캐너의 unused 판정을 믿지 말고 별도 grep으로 교차 검증하게 한다.

## 3. 부서장 결정 규칙

### 3-1. 태그 기반 (최우선)

| 태그 | 부서장 | 에이전트 풀 |
|------|--------|-------------|
| `frontend` | frontend-engineering | frontend-engineering |
| `backend` | backend-engineering | backend-engineering |
| `infra` / `devops` | platform-devops | platform-devops |
| `data` | platform-devops | data-integration |
| `qa` | qa-strategy | qa-strategy, automation-qa, defect-triage |
| `planning` | product-strategy | product-strategy, business-analysis, ux-research |
| `design` / `ui` / `ux` | design-director | ui-designer, ux-designer, graphic-designer, motion-designer, design-system-agent |
| `security` | platform-devops | platform-devops |
| `agent-management` | hr-agent | hr-agent |

### 3-2. 파일 패턴 기반 (태그 없을 때 — orchestrator 권고, 메인 spawn)

| 파일 패턴 | 부서장 |
|-----------|--------|
| `src/app/**`, `src/components/**`, `src/hooks/**`, `*.tsx`, `*.css` | frontend-engineering |
| `src/app/api/**`, `src/lib/**`, `*.server.ts`, `prisma/**` | backend-engineering |
| `Dockerfile`, `.github/**`, `deploy/**`, `infra/**` | platform-devops |
| `src/lib/data/**`, `scripts/etl/**`, `*.sql` | data-integration |
| `src/styles/**`, `src/design/**`, `*.figma`, `design-tokens/**`, `src/components/**/style*` | design-director |
| `agents/*.md`, `references/jojikdo.json`, `agents-config.ts` | hr-agent |

### 3-3. 혼합 패턴

orchestrator가 파일 수 기준 주요 부서장 1명(전체 조율)과 협력 부서장을 권고하고, 메인이 순차/병렬 spawn한다. 부서 간 인터페이스 조율이 필요하면 cross-department-coordinator를 별도 spawn한다.

### 3-4. 병렬 배치 규칙

- node_modules 변경(install/uninstall)·build 배치는 편집 배치와 직렬화하거나 배치별 `git worktree`로 격리한다.
- 병렬 배치의 게이트(build/test/시각검증)는 최종 병합 후 메인이 1회 재실행한다.
- 대량 편집 배치를 맡은 부서장은 워킹트리 배타 점유 구간을 보고하고, 같은 워킹트리 병렬 요청에는 직렬화를 제안한다.

## 4. Phase 전환 체크리스트

메인이 orchestrator 게이트 조언과 함께 확인한다.

| # | 확인 | 미충족 시 |
|---|------|-----------|
| 1 | 필수 Step 완료 | 재실행 또는 에스컬레이션 |
| 2 | Critical 이슈 0건 | FAIL — 해결 후 재시도 |
| 3 | 필수 산출물 존재 | 생성 지시 |
| 4 | 다음 Phase 선행 조건 충족 | 대기 |
| 5 | 보고 계약(§2-5) 충족 + §2-6 검증 완료 | 검증 후 진행 |

| 전환 | 추가 확인 |
|------|-----------|
| 기획 → 구현 | PRD 승인, 기술 설계, 태스크 분해 |
| 구현 → 검증 | 빌드·타입체크·린트 통과 |
| 검증 → 리뷰 | 테스트 통과, QA 리포트, 성능 기준 |
| 리뷰 → 배포 | 리뷰 승인, 보안 스캔, 릴리스 품질 게이트 PASS |

## 5. 에스컬레이션

```
specialist ─실패→ 부서장(대안·specialist 재호출 1회·직접 수행) ─실패/범위 초과→ 메인(orchestrator 조언·타 부서장 spawn) ─전략 판단→ 사용자(AskUserQuestion)
```

- 서브에이전트의 중첩 spawn 시도가 감지되면 즉시 중단하고 응답 상단에 `CHAIN_VIOLATION`을 반환한다(`agents/pipeline-orchestrator.md` §"에스컬레이션 경고 반환 조건"). 메인이 직접 부서장을 spawn한다.
- 에스컬레이션 메시지 필수 항목: `issue`, `attempted`, `impact`, `options`(≥2), `recommendation`.

| 상황 | 행동 |
|------|------|
| 린트/타입 에러 | 부서장/specialist 자동 수정 → 재검증 |
| 테스트 1~2개 실패 | 부서장 수정(최대 2회) → 실패 시 BLOCKED 보고 |
| 빌드 실패 | 원인 분석 → specialist 1회 재spawn → 실패 시 BLOCKED 보고 |
| 전체 테스트 실패 · 보안 Critical | 즉시 메인 → orchestrator 조언(보안은 사용자 보고 병행) |
| 요구사항 모호 | NEEDS_CONTEXT → 메인이 사용자 질문 |
| Write/Edit 권한 에러 | 재시도 0회, 즉시 메인 에스컬레이션 |

## 6. 파이프라인 완료 기록

완료 기록은 메인이 `.crew/history.md`에 append한다(`commands/bams/_shared_common.md` §파이프라인 완료 기록). 부서장·specialist는 결과만 반환하고, orchestrator는 조언 응답에 완료 요약만 포함한다.
