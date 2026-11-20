---
description: PR 생성 + 머지 — 출시 준비 검토 후 Ship
argument-hint:
---

# Bams: Ship

PR 생성과 머지를 관리하는 Ship 워크플로우입니다.

## Steps

> 첫 동작으로 아래 목록을 **원문 그대로** 작업 목록 도구에 등록한다 — `TaskCreate` 항목당 1회(스키마가 없으면 먼저 `ToolSearch` `select:TaskCreate,TaskUpdate`로 로드) 또는 `TodoWrite`(있는 버전). 진행은 `TaskUpdate`/`TodoWrite`로 갱신하고, 건너뛴 step은 지우지 않고 subject/항목 끝에 `— skip: <사유>`를 붙인다 (SSOT: `references/step-status.md` §Steps 체크리스트 규약).

0. Steps 등록 — 이 목록 전체를 작업 목록 도구(TaskCreate/TodoWrite)에 원문 그대로 등록 (첫 동작, skip 불가)
1. Pre-flight — `_shared_common.md` Read + ship 스킬 로딩
2. Verdict 확인 (1차) — `verdict.sh check` → `verdict_exit` 확인
3. Step 1 출시 준비 검토 — release-quality-gate spawn (verdict exit 1·4면 이번 HEAD 판정·기록 포함)
4. Quality Gate 판정 파싱 — GO / CONDITIONAL GO / NO-GO
5. GO 재확인 — Verdict 확인 블록 재실행 (`verdict_exit=0`일 때만 Step 2)
6. Step 2 Ship 실행 — PR 생성 (NO-GO면 skip)
7. Step 3 결과 확인 — PR URL·상태 보고
8. `.crew/history.md` 1줄 기록
9. verdict 확인 결과 기록 — 최종 메시지에 `verdict_exit=<n>` 줄 + skip 목록

## Pre-flight

**공통 규칙 로드**: 반드시 `plugins/bams-plugin/commands/bams/_shared_common.md`를 Read합니다.

bams-plugin ship 스킬 로딩:

```bash
_BAMS=$( { jq -r '[.plugins["bams-plugin@my-claude"] // empty] | flatten | sort_by(.scope != "user") | .[].installPath // empty' ~/.claude/plugins/installed_plugins.json; sh -c 'ls -dt "$HOME"/.claude/plugins/cache/*/bams-plugin/*/'; } 2>/dev/null | while IFS= read -r _p; do [ -d "$_p" ] && [ ! -e "$_p/.orphaned_at" ] && echo "${_p%/}" && break; done || true); _SHIP_SKILL="$_BAMS/skills/ship/SKILL.md"; [ -e "$_SHIP_SKILL" ] || _SHIP_SKILL=""
```

스킬 파일이 없으면 에러 메시지 후 중단.

### Verdict 확인 (SHA 결합 판정)

```bash
_BAMS=$( { jq -r '[.plugins["bams-plugin@my-claude"] // empty] | flatten | sort_by(.scope != "user") | .[].installPath // empty' ~/.claude/plugins/installed_plugins.json; sh -c 'ls -dt "$HOME"/.claude/plugins/cache/*/bams-plugin/*/'; } 2>/dev/null | while IFS= read -r _p; do [ -d "$_p" ] && [ ! -e "$_p/.orphaned_at" ] && echo "${_p%/}" && break; done || true); _VD="$_BAMS/hooks/lib/verdict.sh"; [ -e "$_VD" ] || _VD=""; [ -z "$_VD" ] && _VD=$(find . -path "*/bams-plugin/hooks/lib/verdict.sh" 2>/dev/null | head -1)
if [ -z "$_VD" ]; then echo "verdict_exit=unavailable (verdict.sh 못 찾음 — 'verdict 없음'(1)과 다르다)"; else bash "$_VD" check; echo "verdict_exit=$?"; fi
```

이 블록은 **한 번의 Bash 호출**로 실행한다(Bash 호출 사이에는 `_VD` 같은 셸 변수가 남지 않으므로, 다시 확인할 때도 블록 전체를 재실행한다). `verdict_exit=unavailable` = 플러그인 설치 경로에서 verdict.sh를 못 찾음(도구 부재) — `1`(verdict 없음)과 구분한다.

