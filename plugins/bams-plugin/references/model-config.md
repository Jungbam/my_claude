# 에이전트 모델 정책 (Model Configuration)

> 이 문서는 bams-plugin 에이전트의 모델·effort 배정 단일 진실 소스(single source of truth).
> 신규 에이전트 추가 또는 모델 업그레이드 시 이 문서를 먼저 갱신한 뒤 각 에이전트 frontmatter(`model:` + `effort:`)에 반영한다.

## 정책 원칙 (4-tier, effort 차등)

Tier 1·2는 **같은 모델(`claude-opus-5-5`)을 공유하고 `effort`로 차등**한다. Opus 5.5는 Opus 5·4.8보다 저렴하면서 상위 성능이라 두 tier를 단일 모델로 통합했고, 판정 난도가 가장 높은 Tier 1만 `xhigh`, 부서장/구현 Tier 2는 `high`를 쓴다.

frontmatter에는 `model:` 바로 다음 줄에 `effort:` 필드를 둔다(서브에이전트/스킬/커맨드가 지원하는 값: `low|medium|high|xhigh|max`). 모델 ID는 날짜 서픽스·`[1m]` 서픽스 없이 문자열 그대로 쓴다.

### Tier 1 — Opus 5.5 / effort `xhigh`
**핵심 의사결정**: 파이프라인 전체 방향을 좌우하는 Phase 계획/게이트 Go-No-Go 판단, PRD/전략 수립, Quality Gate 최종 판정.

- 파이프라인당 호출 빈도는 가장 낮으나(Phase당 1~2회) 판단 오류의 다운스트림 영향이 최대라 effort를 최상위(`xhigh`)로 둔다.
- 여러 부서/에이전트의 산출물을 종합해 단일 판정을 내리는 지점에만 배정.
- 대상: pipeline-orchestrator, product-strategy, project-governance, release-quality-gate
- 사용자 결정(2026-08, 비용 사유): Tier 1은 Fable 계열이 아닌 Opus 계열을 쓴다.

### Tier 2 — Opus 5.5 / effort `high`
**부서장/구현**: 복잡 추론, 다중 specialist 조율, 실제 구현/변경 작업 수행.

- 부서장급 조율과 더불어 코드/문서를 직접 구현·변경하는 역할 포함.
- 판단 깊이가 깊거나 여러 하위 에이전트/문서를 종합하는 역할.
- 대상: frontend-engineering, backend-engineering, platform-devops, data-integration, design-director, qa-strategy, product-analytics, hr-agent, resource-optimizer, cross-department-coordinator (모든 부서장 포함 — 예외 없음; data-integration은 프로덕션 코드 구현 specialist로 2026-09-16 Tier 2 승격).

### Tier 3 — Sonnet 5.5 / effort `medium` (일부 `high`)
**specialist**: 정형 구조 출력, 빠른 응답, 단일 도메인 세부 작업.

- 부서장의 위임을 받아 특정 영역을 처리. Sonnet 5.5는 Sonnet 5와 동일 가격이라 비용 변동 없이 전환.
- TTFT(첫 토큰까지 시간)와 응답 속도가 사용자 체감 UX에 직접 기여.
- 코드 생성/검증 정확도가 민감한 **automation-qa, ui-diff-applier, visual-fidelity-verifier, accessibility-auditor** 4개는 `effort: high`, 나머지 16개는 `medium`.
- 대상(20개): business-analysis, ux-research, automation-qa, defect-triage, experimentation, business-kpi, ui-designer, ux-designer, graphic-designer, motion-designer, design-system-agent, guide-decomposer, guide-recomposer, ui-diff-applier, data-binding-mapper, visual-fidelity-verifier, nextjs-convention-mapper, accessibility-auditor, routing-strategist, ssr-csr-decider

### Tier 4 — Haiku 5.5 / effort `low`
**결정론적 절차 자동화**: bash 절차 위주 저비용 실행. 토큰 절감을 최우선 축으로 하는 skill/에이전트 위임 경로.

- 파괴 명령 없거나 별도 확인 게이트로 안전 확보.
- Haiku 5.5는 Haiku 4.5보다 약 10배 저렴($0.10/$0.50 per MTok)하여 저비용 축에 적합.
- 대상: git-ops-agent, performance-evaluation

### 선택 기준 매트릭스

| 요인 | Tier 1 (opus-5-5/xhigh) | Tier 2 (opus-5-5/high) | Tier 3 (sonnet-5-5/medium·high) |
|------|-------------------------|------------------------|---------------------------------|
| 역할 | 파이프라인 게이트/전략 판정 | 부서장/구현/크로스도메인 | 단일 전문가 |
| 입력 크기 | 중~대 (종합 판단) | 중~대 (수십만 토큰) | 소~중 |
| 추론 깊이 | 최종 판정/전략 | 전략/설계/구현 판단 | 정형 구조 출력 |
| 호출 빈도 | 가장 낮음 (Phase당 1~2회) | 낮음 (Phase당 1~3회) | 높음 (batch 실행) |
| 다운스트림 영향 | 최대 (파이프라인 전체 방향) | 큼 (부서 산출물 품질) | 국지적 (단일 태스크) |
| 체감 UX | 판정 정확도 우선 | 품질 우선 | 속도 우선 |

