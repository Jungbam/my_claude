# Linear 이슈 연동 프로토콜 (SSOT)

리뷰·QA에서 확인된 지적을 레포의 Linear 프로젝트에 이슈로 올리는 규약이다. 소유: 이슈관리 부서장 `issue-ops`. 실행 엔진: `linear-setup` · `linear-file-issues` 스킬. 사용자 진입점: `/bams:issues`.

**전사 규칙은 `ezar-linear` 플러그인이 정한다.** 이슈 작성 형식·종류·상태·중복 찾기·Done 근거는 `ezar-linear:issues` 스킬이 SSOT이고, 라벨 만들기·삭제·제목 형식·비밀값 같은 반드시 지킬 규칙은 ezar-linear 훅(G1~G7)이 막는다. 이 문서는 bams가 그 위에 더하는 것만 적는다. 둘이 다르면 ezar-linear를 따른다.

## 목차

1. 범위 · 2. 전제와 도구 · 3. 레포 매핑 · 4. 출처 ID · 5. 등록 규칙 · 6. 파이프라인 연동 지점 · 7. 실패 처리 · 8. 반환 형식

## 1. 범위

bams가 하는 일은 **리뷰·QA 지적을 이슈로 올리는 것 하나**다.

- 한다: 레포 ↔ Linear 팀·프로젝트 매핑(`linear-setup`), 확인된 지적의 이슈 초안 작성과 등록(`linear-file-issues`).
- 하지 않는다: 상태 옮기기(In Progress·In Review·Done), 닫기, 재오픈. 이것은 사람이나 에이전트가 작업할 때 `ezar-linear:issues` 규칙대로 한다. bams 수정 파이프라인은 요청에 Linear 식별자가 있으면 커밋·PR 본문에 `Fixes <ID>`를 남기는 것까지만 한다(§6).
- 로컬 장부는 두지 않는다. 같은 이슈는 Linear에서 출처 ID로 찾는다(§4).

## 2. 전제와 도구

- **필수 플러그인**: `ezar-linear@ezar-plugins`(규칙·훅)와 그것이 함께 설치하는 공식 `linear` 플러그인. 도구 이름은 `mcp__plugin_linear_linear__*`다.
- issue-ops는 작업을 시작할 때 Skill tool로 `ezar-linear:issues`를 로드한다. 스킬이 없으면 쓰기 없이 `status: BLOCKED`, 사유 "ezar-linear 미설치 — `/plugin install ezar-linear@ezar-plugins`"로 반환한다.
- Linear 도구가 하나도 없거나 인증이 안 됐으면 §7.
- 쓰는 도구: `list_teams` · `list_projects` · `list_issues` · `get_issue` · `list_comments` · `list_issue_statuses` · `list_issue_labels` · `list_templates` · `get_template` · `save_issue` · `save_comment`. 그 밖의 쓰기 도구는 쓰지 않는다.

## 3. 레포 매핑 (`.crew/config.md` `## Linear`)

팀·프로젝트는 아래 순서로 정한다(ezar-linear `issues` §2-1·§2-3과 같은 순서에 bams 매핑을 더한 것).

1. 저장소 CLAUDE.md·AGENTS.md의 Linear 절
2. `.crew/config.md`의 `## Linear` 섹션
3. 둘 다 없으면 `linear-setup`이 후보를 찾아 사용자에게 한 번 묻고 2에 기록한다.

```markdown
## Linear
- enabled: true
- team: BE
- project: push-server-refactor
- project_id: <uuid 또는 (none)>
- repo: push-server
- updated: 2026-11-20
```

- `team`(팀 key) 필수. `project`가 `(none)`이면 팀에만 등록한다.
- `enabled: false`면 모든 Linear 단계를 `— skip: Linear 연동 꺼짐`으로 넘긴다(사용자 opt-out). 다시 묻지 않는다.
- 이름에 `archive`가 들어간 팀(예: Jira Archive)과 끝났거나 취소·보관된 프로젝트는 대상이 될 수 없다.
- 프로젝트·이니셔티브·라벨은 만들지 않는다. 맞는 프로젝트가 없으면 "팀만 지정"을 권한다.
- 읽기(BSD sed 호환): `_lin() { sed -n '/^## Linear/,/^## /p' .crew/config.md 2>/dev/null | sed -n "s/^- $1: *//p" | head -1; }` → `_lin team`, `_lin enabled`.

