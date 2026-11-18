---
description: "5관점 병렬 리뷰 + 릴리스 게이트 판정 (--aspect 지원: spec/functional/performance/code/uiux/all). 구조적 리뷰·Codex 포함 심층 조사는 `/bams:deep-review`"
argument-hint: '[파일, 디렉토리, .diff 파일, 또는 "pr"] [--aspect <spec|functional|performance|code|uiux|all>[,...]] [--full]'
---

# Bams Review

리뷰 대상: $ARGUMENTS

## Steps

> 시작 즉시 아래 목록을 **원문 그대로** TodoWrite에 복사한다. 건너뛰는 step은 지우지 않고 `— skip: <사유>`로 남긴다 (`references/step-status.md` §Steps 체크리스트 규약). 경량 경로의 skip 사유는 `lightweight (<n> lines, <m> files)`.

1. 코드 최신화 + Aspect 파싱 + 리뷰 범위 결정
2. 경로 판정 — 변경 규모 측정 → 경량/full (`references/lightweight-path-protocol.md` §8)
3. Phase 1 파일 수집 + diff 캡처
4. Phase 2-a orchestrator 조언 spawn
5. Phase 2-b qa-strategy 5관점 리뷰 spawn
6. Phase 2-c aspect 확장 spawn (code 외 aspect 있을 때만)
7. 경량 단독 리뷰 — 메인이 5관점 지적 + 재현 증거 작성 (full이면 skip)
8. Phase 3 종합 + defect-triage 검증자 spawn
9. Phase 4 릴리스 게이트 판정자 spawn — **생략 불가** (경량: release-quality-gate 1회)
10. Phase 5 리포트 저장 `.crew/artifacts/review/review-<ts>.md`
10-1. Phase 5-1 Linear 이슈 등록 — issue-ops `linear-file-issues` (`## Linear` 꺼짐·등록 대상 0건이면 skip)
11. Phase 6~7 결과 제시 + 이슈 수정 제안
12. Phase 8 `.crew/history.md` 1줄 + 회고 확인
13. verdict 파일 확인 — `.crew/artifacts/review/verdict-*.json` 생성(`verdict.sh check`), 못 남기면 `— skip: <사유>`

> **사용 시점**: 코드 변경 후 5관점 리뷰 + 릴리스 품질 게이트가 필요할 때. deep-review보다 경량. 공통 규약 SSOT: `references/multi-perspective-review.md` (deep-review와의 차이: §역할 구분).

## 경량 경로 (단독 리뷰)

`references/lightweight-path-protocol.md` §8이 SSOT다(임계값·측정 스니펫·생략 범위). 요약:
- 변경 **≤ 5파일 AND ≤ 300줄**(추가+삭제), `ASPECT_LIST == ["code"]`, 정리/제거 모드 아님, `--full` 없음 → 경량. 질문 없이 적용한다.
- 경량이면 Step 4·5·8을 `— skip: lightweight (<n> lines, <m> files)`로 표기하고 Step 7에서 메인이 단독 리뷰한다. **Step 9 판정자 spawn과 Step 13 verdict는 생략하지 않는다.**
- 임계값 초과면 full 경로 의무 — 규모가 커도 "diff가 작아 보여서" 단독 리뷰로 바꾸지 않는다.

## 코드 최신화 · Aspect 파싱 · 범위

- 코드 최신화: `references/preflight-protocol.md` §배치 0.
- Aspect: SSOT §--aspect 인자 파싱 규칙 (Pattern A). `ASPECT_LIST == ["code"]`(인자 없음)이면 기본 흐름, 아니면 Phase 2/4에서 `ASPECT_LIST`를 참조한다.
- 사전 조건: `.crew/config.md`, `CLAUDE.md`가 있으면 읽는다.

