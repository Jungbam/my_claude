---
description: 5관점 병렬 + 구조적 리뷰 + Codex 세컨드 오피니언 심층 조사 (--aspect 지원: spec/functional/performance/code/uiux/all. 출시 게이트 미포함 — 게이트는 `/bams:review`)
argument-hint: [파일/디렉토리/pr] [--aspect <spec|functional|performance|code|uiux|all>[,...]]
---

> **사용 시점**: 5관점 + 구조적 리뷰 + Codex 세컨드 오피니언까지 포함한 심층 리뷰. 공통 규약 SSOT: `references/multi-perspective-review.md` (§역할 구분).
>
> 차이점: **출시 게이트 미포함** — 심각도 정렬까지만 하며, `references/issue-severity.md` §Release Gate 임계값 판정은 `/bams:review` Phase 4 또는 `/bams:ship`에서 한다.

# Bams: Deep Review

## Pre-flight

**`references/preflight-protocol.md` 참조.** 표준 프로토콜을 따릅니다.

차이점:
- config.md 없어도 계속 진행 가능.
- 리뷰 대상: 인자 → `git diff` → `git diff --cached` → `git diff main...HEAD` 순. 모두 없으면 AskUserQuestion.
- 이전 리뷰(24시간 이내, 이후 변경 없음) 있으면 변경분만 리뷰. 미해결 이슈도 추적.
- Gotchas 영역은 리뷰 시 중점 확인 대상으로 전달.

스킬 로딩:

```bash
_REVIEW_SKILL=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/skills/review/SKILL.md" 2>/dev/null | head -1)
_CODEX_SKILL=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/skills/codex/SKILL.md" 2>/dev/null | head -1)
```

진행 추적 파일: `templates/deep-review-report.md` 기반으로 생성.

## Aspect 파싱

`references/multi-perspective-review.md` §--aspect 인자 파싱 규칙을 Read하여 따른다 (Pattern A). `ASPECT_LIST == ["code"]`(인자 없음)이면 기본 흐름대로, 아니면 Step 1-2-3에서 `ASPECT_LIST`를 참조한다.

> **위임 체계**: `_shared_common.md` §위임 원칙 + 부록 **루프 B**. 리뷰·검증 spawn은 모두 메인이 직접 병렬로 하며, Step 4만 orchestrator를 조언자로 1회 호출한다(서브에이전트는 spawn 불가).

## Step 1-2-3: 리뷰 실행 전략 선택

**AskUserQuestion** — "리뷰 범위를 선택하세요:"
- **풀 리뷰 (Recommended)** — 5관점 병렬 + 구조적 리뷰 + Codex 전부 **동시 실행**
- **5관점만** — 5관점 병렬 리뷰만 실행
- **5관점 + 구조적** — 5관점 + 구조적 리뷰 (Codex 제외)

(스킬 미설치 시 해당 옵션 비활성. Codex CLI 미설치 시 해당 옵션 비활성.)

### 실행

config.md의 컨벤션 + 관련 gotchas + 이전 미해결 이슈를 리뷰 에이전트에 전달.

**선택에 따라 모든 리뷰를 최대한 병렬로 실행합니다:**

**Step 1 — 5개 qa-strategy 에이전트** (항상 병렬):
SSOT §qa-strategy 위임 메시지 템플릿(code aspect) — 5관점 정의와 지적 형식·confidence·false positive 기준 포함.

**Step 2 — 구조적 리뷰** (선택 시 Step 1과 **동시 실행**):
`_REVIEW_SKILL` 실행

**Step 3 — Codex 세컨드 오피니언** (선택 시 Step 1과 **동시 실행**):
`_CODEX_SKILL` 실행

**풀 리뷰 선택 시**: Step 1 (5에이전트) + Step 2 + Step 3 = **최대 7개가 동시 실행**됩니다.

### Step 1-extra. aspect 확장 (ASPECT_LIST에 code 외 항목이 있을 때만)

SSOT §aspect별 위임 메시지 템플릿으로 code 외 각 aspect 부서장을 Step 1~3과 **동시 병렬** spawn한다(최대 7개, 상한 8 이내). `uiux`는 항상 `design-director`가 본문에서 codex `gpt-6.1-sol`에 위임한다(Task tool `model` 파라미터에 gpt 모델명 금지).

## 종합 리포트

