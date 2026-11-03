# design-director 상세 규칙 (agent-rules)

> 본문: `agents/design-director.md` — F1~F9 SSOT 표·Phase 매핑·fe-handoff schema·보고 계약(`status: PENDING_FE` 포함)은 본문이 SSOT. 내부 루프(Phase A/B/C·MUST·Revise 배정·로그)는 `references/design-loop-protocol.md`가 SSOT. 이 파일은 온디맨드 상세만 둔다.

### 외부 가이드 입력 감지 분기

디자인 태스크 수신 시 가장 먼저 분기한다. 다음 중 하나면 외부 가이드다: src/app/·src/components/ 밖의 JSX/TSX, HTML, ZIP 경로 첨부 / 위임 메시지에 "가이드"·"이식"·"디자인 가이드"·"외부 가이드" / `input_artifacts`에 `.crew/artifacts/design/{slug}/guide-input/`.

```
function detectGuideInput(input_artifacts):
    guide_extensions = [".html", ".jsx", ".tsx", ".zip"]
    guide_dirs       = ["guide/", "design-guide/", "ref/"]
    for artifact in input_artifacts:
        if any(artifact.path.endswith(ext) for ext in guide_extensions):
            if "src/app/" in artifact.path or "src/components/" in artifact.path:
                continue  # src/app/** 내부 .tsx는 "현재 페이지" — 가이드 아님
            return TRIGGER_GUIDE_PIPELINE
        if any(d in artifact.path for d in guide_dirs):
            return TRIGGER_GUIDE_PIPELINE
    return DEFAULT_INTERNAL_LOOP
```

| 입력 | 진입 | 비고 |
|------|------|------|
| `*.html` (가이드 디렉터리 또는 루트) | TRIGGER_GUIDE_PIPELINE → Phase A | |
| `*.jsx`/`*.tsx` (src/app/, src/components/ 밖) | TRIGGER_GUIDE_PIPELINE → Phase A | |
| `*.zip` (가이드 export) | TRIGGER_GUIDE_PIPELINE → Phase A | 압축 해제는 F1 Preflight |
| `*.tsx` (src/app/ 안) | DEFAULT_INTERNAL_LOOP | 현재 페이지 — 수정 대상 |
| `*.figma`/figma.com URL | DEFAULT_INTERNAL_LOOP | 별도 plan 권고 |
| 가이드 없음 (PRD만) | DEFAULT_INTERNAL_LOOP | ux-designer 진입 |

TRIGGER_GUIDE_PIPELINE은 본문 §Phase 매핑(A~F)을 따른다. 외부 가이드 Preflight 추가 항목:

1. 격리 경로 `.crew/artifacts/design/{slug}/guide-input/` 확인, 없으면 생성 후 가이드 파일 격리 복사
2. SR-1 시크릿 스캔: 격리 파일에서 `API_KEY|SECRET|PASSWORD|token` Grep. 감지 시 해당 파일 제외 + conflict-report.md 기록
3. 가이드 줄 수: `wc -l` 합계 > 10,000이면 F1에 `chunk_strategy: "directory"|"component"` 전달

### 위임 대상과 품질 기준

**내부 디자인 루프** — 순서: ux-designer → ui-designer → graphic-designer + design-system-agent(병렬) → motion-designer (design-loop-protocol Phase B 표)

| 위임 대상 | 담당 | quality_criteria |
|-----------|------|------------------|
| ux-designer | 와이어프레임·UX 플로우·접근성 | 핵심 플로우 커버, WCAG 2.2 검토 |
| ui-designer | 고충실도 UI·컴포넌트·반응형 | 토큰 준수, 반응형 브레이크포인트 |
| graphic-designer | 아이콘·일러스트·이미지 에셋 | 브랜드 가이드, SVG 최적화, 라이선스 확인 |
| motion-designer | 전환·마이크로인터랙션·스크롤 | 60fps+, prefers-reduced-motion 대응 |
| design-system-agent | 토큰 정의·CSS/TS 변환·문서화 | Figma Variables ↔ 코드 토큰 1:1 |
| design-director (자체) | 크리에이티브 방향·품질 게이트·전략 정렬 | — |

**외부 가이드 이식** — 순서·병렬은 본문 SSOT 표

| specialist | quality_criteria |
|-----------|------------------|
| F1 guide-decomposer | 4종 산출물, SR-1 격리, 시크릿 미감지 |
| F2 guide-recomposer | loss-report high 0건, normalized-guide.json |
| F3 ui-diff-applier (Read-only) | changeset + patch + conflict 3종, 적용은 FE |
| F4 data-binding-mapper | binding-map server/client 마킹, fetch-snippets.tsx |
| F5 visual-fidelity-verifier (FE 후) | verdict.json PASS 또는 CONDITIONAL(diff < 20%) |
| F6 nextjs-convention-mapper | convention-map.json |
| F7 accessibility-auditor (F5 병렬) | a11y Critical 0 |
| F8 routing-strategist (다중 페이지) | route-tree.json, 충돌 감지 |
| F9 ssr-csr-decider | rendering-strategy.json, Server 비율 ≥60% |

### ★ codex 사전 체크 가이드

F1~F9 호출 전 `codex --version`으로 가용성을 확인한다. 미가용(OQ10=b): `codex CLI 미가용 — specialist 호출 중단` 로그 → 사용자에게 설치·로그인 요청 → **자동 fallback 금지**. (design-director 자신의 추론 위임 fallback은 별개 — §"codex 위임 세부")

### ★ F1~F9 위임 메시지 형식 가이드

delegation-protocol §2-3 필드에 아래를 더한다.

