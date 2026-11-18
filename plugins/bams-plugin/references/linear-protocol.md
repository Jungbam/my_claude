# Linear 이슈 연동 프로토콜 (SSOT)

QA·리뷰에서 확인된 문제를 레포별 Linear 프로젝트에 이슈로 남기고, 수정이 검증되면 Done으로 닫는 규약이다. 소유: 이슈관리 부서장 `issue-ops`. 실행 엔진: `linear-setup` · `linear-file-issues` · `linear-close-issues` 스킬. 사용자 진입점: `/bams:issues`.

## 목차

1. 원칙 · 2. MCP 도구 해석 · 3. 레포 매핑 · 4. fingerprint와 장부 · 5. 이슈 등록 규칙 · 6. 상태 전이 · 7. 종료 증거 · 8. 파이프라인 연동 지점 · 9. 실패 처리 · 10. 가역성·금지 · 11. 반환 형식

## 1. 원칙

- **파이프라인을 막지 않는다.** Linear 단계의 실패는 파이프라인 상태·게이트 판정을 바꾸지 않는다(§9).
- **Linear가 진실, 장부는 캐시.** `.crew/linear-issues.json`은 중복 판정과 재개용 캐시다. 장부와 Linear가 다르면 Linear 값으로 장부를 고친다.
- **멱등.** 같은 지적을 여러 번 등록해도 Linear 이슈는 하나다(fingerprint, §4). 같은 전이를 두 번 실행해도 결과가 같다.
- **증거 없이 닫지 않는다.** Done 전이는 §7 증거가 모두 있을 때만 한다.
- **사람이 쓴 부분은 건드리지 않는다.** bams가 만든 이슈의 `Agent notes` 구역만 고친다. 사람이 만든 이슈는 사용자가 식별자를 직접 준 경우에만 상태 전이·코멘트를 한다.

## 2. MCP 도구 해석

기본 서버는 Linear MCP `mcp__plugin_engineering_linear__*`다. 세션에 이 접두사가 없으면 이름에 `linear`가 들어 있고 `__list_issues`·`__save_issue`가 모두 있는 다른 서버 접두사를 쓴다. 어느 것도 없으면 `unavailable`로 보고 §9를 따른다.

| 구분 | 도구 |
|------|------|
| 읽기 | `list_teams` · `list_projects` · `list_issues` · `get_issue` · `list_issue_statuses` · `list_issue_labels` · `list_comments` |
| 쓰기(허용) | `save_issue`(생성·상태·우선순위·라벨 추가·링크·Agent notes patch) · `save_comment` |
| 사용 금지 | 라벨·프로젝트·팀·문서 생성/수정, 모든 `delete_*`, `labels`(전체 교체) 인자 — 라벨은 `addLabels`/`removeLabels`만 |

`list_issues`·`list_projects`는 페이지가 있다. `hasNextPage`가 true면 cursor로 이어 읽는다(최대 4페이지, 넘으면 `query`로 좁힌다).

## 3. 레포 매핑 (`.crew/config.md` `## Linear`)

레포마다 대상이 다르고, Linear 프로젝트 이름이 레포 이름과 1:1이 아니므로 매핑은 레포의 `.crew/config.md`에 저장한다.

```markdown
## Linear
- enabled: true
- team: BE
- project: push-server-refactor
- project_id: <uuid 또는 (none)>
- default_labels: Bug
- repo: push-server
- updated: 2026-11-18
```

- `team`(팀 key) 필수. `project`가 `(none)`이면 팀에만 등록한다.
- `enabled: false`면 모든 Linear 단계를 `— skip: Linear 연동 꺼짐`으로 넘긴다(사용자 opt-out). 다시 묻지 않는다.
- 이름에 `archive`가 들어간 팀(예: Jira Archive)과 보관·휴지통·완료·취소된 프로젝트는 대상이 될 수 없다.
- 읽기(BSD sed 호환): `_lin() { sed -n '/^## Linear/,/^## /p' .crew/config.md 2>/dev/null | sed -n "s/^- $1: *//p" | head -1; }` → `_lin team`, `_lin enabled`.

