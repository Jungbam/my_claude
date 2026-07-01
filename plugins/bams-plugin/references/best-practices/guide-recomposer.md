# Best Practice: guide-recomposer

## 1. 호출 컨텍스트
- **트리거**: design-import 파이프라인의 Phase B에서 design-director가 F1 완료 직후 위임. F1과 직렬 의존.
- **입력**:
  - `.crew/artifacts/design/{slug}/guide-decomposition/components.json`
  - `.crew/artifacts/design/{slug}/guide-decomposition/tokens.css`
  - `.crew/artifacts/design/{slug}/guide-decomposition/typography.json`
  - `.crew/artifacts/design/{slug}/guide-decomposition/palette.json`
  - `.crew/artifacts/design/{slug}/guide-input/{guide}.html` — 원본 (비교용)
- **출력**:
  - `guide-recomposition/preview/index.html` (재조립 결과)
  - `guide-recomposition/diff-report.md`
  - `guide-recomposition/loss-report.json`
  - `guide-recomposition/placeholder-slots.json` (F4 입력)
  - `guide-recomposition/normalized-guide.json` (F3/F4 공통 입력)
- **부서장**: design-director
- **모델**: gpt-5-codex (codex CLI 위임) + sonnet controller

## 2. 자주 발생하는 실수 3건

### 실수 1: loss-report severity=high 무시하고 F3 진행
- **증상**: CSS Grid auto-fill 누락, 컴포넌트 트리 구조 누락 등 high severity 손실이 있음에도 design-director에 에스컬레이션 없이 F3 ui-diff-applier 바로 위임.
- **원인**: loss-report.json 파싱 후 severity 합산 로직 없이 전체 count만 확인.
- **회피**: `jq '[.items[] | select(.severity=="high")] | length' loss-report.json` 실행 후 0 초과 시 반드시 design-director에 F1 재실행 요청. 자동 진행 절대 금지.

### 실수 2: components.json v1.1 신규 필드 미활용으로 재조립 열화
- **증상**: `html_tag` 없이 div로만 재조립. `inline_styles`와 `css_classes` 미적용. 원본 대비 레이아웃 손실 high severity 다수.
- **원인**: v1.0 재조립 로직을 그대로 사용. v1.1 신규 필드 존재 여부 미확인.
- **회피**: components.json `version` 필드 확인 → "1.1"이면 6개 신규 필드 적용. `html_tag` → outer JSX tag, `inline_styles` → `style={{...}}` (camelCase 변환), `section_id` → `id={section_id}`.

### 실수 3: 더미 텍스트 패턴 Grep 미실행으로 placeholder-slots.json 빈 상태
- **증상**: `placeholder-slots.json`이 `{"slots": []}` 빈 배열로 생성. F4 data-binding-mapper가 매핑할 슬롯 없음 → RSC fetch 스니펫 0건.
- **원인**: 재조립 preview 생성에 집중하고 플레이스홀더 마킹 단계 누락.
- **회피**: 재조립 완료 직후 반드시 더미 텍스트 Grep 실행: `grep -nE '"Lorem ipsum|사용자이름|000|홍길동|email@example' guide-input/*.html`. `{{SLOT_NAME}}` 형식으로 마킹 후 slots 배열 생성.

## 3. 권장 패턴

- **패턴 A — 4종 입력 존재 확인 후 시작**: `for f in components.json tokens.css typography.json palette.json; do [ -f "guide-decomposition/$f" ] || { echo "MISSING: $f"; exit 1; }; done`. Missing 시 즉시 design-director 에스컬레이션.
- **패턴 B — DOM diff 생성**: 원본 HTML과 재조립 preview를 `diff -u guide-input/guide.html preview/index.html > diff-report-raw.txt`로 비교. 구조적 차이(태그 누락, depth 불일치)를 severity로 분류하여 diff-report.md 작성.
- **패턴 C — normalized-guide.json 직렬화**: F3/F4 공통 입력 형식으로 재조립 결과를 정규화. `{"version":"1.0","component_count":N,"slots":[],"layout_tree":{...}}` 스키마 준수. codex 위임: `run_codex "다음 재조립 HTML을 normalized-guide.json 형식으로 직렬화하라..."`.

## 4. 체크리스트 (5건 필수)
- [ ] F1 산출물 4종 존재 확인 후 시작 (missing → design-director 에스컬레이션)
- [ ] frontmatter `model: gpt-5-codex` + result_summary `"via gpt-5-codex (codex CLI)"` 일치
- [ ] viz `agent_start` (작업 시작 전) / `agent_end` (완료 후) emit 누락 0
- [ ] loss-report.json severity=high 건수 확인 — 1건 이상 시 F3 진행 중단 + design-director 에스컬레이션
- [ ] placeholder-slots.json 슬롯 목록 비어있지 않음 (더미 텍스트 Grep 실행 완료)

## 5. 참고
- 부모 deep-review: deep-review_designimport품질진단_20260630
- 후속 hotfix: PR #14 (Critical) + PR #15 (Major)
- 본 plan: plan_designimport정밀화 (F-R-A1)
- 협업: F1 guide-decomposer (전 단계), F3 ui-diff-applier (후속), F4 data-binding-mapper (병렬 가능)
