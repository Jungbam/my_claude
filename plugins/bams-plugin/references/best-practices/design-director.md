# design-director Best Practices

> Last updated: 2026-04-18

## Responsibility: 디자인 부서장 — claude.ai/design 스타일 반복 워크플로우 오케스트레이션

---

### 스킬 1: 루프 오케스트레이션 (orchestrate_design_loop)

**언제 참조:**
- `/bams:plan`, `/bams:dev`, `/bams:feature` 파이프라인이 design-director를 spawn했을 때
- 입력에 `expected_output.type == "executable_design_mockup"`이 포함될 때

**협업 대상:**
- ux-designer (시맨틱 HTML 골격 — `preview/screens/*.html`)
- ui-designer (styles.css `/* === UI === */` 섹션 + `preview/index.html`)
- graphic-designer (SVG 에셋 — `assets/icons/*.svg` + `/* === GRAPHIC === */` 섹션)
- motion-designer (styles.css `/* === MOTION === */` 섹션 + `@keyframes`)
- design-system-agent (토큰 추출 및 var() 치환 — `tokens/tokens.{css,ts,json}`)

**작업 절차:**
1. **Preflight** (반드시 실행 — [G-NEW2] 생략 금지):
   - `.crew/artifacts/design/{pipeline_slug}/` 디렉터리 Write 권한 확인 (없으면 platform-devops에 생성 위임)
   - 선행 아티팩트 존재 확인: `*-prd.md`, `*-design.md`, `*-spec.md`
   - browse 바이너리 stale 사전 체크: `curl localhost:3099/api/agents/data` 404 응답 시 sidecar stale 확정 → `build-sidecar.sh` 재빌드 후 Phase C 진입
2. **Phase A — 크리에이티브 브리프** (design-director 직접, 1회):
   - `.crew/references/design-trends-2026.md` Read
   - `spec/creative-brief.md` 작성 (디자인 원칙 3개 이상, 트렌드 적용 계획 표, WCAG 2.2 방침 명시)
3. **Phase B — 초안 생성** (5 specialist 순차 위임):
   - B-1: ux-designer → `preview/screens/*.html` (시맨틱 골격)
   - B-2: ui-designer → `preview/shared/styles.css` + `preview/index.html` (B-1 완료 후)
   - B-3: graphic-designer → `assets/icons/*.svg` + 목업 주입 (B-2 완료 후)
   - B-4: design-system-agent → `tokens/tokens.{css,ts,json}` (B-2 완료 후, B-3와 병렬 가능)
   - B-5: motion-designer → `@keyframes` + `prefers-reduced-motion` 블록 (B-2 완료 후)
4. **Phase C — Render-Review-Revise 루프** (최대 5회, `references/design-loop-protocol.md` 준수):
   - **Render**: browse 호출로 `preview/index.html` 헤드리스 렌더 (360px, 1280px 두 뷰포트)
   - **Review**: 수렴 판정 체크리스트 MUST 5개 항목 점검
   - **Decide**: PASS → 루프 종료 / FAIL (iter<5) → Revise / FAIL (iter==5) → CONDITIONAL 반환
   - **Revise**: 편차 카테고리별 specialist 1명만 재호출 (1 iter 1 specialist 원칙)
   - **Log**: `iterations/log.md` append (iter 번호 / 감지 이슈 / 수정 담당 / 판정)

**browse 호출 구체 예시:**
```bash
_BROWSE_BIN=$(find ~/.claude/plugins/cache -name "browse-cli" -path "*/browse/*" 2>/dev/null | head -1)
PREVIEW_PATH="/Users/bamjung/Documents/ezar/claude/my_claude/.crew/artifacts/design/{pipeline_slug}/preview/index.html"
SHOT_DIR="/Users/bamjung/Documents/ezar/claude/my_claude/.crew/artifacts/design/{pipeline_slug}/iterations"

# mobile viewport
$_BROWSE_BIN screenshot \
  --url "file://$PREVIEW_PATH" \
  --viewport 360x800 \
  --out "$SHOT_DIR/iter-{N}-mobile.png"

# desktop viewport
$_BROWSE_BIN screenshot \
  --url "file://$PREVIEW_PATH" \
  --viewport 1280x800 \
  --out "$SHOT_DIR/iter-{N}-desktop.png"
```

**산출물:**
- `aggregated_output` (PRD §3.1 표준 YAML)
- `preview/index.html`, `tokens/tokens.{css,ts,json}`, `spec/design-spec.md`, `iterations/log.md`
- 스크린샷: `iterations/iter-{N}-mobile.png`, `iterations/iter-{N}-desktop.png`

**주의사항:**
- 루프 내 재계획 금지 — Preflight에서 경로 확정 후 이탈 금지
- self-reference 금지 — 자신의 `design-director.md` 수정은 hr-agent에게 위임
- [G-NEW2] Preflight 생략 시 즉시 NO-GO 반환 후 체크 완료 후 재진입

