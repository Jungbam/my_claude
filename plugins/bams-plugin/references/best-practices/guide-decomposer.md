# Best Practice: guide-decomposer

## 1. 호출 컨텍스트
- **트리거**: design-import 파이프라인의 Phase A에서 design-director가 첫 번째로 위임. F6 nextjs-convention-mapper와 병렬 호출 가능.
- **입력**:
  - `.crew/artifacts/design/{slug}/guide-input/{guide}.jsx` — 격리된 React JSX 가이드
  - `.crew/artifacts/design/{slug}/guide-input/{guide}.html` — 또는 HTML 파일
  - (선택) `.crew/artifacts/design/{slug}/guide-input/*.css` — 동봉 스타일시트
- **출력**:
  - `guide-decomposition/components.json` (v1.1 스키마 — 6 optional 필드 포함)
  - `guide-decomposition/tokens.css`
  - `guide-decomposition/typography.json`
  - `guide-decomposition/palette.json`
  - (대형 가이드) `guide-decomposition/chunks/chunk-{N}.json`
- **부서장**: design-director
- **모델**: gpt-5-codex (codex CLI 위임) + sonnet controller

## 2. 자주 발생하는 실수 3건

### 실수 1: v1.1 optional 필드 omit
- **증상**: components.json 항목에 `html_tag`, `inline_styles` 등 6개 신규 필드 자체가 없음. F2 guide-recomposer가 in-key 검사에서 필드 부재를 "미지원"으로 처리, 재조립 품질 저하.
- **원인**: DOM 파싱 시 추출 실패하면 필드를 skip하는 코드 패턴. v1.0 호환 처리 로직과 혼동.
- **회피**: 추출 실패 시에도 `null` 또는 기본값(`""`, `[]`, `"flow"`)으로 반드시 필드 포함. 절대 omit 금지.
  ```json
  { "html_tag": null, "inline_styles": {}, "css_classes": [], "layout_type": "flow", "parent_component": null, "section_id": null }
  ```

### 실수 2: 원본 경로 직접 처리 (SR-1 위반)
- **증상**: `guide-input/` 격리 없이 호출자가 제공한 경로(`/Users/.../guide.jsx`)를 바로 Read. 시크릿 패턴이 포함된 파일을 격리 없이 AST 분석.
- **원인**: Preflight 격리 단계를 건너뛰고 AST 분석 즉시 시작하는 단축 처리.
- **회피**: 반드시 `guide-input/` 하위로 cp 후 처리. `eval()`, `import()`, `require()` 패턴과 시크릿 패턴(API 키, `.env` 참조) Grep을 격리 직후 수행.

### 실수 3: 10,000줄 미만에도 청킹 불필요 처리 후 OOM
- **증상**: 8,000~9,000줄 규모 가이드를 단일 로드하여 AST 파서 OOM. codex 프롬프트 초과.
- **원인**: `wc -l` Preflight 없이 바로 `bun run` AST 분석 시작.
- **회피**: 항상 `wc -l` 먼저 실행. 8,000줄 이상은 `section,h1,h2` 청킹 적극 고려. `CHUNK_STRATEGY` 환경 변수 또는 위임 메시지 `meta.chunk_strategy` 우선 확인.

## 3. 권장 패턴

- **패턴 A — Preflight 3단계**: (1) 입력 격리 복사 `cp guide.jsx guide-input/`, (2) `wc -l` 줄 수 체크, (3) 시크릿 패턴 Grep (`grep -E 'OPENAI_API_KEY|sk-|\.env'`). 모두 통과 후 AST 분석 시작.
- **패턴 B — codex 위임 + Claude 후처리**: `run_codex "다음 JSX를 분석하여 components.json v1.1 스키마로 출력하라..."` 호출 후 반환값을 Claude가 JSON parse 검증 → `Write`로 저장. codex 응답을 그대로 저장 금지.
- **패턴 C — 병렬 4종 추출**: components / tokens / typography / palette를 순차가 아닌 독립 Bash 스크립트 병렬 호출로 처리. 각 산출물을 별도 Write. 병렬 실행 시 conflict-report.md에 중복 컴포넌트명 기록.

## 4. 체크리스트 (5건 필수)
- [ ] 입력 파일 `guide-input/` 격리 완료 + 시크릿 패턴 Grep PASS
- [ ] frontmatter `model: gpt-5-codex` + result_summary `"via gpt-5-codex (codex CLI)"` 일치
- [ ] viz `agent_start` (작업 시작 전) / `agent_end` (완료 후) emit 누락 0
- [ ] components.json v1.1 스키마 — 6 optional 필드 모두 포함 (`null` 허용, omit 금지)
- [ ] 4종 산출물 전원 존재 확인: components.json, tokens.css, typography.json, palette.json

## 5. 참고
- 부모 deep-review: deep-review_designimport품질진단_20260630
- 후속 hotfix: PR #14 (Critical) + PR #15 (Major)
- 본 plan: plan_designimport정밀화 (F-R-A1)
- 협업: F2 guide-recomposer (후속), F6 nextjs-convention-mapper (병렬), design-system-agent (토큰 분류)
