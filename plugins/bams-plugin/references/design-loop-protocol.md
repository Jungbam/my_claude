# Design Loop Protocol

디자인 부서의 반복 루프 SSOT. design-director가 내부 디자인 Phase(외부 가이드 없음)를 실행할 때 **초안 → 렌더 → 리뷰 → 수정**을 최대 5회 반복해 수렴 품질을 보장한다. 진행은 `iterations/log.md`에 append한다. 산출물 경로는 `references/design-artifact-layout.md`.

## Preflight

- `.crew/artifacts/design/{pipeline_slug}/` Write 가능 여부(불가하면 platform-devops에 생성 위임)
- 선행 아티팩트: `*-prd.md` 및 design 입력 문서(`*-design.md`/`*-spec.md`)
- Preflight 생략 시 NO-GO — 완료 후 재진입. 루프 진입 후 경로 재계획 금지.

## 루프 구조

### Phase A — 크리에이티브 브리프 (design-director 직접, 1회)

PRD·비전·ux-research 인사이트로 무드 키워드, 레퍼런스, 금지 스타일, 컬러·타이포 기조를 정하고 `.crew/references/design-trends-2026.md`로 트렌드 적용 계획을 세워 `spec/creative-brief.md`에 저장한다.

**완료 조건**: 디자인 원칙 3개 이상, 2026 트렌드 적용 계획 표, WCAG 2.2 접근성 방침 명시

### Phase B — 초안 생성 (5 specialist 순차)

| 순서 | specialist | 주요 산출물 | 전제 |
|------|-----------|------------|------|
| B-1 | ux-designer | 시맨틱 HTML 골격 `preview/screens/*.html`, UX 플로우, 접근성 검토 | Phase A |
| B-2 | ui-designer | `preview/shared/styles.css`(`/* === UI === */`) + `preview/index.html`, 반응형 | B-1 |
| B-3 | graphic-designer | `assets/icons/*.svg` + `/* === GRAPHIC === */` | B-2 |
| B-4 | design-system-agent | `tokens/tokens.{css,ts,json}`, var() 치환 | B-2 (B-3와 병렬 가능) |
| B-5 | motion-designer | `/* === MOTION === */`, `@keyframes`, `prefers-reduced-motion` | B-2 |

B-3·B-4 병렬은 컨텍스트 과부하가 예상되면 순차로 전환한다.

### Phase C — Render-Review-Revise (최대 5회)

```
1. Render  — browse로 preview/index.html 스크린샷 (360px, 1280px)
2. Review  — §수렴 판정 체크리스트
3. Revise  — FAIL 항목 담당 specialist 1명이 수정
4. Log     — iterations/log.md append
```

**Revise 담당 배정 (1 iteration당 1 specialist)**

| 이슈 유형 | 담당 |
|----------|------|
| 대비율, 색상, 레이아웃, 반응형, 타이포그래피 | ui-designer |
| tokens.css 하드코딩 값, 토큰 불일치·누락 | design-system-agent |
| SVG 최적화·크기 초과, SVG 접근성 속성 | graphic-designer |
| 모션, `prefers-reduced-motion` 누락 | motion-designer |
| 정보 구조, HTML 시맨틱, ARIA | ux-designer |

수정 범위는 담당 specialist의 섹션 마커 안으로 한정한다(`design-artifact-layout.md §경계 마커 규칙`). 같은 iteration에 복수 specialist 재호출 금지.

## 수렴 판정 체크리스트 (MUST)

| # | 항목 | 판정 기준 | 검증 방법 |
|---|------|----------|---------|
| M-1 | 텍스트 명도 대비 | 일반 ≥ 4.5:1 / 대형(18px+ 또는 bold 14px+) ≥ 3:1 | 스크린샷 분석 또는 CSS 색상 값 계산 |
| M-2 | 가로 스크롤 없음 | 360px·1280px에서 가로 스크롤바 미발생 | 스크린샷 또는 CSS `overflow-x`·`max-width` 분석 |
| M-3 | 하드코딩 값 제로 | `tokens.css` 외부 하드코딩 색상/px = 0 | Grep `#[0-9a-fA-F]`, `rgb(`, `[0-9]+px` 후 tokens.css 정의 제외 |
| M-4 | reduced-motion | `@media (prefers-reduced-motion: reduce)` 존재 | Grep `prefers-reduced-motion` |
| M-5 | tokens.css link | `preview/index.html` 공통 head에 link | `<link.*tokens\.css` 확인 |

- **CRITICAL**: M-1·M-2·M-3 — 하나라도 FAIL이면 즉시 Revise.
- **MINOR**: M-4·M-5 FAIL은 WARNING, 3회 연속 FAIL이면 CRITICAL 승격.

## 종료 조건

| 조건 | 기준 | 보고 status |
|------|------|------------|
| 수렴 | MUST 전부 PASS + CRITICAL 0건 → `spec/design-spec.md` 작성 | `DONE` |
| 한계 도달 | iteration 5 완료 후 미수렴 | `DONE_WITH_CONCERNS` (미결 이슈 목록) |
| 비용 초과 | 누적 per-agent wall time > 10분(Phase B+C 합산) → 즉시 중단, 현재 산출물 반환 | `DONE_WITH_CONCERNS` (조기 종료 사유) |

보고는 delegation-protocol §2-5 계약을 따른다(design-director 확장 필드 `design_spec` 포함 — `agents/design-director.md` §결과 보고). iteration 수·미결 이슈·산출물 경로(`preview/index.html`, `tokens/tokens.css`, `spec/design-spec.md`)는 보고 파일에 쓴다.

## 로그 포맷

`iterations/log.md`에 append만 한다(기존 내용 수정 금지).

```markdown
## iter {N} — {ISO timestamp}
- 감지 이슈: {이슈 목록 또는 "없음"}   (예: M-1 FAIL 버튼 대비 3.2:1, M-3 FAIL #FF5733)
- 수정 담당: {specialist 또는 "없음 (PASS)"}
- diff 요약: {변경 파일과 주요 수정}
- 판정: PASS | FAIL → iter {N+1} | CONDITIONAL
```

## browse 렌더 실패 Fallback

렌더 실패(non-zero exit, stdout 에러, 스크린샷 미생성) 시:

1. **1차 실패**: `iterations/iter-{N}-render-failed.md`에 기록하고, 렌더 환경(브라우저 데몬 등) 점검 후 1회만 재시도한다.
2. **2차 연속 실패**: 루프를 즉시 종료하고 정적 분석으로 체크리스트를 판정한다 — M-3·M-4·M-5는 Grep, M-1은 CSS 색상 변수값으로 대비 계산, M-2는 자동 검증 불가.
3. `DONE_WITH_CONCERNS`로 보고하고 concerns에 "browse 렌더 2회 연속 실패 — 실제 렌더 재검증 후속 필요"를 넣는다.

```markdown
## Render Failure — iter {N}
- 실패 시각: {ISO timestamp}
- 실패 사유: {에러 메시지 또는 timeout}
- 연속 실패 횟수: {N}
- 대체 분석 방법: 정적 HTML/CSS 분석
- 체크리스트 결과: [M-1: PASS/FAIL, M-2: N/A, M-3: PASS/FAIL, M-4: PASS/FAIL, M-5: PASS/FAIL]
```
