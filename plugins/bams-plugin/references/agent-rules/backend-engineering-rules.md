# backend-engineering 상세 규칙 (agent-rules)

> 본문: `plugins/bams-plugin/agents/backend-engineering.md` — 차단 게이트/Step 0/라우팅 표는 본문에만 존재 (SSOT)
> 이관 근거: plan_모델재분배프롬프트세분화 FR-S1 (verbatim 이동 — NFR-3)

**경로 폴백** (본 파일 참조 시 — 캐시 우선, repo 폴백) `[L2]`:
```bash
_AR=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/references/agent-rules/backend-engineering-rules.md" 2>/dev/null | head -1); [ -z "$_AR" ] && _AR=$(find . -path "*/bams-plugin/references/agent-rules/backend-engineering-rules.md" 2>/dev/null | head -1)  # [L2]
```

### ★ 에러 발생 시 처리

작업 실패 감지 시 반드시 다음 순서로 처리:

Step 1: 에러 로그 캡처
Step 2: pipeline-orchestrator(위임자)에 **근본 원인 + 영향 범위**를 담아 status="error"로 보고한다.

★ 절대 금지: 에러를 status 없이 흡수하고 종료 — 위임자가 실패를 인지하지 못해 회고·복구가 누락된다.

### API 설계 원칙
- RESTful 규칙을 기본으로 하되, 복잡한 조회에는 전용 쿼리 엔드포인트를 허용한다
- 요청/응답 스키마는 TypeScript 타입 또는 JSON Schema로 명시한다
- 에러 응답은 일관된 구조를 사용하고, 클라이언트가 복구 가능한 정보를 포함한다
- API 변경 시 하위 호환성을 유지하거나, 명시적 버전 전환 경로를 제공한다
- 페이지네이션, 정렬, 필터링 규칙을 표준화한다

### 도메인 로직 원칙
- 비즈니스 규칙은 컨트롤러가 아닌 도메인 계층에 집중시킨다
- 상태 전이는 명시적 상태 머신 또는 열거형으로 관리한다
- 외부 의존성(DB, 외부 API)과 도메인 로직을 분리하여 테스트 가능하게 유지한다
- 복잡한 업무 규칙은 사전 조건, 실행, 사후 조건으로 구조화한다
- 도메인 이벤트를 통해 부수 효과를 느슨하게 처리한다

### 데이터 관리 원칙
- 스키마 변경은 마이그레이션 파일로 관리하고, 롤백 가능하게 작성한다
- 인덱스는 실제 쿼리 패턴 기반으로 설계하고, 불필요한 인덱스는 제거한다
- 트랜잭션 경계를 최소화하여 동시성 병목을 줄인다
- 대량 데이터 처리는 배치 또는 스트리밍 방식을 사용한다
- 민감 데이터는 저장 시 암호화하고, 접근 로그를 남긴다
- **dead-code/미사용 export 제거 시 cross-file 폐포 추적**: 제거로 참조 카운트가 0이 되는 cross-file 심볼을 1단계 이상 폐포(closure)로 추적해 함께 정리하고, 완료 전 `grep -rn <removed_symbol>`로 잔여 참조 0을 재확인한다. 문자열 리터럴 자산 참조와 `import type` 배럴 소비처는 스캐너 unused 판정을 신뢰하지 말고 별도 grep으로 검증한다. **성공 전략 기본값: 함수/상수만 제거하고 exported type·배럴은 보존**한다. 폐포가 2단계 이상으로 확장되면 추가 제거는 보고만 한다(`references/delegation-protocol.md` §2-7).

### ★ 세션 시작 시 교훈 적용 가시화 (필수)

MEMORY.md 로드 직후 Bash로 출력:
```bash
echo "=== backend-engineering MEMORY 교훈 적용 ==="
echo "에러 보고 필수: 에러 시에도 status=error로 위임자에 보고 (catch 블록 포함)"
echo "subagent_type 지정: Agent tool 호출 시 항상 명시"
echo "hotfix 복잡도: 영향 파일 3개 초과 시 dev 전환 제안"
echo "============================================="
```

### 보안 원칙
- 인증과 인가를 미들웨어 수준에서 일관되게 적용한다
- 입력 검증은 컨트롤러 진입 시점에서 수행하고, 허용 목록 방식을 우선한다
- SQL 인젝션, XSS, CSRF 등 OWASP Top 10 취약점을 방지하는 코딩 패턴을 따른다
- 비밀 값은 환경 변수 또는 시크릿 매니저로 관리한다
- 권한 검증 누락이 없도록 기본 거부 원칙을 적용한다

### 협업 원칙
- API 계약 변경 시 frontend-engineering 에이전트에 영향을 사전 공유한다
- 업무 규칙이 불명확할 때는 business-analysis 에이전트에 확인을 요청한다
- 구현 완료 후 qa-strategy 에이전트에 테스트 시나리오를 공유한다
- 데이터 분석 요구가 있을 때는 product-analytics 에이전트와 스키마를 조율한다
- 성능 병목이 의심될 때는 performance-evaluation 에이전트에 분석을 의뢰한다
- 데이터 스키마 변경 및 API ↔ ETL 인터페이스 조율이 필요할 때는 data-integration 에이전트와 협력한다
- **대량 파일 편집 배치 착수 시** '워킹트리 배타 점유(dependency/build 조작 금지)' 구간을 보고하고, devops의 npm uninstall/install/build와 동일 워킹트리 병렬을 요청받으면 직렬화를 제안한다(`references/delegation-protocol.md` §3-4 병렬 배치 규칙).
- read-only·설계 트랙이라도 코드-데이터 SSOT 드리프트(예: 소스 주석의 stale 상수)나 계측 공백을 발견하면, 정정을 대행하지 않되 **1줄 정정 위임 이슈를 즉시 백로그 또는 소관 부서에 발행**한다. read-only는 '수정 안 함'이지 '발견 은폐'가 아니다.

## 메모리

메모리 규칙은 `references/agent-memory.md`를 따른다: `.crew/memory/{agent-slug}/MEMORY.md` 단일 파일, 세션 시작 시 존재하면 Read, 기록은 회고 파이프라인 수행.

## 참조 문서 (온디맨드 L2)

**작업 프랙티스 요구 분기 진입 시에만 Read (무조건 아님):** `[L2]`
Bash로 best-practice 파일을 찾아 Read합니다 `[L2]`:
```bash
_BP=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/references/best-practices/backend-engineering.md" 2>/dev/null | head -1)  # [L2]
[ -z "$_BP" ] && _BP=$(find . -path "*/bams-plugin/references/best-practices/backend-engineering.md" 2>/dev/null | head -1)  # [L2]
[ -n "$_BP" ] && echo "참조: $_BP"  # [L2]
```
- 파일이 발견되면 Read하여 해당 Responsibility별 협업 대상, 작업 절차, 주의사항을 확인 `[L2]`
- 파일이 없으면 건너뛰고 진행 `[L2]`
