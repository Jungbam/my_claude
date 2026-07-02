## 1. 위임 원칙 (최우선 — 예외 없음)

**모든 코드 수정은 반드시 `커맨드 → 부서장 → (선택적) 도메인 에이전트` 2단 위임을 통해 수행한다.**

```
사용자 커맨드 → 부서장 → (선택적) 도메인 에이전트
              ↑
         pipeline-orchestrator는 계획/게이트 판정을 반환하는 "조언자" 모드로 동작
```

> **배경**: Claude Code harness에서 서브에이전트가 또 다른 서브에이전트를 Task tool로 spawn할 수 없다(중첩 제한). 따라서 기존 3단 위임(`orchestrator → 부서장 → 에이전트`)은 구조적으로 실행 불가이며, 2단 위임 + orchestrator 조언자 모드로 전환한다.

### 위임 규칙
- 허용: 커맨드 스킬(메인 대화)이 Agent tool로 부서장을 직접 spawn. 부서장이 자신의 도메인 내에서 specialist를 최대 1회 추가 spawn 가능.
- 금지: 메인 대화가 Edit/Write로 소스 코드 직접 변경 (읽기 전용 Bash/Glob/Grep/Read는 허용).
- 금지: 커맨드 레벨에서 Task tool을 중첩 호출하여 서브에이전트가 또 다른 서브에이전트를 spawn하는 시도 (harness 제약).
- 허용: Bash/Glob으로 상태 확인, 사용자에게 질문, 읽기 전용 응답.
- "내가 직접 하면 더 빠르다"는 판단으로 위임을 건너뛰지 않는다.
- 위반 감지 시: 즉시 중단하고 적절한 부서장에게 해당 작업을 위임.

### pipeline-orchestrator 역할 (조언자 모드)
- orchestrator는 **Task tool 호출자가 아님**. 서브에이전트 레벨에서 중첩 Task tool이 차단되기 때문.
- 역할:
  1. Phase 단위 실행 계획 수립 → 메인(커맨드)에 JSON/텍스트로 반환
  2. Phase 게이트 Go/No-Go 판단 → 메인에 보고
  3. 부서장 라우팅 조언 → 메인이 실제 spawn 수행
  4. 롤백 결정 및 회고 트리거 권고

### Work Unit 선택 규칙 준수 필수 (불변)
- 활성 WU 2개 이상이면 AskUserQuestion으로 사용자에게 선택 요청
- 커맨드 레벨에서 임의로 WU 결정 금지 (`_shared_common.md` §Work Unit 선택 참조)

## 2. 조직도 (8부서 36에이전트)

| 부서 | 부서장 | 소속 에이전트 |
|------|--------|--------------|
| 기획 | product-strategy | business-analysis, ux-research, project-governance |
| 개발(FE) | frontend-engineering | (직접 구현) |
| 개발(BE) | backend-engineering | (직접 구현) |
| 개발(인프라) | platform-devops | data-integration |
| 디자인 | design-director | ui-designer, ux-designer, graphic-designer, motion-designer, design-system-agent, guide-decomposer, guide-recomposer, ui-diff-applier, data-binding-mapper, visual-fidelity-verifier, nextjs-convention-mapper, accessibility-auditor, routing-strategist, ssr-csr-decider |
| QA | qa-strategy | automation-qa, defect-triage, release-quality-gate |
| 평가 | product-analytics | experimentation, performance-evaluation, business-kpi |
| 경영지원 | (독립 운영 — orchestrator 직접 조율) | executive-reporter, resource-optimizer, hr-agent, cross-department-coordinator |

**위임 라우팅 — 태그 우선, 파일 패턴 보조:**

