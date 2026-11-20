---
name: linear-file-issues
version: 2.0.0
disable-model-invocation: true
description: |
  bams 커맨드 내부 엔진 — 직접 쓰지 말고 `/bams:issues file` 사용(review·deep-review·qa가 자동 호출).
  리뷰·QA 리포트의 확인된 지적을 ezar-linear 규칙에 맞춰 초안으로 만들고, 사용자가 확인한 항목만 이 레포의 Linear 프로젝트에 이슈로 올린다. 같은 이슈는 Agent notes의 출처 ID로 찾는다.
allowed-tools:
  - Bash
  - Read
  - Grep
  - Skill
  - mcp__plugin_linear_linear__list_issues
  - mcp__plugin_linear_linear__get_issue
  - mcp__plugin_linear_linear__list_comments
  - mcp__plugin_linear_linear__list_projects
  - mcp__plugin_linear_linear__list_issue_statuses
  - mcp__plugin_linear_linear__list_issue_labels
  - mcp__plugin_linear_linear__list_templates
  - mcp__plugin_linear_linear__get_template
  - mcp__plugin_linear_linear__save_issue
  - mcp__plugin_linear_linear__save_comment
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bash scripts/gen-skill-docs.sh -->

# linear-file-issues — 지적 → Linear 이슈

규약 SSOT: `references/linear-protocol.md` §4·§5·§7. 전사 규칙: `ezar-linear:issues`(먼저 로드되어 있어야 한다). 실행 주체: `issue-ops`.

## 1. 입력

```
input: <리포트 경로 …>      # 생략 시 .crew/artifacts/review/ 최신 review-*.md 1개
pipeline: <slug>  commit: <sha>
flags: [--all] [--confirmed <번호 목록|all>] [--dry-run]
```

## 2. 사전 확인 (하나라도 걸리면 쓰기 없이 반환)

1. `ezar-linear:issues` 스킬이 로드되지 않았으면 Skill tool로 로드한다. 없으면 `status: BLOCKED`(ezar-linear 미설치).
2. `_lin enabled`가 `false` → `status: DONE`, `linear: disabled`.
3. 팀이 정해지지 않음(protocol §3의 1·2 모두 없음) → `linear-setup` 후보를 붙여 `status: NEEDS_CONTEXT`.
4. Linear MCP 도구가 없음 → `status: DONE_WITH_CONCERNS`, `linear: failed N (MCP 없음)`, 다시 실행할 명령 안내.

## 공통 셸 도우미 (`references/linear-protocol.md` §3·§4)

Bash 호출 사이에는 함수가 남지 않는다. 매핑·지문을 다루는 Bash 호출마다 이 블록을 맨 앞에 붙인다.

```bash
_lin() { sed -n '/^## Linear/,/^## /p' .crew/config.md 2>/dev/null | sed -n "s/^- $1: *//p" | head -1; }
_repo() { _r=$(git remote get-url origin 2>/dev/null); basename "${_r:-$(git rev-parse --show-toplevel 2>/dev/null)}" .git | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-//; s/-$//'; }
bams_fp() { # $1=위치(파일 경로 또는 url:/경로) $2=카테고리 $3=제목 → 12자리
  _t=$(printf '%s' "$3" | tr '[:upper:]' '[:lower:]' | sed -E 's/[`"'"'"']//g; s/[0-9]+//g; s/[[:space:]]+/ /g; s/^ //; s/ $//')
  _l=$(printf '%s' "$1" | sed -E 's/:[0-9]+(-[0-9]+)?$//')
  printf 'v1|%s|%s|%s' "$_l" "$(printf '%s' "$2" | tr '[:upper:]' '[:lower:]')" "$_t" | shasum -a 256 | cut -c1-12
}
bams_src() { printf 'bams:%s/%s' "$(_repo)" "$(bams_fp "$1" "$2" "$3")"; }   # 출처 ID 값
```

- 출처 ID 검색은 값을 큰따옴표로 감싼 문자열을 `query`에 넣는다: `"bams:<repo>/<fp>"`. `team` 없이 찾는다.
- 로컬 쓰기는 Bash(heredoc·awk·임시 파일·`mv`)로만 한다. issue-ops는 Write/Edit 도구가 없다. 쓰는 곳은 `.crew/config.md` `## Linear`와 `.crew/artifacts/linear/draft-*.md`뿐이다.

## 3. 지적 추출

리포트를 Read해 등록 대상만 고른다(protocol §5 대상 표).

