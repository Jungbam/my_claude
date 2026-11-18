---
description: "5관점 병렬 + 구조적 리뷰 + Codex 세컨드 오피니언 심층 조사 (--aspect 지원: spec/functional/performance/code/uiux/all. 출시 게이트 미포함 — 게이트는 `/bams:review`)"
argument-hint: "[파일/디렉토리/.diff/pr] [--aspect <spec|functional|performance|code|uiux|all>[,...]] [--full]"
---

# Bams: Deep Review

## Steps

> 첫 동작으로 아래 목록을 **원문 그대로** 작업 목록 도구에 등록한다 — `TaskCreate` 항목당 1회(스키마가 없으면 먼저 `ToolSearch` `select:TaskCreate,TaskUpdate`로 로드) 또는 `TodoWrite`(있는 버전). 진행은 `TaskUpdate`/`TodoWrite`로 갱신하고, 건너뛴 step은 지우지 않고 subject/항목 끝에 `— skip: <사유>`를 붙인다 (SSOT: `references/step-status.md` §Steps 체크리스트 규약). 경량 경로의 skip 사유는 `lightweight (<n> lines, <m> files)`.

0. Steps 등록 — 이 목록 전체를 작업 목록 도구(TaskCreate/TodoWrite)에 원문 그대로 등록 (첫 동작, skip 불가)
1. Pre-flight — 리뷰 대상 결정 + 스킬 로딩 + 진행 추적 파일
2. Aspect 파싱 + 경로 판정 — 경량/full (`references/lightweight-path-protocol.md` §8)
3. Step 1-2-3 리뷰 전략 선택 (AskUserQuestion)
4. Step 1 qa-strategy 5관점 병렬 spawn
5. Step 2 구조적 리뷰 (`_REVIEW_SKILL`)
6. Step 3 Codex 세컨드 오피니언 (`_CODEX_SKILL`)
7. Step 1-extra aspect 확장 spawn (code 외 aspect 있을 때만)
8. 경량 단독 리뷰 — 메인이 5관점 지적 + 재현 증거 작성 (full이면 skip)
9. 종합 리포트 + 독립 검증자 spawn (full: 검증 대상 있을 때 / 경량: 묶음 1회 — **생략 불가**)
9-1. Linear 이슈 등록 — issue-ops `linear-file-issues` (`## Linear` 꺼짐·등록 대상 0건이면 skip)
10. Step 4 에이전트 개선점 수집 (orchestrator 조언)
11. `.crew/history.md` 1줄 + 회고 확인
12. verdict 파일 — 게이트 미포함이므로 기본 `— skip: deep-review 게이트 미포함 (판정은 /bams:review·/bams:ship)`

> **사용 시점**: 5관점 + 구조적 리뷰 + Codex 세컨드 오피니언까지 포함한 심층 리뷰. 공통 규약 SSOT: `references/multi-perspective-review.md` (§역할 구분).
>
> 차이점: **출시 게이트 미포함** — 심각도 정렬까지만 하며, `references/issue-severity.md` §Release Gate 임계값 판정은 `/bams:review` Phase 4 또는 `/bams:ship`에서 한다. 그래서 Step 12는 기본 skip이고, verdict 파일을 쓰지 않는다(PASS를 남기면 ship이 릴리스 승인으로 읽는다).

## 경량 경로 (단독 리뷰)

`/bams:review`와 같은 규칙이다 — SSOT `references/lightweight-path-protocol.md` §8 (임계값 **≤ 5파일 AND ≤ 300줄**, `ASPECT_LIST == ["code"]`, `--full` 없음). 경량이면 Step 4를 `— skip: lightweight (<n> lines, <m> files)`로 두고 Step 8에서 메인이 단독 리뷰한다. 구조적 리뷰·Codex(Step 5·6)는 Step 3 선택대로 그대로 실행한다. **Step 9의 독립 검증자 spawn은 경량에서도 생략하지 않는다** — 메인 단독 지적을 검증 없이 확정하지 않는다(§8-4). 임계값 초과면 full 경로 의무.

## Pre-flight

**`references/preflight-protocol.md` 참조.** 표준 프로토콜을 따릅니다.

차이점:
- config.md 없어도 계속 진행 가능.
- 리뷰 대상: 인자(`.diff`/`.patch` 파일이면 그 내용) → `git diff` → `git diff --cached` → `git diff main...HEAD` 순. 모두 없으면 AskUserQuestion.
- 이전 리뷰(24시간 이내, 이후 변경 없음) 있으면 변경분만 리뷰. 미해결 이슈도 추적.
- Gotchas 영역은 리뷰 시 중점 확인 대상으로 전달.