**후보 찾기** (`linear-setup`):
1. 레포 이름 = `git remote get-url origin`의 마지막 경로에서 `.git` 제거(없으면 git 최상위 폴더명). 정규화: 소문자, 영숫자 외 문자는 `-`.
2. 후보 점수: 프로젝트 이름 정규화값이 레포와 같음 100 · 한쪽이 다른 쪽을 포함 70 · `-` 토큰 겹침 비율 ≥ 0.5 이면 50. 팀 key·이름이 레포 토큰과 겹치면 팀 후보 40. 프로젝트가 여러 팀에 걸치면 팀별로 후보를 나눈다.
3. 상위 3개 + "팀만 지정(프로젝트 없음)" + "Linear 연동 끄기"를 `NEEDS_CONTEXT`로 반환한다. 메인이 AskUserQuestion으로 묻고 선택값으로 다시 spawn한다.

## 4. 출처 ID

bams가 만드는 이슈는 본문 Agent notes에 출처 ID를 반드시 적는다(ezar-linear `writing.md` §Agent notes 꼴).

```
출처 ID: bams:<repo>/<fp>
```

- `<repo>`: §3의 정규화된 레포 이름. 레포가 달라도 같은 지문이 나올 수 있어 넣는다.
- `<fp>`: 지적 하나를 나타내는 12자리 지문. 줄 번호·공백·대소문자·따옴표·숫자 차이로 바뀌지 않는다.

