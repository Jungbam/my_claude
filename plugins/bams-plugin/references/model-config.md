# 에이전트 모델 정책 (Model Configuration)

> 이 문서는 bams-plugin 에이전트의 모델 배정 단일 진실 소스(single source of truth).
> 신규 에이전트 추가 또는 모델 업그레이드 시 이 문서를 먼저 갱신한 후 각 에이전트 frontmatter에 반영한다.

## 정책 원칙 (3-tier)

### Tier 1 — Fable 5 (claude-fable-5)
**핵심 의사결정**: 파이프라인 전체의 방향을 좌우하는 Phase 계획/게이트 Go-No-Go 판단, PRD/전략 수립, Quality Gate 최종 판정

- 파이프라인당 호출 빈도는 가장 낮으나(Phase당 1~2회) 판단 오류의 다운스트림 영향이 최대
- 여러 부서/에이전트의 산출물을 종합하여 단일 판정을 내려야 하는 지점에만 배정
- 대상: pipeline-orchestrator, product-strategy, project-governance, release-quality-gate

### Tier 2 — Opus 4.8 (claude-opus-4-8)
**부서장/구현**: 복잡 추론, 다중 specialist 조율, 실제 구현/변경 작업 수행

- 부서장급 조율 역할과 더불어, 코드/문서를 직접 구현·변경하는 역할 포함
- 판단 깊이가 깊거나 여러 하위 에이전트/문서를 종합하는 역할
- 대상: backend-engineering, platform-devops, qa-strategy, product-analytics, hr-agent, executive-reporter, resource-optimizer, cross-department-coordinator

### Tier 3 — Sonnet 5 (claude-sonnet-5)
**specialist**: 정형 구조 출력, 빠른 응답, 단일 도메인 세부 작업

- 부서장의 위임을 받아 특정 영역을 처리
- TTFT(첫 토큰까지 시간)와 응답 속도가 사용자 체감 UX에 직접 기여
- 대상: business-analysis, ux-research, data-integration, automation-qa, defect-triage, experimentation, performance-evaluation, business-kpi

### 유지 — gpt-5-codex
**FE/디자인 설계 및 변환계**: FE 설계, 디자인(UI/UX) 설계, JSX/HTML 가이드 분해·재구성·라우팅·바인딩·접근성·렌더링 경계 결정

- FE/디자인 설계 관련 업무는 codex 계열을 우선 사용
- 대상: frontend-engineering, design-director, ui-designer, ux-designer, graphic-designer, motion-designer, design-system-agent, guide-decomposer, guide-recomposer, ui-diff-applier, data-binding-mapper, visual-fidelity-verifier, nextjs-convention-mapper, accessibility-auditor, routing-strategist, ssr-csr-decider

### 선택 기준 매트릭스

| 요인 | Fable 5 선호 | Opus 4.8 선호 | Sonnet 5 선호 |
|------|-------------|---------------|----------------|
| 역할 | 파이프라인 게이트/전략 판정 | 부서장/구현/크로스도메인 | 단일 전문가 |
| 입력 크기 | 중~대 (종합 판단) | 중~대 (수십만 토큰) | 소~중 |
| 추론 깊이 | 최종 판정/전략 | 전략/설계/구현 판단 | 정형 구조 출력 |
| 호출 빈도 | 가장 낮음 (Phase당 1~2회) | 낮음 (Phase당 1~3회) | 높음 (batch 실행) |
| 다운스트림 영향 | 최대 (파이프라인 전체 방향) | 큼 (부서 산출물 품질) | 국지적 (단일 태스크) |
| 체감 UX | 판정 정확도 우선 | 품질 우선 | 속도 우선 |

**참고**: `[1m]` 1M 컨텍스트 서픽스는 실제 입력이 200K를 초과하는 경우에만 사용. 대부분의 부서장 호출은 40K 이하이므로 기본 200K 컨텍스트로 충분하며 `[1m]`은 latency 손해만 발생. 본 정책은 기본적으로 `[1m]` 서픽스 미사용.

## 환경 요구사항

harness에서 `xW()` display/집계 정규화 함수가 opus 계열 모델 ID를 `includes("claude-opus-4")` 규칙으로 매칭하여 `"opus"`로 다운그레이드 기록하는 알려진 현상이 있다. API 실행 경로(`$5()`)는 영향 없으므로 실제 모델은 정상 실행되나, 로그/viz/비용 집계에 부정확한 모델명이 저장된다.

