---
description: QA부서 스킬 허브 — 전략, 자동화, 결함, 출시 검증
argument-hint:
---

# Bams: QC Hub

QA부서의 4개 에이전트와 각 에이전트의 스킬을 선택하여 실행합니다.

## 에이전트 목록

아래 에이전트 중 하나를 선택하세요:

### 1. QA Strategy (QA 전략)
`bams-plugin:qa-strategy`
- **테스트 전략** — 테스트 레벨별 전략, 접근법 설계
- **케이스 설계** — 테스트 케이스 작성, 데이터 설계
- **품질 리스크** — 리스크 기반 테스트, 품질 게이트 정의

### 2. Automation QA (자동화 QA)
`bams-plugin:automation-qa`
- **UI E2E 자동화** — Playwright/Cypress 테스트 작성, 유지보수
- **API 자동화** — API 테스트 스위트, 계약 테스트
- **자동화 안정화** — Flaky 테스트 수정, 테스트 인프라 개선

### 3. Defect Triage (결함 관리)
`bams-plugin:defect-triage`
- **결함 분류** — 심각도/우선순위 분류, 영향 분석
- **재현 보장** — 재현 단계 작성, 최소 재현 케이스
- **근본 원인 추적** — 5-Why 분석, 코드 레벨 원인 추적

### 4. Release Quality Gate (출시 품질 검증)
`bams-plugin:release-quality-gate`
- **출시 준비 검토** — 체크리스트 기반 출시 준비도 평가
- **롤백 점검** — 롤백 계획 검증, 복구 시나리오
- **출시 후 모니터링** — 배포 후 모니터링 계획, 이상 탐지

---

## 실행 흐름

### Step 1: 에이전트 선택

AskUserQuestion — "어떤 QA 에이전트를 사용하시겠습니까?"
- **QA Strategy** — 테스트 전략 및 설계
- **Automation QA** — 테스트 자동화
- **Defect Triage** — 결함 분류 및 추적
- **Release Quality Gate** — 출시 품질 검증

### Step 2: 스킬 선택

선택된 에이전트의 스킬 목록을 표시합니다.

AskUserQuestion — "어떤 스킬을 실행하시겠습니까?"
(선택한 에이전트의 스킬 목록 표시)

### Step 3: 컨텍스트 수집

선택된 스킬에 필요한 컨텍스트를 수집합니다:
- 프로젝트 config.md 확인
- 코드베이스 및 테스트 구조 분석
- 기존 테스트 결과 (.crew/artifacts/) 스캔
- 필요 시 AskUserQuestion으로 추가 정보 수집

### Step 4: 에이전트 실행

선택된 에이전트를 해당 스킬 모드로 실행합니다.

```
subagent_type: bams-plugin:[selected-agent]
skill_mode: [selected-skill]
```

### Step 5: 결과 정리

에이전트 실행 결과를 정리하고 QA 산출물을 `.crew/artifacts/`에 저장합니다.
