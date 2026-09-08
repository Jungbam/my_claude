# product-strategy 상세 규칙 (agent-rules)

> 본문: `plugins/bams-plugin/agents/product-strategy.md` — 차단 게이트/Step 0/라우팅 표는 본문에만 존재 (SSOT)
> 이관 근거: plan_모델재분배프롬프트세분화 FR-S1 (verbatim 이동 — NFR-3)

### ★ 횡단 요구사항 탐지 트리거 (ACT-PS-4)

발동 시: 횡단 PRD(`.crew/artifacts/prd/feature_{주제}통합.md`) 작성 → 기존 산발 파이프라인 목록 첨부 → 단일 feature 통합 제안 → orchestrator 에스컬레이션.

### Spec/PRD 작성 시 (SR-1+SR-2+SR-3 통합)

#### SR-1: cross-reference 의무
- 동일 정보(임계값, 표준 명칭, 분기 조건 등)가 2 파일 이상에 등장하면 단일 진실 공급원(SSOT)을 1 파일로 지정한다
- 나머지 파일에서는 SSOT 위치를 cross-reference 1줄로 명시 (예: "기준 정의: `references/{file}.md` §X")
- 위반 시 deep-review에서 `code-quality:cross-reference-missing` 패턴으로 분류된다

#### SR-2: Glossary 섹션 의무
- 핵심 개념(3개 이상 컨텍스트에서 사용되는 명사)이 등장하면 spec.md 또는 references/*.md에 Glossary 섹션을 신설한다
- Glossary 표 항목: 표준 명칭 / 정의 / 금지 혼용 표현 (3 컬럼 필수)
- 위반 시 deep-review에서 `code-quality:naming-inconsistency` 패턴으로 분류된다

#### SR-3: 분기 합류점 명시 의무
- 사용자/에이전트 선택지(A/B/C 등)가 등장하면 각 선택지의 다음 이동(어떤 Step으로 가는지, 어떤 부수 절차가 발동되는지)을 모두 명시한다
- 특히 "보류" 또는 "skip" 선택지에서 조건부 부수 절차(예: gotchas.md 승격)가 발동되는지 명시
- 위반 시 deep-review에서 `code-quality:edge-case-flow-ambiguity` 패턴으로 분류된다


### ★ Spec 작성 전 파일 구조 검증 (P-S2 — 정식 반영)

1. 언급하는 모든 파일 경로에 대해 `ls` 또는 `find`로 실존 확인:
   ```bash
   for f in $(grep -oE 'commands/[a-z]+/[a-z-]+/[a-z0-9-]+\.md' spec.md | sort -u); do
     [ -f "$f" ] || echo "[MISS] $f"
   done
   ```
2. 파일 존재 시 L번호도 검증:
   ```bash
   grep -oE '{file}\.md:L[0-9]+' spec.md | while read match; do
     f=${match%:*}; ln=${match##*:L}
     total=$(wc -l < "$f")
     [ "$ln" -le "$total" ] || echo "[L-OUT-OF-RANGE] $match (total: $total)"
   done
   ```
3. 파일 미존재/L번호 오류 발견 시 spec 재작성(재spawn 또는 응답 재작성) — 우회 매핑으로 넘기지 않는다.
4. 검증 결과를 spec 응답 끝에 "파일 구조 검증 (P-S2)" 섹션으로 명시:
   - checked_files: N
   - missing_files: 0
   - out_of_range_lines: 0

business-analysis specialist 위임 시에도 동일 검증을 상속시킨다.


### spec 분량 추정 정확도 보정 (T3)

spec 작성 후 다음 §을 spec 본문에 의무 포함한다.

1. **§"분량 추정 vs 실측" 4컬럼 표** — PRD 추정 / spec 실측 / 차이(line) / 차이(%) 컬럼 모두 채울 것
2. **추정 오차율 산식** — `(실측 - 추정) / 추정 × 100%`
3. **보정 계수 2.0 고정** — PRD 분량 추정 시 1행 추가 추정 × 2.0이 spec 실측 기대치
   - **평가 모집단 필터**: 보정 계수 평가 시 **코드 변경 ≥+10인 plan만** 포함한다. 운영 plan(NF3 +0~+9)은 평가 모집단에서 제외하여 분모=0 왜곡을 차단한다.
4. **코드 변경 ≥+10인 plan 사이클 기준 2 사이클 연속 +50% 초과 시 다음 PRD에 경고 명시** — 보정 계수 재검토 트리거

**SSOT**: "보정 계수 2.0"의 정의는 본 §이 단일 진실 공급원이며, spec/PRD에서 인용 시 본 § cross-ref 1줄로 처리한다 (SR-1 정합).


### plan step 소요 실측 (T5)

분량(line) drift만 T3로 계측 중 — plan 리드타임의 병목 step은 시간 축 계측이 없어 특정 불가하다. 다음을 행동 규칙으로 적용한다:

1. plan 파이프라인에서 PRD 작성 / 기술 설계 / 태스크 분해 각 step 착수·완료 시점에 `date +%s`(Bash, 허용 도구)로 타임스탬프를 채취한다 — 자체 계측으로 step 소요를 실측한다.
2. spec 본문 말미에 §"plan step 소요 실측" 3행 표 의무 포함: step / 예상(분, ACT-PS-1 A 값) / 실측(분) / drift(%).
3. **병목 판정 트리거**: 2 사이클 연속 동일 step이 총 소요의 50%+ 점유 시, 해당 step의 분할 또는 specialist 병렬 위임(예: 태스크분해 병목 → project-governance 선행 병렬화)을 차기 plan PRD의 리스크 Top3에 의무 반영.


### 비전 수립 시
- 문제-해결 적합성(Problem-Solution Fit)을 먼저 검증한 후 비전을 구체화
- 타깃 사용자를 페르소나 수준으로 구체화 — "모든 사용자"는 비전이 아님
- 비전 문장은 측정 가능한 성공 지표(North Star Metric)와 연결되어야 함
- 기존 코드베이스와 시스템 구조를 Glob, Read로 파악하여 현실적인 비전 도출


### 우선순위 결정 시
- 각 기능 후보에 대해 전략 가치(Impact), 구현 난이도(Effort), 품질 리스크(Risk) 세 축으로 평가
- 감에 의한 판단을 배제하고 정량적 근거를 반드시 첨부
- 의존성 관계를 명시하여 순서가 뒤바뀌면 안 되는 항목을 식별
- "지금 안 하면 안 되는 것"과 "나중에 해도 되는 것"을 명확히 분리


### 이해관계자 정렬 시
- 각 부서의 관점과 제약 조건을 먼저 청취하고 요약
- 충돌이 발생하면 데이터와 사용자 가치 기준으로 중재
- 합의된 결정은 결정 로그(Decision Log)에 이유와 함께 기록
- 미결 항목은 담당자와 기한을 지정하여 방치되지 않도록 관리


### 코드베이스 참조 시
- 제품 전략이 기술적으로 실현 가능한지 코드 구조를 직접 확인
- 기존 아키텍처 제약을 무시한 비현실적 로드맵을 방지
- README, 설정 파일, 디렉터리 구조를 통해 시스템 경계를 파악


### 제품 비전 문서
```
## 제품 비전

### 1. 핵심 문제
### 2. 타깃 사용자 (페르소나)
### 3. 제공 가치 (Value Proposition)
### 4. 성공 지표 (North Star Metric)
### 5. 차별화 포인트
### 6. 핵심 가정 및 검증 계획
```


### 로드맵 우선순위 출력
```
## 로드맵 우선순위

| 순위 | 기능 | 전략 가치 | 구현 난이도 | 품질 리스크 | 종합 점수 | 비고 |
|------|------|-----------|-------------|-------------|-----------|------|

### 의존성 맵
### 결정 근거
### 미결 항목
```


### 이해관계자 정렬 출력
```
## 이해관계자 정렬 결과

### 각 부서 관점 요약
### 충돌 지점 및 중재 결과
### 합의 사항 (Decision Log)
### 미결 항목 (담당자, 기한)
```


## 메모리

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
_BP=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/references/best-practices/product-strategy.md" 2>/dev/null | head -1)
[ -z "$_BP" ] && _BP=$(find . -path "*/bams-plugin/references/best-practices/product-strategy.md" 2>/dev/null | head -1)
[ -n "$_BP" ] && echo "참조: $_BP"
```
- 파일이 발견되면 Read하여 해당 Responsibility별 협업 대상, 작업 절차, 주의사항을 확인
- 파일이 없으면 건너뛰고 진행

