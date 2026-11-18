---
description: Linear 이슈 관리 — 레포 매핑, QA·리뷰 지적 등록, 수정 검증 후 종료 (setup|file|close|status)
argument-hint: <setup|file|close|status> [리포트 경로 | BE-123 …] [--all] [--minor-summary] [--sweep] [--fix <sha>] [--verify "<명령>"]
---

# Bams: Issues

QA·리뷰에서 확인된 문제를 이 레포의 Linear 프로젝트에 이슈로 남기고, 고친 이슈를 증거와 함께 닫는다. 실제 작업은 이슈관리 부서장 `issue-ops`가 한다. 규약 SSOT: `references/linear-protocol.md`.

입력: $ARGUMENTS

> 자동 연동: `/bams:review`·`/bams:deep-review`·`/bams:qa`가 지적을 등록하고, `/bams:hotfix`·`/bams:dev`·`/bams:debug`가 식별자가 붙은 이슈를 착수·종료하며, `/bams:ship`·`/bams:deploy`가 머지 대기 이슈를 정리한다. 이 커맨드는 그 밖의 수동 조작용이다.

## 사용법

| 서브커맨드 | 하는 일 | issue-ops mode |
|------------|---------|----------------|
| `setup` | 이 레포의 Linear 팀·프로젝트 매핑 확인·변경·끄기 | setup |
| `file [리포트…] [--all\|--minor-summary]` | 리포트의 확인된 지적 등록(생략 시 최신 리뷰 리포트) | file |
| `close [BE-123 …] [--fix <sha>] [--verify "<명령>"]` | 증거 확인 후 In Review/Done. 식별자 생략 시 장부 전체 자동 판정 | close · 식별자 없으면 auto |
| `close --sweep` | 머지 대기(awaiting) 항목만 재판정 | sweep |
| `status` (기본) | 열린 이슈·대기 항목·pending 수 조회(쓰기 없음) | status |

## Pre-flight

1. `commands/bams/_shared_common.md`를 Read한다(§진행 vs 확인의 Linear 예외 행).
2. `.crew/config.md`가 없으면 "`/bams:init` 먼저"를 안내하고 중단한다.
3. 첫 단어로 서브커맨드를 정하고(없거나 모르는 값이면 `status`), 나머지를 input·flags로 넘긴다.

## 실행

메인이 issue-ops를 직접 spawn한다(2단 위임 — issue-ops는 specialist를 spawn하지 않는다).

Task tool, subagent_type: **"bams-plugin:issue-ops"** — 메인이 직접 호출:
> load_profile: { level: L2, refs: [{doc: config}] }
> mode: {위 표의 mode} · input: {리포트 경로 | 식별자 | 없음} · flags: {flags} · pipeline: issues_{서브커맨드} · commit: {git rev-parse HEAD}
> 계약: `references/linear-protocol.md`. 반환은 §11 형식.

**`NEEDS_CONTEXT` 처리** (최대 1회 왕복):
- 매핑 후보: 반환된 `needs` 질문과 선택지를 그대로 AskUserQuestion으로 묻고, 선택값을 `mode: setup` + `input: <선택>`으로 다시 spawn한다. 사용자가 "연동 끄기"를 고르면 `--disable`.
- 10건 초과 등록 계획: 계획 표를 보여 주고 AskUserQuestion(전부 등록 / Critical·Major만 / 취소). 진행이면 `--confirmed`(필요 시 `--all` 제거)로 다시 spawn한다.
- 이미 닫힌 이슈 착수: 다시 열어 고칠지 확인한다.

## 결과 보고

issue-ops 반환을 미검증 주장으로 보고 `jq '.issues | length' .crew/linear-issues.json`과 `jq '.ops | length' .crew/linear-pending.json 2>/dev/null`로 장부·대기열을 확인한 뒤 보고한다.

```
Linear 이슈 — {서브커맨드}
══════════════════════════════════════
대상: {TEAM} / {PROJECT}
결과: created N · updated N · reopened N · in_review N · closed N · skipped N · pending N
- {identifier} {결과} [{심각도}] {제목}
장부: .crew/linear-issues.json   대기열: .crew/linear-pending.json (N)
```

pending이 있으면 사유(MCP 없음·인증 만료 등)와 해결 후 `/bams:issues close --sweep` 또는 `/bams:issues file`을 다시 실행하라는 안내를 붙인다.
