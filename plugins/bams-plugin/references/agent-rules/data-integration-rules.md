# data-integration 상세 규칙 (agent-rules)

> 본문: `plugins/bams-plugin/agents/data-integration.md` — 기술 스택 프로파일·전문 영역·stub은 본문에만 존재 (SSOT)
> 이관 근거: plan_spawn로드다이어트 FR-9 (행동 규칙 30건 ID화 후 verbatim 이관)

경로 폴백(본문 stub이 참조하는 `$_AR` — 서브에이전트 cwd 리셋/타 저장소 위임 대비):

```bash
_AR=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/references/agent-rules/data-integration-rules.md" 2>/dev/null | head -1); [ -z "$_AR" ] && _AR=$(find . -path "*/bams-plugin/references/agent-rules/data-integration-rules.md" 2>/dev/null | head -1)
```

### 이벤트 설계 원칙

- 이벤트 이름은 `[대상]_[행위]` 형식으로 일관되게 명명한다 (예: `product_viewed`, `payment_completed`)
- 모든 이벤트는 공통 필드(timestamp, user_id, session_id, event_id)를 포함한다
- 이벤트 스키마는 버전을 관리하고, 하위 호환성을 유지한다
- 이벤트 페이로드에 민감 정보(PII)를 포함하지 않거나, 포함 시 마스킹 처리한다
- 이벤트 발행 실패 시 로컬 큐에 저장하고 재발행을 시도한다

### 데이터 품질 원칙

- 이벤트 발행 전 스키마 유효성을 검증한다
- 필수 필드 누락, 타입 불일치, 값 범위 초과를 사전에 차단한다
- 중복 이벤트를 감지하고 필터링하는 멱등성 키를 포함한다
- 이벤트 수집률과 누락률을 모니터링하는 지표를 설정한다
- 데이터 품질 이슈 발생 시 product-analytics 에이전트에 알린다

### 외부 연동 원칙

- 외부 API 호출은 어댑터 계층으로 격리하여 내부 로직과 분리한다
- 타임아웃은 외부 시스템 특성에 맞게 설정하고, 기본값은 5초로 한다
- 재시도는 지수 백오프 방식을 사용하고, 최대 재시도 횟수를 제한한다
- 서킷 브레이커를 적용하여 장애 시스템으로의 요청 폭주를 방지한다
- 외부 시스템 응답을 내부 모델로 변환하여 외부 변경의 영향을 최소화한다
- 웹훅 수신 시 시그니처 검증을 수행하고, 멱등성을 보장한다

### 장애 대응 원칙

- 외부 시스템 장애 시 핵심 기능은 대체 경로(폴백)로 동작하도록 한다
- 데이터 유실 방지를 위해 실패한 요청을 데드 레터 큐에 저장한다
- 연동 상태를 헬스 체크 엔드포인트로 노출한다
- 장애 복구 후 적체된 데이터를 순서대로 재처리하는 메커니즘을 구현한다
- 연동 장애가 사용자 경험에 미치는 영향을 최소화하는 그레이스풀 디그레이데이션을 적용한다

### 협업 원칙

- 이벤트 스키마 변경 시 product-analytics, experimentation 에이전트와 사전 협의한다
- 연동 품질 검증은 qa-strategy 에이전트에 테스트 시나리오를 제공한다
- 인프라 수준의 연동 이슈는 platform-devops 에이전트와 협력하여 해결한다
- 새로운 외부 시스템 연동 시 보안 검토를 포함한다
- 데이터 스키마 ↔ API 계약 동기화가 필요할 때는 backend-engineering 에이전트와 사전 협의한다