---

### 스킬 2: 수렴 판정 (evaluate_convergence)

**언제 참조:**
- Phase C Render 단계 완료 후, 스크린샷을 Read로 확인한 직후

**협업 대상:**
- 해당 iter에서 Revise 대상으로 선정될 specialist 1명

**작업 절차:**
1. `references/design-loop-protocol.md §수렴 판정 체크리스트 (MUST)` 5개 항목 점검:
   - M-1: 텍스트 명도 대비 ≥ 4.5:1 (일반) / ≥ 3:1 (대형 18px+ 또는 bold 14px+) — CRITICAL
   - M-2: 360px / 1280px 두 뷰포트 가로 스크롤 없음 — CRITICAL
   - M-3: `tokens.css` 외부 하드코딩 색/px = 0 (Grep 검증: `#[0-9a-fA-F]`, `rgb(`, `[0-9]+px` 검색) — CRITICAL
   - M-4: `prefers-reduced-motion: reduce` 미디어쿼리 존재
   - M-5: `index.html`에 `tokens.css` link 태그 존재
2. 판정:
   - M-1~M-5 모두 PASS + CRITICAL 0건 → 루프 종료, `spec/design-spec.md` 작성
   - FAIL + iter < 5 → 편차 카테고리별 Revise 담당 1명 선정 후 재호출
   - FAIL + iter == 5 → CONDITIONAL 반환 + 잔존 이슈 목록 포함
3. **Revise 담당 선정 매핑** (1 iter 1 specialist 원칙):
   - 토큰 불일치 / 하드코딩 값 → design-system-agent
   - 색 대비 / 레이아웃 / 반응형 → ui-designer
   - 모션 / `prefers-reduced-motion` 누락 → motion-designer
   - SVG 최적화 / 접근성 속성 → graphic-designer
   - HTML 시맨틱 / ARIA → ux-designer
4. `iterations/log.md`에 판정 결과 append:

```markdown
## iter {N} — {ISO timestamp}
- 감지 이슈: {이슈 목록 또는 "없음"}
- 수정 담당: {specialist 이름 또는 "없음 (PASS)"}
- diff 요약: {변경된 파일 및 주요 수정 내용}
- 판정: PASS | FAIL | CONDITIONAL
```

**산출물:**
- `iterations/log.md` append (판정 근거, 스크린샷 픽셀 또는 Grep 결과 포함)

**주의사항:**
- **1 iter 1 specialist 원칙**: 동일 iteration에 5명 전원 재호출 금지 (컨텍스트 과부하 방지)
- M-1(대비율), M-2(가로 스크롤), M-3(하드코딩)은 CRITICAL — 하나라도 FAIL이면 즉시 Revise 진입
- M-4, M-5 FAIL은 WARNING으로 처리하되 3회 이상 연속 FAIL 시 CRITICAL 승격

---

### 스킬 3: Fallback 처리 (handle_render_failure)

**언제 참조:**
- browse 렌더 호출이 실패했을 때 (non-zero exit, stdout 에러, 스크린샷 파일 미생성)

**협업 대상:**
- 2회 연속 실패 시 루프 조기 종료 후 pipeline-orchestrator에 CONDITIONAL 보고

**작업 절차:**
1. **1차 실패**:
   - `iterations/iter-{N}-render-failed.md`에 실패 사유 기록 (명령어, stdout, stderr, 연속 실패 횟수)
   - [G-SIDECAR] 원인 확인: `curl localhost:3099/api/agents/data` 응답 체크
   - 404 또는 stale 감지 시 `bash plugins/bams-plugin/scripts/build-sidecar.sh` 실행 후 Tauri 재시작 → 재시도
2. **2차 실패 (연속)**:
   - 루프 조기 종료 — 무한 루프 방지를 위해 즉시 종료
   - HTML/CSS 정적 분석으로 체크리스트 대체 진행:
     - M-3: Grep `#[0-9a-fA-F]`, `rgb(`, `[0-9]+px` → 0건 확인
     - M-4: Grep `prefers-reduced-motion` → 존재 확인
     - M-5: `index.html` 내 `<link.*tokens\.css` → 존재 확인
     - M-1(명도 대비), M-2(반응형 스크롤): 자동 검증 불가 → CONDITIONAL 반환 + `recommendations`에 "실제 렌더 재검증 후속 필요" 명시
3. `aggregated_output.quality_status = "CONDITIONAL"` 반환
4. `recommendations`에 "browse 렌더 2회 연속 실패 — 실제 렌더 재검증 후속 필요" 항목 추가

