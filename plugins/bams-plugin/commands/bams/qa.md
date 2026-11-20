---
description: 브라우저 QA — 자동화 테스트 계획 + 브라우저 기반 검증
argument-hint: <url> [--audit ui,a11y,perf|all] [--level quick|standard|full] [--allow-remote] [--quick|--regression <baseline>]
---

# Bams: QA

브라우저 기반 QA 워크플로우를 실행합니다. 테스트 계획 수립 후 브라우저 QA를 진행합니다.

- **탐색 모드**(기본, `/bams:qa <url>`, `--quick`·`--regression <baseline>`): 사용자처럼 클릭해 기능 버그를 찾는다. 엔진 `qa-only`, 보고 전용.
- **감사 모드**(`/bams:qa [<url>] --audit [ui,a11y,perf|all]`): UI·A11Y·PERF를 스크립트 증거로 측정한다. 엔진 `qa-audit`, 관찰 전용.

## Pre-flight

0. 모드 파싱:
   - `--audit` 있으면 감사 모드. 값은 `ui`·`a11y`·`perf`의 쉼표 목록 또는 `all`(생략 시 `all`). `--level quick|standard|full`(기본 `standard`). `--allow-remote`는 사용자가 명시했을 때만 켠다(기본 허용 호스트 `localhost`·`127.0.0.1`·`::1`).
   - `--audit` 없으면 탐색 모드(`--quick`·`--regression <baseline>` 기존 동작).
   - 탐색 플래그(`--quick`·`--regression`)와 `--audit`를 함께 쓰면 조합하지 않는다 — 에러 메시지("탐색과 감사는 한 호출에서 함께 쓸 수 없음") 후 중단. `--level`·`--allow-remote`는 감사 모드 전용이다.
1. URL 확인: 인자로 전달된 URL 사용. 없으면 AskUserQuestion으로 URL 입력받기. 감사 모드는 URL이 없으면 Step 1 범위 선언의 `base`로 정한다(그래도 비면 `missing`에 넣어 한 번에 묻는다).
2. bams-plugin 스킬 로딩:

```bash
_BAMS=$( { jq -r '[.plugins["bams-plugin@my-claude"] // empty] | flatten | sort_by(.scope != "user") | .[].installPath // empty' ~/.claude/plugins/installed_plugins.json; sh -c 'ls -dt "$HOME"/.claude/plugins/cache/*/bams-plugin/*/'; } 2>/dev/null | while IFS= read -r _p; do [ -d "$_p" ] && [ ! -e "$_p/.orphaned_at" ] && echo "${_p%/}" && break; done || true); _BROWSE_SKILL="$_BAMS/skills/browse/SKILL.md"; [ -e "$_BROWSE_SKILL" ] || _BROWSE_SKILL=""
_QA_SKILL="$_BAMS/skills/qa-only/SKILL.md"; [ -e "$_QA_SKILL" ] || _QA_SKILL=""
_AUDIT_SKILL="$_BAMS/skills/qa-audit/SKILL.md"; [ -e "$_AUDIT_SKILL" ] || _AUDIT_SKILL=""
echo "BAMS: ${_BAMS:-<none>}"
```

현재 모드의 엔진 스킬 파일(탐색 `_QA_SKILL`, 감사 `_AUDIT_SKILL`)이 없으면 에러 메시지 후 중단. 엔진 SKILL 본문의 `${CLAUDE_SKILL_DIR}`는 `$_BAMS/skills/<skill>`(예: `$_BAMS/skills/qa-only`, `$_BAMS/skills/qa-audit`)로 읽는다.

3. 대상 레포 제약 확인 (`references/qa-principles.md` §4): 대상 레포의 `CLAUDE.md`, `.crew/config.md`, `.crew/gotchas.md`를 먼저 읽고 금지 작업(자동 커밋·stash, 테스트 프레임워크 추가, build, DB 쓰기, 새 env 등)을 목록으로 만든다. 이 목록을 Step 1 위임 메시지와 Step 2 실행 지시에 첨부한다. 금지 작업과 충돌하는 QA 단계는 건너뛰고 리포트 `미검증·한계`에 기록한다 — 제약을 덮어쓰지 않는다.
4. 프로필 로드: 대상 레포 `.crew/qa-profile.json`(스크립트 값 — `base_url`·`core_routes` 등, 탐색 모드도 읽음)과 `.crew/qa-profile.md`(사람 판정 기준)를 읽어 Step 1·2에 넘긴다. 없으면 기본값으로 진행하고, 감사 모드는 엔진이 초안(`<run>/qa-profile.draft.json`)을 만들어 리포트에 "프로필 없음 — 기본값"을 쓰고 저장 여부를 마지막에 1회 묻는다(`$_BAMS/skills/qa-audit/references/qa-profile.md`).

