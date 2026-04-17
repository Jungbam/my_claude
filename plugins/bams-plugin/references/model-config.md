# 에이전트 모델 정책 (Model Configuration)

> 이 문서는 bams-plugin 에이전트의 모델 배정 단일 진실 소스(single source of truth).
> 신규 에이전트 추가 또는 모델 업그레이드 시 이 문서를 먼저 갱신한 후 각 에이전트 frontmatter에 반영한다.

## 정책 원칙

### Opus 4.7 (claude-opus-4-7)
**총괄/부서장급**: 복잡 추론, 전략 판단, 다중 specialist 조율, 장문 PRD/설계 문서 처리

- 판단 깊이가 깊거나 여러 하위 에이전트/문서를 종합하는 역할
- 파이프라인당 호출 빈도는 낮으나 결정 품질이 다운스트림에 큰 영향

### Sonnet 4.6 (claude-sonnet-4-6)
**하위 specialist/전문가**: 정형 구조 출력, 빠른 응답, 단일 도메인 세부 작업

- 부서장의 위임을 받아 특정 영역을 처리
- TTFT(첫 토큰까지 시간)와 응답 속도가 사용자 체감 UX에 직접 기여

### 선택 기준 매트릭스

| 요인 | Opus 4.7 선호 | Sonnet 4.6 선호 |
|------|--------------|----------------|
| 역할 | 총괄/부서장/크로스도메인 | 단일 전문가 |
| 입력 크기 | 중~대 (수십만 토큰) | 소~중 |
| 추론 깊이 | 전략/설계 판단 | 정형 구조 출력 |
| 호출 빈도 | 낮음 (Phase당 1~3회) | 높음 (batch 실행) |
| 체감 UX | 품질 우선 | 속도 우선 |

**참고**: `[1m]` 1M 컨텍스트 서픽스는 실제 입력이 200K를 초과하는 경우에만 사용. 대부분의 부서장 호출은 40K 이하이므로 기본 200K 컨텍스트로 충분하며 `[1m]`은 latency 손해만 발생. 본 정책은 기본적으로 `[1m]` 서픽스 미사용.

## 에이전트별 모델 매핑 (27개)

### 기획부 (Product)

| 에이전트 | 역할 | 모델 | 비고 |
|---------|------|------|------|
| product-strategy | 기획 부서장 | claude-opus-4-7 | 제품 비전, PRD 작성, 하위 specialist 조율 |
| business-analysis | 기획 specialist | claude-sonnet-4-6 | 요구사항 분해, 기능 명세 (정형 출력) |
| ux-research | 기획 specialist | claude-sonnet-4-6 | 사용자 리서치 |
| project-governance | 프로젝트 거버넌스 | claude-opus-4-7 | Quality Gate 판정 — 다관점 종합 판단 |

### 개발부 (Engineering)

| 에이전트 | 역할 | 모델 | 비고 |
|---------|------|------|------|
| frontend-engineering | 개발 FE 부서장 | claude-opus-4-7 | UI 구현, 컴포넌트 설계 |
| backend-engineering | 개발 BE 부서장 | claude-opus-4-7 | API 설계, 트랜잭션/동시성 |
| platform-devops | 개발 인프라 부서장 | claude-opus-4-7 | 인프라, CI/CD, 보안 |
| data-integration | 개발 specialist | claude-sonnet-4-6 | 이벤트 트래킹, 외부 연동 |

### 디자인부 (Design)

| 에이전트 | 역할 | 모델 | 비고 |
|---------|------|------|------|
| design-director | 디자인 부서장 | claude-opus-4-7 | 크리에이티브 디렉션, 5명 specialist 조율 |
| ui-designer | 디자인 specialist | claude-sonnet-4-6 | 컴포넌트 디자인 |
| ux-designer | 디자인 specialist | claude-sonnet-4-6 | 와이어프레임, 프로토타입 |
| graphic-designer | 디자인 specialist | claude-sonnet-4-6 | 아이콘, 일러스트 |
| motion-designer | 디자인 specialist | claude-sonnet-4-6 | 애니메이션 |
| design-system-agent | 디자인 specialist | claude-sonnet-4-6 | 디자인 토큰 |

### QA부 (Quality)

| 에이전트 | 역할 | 모델 | 비고 |
|---------|------|------|------|
| qa-strategy | QA 부서장 | claude-opus-4-7 | 테스트 전략, 리스크 분석 |
| automation-qa | QA specialist | claude-sonnet-4-6 | E2E 자동화 |
| defect-triage | QA specialist | claude-sonnet-4-6 | 결함 분류 |
| release-quality-gate | QA specialist | claude-sonnet-4-6 | 출시 게이트 |

### 평가부 (Evaluation)

| 에이전트 | 역할 | 모델 | 비고 |
|---------|------|------|------|
| product-analytics | 평가 부서장 | claude-opus-4-7 | 행동 분석, 릴리즈 영향 |
| experimentation | 평가 specialist | claude-sonnet-4-6 | A/B 테스트 |
| performance-evaluation | 평가 specialist | claude-sonnet-4-6 | 부하/성능 |
| business-kpi | 평가 specialist | claude-sonnet-4-6 | KPI 지표 |

### 경영지원 (Operations — 독립 부서장급)

| 에이전트 | 역할 | 모델 | 비고 |
|---------|------|------|------|
| executive-reporter | 경영지원 | claude-opus-4-7 | 파이프라인 상태 집계, 경영진 리포트 |
| resource-optimizer | 경영지원 | claude-opus-4-7 | 모델 선택 전략 (메타 역할) |
| hr-agent | 경영지원 | claude-opus-4-7 | 에이전트 생명주기, 조직도 관리 |
| cross-department-coordinator | 경영지원 | claude-opus-4-7 | 부서간 협업 조율 |
| pipeline-orchestrator | 조언자 (총괄) | claude-opus-4-7 | Phase 계획, 부서장 라우팅 조언 |

**총계**: Opus 4.7 = 13개 (부서장급 + 총괄 + 거버넌스), Sonnet 4.6 = 14개 (specialist)

## 업그레이드 절차

새 모델 도입 시 (예: Opus 4.8, Sonnet 4.7):

1. **본 정책 문서 갱신**:
   - 위 매핑 테이블의 모델 ID 열을 일괄 변경
   - 변경 이력 섹션에 날짜/사유 추가

2. **에이전트 frontmatter 일괄 치환**:
   ```bash
   # 예: opus 4.7 → 4.8
   find plugins/bams-plugin/agents -name "*.md" -exec \
     sed -i '' 's/^model: claude-opus-4-7$/model: claude-opus-4-8/' {} \;
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