**섹션이 없을 때** (`linear-setup`):
1. 레포 이름 = `git remote get-url origin`의 마지막 경로에서 `.git` 제거(없으면 git 최상위 폴더명). 정규화: 소문자, 영숫자 외 문자는 `-`.
2. 후보 점수: 프로젝트 이름 정규화값이 레포와 같음 100 · 한쪽이 다른 쪽을 포함 70 · `-` 토큰 겹침 비율 ≥ 0.5 이면 50. 팀 key·이름이 레포 토큰과 겹치면 팀 후보 40. 프로젝트가 여러 팀에 걸치면 팀별로 후보를 나눈다.
3. 상위 3개 + "팀만 지정(프로젝트 없음)" + "Linear 연동 끄기"를 사용자에게 **한 번** 묻는다. 서브에이전트는 질문할 수 없으므로 issue-ops는 `status: NEEDS_CONTEXT`와 후보 목록을 반환하고, 메인이 AskUserQuestion 후 선택값으로 다시 spawn한다.
4. 선택을 위 형식으로 `.crew/config.md` 끝에 추가한다(이미 있으면 그 섹션만 교체).

## 4. fingerprint와 장부

지적 하나를 식별하는 12자리 해시다. 줄 번호·공백·대소문자·따옴표 차이로 바뀌지 않는다.

```bash
bams_fp() { # $1=위치(파일 경로 또는 url:/경로) $2=카테고리 $3=제목
  _t=$(printf '%s' "$3" | tr '[:upper:]' '[:lower:]' | sed -E 's/[`"'"'"']//g; s/[0-9]+//g; s/[[:space:]]+/ /g; s/^ //; s/ $//')
  _l=$(printf '%s' "$1" | sed -E 's/:[0-9]+(-[0-9]+)?$//')
  printf 'v1|%s|%s|%s' "$_l" "$(printf '%s' "$2" | tr '[:upper:]' '[:lower:]')" "$_t" | shasum -a 256 | cut -c1-12
}
```

- 위치: 레포 기준 상대 경로(줄 번호 제외). 파일이 없는 브라우저 QA 지적은 `url:<경로>`(도메인 제외).
- 카테고리: 리뷰 5관점(정확성·보안·성능·품질·테스트) 또는 QA 리포트 category.
- Minor 요약 이슈: `bams_fp "summary" "minor" "<pipeline slug>"`.
- 이슈 본문 Agent notes에 `bams-fingerprint: <fp>` 한 줄로 남긴다. 조회는 `list_issues(team, query: <fp>, includeArchived: true)` 후 본문에 그 줄이 정확히 있는지 확인한다.

**장부** `.crew/linear-issues.json` (jq로 임시 파일에 쓴 뒤 `mv`):

```json
{ "version": 1, "team": "BE", "project": "push-server-refactor",
  "issues": { "<fp>": { "identifier": "BE-123", "url": "…", "title": "…", "severity": "Major",
    "state": "Todo", "state_type": "unstarted", "pipeline": "review_결제검증", "source": ".crew/artifacts/review/review-….md",
    "location": "src/pay.ts:42", "repro_cmd": "bun test pay.test.ts", "created_at": "…", "updated_at": "…",
    "awaiting": null, "fix_commit": null, "pr_url": null, "verified": null, "closed_at": null } } }