**컨텍스트**: 5.5 계열은 기본 1M 컨텍스트를 제공하므로 `[1m]` 서픽스를 쓰지 않는다. 모델 ID에는 날짜·서픽스를 붙이지 않는다.

## FE/디자인 이중 구조 — Claude 스폰 컨트롤러 + codex 실행 위임 모델

FE/디자인 16개 에이전트(frontend-engineering, design-director + 디자인 specialist 14)는 **두 개의 서로 다른 모델 개념**을 동시에 쓴다. 과거 이 둘을 혼동해 gpt 모델명을 frontmatter에 넣었다가 spawn이 전면 실패한 사례가 있어(변경 이력 2026-08-25 참조) 반드시 구분한다.

| 개념 | 값 | 정의 | 제약 |
|------|-----|------|------|
| **① frontmatter `model:` (스폰 컨트롤러)** | Claude 계열 (`claude-opus-5-5` / `claude-sonnet-5-5`) | Claude Code Agent/Task tool이 spawn하는 harness 컨트롤러 모델. 입력 전처리·출력 검증·도구 호출·산출물 저장을 담당. | Claude 별칭(sonnet/opus/haiku/fable) 또는 `claude-*` ID만 허용. OpenAI(gpt-*) 모델명을 넣으면 spawn이 "model may not exist / no access" 에러로 실패한다. |
| **② 실행 위임 모델 (핵심 추론)** | `gpt-6.1-sol` (OpenAI codex) | 에이전트 **본문**에서 `mcp__codex__codex` MCP 도구(1차) → Bash `codex` CLI(fallback)로 위임하는 실제 핵심 추론/생성 모델. | frontmatter와 무관. MCP 도구 파라미터 `model: "gpt-6.1-sol"`로 지정하거나 `~/.codex/config.toml` 기본값 사용. |

**핵심 규칙:**
1. frontmatter `model:` 필드와 jojikdo.json `model` 필드에는 Claude 모델명만 기입한다. gpt-* 모델명을 이 두 곳에 넣으면 spawn이 실패하기 때문이다.
2. codex(gpt-6.1-sol)는 에이전트 본문의 `mcp__codex__codex` 호출 / `codex` CLI 인자로만 지정한다. 이는 `skills/codex/SKILL.md`가 codex CLI를 호출하는 것과 동일한 별도 메커니즘이다.
3. 아래 "에이전트별 모델 매핑" 테이블의 모델 컬럼은 **①(스폰 컨트롤러)** 값이다. **②(실행 위임 모델)**는 본 절과 각 에이전트 본문 "codex 추론 위임" 섹션(`references/codex-delegation.md` SSOT)에서만 정의한다.

**실행 위임 경로 (본문 공통 패턴):**
- **1차**: `mcp__codex__codex` MCP 도구 — `prompt` / `model: "gpt-6.1-sol"` / `sandbox`(read-only|workspace-write) / `cwd` / `approval-policy: "never"`. 후속 턴은 `mcp__codex__codex-reply`(threadId).
- **2차(fallback)**: Bash `codex exec -m gpt-6.1-sol ...` CLI (MCP 도구 미가용 시).
- **최후**: Claude 컨트롤러 직접 처리 + design-director 에스컬레이션.
- **viz via 태그**: MCP 성공 `via gpt-6.1-sol (codex MCP)` / CLI fallback `via gpt-6.1-sol (codex CLI(fallback))` / 최후 `via {sonnet|opus}[fallback:codex-unavailable]`.

**접근성 검증**: 2026-11-02 `codex exec -m gpt-6.1-sol` ping → PONG 확인(CLI 경로). `~/.codex/config.toml` 기본값도 `gpt-6.1-sol`이라 codex 계정에서 접근 가능. MCP 경로(`mcp__codex__codex`)는 이 세션에서 codex MCP 서버 연결 실패로 미검증 — 다음 세션에서 재검증이 필요하다.

## 환경 요구사항

harness의 display/집계 정규화 함수가 opus 계열 모델 ID를 coarse한 `"opus"` 라벨로 다운그레이드 기록하는 알려진 현상이 있다. API 실행 경로는 영향 없어 실제 모델은 정상 실행되나, 로그/viz/비용 집계에 부정확한 모델명이 저장될 수 있다.

### 해결책 (개인 환경 설정)

`~/.claude/settings.json`의 `env` 섹션에 다음을 설정하면 display/집계 경로도 정확한 ID로 통일된다:
```json
{
  "env": {
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "claude-opus-5-5"
  }
}
```

