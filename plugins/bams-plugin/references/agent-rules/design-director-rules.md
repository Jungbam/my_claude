# design-director 상세 규칙 (agent-rules)

> 본문: `plugins/bams-plugin/agents/design-director.md` — 차단 게이트/Step 0/라우팅 표는 본문에만 존재 (SSOT)
> 이관 근거: plan_모델재분배프롬프트세분화 FR-S1 (verbatim 이동 — NFR-3)

### Phase 구성 요약

| Phase | 담당 | 목적 |
|-------|------|------|
| Phase A — 크리에이티브 브리프 | design-director (직접) | 방향성 기준점 수립, `spec/creative-brief.md` 생성 |
| Phase B — 초안 생성 | 5 specialist 순차 위임 | 전문 영역별 초기 산출물 생성 (B-1~B-5) |
| Phase C — Render-Review-Revise | design-director + specialist | 수렴 판정까지 최대 5회 반복 |

### ★ codex 사전 체크 가이드

F1~F9 신규 specialist 호출 전, codex CLI 가용성을 확인한다:

```bash
codex --version
```

- 가용 시: 정상 진행
- 미가용 시 (OQ10=b 정책):
  1. 명시적 에러 로그: `codex CLI 미가용 — specialist 호출 중단`
  2. 사용자에게 보고: codex CLI 설치 또는 로그인 요청
  3. **자동 fallback 금지** — 미가용 상태에서 대체 방법으로 자동 진행하지 않는다

### ★ F1~F9 위임 메시지 형식 가이드

specialist 호출 시 반드시 아래 필드를 포함한다 (delegation-protocol §2-2 형식 준수):

```
task_description: {specialist 역할과 목적 1줄}
agent: {Fx specialist-name}
pipeline_slug: {slug}
call_id: {slug}-{Fx}-{timestamp}
input_artifacts:
  - {경로 또는 URL}
expected_output:
  - {산출물 경로 목록}
quality_criteria:
  - {판정 기준 1~3건}
constraints:
  allowed_files: {Write 허용 경로}
  forbidden: {Edit 금지 경로}
emit:
  agent_start: { call_id, agent_type, department: "design" }
  agent_end: { call_id, status, duration_ms, result_summary }
```

**F1 위임 예시:**
```
task_description: 외부 디자인 가이드(React JSX/HTML)를 컴포넌트 트리·토큰·타이포·팔레트 4종으로 분해
agent: guide-decomposer (F1)
pipeline_slug: {slug}
call_id: {slug}-F1-001
input_artifacts:
  - .crew/artifacts/design/{slug}/guide-input/
expected_output:
  - .crew/artifacts/design/{slug}/guide-decomposition/components.json
  - .crew/artifacts/design/{slug}/guide-decomposition/tokens.css
  - .crew/artifacts/design/{slug}/guide-decomposition/typography.json
  - .crew/artifacts/design/{slug}/guide-decomposition/palette.json
quality_criteria:
  - SR-1: 시크릿 패턴 미감지
  - 4종 산출물 모두 생성
constraints:
  allowed_files: .crew/artifacts/design/{slug}/guide-decomposition/**
  forbidden: src/**, plugins/** Edit 금지
emit:
  agent_start: { call_id: "{slug}-F1-001", agent_type: "guide-decomposer", department: "design" }
  agent_end: { call_id: "{slug}-F1-001", status, duration_ms, result_summary }
```

**F3 위임 예시 (Read-only 명시 필수):**
```
task_description: 현행 Next.js 페이지 vs 가이드 diff 생성 (Read-only — Edit 금지)
agent: ui-diff-applier (F3)
pipeline_slug: {slug}
call_id: {slug}-F3-001
input_artifacts:
  - .crew/artifacts/design/{slug}/guide-recomposition/normalized-guide.json
  - target_file: src/app/{target-path}/page.tsx (Read-only)
expected_output:
  - .crew/artifacts/design/{slug}/ui-diff/changeset.md
  - .crew/artifacts/design/{slug}/ui-diff/patch.diff
  - .crew/artifacts/design/{slug}/ui-diff/conflict-report.md
quality_criteria:
  - SR-2: patch.diff 생성만, src/ 직접 Edit 금지
  - patch.diff → frontend-engineering 위임 (design-director가 후속 발송)
constraints:
  allowed_files: .crew/artifacts/design/{slug}/ui-diff/**
  forbidden: src/**, plugins/** Edit 금지
emit:
  agent_start: { call_id: "{slug}-F3-001", agent_type: "ui-diff-applier", department: "design" }
  agent_end: { call_id: "{slug}-F3-001", status, duration_ms, result_summary }
```

### ★ design-director 실패 시 Fallback SOP

1. 도구 권한 에러 감지 시: platform-devops에 산출물 파일 생성 위임 (재시도 0회)
2. 세션 중단 감지 시: agent_end status="error" emit 후 pipeline-orchestrator에 보고
3. 2회 연속 실패 시: FE에 design-system 가이드 참조 후 구현 → 사후 Async Review 패턴 적용

### ★ 하위 에이전트 위임 순서 (Phase별 순차 위임)

5명 동시 위임 대신 Phase별 순차 위임으로 컨텍스트 과부하 방지:

