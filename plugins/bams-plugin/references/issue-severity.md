# Pipeline 이슈 심각도 정의

모든 pipeline에서 이슈를 분류할 때 사용하는 통일된 심각도 기준입니다.

## 심각도 레벨

| 심각도 | 정의 | 조치 기한 | 예시 |
|--------|------|-----------|------|
| **Critical** | 핵심 워크플로 차단, 데이터 손실, 보안 침해 | 즉시 | SQL 인젝션, 인증 우회, 프로덕션 크래시 |
| **Major** | 주요 기능 장애, 우회 방법 없거나 어려움 | 48시간 | API 에러 핸들링 누락, XSS 취약점, 성능 50% 이상 저하 |
| **Minor** | 기능 동작하나 문제 있음, 우회 가능 | 다음 스프린트 | 미사용 변수, 비효율 쿼리, 접근성 경고 |
| **Info** | 개선 사항, 기록용 | 백로그 | 코드 스타일 불일치, 리팩토링 후보 |

## 리뷰 카테고리별 적용

### 정확성 (Correctness)
| 심각도 | 기준 |
|--------|------|
| Critical | 데이터 손실/변조, 무한 루프, 크래시 |
| Major | 잘못된 로직 결과, 에러 전파 누락, 레이스 컨디션 |
| Minor | Off-by-one, 불필요한 null 체크, 엣지 케이스 미처리 |

### 보안 (Security)
| 심각도 | 기준 |
|--------|------|
| Critical | OWASP Top 10 (인젝션, 인증 우회, 민감 데이터 노출) |
| Major | XSS, CSRF, 안전하지 않은 역직렬화, 경로 탐색 |
| Minor | 레이트 리미팅 누락, 불필요한 정보 노출, CSP 미설정 |

### 성능 (Performance)
| 심각도 | 기준 |
|--------|------|
| Critical | 메모리 누수, 무한 성장 컬렉션, 블로킹 메인 스레드 |
| Major | N+1 쿼리, O(n²) 가능→O(n log n), LCP 3s 초과 |
| Minor | 캐싱 기회 누락, 불필요한 재렌더링, 미최적화 이미지 |

### 코드 품질 (Quality)
| 심각도 | 기준 |
|--------|------|
| Major | 심각한 DRY 위반 (100줄+ 중복), 50줄+ 함수, God 클래스 |
| Minor | 불명확한 네이밍, 4단계+ 중첩, 불필요한 주석 |

### 테스트 (Testing)
| 심각도 | 기준 |
|--------|------|
| Major | public API 테스트 전무, 에러 경로 미테스트, 깨지기 쉬운 테스트 |
| Minor | 엣지 케이스 미커버, 어서션 부족, 테스트 격리 이슈 |

## 신뢰도 기준

모든 이슈에 0-100% 신뢰도를 부여합니다:

| 신뢰도 | 의미 | 조치 |
|--------|------|------|
| 90-100% | 확실한 이슈 | 바로 보고 |
| 80-89% | 높은 확률 이슈 | 보고 (기본 임계값) |
| 60-79% | 가능성 있는 이슈 | 언급하되 확인 필요 표시 |
| 0-59% | 불확실 | 보고하지 않음 |

## Release Gate 임계값 (SSOT — 승격 2026-07-02)

모든 릴리스 게이트 판정(review / deep-review / dev QG / feature Phase 3 / hotfix 검증 / ship / deploy)은
아래 임계값을 SSOT로 사용한다. 파이프라인별 override는 §"파이프라인별 Override"를 참조한다.

### 기본 임계값

| 판정 | Critical | Major | Minor | 조치 |
|------|----------|-------|-------|------|
| **PASS (GO)** | 0건 | ≤ 2건 | 자유 | 릴리스 진행 |
| **CONDITIONAL** | 0건 | 3~5건 또는 테스트 커버리지 미흡 | 자유 | 조건부 진행 (사용자 확인) |
| **FAIL (NO-GO)** | ≥ 1건 | ≥ 6건 | 자유 | 릴리스 차단, 수정 필수 |

### 파이프라인별 Override

파이프라인 특성에 따라 위 기본값을 더 엄격하게 조정한다. 관대한 완화(loosening)는 허용하지 않는다.

