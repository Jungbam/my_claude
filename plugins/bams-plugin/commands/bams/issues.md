---
description: Linear 이슈 등록 — 레포 매핑, 리뷰·QA 지적을 ezar-linear 규칙으로 초안 확인 후 등록 (setup|file|status)
argument-hint: <setup|file|status> [리포트 경로 …] [--all] [--dry-run]
---

# Bams: Issues

리뷰·QA에서 확인된 지적을 이 레포의 Linear 프로젝트에 이슈로 올린다. 실제 작업은 이슈관리 부서장 `issue-ops`가 한다. 규약 SSOT: `references/linear-protocol.md`. 전사 작성 규칙은 `ezar-linear` 플러그인(`ezar-linear:issues` 스킬 + 훅)이 정한다.

입력: $ARGUMENTS

> 자동 연동: `/bams:review`·`/bams:deep-review`·`/bams:qa`가 끝날 때 같은 흐름으로 지적을 올린다. 이 커맨드는 그 밖의 수동 조작용이다.
>
> 이슈 상태 옮기기·닫기는 bams가 하지 않는다. 작업할 때 `ezar-linear:issues` 규칙대로 한다(실제로 손을 대면 In Progress, 기본 브랜치 merge 같은 근거를 본 뒤 Done). 수정 커밋·PR 본문에는 `Fixes <ID>`를 남긴다.

## 사용법

| 서브커맨드 | 하는 일 | issue-ops mode |
|------------|---------|----------------|
| `setup` | 이 레포의 Linear 팀·프로젝트 매핑 확인·변경·끄기 | setup |
| `file [리포트…] [--all] [--dry-run]` | 리포트의 확인된 지적을 초안으로 보여 주고, 고른 것만 등록(생략 시 최신 리뷰 리포트) | file |
| `status` (기본) | 이 레포 출처(`bams:<repo>/`)로 올라간 열린 이슈 조회(쓰기 없음) | status |

`close`·`--sweep`은 없어졌다. 닫기는 `ezar-linear:issues`로 한다.

## Pre-flight

1. `commands/bams/_shared_common.md`를 Read한다(§진행 vs 확인의 Linear 행).
2. `.crew/config.md`가 없으면 "`/bams:init` 먼저"를 안내하고 중단한다.
3. 첫 단어로 서브커맨드를 정하고(없거나 모르는 값이면 `status`, `close`면 위 안내 후 중단), 나머지를 input·flags로 넘긴다.

## 실행

메인이 issue-ops를 직접 spawn한다(2단 위임 — issue-ops는 specialist를 spawn하지 않는다).

Task tool, subagent_type: **"bams-plugin:issue-ops"** — 메인이 직접 호출:
> load_profile: { level: L2, refs: [{doc: config}] }
> mode: {위 표의 mode} · input: {리포트 경로 | 없음} · flags: {flags} · pipeline: issues_{서브커맨드} · commit: {git rev-parse HEAD}
> 계약: `references/linear-protocol.md`. 반환은 §8 형식.

**`NEEDS_CONTEXT` 처리** (최대 1회 왕복):
- 매핑 후보: 반환된 `needs` 질문과 선택지를 그대로 AskUserQuestion으로 묻고, 선택값을 `mode: setup` + `input: <선택>`으로 다시 spawn한다. 사용자가 "연동 끄기"를 고르면 `--disable`.
- 초안 확인: 초안 표와 초안 파일 경로를 보여 주고 AskUserQuestion(전부 등록 / 고른 번호만 / 등록 안 함). 등록이면 `--confirmed <번호 목록|all>`을 붙여 다시 spawn한다. 사용자가 이 요청 안에서 이미 "확인 없이 등록"이라고 했으면 처음부터 `--confirmed all`을 붙인다.

`BLOCKED`(ezar-linear 미설치)면 `/plugin install ezar-linear@ezar-plugins` 후 `/mcp`에서 linear 로그인하라고 안내하고 끝낸다.

## 결과 보고

issue-ops 반환을 미검증 주장으로 본다. 만든 이슈가 있으면 하나를 골라 Linear 도구 `get_issue`로 실제로 있는지 확인한 뒤 보고한다.

```
Linear 이슈 — {서브커맨드}
══════════════════════════════════════
대상: {TEAM} / {PROJECT}
결과: created N · commented N · skipped N · failed N
- {identifier} {결과} [{심각도}/{종류}] {제목}
초안: .crew/artifacts/linear/draft-{pipeline}.md
```

failed가 있으면 사유(MCP 없음·인증 만료·훅 거부)와 해결 후 `/bams:issues file <리포트>`를 다시 실행하라는 안내를 붙인다. 출처 ID로 중복이 걸러져 빠진 것만 올라간다.
