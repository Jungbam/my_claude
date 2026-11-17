---
description: CI/CD 프리플라이트 — 빌드, 린트, 타입체크, 테스트 실행 및 결과 검증
argument-hint: "[test command override]"
---

# Verify

코드 변경사항의 CI/CD 프리플라이트 검증을 수행합니다.

입력: $ARGUMENTS

## 사전 조건

`.crew/config.md`가 있으면 읽어서 프로젝트 설정(테스트 명령어, 빌드 명령어 등)을 파악합니다.
`CLAUDE.md`가 있으면 읽어서 빌드/테스트 가이드라인을 파악합니다.

> **위임 체계 (Canonical)**: 이 커맨드는 `_shared_common.md` §위임 원칙 + 부록 **루프 A**(Simple, 단일 도메인)를 따른다. 메인(커맨드)이 automation-qa와 release-quality-gate 에이전트를 **직접** Task tool로 spawn한다. orchestrator를 경유한 중첩 spawn 금지(harness 깊이 2 제약).

## Phase 0: 프로젝트 검증 스킬 (있으면 먼저)

규칙 SSOT: `references/verification-skill-protocol.md` §7-8.

```bash
ls .claude/skills/verify-*/SKILL.md 2>/dev/null
grep -hE '^(status|proven_at|proven_commit|blocked_by):' .claude/skills/verify-*/SKILL.md 2>/dev/null
git diff --name-only HEAD 2>/dev/null; git diff --name-only --cached 2>/dev/null
_BAMS=$( { jq -r '[.plugins["bams-plugin@my-claude"] // empty] | flatten | sort_by(.scope != "user") | .[].installPath // empty' ~/.claude/plugins/installed_plugins.json; sh -c 'ls -dt "$HOME"/.claude/plugins/cache/*/bams-plugin/*/'; } 2>/dev/null | while IFS= read -r _p; do [ -d "$_p" ] && [ ! -e "$_p/.orphaned_at" ] && echo "${_p%/}" && break; done || true); _CVS="$_BAMS/scripts/check-verify-skill.sh"; [ -e "$_CVS" ] || _CVS=""
for d in .claude/skills/verify-*/; do [ -d "$d" ] || continue; if [ -n "$_CVS" ]; then bash "$_CVS" "$d"; echo "check-exit=$?"; else echo "check: check-verify-skill.sh 없음 → draft 취급"; fi; done
```

**스킬 신뢰 판정 (기계 검사 — protocol §5-1)**: Status 블록의 `status: proven`은 자기 기록이다. 위 검사가 **exit 0 + `RESULT: proven`** 일 때만 proven으로 취급한다. exit 1(`FAIL:` 줄), `RESULT: draft`, 스크립트 없음이면 표기와 무관하게 **draft로 취급**하고, 그 사유(마지막 `RESULT:` 줄 + `FAIL:` 줄)를 Phase 0 결과와 위임 메시지에 그대로 넣는다.

- **스킬 없음** → Phase 0 skip(사유: 검증 스킬 없음 — `/bams:init` Step 11.5로 생성 가능), Phase 1로.
- **스킬 있음** → automation-qa를 Phase 0 모드로 spawn한다 (Task tool, subagent_type: **"bams-plugin:automation-qa"**):
<!-- load_profile:exempt non-department-lead spawn -->

> **프로젝트 검증 스킬 실행 모드** — `.claude/skills/verify-<app>/SKILL.md`와 `features/README.md`를 Read하고 그 지시대로 실행한다.
>
> - 변경 파일: [위 git diff 결과] → feature map에서 영향받는 기능을 고른다. 매칭 0건이면 map 첫 기능 1개를 smoke로.
> - 순서: Launch → Doctor → 선택 기능 Drive → Evidence(`.crew/artifacts/test/verify-<app>/<run-id>/`) → Cleanup → 증거 잔존 확인.
> - 기계 검사 결과: [위 check-verify-skill.sh 출력의 RESULT/FAIL 줄]. **draft 취급**(표기가 draft이거나 검사 실패)이면: 성공 시 Status 블록을 proven으로 갱신한 뒤 `check-verify-skill.sh`를 다시 실행해 `RESULT: proven`을 확인(실패하면 proven을 남기지 않음), 실패 시 결과를 `inconclusive (draft)`로 반환(제품 FAIL 아님).
> - **실패 귀속**: 이번 diff가 건드리지 않은 기능에서 실패하면 스킬 drift로 보고 `.claude/skills/verify-<app>/`만 고쳐 재drive한다. 제품 코드는 수정하지 않는다. 앱 동작이 실제로 깨진 것이면 map을 약화하지 말고 결함으로 보고.
> - 공유·운영 인스턴스에는 Doctor(읽기)만. Drive는 이 실행이 띄운 로컬 인스턴스에만.
>
> 반환: 기능별 PASS/FAIL/inconclusive, 증거 경로, 스킬 drift 수정 여부(수정 파일 목록), 결함 후보.