스킬 로딩:

```bash
_BAMS=$( { jq -r '[.plugins["bams-plugin@my-claude"] // empty] | flatten | sort_by(.scope != "user") | .[].installPath // empty' ~/.claude/plugins/installed_plugins.json; sh -c 'ls -dt "$HOME"/.claude/plugins/cache/*/bams-plugin/*/'; } 2>/dev/null | while IFS= read -r _p; do [ -d "$_p" ] && [ ! -e "$_p/.orphaned_at" ] && echo "${_p%/}" && break; done || true); _REVIEW_SKILL="$_BAMS/skills/review/SKILL.md"; [ -e "$_REVIEW_SKILL" ] || _REVIEW_SKILL=""
_CODEX_SKILL="$_BAMS/skills/codex/SKILL.md"; [ -e "$_CODEX_SKILL" ] || _CODEX_SKILL=""
codex --version >/dev/null 2>&1 && _CODEX_OK=1 || _CODEX_OK=0  # mcp__codex__* 도구가 있어도 1
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

(스킬 미설치 시 해당 옵션 비활성. `_CODEX_OK=0`이면 Codex 옵션을 빼고 리포트에 "세컨드 오피니언 생략 — codex 미가용"을 명시한 뒤 진행.) 선택하지 않은 Step 5·6은 `— skip: 사용자 선택`.

### 실행

config.md의 컨벤션 + 관련 gotchas + 이전 미해결 이슈를 리뷰 에이전트에 전달.

- **Step 1 — 5개 qa-strategy 에이전트** (항상 병렬, 경량이면 Step 8 메인 단독 리뷰로 대체): SSOT §qa-strategy 위임 메시지 템플릿(code aspect) — 5관점 정의와 지적 형식·confidence·false positive 기준 포함.
- **Step 2 — 구조적 리뷰** (선택 시 Step 1과 **동시 실행**): `_REVIEW_SKILL` 실행
- **Step 3 — Codex 세컨드 오피니언** (선택 시 Step 1과 **동시 실행**): `_CODEX_SKILL` 실행

**풀 리뷰 선택 시**: Step 1 (5에이전트) + Step 2 + Step 3 = **최대 7개가 동시 실행**됩니다.

### Step 1-extra. aspect 확장 (ASPECT_LIST에 code 외 항목이 있을 때만)

SSOT §aspect별 위임 메시지 템플릿으로 code 외 각 aspect 부서장을 Step 1~3과 **동시 병렬** spawn한다(최대 7개, 상한 8 이내). `uiux`는 항상 `design-director`가 본문에서 codex `gpt-6.1-sol`에 위임한다(Task tool `model` 파라미터에 gpt 모델명 금지).

## 종합 리포트 (Step 9)

모든 리뷰가 반환되면 SSOT §종합/중복 제거 규칙 1~7을 실행한다(3번은 이전 미해결 이슈 `resolved`/`persists`). 4번 필터·독립 검증(SSOT §지적 검증 필터 1·3~5)은 메인이 직접 한다 — 구조적 리뷰·Codex 지적은 confidence가 없으므로 필터 없이 Critical/Major만 검증 대상에 넣는다.

- **full**: 남은 Critical/Major 지적마다 검증자 1개를 한 메시지로 묶어 병렬 spawn(8개 초과 시 8개씩).
- **경량**: 메인 단독 지적 전부(+ 구조적·Codex Critical/Major)를 검증자 **1개**에 묶어 spawn한다. 지적이 0건이어도 spawn해 메인이 "문제 없음"으로 본 변경 중 위험도가 가장 높은 1곳을 직접 확인시킨다. 메인과 다른 `model`을 지정한다(메인 opus → `"sonnet"`, sonnet → `"opus"`).

Task tool, subagent_type: **"bams-plugin:defect-triage"** — full은 지적 1건당 1개, 경량은 묶음 1개, 쓰기 금지:
<!-- load_profile:exempt non-department-lead spawn -->

> SSOT §지적 검증 필터 4의 검증자 프롬프트에 지적·변경 의도·diff를 채워 전달(경량은 지적별로 같은 4줄 반환을 반복). 반영은 §필터 5 — CONFIRMED만 남기고 REFUTED는 "제외된 지적", 재현되지 않은 Critical·보안 Major는 `unverified-risk`, 나머지 UNCERTAIN과 증거 없는 Major는 `unverified`.

### Linear 이슈 등록 (Step 9-1)

검증 반영(§필터 5)과 종합 리포트 저장이 끝난 뒤, CONFIRMED Critical/Major와 `unverified-risk`를 레포의 Linear 프로젝트에 등록한다. `.crew/config.md` `## Linear`가 `enabled: false`이거나 등록 대상이 0건이면 `— skip: <사유>`.

