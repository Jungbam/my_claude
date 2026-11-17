# Verdict 프로토콜 — SHA 결합 검증 판정 [L2]

> 온디맨드 문서. 릴리스 게이트 판정을 남기거나(review·release-quality-gate), 머지·배포 전에 확인할 때(ship·deploy) Read한다.
> 구현: `hooks/lib/verdict.sh`(쓰기·조회) + `hooks/verdict-gate.sh`(PreToolUse Bash 게이트). 테스트: `tests/hooks/run-hook-tests.sh` "verdict-gate" 섹션.

## 1. 왜

"검증했다"는 보고는 어떤 커밋을 누가 검증했는지가 빠지면 증거가 아니다. verdict는 **판정 대상 커밋(sha·patch-id)**, **판정자(구현자가 아닌 에이전트 + 모델)**, **증거(명령 + exit code)** 를 한 파일에 묶는다. 머지·배포 명령은 이 파일이 지금 HEAD와 맞을 때만 조용히 통과한다.

## 2. 파일

경로: `<repo>/.crew/artifacts/review/verdict-<shortsha>.json` (shortsha = `git rev-parse --short=12 HEAD`) — 깨끗한 HEAD의 **첫 PASS**만 이 이름을 쓴다. FAIL·미커밋(dirty) 판정·같은 커밋 재판정은 `verdict-<shortsha>-<UTC yyyymmddThhmmssZ>[-n].json`으로 **새 파일**을 만든다(덮어쓰지 않음 — 커밋 기준 PASS와 판정 이력이 사라지지 않는다).

**`.crew/` 제외**: patch-id diff와 dirty 판정은 `':(exclude).crew'` pathspec으로 `.crew/`를 뺀다. 파이프라인이 board·history·verdict를 커밋하거나 수정 중이어도 판정 대상 내용이 같으면 verdict가 유지된다.

| 필드 | 뜻 |
|------|----|
| `sha`, `short_sha`, `tree` | 판정 시점 HEAD 커밋·트리 |
| `base`, `patch_id` | `git diff $(git merge-base <base> HEAD) HEAD \| git patch-id --stable` — rebase·amend·squash로 sha가 바뀌어도 내용이 같으면 유효 |
| `dirty`, `untracked` | 미커밋 변경 기준 판정이면 `dirty: true`, patch-id는 작업 트리(추적 파일) 기준. 이때는 sha가 아니라 patch-id로만 매칭된다(새 파일은 포함 안 됨 → 커밋 후 재판정) |
| `verdict` | `PASS` \| `FAIL` |
| `judge` | `{agent, model, family}` — 판정한 에이전트와 모델. family = claude/openai/google/unknown |
| `author_agents`, `author_models` | 이번 변경을 구현한 에이전트·모델 |
| `same_family` | 판정 모델이 구현 모델과 같은 계열이면 `true`(독립성 약함 표시, 차단 아님), 모델 미상이면 `"unknown"` |
| `evidence` | `[{cmd, exit_code}]` — 판정자가 이번 커밋 기준으로 직접 확인한 검증 명령 |
| `pipeline`, `created_at` | 파이프라인 slug, UTC 시각 |
| `written_by`, `attestation` | 기록한 도구·버전(`bams-plugin/hooks/lib/verdict.sh@<plugin version>`), `"self-reported"`(§5 한계) |
| `v` | 스키마 버전(2 = written_by 추가·author 정규화 저장) |

`verdict.sh write`가 거부하는 경우(exit 2): 판정자 ∈ `author_agents`(소문자·공백 제거·`_`→`-`·`bams-plugin:` 접두사 정규화 후 비교 — `Frontend-Engineering`·`frontend_engineering`도 같은 사람) · PASS인데 evidence 없음 · PASS인데 exit≠0 evidence 포함 · evidence가 `<exit>:<실행 명령>` 형식이 아님(명령 토큰이 없는 문장 — `0:i promise`, `0:tests passed`, `0:<cmd>` 거부. 허용: `./`·`/` 경로 실행 또는 알려진 도구 이름으로 시작, 앞에 `VAR=val`·`cd dir &&`·`env`/`sudo` 허용) · git 저장소 아님.

## 3. 쓰기 (판정자)

