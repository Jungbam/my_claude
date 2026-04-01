# Bams Commands — 통합 파이프라인 + 부서별 스킬 허브

16개 에이전트와 브라우저/배포 스킬을 조합한 통합 워크플로우입니다.

## 기본 명령어

| 명령어 | 설명 |
|--------|------|
| `/bams:init` | 프로젝트 초기화 — .crew/ 워크스페이스 + 배포 환경 셋업 |
| `/bams:status` | 프로젝트 대시보드 및 태스크 보드 현황 |
| `/bams:plan <피처>` | PRD + 기술 설계 + 태스크 분해 |
| `/bams:sprint <plan\|status\|close>` | 스프린트 플래닝, 관리, 진행 상황 추적 |
| `/bams:dev <피처>` | 멀티에이전트 풀 개발 파이프라인 |
| `/bams:debug <버그>` | 버그 분류 → 수정 → 회귀 테스트 |

## 워크플로우 명령어

| 명령어 | 설명 | 단계 |
|--------|------|------|
| `/bams:feature <기능>` | 풀 피처 개발 사이클 (기획→구현→검증→배포→마무리) | 13단계 |
| `/bams:hotfix <버그>` | 버그 핫픽스 빠른 경로 | 5단계 |
| `/bams:deep-review` | 다관점 심층 코드 리뷰 | 3단계 |
| `/bams:security` | 보안 감사 (OWASP/STRIDE) | 2~3단계 |
| `/bams:performance <url>` | 성능 측정/최적화 | 1~3단계 |
| `/bams:weekly` | 주간 루틴 (스프린트+회고) | 4단계 |
| `/bams:qa <url>` | 브라우저 QA 테스트 | 3단계 |
| `/bams:ship` | PR 생성 + 머지 | 3단계 |
| `/bams:deploy` | 배포 (Land & Deploy) | 4단계 |

## 부서별 스킬 허브

| 명령어 | 부서 | 에이전트 |
|--------|------|----------|
| `/bams:planning` | 기획부서 | product-strategy, business-analysis, ux-research, project-governance |
| `/bams:engineering` | 개발부서 | frontend-engineering, backend-engineering, platform-devops, data-integration |
| `/bams:evaluation` | 평가부서 | product-analytics, experimentation, performance-evaluation, business-kpi |
| `/bams:qc` | QA부서 | qa-strategy, automation-qa, defect-triage, release-quality-gate |

## 전체 에이전트 (16개)

### 기획부서
- `product-strategy` — 비전 정의, 로드맵 우선순위, 이해관계자 정렬
- `business-analysis` — 요구사항 도출, 기능 명세, 범위 분해
- `ux-research` — 사용자 조사 계획, 여정 매핑, 사용성 리뷰
- `project-governance` — 딜리버리 계획, 리스크 관리, 상태 거버넌스

### 개발부서
- `frontend-engineering` — UI 컴포넌트, 클라이언트 플로우, 프론트 품질
- `backend-engineering` — API 계약, 도메인 로직, 데이터 정합성
- `platform-devops` — IaC 관리, CI/CD 오케스트레이션, 관측성/인시던트
- `data-integration` — 이벤트 트래킹, 외부 시스템 연동

### 평가부서
- `product-analytics` — KPI 정의, 퍼널 분석, 릴리즈 영향 분석
- `experimentation` — 실험 설계, 계측, 결과 해석
- `performance-evaluation` — 성능 벤치마크, 부하 안정성, 체감 성능
- `business-kpi` — 매출/비용 영향, 경영 보고

### QA부서
- `qa-strategy` — 테스트 전략, 케이스 설계, 품질 리스크
- `automation-qa` — UI E2E 자동화, API 자동화, 자동화 안정화
- `defect-triage` — 결함 분류, 재현 보장, 근본 원인 추적
- `release-quality-gate` — 출시 준비 검토, 롤백 점검, 출시 후 모니터링

## 시스템 요구사항

- **bams-plugin 에이전트**: 항상 사용 가능 (16개 에이전트)
- **bams-plugin 스킬**: browse, qa-only, benchmark, cso, ship, land-and-deploy, document-release, retro 등
- 스킬 미설치 시 워크플로우 명령어는 대체 행동으로 동작합니다.

## 진행 추적

각 파이프라인 실행 시 `.crew/artifacts/pipeline/` 에 진행 상태가 기록됩니다.
중단 후 재실행하면 마지막 미완료 단계부터 재개합니다.