| 태그/패턴 | 부서장 |
|-----------|--------|
| `frontend` / `*.tsx`, `src/app/**`, `src/components/**`, `*.css` | frontend-engineering |
| `backend` / `src/app/api/**`, `*.server.ts`, `prisma/**` | backend-engineering |
| `infra`/`devops` / `Dockerfile`, `.github/**` | platform-devops |
| `data` / `*.sql`, `scripts/etl/**` | platform-devops |
| `design`/`ui`/`ux`/`guide` / `*.figma`, `design/**`, `*.html` 가이드, `src/assets/**` | design-director |
| `qa` | qa-strategy |
| `planning` | product-strategy |
| `security` | platform-devops |
| `agent-management` / `agents/*.md`, `jojikdo.json` | hr-agent |

## 3. 파이프라인 규칙

### 네이밍 (immutable)
- 형식: `{command}_{한글요약}` (예: `feature_결제플로우구현`, `hotfix_빌드에러수정`)
- slug는 파이프라인 수명 동안 불변. 상태는 이벤트로 판별 (`pipeline_end` 없음 → 진행 중)
- 상세: `.crew/references/pipeline-naming-convention.md`

### Work Unit 선택
- 활성 WU 0개 → 경고 후 WU 없이 진행
- 활성 WU 1개 → 자동 선택
- 활성 WU 2개+ → AskUserQuestion으로 사용자에게 선택 요청

### 커맨드 목록

| 커맨드 | 설명 |
|--------|------|
| **파이프라인** | |
| `/bams:init` | 프로젝트 초기화 |
| `/bams:start` | 작업 단위(WU) 시작 |
| `/bams:end` | 작업 단위 종료 |
| `/bams:plan` | PRD + 기술 설계 + 태스크 분해 |
| `/bams:feature` | 풀 피처 개발 사이클 |
| `/bams:dev` | 멀티에이전트 풀 개발 파이프라인 |
| `/bams:hotfix` | 버그 핫픽스 빠른 경로 |
| `/bams:debug` | 버그 분류 → 수정 → 회귀 테스트 |
| `/bams:deep-review` | 다관점 심층 코드 리뷰 (5관점 + 구조적 리뷰 + 세컨드 오피니언) |
| `/bams:review` | 5관점 병렬 코드 리뷰 |
| `/bams:ship` | PR 생성 + 머지 |
| `/bams:deploy` | 출시 검증 + Land & Deploy |
| `/bams:verify` | CI/CD 프리플라이트 (빌드, 린트, 타입체크, 테스트) |
| `/bams:performance` | 성능 측정/최적화 (benchmark 기반) |
| `/bams:security` | 보안 감사 (시크릿 체크 + OWASP/STRIDE) |
| `/bams:retro` | 파이프라인 회고 + 에이전트 평가 |
| `/bams:design-import` | 외부 디자인 가이드(React JSX/HTML) → Next.js UI 재구성 파이프라인 (design-director 자동 위임) |
| `/bams:weekly` | 주간 루틴 (스프린트 마무리 + 회고 + 다음 계획) |
| **부서 허브** | |
| `/bams:engineering` | 개발부서 스킬 허브 (FE, BE, 플랫폼, 데이터) |
| `/bams:planning` | 기획부서 스킬 허브 (전략, 분석, UX, 거버넌스) |
| `/bams:evaluation` | 평가부서 스킬 허브 (분석, 실험, 성능, KPI) |
| `/bams:qc` | QA부서 스킬 허브 (전략, 자동화, 결함, 출시 검증) |
| `/bams:qa` | 브라우저 QA (자동화 테스트 + 브라우저 검증) |
| **유틸리티** | |
| `/bams:browse` | 인터랙티브 헤드리스 브라우저 |
| `/bams:export` | 조직 설정을 이식 가능한 패키지로 내보내기 |
| `/bams:import` | 패키지를 현재 프로젝트에 가져오기 |
| `/bams:q` | 코드베이스 질문 (자동 범위 감지 + 코드 기반 답변) |
| `/bams:status` | 프로젝트 대시보드 현황 |
| `/bams:sprint` | 스프린트 플래닝 및 관리 |
| `/bams:viz` | 파이프라인 실행 시각화 |

## 4. viz 이벤트 규칙

