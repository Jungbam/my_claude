---
description: PR 생성 + 머지 — 출시 준비 검토 후 Ship
argument-hint:
---

# Bams: Ship

PR 생성과 머지를 관리하는 Ship 워크플로우입니다.

## Pre-flight

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

## Step 2: Ship 실행

`_SHIP_SKILL`의 지시에 따라 Ship을 실행합니다.

- 베이스 브랜치 머지
- 테스트 실행
- PR 생성
- 리뷰 요청

## Step 3: 결과 확인

PR URL과 상태를 보고합니다. 실패 시 원인 분석 및 재시도 옵션 제공.