### 팀/CI 전파 주의

위 설정은 개인 홈 디렉토리 파일이라 Git 추적 대상이 아니다. 다음 상황에서 재설정이 필요하다:
- 신규 개발자 합류 시
- OS 재설치 또는 `~/.claude/` 초기화 시
- CI/CD 환경에서 에이전트 실행 시 (CI 환경변수로 `ANTHROPIC_DEFAULT_OPUS_MODEL=claude-opus-5-5` 설정)

향후 옵션: 프로젝트 루트 `.claude/settings.json`로 옮기면 Git 추적 + 팀 자동 전파가 가능하다. harness가 프로젝트별 settings를 지원하므로 마이그레이션 시 본 문서를 업데이트한다.

### 검증 방법

설정 적용 후 Claude Code를 재시작하고 샘플 파이프라인을 1회 실행한 뒤, 부서장 spawn 트랜스크립트에서 모델명(`claude-opus-5-5`)이 사용되는지 확인한다(업그레이드 절차의 spawn ping 사전검증 참조).

## 에이전트별 모델 매핑 (36개)

> 모델 컬럼 = frontmatter 스폰 컨트롤러(①) 값, effort 컬럼 = frontmatter `effort:` 값이다. FE/디자인 16개 에이전트는 이와 별개로 본문에서 **gpt-6.1-sol을 `mcp__codex__codex`(1차)/codex CLI(fallback)로 실행 위임(②)**한다 — 상세는 위 "FE/디자인 이중 구조" 절 참조. 매핑표에는 gpt 모델명을 기입하지 않는다.

### 총괄팀

| 에이전트 | 역할 | 모델 | effort | 비고 |
|---------|------|------|--------|------|
| pipeline-orchestrator | 조언자 (총괄) | claude-opus-5-5 | xhigh | Phase 계획, 부서장 라우팅 조언, 게이트 Go/No-Go 판단 |

### 기획부 (Product)

| 에이전트 | 역할 | 모델 | effort | 비고 |
|---------|------|------|--------|------|
| product-strategy | 기획 부서장 | claude-opus-5-5 | xhigh | 제품 비전, PRD/전략 작성, 하위 specialist 조율 |
| business-analysis | 기획 specialist | claude-sonnet-5-5 | medium | 요구사항 분해, 기능 명세 (정형 출력) |
| ux-research | 기획 specialist | claude-sonnet-5-5 | medium | 사용자 리서치 |
| project-governance | 프로젝트 거버넌스 | claude-opus-5-5 | xhigh | Quality Gate 판정 — 다관점 종합 판단 |

### 개발부 (Engineering)

| 에이전트 | 역할 | 모델 | effort | 비고 |
|---------|------|------|--------|------|
| frontend-engineering | 개발 FE 부서장 | claude-opus-5-5 | high | UI 구현, 컴포넌트 설계 (본문 codex 위임) |
| backend-engineering | 개발 BE 부서장 | claude-opus-5-5 | high | API 설계, 트랜잭션/동시성 |
| platform-devops | 개발 인프라 부서장 | claude-opus-5-5 | high | 인프라, CI/CD, 보안 |
| data-integration | 개발 specialist (구현) | claude-opus-5-5 | high | 이벤트 트래킹, 외부 연동, 마이그레이션 — Tier 2 (2026-09-16 승격) |
| git-ops-agent | 개발 specialist (저비용) | claude-haiku-5-5 | low | git skill 실행 전담, 토큰 절감 위임 경로 |

### 디자인부 (Design)

| 에이전트 | 역할 | 모델 | effort | 비고 |
|---------|------|------|--------|------|
| design-director | 디자인 부서장 | claude-opus-5-5 | high | 크리에이티브 디렉션, 하위 specialist 조율 (본문 codex 위임) |
| ui-designer | 디자인 specialist | claude-sonnet-5-5 | medium | 컴포넌트 디자인 |
| ux-designer | 디자인 specialist | claude-sonnet-5-5 | medium | 와이어프레임, 프로토타입 |
| graphic-designer | 디자인 specialist | claude-sonnet-5-5 | medium | 아이콘, 일러스트 |
| motion-designer | 디자인 specialist | claude-sonnet-5-5 | medium | 애니메이션 |
| design-system-agent | 디자인 specialist | claude-sonnet-5-5 | medium | 디자인 토큰 |
| guide-decomposer | 디자인 specialist (변환) | claude-sonnet-5-5 | medium | 외부 가이드 분해 |
| guide-recomposer | 디자인 specialist (변환) | claude-sonnet-5-5 | medium | 분해 산출물 재구성 + preview HTML |
| ui-diff-applier | 디자인 specialist (구현) | claude-sonnet-5-5 | high | 가이드-현행 UI patch.diff 생성 (Read-only, 코드 정확도 민감) |
| data-binding-mapper | 디자인 specialist (변환) | claude-sonnet-5-5 | medium | RSC fetch 매핑 |
| visual-fidelity-verifier | 디자인 specialist | claude-sonnet-5-5 | high | 시각 일치성 검증 (bams:browse, 검증 정확도 민감) |
| nextjs-convention-mapper | 디자인 specialist | claude-sonnet-5-5 | medium | App Router 컨벤션 매핑 |
| accessibility-auditor | 디자인 specialist (변환) | claude-sonnet-5-5 | high | WCAG 2.2 AA + axe-core 감사 (검증 정확도 민감) |
| routing-strategist | 디자인 specialist (변환) | claude-sonnet-5-5 | medium | 다중 페이지 라우팅 그래프 설계 |
| ssr-csr-decider | 디자인 specialist (변환) | claude-sonnet-5-5 | medium | Server/Client Component 경계 결정 |