Phase 0 결과와 관계없이 Phase 1(정적 검증)은 항상 실행한다. Phase 0의 FAIL(기계 검사를 통과한 proven 스킬, 이번 diff가 건드린 기능)은 Phase 2 게이트에서 NO-GO 사유가 된다. draft 취급 스킬의 실패는 `inconclusive (draft)` — 게이트 근거가 아니다.

## Phase 1: 자동화 QA 검증

Task tool을 사용하여 서브에이전트를 실행합니다 (subagent_type: **"bams-plugin:automation-qa"**):
<!-- load_profile:exempt non-department-lead spawn -->

---

**CI 프리플라이트 모드**로 현재 프로젝트의 빌드, 린트, 타입체크, 테스트를 실행합니다.

**프로젝트 설정**: [config.md 내용 삽입]
**CLAUDE.md 가이드라인**: [CLAUDE.md 내용 삽입]
**테스트 명령어 오버라이드**: [$ARGUMENTS가 있으면 삽입]

다음 4개 검증을 **병렬로** 실행합니다 (각각 별도의 Bash 호출):
1. 빌드 (build command)
2. 린트 (lint command)
3. 타입체크 (type-check command)
4. 테스트 (test command)

**명령 결정 우선순위**: `$ARGUMENTS` override > `package.json` scripts > 스택 프로파일 기본값(`references/stack-profile.md` 참조).

Next.js/TS 기본값(스택 프로파일 미확정 시):

| 단계 | 명령 |
|------|------|
| typecheck | `bunx tsc --noEmit` |
| lint | `bun run lint` |
| build | `bun run build` |
| test | `bun test` 또는 `bunx vitest run` |

`pyproject.toml`/`requirements.txt`(Python) 또는 `go.mod`(Go) 감지 시 `references/stack-profile.md`의 해당 프로파일 명령을 사용합니다.

4개를 동시에 실행하되, 각 결과를 개별적으로 PASS/FAIL로 보고합니다.
명령어가 없는 항목은 `skipped`로 처리합니다.

---

## Phase 2: 릴리즈 품질 게이트

Phase 1 결과를 기반으로 릴리즈 준비 상태를 판단합니다.

Task tool (subagent_type: **"bams-plugin:release-quality-gate"**):
<!-- load_profile:exempt non-department-lead spawn -->

---

**프리플라이트 게이트 모드**로 CI 결과를 검토합니다.

**검증 스킬 결과**: [Phase 0 결과 삽입 — 없으면 "skip: 검증 스킬 없음"]
**CI 결과**: [Phase 1 결과 삽입]
**변경된 파일**: `git diff --stat` 결과
**미해결 이슈**: `.crew/board.md`의 In Progress 항목

---

## Phase 3: 결과 보고

검증 결과를 요약합니다:

```
Verify 결과
────────────────────
검증 스킬: PASS/FAIL/inconclusive(draft)/skip — [기능 목록, 증거 경로]
빌드:     PASS/FAIL
린트:     PASS/FAIL
타입체크: PASS/FAIL
테스트:   PASS/FAIL ([N] passed, [N] failed)
────────────────────
종합:     GO / NO-GO
```

FAIL 항목이 있으면 상세 에러를 표시합니다.

## 회고 연결

완료 후 `references/completion-protocol.md`에 따라 `/bams:retro {slug}` 실행 여부를 확인한다 (CLAUDE.md §5 회고 의무). 스팸 방지 조건(소요 10분 미만 + 변경 없음/경량 파이프라인) 충족 시 자동 생략.
