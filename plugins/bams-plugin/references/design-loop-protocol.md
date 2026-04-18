# Design Loop Protocol

## 개요

이 프로토콜은 디자인 부서가 claude.ai/design 스타일의 반복적 디자인 루프를 수행할 때 따르는 표준 절차를 정의한다. 단순한 1회성 산출물 생성이 아닌, **초안 → 렌더 → 리뷰 → 수정** 사이클을 최대 5회 반복함으로써 수렴 품질을 보장한다.

design-director가 `/bams:design` 또는 이에 준하는 디자인 Phase를 실행할 때 이 프로토콜을 따른다. 각 Phase와 종료 조건은 아래에 명시되어 있으며, 루프 진행 상황은 `iterations/log.md`에 append 방식으로 기록된다.

## 루프 구조

### Phase A — 크리에이티브 브리프 (1회)

**실행 주체**: design-director (직접 수행)

**목적**: 이후 모든 Phase의 방향성 기준점을 수립한다.

**수행 내용**:
1. PRD와 product-strategy 비전 문서를 분석하여 디자인 방향 정의
2. ux-research 인사이트를 참조하여 사용자 중심 원칙 도출
3. 크리에이티브 브리프 작성: 무드 키워드, 레퍼런스 방향, 금지 스타일, 컬러 기조, 타이포 기준
4. `spec/creative-brief.md`에 브리프 저장
5. 2026 트렌드 적용 계획 수립 (`.crew/references/design-trends-2026.md` 참조)

**산출물**: `spec/creative-brief.md`

**완료 조건**: 브리프 내 디자인 원칙 3개 이상, 2026 트렌드 적용 계획 표 포함, WCAG 2.2 접근성 방침 명시

---

### Phase B — 초안 생성 (5 specialist 순차)

**실행 주체**: design-director가 5명의 specialist에게 순차 위임

**목적**: 크리에이티브 브리프 기반의 초기 디자인 산출물을 전문 영역별로 생성한다.

**순서 및 담당**:

| 순서 | specialist | 주요 산출물 | 전제 조건 |
|------|-----------|------------|----------|
| B-1 | ux-designer | 와이어프레임, UX 플로우, 접근성 검토 | Phase A 완료 |
| B-2 | ui-designer | 고충실도 UI, `preview/` HTML 초안, 반응형 레이아웃 | B-1 완료 |
| B-3 | graphic-designer | 아이콘 SVG, 일러스트, 이미지 에셋 | B-2 완료 |
| B-4 | design-system-agent | `tokens/tokens.css`, `tokens/tokens.ts`, `tokens/tokens.json` | B-2 완료 (B-3와 병렬 가능) |
| B-5 | motion-designer | 트랜지션, 마이크로인터랙션, `prefers-reduced-motion` 구현 | B-2 완료 |

**병렬 허용**: B-3 (graphic-designer)와 B-4 (design-system-agent)는 B-2 완료 후 병렬 실행 가능하다. 단, 컨텍스트 과부하가 예상될 경우 순차 실행으로 전환한다.

**산출물 저장 경로**: `design-artifact-layout.md`의 디렉터리 구조 참조

---

### Phase C — Render-Review-Revise 루프 (최대 5회)

**실행 주체**: design-director (리뷰 주도), 수정 담당 specialist (Revise)

**목적**: 초안의 품질을 수렴 판정 기준까지 반복적으로 개선한다.

**각 iteration 절차**:

```
1. Render  — browse 도구로 preview/index.html 스크린샷 캡처 (360px, 1280px)
2. Review  — 수렴 판정 체크리스트(하단 §MUST 항목) 검증
3. Revise  — FAIL 항목이 있으면 해당 specialist가 수정 (1 iter당 1 specialist)
4. Log     — iterations/log.md에 결과 append
```

**수정 담당 specialist 배정 기준**:

| 이슈 유형 | 담당 specialist |
|----------|----------------|
| 대비율, 색상, 레이아웃, 타이포그래피 | ui-designer |
| tokens.css 하드코딩 값, 토큰 누락 | design-system-agent |
| SVG 파일 크기 초과, 인라인 SVG 제거 | graphic-designer |
| 모션, `prefers-reduced-motion` 누락 | motion-designer |
| 정보 구조, 접근성 시맨틱 | ux-designer |

**제약**:
- 1 iteration당 **1 specialist만** 수정 가능 (섹션 경계 충돌 방지)
- 수정 범위는 해당 specialist의 섹션 마커 내로 한정 (`design-artifact-layout.md §경계 마커 규칙` 참조)

## 종료 조건

다음 3가지 조건 중 **하나라도** 충족되면 루프를 종료한다.

### 조건 1 — 수렴 (PASS)

수렴 판정 체크리스트(하단 §MUST 항목)의 **모든 항목 PASS** + **CRITICAL 이슈 0건**

반환 상태: `PASS`

### 조건 2 — 한계 도달

**iteration 5 완료** — 5회 반복 후에도 수렴 미달인 경우

반환 상태: `CONDITIONAL` (미결 이슈 목록 포함)

### 조건 3 — 비용 초과

**누적 per-agent wall time > 10분** (전체 Phase B + C 합산)

즉시 루프 중단 후 현재까지의 산출물 반환.

반환 상태: `CONDITIONAL` (조기 종료 사유 명시)

---