### emit 원칙
- 커맨드 레벨(메인): `pipeline_start`/`pipeline_end`, `step_start`/`step_end`, `recover`, `error` emit 가능
- `agent_start`/`agent_end`: 커맨드 → 부서장 → (선택적) 에이전트 2단 위임 체계 내에서만 emit

### 이벤트 타입 (10종)

| 타입 | 필수 필드 |
|------|----------|
| `pipeline_start` | pipeline_slug, pipeline_type, command, arguments, work_unit_slug? |
| `pipeline_end` | pipeline_slug, status(`completed`\|`failed`\|`paused`\|`rolled_back`), total_steps, completed_steps, failed_steps, skipped_steps, duration_ms |
| `step_start` | pipeline_slug, step_number, step_name, phase |
| `step_end` | pipeline_slug, step_number, status(`done`\|`fail`\|`skipped`), duration_ms |
| `agent_start` | call_id, agent_type, department, model, description, step_number |
| `agent_end` | call_id, agent_type, is_error, status, duration_ms, result_summary |
| `work_unit_start` | work_unit_slug, work_unit_name, started_at |
| `work_unit_end` | work_unit_slug, status(`completed`\|`failed`\|`cancelled`), ended_at, duration_ms |
| `error` | pipeline_slug, message, step_number |
| `recover` | 중단된 이벤트 자동 정리 |

### 데이터 경로
- 이벤트: `~/.bams/artifacts/pipeline/{slug}-events.jsonl`
- WU 이벤트: `~/.bams/artifacts/pipeline/{slug}-workunit.jsonl`
- 에이전트 로그: `~/.bams/artifacts/agents/YYYY-MM-DD.jsonl`
- HR 보고서: `~/.bams/artifacts/hr/`
- 프로젝트 아티팩트: `.crew/artifacts/` (prd/, design/, review/, report/)
- DB: `~/.claude/plugins/marketplaces/my-claude/bams.db`

### DB 스키마 (v2 — FK 기반)
```
work_units → pipelines (work_unit_id FK) → tasks (pipeline_id FK)
                                          → task_events (task_id FK)  -- immutable event sourcing
                                          → run_logs (pipeline_id FK) -- 30일 auto-cleanup
hr_reports (독립)
```

## 5. 회고 규칙

- 파이프라인 완료(정상/실패) 시 **무조건 회고 실행** (사용자 명시적 스킵 요청만 예외)
- KPT 프레임워크: Keep(유지) / Problem(문제) / Try(시도)
- 정량 지표 수집: 소요 시간, 성공률, 재시도 횟수, 토큰 사용량
- 학습 → 에이전트 `.crew/memory/{agent-slug}/MEMORY.md` 기록 (max 10개, 6개월 후 삭제)
- gotchas 승격 → `.crew/gotchas.md` 갱신

## 6. 에이전트 동작 규칙

### 작업 시작 시 참조
- `.crew/config.md` — 프로젝트 설정, 아키텍처, 컨벤션
- `.crew/gotchas.md` — 프로젝트 주의사항
- `.crew/board.md` — 현재 태스크 상태
- `.crew/memory/{agent-slug}/MEMORY.md` — 학습된 지식

### 작업 완료 시
1. 변경 사항 요약 반환
2. viz 이벤트(`agent_end`) emit
3. 에러 시 `status="error"`로 보고 (근본 원인 + 영향 범위 포함)
4. 마지막 에이전트는 `pipeline_end` emit

### Context 관리
- 파이프라인 완료 후: completion-protocol Step 4.9에 따라 context health를 평가하고 `/compact` 제안
- 비파이프라인 장기 작업 완료 후: Edit/Write 30회 이상 수행했으면 `/compact` 제안
- `/compact` 제안 시 반드시 요약 메시지를 포함: `/compact {작업 요약 — 완료 상태, 다음 단계}`
- context rot 징후 감지 시 (이전 대화 참조 실패, 파일 경로 혼동 등): 즉시 `/compact` 제안

