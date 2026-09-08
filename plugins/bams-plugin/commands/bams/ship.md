---
description: PR 생성 + 머지 — 출시 준비 검토 후 Ship
argument-hint:
---

# Bams: Ship

PR 생성과 머지를 관리하는 Ship 워크플로우입니다.

## Pre-flight

**공통 규칙 로드**: 반드시 `plugins/bams-plugin/commands/bams/_shared_common.md`를 Read합니다.

bams-plugin ship 스킬 로딩:

```bash
_SHIP_SKILL=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/skills/ship/SKILL.md" 2>/dev/null | head -1)
```

스킬 파일이 없으면 에러 메시지 후 중단.

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

- **GO**: Step 2로 진행.
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

## 마무리

완료 시 `.crew/history.md`에 1줄 기록합니다:
`YYYY-MM-DD | {slug} | ship | {완료|실패} | {한 줄 요약}`