## Step 1: 테스트 계획 수립 (감사 모드: 범위 선언)

`bams-plugin:automation-qa` 에이전트를 사용하여 대상 URL의 테스트 계획을 수립합니다. 위임 메시지에 Pre-flight 3의 금지 작업 목록을 첨부합니다.

- 프로젝트 컨텍스트 (config.md, 최근 변경사항) 분석
- 주요 사용자 플로우 식별 — 이 핵심 플로우와 diff 영향 라우트가 Step 3의 **핵심 경로**다
- 테스트 케이스 우선순위 지정

**감사 모드**: 테스트 계획 대신 범위 선언을 받는다. 위임 메시지에 `expected_output: scope_declaration`과 축·수준·`--allow-remote` 여부를 넣는다(형식: `references/agent-rules/automation-qa-rules.md` §"QA 감사 스크립트 실행 시").

- 범위 선언 항목: 라우트·핵심 경로·viewport·서버 종류·인증 방식·엔드포인트·ready 셀렉터
- 반환된 `missing`(특히 비어 있는 `core_routes`)은 실행 전 AskUserQuestion **한 번에** 묻는다.

## Step 2: 브라우저 QA 실행

`_QA_SKILL`의 지시에 따라 브라우저 QA를 실행합니다. 실행 지시에 Pre-flight 3의 금지 작업 목록을 첨부합니다.

- URL 접속 및 시각적 검증
- 테스트 계획 기반 인터랙션 테스트
- 발견된 이슈 기록
- 리포트 저장: `.crew/artifacts/qa/<run>/report.md` (`<run>` = `{YYYY-MM-DD}-explore-{domain}[-n]`)

**감사 모드**: `_QA_SKILL` 대신 `_AUDIT_SKILL`을 Read해 그 흐름(doctor → 축별 스크립트 직렬 실행 → 후보 확인 → 판정)을 따른다. Step 1 범위 선언과 Pre-flight 3의 금지 작업 목록을 입력으로 넘긴다.

- 리포트는 메인이 `<run>/report.md`에 쓴다 (`<run>` = `.crew/artifacts/qa/{YYYY-MM-DD}-audit-{axes}[-n]`).
- 스크립트 결과는 후보다 — 코드·화면으로 확인한 것만 결함으로 올린다.

## Step 3: 결과 정리

발견된 이슈를 `references/issue-severity.md` §QA 판정 매핑으로 Critical/Major/Minor·`unverified`·`unverified-risk`로 옮긴 뒤 게이트를 판정합니다.

**`references/issue-severity.md` §Release Gate 임계값 참조.**

차이점: 본 파이프라인 N값 = **2** (탐색 모드 기본값 — SSOT §파이프라인별 Override `qa`).
차이점: 본 파이프라인 N값 = **0** (감사 모드 `--audit` — SSOT §파이프라인별 Override `qa --audit`).

- 리포트 첫 줄은 판정 줄이다: 판정(GO / CONDITIONAL-GO / NO-GO) · 심각도별 건수 · 핵심 경로 미검증 수.
- 핵심 경로에 미검증(`unverified`)이 있으면 GO로 판정하지 않는다(§QA 판정 매핑 규칙 (a)).
- health score는 참고 지표이며 게이트가 아니다.

## Step 4: Linear 이슈 등록

QA 리포트(`.crew/artifacts/qa/<run>/report.md`)의 확인된 critical·high 이슈를 ezar-linear 규칙에 맞춘 초안으로 만들고, 사용자가 고른 것만 레포의 Linear 프로젝트에 등록한다. 감사 모드는 **확인된 P0·P1만** 대상이고, 스크립트 후보·`unverified`·`unverified-risk`는 등록하지 않는다. `.crew/config.md`가 없거나 `## Linear`가 `enabled: false`이거나 대상이 0건이면 건너뛰고 사유를 보고한다.

Task tool, subagent_type: **"bams-plugin:issue-ops"** — 메인이 직접 호출:
> load_profile: { level: L2, refs: [{doc: config}] }
> mode: file · input: {QA 리포트 경로} · pipeline: qa_{도메인} · commit: {git rev-parse HEAD} — 계약 `references/linear-protocol.md` §5·§8

반환이 `NEEDS_CONTEXT`면 AskUserQuestion 1회 후 선택값을 붙여 한 번 더 spawn한다. 매핑 후보면 `mode: setup`으로, 초안 확인이면 초안 표를 보여 주고(전부 등록 / 고른 번호만 / 등록 안 함) `--confirmed <번호|all>`을 붙인다. 물을 수 없는 실행(eval·headless)이면 등록하지 않고 초안 경로만 보고한다(`ezar-linear:issues` §1 초안 먼저). 실패는 보고만 하고 진행한다.
