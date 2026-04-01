---
description: 평가부서 스킬 허브 — 분석, 실험, 성능, KPI
argument-hint:
---

# Bams: Evaluation Hub

평가부서의 4개 에이전트와 각 에이전트의 스킬을 선택하여 실행합니다.

## 에이전트 목록

아래 에이전트 중 하나를 선택하세요:

### 1. Product Analytics (제품 분석)
`bams-plugin:product-analytics`
- **KPI 정의** — 핵심 지표 설정, 측정 체계 구축
- **퍼널 분석** — 전환율 분석, 이탈 지점 식별
- **릴리즈 영향 분석** — 배포 전후 지표 비교, 영향도 평가

### 2. Experimentation (실험)
`bams-plugin:experimentation`
- **실험 설계** — A/B 테스트 계획, 가설 수립, 샘플 크기
- **계측** — 실험 이벤트 구현, 세그먼트 설정
- **결과 해석** — 통계 분석, 유의미성 판단, 의사결정

### 3. Performance Evaluation (성능 평가)
`bams-plugin:performance-evaluation`
- **성능 벤치마크** — Core Web Vitals, 로딩 속도, 번들 크기
- **부하 안정성** — 스트레스 테스트, 동시접속 시뮬레이션
- **체감 성능** — 인터랙션 반응성, 애니메이션 프레임률

### 4. Business KPI (비즈니스 KPI)
`bams-plugin:business-kpi`
- **매출/비용 영향** — ROI 분석, 비용 구조, 수익 모델
- **경영 보고** — 대시보드 설계, 주간/월간 리포트

---

## 실행 흐름

### Step 1: 에이전트 선택

AskUserQuestion — "어떤 평가 에이전트를 사용하시겠습니까?"
- **Product Analytics** — 제품 지표 분석
- **Experimentation** — 실험 설계 및 분석
- **Performance Evaluation** — 성능 측정 및 평가
- **Business KPI** — 비즈니스 지표 관리

### Step 2: 스킬 선택

선택된 에이전트의 스킬 목록을 표시합니다.

AskUserQuestion — "어떤 스킬을 실행하시겠습니까?"
(선택한 에이전트의 스킬 목록 표시)

### Step 3: 컨텍스트 수집

선택된 스킬에 필요한 컨텍스트를 수집합니다:
- 프로젝트 config.md 확인
- 기존 분석 데이터 (.crew/artifacts/) 스캔
- 필요 시 AskUserQuestion으로 추가 정보 수집

### Step 4: 에이전트 실행

선택된 에이전트를 해당 스킬 모드로 실행합니다.

```
subagent_type: bams-plugin:[selected-agent]
skill_mode: [selected-skill]
```

### Step 5: 결과 정리

에이전트 실행 결과를 정리하고 분석 산출물을 `.crew/artifacts/`에 저장합니다.