규약: `references/verdict-protocol.md` §4. exit 0 = HEAD(sha 또는 patch-id)에 맞는 PASS → Step 1에 근거로 전달. exit 3(FAIL) = 즉시 중단·실패 기록. exit 1(없음)·4(무효: 판정자=구현자 또는 `invalid_evidence`) = Step 1에서 release-quality-gate가 이번 HEAD 기준으로 판정하고 verdict 파일을 남겨야 GO 가능(구현 에이전트와 다른 `model`로 spawn, Codex 연결 시 Codex 판정 우선). `verdict_exit=unavailable`(verdict.sh 못 찾음)이면 "verdict 확인 불가(도구 없음)"를 Step 1 위임 메시지와 PR 본문에 명시하고 GO 대신 최대 CONDITIONAL GO로 처리한다. 머지·base push 직전에는 `hooks/verdict-gate.sh`가 같은 확인을 반복한다(`BAMS_VERDICT_GATE`).

## Step 1: 출시 준비 검토

`bams-plugin:release-quality-gate` 에이전트로 pre-ship 체크를 수행합니다.

- 테스트 통과 여부
- 코드 리뷰 완료 여부
- 변경사항 범위 확인
- CHANGELOG / 버전 범프 필요 여부

### Quality Gate 판정

release-quality-gate 반환에서 GO/CONDITIONAL GO/NO-GO 판정을 파싱합니다. 판정 문구가 모호하면 NO-GO로 보수적 처리합니다.

**`references/issue-severity.md` §Release Gate 임계값 참조.**

차이점: 본 파이프라인 N값 = **2** (기본값 — SSOT §파이프라인별 Override 확인).

- **GO**: 위 "Verdict 확인" 블록을 **리졸버 줄까지 통째로 한 번의 Bash 호출로** 다시 실행해 `verdict_exit=0`일 때만 Step 2로 진행(GO인데 verdict 없음 = 판정 미기록 → release-quality-gate에 기록만 재요청 1회, 그래도 없으면 CONDITIONAL GO로 강등).
- **NO-GO**: 즉시 중단. 사유를 사용자에게 보고하고 `.crew/history.md`에 실패로 기록 후 종료.
- **CONDITIONAL GO**: 조건 목록을 사용자에게 제시하고 AskUserQuestion으로 진행 여부를 확인합니다. 진행 시 조건을 PR 본문 "## Quality Gate 조건" 섹션에 이행 주체·기한과 함께 기록합니다.

## Step 2: Ship 실행

`_SHIP_SKILL`의 지시에 따라 Ship을 실행합니다.

- 베이스 브랜치 머지
- 테스트 실행
- PR 생성 (CONDITIONAL GO 조건이 있으면 PR 본문에 반영)
- 리뷰 요청

## Step 3: 결과 확인

PR URL과 상태를 보고합니다. 실패 시 원인 분석 및 재시도 옵션 제공.

### Linear 식별자 (체크리스트 없음)

이번 변경이 고친 Linear 이슈가 있으면(커밋 메시지·위임 메시지의 `linear_issues`) PR 본문에 `Fixes <ID>`를 한 줄씩 넣는다. 이슈 상태는 옮기지 않는다 — merge 후 Done은 근거를 본 쪽이 `ezar-linear:issues` 규칙대로 옮긴다(`references/linear-protocol.md` §6).

## 마무리

완료 시 `.crew/history.md`에 1줄 기록합니다:
`YYYY-MM-DD | {slug} | ship | {완료|실패} | {한 줄 요약}`

## 완료 조건

> Stop hook이 아래를 기계적으로 확인한다(마커 정의: `references/step-status.md` §완료 조건 마커). 하나라도 없으면 종료하지 않는다.

- 작업 목록 도구(TaskCreate/TaskUpdate/TodoWrite)에 `## Steps` 항목(0~9)이 원문 그대로 있다. 실행하지 않은 step은 `skip:`을 포함한다.
- 이번 세션에 Verdict 확인 블록이 실행됐고, 최종 메시지에 마지막 결과가 `verdict_exit=<0|1|3|4|unavailable>` 형식 1줄로 있다.
- `verdict_exit≠0`인데 PR을 만들었다면 CONDITIONAL GO 조건(사용자 확인·PR 본문 "## Quality Gate 조건")이 기록돼 있다.