Task tool, subagent_type: **"bams-plugin:issue-ops"** — 메인이 직접 호출:
> load_profile: { level: L2, refs: [{doc: config}] }
> mode: file · input: {종합 리포트 경로} · pipeline: {slug} · commit: {git rev-parse HEAD} — 계약 `references/linear-protocol.md` §5·§11

반환이 `NEEDS_CONTEXT`(매핑 후보·10건 초과 등록)면 AskUserQuestion 1회 후 선택값을 붙여 한 번 더 spawn한다. 실패·pending은 보고만 하고 진행한다.

## Step 4: 에이전트 개선점 수집 — 루프 A (Advisor 단독 호출)

검증을 통과한 지적 중 에이전트가 유발한 패턴을 기록한다. 코드 수정이 없는 분석 작업이므로 pipeline-orchestrator를 조언자 모드로 1회 호출한다.

Task tool, subagent_type: **"bams-plugin:pipeline-orchestrator"** — **조언자 모드**:
<!-- load_profile:exempt non-department-lead spawn -->

> **에이전트 개선점 분석 (Advisor)** — 종합 리포트에서 에이전트가 유발한 major 이상 지적마다 원인 에이전트·lesson-id(`references/agent-improvement-protocol.md` §2 카테고리)·severity를 식별하고, `.crew/memory/{agent}/MEMORY.md`의 같은 lesson-id 항목 유무와 갱신 후 §5 승격 게이트 충족 여부를 반환한다. 파일 쓰기·spawn 지시 금지.

메인은 Advisor Response로 `references/agent-improvement-protocol.md` §1~§5를 수행한다: 사용자 확인 후 MEMORY.md 반영(같은 lesson-id면 seen+1(다른 pipeline-slug일 때만)·`last`·evidence 갱신, 없으면 `references/agent-memory.md` 형식 새 항목 conf low·seen 1, critical은 `.crew/gotchas.md` 후보 제안) → §5 게이트 충족 항목만 AskUserQuestion → Yes면 §5 개선안 작성 후 hr-agent spawn으로 적용. 메인 단독 리뷰(경량)에서는 원인 에이전트가 없으면 `— skip: 에이전트 유발 지적 없음`.

## 마무리

`.crew/history.md`에 1줄: `YYYY-MM-DD | {slug} | deep-review | {완료|실패} | {한 줄 요약}`

회고: `references/completion-protocol.md`에 따라 `/bams:retro {slug}` 실행 여부를 확인한다 (CLAUDE.md §5). 스팸 방지 조건(소요 10분 미만 + 변경 없음/경량 파이프라인) 충족 시 자동 생략.

이 파이프라인의 Learnings 카테고리:
1. `review:` — 여러 리뷰에서 동시 발견된 반복 패턴
2. `convention:` — 리뷰에서 확인된 프로젝트 컨벤션
3. `security:` — 보안 리뷰에서 발견된 주의 영역

## 완료 조건

> Stop hook이 아래를 기계적으로 확인한다(마커 정의: `references/step-status.md` §완료 조건 마커). 하나라도 없으면 종료하지 않는다.

- 작업 목록 도구(TaskCreate/TaskUpdate/TodoWrite)에 `## Steps` 항목(0~12)이 원문 그대로 있다. 실행하지 않은 step은 `skip:`을 포함한다.
- 이번 세션에 생성된 `.crew/artifacts/review/verdict-*.json` 파일 — deep-review는 게이트 미포함이므로 보통 없고, 대신 Step 12가 `skip:`을 포함한 작업 목록 항목(TaskCreate/TaskUpdate/TodoWrite)/최종 메시지 줄로 남아 있다.
- Step 9 검증자(defect-triage) spawn이 경로와 무관하게 1회 이상 있었다(검증 대상 Critical/Major가 0건인 full 경로만 `— skip: 검증 대상 없음`).
- 최종 메시지에 리포트 경로와 skip 목록이 있다.