### QA부 (Quality)

| 에이전트 | 역할 | 모델 | effort | 비고 |
|---------|------|------|--------|------|
| qa-strategy | QA 부서장 | claude-opus-5-5 | high | 테스트 전략, 리스크 분석 |
| automation-qa | QA specialist | claude-sonnet-5-5 | high | E2E 자동화 (코드 생성 정확도 민감) |
| defect-triage | QA specialist | claude-sonnet-5-5 | medium | 결함 분류 |
| release-quality-gate | QA 최종 승인 | claude-opus-5-5 | xhigh | 출시 가능 여부 최종 판단 (Tier 1) |

### 평가부 (Evaluation)

| 에이전트 | 역할 | 모델 | effort | 비고 |
|---------|------|------|--------|------|
| product-analytics | 평가 부서장 | claude-opus-5-5 | high | 행동 분석, 릴리즈 영향 |
| experimentation | 평가 specialist | claude-sonnet-5-5 | medium | A/B 테스트 |
| performance-evaluation | 평가 specialist (저비용) | claude-haiku-5-5 | low | 부하/성능 — 판정 기준 완전 수치화로 결정론화, 최고빈도 자동트리거 |
| business-kpi | 평가 specialist | claude-sonnet-5-5 | medium | KPI 지표 |

### 경영지원 (Operations — 독립 부서장급)

| 에이전트 | 역할 | 모델 | effort | 비고 |
|---------|------|------|--------|------|
| resource-optimizer | 경영지원 | claude-opus-5-5 | high | 모델 선택 전략 (메타 역할) |
| hr-agent | 경영지원 | claude-opus-5-5 | high | 에이전트 생명주기, 조직도 관리 |
| cross-department-coordinator | 경영지원 | claude-opus-5-5 | high | 부서간 협업 조율 |

**총계**: Opus 5.5 = 14개 (Tier 1 xhigh 4 + Tier 2 high 10) / Sonnet 5.5 = 20개 (specialist, medium 16 + high 4) / Haiku 5.5 = 2개 (저비용/결정론 low) — 합계 36개

## 업그레이드 절차

새 모델 도입 시 (예: Opus 5.6, Sonnet 5.6):

0. **Spawn ping 사전검증 (SSOT 갱신 전)**:
   - 전환 전 대상 그룹에서 저위험 에이전트 1개를 canary로 골라 trivial task(예: "역할 1문장 요약")로 실제 spawn 테스트를 한다.
   - canary spawn이 status=success면 접근 가능으로 판정 → 나머지 SSOT 갱신(1~5단계) 진행.
   - 실패 시 전환을 보류하고 대체 모델 또는 Claude 계열 폴백을 재검토한다. 재시도는 모델명 오타 확인용 최대 1회로 제한한다.
   - **세션 캐싱 주의**: harness가 에이전트 정의를 세션 시작 시점에 로드하므로, 파일을 고쳐도 같은 세션 canary spawn이 stale 값으로 실패할 수 있다(2026-08-21 실측). 이때는 (a) 독립 CLI(예: `codex exec ... -c 'model="{모델명}"'`)로 대체 검증하고, (b) SSOT는 갱신하되 변경 이력에 "harness Task tool 레벨은 세션 재시작 후 검증 필요"를 명시하며, (c) 다음 세션에서 canary 재검증을 최우선으로 등록한다.
   - 근거: `.crew/memory/hr-agent/improvements/2026-07-09-codex-model-access-untested.md`, `.crew/memory/hr-agent/improvements/2026-08-21-codex-model-deprecated-recurrence.md`

1. **본 정책 문서 갱신**: 매핑 테이블의 모델·effort 열을 일괄 변경하고, 변경 이력 섹션에 날짜/사유를 추가한다.

2. **에이전트 frontmatter 일괄 치환** (model + effort):
   ```bash
   # 예: opus 5.5 → 5.6
   find plugins/bams-plugin/agents -name "*.md" -exec \
     sed -i '' 's/^model: claude-opus-5-5$/model: claude-opus-5-6/' {} \;
   ```