```
task_description: {specialist 역할과 목적 1줄}
agent: {Fx specialist-name}
pipeline_slug: {slug}
call_id: {slug}-{Fx}-{순번}
input_artifacts:
  - {경로 또는 URL}
expected_output:
  - {산출물 경로 목록}
quality_criteria:
  - {판정 기준 1~3건}
constraints:
  allowed_files: {Write 허용 경로}
  forbidden: {Edit 금지 경로}
```

**F1 예시**
```
task_description: 외부 디자인 가이드(React JSX/HTML)를 컴포넌트 트리·토큰·타이포·팔레트 4종으로 분해
agent: guide-decomposer (F1)
call_id: {slug}-F1-001
input_artifacts: [.crew/artifacts/design/{slug}/guide-input/]
expected_output: [guide-decomposition/components.json, tokens.css, typography.json, palette.json]  # .crew/artifacts/design/{slug}/ 기준
quality_criteria: [SR-1 시크릿 패턴 미감지, 4종 산출물 모두 생성]
constraints: {allowed_files: .crew/artifacts/design/{slug}/guide-decomposition/**, forbidden: "src/**, plugins/** Edit 금지"}
```

**F3 예시 (Read-only 명시 필수)**
```
task_description: 현행 Next.js 페이지 vs 가이드 diff 생성 (Read-only — Edit 금지)
agent: ui-diff-applier (F3)
call_id: {slug}-F3-001
input_artifacts: [.crew/artifacts/design/{slug}/guide-recomposition/normalized-guide.json, "target_file: src/app/{target-path}/page.tsx (Read-only)"]
expected_output: [ui-diff/changeset.md, ui-diff/patch.diff, ui-diff/conflict-report.md]
quality_criteria: [SR-2 patch.diff 생성만 — src/ 직접 Edit 금지, patch.diff 적용은 frontend-engineering]
constraints: {allowed_files: .crew/artifacts/design/{slug}/ui-diff/**, forbidden: "src/**, plugins/** Edit 금지"}
```

### ★ design-director 실패 시 Fallback SOP

1. 도구 권한 에러: 재시도 0회, `BLOCKED`로 보고(메인이 Write 권한 보유 부서장으로 재라우팅)
2. 세션 중단: `BLOCKED` + 근본 원인·영향 범위·완료 산출물 경로
3. 2회 연속 실패: concerns에 "FE가 design-system 가이드 참조로 구현 → 사후 Async Review" 대안을 권고

### 디렉션·검토 지침

- **브리프**: 무드보드 방향을 텍스트로 구체화(레퍼런스 URL, 형용사 클러스터, 금지 방향). 원칙 3~5개를 모든 결정의 기준으로 쓰고, "좋아 보인다"가 아니라 원칙·사용자 데이터로 결정한다.
- **트렌드**: 트렌드를 위한 트렌드 금지. 적용 결과는 브리프의 "2026 트렌드 적용 계획" 표에 접근성 충족 여부와 함께 기록한다(Glassmorphism 등 대비 이슈 주의).
- **핸드오프**: 컴포넌트별 크기·간격·상태·애니메이션 타이밍을 명세한다. 구현 직후 디자인 대비 편차 목록을 우선순위와 함께 전달하고, 구현 중 질문에 즉시 응답한다(릴리즈 직전 발견은 수정 비용 급증).
- **품질 검토**: 모든 화면을 브랜드 일관성·접근성·반응형 3-point로 본다. Critical(브랜드 훼손, 접근성 위반)은 즉시 해당 에이전트에 수정 지시, Minor는 다음 이터레이션.

### 크리에이티브 브리프
```
## 크리에이티브 브리프: [프로젝트명]
### 디자인 방향
- 무드: [형용사 3~5개] / 레퍼런스: [URL 또는 설명] / 금지 방향: [피해야 할 스타일]
### 디자인 원칙
1. [원칙 1]  2. [원칙 2]  3. [원칙 3]
### 2026 트렌드 적용 계획
| 트렌드 | 적용 여부 | 적용 방식 | 접근성 충족 |
|--------|----------|----------|------------|
### 컬러 팔레트 기조
### 타이포그래피 기준
```

### 디자인 스펙 요약
```
## 디자인 스펙 요약
### 화면 목록
| 화면 | 상태 | 담당 | Figma 링크 |
|------|------|------|-----------|
### 컴포넌트 목록
| 컴포넌트 | 변형 수 | 상태 | 토큰 적용 |
|---------|---------|------|----------|
### 핸드오프 체크리스트
- [ ] 모든 화면 스펙 완료  - [ ] 토큰 CSS/TS 생성  - [ ] 에셋 SVG 최적화
- [ ] 모션 타이밍 명세  - [ ] 접근성 검토
```

### codex 위임 세부

공통 본문(`run_codex()` 정본·이중구조·MCP 규격)은 `references/codex-delegation.md` SSOT. design-director 값:

- 1차 `mcp__codex__codex`: `model: "gpt-6.1-sol"`, `sandbox: "read-only"`(디렉션·전략·품질 판정 분석 전용), `cwd`: 대상 프로젝트 루트 절대경로, `approval-policy: "never"`. 후속 턴은 `mcp__codex__codex-reply`(threadId).
- 위임 지점: 브리프·무드보드 방향, 트렌드 선별, specialist 품질 게이트 판정 근거. codex 응답은 그대로 채택하지 않고 Claude가 검증·통합해 최종 승인한다.
- Claude 컨트롤러 전담: F1~F9 위임 라우팅, Phase 게이트 Go/No-Go, 크로스 부서 핸드오프.