| 리포트 | 대상 위치 |
|--------|-----------|
| review·deep-review | "Critical/Major 이슈"의 검증 `CONFIRMED` 항목, "미검증 지적"의 `unverified-risk` 항목, (`--all`) "Minor 이슈" |
| debug | 근본 원인 1건(심각도는 리포트 값) |
| QA `.crew/artifacts/qa/*/report.md` | 확인된 critical·high(P0·P1)(+`--all`이면 medium·low). 감사 모드의 스크립트 후보·`unverified`·`unverified-risk`는 제외. 심각도는 `issue-severity.md` §QA 판정 매핑 |

지적마다 다음 필드를 채운다. 비어 있으면 리포트 원문에서 찾고, 그래도 없으면 `(none)`.

`severity · category · location(path:line 또는 url:/경로) · title · problem · expected · evidence · evidence_grade · repro_cmd · suggested_fix`

`[수정됨]` 태그가 붙은 지적은 등록하지 않는다.

## 4. 중복 판정 (쓰기 없음)

지적마다 `bams_src`로 출처 ID를 만들고 protocol §5 "중복 판정" 순서대로 찾는다.

1. `list_issues(query: "\"<출처 ID>\"", limit: 10, fields: ["id","title","status","team","project","createdAt"])` — `team` 없이. 걸리면 `get_issue`로 본문에 `출처 ID: <값>` 줄이 정확히 있는지 확인한다.
2. 1에서 못 찾았으면: 팀마다 한 번 `list_issues(team, createdAt: "-P1D", orderBy: "createdAt", limit: 50, fields: …)`, 지적마다 낱말 검색 많아야 2번(`limit: 20`), 후보 `get_issue` 많아야 3건.
3. 판정(만들기 · 댓글 · 건너뜀)과 근거 한 줄을 정한다. 같은 일이 Canceled면 "건너뜀(취소됨: 사유)"으로 두고 사용자가 고르게 한다.

## 5. 초안

1. `list_issue_labels(team)`로 종류 라벨(`Bug`·`Feature`·`Improvement`·`Maintenance`·`Research`·`Ops`)이 있는지 본다. 고른 종류 라벨이 없으면 그 항목은 초안에 "라벨 없음 — 사용자 확인 필요"로 표시한다. 라벨을 만들지 않는다.
2. `list_templates(team, type: "issue")`에서 그 종류 라벨이 든 템플릿을 찾고, 있으면 `get_template`으로 칸을 읽는다.
3. 지적마다 제목·본문을 protocol §5 "만드는 값"과 본문 뼈대로 쓴다. 근거 발췌에서 비밀값을 먼저 지운다. 제목은 60자를 넘지 않고 `[`·`—`가 없는지 확인한다.
4. 초안 파일을 쓴다(Bash heredoc).

```bash
mkdir -p .crew/artifacts/linear && cat > ".crew/artifacts/linear/draft-${PIPELINE}.md" <<'EOF'
# Linear 등록 초안 — {pipeline}
대상: {TEAM} / {PROJECT}

| # | 판정 | 종류 | 심각도 | 제목 | 중복 근거 |
|---|------|------|--------|------|-----------|
| 1 | 만들기 | Bug | Major | 결제 금액 반올림 오류 | 비슷한 이슈: 없음 |

## 1. 결제 금액 반올림 오류
{본문 전체}
EOF
```

5. `--confirmed`가 없거나 `--dry-run`이면 여기서 `status: NEEDS_CONTEXT`(또는 dry-run이면 `DONE`)로 표와 초안 경로를 반환한다.

## 6. 쓰기 (`--confirmed`에 든 번호만)

초안 파일을 다시 Read해 그 내용 그대로 쓴다. 초안과 다르게 바꾸지 않는다.

1. `list_issue_statuses(team)`에서 type `backlog` 상태를 고른다.
2. **만들기**: `save_issue(team, project, title, description, labels: [<종류>], state: <Backlog>, template?, relatedTo?, links?)`. priority·assignee는 넣지 않는다.
3. **댓글**: `save_comment(issueId, "다시 확인됨: {pipeline} @ {sha 앞 8자리}. {근거 1줄}")`. 같은 파이프라인 이름의 댓글이 이미 있으면(`list_comments`) 달지 않는다.
4. 훅에 막히면 사유대로 고쳐 한 번 다시 호출한다. 다시 막히거나 도구 오류면 그 항목을 `failed`로 두고 다음 항목으로 간다.
5. 만든 뒤 `get_issue`로 출처 ID 줄이 본문에 남았는지 확인한다.

## 7. 반환

`references/linear-protocol.md` §8 형식. 항목마다 `<identifier> <결과> [<심각도>/<종류>] <제목> (<출처 ID>)` 한 줄. 호출한 커맨드는 이 목록을 결과 제시에 그대로 붙인다. 실패 항목이 있으면 `/bams:issues file <리포트>`로 다시 실행하면 빠진 것만 올라간다고 안내한다.
