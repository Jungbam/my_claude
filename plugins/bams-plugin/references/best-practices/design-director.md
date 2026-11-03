# design-director Best Practices

> 루프 절차·MUST 체크리스트·Revise 배정·렌더 실패 처리의 SSOT는 `references/design-loop-protocol.md`, 보고 형식은 `agents/design-director.md` §결과 보고. 이 파일은 실행 팁만 둔다.

| 블록 | 트리거 | 라인범위 |
|------|--------|----------|
| 스킬 1: 루프 오케스트레이션 (orchestrate_design_loop) | 디자인 반복 루프를 실행할 때 | L13-29 |
| 스킬 2: 수렴 판정 (evaluate_convergence) | Render 직후 수렴 여부를 판정할 때 | L31-33 |
| 스킬 3: Fallback 처리 (handle_render_failure) | 렌더 실패 시 | L35-37 |
| 스킬 4: 크리에이티브 디렉션 (creative_direction) | 디자인 Phase 시작·방향 결정 시 | L39-45 |
| 스킬 5: 크로스 부서 핸드오프 (cross_department_handoff) | 루프 종료 후 FE에 스펙 전달 시 | L47-53 |

### 스킬 1: 루프 오케스트레이션 (orchestrate_design_loop)

**언제**: `/bams:plan`·`/bams:dev`·`/bams:feature`가 design-director를 spawn했거나 `expected_output.type == "executable_design_mockup"`일 때.

**절차**: design-loop-protocol §Preflight → Phase A → B → C. Render는 browse로 두 뷰포트를 찍는다.

```bash
_BROWSE_BIN=$(find ~/.claude/plugins/cache -name "browse-cli" -path "*/browse/*" 2>/dev/null | head -1)
PREVIEW_PATH="$(pwd)/.crew/artifacts/design/{pipeline_slug}/preview/index.html"
SHOT_DIR="$(pwd)/.crew/artifacts/design/{pipeline_slug}/iterations"
$_BROWSE_BIN screenshot --url "file://$PREVIEW_PATH" --viewport 360x800  --out "$SHOT_DIR/iter-{N}-mobile.png"
$_BROWSE_BIN screenshot --url "file://$PREVIEW_PATH" --viewport 1280x800 --out "$SHOT_DIR/iter-{N}-desktop.png"
```

**산출물**: `preview/index.html`, `tokens/tokens.{css,ts,json}`, `spec/design-spec.md`, `iterations/log.md`, `iterations/iter-{N}-{mobile,desktop}.png`.

**주의**: 스크린샷은 Read로 직접 확인한 뒤 판정한다. 렌더 성공(exit 0)만으로 M-1·M-2를 PASS 처리하지 않는다.

### 스킬 2: 수렴 판정 (evaluate_convergence)

design-loop-protocol §수렴 판정 체크리스트(M-1~M-5)로 판정하고 §Revise 담당 배정에서 1명을 고른다. log에는 판정 근거(대비 수치, Grep hit 수)를 함께 남긴다 — 수치 없는 "PASS"는 근거가 아니다.

### 스킬 3: Fallback 처리 (handle_render_failure)

design-loop-protocol §browse 렌더 실패 Fallback을 따른다. 재시도는 1회만 — 2회째 실패면 루프를 종료하고 정적 분석 + `DONE_WITH_CONCERNS`로 끝낸다(무한 대기 방지).

### 스킬 4: 크리에이티브 디렉션 (creative_direction)

**협업**: product-strategy(PRD의 핵심 사용자 목표·제품 가치), ux-research(사용자 인사이트), 내부 디자이너 5명(방향 브리핑 순서: ux → ui → graphic).

**산출물**: `spec/creative-brief.md` — 템플릿·지침은 `agent-rules/design-director-rules.md` §"크리에이티브 브리프"·§"디렉션·검토 지침".

**주의**: WCAG 2.2 AA 명도 대비 4.5:1을 못 맞추는 방향은 채택하지 않는다.

### 스킬 5: 크로스 부서 핸드오프 (cross_department_handoff)

**협업**: frontend-engineering(스펙 전달·충실도 추적), design-system-agent(토큰·컴포넌트 스펙 동기화).

**절차**: §결과 보고 계약으로 보고하고 `design_spec`(FE 핸드오프 입력)을 반드시 채운다. FE에는 tokens/tokens.css·tokens.ts·preview/screens/*.html과 컴포넌트·인터랙션 스펙을 넘긴다.

**주의**: 핸드오프 후에도 구현 중 질문에 즉시 응답하고, 충실도 추적은 개발 완료 직후에 한다.