```bash
bams_fp() { # $1=위치(파일 경로 또는 url:/경로) $2=카테고리 $3=제목
  _t=$(printf '%s' "$3" | tr '[:upper:]' '[:lower:]' | sed -E 's/[`"'"'"']//g; s/[0-9]+//g; s/[[:space:]]+/ /g; s/^ //; s/ $//')
  _l=$(printf '%s' "$1" | sed -E 's/:[0-9]+(-[0-9]+)?$//')
  printf 'v1|%s|%s|%s' "$_l" "$(printf '%s' "$2" | tr '[:upper:]' '[:lower:]')" "$_t" | shasum -a 256 | cut -c1-12
}
```

- 위치: 레포 기준 상대 경로(줄 번호 제외). 파일이 없는 브라우저 QA 지적은 `url:<경로>`(도메인 제외).
- 카테고리: 리뷰 5관점(정확성·보안·성능·품질·테스트) 또는 QA 리포트 category.
- **같은 이슈 찾기**: 출처 ID를 큰따옴표까지 포함해 `query`에 넣고 `team` 없이 워크스페이스 전체에서 찾는다. 따옴표가 없으면 `/`·`-`에서 낱말이 갈려 엉뚱한 이슈가 걸린다.
  `list_issues(query: "\"bams:push-server/3f9c21a0b7de\"", limit: 10, fields: ["id","title","status","team","project","createdAt"])`
  걸린 이슈는 `get_issue`로 본문에 그 출처 ID 줄이 정확히 있는지 확인한다.

## 5. 등록 규칙 (`linear-file-issues`)

### 대상

| 지적 | 등록 |
|------|------|
| Critical·Major, 검증 `CONFIRMED` | 이슈 |
| `unverified-risk` | Research 이슈(확인할 질문으로 쓴다) |
| Minor | `--all`일 때만 |
| `unverified` · REFUTED · 제외된 지적 · `[수정됨]` | 등록 안 함 |

입력은 리포트 경로다: 리뷰 `.crew/artifacts/review/review-*.md`, 심층 리뷰 리포트, 디버그 `.crew/artifacts/review/debug-*.md`, 브라우저 QA `.crew/artifacts/qa/*/report.md`. QA 심각도는 `issue-severity.md` §QA 판정 매핑(critical/P0→Critical, high/P1→Major, medium·low/P2→Minor)으로 읽는다. 확인 전 스크립트 후보와 `unverified`는 등록하지 않는다.

### 중복 판정

지적마다 ezar-linear `issues` §2-2 절차를 따른다. bams 쪽 순서:

1. 출처 ID로 찾는다(§4). 걸리면 2·3은 건너뛴다.
2. 같은 팀의 최근 하루 이슈 제목을 훑는다(한 실행에서 팀마다 한 번).
3. 지적의 대상 이름(파일·함수·화면)과 증상으로 낱말 검색(`limit: 20`, 많아야 2번). 후보는 많아야 3건 `get_issue`로 읽는다.

판정과 할 일은 ezar-linear 표를 그대로 쓴다.

| 판정 | 할 일 |
|------|-------|
| 같은 일, 열려 있음 | 만들지 않는다. 이 파이프라인에서 처음 다시 찾았으면 근거를 댓글로 단다("다시 확인됨: {pipeline} @ {sha 8자리}, 근거 1줄") |
| 들어 있음 | 근거만 댓글로 단다 |
| 원인이 같을 수 있음 | 만들고 `relatedTo`로 잇고, 본문에 한 줄 쓴다 |
| 같은 일, Done | 새로 만들고 `relatedTo`로 잇고, 본문에 "다시 생김"이라고 쓴다. 닫힌 이슈를 다시 열지 않는다 |
| 같은 일, Canceled | 만들지 않는다. 초안에 취소 사유를 보이고 사용자가 고르게 한다 |
| 다른 일 | 만든다 |

### 초안 먼저

새 이슈와 남의 이슈 댓글은 **사용자가 초안에 답한 뒤에** 쓴다(ezar-linear `issues` §1).

1. issue-ops는 쓰기 없이 초안 표를 만들어 `status: NEEDS_CONTEXT`로 반환한다. 표 칸: 번호 · 판정(만들기/댓글/건너뜀) · 종류 · 제목 · 심각도 · 대상 팀/프로젝트 · 중복 근거 한 줄. 본문 초안은 `.crew/artifacts/linear/draft-{pipeline}.md`에 쓰고 경로를 함께 준다.
2. 메인은 표를 보여 주고 AskUserQuestion으로 묻는다: 전부 등록 / 고른 번호만 / 이번엔 등록 안 함.
3. 답을 `--confirmed <번호 목록|all>`로 붙여 다시 spawn한다. issue-ops는 확인된 항목만, 초안과 같은 내용으로 쓴다.
- 사용자가 같은 요청 안에서 "확인 없이 등록"이라고 분명히 말했으면 메인이 처음부터 `--confirmed all`을 붙인다. 다음 요청까지 이어지지 않는다.
- 비대화 실행(eval·headless)처럼 물을 수 없으면 쓰지 않는다. 초안 경로를 보고하고 `/bams:issues file <리포트>`로 나중에 올리라고 안내한다.

### 만드는 값

| 필드 | 값 |
|------|----|
| team · project | §3 |
| labels | 종류 라벨 하나(이름). 정확성·보안·QA 기능 결함 → `Bug`, 성능 → `Improvement`, 품질·테스트 → `Maintenance`, `unverified-risk` → `Research`. 애매하면 ezar-linear `types.md` 고르는 순서를 따른다 |
| title | 30자 안팎, 60자 이하. 무엇이 문제인지만. `[…]` 머리말·줄표(—)·파일명·원인·해결 방법은 본문으로 |
| description | 팀 템플릿(`list_templates(team, type: "issue")`에서 그 종류 라벨이 든 것)이 있으면 `template`과 함께 칸을 채운다. 없으면 아래 뼈대 |
| state | Backlog(기본값). 상태 이름은 `list_issue_statuses(team)`의 type `backlog`로 고른다 |
| priority · assignee · estimate · cycle | 넣지 않는다. 심각도는 본문에 쓴다 |
| links | 리포트를 PR·커밋 링크로 붙일 수 있으면 `links` |

비대화 판단이 필요한 값(프로젝트 여럿, 종류 애매)은 초안 표에 권하는 값과 이유를 적어 사용자가 고르게 한다.

**본문 뼈대** (Bug 예. 다른 종류는 ezar-linear `writing.md`의 종류별 칸을 쓴다):

```markdown
{무엇이 잘못되는지 1~3문장. 심각도: Major}

## 증상
{리포트의 문제 설명}

## 재현 방법
{재현 명령이나 단계. 없으면 "미정"}

## 기대 동작
{정해진 동작}

## 완료 기준
- [ ] 고친 변경이 기본 브랜치에 반영됨
- [ ] 위 재현 방법으로 더는 생기지 않음

+++ Agent notes

- 출처 ID: bams:{repo}/{fp}
- 파이프라인: {slug} · 커밋: {sha 8자리}
- 위치: `{path:line}` · 카테고리: {카테고리} · 검증: {CONFIRMED|unverified-risk} ({measured|inferred})
- 재현: `{명령 또는 (none)}`
- 근거: {명령 출력 발췌 20줄 이내}
- 리포트: {리포트 경로}
- 수정안: {1~3줄. 추정이면 "추정"}

+++
```

- 확인하지 않은 것은 "추정"이라고 쓴다.
- 비밀값은 값을 쓰지 않고 위치만 쓴다. 근거 발췌의 토큰·키·비밀번호·쿠키·`.env` 값·이메일·전화번호는 올리기 전에 지운다. 훅(G7)이 걸러도 먼저 지운다.
- 훅에 막히면 사유를 읽고 고쳐 한 번 다시 호출한다. 두 번째도 막히면 그 항목은 실패로 보고한다.

## 6. 파이프라인 연동 지점

| 커맨드 | 시점 | 실행 |
|--------|------|------|
| `/bams:review` | Phase 5 리포트 저장 직후 | `linear-file-issues <리포트>` → 초안 확인 → 등록 |
| `/bams:deep-review` | 종합·검증 직후 | 같음 |
| `/bams:qa` | Step 3 결과 정리 직후 | 같음 |
| `/bams:hotfix` · `/bams:dev` · `/bams:debug` · `/bams:ship` | 요청에 Linear 식별자가 있을 때 | issue-ops를 부르지 않는다. 커밋 메시지·PR 본문에 `Fixes <ID>`를 남긴다. 상태 변경은 `ezar-linear:issues` 규칙(실제 작업 시작 → In Progress, 기본 브랜치 merge 근거를 본 뒤 Done) |
| `/bams:issues` | 사용자 직접 | setup · file · status |

건너뛰는 경우(Steps에 `— skip: <사유>`): `enabled: false`, 등록 대상 0건, `.crew/config.md` 없음, 비대화 실행.

**spawn 표준 블록** (메인이 직접 spawn — issue-ops는 specialist를 spawn하지 않는다):

```
Task tool, subagent_type: "bams-plugin:issue-ops"
> load_profile: { level: L2, refs: [{doc: config}] }
> mode: file | setup | status
> input: {리포트 경로}, pipeline: {slug}, commit: {git rev-parse HEAD}, flags: [--all] [--confirmed <번호|all>]
> 계약: references/linear-protocol.md. 반환은 §8 형식.
```

`NEEDS_CONTEXT`(매핑 후보·초안 확인)가 오면 메인이 AskUserQuestion 1회 후 선택값을 붙여 한 번 더 spawn한다.

## 7. 실패 처리

| 실패 | 처리 |
|------|------|
| ezar-linear 미설치 | `BLOCKED`. 설치 안내 |
| Linear MCP 없음·인증 실패·rate limit·네트워크 | 쓰지 못한 항목을 보고하고 `DONE_WITH_CONCERNS`. 파이프라인은 계속 |
| 항목 하나 실패 | 그 항목만 실패로 보고하고 나머지는 진행 |

로컬 대기열은 두지 않는다. 출처 ID로 중복이 걸러지므로 `/bams:issues file <리포트>`를 다시 실행하면 빠진 것만 올라간다. 같은 쓰기를 한 실행에서 두 번 넘게 시도하지 않는다.

Linear 단계의 실패는 파이프라인 상태·게이트 판정을 바꾸지 않는다.

## 8. 반환 형식

```
status: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED
linear: created N · commented N · skipped N · failed N
- BE-123 created [Major/Bug] 결제 금액 반올림 오류 (bams:push-server/3f9c21a0b7de)
- BE-98  commented — 다시 확인됨
draft: .crew/artifacts/linear/draft-{pipeline}.md
needs: {NEEDS_CONTEXT일 때 질문과 선택지 또는 초안 표}
```
