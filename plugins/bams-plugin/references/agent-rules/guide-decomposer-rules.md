# guide-decomposer 상세 규칙 (agent-rules)

> 본문: `plugins/bams-plugin/agents/guide-decomposer.md` — 역할·전문 영역·codex stub·SR-1(보안 격리)는 본문에만 존재 (SSOT)
> 이관 근거: plan_모델재분배프롬프트세분화 FR-S1(verbatim — NFR-3) + plan_spawn로드다이어트 FR-9(행동 규칙 26건 ID화, agent-improvement-protocol L101 의무)

경로 폴백(본문 stub이 참조하는 `$_AR` — 서브에이전트 cwd 리셋/타 저장소 위임 대비):

```bash
_AR=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/references/agent-rules/guide-decomposer-rules.md" 2>/dev/null | head -1)  # [L2]
[ -z "$_AR" ] && _AR=$(find . -path "*/bams-plugin/references/agent-rules/guide-decomposer-rules.md" 2>/dev/null | head -1)  # [L2]
```

## 메모리

메모리 규칙은 `references/agent-memory.md`를 따른다: `.crew/memory/{agent-slug}/MEMORY.md` 단일 파일, 세션 시작 시 존재하면 Read, 기록은 회고 파이프라인 수행.

## 참조 문서 (온디맨드 L2)

복잡 판단·신규 패턴 필요 시에만 아래 find 폴백으로 best-practice를 Read한다(무조건 아님): [L2]
```bash
_BP=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/references/best-practices/guide-decomposer.md" 2>/dev/null | head -1)  # [L2]
[ -z "$_BP" ] && _BP=$(find . -path "*/bams-plugin/references/best-practices/guide-decomposer.md" 2>/dev/null | head -1)  # [L2]
[ -n "$_BP" ] && cat "$_BP"  # [L2]
```

발견 시 §1~§4 (호출 컨텍스트 / 실수 3건 / 권장 패턴 / 체크리스트 5건) 확인 후 작업 진행.

## 행동 규칙 상세 (FR-9 이관 — guide-decomposer.md §행동 규칙 stub 정본)

### 신규 필드 의무 추출 (v1.1 스키마)

DOM 파싱 시 다음을 의무 추출한다 (OQ4=b — 신규 6 필드는 components.json에 optional이지만 F1은 추출 시도):
- `html_tag`: 노드의 `tagName.toLowerCase()`
- `inline_styles`: 노드 `style` 속성 파싱 (`property: value;` → `{property: value}`)
- `css_classes`: `classList` 배열 그대로
- `layout_type`: computed style의 `display` 또는 `position` 값 매핑 (`flex`/`grid`/`flow`/`absolute`)
- `parent_component`: 트리 traverse 시 부모 노드의 매핑된 컴포넌트 `name`
- `section_id`: `<section id="...">` 또는 `id` 속성

추출 실패 시 `null` 또는 기본값 기록. 절대 필드 자체를 omit 하지 않는다 (F2가 in-key 검사로 의존성 판단).

### inline_styles 정규화 (필수)
- HTML 원본 `style="background-color: red; font-size: 14px"` → JSX 호환 `{backgroundColor: "red", fontSize: "14px"}`
- 모든 kebab-case CSS 속성을 camelCase로 변환 (`background-color` → `backgroundColor`)
- vendor prefix `-webkit-transform` → `WebkitTransform` (대문자 시작 유지)
- 변환 책임: **F1 (본 에이전트)** — F2/F3/F4가 받을 때 이미 camelCase 보장
- 변환 실패 시 원본 kebab-case 그대로 + `inline_styles_raw` 필드에 백업 (디버깅)

### CHUNK_STRATEGY 환경 변수 처리 (P2 청킹 활성화)

작업 시작 시 다음을 확인하여 청킹 모드 결정:

```bash
# 1. 위임 메시지 input_artifacts.meta.chunk_strategy 확인 (우선)
# 2. 환경 변수 fallback: ${CHUNK_STRATEGY:-none}
_CHUNK_STRATEGY="${CHUNK_STRATEGY:-none}"

if [ "$_CHUNK_STRATEGY" = "section" ]; then
  echo "[INFO] 섹션 단위 청킹 활성화 (P2 — 대형 가이드)"
  # <section> / <h1> / <h2> 경계로 가이드를 N chunks로 분할
  # 각 chunk를 chunks/chunk-{N}.json 으로 저장 후 최종 components.json으로 병합
  CHUNK_BOUNDARIES="section,h1,h2"
elif [ "$_CHUNK_STRATEGY" = "none" ]; then
  # 기본: 전체 파일 단일 로드 (소형 가이드)
  CHUNK_BOUNDARIES=""
fi
```

**청킹 우선순위** (CHUNK_BOUNDARIES="section,h1,h2"일 때):
1. `<section>` (semantic HTML5 — 가장 명확한 컴포넌트 경계)
2. `<h1>` (최상위 헤딩 — 페이지 구역)
3. `<h2>` (2단계 섹션 — 폴백)

청킹 시 각 chunk별로:
- `guide-decomposition/chunks/chunk-{N}.json` 생성
- 최종 `components.json`은 모든 chunk를 순서대로 병합
- 동일 컴포넌트명이 여러 chunk에 있으면 첫 정의 우선 + `conflict-report.md`에 기록

**환경 변수 전달 보장**: harness가 sub-agent spawn 시 부모 쉘 export 변수 전달이 보장되지 않으므로, **위임 메시지 input_artifacts.meta.chunk_strategy를 우선 확인**. 환경 변수는 fallback.

### 청킹 시
- Preflight에서 `wc -l` 또는 Bash로 입력 줄 수 확인.
- **10,000줄 초과 → 디렉터리별 분할, design-director에게 청킹 단위 사전 승인 요청.**
- 각 chunk 산출물에 `chunk_index`, `total_chunks`, `source_path` 메타 필드 포함.

### AST 분석 시
- Bash로 `npx tsx --eval` 또는 `bun run` 기반 AST 분석 스크립트 호출.
- 분석 결과를 Raw JSON으로 먼저 저장(`guide-decomposition/raw/`), 구조화 산출물과 분리.
- 파서 실패 시 fallback: Grep 패턴 기반 라인 분석으로 대체 (손실 허용 + conflict-report.md에 명시).

### 완료 후
- 4종 산출물 생성 확인 (components.json, tokens.css, typography.json, palette.json).
- 각 파일의 항목 수를 result_summary에 포함 (예: `"components: 12, tokens: 34, colors: 8 (via gpt-6.1-sol)"`).
- design-director에게 완료 보고 후 F2 위임 준비.
