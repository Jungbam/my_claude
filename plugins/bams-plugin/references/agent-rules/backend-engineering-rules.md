# backend-engineering 상세 규칙 (agent-rules)

> 본문: `plugins/bams-plugin/agents/backend-engineering.md` — 차단 게이트/Step 0/라우팅 표는 본문에만 존재 (SSOT)
> 이관 근거: plan_모델재분배프롬프트세분화 FR-S1 (verbatim 이동 — NFR-3)

### ★ 에러 발생 시 agent_end emit 강제 패턴 (반드시 준수)

작업 실패 감지 시 반드시 다음 순서로 처리:

Step 1: 에러 로그 캡처
Step 2: agent_end emit (status="error") — emit 직전 start-존재 guard 필수:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1)
_EVT=$(find ~/.bams/artifacts/pipeline -name "*{slug}*-events.jsonl" 2>/dev/null | head -1)
if [ -n "$_EVT" ] && ! grep -q "\"call_id\":\"{call_id}\".*agent_start\|agent_start.*\"call_id\":\"{call_id}\"" "$_EVT" 2>/dev/null; then
  [ -n "$_EMIT" ] && bash "$_EMIT" agent_start "{slug}" "{call_id}" "backend-engineering" "claude-opus-4-8" "재개 backfill: {작업 설명}"
fi
[ -n "$_EMIT" ] && bash "$_EMIT" agent_end "{slug}" "{call_id}" "backend-engineering" "error" {elapsed_ms} "에러: {에러 요약}"
```
Step 3: pipeline-orchestrator에 에러 보고 (근본 원인 + 영향 범위 포함)

★ 절대 금지: 에러 발생 후 agent_end 없이 종료 — viz에서 no_end로 기록되어 성공률 왜곡

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

### ★ 세션 시작 시 교훈 적용 가시화 (필수)

MEMORY.md 로드 직후 Bash로 출력:
```bash
echo "=== backend-engineering MEMORY 교훈 적용 ==="
echo "agent_end emit 필수: 에러 시에도 emit (catch 블록 포함)"
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

## 학습된 교훈

### [2026-08-14] retro_전체회고_1 — emit 규칙 비대칭(end 강제·start 공백)이 재개 경로 고아 end 유발 (04-04/04-05/04-07 emit 교훈 통합)

**맥락**: retro_전체회고_1 — 원B(88.4)→보정A(98.4). Phase 재진입 시 agent_start 누락으로 고아 agent_end 1건(3건 중 33.3%) 발생, 재시도점수 66.7로 소표본 등급 강등. is_error 0·재작업 실체 0 — 순수 계측 아티팩트. 본 교훈은 기존 end 편중 emit 교훈 4건(04-04/04-05/04-07/재확인)을 생애주기 대칭 emit으로 통합·대체하며, 구건은 archives로 회수한다.

**문제**:
1. "작업 시작" 앵커가 "위임 수신" 시점에 고정 — 재개/Phase 재진입을 "이미 시작한 작업의 연속"으로 인식해 agent_start 재발행 트리거 미작동
2. 누적 교훈 4건(04-04/04-05/04-07/재확인)이 agent_end 누락 방지에 편중 — end는 코드 강제, 재개 시 start backfill이라는 대칭 규칙 미학습(비대칭 학습)
3. agent_end emit 직전 start-존재 guard 부재 — 재개로 유실된 start를 자가 복구할 지점 없음

**교훈**:
- emit 의무는 "최초 위임 수신 시작"뿐 아니라 "재개/Phase 재진입 시작"까지 대칭 포섭한다 — 재개도 "새 시작"으로 명시
- 모든 agent_end emit(성공·에러 공통) 직전에 매칭 call_id의 agent_start 존재를 grep으로 확인하고, 없으면 backfill emit한다 (훅 A1과 이중 방어, 멱등 조율)
- duration_ms는 agent_start 시각을 캐싱해 실측 델타로 산출하며 `measured=false`/0 fallback을 금지한다
- 소표본(≤3건)에서는 단일 계측 결함이 등급 컷을 좌우하므로, 계측 무결성 guard의 우선순위가 산출물 품질보다 낮지 않다 (subagent_type 지정·hotfix 복잡도 평가 등 기존 교훈은 행동 규칙 섹션에 상시 유지)

**적용 범위**: recover/재진입 경로가 존재하는 모든 백엔드 작업
**출처**: retro_전체회고_1 (BE-P1, 주제 A), phase3 정성 §3 심층분석

### [2026-07-05] retro_최근3d회고_1 — 테스트 격리 결함으로 실 프로덕션 DB 오염

**맥락**: retro_최근3d회고_1 — P-TOP1(최우선 Problem). orchestrator 테스트가 ESM import 호이스팅으로 `process.env.HOME` 재할당 이전에 top-level 경로 상수가 확정되어, 실 `bams.db`에 세션 79건/이벤트 207건이 오염됨. 정량 지표(성공률 100%)에는 전혀 드러나지 않았고 QA 실측으로만 적발됨.