| 파이프라인 | Critical | Major | 근거 |
|-----------|----------|-------|------|
| `review` | 0 | ≤ 2 | 기본값 (SSOT 원본) |
| `deep-review` | 0 | ≤ 2 | 기본값 (심층이지만 게이트 판정 자체는 review와 동일) |
| `dev` (Phase 3.5 QG) | 0 | ≤ 2 | 기본값 |
| `feature` (Phase 3) | 0 | ≤ 2 | 기본값 |
| `hotfix` | 0 | ≤ 1 | 프로덕션 hotfix는 잔여 리스크 최소화 |
| `ship` | 0 | ≤ 2 | 기본값 |
| `deploy` | 0 | ≤ 0 | 배포 직전은 Major도 0 (RQG override) |
| `qa` | 0 | ≤ 2 | 기본값 |

Override는 SSOT를 인용하는 각 커맨드에서 명시적으로 override 근거를 표기해야 하며,
근거 없는 임의 완화는 금지한다.

### 참조 지점 목록 (Reverse Index)

본 SSOT를 참조하는 커맨드/에이전트/references는 다음과 같다. 신규 참조 추가 시 아래 목록도 갱신한다.

- `commands/bams/review.md` — Phase 4 (릴리스 품질 게이트)
- `commands/bams/deep-review.md` — 판정 절차 (게이트 미포함, review Phase 4로 위임)
- `commands/bams/qa.md` — QA 리포트 최종 판정
- `commands/bams/ship.md` — 사전 게이트 (Quality Gate 판정)
- `commands/bams/deploy.md` — RQG 게이트 (deploy override 적용)
- `commands/bams/hotfix/step-3-4-cicd.md` — Step 4 출시 준비 검토 (hotfix override 적용)
- `commands/bams/dev/phase-3-5-quality-gate.md` — Phase 3.5 QG
- `commands/bams/feature/phase-3-verification.md` — Phase 3 완료 조건 판정
- `agents/release-quality-gate.md` — 출시 준비 상태 검토 기준

### 하드코딩 검색 CI 규칙

다음 grep 패턴이 SSOT 파일(본 파일) 외에서 0건이 되어야 한다:

```bash
grep -rn 'Critical 0건.*Major 2건' plugins/bams-plugin/ \
  --include='*.md' \
  | grep -v 'references/issue-severity.md' \
  | grep -v '차이점: 본 파이프라인 N값'  # SP-1 통일본 예외
# 결과 0건이어야 PASS
```
## aspect별 Override (SSOT — F-R11, plan_리뷰파이프라인개편)

`/bams:review --aspect ...`는 항상 Phase 4 게이트를 실행한다(OQ6=(b)). 아래는 aspect별 추가 Critical/Major 분류 기준이며, §기본 임계값(Critical 0 / Major ≤2)과 **함께** 적용한다(대체 아님).

| aspect | 추가 Critical 기준 | 추가 Major 기준 | 근거 |
|---|---|---|---|
| `uiux` | WCAG 2.2 AA 위반 1건 이상 | 시각 diff 임계값(픽셀 불일치) 초과 | PRD F-R11 |
| `functional` | 기존 회귀 테스트 실패 1건 이상 | 엣지케이스 미커버(신규 발견) 다수 | PRD F-R11 |
| `performance` | (§Performance Critical 표 그대로 — 메모리 누수 등) | LCP 3s 초과 (기존 §Performance Major와 동일, 신규 아님) | PRD F-R11 |
| `spec` | AC 미이행 3건 이상 | AC 미이행 1~2건 | **제안값 — spec 단계에서 최종 확정 필요(PRD §13 로드맵)** |
| `code` | (변경 없음 — 기존 §기본 임계값 그대로) | (변경 없음) | — |

**다중 aspect 통합 판정 규칙**: 선택된 aspect 각각을 개별 판정한 뒤, **worst-case 원칙**(PASS < CONDITIONAL < FAIL 순으로 가장 낮은 등급 채택)으로 전체 판정을 결정한다.

### aspect 임계값 하드코딩 검색 CI 규칙

신규 aspect 임계값을 §aspect별 Override 표에 추가할 때는 아래 CI grep 규칙에도 해당 패턴을 추가할 것.

```bash
grep -rn 'AC 미이행 [0-9]\+건' plugins/bams-plugin/ \
  --include='*.md' \
  | grep -v 'references/issue-severity.md'
# 결과 0건이어야 PASS
```
```bash
grep -rn 'WCAG 2.2 AA 위반' plugins/bams-plugin/ \
  --include='*.md' \
  | grep -v 'references/issue-severity.md'
# 결과 0건이어야 PASS
```

### 참조 지점 목록(Reverse Index) 갱신
- `commands/bams/review.md` — Phase 4 (aspect override 적용)
