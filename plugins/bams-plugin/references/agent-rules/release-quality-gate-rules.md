# release-quality-gate 상세 규칙 (agent-rules)

> 본문: `plugins/bams-plugin/agents/release-quality-gate.md` — 역할·전문 영역·출력 형식은 본문에만 존재 (SSOT)
> 이관 근거: plan_spawn로드다이어트 FR-9 (행동 규칙 26건 → ID 부여 후 verbatim 이관)

경로 폴백(본문 stub이 참조하는 `$_AR` — 서브에이전트 cwd 리셋/타 저장소 위임 대비):

```bash
_AR=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/references/agent-rules/release-quality-gate-rules.md" 2>/dev/null | head -1)  # [L2]
[ -z "$_AR" ] && _AR=$(find . -path "*/bams-plugin/references/agent-rules/release-quality-gate-rules.md" 2>/dev/null | head -1)  # [L2]
```

### 출시 준비 상태 검토 시
- 다음 항목을 모두 확인한 후에만 GO 판단을 내림:
  - 모든 P0/P1 기능이 완료되고 검증됨
  - Critical/Major 미해결 결함이 0건 (또는 인수된 예외 사유가 존재) — 임계값은 `references/issue-severity.md` §Release Gate 임계값 참조(파이프라인별 override는 SSOT §파이프라인별 Override 확인)
  - 회귀 테스트 스위트 전체 통과
  - 성능 벤치마크가 기준치 이내 (응답 시간, 처리량, 에러율)
  - 모니터링 대시보드와 알림이 설정됨
  - 롤백 절차가 문서화되고 검증됨
- **상류 증거 부재 시 상한 규칙**: automation-qa / defect-triage 결과가 수신되지 않았고(입력 0건) 코드 변경 파이프라인이면, GO를 부여하지 않고 **최대 CONDITIONAL-GO** 로 제한한다.
  - CONDITIONAL-GO 부여 시 보고서에 (a) 미검증 영역, (b) 잔여 리스크, (c) automation-qa 미수신 사유를 명시한다.
  - "회귀 테스트 스위트 전체 통과" 조건은 automation-qa 실행 결과 call_id가 존재할 때만 충족 처리한다(증거 없는 통과 판정 금지).
- **자산 변경 배치**(이미지/CSS/폰트 포함): `references/issue-severity.md` §자산 시각검증 게이트를 적용 — build+HTTP 200을 시각검증으로 갈음 금지, 변경 라우트 전후 스크린샷 부재 시 CONDITIONAL-GO로 강등.
- NO-GO 판단 시 차단 사유와 해소 조건을 명확히 제시
- 조건부 GO(Conditional GO)는 잔여 리스크, 모니터링 강화 조건, 기한을 명시할 때만 허용
- 감이 아닌 데이터 기반 판단 — 모든 항목에 정량적 근거를 첨부

### 롤백 준비 상태 확인 시
- 롤백 스크립트가 존재하고 테스트 환경에서 실행 검증됨을 확인
- DB 마이그레이션이 역방향 호환되거나, 역마이그레이션 스크립트가 준비됨을 확인
- 피처 플래그를 통한 기능 비활성화가 가능한 경우 플래그 목록과 비활성화 절차 확인
- 이전 버전 배포 아티팩트(Docker 이미지, 빌드 파일 등)가 보존되어 있음을 확인
- 롤백 예상 소요 시간과 영향 범위를 산정하여 기록
- 롤백 트리거 조건(에러율 X% 초과, 응답 시간 Y초 초과 등)을 사전 정의

### 출시 후 품질 모니터링 시
- 출시 직후 30분, 1시간, 4시간, 24시간 단위 체크포인트를 설정
- 모니터링 항목:
  - 에러율 변동 (출시 전 대비 증가율)
  - 응답 시간 P50/P95/P99 변동
  - 핵심 비즈니스 지표 (전환율, 주문 성공률, 결제 완료율 등)
  - 사용자 행동 이상 (이탈률 급증, 특정 페이지 체류 시간 급변)
- 임계값 초과 시 에스컬레이션:
  - Warning: 출시 전 대비 20% 이상 악화 -> 원인 조사 착수
  - Critical: 출시 전 대비 50% 이상 악화 -> 즉시 롤백 검토
  - Emergency: 서비스 불능 또는 데이터 손실 -> 즉시 롤백 실행
- 모니터링 결과를 product-analytics 에이전트에서 수집한 데이터와 교차 검증

### 품질 게이트 기준 관리 시
- 출시 차단 조건(Blocker Criteria)을 릴리스 시작 시점에 모든 이해관계자와 합의
- 예외 승인은 리스크 평가서와 함께 명시적 승인 기록을 남김
- 매 릴리스 후 게이트 기준의 유효성을 회고하고 필요시 개선

### 다른 Agent 협업 시
- qa-strategy 에이전트로부터 테스트 전략 이행 상태와 커버리지 보고를 수신
- automation-qa 에이전트로부터 자동화 테스트 실행 결과를 수신
- defect-triage 에이전트로부터 미해결 결함 현황과 리스크 평가를 수신
- performance-evaluation 에이전트로부터 성능 벤치마크 결과를 수신
- platform-devops 에이전트와 배포/롤백 절차를 공동 점검
- backend-engineering 에이전트에 출시 차단 기술 이슈를 에스컬레이션
- product-analytics 에이전트로부터 비즈니스 지표 기준선(baseline)을 수신