### Critical Gotchas
- **[G-A]** FE 배치 분할 필수: 변경 10파일 초과 또는 600초 이상 예상 시
- **[G-B]** Agent tool 호출 시 `subagent_type` 필수 지정
- **[G-C]** PRD DoD에 `pipeline_end` 기록 조건 포함 필수
- **[G-D]** 부서장이 spawn한 모든 에이전트는 `agent_start` emit 의무화 (부서장 자신도 커맨드에 의해 spawn될 때 emit)
- Tool 권한 에러(`Write`/`Edit` 금지) → **재시도 0회, 즉시 에스컬레이션**
- 위임 20회 이상 예상 → **사전 분할 전략 필수** (Phase당 max 8회)

## 7. 컨벤션

- TypeScript ESM, `bun:sqlite` (ORM 없음), `Bun.serve()`
- `SKILL.md`는 `.tmpl`에서 자동 생성 — 직접 편집 금지
- `git add .` 금지 — 파일명 개별 명시
- `browse/dist/` 바이너리 커밋 금지
- 상세: `.crew/config.md` 참조

## 현재 상태

> Last updated: 2026-06-30

### 진행 중 (신규 — 2026-06-30, design-import 품질개선 plan)
- **`plan_designimport품질개선`** (Backlog, 9 tasks — TASK-077~085) ⭐ 신규
  - Work Unit: 전체bams리뷰 / Branch: `bams/plan_designimport품질개선` (예정, base=main)
  - 부모 deep-review: `deep-review_designimport품질진단_20260630` (Critical 10 / Major 18 / Minor 5)
  - PRD: `.crew/artifacts/prd/plan_designimport품질개선-prd.md` (279줄, APPROVED v2 후보 — OQ1~OQ5 사용자 답변 수신)
  - Spec: `.crew/artifacts/design/plan_designimport품질개선-spec.md` (560줄, 19 hunks, 자기검증 SV 6/6 PASS)
  - Design-FE: `.crew/artifacts/design/plan_designimport품질개선-design-fe.md` (177줄, fe-handoff.md contract 11 필드 + JSX 합성 규칙 4항목)
  - Design-BE: `.crew/artifacts/design/plan_designimport품질개선-design-be.md` (81줄, NG 확정 — markdown만 변경)
  - 분류: F-R-A 스키마 6 필드 + F-R-B design-director SSOT 표 + F-R-C Phase 1B FE 직접 spawn + F-R-D 청킹/frontmatter + F-R-E 검증 게이트 3건 + F-R-F 보안 3건 + F-R-G SSOT 단일화
  - 변경 파일: agents 6 + commands/bams/design-import 4 = **10 파일, +361/-42줄 = +319 (NF-3 +500 한도 63.8%)**
  - OQ 결정: OQ1=(a) 보안 본 plan / OQ2=(a) D/E 본 plan / OQ3=(a) FE 재사용 / OQ4=(b) optional / OQ5=(b) 신규 PR
  - 머지 전략: 신규 PR (base=main), 4 commit 분리 (A+B / C+G / D+E / F 보안)
  - PR #7 충돌: 0건 (사전 확인 완료)
  - 다음: `/bams:dev plan_designimport품질개선` (Wave 1A hr-agent 3 task + Wave 1B platform-devops 3 task 병렬 → Wave 2 qa-strategy 2 task → Wave 3 메인 PR)