**리뷰 범위:**
- 인자 없음 → `git diff` → `git diff --cached` 순. 둘 다 비면 사용자에게 무엇을 리뷰할지 묻고 중단.
- 파일/디렉토리 → Glob으로 존재 확인 후 리뷰. `.diff`/`.patch` 파일이면 그 내용을 리뷰 diff로 쓴다.
- `pr` 또는 PR 번호 → `git diff main...HEAD`.
- **정리/제거 모드** (대상이 diff가 아닌 제거 후보 인벤토리): 5관점을 '제거 안전성 판정'으로 매핑한다 — 정확성 = 참조 잔존/런타임 파손, 보안 = 무변경 게이트 파일(엔트리포인트·컨벤션 파일·시크릿 경로) 침범, 성능 = 자산/번들 효과, 품질 = 제거 후 작업성, 테스트 = 제거 대상 게이트/스모크 커버리지. qa-strategy의 `### ★ 정리/제거 모드 분기`(역참조 grep·문자열 리터럴 우선 검증·KEEP 리스트)를 함께 적용한다. 이 모드는 경량 경로 대상이 아니다.

## Phase 1: 파일 수집

리뷰 범위의 파일을 식별해 읽는다(15개 초과 시 변경 파일 > 핵심 로직 순, 생성/벤더 파일 스킵). git 변경이면 diff 출력을 캡처한다.

> **위임 체계**: `_shared_common.md` §위임 원칙 + 부록 **루프 B**. 모든 spawn은 메인이 직접 하며 orchestrator는 조언자로만 호출한다(서브에이전트는 spawn 불가).

## Phase 2: 5관점 병렬 리뷰 — 루프 B (full 경로)

### Phase 2-a. pipeline-orchestrator 조언 요청 (Advisor)

Task tool, subagent_type: **"bams-plugin:pipeline-orchestrator"** — **조언자 모드**:
<!-- load_profile:exempt non-department-lead spawn -->

> **Review Phase 2 Advisor 호출 — 5관점 리뷰 라우팅 권고**
>
> ```
> phase: 2
> slug: {review_timestamp}
> pipeline_type: review
> config: .crew/config.md
> review_files: [Phase 1 파일 목록]
> diff: [git diff 내용 (해당 시)]
> ```
>
> **요청:** 메인이 spawn할 QA부장(qa-strategy) 위임 메시지 템플릿, 5관점(정확성/보안/성능/품질/테스트) specialist 라우팅 권고, 게이트 조건을 Advisor Response로 반환하세요. 직접 spawn 금지(harness 깊이 2 제약).

반환 후 Advisor Response 파싱 + CHAIN_VIOLATION 체크.

### Phase 2-b. 메인이 qa-strategy 직접 spawn (5관점 병렬 리뷰)

`ASPECT_LIST`에 `code`가 있을 때만 실행(기본값 `["code"]`이면 항상). 없으면 Phase 2-c로.

Task tool, subagent_type: **"bams-plugin:qa-strategy"** — 메인이 직접 호출:
<!-- load_profile:exempt inherits _shared_common §위임 원칙 -->

> **Review Phase 2 — 5관점 병렬 코드 리뷰**
>
> ```
> task_description: "5관점 병렬 코드 리뷰를 실행하라"
> input_artifacts:
>   - [파일 경로 목록 + 내용 또는 diff]
>   - CLAUDE.md
>   - .crew/config.md
> expected_output:
>   type: multi_perspective_review
> quality_criteria:
>   5관점 정의는 `references/multi-perspective-review.md` §code aspect — 5관점 정의 참조.
>   지적 형식·confidence(80 미만 미보고)·false positive 제외는 SSOT §지적 검증 필터 1~2.
> ```
>
> QA부장은 도메인 내 관점별 specialist(automation-qa, defect-triage 등)를 **최대 1회** 추가 spawn 가능(harness 깊이 2 한도).

**기대 산출물**: 관점별 지적 목록 (지적마다 file:line·근거·confidence)

### Phase 2-c. aspect 확장 라우팅 (ASPECT_LIST에 code 외 항목이 있을 때만)

code 외 각 aspect를 SSOT §aspect별 위임 메시지 템플릿으로 해당 부서장에게 **병렬** 직접 spawn: spec=product-strategy, functional=qa-strategy, performance=product-analytics, uiux=design-director. `uiux`는 항상 `design-director`가 본문에서 codex `gpt-6.1-sol`에 위임한다(Task tool `model` 파라미터에 gpt 모델명 금지). 결과는 Phase 3에서 code 결과와 함께 종합.