### 해결책 (개인 환경 설정)

`~/.claude/settings.json`의 `env` 섹션에 다음 설정:
```json
{
  "env": {
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "claude-opus-4-8"
  }
}
```

`UN()` 함수가 이 env var를 최우선 참조 → display/집계 경로도 `claude-opus-4-8`로 통일.

### 팀/CI 전파 주의

위 설정은 개인 홈 디렉토리 파일이므로 Git 추적 대상 아님. 다음 상황에서 재설정 필요:
- 신규 개발자 합류 시
- OS 재설치 또는 `~/.claude/` 초기화 시
- CI/CD 환경에서 에이전트 실행 시 (CI 환경변수로 `ANTHROPIC_DEFAULT_OPUS_MODEL=claude-opus-4-8` 설정)

향후 옵션: 프로젝트 루트 `.claude/settings.json`로 이동하면 Git 추적 + 팀 자동 전파 가능. harness가 프로젝트별 settings를 지원하므로 마이그레이션 시 본 문서 업데이트 필요.

### 검증 방법

설정 적용 후 Claude Code 재시작 → 샘플 파이프라인 1회 실행 → `~/.bams/artifacts/agents/YYYY-MM-DD.jsonl`에서 `model` 필드가 `"claude-opus-4-8"`로 기록되는지 확인.

## 에이전트별 모델 매핑 (36개)

### 총괄팀

| 에이전트 | 역할 | 모델 | 비고 |
|---------|------|------|------|
| pipeline-orchestrator | 조언자 (총괄) | claude-fable-5 | Phase 계획, 부서장 라우팅 조언, 게이트 Go/No-Go 판단 |

### 기획부 (Product)

| 에이전트 | 역할 | 모델 | 비고 |
|---------|------|------|------|
| product-strategy | 기획 부서장 | claude-fable-5 | 제품 비전, PRD/전략 작성, 하위 specialist 조율 |
| business-analysis | 기획 specialist | claude-sonnet-5 | 요구사항 분해, 기능 명세 (정형 출력) |
| ux-research | 기획 specialist | claude-sonnet-5 | 사용자 리서치 |
| project-governance | 프로젝트 거버넌스 | claude-fable-5 | Quality Gate 판정 — 다관점 종합 판단 |

### 개발부 (Engineering)

| 에이전트 | 역할 | 모델 | 비고 |
|---------|------|------|------|
| frontend-engineering | 개발 FE 부서장 | gpt-5-codex | UI 구현, 컴포넌트 설계 |
| backend-engineering | 개발 BE 부서장 | claude-opus-4-8 | API 설계, 트랜잭션/동시성 |
| platform-devops | 개발 인프라 부서장 | claude-opus-4-8 | 인프라, CI/CD, 보안 |
| data-integration | 개발 specialist | claude-sonnet-5 | 이벤트 트래킹, 외부 연동 |

### 디자인부 (Design)

| 에이전트 | 역할 | 모델 | 비고 |
|---------|------|------|------|
| design-director | 디자인 부서장 | gpt-5-codex | 크리에이티브 디렉션, 하위 specialist 조율 |
| ui-designer | 디자인 specialist | gpt-5-codex | 컴포넌트 디자인 |
| ux-designer | 디자인 specialist | gpt-5-codex | 와이어프레임, 프로토타입 |
| graphic-designer | 디자인 specialist | gpt-5-codex | 아이콘, 일러스트 |
| motion-designer | 디자인 specialist | gpt-5-codex | 애니메이션 |
| design-system-agent | 디자인 specialist | gpt-5-codex | 디자인 토큰 |
| guide-decomposer | 디자인 specialist (변환) | gpt-5-codex | 외부 가이드 분해 |
| guide-recomposer | 디자인 specialist (변환) | gpt-5-codex | 분해 산출물 재구성 + preview HTML |
| ui-diff-applier | 디자인 specialist (구현) | gpt-5-codex | 가이드-현행 UI patch.diff 생성 (Read-only) |
| data-binding-mapper | 디자인 specialist (변환) | gpt-5-codex | RSC fetch 매핑 |
| visual-fidelity-verifier | 디자인 specialist | gpt-5-codex | 시각 일치성 검증 (bams:browse) |
| nextjs-convention-mapper | 디자인 specialist | gpt-5-codex | App Router 컨벤션 매핑 |
| accessibility-auditor | 디자인 specialist (변환) | gpt-5-codex | WCAG 2.2 AA + axe-core 감사 |
| routing-strategist | 디자인 specialist (변환) | gpt-5-codex | 다중 페이지 라우팅 그래프 설계 |
| ssr-csr-decider | 디자인 specialist (변환) | gpt-5-codex | Server/Client Component 경계 결정 |

