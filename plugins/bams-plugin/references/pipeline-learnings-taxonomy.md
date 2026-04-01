# Pipeline Learnings 분류 체계

Pipeline Learnings 항목을 `.crew/config.md`에 기록할 때 사용하는 카테고리와 형식 규칙입니다.

## 카테고리

| 카테고리 | 접두어 | 기록 주체 | 설명 |
|----------|--------|-----------|------|
| init | `init:` | project-init | 프로젝트 초기화 상태 |
| pattern | `pattern:` | feature | 새로 도입된 패턴/라이브러리 |
| convention | `convention:` | feature, deep-review | 발견된 코드 컨벤션 |
| vulnerable | `vulnerable:` | feature, hotfix, security | 취약 영역 (반복 이슈 발생 지점) |
| hotfix | `hotfix:` | hotfix | 버그 근본 원인 + 영향 범위 |
| regression-test | `regression-test:` | hotfix | 추가된 회귀 테스트 |
| review | `review:` | deep-review | 리뷰에서 발견된 반복 패턴 |
| security | `security:` | security | 보안 감사 결과 스냅샷 |
| dependency | `dependency:` | security | 취약 의존성 경고 |
| perf-baseline | `perf-baseline:` | performance | 성능 베이스라인 수치 |
| perf-regression | `perf-regression:` | performance | 성능 회귀 경고 |
| perf-improvement | `perf-improvement:` | performance | 최적화 적용 결과 |
| weekly | `weekly:` | weekly | 주간 생산성 메트릭 |
| retro | `retro:` | weekly | 회고 핵심 인사이트 |
| trend | `trend:` | weekly | 반복 이슈 트렌드 |
| deploy | `deploy:` | feature | 배포 이력 |

## 형식 규칙

```
- [YYYY-MM-DD] category: 내용
```

### 심각도 접두어

| 접두어 | 의미 |
|--------|------|
| (없음) | 정보/기록 |
| `⚠` | 경고 — 주의 필요 |
| `🔴` | 위험 — 즉시 조치 필요 |

### 예시

```markdown
- [2026-03-25] init: 프로젝트 초기화 완료 (gstack: ✓, design: ✗, deploy: ✓)
- [2026-03-25] pattern: JWT + refresh token 패턴 (jose 라이브러리)
- [2026-03-25] convention: API 라우트 에러 핸들링 → try-catch + NextResponse.json
- [2026-03-25] ⚠ vulnerable: src/lib/db.ts — 3회째 핫픽스, 리팩토링 권장
- [2026-03-25] hotfix/null-crash: src/api/users.ts — null 체크 누락
- [2026-03-25] security(daily): PASS — Critical 0, Major 1
- [2026-03-25] perf-baseline: LCP 2.1s, FCP 0.8s, CLS 0.05
- [2026-03-25] 🔴 perf-regression: LCP 2.1s → 3.4s (+62%)
- [2026-03-25] weekly: feature 2개, hotfix 1개, 스프린트 완료율 85%
- [2026-03-25] trend: 3주 연속 src/api/ 핫픽스 — 구조적 리팩토링 검토
```

## 유지 규칙

1. **최대 30개** 항목 유지 (오래된 것부터 제거)
2. **중복 금지** — 같은 카테고리+대상의 이전 항목은 교체
3. **날짜 필수** — 항상 절대 날짜 사용 (상대 날짜 금지)
4. **취약 영역 에스컬레이션** — 같은 영역에 3회 이상 이슈 시 `⚠` → `🔴`
5. **해결 시 제거** — 취약 영역이 리팩토링으로 해결되면 항목 삭제

## 컨텍스트 활용 규칙

다음 pipeline 실행 시 Pre-flight에서 Learnings를 읽고:

| Learnings 내용 | 활용 방식 |
|----------------|-----------|
| `pattern:` 항목 | 새 feature에서 같은 패턴 재사용 유도 |
| `convention:` 항목 | 리뷰/개발 시 컨벤션 준수 검증 |
| `⚠ vulnerable:` 항목 | 해당 영역 변경 시 추가 주의 + 테스트 강화 |
| `hotfix:` 항목 | 디버깅 시 유사 패턴 우선 조사 |
| `perf-baseline:` 항목 | 성능 비교 시 자동 기준값 사용 |
| `security:` 항목 | 보안 감사 시 이전 대비 변화 추적 |
| `trend:` 항목 | 주간 루틴에서 트렌드 지속 여부 확인 |