## Phase 3: 리뷰 종합 + 지적 검증 (full 경로)

모든 리뷰 spawn이 반환되면 메인이 SSOT §종합/중복 제거 규칙 1~7을 실행한다. 4번(필터·독립 검증)은 SSOT §지적 검증 필터 3~5 그대로다 — 필터 후 남은 Critical/Major(증거 없는 Critical·보안 Major 포함)마다 검증자 1개를 한 메시지로 묶어 병렬 spawn(8개 초과 시 8개씩):

Task tool, subagent_type: **"bams-plugin:defect-triage"** — 지적 1건당 1개, 쓰기 금지:
<!-- load_profile:exempt non-department-lead spawn -->

> SSOT §지적 검증 필터 4의 검증자 프롬프트에 지적·변경 의도·diff를 채워 전달.

반영(§필터 5): CONFIRMED만 Critical/Major, REFUTED는 "제외된 지적", UNCERTAIN은 Critical·보안 Major면 `unverified-risk`(게이트 최소 **CONDITIONAL**, 건수 미포함), 그 외 `unverified`(게이트 미반영). `unverified-risk` 원문은 Phase 4 위임 메시지에 넘긴다.

## Phase 4: 릴리스 품질 게이트 — 생략 불가

**판정 모델 분리** (두 경로 공통): 판정 spawn에 구현 에이전트와 다른 `model`을 지정한다(구현자 opus → `model: "sonnet"`, 구현자 sonnet → `"opus"`). Codex가 연결돼 있으면 Codex 판정이 우선이다(`references/verdict-protocol.md` §3). 판정 기준: `references/issue-severity.md` §Release Gate 임계값, 본 파이프라인 N값 = **2** (SSOT §파이프라인별 Override 확인, 다중 aspect면 §aspect별 Override + worst-case).

### Phase 4 (full) — 루프 A, qa-strategy 직접 spawn

Task tool, subagent_type: **"bams-plugin:qa-strategy"** — 메인이 직접 호출:
<!-- load_profile:exempt inherits _shared_common §위임 원칙 -->

> **Review Phase 4 — 릴리스 품질 게이트**
>
> ```
> task_description: "코드 리뷰 결과를 종합 판정하라"
> input_artifacts:
>   - review_result: [Phase 3 종합 — CONFIRMED 심각도별 건수, 상세 목록, unverified-risk 원문(있으면 최소 CONDITIONAL)]
>   - changed_files: [파일 목록]
>   - .crew/config.md
> expected_output:
>   type: release_gate_verdict
> quality_criteria:
>   판정 기준: `references/issue-severity.md` §Release Gate 임계값, N = 2.
>   판정 절차: `agents/release-quality-gate.md` §증거 기반 판정 — 리뷰어·부서장 보고는 미검증 주장, diff·테스트 출력으로 확인.
>   verdict 기록: PASS/FAIL이면 `references/verdict-protocol.md` §3대로 `hooks/lib/verdict.sh write` 실행 — author_agents: [구현 에이전트, 메인 직접 수정이면 main], pipeline: {slug}. 판정자는 구현자가 아니어야 한다.
> ```
>
> QA부장은 release-quality-gate specialist를 **최대 1회** 추가 spawn 가능(harness 깊이 2 한도). spawn할 수 없으면 판정 절차를 직접 적용하고 verdict도 `--judge-agent qa-strategy`로 기록한다.

**기대 산출물** (두 경로 공통): 판정 결과, 기준별 증거, 필수/권장 수정 사항, verdict 파일 경로

### Phase 4 (경량) — release-quality-gate 판정자 1회 spawn

메인 단독 리뷰(Step 7)는 판정자가 아니다. 독립 검증과 게이트 판정을 이 1회 spawn이 겸한다(`references/lightweight-path-protocol.md` §8-4).

