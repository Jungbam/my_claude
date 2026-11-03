# product-strategy 상세 규칙 (agent-rules)

> 본문: `agents/product-strategy.md` — 차단 게이트(ACT-PS-1~5, P-S2)·Step 0·보고 계약은 본문이 SSOT. 이 파일은 온디맨드 상세만 둔다.

### SR-1~SR-3 상세

- **SR-1 cross-reference**: 동일 정보(임계값, 표준 명칭, 분기 조건)가 2 파일 이상에 나오면 SSOT 1 파일을 지정하고 나머지는 `기준 정의: references/{file}.md §X` 1줄로 가리킨다. 위반 분류: deep-review `code-quality:cross-reference-missing`.
- **SR-2 Glossary**: 3개 이상 컨텍스트에서 쓰이는 핵심 명사가 있으면 spec.md 또는 references/*.md에 Glossary(표준 명칭 / 정의 / 금지 혼용 표현)를 둔다. 위반 분류: `code-quality:naming-inconsistency`.
- **SR-3 분기 합류점**: 선택지(A/B/C)마다 다음 Step과 발동되는 부수 절차를 명시한다. 특히 "보류"·"skip"에서 조건부 부수 절차(예: gotchas.md 승격)가 발동되는지 적는다. 위반 분류: `code-quality:edge-case-flow-ambiguity`.

### P-S2 검증 스크립트

```bash
# 1. 경로 실존
for f in $(grep -oE 'commands/[a-z]+/[a-z-]+/[a-z0-9-]+\.md' spec.md | sort -u); do
  [ -f "$f" ] || echo "[MISS] $f"
done
# 2. L번호 범위
grep -oE '{file}\.md:L[0-9]+' spec.md | while read match; do
  f=${match%:*}; ln=${match##*:L}
  total=$(wc -l < "$f")
  [ "$ln" -le "$total" ] || echo "[L-OUT-OF-RANGE] $match (total: $total)"
done
```

미존재·범위 오류가 나오면 spec을 다시 쓴다(우회 매핑 금지). business-analysis 위임 시 같은 검증을 상속시킨다.

### spec 분량 추정 정확도 보정 (T3)

spec 본문에 의무 포함:

1. §"분량 추정 vs 실측" 4열 표 — PRD 추정 / spec 실측 / 차이(line) / 차이(%)
2. 오차율 `(실측 - 추정) / 추정 × 100%`
3. **보정 계수 2.0 고정** — PRD 분량 추정 1행 × 2.0 = spec 실측 기대치. 평가 모집단은 **코드 변경 ≥+10인 plan만**(운영 plan +0~+9 제외, 분모 0 왜곡 차단)
4. 그런 plan 기준 2 사이클 연속 +50% 초과 → 다음 PRD에 경고 명시(계수 재검토 트리거)

"보정 계수 2.0"의 정의는 이 §이 SSOT다. 인용 시 cross-ref 1줄로 처리한다(SR-1).

### plan step 소요 실측 (T5)

1. plan 파이프라인의 PRD 작성 / 기술 설계 / 태스크 분해 step 착수·완료 시 `date +%s`로 타임스탬프를 채취한다.
2. spec 말미 §"plan step 소요 실측" 3행 표: step / 예상(분, ACT-PS-1 A 값) / 실측(분) / drift(%).
3. **병목 트리거**: 2 사이클 연속 같은 step이 총 소요의 50%+ → 그 step의 분할 또는 specialist 병렬 위임을 차기 plan PRD 리스크 Top3에 반영.

### 판단 지침

- **비전**: Problem-Solution Fit을 먼저 검증한다. 타깃은 페르소나 수준으로("모든 사용자"는 비전이 아님), 비전 문장은 North Star Metric과 연결한다.
- **우선순위**: Impact·Effort·Risk 3축에 정량 근거를 붙이고, 순서가 바뀌면 안 되는 의존 항목과 "지금 / 나중"을 분리한다.
- **정렬**: 각 부서 관점·제약을 먼저 요약하고, 충돌은 데이터와 사용자 가치로 중재한다. 결정은 Decision Log에 이유와 함께, 미결 항목은 담당자·기한을 지정한다.
- **코드베이스**: README·설정·디렉터리 구조로 시스템 경계를 파악하고, 아키텍처 제약을 무시한 로드맵을 만들지 않는다.

### 출력 템플릿

```
## 제품 비전
### 1. 핵심 문제
### 2. 타깃 사용자 (페르소나)
### 3. 제공 가치 (Value Proposition)
### 4. 성공 지표 (North Star Metric)
### 5. 차별화 포인트
### 6. 핵심 가정 및 검증 계획
```

```
## 로드맵 우선순위
| 순위 | 기능 | 전략 가치 | 구현 난이도 | 품질 리스크 | 종합 점수 | 비고 |
|------|------|-----------|-------------|-------------|-----------|------|
### 의존성 맵 / 결정 근거 / 미결 항목
```

```
## 이해관계자 정렬 결과
### 각 부서 관점 요약 / 충돌 지점 및 중재 결과 / 합의 사항 (Decision Log) / 미결 항목 (담당자, 기한)
```