3. **검증**:
   ```bash
   grep -E '^(model|effort):' plugins/bams-plugin/agents/*.md | sort | uniq -c
   ```

4. **테스트**:
   - `cd plugins/bams-plugin && bun test`
   - 경량 파이프라인(`/bams:q`) 1회 smoke 실행

5. **단일 커밋**으로 마무리: 커밋 메시지에 본 문서 경로 + 변경 내역을 참조한다.

## 변경 이력

### 2026-11-02 — 5.5 세대 전환 + effort 도입 + codex gpt-6.1-sol

- 파이프라인: dev_모델프롬프트최신화
- 사유: Opus 5.5($4/$20)가 Opus 5·4.8($5/$25)보다 저렴하면서 상위 성능이라 Tier 1·2를 단일 모델(`claude-opus-5-5`)로 통합하고 effort(xhigh/high)로 차등. Sonnet 5.5는 Sonnet 5와 동일가라 비용 변동 없이 `claude-sonnet-5-5` 전환. Haiku 5.5($0.10/$0.50)는 Haiku 4.5 대비 약 10배 저렴 → Tier 4 전환. codex 실행 위임 모델은 사용자 결정(위임 구조 유지, 모델만 최신화)에 따라 `gpt-5.6-luna` → `gpt-6.1-sol`.
- 사용자 결정 2건: (1) Tier 1은 Fable 계열이 아닌 Opus 5.5 + xhigh. (2) codex 위임 구조는 유지하고 모델만 gpt-6.1-sol로 최신화.
- 내용:
  - Tier 1·2 = `claude-opus-5-5`(effort xhigh/high), Tier 3 = `claude-sonnet-5-5`(effort medium; automation-qa·ui-diff-applier·visual-fidelity-verifier·accessibility-auditor 4개는 high), Tier 4 = `claude-haiku-5-5`(effort low).
  - frontmatter에 `effort:` 필드 도입(`model:` 다음 줄). 매핑표에 effort 컬럼 추가.
  - FE/디자인 이중 구조·codex-delegation.md SSOT·best-practices·agent-rules의 codex 실행 위임 모델을 gpt-6.1-sol로 갱신. frontmatter·jojikdo.json `model`에는 gpt 명을 기입하지 않는 규칙 유지.
  - jojikdo.json `model` 필드(git_ops_agent·performance_evaluation → haiku-5-5, hr_agent·data_integration → opus-5-5, design specialist 9 → sonnet-5-5) 갱신.
  - 이전 "Opus 5 vs Opus 4.8 혼동 주의" 문구 제거(동일 모델·effort 차등으로 혼동 소지 소멸). `[1m]` 안내를 5.5 계열 기본 1M로 갱신. 환경 요구사항 ANTHROPIC_DEFAULT_OPUS_MODEL 예시를 claude-opus-5-5로 현행화.
- 검증 상태: 2026-11-02 `codex exec -m gpt-6.1-sol` ping → PONG 확인(CLI). codex MCP 경로는 이 세션에서 MCP 서버 연결 실패로 미검증 → 다음 세션 재검증 필요. Claude harness Task tool 레벨은 세션 캐싱으로 세션 재시작 후 canary 재검증 필요.
- 총계: 36개 유지(Opus 5.5 14 / Sonnet 5.5 20 / Haiku 5.5 2).

### 2026-09-16 — Tier 전수 재검토: data-integration Tier 3 → Tier 2 승격 (1건)