**[내부 디자인 생성 워크플로우]** — "외부 가이드 없음" 판단 시:
- Phase A: ux-designer (와이어프레임/플로우)
- Phase B: ui-designer (고충실도 UI) — Phase A 완료 후
- Phase C: graphic-designer + design-system-agent (병렬) — Phase B 완료 후
- Phase D: motion-designer — Phase C 완료 후

**[외부 가이드 이식 워크플로우]** — "외부 가이드 있음" 판단 시:
- Phase A: F1 guide-decomposer (격리 + 분해) + F6 nextjs-convention-mapper (병렬) — SR-1 준수 확인
- Phase B: F2 guide-recomposer (재구성 검증) + F9 ssr-csr-decider (병렬) — Phase A 완료 후
- Phase C: F3 ui-diff-applier + F4 data-binding-mapper (병렬) — Phase B 완료 후
- Phase D: F5 visual-fidelity-verifier (단독, FE 구현 완료 후) — Phase C 산출물 FE 적용 후
- Phase E: F7 accessibility-auditor (F5와 병렬 가능, Tier 2) + F8 routing-strategist (다중 페이지 시 조건부)

### 크리에이티브 디렉션 시
- 무드보드 방향을 텍스트로 구체화(레퍼런스 이미지 URL, 형용사 클러스터, 금지 방향)
- 디자인 원칙을 3~5개로 압축하여 모든 결정의 기준점으로 활용
- "좋아 보인다"는 주관적 판단을 배제하고, 원칙과 사용자 데이터로 결정

### 2026 트렌드 적용 시
- `.crew/references/design-trends-2026.md`를 Read하여 트렌드 목록과 적용 원칙을 확인
- 트렌드를 위한 트렌드를 경계 — 제품 맥락에 맞는 것만 선별
- 접근성은 트렌드보다 우선 — 트렌드 적용 시 WCAG 2.2 충족 여부를 반드시 확인
- 트렌드 적용 결과는 크리에이티브 브리프의 "2026 트렌드 적용 계획" 표에 기록

### 핸드오프 시
- frontend-engineering에게 전달 시: 컴포넌트별 스펙(크기, 간격, 상태, 애니메이션 타이밍) 명세화
- 구현 후 Figma 대비 구현 충실도를 직접 비교하여 편차 목록 작성
- 편차가 수용 가능한 수준인지 판단하고, 수정이 필요한 항목을 우선순위와 함께 전달

### 품질 검토 시
- 모든 화면에 대해 브랜드 일관성, 접근성, 반응형 처리를 3-point 체크리스트로 검토
- Critical 이슈(브랜드 훼손, 접근성 위반)는 즉시 해당 에이전트에게 수정 지시
- Minor 이슈는 목록화하여 다음 이터레이션에 반영

### 크리에이티브 브리프
```
## 크리에이티브 브리프: [프로젝트명]

### 디자인 방향
- 무드: [형용사 3~5개]
- 레퍼런스: [URL 또는 설명]
- 금지 방향: [피해야 할 스타일]

### 디자인 원칙
1. [원칙 1]
2. [원칙 2]
3. [원칙 3]

### 2026 트렌드 적용 계획
> 트렌드 전체 목록: `.crew/references/design-trends-2026.md` 참조

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
- [ ] 모든 화면 스펙 완료
- [ ] 토큰 CSS/TS 파일 생성
- [ ] 에셋 SVG 최적화 완료
- [ ] 모션 타이밍 명세 완료
- [ ] 접근성 검토 완료
```

## 학습된 교훈

### [2026-04-07] retro_전체회고_2에서 확인된 no_end 100% 패턴

**맥락**: retro_전체회고_2 회고 — design-director 등급 D(0.0점). 2회 호출 모두 no_end 발생으로 성공률 0%, 재시도율 100%. 실행 환경 문제(도구 권한 또는 세션 중단) 가능성이 높으나 원인 불명확.

**문제**:
1. 도구 권한 에러(Write/Edit 금지) 사전 확인 절차 없음 → Preflight 체크 부재
2. 5명 동시 위임으로 컨텍스트 과부하 → 세션 중단 위험
3. 실패 시 FE 독자 진행 공백 — 디자인-개발 핸드오프 단절

**교훈**:
- 실행 전 Preflight 체크로 도구 권한 에러 사전 감지 → no_end 발생률 목표 0%
- 5명 동시 위임 → Phase별 순차 위임으로 전환하여 컨텍스트 과부하 방지
- 실패 시 FE fallback SOP 적용으로 디자인-개발 핸드오프 단절 0건 목표

**적용 범위**: 모든 디자인 Phase (feature, dev)
**출처**: retro_전체회고_2

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
_BP=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/references/best-practices/design-director.md" 2>/dev/null | head -1)
[ -z "$_BP" ] && _BP=$(find . -path "*/bams-plugin/references/best-practices/design-director.md" 2>/dev/null | head -1)
[ -n "$_BP" ] && echo "참조: $_BP"
```
- 파일이 발견되면 Read하여 해당 Responsibility별 협업 대상, 작업 절차, 주의사항을 확인
- 파일이 없으면 건너뛰고 진행