### QA부 (Quality)

| 에이전트 | 역할 | 모델 | 비고 |
|---------|------|------|------|
| qa-strategy | QA 부서장 | claude-opus-4-8 | 테스트 전략, 리스크 분석 |
| automation-qa | QA specialist | claude-sonnet-5 | E2E 자동화 |
| defect-triage | QA specialist | claude-sonnet-5 | 결함 분류 |
| release-quality-gate | QA 최종 승인 | claude-fable-5 | 출시 가능 여부 최종 판단 (sonnet → fable 승격) |

### 평가부 (Evaluation)

| 에이전트 | 역할 | 모델 | 비고 |
|---------|------|------|------|
| product-analytics | 평가 부서장 | claude-opus-4-8 | 행동 분석, 릴리즈 영향 |
| experimentation | 평가 specialist | claude-sonnet-5 | A/B 테스트 |
| performance-evaluation | 평가 specialist | claude-sonnet-5 | 부하/성능 |
| business-kpi | 평가 specialist | claude-sonnet-5 | KPI 지표 |

### 경영지원 (Operations — 독립 부서장급)

| 에이전트 | 역할 | 모델 | 비고 |
|---------|------|------|------|
| executive-reporter | 경영지원 | claude-opus-4-8 | 파이프라인 상태 집계, 경영진 리포트 |
| resource-optimizer | 경영지원 | claude-opus-4-8 | 모델 선택 전략 (메타 역할) |
| hr-agent | 경영지원 | claude-opus-4-8 | 에이전트 생명주기, 조직도 관리 |
| cross-department-coordinator | 경영지원 | claude-opus-4-8 | 부서간 협업 조율 |

**총계**: Fable 5 = 4개 (핵심 의사결정) / Opus 4.8 = 8개 (부서장급 + 구현) / Sonnet 5 = 8개 (specialist) / gpt-5-codex = 16개 (FE/디자인 설계 + 변환계) — 합계 36개

## 업그레이드 절차

새 모델 도입 시 (예: Opus 4.9, Sonnet 5.1):

1. **본 정책 문서 갱신**:
   - 위 매핑 테이블의 모델 ID 열을 일괄 변경
   - 변경 이력 섹션에 날짜/사유 추가

2. **에이전트 frontmatter 일괄 치환**:
   ```bash
   # 예: opus 4.8 → 4.9
   find plugins/bams-plugin/agents -name "*.md" -exec \
     sed -i '' 's/^model: claude-opus-4-8$/model: claude-opus-4-9/' {} \;
   ```

3. **검증**:
   ```bash
   grep '^model:' plugins/bams-plugin/agents/*.md | sort -u
   ```

4. **테스트**:
   - `cd plugins/bams-plugin && bun test`
   - 경량 파이프라인(`/bams:q`) 1회 smoke 실행

5. **단일 커밋**으로 마무리:
   - 커밋 메시지에 본 문서 경로 + 변경 내역 참조

## 변경 이력

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
  - 이슈 1 (agents frontmatter 정합화): 9개 에이전트 sonnet → claude-opus-4-7
    - pipeline-orchestrator, project-governance, qa-strategy, product-analytics
    - platform-devops, executive-reporter, resource-optimizer, hr-agent, cross-department-coordinator
  - 이슈 2 (`[1m]` 서픽스 제거): 기존 `[1m]` 서픽스 전체 제거
  - 이슈 5 (business-analysis 차등화): claude-opus-4-7 → claude-sonnet-4-6
- 정책 원칙: 부서장급 = Opus 4.7, specialist = Sonnet 4.6