```bash
_BAMS=$( { jq -r '[.plugins["bams-plugin@my-claude"] // empty] | flatten | sort_by(.scope != "user") | .[].installPath // empty' ~/.claude/plugins/installed_plugins.json; sh -c 'ls -dt "$HOME"/.claude/plugins/cache/*/bams-plugin/*/'; } 2>/dev/null | while IFS= read -r _p; do [ -d "$_p" ] && [ ! -e "$_p/.orphaned_at" ] && echo "${_p%/}" && break; done || true); _VD="$_BAMS/hooks/lib/verdict.sh"; [ -e "$_VD" ] || _VD=""; [ -z "$_VD" ] && _VD=$(find . -path "*/bams-plugin/hooks/lib/verdict.sh" 2>/dev/null | head -1)
bash "$_VD" write --verdict PASS --judge-agent release-quality-gate --judge-model <판정 모델> \
  --author-agents frontend-engineering,backend-engineering --author-models claude-opus-5-5 \
  --evidence "0:bun test" --evidence "0:bunx tsc --noEmit" --pipeline <slug> [--base origin/main]
```

- **판정자 분리**: 판정자는 이번 변경을 구현한 에이전트가 아니어야 한다(기본 release-quality-gate, 없으면 qa-strategy). 메인 대화가 직접 구현한 변경이면 `--author-agents main`.
- **다른 모델 우선**: ① Codex 연결 시(`ToolSearch("+codex")`로 `mcp__codex__*` 로드 성공, 또는 `codex` 스킬의 `codex review`) — diff + evidence를 Codex에 독립 판정시키고, 둘 다 PASS일 때만 PASS로 쓰며 `--judge-model codex:<모델>`을 기록한다. ② Codex 불가 시 — 게이트 spawn에 구현자와 다른 `model`을 지정한다(구현자 opus → 판정 `model: "sonnet"`, 구현자 sonnet → `"opus"`). ③ 둘 다 불가 — 같은 모델로 판정하되 `--judge-model`을 정확히 기록하면 `same_family: true`가 남는다. 보고서에 "same-family 판정"을 명시한다.
- **evidence는 `<exit>:<명령>`**: 명령은 실제로 실행한 명령줄을 그대로 적는다(설명 문장 금지 — 형식 검사로 거부된다).
- **evidence는 직접 실행한 것만**: 구현자 보고의 "통과"를 옮겨 적지 않는다(`agents/release-quality-gate.md` §증거 기반 판정). FAIL 판정도 파일로 남긴다(게이트가 FAIL을 알아야 한다).
- `--base` 기본값: `origin/HEAD` → `origin/main` → `origin/master` → `main` → `master`. 원격 추적 브랜치를 쓰면 로컬 main이 오래돼도 patch-id가 안정적이다.

## 4. 확인 (ship·deploy·hook)

```bash
bash "$_VD" check     # stdout: "<pass|fail|invalid|none> <파일> <sha|patch_id> <same_family>"
```

| exit | 뜻 | ship/deploy 처리 |
|------|----|------------------|
| 0 | HEAD와 sha 또는 patch-id가 맞는 PASS | 진행 |
| 1 | 맞는 verdict 없음(HEAD 이후 변경 포함) | release-quality-gate(ship·deploy Step 1, hotfix Step 4) 또는 `/bams:review`가 이번 HEAD 기준으로 판정·기록 후 재확인. 그래도 없으면 ship = CONDITIONAL GO(사용자 확인), deploy·hotfix 배포 = 중단 |
| 3 | 맞는 verdict가 FAIL | 중단 |
| 4 | 무효 — status `invalid`(판정자 = 구현자) 또는 `invalid_evidence`(PASS인데 evidence 비었거나 exit≠0·명령 형식 아님 — 손으로 쓴 파일 포함) | 다른 에이전트로 재판정 / 판정자가 검증 명령을 직접 실행해 재기록 |

커맨드 문서의 확인 블록은 리졸버와 `check`를 **한 번의 Bash 호출**에 둔다(호출 사이에 `_VD`가 남지 않는다). verdict.sh 자체를 못 찾으면 `verdict_exit=unavailable`을 출력해 exit 1(verdict 없음)과 구분한다.

최신 20개 파일만 본다(mtime 순). sha 일치가 우선이고, 없으면 파일의 `base`마다 현재 patch-id를 1회 계산해 비교한다. 같은 대상에 맞는 파일이 여럿이면 **가장 최근 것이 이긴다** — 새 FAIL은 이전 PASS를 덮고, 이후의 새 PASS는 다시 그 FAIL을 덮는다. `check`는 `write`와 같은 규칙(판정자 정규화·evidence 재검증)을 파일에 다시 적용하므로 손으로 쓴 JSON도 같은 기준을 통과해야 한다.

## 5. 게이트 hook (`hooks/verdict-gate.sh`, PreToolUse `Bash`)