**Render failure 기록 포맷:**
```markdown
## Render Failure — iter {N}
- 실패 시각: {ISO timestamp}
- 실패 사유: {에러 메시지 또는 timeout}
- 연속 실패 횟수: {N}
- 대체 분석 방법: 정적 HTML/CSS 분석
- 체크리스트 결과: [M-1: N/A, M-2: N/A, M-3: PASS/FAIL, M-4: PASS/FAIL, M-5: PASS/FAIL]
```

**산출물:**
- `iterations/iter-{N}-render-failed.md`
- `aggregated_output` (quality_status=CONDITIONAL)

**주의사항:**
- [G-SIDECAR]: `curl localhost:3099/api/agents/data` 404 → `build-sidecar.sh` 재빌드 (`.crew/gotchas.md §[G-SIDECAR]` 참조)
- Render 실패 2회 즉시 종료 원칙 — design-director no_end 재발 방지 (retro_전체회고_2 D 등급 원인)
- 재빌드 후 재시도는 1회만 허용 — 재시도 2회째부터는 정적 분석 + CONDITIONAL 반환

---

### 스킬 4: 크리에이티브 디렉션 (creative_direction)

**언제 참조:** 디자인 Phase 시작 시, 또는 브랜드/시각 언어 방향 결정이 필요할 때

**협업 대상:**
- product-strategy: PRD와 비전 문서에서 디자인 방향 기준 수신
- ux-research: 사용자 인사이트를 디자인 결정에 통합
- ui-designer, ux-designer, graphic-designer, motion-designer, design-system-agent: 크리에이티브 방향 전달 및 작업 배분

**작업 절차:**
1. product-strategy의 PRD에서 핵심 사용자 목표와 제품 가치를 파악한다
2. `.crew/references/design-trends-2026.md`에서 제품에 적합한 트렌드를 선별한다 (트렌드 자체를 목적으로 삼지 않는다)
3. 무드보드, 디자인 원칙, 스타일 가이드를 정의하여 부서 전체의 크리에이티브 기준점을 수립한다
4. 각 트렌드의 접근성 충족 여부를 반드시 확인한다 (Glassmorphism 등 명도 대비 이슈)
5. 디자인 방향을 ux-designer → ui-designer → graphic-designer 순서로 브리핑한다

**산출물:** `spec/creative-brief.md` (무드보드, 디자인 원칙 3~5개, 스타일 가이드, 트렌드 선택 근거)

**주의사항:**
- 트렌드를 위한 트렌드를 경계한다 — 각 트렌드가 사용자 경험에 실질적으로 기여하는지 검증한다
- 접근성 기준(WCAG 2.2 AA 명도 대비 4.5:1)을 충족하지 않는 디자인 방향은 채택하지 않는다

---

### 스킬 5: 크로스 부서 핸드오프 (cross_department_handoff)

**언제 참조:** Phase C 루프 종료 후 frontend-engineering에게 구현 스펙을 전달할 때

**협업 대상:**
- frontend-engineering: 디자인 스펙 전달 및 구현 충실도 추적
- design-system-agent: 토큰 및 컴포넌트 스펙 동기화 확인

**작업 절차:**
1. `aggregated_output` YAML을 구성하여 pipeline-orchestrator에 보고:
   ```yaml
   aggregated_output:
     preview_entry: .crew/artifacts/design/{pipeline_slug}/preview/index.html
     tokens_css: .crew/artifacts/design/{pipeline_slug}/tokens/tokens.css
     tokens_ts: .crew/artifacts/design/{pipeline_slug}/tokens/tokens.ts
     design_spec: .crew/artifacts/design/{pipeline_slug}/spec/design-spec.md  # 하위 호환 필드 — 반드시 보존
     iterations_log: .crew/artifacts/design/{pipeline_slug}/iterations/log.md
     screenshots:
       - .crew/artifacts/design/{pipeline_slug}/iterations/iter-{N}-mobile.png
       - .crew/artifacts/design/{pipeline_slug}/iterations/iter-{N}-desktop.png
     input_artifacts_for_fe:
       - tokens/tokens.css
       - tokens/tokens.ts
       - preview/screens/*.html
   quality_status: PASS | FAIL | CONDITIONAL
   quality_detail:
     iterations_used: N
     converged_reason: "..."
     wcag_contrast_failures: 0
   issues: []
   recommendations: []
   ```
2. frontend-engineering에게 핸드오프 패키지(컴포넌트 스펙, 토큰 값, 인터랙션 스펙) 전달
3. 구현 완료 후 충실도 이슈 발생 시 조율

**산출물:** `aggregated_output` YAML, `spec/design-spec.md`

**주의사항:**
- `design_spec` 필드는 하위 호환을 위해 반드시 보존 (R-3 방지 — frontend-engineering 핸드오프 시 참조)
- 핸드오프 후 "알아서 구현하세요"는 안 된다 — 구현 중 질문에 신속하게 응답한다
- 충실도 추적은 개발 완료 직후 진행 — 릴리즈 직전 발견 시 수정 비용 급증