Task tool, subagent_type: **"bams-plugin:release-quality-gate"** — 메인이 직접 호출, 구현자·메인과 다른 `model`:
<!-- load_profile:exempt non-department-lead spawn -->

> **Review 경량 경로 — 독립 검증 + 릴리스 게이트 판정**
>
> ```
> task_description: "메인 단독 리뷰의 지적을 독립 검증하고 릴리스 게이트를 판정·기록하라"
> input_artifacts:
>   - diff 또는 리뷰 대상 경로, 변경 의도
>   - findings: [Step 7 지적 전부 — 심각도 | file:line | 문제 | 증거 | 증거 등급 | confidence]
>   - review_size: "<n> lines, <m> files"
> quality_criteria:
>   1. Critical/Major 지적마다 `references/multi-perspective-review.md` §지적 검증 필터 4 기준으로 증거를 직접 재실행·재현 → CONFIRMED|REFUTED|UNCERTAIN, §필터 5로 반영.
>   2. 메인이 "문제 없음"으로 본 변경 중 위험도가 가장 높은 1곳을 직접 확인(테스트·재현 명령).
>   3. `references/issue-severity.md` §Release Gate 임계값(N = 2)으로 PASS/CONDITIONAL/FAIL 판정.
>   4. PASS/FAIL이면 `references/verdict-protocol.md` §3대로 `hooks/lib/verdict.sh write` — --judge-agent release-quality-gate, --judge-model <실제 모델>, --author-agents <구현 에이전트 | main | unknown>, --evidence 는 직접 실행한 명령만, --pipeline {slug}.
> expected_output: 지적별 검증 결과, 게이트 판정, verdict 파일 경로(또는 미기록 사유)
> ```

### verdict 확인 (Phase 4 종료 조건 = Step 13)

판정자 반환 후 메인이 아래 블록을 **한 번의 Bash 호출**로 실행한다(리졸버와 check 를 같은 호출에 둔다 — Bash 호출 사이에는 `_VD` 같은 셸 변수가 남지 않는다).

```bash
_BAMS=$( { jq -r '[.plugins["bams-plugin@my-claude"] // empty] | flatten | sort_by(.scope != "user") | .[].installPath // empty' ~/.claude/plugins/installed_plugins.json; sh -c 'ls -dt "$HOME"/.claude/plugins/cache/*/bams-plugin/*/'; } 2>/dev/null | while IFS= read -r _p; do [ -d "$_p" ] && [ ! -e "$_p/.orphaned_at" ] && echo "${_p%/}" && break; done || true); _VD="$_BAMS/hooks/lib/verdict.sh"; [ -e "$_VD" ] || _VD=""; [ -z "$_VD" ] && _VD=$(find . -path "*/bams-plugin/hooks/lib/verdict.sh" 2>/dev/null | head -1)
if [ -z "$_VD" ]; then echo "verdict_exit=unavailable (verdict.sh 못 찾음 — 'verdict 없음'(1)과 다르다)"; else bash "$_VD" check; echo "verdict_exit=$?"; fi
```

exit 의미는 `references/verdict-protocol.md` §4. review 처리: `0`/`3` = 기록 완료 · `1` = 판정자가 파일을 남기지 않음 → 같은 판정자에게 기록만 재요청(1회) · `4` = 무효(판정자=구현자 → 다른 에이전트로 재판정 / `invalid_evidence` → 판정자가 검증 명령을 직접 실행해 재기록) · `unavailable` = 리포트에 "verdict 확인 불가(도구 없음)", 게이트 최대 CONDITIONAL. 미커밋 변경 리뷰는 `dirty: true`로 기록되고 커밋 후 patch-id로 매칭된다.

파일을 끝내 남기지 못하면 Step 13을 `— skip: <사유>`로 남긴다. 허용 사유: `gate CONDITIONAL (verdict.sh는 PASS|FAIL만 기록)` · `git 저장소 아님` · `verdict.sh unavailable` · `판정자 재기록 실패(exit <n>)`. 사유 없이 넘어가지 않는다.

## Phase 5: 리포트 저장