### 진행 중 (신규 — 2026-05-05, 3번째 plan)
- **`plan_T3_sample_bias_filter`** (Backlog, 2 tasks — TASK-055~056) ⭐ 가장 작은 plan
  - Branch: `bams/plan_retro_iteration2` (PR #7 누적 — OQ-A)
  - 부모 record: `product-strategy/2026-05-04-t3-sample-bias-from-T2.md` (R5 표준 경로 첫 dogfooding 산출)
  - PRD/Spec: APPROVED v2 (OQ1=C — A+B 동시 적용)
  - 변경: `agents/product-strategy.md` L170-171 +1줄 (모집단 필터 + 트리거 정밀화)
  - **NF5 메타 self-aware**: 본 plan(코드 +1)은 자기 모집단 필터에 의해 평가 제외 — 첫 자기 적용 사례
  - 다음: `/bams:hotfix T3_filter` (분량 +1 — hotfix 적합) 또는 `/bams:dev plan_T3_sample_bias_filter`

### 진행 중 (이전 — 2026-05-04, 2번째 plan)
- **`plan_T2_R5_dogfooding검증`** (Backlog, 3 tasks — TASK-052~054) ⭐ 신규
  - Work Unit: 전체bams리뷰 / Branch: `bams/plan_retro_iteration2` (PR #7 누적, OQ-A)
  - 부모 retro: `retro_dev_retro개선계획회고_1` P2 (R5 표준 경로 0회 실행)
  - PRD/Spec: APPROVED v2 (OQ A/(b)/(b) — 가장 작은 plan, NF3 +0)
  - **운영 절차 plan — 코드 변경 0**, R5 표준 경로 1회 dogfooding 검증
  - 핵심 발견 (T3 두 번째 사이클): 운영 plan은 분모 0 → "코드 변경 ≥+10" 필터 도입 권고
  - 다음: `/bams:dev plan_T2_R5_dogfooding검증` (3 spawn — orchestrator + hr-agent + qa-strategy)

### 진행 중 (이전 — 2026-05-04, 1번째 plan)
- **`plan_retro_iteration2`** (Backlog, 4 tasks — TASK-048~051) ⭐ 신규 (PR #6 머지 후 main에서 분기)
  - Work Unit: 전체bams리뷰 / Branch: `bams/plan_retro_iteration2` (main 4307d92 base)
  - 부모 retro: `retro_dev_retro개선계획회고_1` (P1 + P3)
  - PRD: `.crew/artifacts/prd/plan_retro_iteration2-prd.md` (APPROVED v2 — OQ A/A/(a)/A)
  - Spec: `.crew/artifacts/design/plan_retro_iteration2-spec.md` (360줄, 자기검증 6/6 PASS)
  - 분류: P0 × 3건 (R1=T5 retro_skip schema / R2=T3 보정 절차 / R3=T1 운영 dogfooding)
  - 변경: event-schema.json +14 / product-strategy.md +13 = **+27줄** (NF3 +80 한도 33.75% 사용)
  - **★ T3 자기 적용 핵심 발견**: 본 사이클 -28.9% drift (직전 +83%/+83%과 방향 역전) → 보정 계수 2.0 잠정 유보, 5 사이클 누적 후 재산정
  - 다음: `/bams:dev plan_retro_iteration2` (hr-agent 2 병렬 + qa-strategy 1 + T1 dogfooding)

### 회고 완료 (2026-05-04)
- **`retro_dev_retro개선계획회고_1`** ✅ COMPLETED — 메타 회고 (R1~R7 dogfooding 평가)
  - 산출물: `.crew/artifacts/retro/retro_dev_retro개선계획회고_1/{phase2-3-kpt-eval,phase5-final-report}.md`
  - 핵심: R4 dogfooding PASS(부분 — A분기), R6 dogfooding PASS(완전 10/10 X=Y), R5 우회 작성 첫 실사용 (records 2건)
  - 신규 improvement records 2건 (P0): pipeline-orchestrator/2026-05-04-retro-skip-event-untested.md + product-strategy/2026-05-04-prd-spec-line-estimate-drift.md
  - 다음 사이클 P0: T1+T5 연계(R4 B/C 분기 + retro_skip schema) + T3(PRD 분량 보정 계수 2.0)

### 진행 중 (신규 — 2026-05-04)
- **`dev_retro개선계획`** ✅ COMPLETED — 3 commits (fa9343e/817965c/da67360), AC 14/15 PASS, R6 dogfooding 10/10 X=Y, R4 dogfooding (Step 4.95 첫 적용 — 사용자 A 선택)
  - PR #6 누적 11 commit (base=main, MERGEABLE)
  - 변경: agents 4 (+72) + completion-protocol +21 = +93줄 (NF3 +200 충족)
  - 다음: `/bams:retro dev_retro개선계획` (R4 dogfooding 사용자 A 선택 후속)

### 진행 중 (이전 — 2026-05-03)
- **`plan_retro개선계획`** ✅ Plan 완료 (Backlog, 8 tasks — TASK-040~047)
  - Work Unit: 전체bams리뷰
  - 부모 retro: `retro_dev_init조직도셋업완결회고_1` + 부모 deep-review2 11 improvement records
  - PRD: `.crew/artifacts/prd/plan_retro개선계획-prd.md` (APPROVED v2 — OQ A/B/A/A/A)
  - Spec: `.crew/artifacts/design/plan_retro개선계획-spec.md` (430줄, 4 hunk, AC15 + NF7 + 자기검증 6/6 PASS)
  - 분류: **Critical 2건(C1: spec After 활성화 / C2: 권한 와일드카드 검사) + Major 4건(M1~M4) + Minor 1건(m1: codex fallback)**
  - 책임 부서장: hr-agent 단일 (5~6 spawn 병렬) + qa-strategy 1회 (회귀)
  - 변경 파일: agents/{hr-agent, qa-strategy, pipeline-orchestrator, product-strategy}.md + references/completion-protocol.md (5 파일 +79줄)
  - 머지 전략: PR #6 누적 (OQ1=A), branch `bams/dev_init조직도셋업완결`
  - hunk 충돌: 0 hard / 1 soft (R3 product-strategy.md SR-3 이후 명시 — 회피 완료)
  - 다음: `/bams:dev plan_retro개선계획` 또는 `/bams:hotfix retro개선계획` (분량 +79 한정 hotfix 적합)

### 회고 완료 (2026-05-03)
- **`retro_dev_init조직도셋업완결회고_1`** ✅ COMPLETED — KPT(5K/7P/6T) + 7 에이전트 평가 + 종합 보고서
  - 산출물: `.crew/artifacts/retro/retro_dev_init조직도셋업완결회고_1/{phase2-3-kpt-eval,phase5-final-report}.md`
  - improvement records: 11건 (hr-agent 4 / pipeline-orchestrator 4 / platform-devops 1 / product-strategy 1 / qa-strategy 1)
  - 정량: 총 6 파이프라인 / 109m / 24/39 issues 처리 / 에이전트 성공률 93.3%
  - 핵심 P0 액션: T1(spec After 활성화) / T2(emit SSOT) / T3(권한 와일드카드 검사)
  - 다음 사이클 진입 시 input: phase2-3-kpt-eval.md + 4 improvement records (2026-05-03)

### 진행 중 (PR #6 누적 — 2026-05-03)
- **`dev_init조직도셋업완결` + `dev_init잔여후속` + `hotfix_init조직도_M1234수정`** ✅ 8 commits 누적, PR #6 review-ready
  - Branch: `bams/dev_init조직도셋업완결` (base=main)
  - 처리 완료: deep-review 39 issues 중 **24건** (P0/P1 11건 + NG1 4건 + NG3 핵심 9건 + NG4 부분 5건)
  - 잔여 이연: NG3 8건(m6~m10/m12/m16) + NG4 sonnet 계열 14명 — 별도 plan
  - 검증: AC15/15 PASS + 시나리오 4/4 PASS + NF7/7 + NG7/8 PASS + 13/13 PASS (NG1+Minor)

### 진행 중 (신규 — 2026-05-02)
- **`plan_init조직도셋업완결`** (Backlog, 7 tasks — TASK-033~039) ⭐ 신규
  - Work Unit: 전체bams리뷰
  - 부모 deep-review: `deep-review_init조직도검증` (Critical 6 / Major 16 / Minor 17 = 39건)
  - PRD: `.crew/artifacts/prd/plan_init조직도셋업완결-prd.md` (APPROVED v2 — OQ A/B/B/A/A 채택)
  - Spec: `.crew/artifacts/design/plan_init조직도셋업완결-spec.md` (640줄, 4 hunk, AC15/15 + NF7/7 PASS)
  - Design-BE: `.crew/artifacts/design/plan_init조직도셋업완결-design-be.md` (NG8 — BE 변경 없음 확정)
  - 범위: P0 Critical 6건(C1~C6) + P1 Major 5건(M1, M2~M4, M16) = 12 R-ID
  - 작업: TASK-033(F1 init.md) + TASK-034(F2 platform-devops) + TASK-035(F3 9개 frontmatter) + TASK-036(F4 product-strategy, plan_SR위임 후) + TASK-037(F5 jojikdo) + TASK-038(F6 qa) + TASK-039(F7 4커밋+PR)
  - 예상 소요: 4~6h (hr-agent 단일 부서장, F2/F3/F5 병렬 가능)
  - 머지 직렬화: `plan_SR위임` 선행 머지 → 본 plan F4 후속
  - 다음: `/bams:dev plan_init조직도셋업완결`

### 부모 deep-review (2026-05-02)
- **`deep-review_init조직도검증`** ✅ COMPLETED — 39건 발견 (Critical 6 / Major 16 / Minor 17)
  - Report: `.crew/artifacts/review/deep-review_init조직도검증-report.md`
  - 핵심: references 19개 누락(C1) / platform-devops 부서장 섹션 부재(C2) / 권한 폭주(M2~M4) / jojikdo Advisor 모순(C5)
  - 5 improvement records: `.crew/memory/{product-strategy,platform-devops,pipeline-orchestrator,hr-agent}/improvements/2026-05-02-*.md`

### 최근 완료 (2026-04-28)
- **`hotfix_wave1병렬` + `hotfix_명칭표준화`** ✅ COMPLETED — 6 commits 누적 (TASK-019/021/022/023/024/032 모두 처리)
  - Wave 1 (4 spawn 병렬, ~20분): TASK-019(메인) + TASK-022(qa) + TASK-023+024(platform-devops) + TASK-032(hr-agent)
  - Wave 2 (1 spawn 직렬, ~10분): TASK-021(product-strategy 설계 + 메인 적용)
  - 잔여: TASK-026(codex login, 사용자 직접)
- **`dev_보안위임표준화`** ✅ COMPLETED — 3 commits (f810f57/f9b4712/a24683c)

### 진행 중
- **`plan_SR위임`** (Backlog, 1 task — TASK-032) (TASK-025 세부 plan)
  - Work Unit: 전체bams리뷰
  - 부모 plan: plan_deepreview후속처리 (TASK-025)
  - PRD: `.crew/artifacts/prd/plan_SR위임-prd.md` (APPROVED v2 — OQ1~OQ5 모두 Recommended)
  - Spec: `.crew/artifacts/design/plan_SR위임-spec.md` (308줄, 12 섹션, 자기 검증 PASS)
  - Design: spec §10 통합 (별도 design.md 없음 — 단일 위임 작업)
  - 범위: 3 에이전트 파일에 SR-1~SR-5 행동 규칙 5건 추가, 합산 +48줄
  - 작업: TASK-032 (hr-agent 단독 spawn, ~1.5~2h)
  - 다음: 메인이 hr-agent 직접 Task tool spawn (spec §1 위임 메시지 그대로 사용)

- **`plan_보안위임표준화`** (Backlog, 5 tasks — TASK-027~031) (TASK-020 세부 plan)
  - Work Unit: 전체bams리뷰
  - 부모 plan: plan_deepreview후속처리 (TASK-020)
  - PRD: `.crew/artifacts/prd/plan_보안위임표준화-prd.md` (APPROVED v2)
  - Spec: `.crew/artifacts/design/plan_보안위임표준화-spec.md` (602줄, 4 hunks, AC1~AC10)
  - Design: `.crew/artifacts/design/plan_보안위임표준화-design.md`
  - 범위: LLM 위임 메시지 보안 표준 + AskUserQuestion 입력 검증 + m-3 분류 미상 처리
  - 작업: TASK-027(F1 신규 ~140줄) + TASK-028(F2) + TASK-029(F3 3 hunks) + TASK-030(QA) + TASK-031(3커밋+PR)
  - 예상 소요: 1.5~2.5h
  - 다음: `/bams:dev plan_보안위임표준화` 또는 `/bams:hotfix 보안위임표준화`

- **`plan_deepreview후속처리`** (Backlog, 7+1 tasks — TASK-019~025 + TASK-026 안내) ⭐ 신규
  - Work Unit: 전체bams리뷰
  - PRD: `.crew/artifacts/prd/plan_deepreview후속처리-prd.md` (APPROVED v2 — OQ1~OQ5 모두 Recommended 채택)
  - Spec: `.crew/artifacts/design/plan_deepreview후속처리-spec.md` (8 섹션, 996줄)
  - Design: `.crew/artifacts/design/plan_deepreview후속처리-design.md`
  - 범위: deep-review 후속 처리 (Major 7 + 핵심 Minor + 시스템 3 + structural 5)
  - 작업: TASK-019(amend) → TASK-020~024(5 hotfix) + TASK-025(hr-agent SR 위임) + TASK-026(사용자 직접)
  - 누적 소요: ~6~8.5h
  - 다음: TASK-019 amend 후 영역별 hotfix 트리거 (`/bams:hotfix {slug}`) 또는 `/bams:dev plan_deepreview후속처리`

### 최근 완료 (2026-04-27)
- **`deep-review_retro범위가드`** ✅ COMPLETED — Critical 0, Major 7, Minor 12+. 종합 리포트 + 5 improvement records 생성
- **`dev_retro범위가드`** ✅ COMPLETED — 3 commits (65a189b/08b2e2b/3f297de), AC1~AC12 12/12 PASS, QG iteration 1 PASS
  - Branch: `bams/dev_retro범위가드` (PR 생성 가능)
  - 변경: retro-protocol.md / phase-2-retro.md / phase-4-improve.md (3 파일, 7 hunks, +79/-13)
- **`plan_retro범위가드`** ✅ COMPLETED — PRD/spec/design 작성, OQ1~OQ5 사용자 답변 반영

### 진행 중 (이전 작업)
- **`plan_opus47개선6종`** (Backlog, 6 tasks — TASK-007~012)
  - Work Unit: 전체bams리뷰
  - PRD: `.crew/artifacts/prd/plan_opus47개선6종-prd.md`
  - Spec: `.crew/artifacts/design/plan_opus47개선6종-spec.md`
  - Design: `.crew/artifacts/design/plan_opus47개선6종-design.md`
  - 범위: 이슈 1/2/3/4/5/7 (6건, 이슈 6 사용자 스킵 결정)
  - 영향: agents 10파일 + commands 31파일 + tests 3파일 + references/model-config.md 신규
  - 커밋 전략: 4커밋 분리 (정책/agents/commands/security)
  - 예상 소요: 4.5~5.5h
  - 다음: `/bams:dev plan_opus47개선6종`

### 완료 파이프라인 (opus47 관련)
- `dev_에이전트모델opus47업그레이드` (commit d453a38) — 5 부서장 `opus` → `claude-opus-4-7[1m]` 업그레이드 (39 files)
- `deep-review_opus47사용리뷰` — 5관점 심층 리뷰, 성능 위주 이슈 7건 발견

### 완료 파이프라인
- `dev_vizDB재설계` — viz DB 전면 재설계 + UI 2페이지 구조 (12태스크, 92 tests, 87.9/100)
- `dev_워크상세파이프라인탭` — work/[slug] 탭 구조 개편 (6태스크)
- `feature_HR회고페이지` — HR 별도 페이지 + AppHeader 네비 (4파일)

### viz UI 구조 (v3.0)
- `/` (홈): Work Units 카드 그리드 + StatusFilter
- `/work/[slug]`: WU 3탭(Metaverse/Pipeline/Retro), Pipeline 서브탭(Agent/Timeline/DAG/Logs)
- `/hr`: HR 대시보드 (회고 기록, 에이전트 성과)
