---
description: PR 생성 + 머지 — 출시 준비 검토 후 Ship
argument-hint:
---

# Bams: Ship

PR 생성과 머지를 관리하는 Ship 워크플로우입니다.

## Pre-flight

**공통 규칙 로드**: 반드시 `plugins/bams-plugin/commands/bams/_shared_common.md`를 Read합니다.

### Viz 이벤트: pipeline_start

사전 조건 확인 후, Bash로 다음을 실행합니다:

```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1)
[ -n "$_EMIT" ] && bash "$_EMIT" recover "{slug}"
[ -n "$_EMIT" ] && bash "$_EMIT" pipeline_start "{slug}" "ship" "/bams:ship" "{arguments}"
```

bams-plugin ship 스킬 로딩:

```bash
_SHIP_SKILL=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/skills/ship/SKILL.md" 2>/dev/null | head -1)
```

스킬 파일이 없으면 에러 메시지 후 중단.

## Step 1: 출시 준비 검토

Bash로 step_start + agent_start emit:
```bash
[ -n "$_EMIT" ] && bash "$_EMIT" step_start "{slug}" 1 "출시 준비 검토" "Ship"
[ -n "$_EMIT" ] && bash "$_EMIT" agent_start "{slug}" "release-quality-gate-1-$(date -u +%Y%m%d)" "release-quality-gate" "claude-fable-5" "Step 1: pre-ship 체크"
```

`bams-plugin:release-quality-gate` 에이전트로 pre-ship 체크를 수행합니다.

- 테스트 통과 여부
- 코드 리뷰 완료 여부
- 변경사항 범위 확인
- CHANGELOG / 버전 범프 필요 여부

반환 후 agent_end + step_end emit:
```bash
[ -n "$_EMIT" ] && bash "$_EMIT" agent_end "{slug}" "release-quality-gate-1-$(date -u +%Y%m%d)" "release-quality-gate" "{success|error}" {duration_ms} "출시 준비 검토 완료"
[ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" 1 "{done|fail}" {duration_ms}
```

### Quality Gate 판정

release-quality-gate 반환에서 GO/CONDITIONAL GO/NO-GO 판정을 파싱합니다. 판정 문구가 모호하면 NO-GO로 보수적 처리합니다.

- **GO**: Step 2로 진행.
- **NO-GO**: 즉시 중단. 사유를 사용자에게 보고하고 `pipeline_end` status="failed" emit 후 종료.
- **CONDITIONAL GO**: 조건 목록을 사용자에게 제시하고 AskUserQuestion으로 진행 여부를 확인합니다. 진행 시 조건을 PR 본문 "## Quality Gate 조건" 섹션에 이행 주체·기한과 함께 기록합니다.

## Step 2: Ship 실행

Bash로 step_start emit:
```bash
[ -n "$_EMIT" ] && bash "$_EMIT" step_start "{slug}" 2 "Ship 실행" "Ship"
```

`_SHIP_SKILL`의 지시에 따라 Ship을 실행합니다.

- 베이스 브랜치 머지
- 테스트 실행
- PR 생성 (CONDITIONAL GO 조건이 있으면 PR 본문에 반영)
- 리뷰 요청

Bash로 step_end emit:
```bash
[ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" 2 "{done|fail}" {duration_ms}
```

## Step 3: 결과 확인

Bash로 step_start emit:
```bash
[ -n "$_EMIT" ] && bash "$_EMIT" step_start "{slug}" 3 "결과 확인" "Ship"
```

PR URL과 상태를 보고합니다. 실패 시 원인 분석 및 재시도 옵션 제공.

Bash로 step_end emit:
```bash
[ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" 3 "{done|fail}" {duration_ms}
```

### Viz 이벤트: pipeline_end

파이프라인 종료 시, Bash로 다음을 실행합니다:
```bash
[ -n "$_EMIT" ] && bash "$_EMIT" pipeline_end "{slug}" "{status}" {total} {completed} {failed} {skipped}
```
(`{status}`는 `completed` / `paused` / `failed` 중 하나, `{total}`은 3. `{completed}`/`{failed}`는 리터럴 숫자로 직접 기입한다 — 셸 변수는 Bash 호출 간 비영속이므로 대화 컨텍스트에서 추적한 값을 그대로 써넣는다.)