`.crew/artifacts/review/review-[timestamp].md`(예: `2026-03-31-143052`)에 SSOT §리포트 템플릿(제외된 지적 포함)으로 저장한다. 경량 경로면 상단에 `경로: lightweight (<n> lines, <m> files) — 판정자 <agent/model>`을 적는다.

## Phase 5-1: Linear 이슈 등록 (Step 10-1)

리포트 저장 직후, CONFIRMED Critical/Major와 `unverified-risk`를 레포의 Linear 프로젝트에 등록한다. 게이트 판정·verdict에는 영향이 없다. `.crew/config.md` `## Linear`가 `enabled: false`이거나 등록 대상이 0건이면 `— skip: <사유>`.

Task tool, subagent_type: **"bams-plugin:issue-ops"** — 메인이 직접 호출:
> load_profile: { level: L2, refs: [{doc: config}] }
> mode: file · input: {Phase 5 리포트 경로} · pipeline: {slug} · commit: {git rev-parse HEAD} — 계약 `references/linear-protocol.md` §5·§11

반환이 `NEEDS_CONTEXT`(매핑 후보·10건 초과 등록)면 AskUserQuestion 1회 후 선택값을 붙여 한 번 더 spawn한다. 실패·pending은 보고만 하고 진행한다. 반환된 식별자 목록은 Phase 6 결과와 Phase 7 수정 위임 메시지에 붙인다.

## Phase 6: 결과 제시

```
코드 리뷰 완료
══════════════════════════════════════
리뷰 범위: [파일/디렉토리/PR]   경로: [full | lightweight (<n> lines, <m> files)]
리포트: .crew/artifacts/review/review-[timestamp].md

이슈 요약:
  Critical: [N]건
  Major:    [N]건
  Minor:    [N]건
  미검증:   [N]건 (그중 unverified-risk [N]건 — 게이트 최소 CONDITIONAL)
  제외:     [N]건 (confidence 미달/false positive/검증 반박)

릴리스 게이트: [PASS/CONDITIONAL/FAIL]
Linear:   created [N] · updated [N] · pending [N] (또는 skip: <사유>)
verdict: .crew/artifacts/review/verdict-<shortsha>.json (판정자 [agent/model], same_family [true/false/unknown])
         또는 verdict — skip: <사유>
```

그 다음 모든 Critical 및 Major 이슈를 상세와 함께 나열한다.

## Phase 7: 이슈 수정 제안

Critical/Major 이슈가 있으면 **AskUserQuestion** (multiSelect: true)으로 수정할 이슈를 선택받는다. 선택된 이슈는 CLAUDE.md §2 라우팅 표에 따라 담당 부서장에게 배치 위임한다(메인은 소스를 직접 수정하지 않는다). 리포트에 `[수정됨]` 태그를 달고, git 저장소면 `git diff --stat` 표시 후 적용/되돌리기를 확인한다.

## Phase 8: 파이프라인 종료

`.crew/history.md`에 1줄: `YYYY-MM-DD | {slug} | review | {완료|실패} | {한 줄 요약}`

회고: `references/completion-protocol.md`에 따라 `/bams:retro {slug}` 실행 여부를 확인한다 (CLAUDE.md §5). 스팸 방지 조건(소요 10분 미만 + 변경 없음/경량 파이프라인) 충족 시 자동 생략.

## 완료 조건

> Stop hook이 아래를 기계적으로 확인한다(마커 정의: `references/step-status.md` §완료 조건 마커). 하나라도 없으면 종료하지 않는다.

- TodoWrite에 `## Steps` 13개 항목이 원문 그대로 있다. 실행하지 않은 step은 `skip:`을 포함한다.
- 이번 세션에 생성된 `.crew/artifacts/review/verdict-*.json` 파일 1개 이상 — 또는 Step 13이 `skip:`을 포함한 TodoWrite 항목/최종 메시지 줄로 남아 있다.
- 경량 경로였다면 Step 9의 release-quality-gate spawn이 실제로 1회 있었다(판정자 spawn은 skip 불가).
- 최종 메시지에 릴리스 게이트 판정과 verdict 경로(또는 `skip:` 사유)가 있다.
