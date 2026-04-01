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
_BROWSE_SKILL=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/skills/browse/SKILL.md" 2>/dev/null | head -1)
_QA_SKILL=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/skills/qa-only/SKILL.md" 2>/dev/null | head -1)
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