모든 리뷰가 반환되면 SSOT §종합/중복 제거 규칙 1~7을 실행한다(3번은 이전 미해결 이슈 `resolved`/`persists`). 4번 필터·독립 검증은 메인이 직접 한다 — 구조적 리뷰·Codex 지적은 confidence가 없으므로 필터 없이 Critical/Major만 검증 대상에 넣는다. 남은 Critical/Major 지적마다 검증자 1개를 한 메시지로 묶어 병렬 spawn(8개 초과 시 8개씩):

Task tool, subagent_type: **"bams-plugin:defect-triage"** — 지적 1건당 1개, 쓰기 금지:
<!-- load_profile:exempt non-department-lead spawn -->

> SSOT §지적 검증 필터 4의 검증자 프롬프트에 지적·변경 의도·diff를 채워 전달. CONFIRMED만 남기고 나머지는 "제외된 지적"으로.

## Step 4: 에이전트 개선점 수집 — 루프 A (Advisor 단독 호출)

검증을 통과한 지적 중 에이전트가 유발한 패턴을 기록한다. 코드 수정이 없는 분석 작업이므로 pipeline-orchestrator를 조언자 모드로 1회 호출한다.

Task tool, subagent_type: **"bams-plugin:pipeline-orchestrator"** — **조언자 모드**:
<!-- load_profile:exempt non-department-lead spawn -->

> **코드 품질 관점 에이전트 개선점 분석 모드 (Advisor)** — 리뷰에서 반복적으로 발견된 패턴을 에이전트 개선 기회로 기록합니다.
>
> **수행할 작업:**
> 1. 종합 리포트에서 에이전트가 유발했을 가능성이 있는 이슈를 식별:
>    - 코드 품질 패턴 → `code-quality:` 접두사
>    - 아키텍처 설계 문제 → `architecture:` 접두사
>    - 성능 이슈 → `performance:` 접두사
>    - 보안 패턴 → `security:` 접두사
>    - 테스트 커버리지 갭 → `test-coverage:` 접두사
> 2. 각 이슈에 대해 원인이 된 에이전트를 식별
> 3. 일회성 실수인지 구조적 개선이 필요한지 판별:
>    - `.crew/memory/{agent}/improvements/` 디렉토리에서 동일 pattern_tag 기존 레코드 검색
>    - 기존 레코드가 있으면 type: structural, 없으면 type: one-off
> 4. `.crew/memory/{agent}/improvements/{date}-{slug}.md` 파일 생성:
>    ```yaml
>    ---
>    date: {YYYY-MM-DD}
>    pipeline_slug: {slug}
>    parent_pipeline_slug: {parent_slug or null}
>    agent: {agent_type}
>    pattern_tag: {code-quality:|architecture:|performance:|security:|test-coverage:}{구체적 태그}
>    type: one-off | structural
>    severity: minor | major | critical
>    ---
>    
>    ## 리뷰에서 발견된 패턴
>    {반복 발견된 코드 패턴 또는 아키텍처 이슈}
>    
>    ## 개선 제안
>    {에이전트 또는 스킬에 대한 구체적 개선 제안}
>    
>    ## 관련 파이프라인
>    - 원본: {parent_pipeline_slug}
>    - 리뷰: {slug}
>    ```
> 5. structural 유형이고 동일 pattern_tag가 2회 이상이면:
>    - AskUserQuestion: "이 패턴이 반복되고 있습니다. 에이전트 개선을 진행할까요?"
>    - Yes → `references/agent-improvement-protocol.md`의 Evolution Hook 실행
>    - No → 기록만 남기고 종료

## 마무리

완료 시 `.crew/history.md`에 1줄 기록합니다:
`YYYY-MM-DD | {slug} | deep-review | {완료|실패} | {한 줄 요약}`

## 회고 연결

완료 후 `references/completion-protocol.md`에 따라 `/bams:retro {slug}` 실행 여부를 확인한다 (CLAUDE.md §5 회고 의무). 스팸 방지 조건(소요 10분 미만 + 변경 없음/경량 파이프라인) 충족 시 자동 생략.

이 파이프라인의 Learnings 카테고리:
1. `review:` — 여러 리뷰에서 동시 발견된 반복 패턴
2. `convention:` — 리뷰에서 확인된 프로젝트 컨벤션
3. `security:` — 보안 리뷰에서 발견된 주의 영역