- 수준: `BAMS_VERDICT_GATE=off|warn|strict` (기본 **warn** = additionalContext 안내, strict = deny). 우회가 필요하면 세션 환경변수로 `off`.
- 대상(명령 위치에 올 때만, 인자 속 문자열 무시): `gh pr merge` · `gh api -X PUT|POST …/pulls/<N>/merge` · `gh api graphql … mergePullRequest` · base 브랜치(main·master·origin/HEAD)로 가는 `git push`(`HEAD:main`, `@:main`, `+main`, `+feat:refs/heads/main`, refspec 없으면 `@{push}`(push.default·upstream)가 가리키는 브랜치, 없으면 현재 브랜치, `--all/--mirror`) · `vercel … --prod` · `netlify deploy … --prod` · `fly|flyctl deploy`. `--dry-run`·`--delete`·`--help` 제외.
- 정규화(우회 방지, `tests/hooks/run-hook-tests.sh` "verdict-gate 정규화"): 셸 규칙대로 토큰화(따옴표·역슬래시 제거, 따옴표 **안**의 `;`·`&&`는 분리하지 않음 → `git commit -m "wip; git push origin main"`은 대상 아님), `VAR=val`·`env`·`command`·`sudo`·`nice`·`timeout`·`nohup`·`exec` 접두, `/usr/bin/git` 같은 절대경로, git 전역 옵션(`--no-pager`, `-C dir`, `-c k=v`, `--git-dir`, `--work-tree`), `bash|sh|zsh -c "<명령>"`·`eval "<명령>"`(재귀 3단), `gh -R/--repo o/r`.
- 대상 커밋: push는 refspec의 src, 배포는 HEAD. `gh pr merge`는 인자 없이 feature 브랜치에서 실행하면 HEAD, 그 외(PR 번호·브랜치·URL 인자, `-R`, 현재 브랜치가 base, `gh api`)는 `gh pr view [<N>] [-R o/r] --json headRefOid`(네트워크, `BAMS_VERDICT_GH_TIMEOUT`초 제한 기본 5 — coreutils `timeout`/`gtimeout`, 없으면 perl alarm). **PR head를 확인하지 못하면**(gh 실패·시간 초과·`BAMS_VERDICT_GH=off`·gh 없음·graphql) 현재 브랜치 HEAD로 대신 대조하지 않고 "대상 미확인"으로 처리한다 — warn = 안내, strict = deny.
- 적용 범위: 대상 저장소 최상위에 `.crew/`가 있을 때만. jq·git 부재, 입력 파싱 실패는 fail-open.
- 한계: `bash deploy.sh`·`make release`처럼 스크립트 안에 숨은 push·배포, git alias(`git p`), `xargs`·heredoc 본문으로 넘긴 명령, `$(...)` 안의 명령 치환 결과, MCP 배포 도구(ezar-infra `dev_build_trigger` 등)는 보지 않는다 — 이 경우 deploy.md Pre-flight·hotfix Step 5·feature Step 11의 `verdict.sh check`가 유일한 확인이다. 반대로 heredoc 본문 줄이 명령처럼 생기면 오탐이 날 수 있다(warn이면 안내로 끝남).

### 남는 한계 — 본인 신고(self-attested)

- verdict의 판정자·구현자·모델·evidence는 **모두 기록하는 쪽이 CLI 인자로 신고한 값**이다. `verdict.sh`는 형식(판정자≠구현자 정규화 비교, evidence `<exit>:<명령>` 형식, PASS의 exit 0)과 커밋 결합(sha·patch-id)만 기계적으로 검사하고, **그 명령이 실제로 실행됐는지·그 판정자가 실제로 판정했는지는 증명하지 못한다**. 같은 세션의 같은 모델이 이름만 바꿔 PASS를 쓰는 것을 막지 못한다. 파일에 `attestation: "self-reported"`로 남긴다.
- 실제 분리는 **다른 모델(Codex 등)이 독립적으로 diff와 evidence를 재실행·판정**할 때만 생긴다(§3 "다른 모델 우선"). `same_family: true`·`unknown`이면 독립성이 약하다는 표시로 읽는다.
- 따라서 strict 게이트는 **보안 경계가 아니라 tripwire**다 — 판정 단계를 빠뜨렸거나, 판정 후 내용이 바뀌었거나, 구현자가 그대로 자기 PASS를 쓴 실수를 잡는 장치이고, 의도적으로 우회하려는 행위자(명령을 스크립트로 감싸기, `BAMS_VERDICT_GATE=off`, 파일 직접 작성)를 막지 못한다. 실제 차단이 필요하면 원격 저장소의 브랜치 보호·필수 리뷰·CI 상태 검사를 쓴다.