```

fingerprint가 없는 사람 이슈를 다룰 때는 키를 `id:<identifier>`로 쓴다. `awaiting`: `commit` | `pr` | `merge` | null (§7).

## 5. 이슈 등록 규칙 (`linear-file-issues`)

**대상**

| 지적 | 등록 |
|------|------|
| Critical·Major, 검증 `CONFIRMED` | 개별 이슈 |
| `unverified-risk` | 개별 이슈, 제목 앞 `[미검증] `, 라벨 `needs-triage` |
| Minor | `--all`이면 개별 이슈, `--minor-summary`면 파이프라인당 요약 이슈 1개, 기본은 등록 안 함 |
| `unverified` · REFUTED · 제외된 지적 | 등록 안 함 |

입력은 리포트 경로다: 리뷰 `.crew/artifacts/review/review-*.md`, 심층 리뷰 리포트, 디버그 `.crew/artifacts/review/debug-*.md`, 브라우저 QA `.crew/artifacts/qa/*/report.md`. QA 심각도는 `issue-severity.md` §QA 판정 매핑(critical/P0→Critical, high/P1→Major, medium·low/P2→Minor)으로 읽는다. 확인 전 스크립트 후보와 `unverified`는 등록하지 않는다.

**지적마다**: fp 계산 → 장부 → Linear 조회.
- 열린 이슈(backlog·unstarted·started·triage): 새 파이프라인에서 다시 나왔을 때만 코멘트 1개("재발견: {pipeline} @ {sha}"), 심각도가 올랐으면 우선순위만 올린다. 결과 `updated`, 아니면 `skipped`.
- 완료된 이슈: 회귀다. unstarted 상태로 되돌리고 증거를 코멘트로 남긴다. 결과 `reopened`.
- 취소·중복 이슈: 사람이 내린 결정이므로 건드리지 않는다. 결과 `skipped (canceled)`.
- 없음: 생성. 결과 `created`.

**생성 값**

| 필드 | 값 |
|------|----|
| title | 문제 요약 80자 이내(사람이 읽는 문장, 파일명은 본문으로) |
| team · project | §3 매핑 |
| priority | Critical 1(Urgent) · Major 2(High) · Minor 3(Medium) · Minor 요약 4(Low) |
| labels(`addLabels`) | `Bug` + 분류 라벨 1개 + `default_labels`. 분류 라벨: 재현 증거(검증 등급 `measured` 또는 실행 가능한 재현 명령)가 있으면 `ready-for-agent`, 없으면 `needs-triage` |
| state | `ready-for-agent` → 팀의 unstarted 상태(Todo) · `needs-triage` → backlog 상태(없으면 unstarted) |
| assignee | 지정하지 않는다 |

팀 라벨 목록(`list_issue_labels`)에 없는 라벨은 빼고 보고한다. 라벨을 새로 만들지 않는다.

**본문**: 짧은 문장으로 사람용 3줄 + 접는 Agent notes.

```markdown
**문제**: {무엇이 잘못되는지 1~2문장}
**근거**: {재현 결과 또는 증거 1~3줄}
**영향**: {누가·무엇이 영향을 받는지}

bams {command} · {YYYY-MM-DD}

+++ Agent notes

bams-fingerprint: {fp}
pipeline: {slug}
commit: {sha} (dirty: {true|false})
location: {path:line}
category: {카테고리} · severity: {Critical|Major|Minor} · verdict: {CONFIRMED|unverified-risk} ({measured|inferred})
repro_cmd: `{명령 또는 (none)}`
evidence: {명령 출력 발췌 20줄 이내}
source: {리포트 경로}
suggested_fix: {수정안 1~3줄}

+++
```

**비밀값 가리기**: Linear는 외부 시스템이다. 올리기 전에 증거에서 `(api[_-]?key|token|secret|password|passwd|authorization|cookie)[=: ]+\S+`와 `.env` 값, 이메일·전화번호를 `***`로 바꾼다.

**대량 등록**: 한 번에 생성+재오픈이 10건을 넘으면 실행하지 않고 계획 목록을 `NEEDS_CONTEXT`로 반환한다. 메인이 사용자에게 확인한 뒤 `--confirmed`로 다시 spawn한다.

## 6. 상태 전이

상태 이름은 팀마다 다르므로 `list_issue_statuses(team)`의 **type**으로 고른다.
- In Progress = type `started` 중 이름에 `review`가 없는 첫 상태 · In Review = type `started` 중 이름에 `review`가 있는 상태(없으면 In Progress로 대신).
- Done = type `completed` · Todo = `unstarted` · Backlog = `backlog`.

| 이벤트 | 전이 | 트리거 |
|--------|------|--------|
| 등록(재현 증거 있음) | → Todo | `linear-file-issues` |
| 등록(재현 증거 없음) | → Backlog | `linear-file-issues` |
| 수정 착수 | backlog·unstarted·triage → In Progress | hotfix·dev·debug 시작 (`linear-close-issues --start`) |
| 수정 검증, 미커밋 | In Progress 유지, 장부 `awaiting: commit` | `linear-close-issues` |
| 커밋 있음, 열린 PR | → In Review + PR 링크, `awaiting: merge` | `linear-close-issues` · ship |
| 커밋 있음, PR 없음(기능 브랜치) | In Progress 유지, `awaiting: pr` | `linear-close-issues` |
| 수정 커밋이 기본 브랜치에 포함 | → Done | `linear-close-issues` · deploy · `--sweep` |
| 회귀 재발 | completed → Todo | `linear-file-issues` |

자동으로 하지 않는 것: canceled·duplicate 전이, completed에서 started로 되돌리기(재발만 예외), 담당자 변경.

## 7. 종료 증거 (`linear-close-issues`)

Done은 아래 세 가지가 모두 있을 때만 한다.

1. **수정 커밋**: `git merge-base --is-ancestor <sha> HEAD`가 참이고, 지적 위치 파일이 있으면 `git show --stat <sha>`에 그 파일이 있다. 사람 이슈(fp 없음)는 커밋 메시지에 식별자가 있거나 사용자가 sha를 줬을 때만 인정한다.
2. **검증 증거**(이번 실행에서 issue-ops가 직접 실행한 결과만): (a) 장부 `repro_cmd` 재실행 exit 0, (b) 수정에 추가된 회귀 테스트 명령 exit 0, (c) `verdict.sh check` exit 0(HEAD PASS) 중 하나. 리포트에 적힌 "통과" 문장은 증거가 아니다.
3. **머지 확인**: `git fetch -q origin <기본 브랜치>` 후 `git merge-base --is-ancestor <sha> origin/<기본 브랜치>`가 참.

3이 아니면 §6 표대로 In Progress/In Review에 두고 장부 `awaiting`을 남긴다. 2가 없으면 상태를 바꾸지 않고 "검증 증거 없음"으로 보고만 한다(Linear에 코멘트하지 않는다).

**재실행 허용 명령**(`repro_cmd`): 테스트·린트·타입체크·빌드(`bun|npm|pnpm|yarn` `test|run test*|run lint|run typecheck|run build`, `npx vitest|jest|playwright test`, `pytest`, `go test`, `cargo test`)와 읽기 전용 조회(`grep`, `rg`, `curl -s`의 GET). 그 밖의 명령은 실행하지 않고 증거 (b)·(c)를 요구한다.

**Done 코멘트**: 커밋 링크(`github.com/<o>/<r>/commit/<sha>` · `bitbucket.org/<o>/<r>/commits/<sha>`, 그 외는 sha), PR 링크, 실행한 검증 명령과 exit·출력 발췌 5줄.

**sweep** (`--sweep`): 장부에서 `awaiting`이 있는 항목만 다시 판정한다. `commit`이면 `verified` 이후 그 파일을 바꾼 커밋(`git log -1 --format=%H --since=<verified> -- <file>`)을 수정 커밋 후보로 쓰고, 검증 이후 그 파일이 다시 바뀌었으면 검증을 다시 실행한다.

**식별자 파싱**: 요청 문장에서 `\b[A-Z][A-Z0-9]{1,9}-[0-9]{1,6}\b`와 `linear.app/<ws>/issue/<ID>` 링크를 뽑고, `get_issue`로 실제 이슈인지 확인한다(`UTF-8`·`SHA-256` 같은 오탐은 여기서 걸러진다).

## 8. 파이프라인 연동 지점

| 커맨드 | 시점 | 실행 |
|--------|------|------|
| `/bams:review` | Phase 5 리포트 저장 직후 | `linear-file-issues <리포트>` |
| `/bams:deep-review` | 종합·검증 직후 | `linear-file-issues <리포트>` |
| `/bams:qa` | Step 3 결과 정리 직후 | `linear-file-issues <QA 리포트>` |
| `/bams:hotfix` · `/bams:dev` · `/bams:debug` | 시작(요청에 식별자가 있을 때만) | `linear-close-issues --start <ids>` |
| 같은 커맨드 | 검증 통과 직후 | `linear-close-issues <ids> --pipeline <slug>` |
| `/bams:ship` | PR 생성 직후 | `linear-close-issues --sweep` |
| `/bams:deploy` | 배포 확인 직후 | `linear-close-issues --sweep` |
| `/bams:issues` | 사용자 직접 | setup · file · close · status |

건너뛰는 경우(Steps에 `— skip: <사유>`): `enabled: false`, 등록 대상 0건, 식별자·장부 대기 항목 없음, `.crew/config.md` 없음.

**spawn 표준 블록** (메인이 직접 spawn — issue-ops는 specialist를 spawn하지 않는다):

```
Task tool, subagent_type: "bams-plugin:issue-ops"
> load_profile: { level: L2, refs: [{doc: config}] }
> mode: file | start | close | sweep | setup | status
> input: {리포트 경로 | 식별자 목록}, pipeline: {slug}, commit: {git rev-parse HEAD}
> 계약: references/linear-protocol.md. 반환은 §11 형식.
```

`NEEDS_CONTEXT`(매핑 후보·대량 등록 확인)가 오면 메인이 AskUserQuestion 1회 후 선택값을 붙여 한 번 더 spawn한다.

## 9. 실패 처리

| 실패 | 처리 |
|------|------|
| Linear MCP 없음·인증 실패·rate limit·네트워크 | 하려던 작업을 `.crew/linear-pending.json`에 쌓고 `linear: pending N (<사유>)`로 보고. 파이프라인은 계속 |
| 항목 하나 실패 | 그 항목만 pending, 나머지는 진행 |
| 매핑 없음 + 질문 불가(비대화) | pending에 `file` 작업으로 쌓고 다음 `/bams:issues setup` 이후 처리 |

```json
{ "version": 1, "ops": [ { "op": "file|start|close", "args": "…", "pipeline": "…", "queued_at": "…", "error": "…" } ] }
```

issue-ops는 작업 시작 시 pending을 먼저 비운다(fingerprint로 중복이 걸러지므로 다시 실행해도 안전). 같은 쓰기를 한 실행에서 두 번 넘게 재시도하지 않는다.

## 10. 가역성·금지

- Linear 이슈 생성·상태 변경·코멘트는 외부 쓰기다. 사용자가 이 연동을 요청했으므로 §8 지점에서는 묻지 않고 실행한다(`commands/bams/_shared_common.md` §진행 vs 확인 예외 행). 단, §5 대량 등록(>10건)은 먼저 묻는다.
- 되돌리기: 잘못 만든 이슈는 사람이 Canceled 처리한다. issue-ops는 삭제하지 않는다.
- 금지: 이슈 삭제, 라벨·프로젝트·팀 생성, 담당자 변경, 사람이 쓴 본문 수정, 비밀값 게시, archive 팀 등록, 증거 없는 Done.

## 11. 반환 형식

```
status: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED
linear: created N · updated N · reopened N · started N · in_review N · closed N · skipped N · pending N
- BE-123 created [Major] 결제 금액 반올림 오류 (fp 3f9c21a0b7de)
- BE-98  awaiting merge — PR #41
ledger: .crew/linear-issues.json  pending: .crew/linear-pending.json (N)
needs: {NEEDS_CONTEXT일 때 질문과 선택지}
```
