---
description: 기획부서 스킬 허브 — 전략, 분석, UX, 거버넌스
argument-hint:
---

# Bams: Planning Hub

기획부서의 4개 에이전트와 각 에이전트의 스킬을 선택하여 실행합니다.

## 에이전트 목록

아래 에이전트 중 하나를 선택하세요:

### 1. Product Strategy (제품 전략)
`bams-plugin:product-strategy`
- **비전 정의** — 제품 비전과 미션 수립, OKR 설정
- **로드맵 우선순위** — 기능 우선순위 매트릭스, 로드맵 계획
- **이해관계자 정렬** — 이해관계자 분석, 커뮤니케이션 계획

### 2. Business Analysis (비즈니스 분석)
`bams-plugin:business-analysis`
- **요구사항 도출** — 비즈니스/사용자 요구사항 인터뷰, 정리
- **기능 명세** — 기능 명세서 작성, 수용 기준 정의
- **범위 분해** — WBS 작성, 스코프 분석, 의존성 매핑

### 3. UX Research (UX 리서치)
`bams-plugin:ux-research`
- **사용자 조사 계획** — 리서치 플랜 수립, 인터뷰 가이드
- **여정 매핑** — 사용자 여정 지도, 터치포인트 분석
- **사용성 리뷰** — 휴리스틱 평가, 사용성 체크리스트

### 4. Project Governance (프로젝트 거버넌스)
`bams-plugin:project-governance`
- **딜리버리 계획** — 마일스톤 설정, 일정 관리
- **리스크 관리** — 리스크 식별, 대응 전략
- **상태 거버넌스** — 진행 상태 리포트, 의사결정 기록

---

## 실행 흐름

### Step 1: 에이전트 선택

AskUserQuestion — "어떤 기획 에이전트를 사용하시겠습니까?"
- **Product Strategy** — 제품 전략 수립
- **Business Analysis** — 비즈니스 분석
- **UX Research** — UX 리서치
- **Project Governance** — 프로젝트 거버넌스

### Step 2: 스킬 선택

선택된 에이전트의 스킬 목록을 표시합니다.

AskUserQuestion — "어떤 스킬을 실행하시겠습니까?"
(선택한 에이전트의 스킬 목록 표시)

### Step 3: 컨텍스트 수집

선택된 스킬에 필요한 컨텍스트를 수집합니다:
- 프로젝트 config.md 확인
- 기존 산출물 (.crew/artifacts/) 스캔
- 필요 시 AskUserQuestion으로 추가 정보 수집

### Step 4: 에이전트 실행

선택된 에이전트를 해당 스킬 모드로 실행합니다.

```
subagent_type: bams-plugin:[selected-agent]
skill_mode: [selected-skill]
```

### Step 5: 결과 정리

에이전트 실행 결과를 정리하고 산출물을 `.crew/artifacts/`에 저장합니다.
