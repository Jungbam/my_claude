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

리뷰 지적마다 confidence(0-100)를 붙인다. 앵커:

| 점수 | 의미 |
|------|------|
| 0 | 다시 보면 무너지는 오탐, 또는 변경 전부터 있던 문제 |
| 25 | 실제일 수도 오탐일 수도 있음. 스타일 지적인데 프로젝트 규칙에 명시 없음 |
| 50 | 실제 문제지만 사소하거나 드물게 발생 |
| 75 | 재확인함. 실제로 발생할 가능성이 높고 기능에 직접 영향, 또는 프로젝트 규칙에 명시 |
| 100 | 코드 인용·실행 출력으로 확정, 자주 발생 |

**80 이상만 보고한다.** 필터·독립 검증 절차는 `references/multi-perspective-review.md` §지적 검증 필터.

## Release Gate 임계값 (SSOT)

모든 릴리스 게이트 판정(review / dev QG / feature Phase 3 / hotfix / ship / deploy / qa)은 아래 임계값을 쓴다. 파이프라인별 조정은 §파이프라인별 Override.

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

Override를 인용하는 커맨드는 근거를 함께 적는다. 근거 없는 완화는 금지한다.

참조처는 목록으로 관리하지 않는다 — `grep -rln 'issue-severity.md' plugins/bams-plugin/{agents,commands,references}`로 확인.

### 하드코딩 금지 검사

임계값·aspect 기준 문구는 본 파일에만 둔다. 결과 0건이어야 PASS (`차이점: 본 파이프라인 N값` 통일본은 예외). aspect 임계값을 추가하면 패턴에도 추가한다.

```bash
grep -rnE 'Critical 0건.*Major 2건|AC 미이행 [0-9]+건|WCAG 2.2 AA 위반' plugins/bams-plugin/ --include='*.md' \
  | grep -v 'references/issue-severity.md' | grep -v '차이점: 본 파이프라인 N값'
```

### 자산 시각검증 게이트 (SSOT — A3)

CSS/폰트/이미지 등 **자산 변경 배치**(축소·삭제·교체 포함)는 typecheck/lint/unit 통과 또는 build+HTTP 200만으로 GO 판정할 수 없다. 근거: `declare module "*.css"` 류 wildcard 타입 선언이 typecheck를 무력화하여 자산 삭제/변경의 시각 회귀를 정적 검증이 감지하지 못한다.

- **필수 산출물**: build 통과 + 변경 라우트(자산 소비 페이지) 전후 스크린샷(`bams:browse` 또는 `visual-fidelity-verifier` 산출). HTTP 200 응답을 시각검증으로 갈음 금지.
- **판정**: 전후 스크린샷이 배치 산출물에 포함되어야 GO. 스크린샷 부재 시 **CONDITIONAL-GO**(사용자/RQG 확인 필요)로 강등.
- **역할 분담**: 시각 품질 정성 판정은 `visual-fidelity-verifier`에 위임, 용량 최적화 실행은 `platform-devops` 자체.

이 게이트는 릴리스 게이트 판정 주체(RQG)와 자산을 변경하는 에이전트(frontend-engineering / platform-devops)가 공통으로 참조하는 SSOT다.

## aspect별 Override (SSOT)

`/bams:review --aspect ...`는 항상 Phase 4 게이트를 실행한다. 아래 aspect별 추가 Critical/Major 기준은 §기본 임계값과 **함께** 적용한다(대체 아님).

| aspect | 추가 Critical 기준 | 추가 Major 기준 | 근거 |
|---|---|---|---|
| `uiux` | WCAG 2.2 AA 위반 1건 이상 | 시각 diff 임계값(픽셀 불일치) 초과 | PRD F-R11 |
| `functional` | 기존 회귀 테스트 실패 1건 이상 | 엣지케이스 미커버(신규 발견) 다수 | PRD F-R11 |
| `performance` | (§Performance Critical 표 그대로 — 메모리 누수 등) | LCP 3s 초과 (기존 §Performance Major와 동일, 신규 아님) | PRD F-R11 |
| `spec` | AC 미이행 3건 이상 | AC 미이행 1~2건 | **제안값 — spec 단계에서 최종 확정 필요(PRD §13 로드맵)** |
| `code` | (변경 없음 — 기존 §기본 임계값 그대로) | (변경 없음) | — |

**다중 aspect 통합 판정 (worst-case)**: aspect별로 판정한 뒤 하나라도 FAIL이면 FAIL, FAIL 없이 CONDITIONAL이 있으면 CONDITIONAL, 모두 PASS일 때만 PASS.