- data-integration은 Write/Edit 권한으로 결제·인증·웹훅 외부 연동 코드, DB 마이그레이션(롤백 SQL 동봉), ETL 파이프라인을 직접 구현하는, 승격 전 유일한 Tier 3 에이전트였다. 동일하게 프로덕션 코드를 구현하는 FE/BE/platform-devops는 전원 Tier 2이며, Tier 2 정의("실제 구현/변경 작업 수행")에 문자 그대로 해당한다.
- 실패 비용이 데이터 정합성·결제 오류·시크릿 노출(웹훅 서명 검증, 서버 전용 모듈 격리)로 직결되어 "data correctness / security 영역은 quality 우선" 기준에 해당한다.
- 호출 빈도가 낮아(retro_전체회고_2 94-slug 집계 창에서 호출 0건) 비용 영향은 미미하다.
- 2026-08-20 plan_모델재분배프롬프트세분화 FR-M4("유지, opus 근거 부족")는 비용 증가 0(NFR-1) 제약 하의 판단이었으며, 2026-09-16 사용자 지시(역할·실패 비용 기준 tier 전수 재검토, 데이터 정합성 영역 품질 우선)로 재평가됨. 나머지 specialist — Tier 3의 business-analysis, ux-research, automation-qa, defect-triage, experimentation, business-kpi 6개와 Tier 4(Haiku)의 performance-evaluation — 는 유지.
- 신규 모델 ID 도입 없음(claude-opus-4-8은 승격 전부터 9개 부서장급 에이전트에서 운용 중) → 업그레이드 절차 Step 0 spawn ping 생략. harness는 에이전트 정의를 세션 시작 시 스냅샷하므로 Task tool 레벨 반영은 세션 재시작 후 확인.
- 동시 처리: 커맨드·레퍼런스·best-practices·skills/codex/SKILL.md에 잔존하던 deprecated codex 모델 ID gpt-5.3-codex를 정본 gpt-5.6-luna로 정정. plan.md Phase 2 codex 게이트는 (a) deprecated 모델 지정으로 auth ping이 항상 실패하고 (b) macOS에 `timeout` 명령이 없어 같은 분기가 항상 참이 되어 무조건 Skipped 처리되던 배선 버그 2건을 정정(`_to` 래퍼: timeout/gtimeout 부재 시 무타임아웃 실행 — hang 방어 상실은 후속 과제). skills/codex/SKILL.md는 `codex review` 호출 2곳이 HTTP 400으로 전면 실패하던 것을 정정(SKILL.md는 .tmpl 생성기 부재로 직접 편집).
- 하향 후보(변경 없음, 향후 검토): resource-optimizer(retro_전체회고_2 "가장 뚜렷한 과잉 배정"), cross-department-coordinator(체크리스트 중심 절차).

### 2026-08-25c — Tier 1 Fable 5 → Opus 5 전면 교체 (claude-opus-5 신설)

- 파이프라인: hotfix_tier1_fable를opus5로
- 사유: **Tier 1(claude-fable-5) 토큰 사용량 부담** (사용자 요청).
- 내용:
  - Tier 1 모델을 `claude-fable-5` → **`claude-opus-5`**(Anthropic 최신 Opus 5)로 전면 교체. 대상 4개 에이전트: pipeline-orchestrator, product-strategy, project-governance, release-quality-gate.
  - 당시 claude-opus-5(Tier 1)와 claude-opus-4-8(Tier 2)은 서로 다른 세대의 별개 모델로 의도적으로 공존했다. 사용자가 "opus-4-8과 통합" 대신 "opus-5 신설(별도 tier 공존)"을 선택. (이후 2026-11-02 세대 전환에서 Tier 1·2 모두 claude-opus-5-5로 통합되며 effort 차등으로 전환됨.)
  - 교체 범위: agents frontmatter 4곳, 커맨드 viz emit 문자열 30곳(+ `commands/bams/dev/phase-0-init.md`의 stale "fable" 모델선택 설명문 1곳), export.md 템플릿 예시 2곳, model-config.md SSOT(Tier 1 헤딩·매트릭스 컬럼·매핑표 4행·총계).
  - jojikdo.json은 model 필드 부재로 대상 아님.
- 불변: 총계 37개 유지(Tier 1 = 4개, 모델명만 fable→opus-5). Tier 2~4 배정 불변.
- 참고: `fable`은 여전히 유효한 Claude 별칭이며(모델 자체 존재), 본 프로젝트에서 Tier 1 배정만 해제된 것 — model-config의 "Claude 별칭(...fable)" 언급은 정상.

### 2026-08-25b — FE/디자인 codex 실행 위임 MCP 전환 + 이중 구조 정식 문서화

- 파이프라인: hotfix_gpt모델명frontmatter복구 (후속 — 사용자 의도 정정 반영)
- 배경: 사용자 의도는 "FE/디자인 에이전트가 **실제 추론을 codex(OpenAI)에 위임**"하는 것 (MCP로 codex 연결됨). frontmatter=Claude 하드 제약은 유지하되, 위임은 본문 로직으로 구현.
- 내용:
  - **실행 위임 모델(②)** 개념을 frontmatter 스폰 컨트롤러(①)와 명확히 분리하여 "FE/디자인 이중 구조" 절로 정식 문서화 (재발 방지 핵심 — 지난 2회 오진의 원인이 이 두 개념 혼동이었음).
  - FE/디자인 16개 에이전트 본문의 codex 위임 경로를 **`mcp__codex__codex` MCP 도구 1차 + Bash codex CLI fallback**으로 통일. 기존 위임 로직 보유 9개는 CLI→MCP 1차 전환, 로직 부재 7개(frontend-engineering, design-director, design-system-agent, graphic-designer, motion-designer, ui-designer, ux-designer)는 위임 섹션 신설(07-09 커밋에서 frontmatter만 gpt로 바뀌고 본문 위임이 누락돼 순수 Claude로만 동작하던 갭 해소).
  - viz result_summary via 태그를 `via gpt-5.6-luna (codex MCP)`로 통일 (fallback 시 `codex CLI(fallback)` / `{tier}[fallback:codex-unavailable]`).
  - `mcp__codex__codex`(model=gpt-5.6-luna) ping 테스트 통과 — codex 계정 접근 가능 확인.
