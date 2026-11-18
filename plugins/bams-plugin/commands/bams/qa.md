---
description: 브라우저 QA — 자동화 테스트 계획 + 브라우저 기반 검증
argument-hint: <url>
---

# Bams: QA

브라우저 기반 QA 워크플로우를 실행합니다. 테스트 계획 수립 후 브라우저 QA를 진행합니다.

## Pre-flight

1. URL 확인: 인자로 전달된 URL 사용. 없으면 AskUserQuestion으로 URL 입력받기.
2. bams-plugin 스킬 로딩:

```bash
_BAMS=$( { jq -r '[.plugins["bams-plugin@my-claude"] // empty] | flatten | sort_by(.scope != "user") | .[].installPath // empty' ~/.claude/plugins/installed_plugins.json; sh -c 'ls -dt "$HOME"/.claude/plugins/cache/*/bams-plugin/*/'; } 2>/dev/null | while IFS= read -r _p; do [ -d "$_p" ] && [ ! -e "$_p/.orphaned_at" ] && echo "${_p%/}" && break; done || true); _BROWSE_SKILL="$_BAMS/skills/browse/SKILL.md"; [ -e "$_BROWSE_SKILL" ] || _BROWSE_SKILL=""
_QA_SKILL="$_BAMS/skills/qa-only/SKILL.md"; [ -e "$_QA_SKILL" ] || _QA_SKILL=""
```

스킬 파일이 없으면 에러 메시지 후 중단.

## Step 1: 테스트 계획 수립

`bams-plugin:automation-qa` 에이전트를 사용하여 대상 URL의 테스트 계획을 수립합니다.

- 프로젝트 컨텍스트 (config.md, 최근 변경사항) 분석
- 주요 사용자 플로우 식별
- 테스트 케이스 우선순위 지정

## Step 2: 브라우저 QA 실행

`_QA_SKILL`의 지시에 따라 브라우저 QA를 실행합니다.

- URL 접속 및 시각적 검증
- 테스트 계획 기반 인터랙션 테스트
- 발견된 이슈 기록

## Step 3: 결과 정리

발견된 이슈를 심각도별로 정리하고, 수정 필요 항목을 리포트합니다.

**`references/issue-severity.md` §Release Gate 임계값 참조.**

차이점: 본 파이프라인 N값 = **2** (기본값 — SSOT §파이프라인별 Override 확인).

## Step 4: Linear 이슈 등록

QA 리포트(`.gstack/qa-reports/qa-report-*.md`)의 critical·high 이슈를 레포의 Linear 프로젝트에 등록한다. `.crew/config.md`가 없거나 `## Linear`가 `enabled: false`이거나 대상이 0건이면 건너뛰고 사유를 보고한다.

Task tool, subagent_type: **"bams-plugin:issue-ops"** — 메인이 직접 호출:
> load_profile: { level: L2, refs: [{doc: config}] }
> mode: file · input: {QA 리포트 경로} · pipeline: qa_{도메인} · commit: {git rev-parse HEAD} — 계약 `references/linear-protocol.md` §5·§11

반환이 `NEEDS_CONTEXT`(매핑 후보·10건 초과 등록)면 AskUserQuestion 1회 후 선택값을 붙여 한 번 더 spawn한다. 실패·pending은 보고만 하고 진행한다.
