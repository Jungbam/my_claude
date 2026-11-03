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
- 대상: frontend-engineering, backend-engineering, platform-devops, data-integration, design-director, qa-strategy, product-analytics, hr-agent, resource-optimizer, cross-department-coordinator (모든 부서장 포함 — 예외 없음. data-integration은 결제·인증·마이그레이션 등 프로덕션 코드를 직접 구현하므로 Tier 2).

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

FE/디자인 16개 에이전트(frontend-engineering, design-director + 디자인 specialist 14)는 **두 개의 서로 다른 모델 개념**을 동시에 쓴다. 둘을 혼동해 gpt 모델명을 frontmatter에 넣으면 spawn이 전면 실패한다(2회 재발 이력) — 반드시 구분한다.

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

**접근성 검증**: CLI 경로(`codex exec -m gpt-6.1-sol`)는 2026-11-02 확인, `~/.codex/config.toml` 기본값도 `gpt-6.1-sol`. MCP 경로(`mcp__codex__codex`)는 미검증 — 다음 MCP 연결 세션에서 재검증한다.

## 환경 요구사항

harness의 display/집계 정규화가 opus 계열 ID를 `"opus"` 라벨로 기록하는 현상이 있다(실행 모델은 정상, 로그·비용 집계만 부정확). 정확한 ID로 통일하려면 `~/.claude/settings.json`(CI는 환경변수)에 설정한다. 개인 파일이라 신규 개발자·`~/.claude/` 초기화·CI마다 재설정이 필요하다.

```json
{ "env": { "ANTHROPIC_DEFAULT_OPUS_MODEL": "claude-opus-5-5" } }
```

적용 후 재시작하고 부서장 spawn 트랜스크립트의 모델명이 `claude-opus-5-5`인지 확인한다.

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

0. **Spawn ping 사전검증 (SSOT 갱신 전)**: 대상 그룹의 저위험 에이전트 1개를 canary로 trivial task를 실제 spawn한다. 성공이면 1~5단계 진행, 실패면 전환 보류 후 대체 모델·Claude 계열 폴백 재검토(모델명 오타 확인용 재시도 1회까지).
   - **세션 캐싱 주의**: harness는 에이전트 정의를 세션 시작 시 로드하므로 같은 세션 canary는 stale 값으로 실패할 수 있다. 이때 (a) 독립 CLI(`codex exec ... -c 'model="{모델명}"'` 등)로 대체 검증하고, (b) SSOT는 갱신하되 변경 이력에 "Task tool 레벨은 세션 재시작 후 검증 필요"를 남기고, (c) 다음 세션 canary 재검증을 최우선 등록한다.

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

현재 정책의 근거만 둔다. 이전 이력(Fable 도입, gpt 모델명 frontmatter 오진·복구, Tier 재배치 등)은 `git log -p -- plugins/bams-plugin/references/model-config.md`로 본다.

### 2026-11-02 — 5.5 세대 전환 + effort 도입 + codex gpt-6.1-sol (dev_모델프롬프트최신화)

- Opus 5.5가 Opus 5·4.8보다 저렴하면서 상위 성능 → Tier 1·2를 `claude-opus-5-5`로 통합하고 effort(xhigh/high)로 차등. Sonnet 5.5는 동일가라 `claude-sonnet-5-5` 전환. Haiku 5.5는 Haiku 4.5 대비 약 10배 저렴 → Tier 4.
- 사용자 결정: (1) Tier 1은 Fable이 아닌 Opus 5.5 + xhigh. (2) codex 위임 구조는 유지하고 모델만 `gpt-6.1-sol`로 최신화.
- frontmatter에 `effort:` 도입(`model:` 다음 줄), 매핑표에 effort 컬럼 추가. jojikdo.json `model` 동기화.
- 검증 상태: codex CLI 확인, codex MCP·harness Task tool 레벨은 세션 재시작 후 재검증 필요.

### 유지 중인 결정

- 2026-08-25: frontmatter `model:`·jojikdo.json `model`에는 Claude 모델명만 — 위 §FE/디자인 이중 구조.
- 2026-08-20: performance-evaluation은 판정 기준 완전 수치화(p95 +10%=FAIL / -5%=PASS / 그 외 CONDITIONAL)로 저비용 tier. orphan 커밋 b936931(specialist 8개 전면 opus 승격)은 폐기 — cherry-pick 영구 금지(FR-M10).
- 하향 검토 후보(미변경): resource-optimizer, cross-department-coordinator.