- 불변: frontmatter `model:`(①)과 jojikdo.json `model`은 Claude 계열 유지. gpt 모델명은 두 필드에 절대 미기입.

### 2026-08-25 — FE/디자인 16개 에이전트 근본원인 복구 (gpt 모델명 → Claude 계열)

- 파이프라인: hotfix_gpt모델명frontmatter복구
- 근본 원인: **Claude Code harness의 Agent/Task tool `model` 파라미터는 Claude 모델만 허용한다** (별칭 sonnet/opus/haiku/fable 또는 `claude-*` 전체 ID). OpenAI 모델명(gpt-5-codex, gpt-5.3-codex, gpt-5.6-luna 등)은 이 필드에 애초에 넣을 수 없는 값이며, harness가 이를 literal spawn 모델로 읽어 "model may not exist / no access" 에러로 spawn을 전면 실패시킨다. `codex` 스킬이 codex CLI를 bash로 호출하며 `-c 'model="gpt-5.x-codex"'`로 OpenAI 모델을 지정하는 것과는 **완전히 별개의 메커니즘**이다.
- 오류 발생 경위: 2026-07-09 커밋 aea7fac에서 FE/디자인 16개 에이전트 frontmatter를 gpt-5-codex로 변경하면서 시작. 이후 07-09·08-24 두 차례 "핫픽스"가 "deprecated된 모델명을 최신명으로 교체하면 된다"고 오진(gpt-5.3-codex → gpt-5.6-luna, 커밋 ef73d17)하여 근본 원인을 놓치고 동일 에러가 반복 재발. 07-09 직전 커밋 8aa19d4(3-tier 전환) 시점에는 claude-opus-4-8/claude-sonnet-5로 정상 동작했음.
- 복구 내용:
  - 16개 에이전트 frontmatter `model:` → 부서장 2곳(frontend-engineering, design-director) = claude-opus-4-8, specialist 14곳 = claude-sonnet-5로 원상 복구.
  - "유지 — gpt-5.6-luna" 버킷 섹션 삭제. FE/디자인 부서장 2곳을 Tier 2, specialist 14곳을 Tier 3로 재편입. Tier 2 "FE/디자인 부서장 제외" 예외 문구 삭제 (이제 모든 부서장 = Tier 2, 예외 없음).
  - 매핑표 16행 모델 컬럼 갱신, 총계 재계산(Opus 8→10, Sonnet 7→21, gpt 버킷 제거, 합계 37 불변).
  - jojikdo.json model 필드 9곳(design specialist) → claude-sonnet-5.
  - agents/*.md 본문의 spawn/frontmatter 식별 모델 참조(spawn `model` 필드 2건, "frontmatter model:" 서술)도 Claude로 동기화. codex CLI 위임 인자(`_CODEX_MODEL=` 등)는 codex 스킬과 동일한 별도 메커니즘이므로 유지 — 단, frontmatter가 Claude로 복구됨에 따라 codex 위임 아키텍처 자체의 존치 여부는 별도 검토 권고.
- **재발 방지 원칙**: agents/*.md frontmatter `model:`과 jojikdo.json `model` 필드에는 Claude 모델명만 기입한다. OpenAI(gpt-*) 모델은 codex CLI 호출 인자 전용이며 이 두 필드에 절대 사용 금지.

### 2026-08-21 — codex 계열 16개 에이전트 모델명 전환 (deprecated 대응)

- 파이프라인: hotfix_codex모델명전환
- 내용: gpt-5.3-codex(구, 2026-07-09 이전 세대)가 deprecated되어 spawn 전면 실패.
  GPT-5.6 세대(2026-07-09 출시) 중 luna(빠른 작업) tier로 16개 에이전트 전체 통일 전환.
  ~/.codex/config.toml 개인 설정 및 codex CLI 레벨에서 gpt-5.6-luna 정상 동작 검증 완료.
  harness Task tool 레벨 검증은 세션 캐싱 이슈로 이번 세션 내 불가 — 재시작 후 확인 필요.
- 근거: 2026-07-09 hotfix_codex_model_access 선례(당시 SSOT 유지 결정) 재검토,
  이번엔 올바른 대체 모델명이 확인되어 SSOT 갱신으로 전환.

### 2026-08-20 — specialist 정밀 재분배 (haiku 하향 1건)

- 파이프라인: plan_모델재분배프롬프트세분화 → (후속 dev)
- 내용: performance-evaluation을 Tier 3 → Tier 4로 이동 (claude-sonnet-5 → claude-haiku-4-5-20251001). 8개 specialist 전수 개별 평가 결과 유일한 변경 근거 보유 — IMP-PE-2로 판정 기준 완전 수치화(p95 +10%=FAIL / -5%=PASS / 그외=CONDITIONAL), dev/feature/hotfix 전건 자동트리거 최고빈도. 나머지 7개 sonnet-5 유지. 상승 방향 변경 0건 (NFR-1).
- orphan 커밋 b936931(specialist 8개 전면 opus 승격)은 본 재분배 확정으로 공식 폐기 — cherry-pick 영구 금지 (FR-M10).
- 근거: `.crew/artifacts/prd/plan_모델재분배프롬프트세분화-prd.md` §4 FR-M1~M10

### 2026-07-10 — git 관리 skill + Haiku 4.5 Tier 도입

- 파이프라인: plan_git관리skill세트 → dev_git관리skill세트
- 내용: git-sync/rollback/stash/branch 4 skill 신설 (별도 TASK-131). git-ops-agent(haiku 4.5) 신규 등록. Tier 4 신설 + 총계 36→37.

### 2026-07-09-postscript — Tier 2 예외 명시 (review_codex디자인FE개선 M3 hotfix)

- 파이프라인: `review_codex디자인FE개선` (Major M3 후속 hotfix)
- 내용: Tier 2 정의가 frontend-engineering·design-director를 "부서장"으로 포함하는 것처럼 읽혀 실제 gpt-5-codex 배정과 taxonomy gap 발생. Tier 2 대상 목록에 "(FE/디자인 부서장 제외)" 각주 + 예외 문단 1건 추가하여 "모든 부서장 = Tier 2" 오독을 차단. 대안 A(최소 침습) 채택 — 기존 tier 명명·매핑표·총계는 불변 (대안 B의 Tier 2-D 승격은 별도 plan 권고).

### 2026-07-09 — FE/디자인 설계 Codex 우선 정책

- 파이프라인: `plan FE디자인-codex-우선화`
- 내용:
  - FE/디자인 설계 관련 10개 에이전트(frontend-engineering, design-director, ui-designer, ux-designer, graphic-designer, motion-designer, design-system-agent, ui-diff-applier, nextjs-convention-mapper, visual-fidelity-verifier) 모델을 `gpt-5-codex`로 전환
  - 정책 문서의 tier 대상 목록/매핑표/총계를 실제 frontmatter와 동기화
  - 운영 원칙을 "design 변환계 유지"에서 "FE/디자인 설계 + 변환계 codex 우선"으로 확장

### 2026-07-02 — 3-tier 전환 (Fable 도입)

- 파이프라인: `hotfix_fable모델전환`
- 내용:
  - 핵심 의사결정 4개 에이전트 Fable 5 승격: pipeline-orchestrator, product-strategy, project-governance, release-quality-gate (release-quality-gate는 sonnet → fable 2단계 승격)
  - 부서장/구현 11개 에이전트: `claude-opus-4-7[1m]` → `claude-opus-4-8` ([1m] 서픽스 제거로 초판 이슈2 drift 재해소)
  - specialist 15개 에이전트: `claude-sonnet-4-6`/`claude-sonnet-4-5` → `claude-sonnet-5`
  - 누락되어 있던 design 변환계 9개 에이전트(guide-decomposer, guide-recomposer, data-binding-mapper, routing-strategist, ssr-csr-decider, accessibility-auditor, nextjs-convention-mapper, visual-fidelity-verifier, ui-diff-applier)를 본 SSOT에 신규 등재 — 이 중 guide-decomposer/guide-recomposer/data-binding-mapper/routing-strategist/ssr-csr-decider/accessibility-auditor 6개는 gpt-5-codex 유지, ui-diff-applier는 구현 성격상 Opus 4.8, nextjs-convention-mapper/visual-fidelity-verifier는 Sonnet 5로 분류
  - `references/jojikdo.json`의 model 필드 10곳(hr_agent 1 + design specialist 9)을 본 매핑표와 동기화 — gpt-5-codex로 잘못 기재되지 않고 claude-sonnet-4-5로 남아있던 6개를 gpt-5-codex로 교정
- 정책 원칙: 핵심 의사결정 = Fable 5, 부서장/구현 = Opus 4.8, specialist = Sonnet 5, design 변환계 = gpt-5-codex 유지

### 2026-04-17 — 초판

- 파이프라인: `plan_opus47개선6종`, `dev_opus47개선6종`
- 내용:
  - 27개 에이전트 모델 매핑 확정
  - 이슈 1 (agents frontmatter 정합화): 8개 에이전트 sonnet → claude-opus-4-7
    - pipeline-orchestrator, project-governance, qa-strategy, product-analytics
    - platform-devops, resource-optimizer, hr-agent, cross-department-coordinator
  - 이슈 2 (`[1m]` 서픽스 제거): 기존 `[1m]` 서픽스 전체 제거
  - 이슈 5 (business-analysis 차등화): claude-opus-4-7 → claude-sonnet-4-6
- 정책 원칙: 부서장급 = Opus 4.7, specialist = Sonnet 4.6