**문제**:
1. 테스트 파일에서 env 기반 경로(예: `~/.bams/...`)를 top-level `const`로 선언 — ESM import는 호이스팅되므로 `process.env.HOME` 재할당(테스트 setup)보다 먼저 평가되어 실 경로로 확정됨
2. 격리 실패가 성공률/재시도율 등 정량 지표에 전혀 반영되지 않아 QA의 수동 실측 없이는 발견 불가능
3. 복구 비용(백업 + 원자 삭제 트랜잭션) 발생 — 프로덕션 데이터 정합성 파괴

**교훈**:
- env 기반 경로 격리가 필요한 테스트에서는 top-level `const` 경로 상수 선언을 금지하고, 매 호출 시 평가되는 lazy 함수(예: `getDbPath()`)로 대체한다
- 테스트 스위트 AC에 "테스트 전후 실 리소스(세션/이벤트) 카운트 불변"을 필수 포함한다 — 회귀 감지를 정량 지표가 아닌 실측 카운트로 보강
- 신규 테스트 작성 시 top-level 경로 상수 존재 여부를 `grep -n "^const.*process.env\|^const.*HOME"`로 자가 점검한다

**적용 범위**: env 기반 경로 격리가 필요한 모든 백엔드 테스트 코드
**출처**: retro_최근3d회고_1 (P-TOP1), backend-engineering P1 + qa-strategy Keep

### [2026-08-20] retro_전체회고_2 — 착수 전 base 검증 게이트 (미병합 브랜치 base 가정)

**맥락**: retro_전체회고_2 — B(85.87, 부서장군 1위). design-be(plan) 설계가 미병합 브랜치 `refactor/dart-live-migration` 산출물을 master 기준으로 가정 → BE 착수 시 `lib/dart-filing-query.ts 미존재 + connection lost`로 중단. 부서 유일 에러 2/60(3.3%) 전량 원인.

**교훈**:
- 요구 미이해·구현 결함이 아닌 **환경 가정 오류** — 설계가 참조한 base 파일/모듈의 실존을 착수 전 `git ls-tree HEAD`/`grep`으로 검증하고 base-SHA를 기록한다
- 미존재 시 구현 착수 금지·즉시 에스컬레이션(기본 거부 원칙 연장). retro_4 "스키마 변경 3단계 영향 분석"과 묶어 **"착수 전 base 검증 게이트"** 원칙으로 일반화

**출처**: retro_전체회고_2 backend#1 (consolidated #9)

### [2026-04-18] retro_전체회고_4 — 스키마 변경 연쇄 중단 + 재시도 누적 패턴

**맥락**: retro_전체회고_4 — A등급(92.5) 정량, B+(75/100) 정성. 스키마 변경이 시작점이 된 연쇄 중단(H-2). 재시도 9~16회 급 파이프라인 3건(H-3). retro_1/2 교훈(작업 규모 사전 평가) 3회 연속 미적용.

**문제**:
1. 스키마 변경 시 downstream 파이프라인 영향 분석 없이 진행 → 연쇄 중단
2. Large 작업 배치 분할 미적용 → 재시도 9~16회 급 파이프라인
3. BE 산출물 미저장으로 재시도 시 중복 작업 발생 (토큰 낭비 은폐)

**교훈**:
- 스키마 변경 감지 시('schema', 'migration', '*.sql' 키워드) 3단계 영향 분석 보고서를 orchestrator에 사전 회신, 승인 전 착수 금지
- Large 작업(4+ 엔드포인트 OR 스키마 2건+ OR 예상 400,000ms+) → batches JSON 회신 + orchestrator 승인 대기
- 작업 완료 시 `.crew/artifacts/be/{slug}/` 에 api-contract.md, domain-rules.md 저장 의무화

**출처**: retro_전체회고_4

### 파이프라인 완료 시 저장

회고 단계에서 pipeline-orchestrator의 KPT 요청 시 `MEMORY.md`에 다음 형식으로 추가:

```markdown
## [YYYY-MM-DD] {pipeline-slug}
- 발견 사항: [이번 파이프라인에서 발견한 패턴 또는 문제]
- 적용 패턴: [성공적으로 적용한 접근 방식]
- 주의사항: [다음 실행 시 주의할 gotcha]
```

### PARA 디렉터리 구조

```
.crew/memory/{agent-slug}/
├── MEMORY.md              # Tacit knowledge (세션 시작 시 필수 로드)
├── life/
│   ├── projects/          # 진행 중 파이프라인별 컨텍스트
│   ├── areas/             # 지속적 책임 영역
│   ├── resources/         # 참조 자료
│   └── archives/          # 완료/비활성 항목
└── memory/                # 날짜별 세션 로그 (YYYY-MM-DD.md)
```

## Best Practice 참조

**★ 작업 시작 시 반드시 Read:**
Bash로 best-practice 파일을 찾아 Read합니다:
```bash
_BP=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/references/best-practices/backend-engineering.md" 2>/dev/null | head -1)
[ -z "$_BP" ] && _BP=$(find . -path "*/bams-plugin/references/best-practices/backend-engineering.md" 2>/dev/null | head -1)
[ -n "$_BP" ] && echo "참조: $_BP"
```
- 파일이 발견되면 Read하여 해당 Responsibility별 협업 대상, 작업 절차, 주의사항을 확인
- 파일이 없으면 건너뛰고 진행
