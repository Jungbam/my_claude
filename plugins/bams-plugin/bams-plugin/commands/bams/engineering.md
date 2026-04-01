---
description: 개발부서 스킬 허브 — 프론트엔드, 백엔드, 플랫폼, 데이터
argument-hint:
---

# Bams: Engineering Hub

개발부서의 4개 에이전트와 각 에이전트의 스킬을 선택하여 실행합니다.

## 에이전트 목록

아래 에이전트 중 하나를 선택하세요:

### 1. Frontend Engineering (프론트엔드)
`bams-plugin:frontend-engineering`
- **UI 컴포넌트** — 컴포넌트 설계, 스타일 시스템, 접근성
- **클라이언트 플로우** — 상태 관리, 라우팅, API 연동
- **프론트 품질** — 번들 최적화, 렌더링 성능, 테스트

### 2. Backend Engineering (백엔드)
`bams-plugin:backend-engineering`
- **API 계약** — REST/GraphQL 스키마 설계, 버전 관리
- **도메인 로직** — 비즈니스 로직 구현, 패턴 적용
- **데이터 정합성** — DB 스키마, 마이그레이션, 트랜잭션

### 3. Platform & DevOps (플랫폼)
`bams-plugin:platform-devops`
- **IaC 관리** — 인프라 코드, 환경 설정, 시크릿 관리
- **CI/CD 오케스트레이션** — 파이프라인 설계, 빌드 최적화
- **관측성/인시던트** — 로깅, 모니터링, 알림, 인시던트 대응

### 4. Data Integration (데이터 연동)
`bams-plugin:data-integration`
- **이벤트 트래킹** — 분석 이벤트 설계, 구현, 검증
- **외부 시스템 연동** — 서드파티 API, 웹훅, 데이터 싱크

---

## 실행 흐름

### Step 1: 에이전트 선택

AskUserQuestion — "어떤 개발 에이전트를 사용하시겠습니까?"
- **Frontend Engineering** — 프론트엔드 개발
- **Backend Engineering** — 백엔드 개발
- **Platform & DevOps** — 인프라/배포
- **Data Integration** — 데이터 연동

### Step 2: 스킬 선택

선택된 에이전트의 스킬 목록을 표시합니다.

AskUserQuestion — "어떤 스킬을 실행하시겠습니까?"
(선택한 에이전트의 스킬 목록 표시)

### Step 3: 컨텍스트 수집

선택된 스킬에 필요한 컨텍스트를 수집합니다:
- 프로젝트 config.md 확인
- 코드베이스 구조 분석
- 기존 산출물 (.crew/artifacts/) 스캔
- 필요 시 AskUserQuestion으로 추가 정보 수집

### Step 4: 에이전트 실행

선택된 에이전트를 해당 스킬 모드로 실행합니다.

```
subagent_type: bams-plugin:[selected-agent]
skill_mode: [selected-skill]
```

### Step 5: 결과 정리

에이전트 실행 결과를 정리하고 코드 변경 또는 산출물을 저장합니다.