모든 종료 조건에서 design-director는 pipeline-orchestrator에게 다음 형식으로 보고한다:

```yaml
quality_status: PASS | CONDITIONAL | FAIL
iteration_count: N
unresolved_issues: [...]
output_paths:
  - .crew/artifacts/design/{pipeline_slug}/preview/index.html
  - .crew/artifacts/design/{pipeline_slug}/tokens/tokens.css
  - .crew/artifacts/design/{pipeline_slug}/spec/design-spec.md
```

## 수렴 판정 체크리스트 (MUST)

루프 종료 조건 1(수렴)을 판정하기 위한 5개 필수 항목이다. **모두 PASS**여야 조건 1로 종료된다.

| # | 항목 | 판정 기준 | 검증 방법 |
|---|------|----------|---------|
| M-1 | 텍스트 명도 대비 | 일반 텍스트 ≥ 4.5:1 / 대형 텍스트(18px+ 또는 bold 14px+) ≥ 3:1 | 스크린샷 분석 또는 CSS 색상 값 직접 계산 |
| M-2 | 가로 스크롤 없음 | 360px 및 1280px 두 뷰포트에서 가로 스크롤바 미발생 | browse 스크린샷 또는 CSS `overflow-x` 분석 |
| M-3 | 하드코딩 값 제로 | `tokens.css` 외부 하드코딩 색상/px 값 = 0 (CSS 변수 참조만 허용) | Grep으로 `#[0-9a-fA-F]`, `rgb(`, `[0-9]+px` 검색 후 tokens.css 내부 정의 제외 |
| M-4 | reduced-motion 지원 | `@media (prefers-reduced-motion: reduce)` 미디어쿼리 존재 | Grep으로 `prefers-reduced-motion` 검색 |
| M-5 | tokens.css link 존재 | `preview/index.html` 또는 공통 head에 `tokens.css` link 태그 포함 | `index.html` 내 `<link.*tokens\.css` 확인 |

**CRITICAL 이슈**: M-1(대비율), M-2(가로 스크롤), M-3(하드코딩)은 CRITICAL — 하나라도 FAIL이면 즉시 Revise 단계 진입.

**MINOR 이슈**: M-4, M-5 FAIL은 WARNING으로 처리하되, 3회 이상 연속 FAIL 시 CRITICAL로 승격.

## 로그 포맷

`iterations/log.md`에 각 iteration 결과를 **append** 방식으로 기록한다. 히스토리 보존이 목적이므로 기존 내용은 절대 수정하지 않는다.

```markdown
## iter {N} — {ISO timestamp}
- 감지 이슈: {이슈 목록 또는 "없음"}
- 수정 담당: {specialist 이름 또는 "없음 (PASS)"}
- diff 요약: {변경된 파일 및 주요 수정 내용}
- 판정: PASS | FAIL | CONDITIONAL
```

**예시**:

```markdown
## iter 1 — 2026-04-18T09:30:00Z
- 감지 이슈: M-1 FAIL (버튼 텍스트 대비율 3.2:1), M-3 FAIL (#FF5733 하드코딩)
- 수정 담당: ui-designer
- diff 요약: preview/shared/styles.css — 버튼 색상 var(--color-primary) 토큰 참조로 교체, 대비율 4.7:1 달성
- 판정: FAIL → iter 2 진입

## iter 2 — 2026-04-18T09:45:00Z
- 감지 이슈: 없음
- 수정 담당: 없음 (PASS)
- diff 요약: 변경 없음
- 판정: PASS → 루프 종료
```

## browse 렌더 실패 Fallback

browse 도구의 스크린샷 캡처가 **2회 연속 실패**할 경우 다음 절차를 따른다.

### 절차

1. **정적 분석으로 전환**: 스크린샷 없이 HTML/CSS 소스 코드 직접 분석으로 체크리스트 검증 진행
   - M-1: CSS 색상 변수값 추적하여 대비율 수동 계산
   - M-2: CSS `max-width`, `overflow` 속성 분석
   - M-3: Grep으로 하드코딩 값 검색
   - M-4: `prefers-reduced-motion` 키워드 Grep
   - M-5: index.html tokens.css link 태그 확인

2. **실패 기록**: 스크린샷 대신 `iterations/iter-{N}-render-failed.md`에 실패 사유 기록

   ```markdown
   ## Render Failure — iter {N}
   - 실패 시각: {ISO timestamp}
   - 실패 사유: {에러 메시지 또는 timeout}
   - 연속 실패 횟수: {N}
   - 대체 분석 방법: 정적 HTML/CSS 분석
   - 체크리스트 결과: [M-1: PASS/FAIL, M-2: PASS/FAIL, ...]
   ```

3. **iteration 종료 + CONDITIONAL 반환**: 정적 분석 기반 판정 결과와 함께 루프를 종료하고 `CONDITIONAL` 상태로 반환한다.

4. **[G-SIDECAR] 원인 참조**: browse 렌더 실패의 주요 원인 중 하나는 Tauri sidecar 바이너리 stale이다.
   - 진단: `curl localhost:3099/api/agents/data` — 404 응답이면 sidecar stale 확정
   - 해결: `bash plugins/bams-plugin/scripts/build-sidecar.sh` 실행 후 Tauri 재시작
   - 상세: `.crew/gotchas.md §[G-SIDECAR]` 참조
