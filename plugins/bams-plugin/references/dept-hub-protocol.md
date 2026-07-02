# 부서 허브 표준 프로토콜 (SSOT)

`commands/bams/engineering.md`, `planning.md`, `evaluation.md`, `qc.md` 4개 부서 허브가 공통으로 참조한다 (Pattern A — 전체 참조).

각 허브 stub은 "소속 에이전트" 표와 Step 1 질문 헤더만 자체 보유하고, 아래 5단계 실행 흐름과 viz 계측은 본 문서를 그대로 따른다.

## 실행 흐름 (5단계 — 4개 허브 공통)

### Step 1: 에이전트 선택

AskUserQuestion — stub이 정의한 질문 헤더("어떤 {부서명} 에이전트를 사용하시겠습니까?")로 질문한다.
- 선택지는 stub의 "소속 에이전트" 표에서 구성한다 (부서당 4개 고정).
- 사용자가 이미 인자로 에이전트/스킬을 명시했다면(예: `/bams:engineering frontend 번들최적화`) 이 Step은 스킵하고 해당 값을 사용한다.

### Step 2: 스킬 선택

선택된 에이전트의 스킬 목록을 표시한다 (stub 표의 "스킬 트리거 예시" 열 참조, 또는 해당 에이전트 `agents/*.md`의 스킬 섹션을 Read하여 상세 목록 확보).

AskUserQuestion — "어떤 스킬을 실행하시겠습니까?" (선택한 에이전트의 스킬 목록 표시)

### Step 3: 컨텍스트 수집

선택된 스킬에 필요한 컨텍스트를 수집한다:
- `.crew/config.md` 확인 (프로젝트 메타정보)
- 코드베이스/산출물 구조 분석 (부서 성격에 맞는 범위 — 코드/분석데이터/테스트 등)
- 기존 산출물 (`.crew/artifacts/`) 스캔
- 필요 시 AskUserQuestion으로 추가 정보 수집

### Step 4: 에이전트 실행

메인이 선택된 에이전트를 Agent tool로 직접 spawn한다 (커맨드 → 부서장/도메인 에이전트 2단 위임 원칙 — CLAUDE.md §1 준수).

```
subagent_type: bams-plugin:[selected-agent]
skill_mode: [selected-skill]
```

### Step 5: 결과 정리

에이전트 실행 결과를 정리하고, 코드 변경 또는 분석/QA 산출물을 stub이 정의한 경로(대개 `.crew/artifacts/`)에 저장한다. 사용자에게 요약을 보고한다.

## Viz 이벤트 계측 (신규 — F-R4 AC-4)

허브 진입 직후 `pipeline_start`(타입 `dept-hub`)를 emit하고, Step 1~5 전체를 감싸는 단일 `step_start`(step_number=1, step_name="부서 에이전트 선택 및 실행")를 emit한다. Step 5 완료 직후 `step_end` + `pipeline_end`를 emit한다.

부서 허브는 경량 라우터이므로 파이프라인 slug를 자체 생성한다 — Work Unit 연결이나 `board.md` 등록은 하지 않는다.

slug 형식: `{dept}_hub_{YYYYMMDDHHMMSS}` (`{dept}`는 `engineering`/`planning`/`evaluation`/`qc`)

```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1)
_SLUG="{dept}_hub_$(date -u +%Y%m%d%H%M%S)"
[ -n "$_EMIT" ] && bash "$_EMIT" pipeline_start "$_SLUG" "dept-hub" "/bams:{dept}" "{arguments}"
[ -n "$_EMIT" ] && bash "$_EMIT" step_start "$_SLUG" 1 "부서 에이전트 선택 및 실행" "Hub"
# ... Step 1~5 실행 ...
[ -n "$_EMIT" ] && bash "$_EMIT" step_end "$_SLUG" 1 "done" {duration_ms}
[ -n "$_EMIT" ] && bash "$_EMIT" pipeline_end "$_SLUG" "completed" 1 1 0 0 {duration_ms}
```

`_EMIT` 스크립트를 찾지 못하면(0개 매칭) viz 계측을 조용히 스킵하고 Step 1~5는 정상 진행한다.

Step 4에서 선택된 도메인 에이전트가 자체 파이프라인(`dev`/`hotfix` 등)을 트리거하면, 그 파이프라인은 **별도 slug로 독립 실행**한다 — 허브 slug와 병합하지 않는다. 허브는 순수 라우터이며 하위 파이프라인의 실행/게이트/회고에 관여하지 않는다.
